export interface Main {
  kind:          string;
  etag:          string;
  nextPageToken: string;
  pageInfo:      PageInfo;
  items:         Item[];
}

export interface Item {
  kind:    ItemKind;
  etag:    string;
  id:      string;
  snippet: ItemSnippet;
}

export enum ItemKind {
  YoutubeCommentThread = "youtube#commentThread",
}

export interface ItemSnippet {
  videoId:         string;
  topLevelComment: TopLevelComment;
  canReply:        boolean;
  totalReplyCount: number;
  isPublic:        boolean;
}

export interface TopLevelComment {
  kind:    TopLevelCommentKind;
  etag:    string;
  id:      string;
  snippet: TopLevelCommentSnippet;
}

export enum TopLevelCommentKind {
  YoutubeComment = "youtube#comment",
}

export interface TopLevelCommentSnippet {
  videoId:               string;
  textDisplay:           string;
  textOriginal:          string;
  authorDisplayName:     string;
  authorProfileImageUrl: string;
  authorChannelUrl:      string;
  authorChannelId:       AuthorChannelID;
  canRate:               boolean;
  viewerRating:          string;
  likeCount:             number;
  publishedAt:           Date;
  updatedAt:             Date;
}

export interface AuthorChannelID {
  value: string;
}

export interface PageInfo {
  totalResults:   number;
  resultsPerPage: number;
}
