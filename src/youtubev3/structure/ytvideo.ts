export interface YTVideo {
  videoID:string
  title:string
  description:string
  thumbnail:{
    url:string,
    width:number,
    height:number,
  }
  publishedAt:Date
  authorID:string
  authorName:string
}