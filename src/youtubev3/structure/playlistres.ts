export interface Main {
  kind:string;
  etag:string;
  nextPageToken:string;
  items:Item[];
  pageInfo:PageInfo;
}

export interface Item {
  kind:ItemKind;
  etag:string;
  id:string;
  snippet:Snippet;
  contentDetails:ContentDetails;
}

export interface ContentDetails {
  videoId:string;
  videoPublishedAt:Date;
}

export enum ItemKind {
  YoutubePlaylistItem = "youtube#playlistItem",
}

export interface Snippet {
  publishedAt:Date;
  channelId:string;
  title:string;
  description:string;
  thumbnails:Thumbnails;
  channelTitle:string;
  playlistId:string;
  position:number;
  resourceId:ResourceID;
}

export interface ResourceID {
  kind:ResourceIDKind;
  videoId:string;
}

export enum ResourceIDKind {
  YoutubeVideo = "youtube#video",
}

export interface Thumbnails {
  default:Default;
  medium:Default;
  high:Default;
  standard?:Default;
  maxres?:Default;
}

export interface Default {
  url:string;
  width:number;
  height:number;
}

export interface PageInfo {
  totalResults:number;
  resultsPerPage:number;
}