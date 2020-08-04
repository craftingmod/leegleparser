import { YTVideo } from "./youtubev3/structure/ytvideo";

export abstract class ParseComposer {
  public abstract channelID:string
  public abstract preferLang:AlbumTitleType
  public abstract defaultAlbum:string | null
  public abstract getAlbumTitle(title:string, eng:AlbumTitleType):string
  public abstract isAlbum(video:YTVideo | string):boolean
}

export enum AlbumTitleType {
  KOREAN,
  ENGLISH,
  RAW,
}