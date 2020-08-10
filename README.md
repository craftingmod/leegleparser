# Leegle Audio Parser

[Leegle's Piano video](https://www.youtube.com/channel/UCGX5t-qAZjL4xl5xZ36Md5g) to tagged audio files (m4a, mp3, ogg).

Youtube video can't stream to DLNA Receiver or chromecast receiver (not avaliable in yt music).

This is for integrated amplifier with LAN streaming.

## **DO NOT SHARE OUTPUT DIST** to others. PERSONAL USE ONLY
## I recommend using red or watching advertisement for creator leegle.

# How does it work

1. Fetch videos from yt to audio cache (128kbps aac m4a, 160kbps opus ogg)

## If video isn't playlist
Directly write metadata (Author, Title, Picture-m4a mp3 only) via ffmpeg and export to dist
    
## If video is playlist
i. Split video to time segments from comment or description using regex and write to cache

ii. export all segments with metadata.

3. It will export to `m4a`, `mp3`, `ogg` type with cover. Simple :D
