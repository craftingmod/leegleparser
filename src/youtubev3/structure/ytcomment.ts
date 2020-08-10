export interface YTComment {
  formattedText:string
  rawText:string
  author:{
    channelId:string
    name:string
    profileUrl:string
  }
  likeCount:number
  publishedAt:Date
  updatedAt:Date
}