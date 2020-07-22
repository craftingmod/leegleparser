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

const log = console.log

async function exists(pathStr:string) {
  return fs.pathExists(pathStr)
}
async function deleteFile(pathStr:string) {
  return fs.unlink(pathStr)
}

async function main() {
  // create cache
  const cacheDir = path.resolve(".", "cache")
  if (!await exists(cacheDir)) {
    fs.mkdir(cacheDir)
  }
  const wrapper = new YTWrapper(google_api_key)
  // parse video list or import cache
  const cacheListJSON = path.resolve(cacheDir, "videolist.json")
  const albumListJSON = path.resolve(cacheDir, "albumlist.json")
  let videoList:YTVideoListCache
  let albumList:YTVideoListCache
  let updateCache = true
  if (await exists(cacheListJSON)) {
    videoList = JSON.parse(await fs.readFile(cacheListJSON, {encoding:"utf-8"}))
    albumList = JSON.parse(await fs.readFile(albumListJSON, {encoding:"utf-8"}))
    if (Date.now() - new Date(videoList.timestamp).getTime() <= 1000 * 3600 * 24) {
      updateCache = false
    }
  }
  if (updateCache) {
    const result = await wrapper.getVideosfromPlaylist(await wrapper.getChannelPlaylistID(leegleID))
    videoList = {
      timestamp: new Date(Date.now()),
      videos: result,
    }
    await fs.writeFile(cacheListJSON, JSON.stringify(videoList))
    // album list
    const albumVideos = await wrapper.getVideosfromPlaylist(leegleAlbumListID)
    albumList = {
      timestamp: new Date(Date.now()),
      videos: albumVideos,
    }
    await fs.writeFile(albumListJSON, JSON.stringify(albumList))
  }
  const verifyCache = async (video:YTVideo, isAlbum:boolean) => {
    const videoDir = path.resolve(cacheDir, `${video.videoID}`)
    const successCheck = path.resolve(videoDir, "success")
    console.log("Verifying cache: " + chalk.redBright(video.title))
    if (await exists(successCheck)) {
      /*
      if ((await fs.readFile(successCheck, "utf8")) === "1") {
        // upgrade version
        await fs.remove(successCheck)
        await fs.remove(path.resolve(videoDir, "thumbnail.png"))
        await fs.writeFile(path.resolve(videoDir, "thumbnail.jpg"), await got(video.thumbnail.url).buffer())
        // download again
        const m4aPath = path.resolve(videoDir, "audio.m4a")
        if (await exists(m4aPath)) {
          await fs.remove(m4aPath)
          const stdout = await execa("youtube-dl", [
            "-o",
            "audio.%(ext)s",
            "-f",
            "251",
            `https://www.youtube.com/watch?v=${video.videoID}`
          ], {
            cwd: videoDir,
          })
          log(stdout)
        }
        // add success check
        await fs.writeFile(successCheck, "2")
      }
      */
      return
    }
    await fs.emptyDir(videoDir)
    // download audio
    // youtube-dl -o "audio.%(ext)s" -f bestaudio https://www.youtube.com/watch?v=9lwAcAFjnkM
    const dl = execa("youtube-dl", [
      "-o",
      "audio.%(ext)s",
      "-f",
      "251",
      `https://www.youtube.com/watch?v=${video.videoID}`
    ], {
      cwd: videoDir,
    })
    dl.stdout.pipe(process.stdout)
    await dl
    const comments:YTComment[] = []
    if (isAlbum) {
      comments.push(...await wrapper.getCommentsfromVideo(video.videoID))
    }
    // video info
    const infoFile = path.resolve(videoDir, "info.json")
    const infoJSON:LeegleVideoInfo = {
      isAlbum,
      video,
      comments,
    }
    await fs.writeFile(infoFile, JSON.stringify(infoJSON))
    // thumbnail
    const thumbnailFile = path.resolve(videoDir, "thumbnail.jpg")
    const jpgThumb = (await got(video.thumbnail.url).buffer())
    await fs.writeFile(thumbnailFile, jpgThumb)
    // success check
    await fs.writeFile(successCheck, "2")
  }
  let count = 1
  // verify cache..
  for (const albumVideo of albumList.videos) {
    log(
      chalk.redBright("[Album] Check Caching (") + 
      chalk.reset(count++) +
      chalk.redBright("/" + albumList.videos.length + ")"))
    await verifyCache(albumVideo, true)
  }
  count = 1
  for (const video of videoList.videos) {
    log(
      chalk.redBright("[Album] Check Caching (") + 
      chalk.reset(count++) +
      chalk.redBright("/" + videoList.videos.length + ")"))
    await verifyCache(video, false)
  }
  console.log("Cache complete")
}

interface YTVideoListCache {
  timestamp:Date
  videos:YTVideo[]
}
interface LeegleVideoInfo {
  isAlbum:boolean
  video:YTVideo
  comments:YTComment[]
}
main()
