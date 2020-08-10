import got from "got"
import { YTWrapper } from "./youtubev3/ytwrapper"
import fs from "fs-extra"
import path from "path"
import { YTVideo } from "./youtubev3/structure/ytvideo"
import chalk from "chalk"
import { YTComment } from "./youtubev3/structure/ytcomment"
import execa from "execa"
import { Logger, LogLevel } from "./jjak/Logger"
import htmlToText from "html-to-text"
import { YTChannelInfo } from "./youtubev3/structure/ytchannelinfo"
import { SplitElement } from "./splitelement"
import rpBuffer from "buffer-replace"
import shellescape from "shell-escape"
import { ParseComposer, AlbumTitleType } from "./parsecomposer"
import { logEXEC } from "./constants"

type Expirable<T> = T & { timestamp:number }
const expireDuration = 1000 * 3600 * 24
const distPath = path.resolve(".", "dist")
const htmlTimeRegex = /<a href=.+?>(\d{1,2}:)?(\d{1,2}):(\d{1,2})<\/a>/ig
const timeRegex = /(\d{1,2}:)?(\d{1,2}):(\d{1,2})/ig
const hmsTimeRegex = /(\d{1,2}):(\d{1,2}):(\d{1,2})/ig


export function replaceBuffer(buf:Buffer | string, search:Buffer | string, to:Buffer | string) {
  return rpBuffer(buf, search, to) as Buffer
}
async function execWithLog(cmd:string, param:string[], cwd:string):Promise<boolean> {
  try {
    if (logEXEC) {
      Logger.log("EXEC").put(cmd)
        .next("Params").put(param.join(" ")).out()
    }
    const exec = execa(cmd, param, {
      cwd,
      timeout: 20000,
    })
    // so loud
    if (logEXEC) {
      exec.stderr.pipe(process.stdout)
      exec.stdout.pipe(process.stdout)
    }
    await exec
    return true
  } catch (e) {
    console.error(e)
    return false
  }
}

export class LGParser {
  public readonly cacheDir:string
  private wrapper:YTWrapper
  private readonly upgradeCache = false
  public constructor(token:string, _cachePath:string) {
    this.wrapper = new YTWrapper(token)
    this.cacheDir = _cachePath
  }
  public async fetchVideoList(playlistID:string) {
    await fs.ensureDir(this.cacheDir)
    // parse video list or import cache
    const cacheListJSON = path.resolve(this.cacheDir, `videolist_${playlistID}.json`)
    let videoList:YTVideoListCache
    let updateCache = true
    if (await fs.pathExists(cacheListJSON)) {
      videoList = JSON.parse(await fs.readFile(cacheListJSON, { encoding: "utf-8" }))
      if (Date.now() - new Date(videoList.timestamp).getTime() <= expireDuration) {
        updateCache = false
      }
    }
    if (updateCache) {
      // await wrapper.getChannelPlaylistID(channelID)
      const result = await this.wrapper.getVideosfromPlaylist(playlistID)
      videoList = {
        timestamp: new Date(Date.now()),
        videos: result,
      }
      await fs.writeFile(cacheListJSON, JSON.stringify(videoList))
    }
    return videoList
  }
  public async fetchChannelInfo(channelID:string) {
    await fs.ensureDir(this.cacheDir)
    const channelInfoJSON = path.resolve(this.cacheDir, `channelInfo_${channelID}.json`)
    if (await fs.pathExists(channelInfoJSON)) {
      const parsed:Expirable<YTChannelInfo> = JSON.parse(await fs.readFile(channelInfoJSON, "utf-8"))
      if (Date.now() - parsed.timestamp < expireDuration) {
        return parsed as YTChannelInfo
      }
    }
    const result:Expirable<YTChannelInfo> = {
      ...await this.wrapper.getChannelInfoFromID(channelID),
      timestamp: Date.now()
    }
    await fs.writeFile(channelInfoJSON, JSON.stringify(result))
    return result as YTChannelInfo
  }
  public async getVideoInfo(video:YTVideo, loadComments:boolean):Promise<YTVideoInfo> {
    await fs.ensureDir(this.cacheDir)
    const videoDir = path.resolve(this.cacheDir, `${video.videoID}`)
    const infoFile = path.resolve(videoDir, "info.json")
    const successCheck = path.resolve(videoDir, "success")
    if (await fs.pathExists(successCheck)) {
      const version = await fs.readFile(successCheck, "utf8")
      if (!this.upgradeCache) {
        // blank
      } else if (version === "1") {
        // upgrade version
        await fs.remove(successCheck)
        await fs.remove(path.resolve(videoDir, "thumbnail.png"))
        await fs.writeFile(path.resolve(videoDir, "thumbnail.jpg"), await got(video.thumbnail.url).buffer())
        // download again
        const m4aPath = path.resolve(videoDir, "audio.m4a")
        if (await fs.pathExists(m4aPath)) {
          await fs.remove(m4aPath)
          await execWithLog("youtube-dl", [
            "-o",
            "audio.%(ext)s",
            "-f",
            "251",
            `https://www.youtube.com/watch?v=${video.videoID}`
          ], videoDir)
        }
        // add success check
        await fs.writeFile(successCheck, "2")
      } else if (version === "2") {
        // upgrade version 3
        await fs.remove(successCheck)
        await execWithLog("youtube-dl", [
          "-o",
          "audio.%(ext)s",
          "-f",
          "140",
          `https://www.youtube.com/watch?v=${video.videoID}`
        ], videoDir)
        await fs.writeFile(successCheck, "3")
      }
      return fs.readJSON(infoFile) as Promise<YTVideoInfo>
    }
    await fs.emptyDir(videoDir)
    // download audio
    // opus
    await execWithLog("youtube-dl", [
      "-o",
      "audio.%(ext)s",
      "-f",
      "251",
      `https://www.youtube.com/watch?v=${video.videoID}`
    ], videoDir)
    // aac
    await execWithLog("youtube-dl", [
      "-o",
      "audio.%(ext)s",
      "-f",
      "140",
      `https://www.youtube.com/watch?v=${video.videoID}`
    ], videoDir)
    // comments
    const comments:YTComment[] = []
    if (loadComments) {
      comments.push(...await this.wrapper.getCommentsfromVideo(video.videoID))
    }
    // video info
    const infoJSON:YTVideoInfo = {
      isAlbum: loadComments,
      video,
      comments,
    }
    await fs.writeFile(infoFile, JSON.stringify(infoJSON))
    // thumbnail
    const thumbnailFile = path.resolve(videoDir, "thumbnail.jpg")
    const jpgThumb = (await got(video.thumbnail.url).buffer())
    await fs.writeFile(thumbnailFile, jpgThumb)
    // success check
    await fs.writeFile(successCheck, "3")
    return infoJSON
  }
  public async makeDist(type:string,
    param:{ isAlbum:boolean, videoID:string, preferTitle:string, subTitle:string, noAlbumIndex:number }) {
    // create ogg/m4a container
    const getOrgType = (_type:string) => {
      switch (_type) {
        case "m4a": return "m4a"
        default: return "webm"
      }
    }
    const fileNameRegexp = /[:\?\*\/\|<>\\]+/ig
    const { isAlbum, videoID, subTitle, preferTitle } = param
    const tempPath = path.resolve(".", `temp/${videoID}/tmp_${videoID}__d_.${type}`)
    const containerPath = path.resolve(this.cacheDir, `${videoID}/audio.${getOrgType(type)}`)
    let dist:string
    if (isAlbum) {
      dist = path.resolve(
        distPath, `${type}/${
          preferTitle.replace(fileNameRegexp, "")
        }/${
          subTitle.replace(fileNameRegexp, "").trim()
        }.${type}`)
    } else {
      dist = path.resolve(distPath, `${type}/[${
        param.noAlbumIndex.toString().padStart(3, "0")
      }] ${preferTitle.replace(fileNameRegexp, "").trim()}.${type}`)
    }
    if (await fs.pathExists(dist)) {
      if ((await fs.stat(dist)).size <= 1024) {
        await fs.unlink(dist)
      }
    }
    /*
    while (await fs.pathExists(dist)) {
      dist = dist.replace(new RegExp("(_\\d+)?\\." + type + "$"), `_${dupIndex++}.${type}`)
    }
    */
    await fs.ensureDir(path.dirname(dist))
    await fs.ensureDir(path.dirname(tempPath))
    return { containerPath, tempPath, dist }
  }
  public async cutToTemp(type:"m4a" | "ogg" | "mp3",
    containerPath:string, tempPath:string, chunk:SplitElement, uid:number) {
    const cutParam:string[] = ["-ss", chunk.start]
    const ffmpegParam:string[] = []
    if (!chunk.noEnd) {
      cutParam.push("-t")
      cutParam.push(chunk.delta)
    }
    ffmpegParam.push(...[
      ...cutParam,
      "-i",
      containerPath,
      "-c:a",
    ])
    const tmpPath = tempPath.replace("_d_", uid.toString())
    switch (type) {
      case "m4a": {
        ffmpegParam.push(...[
          "copy",
          "-y",
          tmpPath,
        ])
      } break
      case "mp3": {
        ffmpegParam.push(...[
          "libmp3lame",
          "-b:a",
          "320k",
          "-af",
          "silenceremove=start_periods=1:stop_periods=1:stop_duration=1:start_threshold=-50dB:stop_threshold=-70dB",
          "-y",
          tmpPath,
        ])
      } break
      case "ogg": {
        ffmpegParam.push(...[
          "libopus",
          "-b:a",
          "160k",
          "-af",
          "silenceremove=start_periods=1:stop_periods=1:stop_duration=1:start_threshold=-50dB:stop_threshold=-70dB",
          "-y",
          tmpPath,
        ])
      }
    }
    await execWithLog("ffmpeg", ffmpegParam, this.cacheDir)
    return tempPath.replace("_d_", uid.toString())
  }
  public async writeMetadata(type:"m4a" | "ogg" | "mp3",
    source:string, dist:string, thumbPath:string, metadata:Map<string, string>) {
    await fs.ensureDir(path.dirname(dist))
    const ffmpegParam = [
      `-i`,
      source,
    ]
    const metadataParam:string[] = []
    for (const [tag, value] of metadata) {
      const escapedValue = value.replace(/"/g, '\\"').replace(/\n/g, "\\n")
      metadataParam.push("-metadata")
      metadataParam.push(`${tag.toUpperCase()}=${escapedValue}`)
    }
    // path short
    const cwd = path.resolve(process.cwd())
    source = path.relative(cwd, source)
    dist = path.relative(cwd, dist)
    thumbPath = path.relative(cwd, thumbPath)
    if (type === "m4a") {
      ffmpegParam.push(...[
        "-i",
        thumbPath,
        "-map",
        "1",
        "-map",
        "0",
        "-disposition:0",
        "attached_pic",
        "-c",
        "copy",
        ...metadataParam,
        "-y",
        dist,
      ])
    } else if (type === "ogg") {
      // Impossible to support image via ogg container. rip.
      // metadataParam.push("-metadata")
      // metadataParam.push(`METADATA_BLOCK_PICTURE=REPLACE_REPLACE_REPLACE_IMAGE`)
      ffmpegParam.push(...[
        "-c:a",
        "copy",
        ...metadataParam,
        "-y",
        dist,
      ])
    } else if (type === "mp3") {
      const codecParam:string[] = []
      if (!source.endsWith(".mp3")) {
        // webm
        codecParam.push(...[
          "libmp3lame",
          "-b:a",
          "320k",
          "-af",
          "silenceremove=start_periods=1:stop_periods=1:stop_duration=1:start_threshold=-50dB:stop_threshold=-70dB",
        ])
      } else {
        // mp3
        codecParam.push(...[
          "copy"
        ])
      }
      ffmpegParam.push(...[
        "-i",
        thumbPath,
        "-map",
        "1",
        "-map",
        "0",
        "-disposition:0",
        "attached_pic",
        "-c:a",
        ...codecParam,
        ...metadataParam,
        "-y",
        dist,
      ])
    }
    while (true) {
      try {
        await execWithLog("ffmpeg", ffmpegParam, path.resolve("."))
        break
      } catch (e) {
        console.error(e)
      }
    }
    // ALBUM ART via hex
    if (type === "ogg") {
      // let oggBuffer = await fs.readFile(dist)
      // METADATA_BLOCK_PICTURE=TEST
      // oggBuffer = replaceBuffer(
      //   oggBuffer,
      //   `METADATA_BLOCK_PICTURE=REPLACE_REPLACE_REPLACE_IMAGE`,
      //   `METADATA_BLOCK_PICTURE=${(await fs.readFile(thumbPath)).toString("base64")}`
      // )
      // await fs.writeFile(dist, oggBuffer)
    }
    return dist
  }
  public analyzeVideo(info:YTVideoInfo, composer:ParseComposer):AnalyzedVideo {
    // cherry-pick one comment
    const video = info.video
    let timeInfo:string = video.description.replace(/\s*\n\s*\n\s*/ig, "\n\n")
    let descriptionTimesLn = 0
    timeInfo.replace(timeRegex, (v) => {
      descriptionTimesLn += 1
      return v
    })
    const maxValue = {
      timesLn: descriptionTimesLn,
      commentLn: timeInfo.length,
    }
    for (const comment of info.comments) {
      const times:number[] = []
      const replaceFn = (_:string, hour:string, minute:string, second:string) => {
        if (hour == null) {
          hour = "0"
        } else {
          hour = /\d+/i.exec(hour)[0]
        }
        const time = Number.parseInt(hour) * 3600 + Number.parseInt(minute) * 60 + Number.parseInt(second)
        const dateString = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}`
        if (times.indexOf(time) >= 0) {
          return ""
        }
        times.push(time)
        return dateString
      }
      const commentText =
        htmlToText.fromString(comment.formattedText.replace(htmlTimeRegex, replaceFn))
          .replace(/\s*\n\s*\n\s*/ig, "\n\n")
      if (times.length >= (descriptionTimesLn * 1.1) && times.length >= maxValue.timesLn) {
        if (times.length > maxValue.timesLn || commentText.length > maxValue.commentLn) {
          maxValue.commentLn = commentText.length
          maxValue.timesLn = times.length
          timeInfo = commentText
        }
      }
    }
    const splitElements:SplitElement[] = []
    if (maxValue.timesLn >= 2) {
      // album
      const markLines = timeInfo.split("\n")
      let titleCache = ""
      let index = 0
      let prevTitle:string = null
      let prevTime:VideoTime = null
      const getVideoTime = (t:VideoTime) => t.hour * 3600 + t.minute * 60 + t.second
      for (let line of markLines) {
        // skip blank line
        line = line.trim()
        if (line.length <= 0) {
          // \n\n
          titleCache = ""
          continue
        }
        // add timestamp
        const timestamps:VideoTime[] = []
        line = line.replace(timeRegex, (_, hour:string, minute:string, second:string) => {
          if (hour != null) {
            hour = /\d+/i.exec(hour)[0]
          } else {
            hour = "0"
          }
          timestamps.push({
            hour: Number.parseInt(hour),
            minute: Number.parseInt(minute),
            second: Number.parseInt(second),
          })
          return ""
        })
        const prevTitleCache = titleCache
        line = line.replace(/^\s+/i, "").replace(/^[A-Z\dⅠⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫⅬⅭⅮⅯ]+\.\s*/, () => {
          titleCache = ""
          return ""
        }).replace(/(\(\)|\[\])/ig, "").replace(/(^[\s:\-~\*]+|[\s:\-~\*]+$)/ig, "").trim()
        while ((line.startsWith("(") && line.startsWith("[")) ||
          (line.startsWith("[") && line.endsWith("]"))) {
          line = line.substring(1, line.length - 1)
        }
        if (timestamps.length <= 0) {
          // no time stamp: chain to next
          titleCache += line + " "
          continue
        }
        if (line.length <= 0) {
          // Buffered timestamp: use buffered title
          line = prevTitleCache
        }
        timestamps.sort((a, b) => getVideoTime(a) - getVideoTime(b))
        if (timestamps.length === 2) {
          // start - end, flush time to end
          prevTime = timestamps[1]
          prevTitle = null
          const element = new SplitElement(
            getVideoTime(timestamps[0]),
            getVideoTime(timestamps[1]),
            line,
            ++index)
          splitElements.push(element)
        } else if (prevTitle == null) {
          // prevTitle == null : init (1stack) and chaining (2stack)
          if (prevTime == null) {
            // init (1stack)
            prevTime = timestamps[0]
            prevTitle = line
          } else {
            // chaining (2stack)
            const element = new SplitElement(
              getVideoTime(prevTime),
              getVideoTime(timestamps[0]),
              line,
              ++index)
            splitElements.push(element)
            prevTime = timestamps[0]
          }
        } else {
          // prevTitle != null : chaning (1stack)
          const element = new SplitElement(
            getVideoTime(prevTime),
            getVideoTime(timestamps[0]),
            prevTitle,
            ++index)
          splitElements.push(element)
          prevTitle = line
          prevTime = timestamps[0]
        }
      }
      // last marking
      if (prevTitle != null) {
        // end (1stack)
        const element = new SplitElement(
          getVideoTime(prevTime),
          -1,
          prevTitle,
          ++index)
        splitElements.push(element)
      }
      if (splitElements.length >= 1) {
        // always true..
        // Split param check
        let splitcheck = Logger.log("SplitCheck").put(video.title)
        for (let m = 0; m < splitElements.length; m += 1) {
          splitcheck = splitcheck.next(m.toString()).put(splitElements[m].toString())
        }
        splitcheck.out()
        // log 
        Logger.log("CommentCheck").put("Pin Comment")
          .next("Title").put(video.title)
          .next("Description Length").put(descriptionTimesLn)
          .next("MostComment Ln").put(maxValue.timesLn)
          .next("Comment").put(timeInfo).out()
      } else {
        throw new Error("wtf")
      }
    }
    const isAlbum = splitElements.length >= 1
    if (!isAlbum) {
      splitElements.push(new SplitElement(0, -1, "", -1))
    }
    return {
      video,
      id:video.videoID,
      isAlbum,
      chunks: splitElements,
      title: {
        raw: composer.getAlbumTitle(video.title, AlbumTitleType.RAW),
        eng: composer.getAlbumTitle(video.title, AlbumTitleType.ENGLISH),
        kor: composer.getAlbumTitle(video.title, AlbumTitleType.KOREAN),
      }
    }
  }
}

export interface AnalyzedVideo {
  video:YTVideo
  id:string
  isAlbum:boolean
  chunks:SplitElement[]
  title:{
    raw:string,
    eng:string,
    kor:string,
  }
}

export interface YTVideoListCache {
  timestamp:Date
  videos:YTVideo[]
}
export interface YTVideoInfo {
  isAlbum:boolean
  video:YTVideo
  comments:YTComment[]
}
export interface VideoTime {
  hour:number
  minute:number
  second:number
}