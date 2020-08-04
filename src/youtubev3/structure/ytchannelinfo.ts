export interface YTChannelInfo {
  title:string
  description:string
  customUrl:string
  publishedAt:string
  profile:{
    url:string,
    width:number,
    height:number,
  }
  localized:{
    title:string
    description:string
  },
  playlistID:string
}