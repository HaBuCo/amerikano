#!/bin/sh
# encode.sh <frames-dir> <audio-dir> <out-dir>
# Blends the eight samples of each frame into natural motion blur, then writes the two uploads.
F="$1"; A="$2"; O="$3"
SUB=8
mkdir -p "$O"
ffmpeg -v error -y -framerate $((30 * SUB)) -start_number 0 -i "$F/f%05d.jpg" -i "$A/master-music.wav" \
  -filter_complex "[0:v]format=gbrp,tmix=frames=$SUB:weights='1 1 1 1 1 1 1 1',select='eq(mod(n\,$SUB)\,$((SUB - 1)))',setpts=N/(30*TB),scale=in_range=full:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p,noise=c0s=2:c0f=t[v]" \
  -map "[v]" -map 1:a -r 30 -c:v libx264 -preset slow -crf 16 -profile:v high -level 4.2 -pix_fmt yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 256k -ar 48000 -movflags +faststart -t 15 "$O/amerikano-nedir-reels-tr-9x16.mp4"
# Same picture, card sounds only: for adding a trending track inside Instagram.
ffmpeg -v error -y -i "$O/amerikano-nedir-reels-tr-9x16.mp4" -i "$A/master-sfx.wav" -map 0:v -map 1:a -c:v copy \
  -c:a aac -b:a 256k -ar 48000 -movflags +faststart -t 15 "$O/amerikano-nedir-reels-tr-9x16-muziksiz.mp4"
