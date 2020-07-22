import got from "got/dist/source"
import * as PlaylistRes from "./structure/playlistres"
import * as CommentListRes from "./structure/commentlistres"
import { YTVideo } from "./structure/ytvideo"
import { YTComment } from "./structure/ytcomment"

export class YTWrapper {
  private readonly getChannelInfoURL = this.genAPI("channels", "id=$id&key=$key&part=contentDetails")
  private readonly getPlaylistItemsURL = this.genAPI("playlistItems", "part=snippet%2CcontentDetails&maxResults=50&playlistId=$id&key=$key&pageToken=$token")
  private readonly getCommentsInVideoURL = this.genAPI("commentThreads", "part=snippet&maxResults=20&order=relevance&key=$key&videoId=$videoid")
  private token:string
  public constructor(token:string) {
    this.token = token
  }
  public async getChannelPlaylistID(channelID:string) {
    const url = this.getChannelInfoURL.replace("$id", channelID).replace("$key", this.token)
    const res = (await got<any>(url, {
      responseType: "json",
    })).body
    return res.items[0].contentDetails.relatedPlaylists.uploads
  }
  public async getVideosfromPlaylist(playlistID:string) {
    const url = this.getPlaylistItemsURL.replace("$id", playlistID).replace("$key", this.token)
    let pageToken = ""
    const arr:YTVideo[] = []
    while (true) {
      const res = (await got<PlaylistRes.Main>(url.replace("$token", pageToken), {
        responseType: "json",
      })).body
      for (const item of res.items) {
        let thumb:PlaylistRes.Default = null
        if (item.snippet.thumbnails.maxres == null) {
          thumb = item.snippet.thumbnails.high
        } else {
          thumb = item.snippet.thumbnails.maxres
        }
        arr.push({
          videoID: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail: {
            ...thumb
          },
          publishedAt: item.snippet.publishedAt,
        })
      }
      pageToken = res.nextPageToken
      console.log(`Parsing playlist: ${arr.length} size, nextToken: ${pageToken}`)
      if (res.nextPageToken == null || res.nextPageToken.length <= 0) {
        break
      }
    }
    return arr
  }
  public async getCommentsfromVideo(videoID:string) {
    const url = this.getCommentsInVideoURL.replace("$videoid", videoID).replace("$key", this.token)
    const res = (await got<CommentListRes.Main>(url, {
      responseType: "json",
    })).body
    const comments:YTComment[] = res.items.map((v) => {
      const snippet = v.snippet.topLevelComment.snippet
      return {
        formattedText: snippet.textDisplay,
        rawText: snippet.textOriginal,
        author: {
          channelId: snippet.authorChannelId.value,
          name: snippet.authorDisplayName,
          profileUrl: snippet.authorProfileImageUrl,
        },
        likeCount: snippet.likeCount,
        publishedAt: snippet.publishedAt,
        updatedAt: snippet.updatedAt,
      }
    })
    return comments
  }
  private genAPI(type:string, param:string) {
    return `https://www.googleapis.com/youtube/v3/${type}?${param}`
  }
}