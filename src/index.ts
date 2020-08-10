import { google_api_key } from "./key"
import { YouTube } from "popyt"
import got from "got"
import { YTWrapper } from "./youtubev3/ytwrapper"
import { leegleID, leegleAlbumListID, leegleNoMapleListID } from "./constants"
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
import { LGParser, AnalyzedVideo } from "./lgparser"
import { ParseComposer, AlbumTitleType } from "./parsecomposer"
import { SplitElement } from "./splitelement"

const ytWatchPrefix = "https://www.youtube.com/watch?v="

async function main(leegleParser:LGParser, composer:ParseComposer) {
  const channelInfo = await leegleParser.fetchChannelInfo(composer.channelID)
  const videoList = await leegleParser.fetchVideoList(channelInfo.playlistID)
  const videoListLength = videoList.videos.length
  const videoInfo:AnalyzedVideo[] = []
  for (let i = 0; i < videoListLength; i += 1) {
    const video = videoList.videos[i]
    Logger.log("CacheCheck")
      .put("Checking Cache...")
      .next("Title").put(video.title)
      .next("ID").put(video.videoID)
      .next("Progression").put(`${i + 1}/${videoListLength}`).out()
    const info = await leegleParser.getVideoInfo(video, composer.isAlbum(video))
    videoInfo.push(leegleParser.analyzeVideo(info, composer))
  }
  Logger.log("CacheCheck").put("Cache check complete").out()

  const singleSongsLn = videoInfo.filter((v) => !(composer.isAlbum(v.id) || v.isAlbum)).length
  let singleSongCount = 0
  let chartHTML =
`<table border="1">
  <tr>
    <th>앨범</th>
    <th>이름</th>
    <th>링크</th>
  </tr>
`
  for (const info of videoInfo) {
    const {isAlbum, video} = info
    const albumTitle = info.title.raw
    const isSingle = !isAlbum && !composer.isAlbum(video)
    let singleIndex = 0
    if (isSingle) {
      singleIndex = singleSongsLn - (singleSongCount++)
    }
    let albumIndex = 0
    for (const chunk of info.chunks) {
      Logger.log("SplitComposer").put(albumTitle)
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
        if (isSingle) {
          meta.set("album", composer.defaultAlbum)
          meta.set("track", singleIndex.toString())
        }
      }
      meta.set("genre", "game") // maybe..
      meta.set("copyright", channelInfo.title)
      meta.set("description", video.description)
      // add html
      chartHTML += "  <tr>\n"
      chartHTML += `    <td>${isSingle ? composer.defaultAlbum : albumTitle}</td>\n`
      chartHTML += `    <td>${isAlbum ? chunk.title : albumTitle}</td>\n`
      chartHTML += `    <td><a href="${ytWatchPrefix + video.videoID}&t=${Math.max(0, chunk.startTime)}">링크</a></td>\n`
      chartHTML += `  </tr>\n`

      const thumbPath = path.resolve(leegleParser.cacheDir, `${video.videoID}/thumbnail.jpg`)
      let preferTitle:string
      if (composer.preferLang === AlbumTitleType.KOREAN) {
        preferTitle = info.title.kor
      } else if (composer.preferLang === AlbumTitleType.ENGLISH) {
        preferTitle = info.title.eng
      } else {
        preferTitle = albumTitle
      }
      preferTitle = preferTitle.trim()
      const ftypes:["m4a", "ogg", "mp3"] = ["m4a", "ogg", "mp3"]
      for (const type of ftypes) {
        const exportPath = await leegleParser.makeDist(type, {
          isAlbum,
          videoID: video.videoID,
          preferTitle,
          subTitle: chunk.title,
          noAlbumIndex: singleIndex,
        })
        if (await fs.pathExists(exportPath.dist)) {
          // skip
          continue
        }
        const sourceM4A = (!isAlbum) ? exportPath.containerPath :
          await leegleParser.cutToTemp(type, exportPath.containerPath, exportPath.tempPath, chunk, albumIndex++)
          
        await leegleParser.writeMetadata(type, sourceM4A, exportPath.dist, thumbPath, meta)
      }
      await fs.remove(path.resolve(".", "temp", video.videoID))
    }
  }
  chartHTML += "</table>"
  await fs.writeFile(path.resolve(".", "dist", "chart.html"), chartHTML, {encoding: "utf8"})
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
  public async parseAlbumList(parser:LGParser) {
    this.albumList = (await parser.fetchVideoList(leegleAlbumListID)).videos.map((v) => v.videoID)
    this.albumList.push(...(await parser.fetchVideoList(leegleNoMapleListID)).videos.map((v) => v.videoID))
  }
  public isAlbum(video:YTVideo | string) {
    const id = (typeof video === "string") ? video : video.videoID
    // the only one I cant detect as album..
    if (id === "m0SI8kVClcg") {
      return true
    }
    return this.albumList.indexOf(id) >= 0
  }
  public getAlbumTitle(title:string, eng:AlbumTitleType):string {
    const quoteTitle = /\".+\"/.exec(title)?.[0]
    if (quoteTitle != null) {
      title = quoteTitle.substring(1, quoteTitle.length - 1)
    } else {
      title = title.replace(/\s+\-\s+메이플스토리 피아노\[Maplestory Piano Cover\]/i, "")
    }
    // Leegle title parser
    if (eng === AlbumTitleType.ENGLISH || eng === AlbumTitleType.KOREAN) {
      const engTitle = /\([ -~ä]+\)/i.exec(title)?.[0]
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

async function runMain() {
  const leegleParser = new LGParser(google_api_key, path.resolve(".", "cache"))
  const leegleComposer = new LeegleComposer()
  await leegleComposer.parseAlbumList(leegleParser)
  await main(leegleParser, leegleComposer)
}

runMain().catch((err) => console.error(err))

