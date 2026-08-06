export type PersonThumbnail = string | null;
export type PersonThumbnailMap = Map<string, PersonThumbnail>;

export interface CachedPersonThumbnail {
  thumbnail: PersonThumbnail;
}
