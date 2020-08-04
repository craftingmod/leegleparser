import { google_api_key } from "./key"
import { YouTube } from "popyt"
import got from "got"
import { YTWrapper } from "./youtubev3/ytwrapper"
import { leegleID, leegleAlbumListID } from "./constants"
import fssync from "fs"
import fs from "fs-extra"
import path from "path"
import { YTVideo } from "./youtubev3/structure/ytvideo"
import youtubeDL from "youtube-dl"
import chalk from "chalk"
import humanFormat from "human-format"
import { YTComment } from "./youtubev3/structure/ytcomment"
import Jimp from "jimp"
import execa from "execa"
import { Logger, LogLevel } from "./jjak/Logger"
import htmlToText from "html-to-text"
import { YTChannelInfo } from "./youtubev3/structure/ytchannelinfo"
import { LGParser } from "./lgparser"
import { ParseComposer, AlbumTitleType } from "./parsecomposer"
import { SplitElement } from "./splitelement"

const leegleParser = new LGParser(google_api_key, path.resolve(".", "cache")) 


async function main(composer:ParseComposer) {
  const channelInfo = await leegleParser.fetchChannelInfo(composer.channelID)

  const videoList = await leegleParser.fetchVideoList(channelInfo.playlistID)
  const videoInfo:Map<string, YTVideoInfo> = new Map()
  let count = 1
  const logCache = (video:YTVideo, ln:number) => {
    Logger.log("CacheCheck")
      .put("Checking Cache...")
      .next("Title").put(video.title)
      .next("ID").put(video.videoID)
      .next("Progression").put(`${count++}/${ln}`).out()
  }
  // verify cache
  count = 1
  for (const video of videoList.videos) {
    logCache(video, videoList.videos.length)
    videoInfo.set(video.videoID, await leegleParser.getVideoInfo(video, composer.isAlbum(video)))
  }
  Logger.log("CacheCheck").put("Cache check complete")
  // parse comments
  const htmlTimeRegex = /<a href=.+?>(\d{1,2}:)?(\d{1,2}):(\d{1,2})<\/a>/ig
  const timeRegex = /(\d{1,2}:)?(\d{1,2}):(\d{1,2})/ig
  const hmsTimeRegex = /(\d{1,2}):(\d{1,2}):(\d{1,2})/ig
  // combined loop
  count = 1
  for (const [,info] of videoInfo) {
    let tempI = 1
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
          hour = hour.match(/\d+/i)[0]
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
            hour = hour.match(/\d+/i)[0]
          } else {
            hour = "0"
          }
          timestamps.push({
            hour:Number.parseInt(hour),
            minute:Number.parseInt(minute),
            second:Number.parseInt(second),
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
        timestamps.sort((a, b) => {
          return getVideoTime(a) - getVideoTime(b)
        })
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
    const albumTitle = composer.getAlbumTitle(video.title, AlbumTitleType.RAW)
    const engTitle = composer.getAlbumTitle(video.title, AlbumTitleType.ENGLISH)
    const korTitle = composer.getAlbumTitle(video.title, AlbumTitleType.KOREAN)
    Logger.info("FileExporter").put(video.title)
    .next("Index").put(count++)
    .next("Total").put(videoList.videos.length).out()
    for (const chunk of splitElements) {
      Logger.log("SplitComposer").put(video.title)
        .next("AlbumTitle").put(albumTitle)
        .next("EngTitle").put(engTitle)
        .next("KorTitle").put(korTitle)
        .next("SplitTitle").put(chunk.title).out()
      const meta:Map<string, string> = new Map()
      meta.set("title", isAlbum ? chunk.title : albumTitle)
      meta.set("artist", channelInfo.title)
      meta.set("author", channelInfo.title)
      meta.set("year", new Date(video.publishedAt).getFullYear().toString())
      meta.set("album_artist", channelInfo.title)
      meta.set("composer", channelInfo.title)
      if (isAlbum) {
        meta.set("album", albumTitle)
        meta.set("track", chunk.index.toString())
      } else {
        if (composer.defaultAlbum != null) {
          meta.set("album", composer.defaultAlbum)
        }
      }
      meta.set("genre", "game") // maybe..
      meta.set("copyright", channelInfo.title)
      meta.set("description", video.description)

      const thumbPath = path.resolve(leegleParser.cacheDir, `${video.videoID}/thumbnail.jpg`)
      let preferTitle:string
      if (composer.preferLang === AlbumTitleType.KOREAN) {
        preferTitle = korTitle
      } else if (composer.preferLang === AlbumTitleType.ENGLISH) {
        preferTitle = engTitle
      } else {
        preferTitle = albumTitle
      }
      const ftypes:["m4a", "ogg", "mp3"] = ["m4a", "ogg", "mp3"]
      for (const type of ftypes) {
        const exportPath = await leegleParser.makeDist(type, {
          isAlbum,
          videoID: video.videoID,
          preferTitle,
          subTitle: chunk.title,
        })
        if (await fs.pathExists(exportPath.dist)) {
          // skip
          continue
        }
        const sourceM4A = (!isAlbum) ? exportPath.containerPath :
          await leegleParser.cutToTemp(type, exportPath.containerPath, exportPath.tempPath, chunk, tempI++)
          
        await leegleParser.writeMetadata(type, sourceM4A, exportPath.dist, thumbPath, meta)
      }
      await fs.remove(path.resolve(".", "temp", video.videoID))
    }

    // for (const comment of info.comments) {
    //   console.log(comment.rawText)
    //   for (const line of comment.formattedText.split("<br />")) {
    //     const timestamps:string[] = []
    //     const replaceFn = (v:string, hour:string, minute:string, second:string) => {
    //       const dateString = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}`
    //       timestamps.push(dateString)
    //       return dateString
    //     }
    //     const  aaa  = line.replace(/<a href=.+?>(\d{0,2})(\d{1,2}):(\d{1,2})<\/a>/ig, replaceFn)
    //     if (timestamps.length <= 0) {
    //       continue
    //     }
    //     console.log(aaa)
    //   }
    // } 
  }
}



interface YTVideoListCache {
  timestamp:Date
  videos:YTVideo[]
}
interface YTVideoInfo {
  isAlbum:boolean
  video:YTVideo
  comments:YTComment[]
}
interface VideoTime {
  hour:number
  minute:number
  second:number
}


class LeegleComposer extends ParseComposer {
  public channelID:string
  public preferLang = AlbumTitleType.KOREAN
  public defaultAlbum = "메이플스토리 피아노[Maplestory Piano Cover]"
  private albumList:string[]
  public constructor() {
    super()
    this.channelID = leegleID
  }
  public async parseAlbumList() {
    this.albumList = (await leegleParser.fetchVideoList(leegleAlbumListID)).videos.map((v) => v.videoID)
  }
  public isAlbum(video:YTVideo | string) {
    return this.albumList.indexOf((typeof video === "string") ? video : video.videoID) >= 0
  }
  public getAlbumTitle(title:string, eng:AlbumTitleType):string {
    const quoteTitle = title.match(/\".+\"/)?.[0]
    if (quoteTitle != null) {
      title = quoteTitle.substring(1, quoteTitle.length - 1)
    } else {
      title = title.replace(/\s+\-\s+메이플스토리 피아노\[Maplestory Piano Cover\]/i, "")
    }
    // Leegle title parser
    if (eng === AlbumTitleType.ENGLISH || eng === AlbumTitleType.KOREAN) {
      const engTitle = title.match(/\([ -~ä]+\)/i)?.[0]
      if (engTitle != null) {
        if (eng === AlbumTitleType.ENGLISH) {
          return engTitle.substring(1, engTitle.length - 1)
        } else {
          return title.replace(engTitle, "").replace(/\[.+?\]/ig, "").replace(/#\d+/, "").trim()
        }
      }
    }
    return title.trim()
  }

}

const com = new LeegleComposer()
com.parseAlbumList().then(() => main(com))
