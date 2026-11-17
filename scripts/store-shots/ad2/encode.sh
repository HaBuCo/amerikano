#!/bin/sh
# encode.sh <frames-root> <audio-dir> <out-dir> [formats...]
# <frames-root>/<fmt>/        20 s of 8-sample frames: node render.mjs frames <fmt> <frames-root>/<fmt> 8
# <frames-root>/<fmt>-bumper/ 6 s of 8-sample frames:  CUT=bumper node render.mjs frames <fmt> <frames-root>/<fmt>-bumper 8
# Writes, per format:
#   amerikano-herkes-ekti-tr-<fmt>.mp4          the 20 s film
#   amerikano-herkes-ekti-bumper-tr-<fmt>.mp4   6 s: the question (film 0.5-4 s) cut straight to the end card (film 17-19.5 s)
F="$1"; A="$2"; O="$3"; shift 3
SUB=8
FORMATS="${*:-16x9 1x1 4x5 9x16}"
ENC="-r 30 -c:v libx264 -preset slow -crf 16 -profile:v high -level 4.2 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -c:a aac -b:a 256k -ar 48000 -movflags +faststart"
# Eight samples of each frame blend into natural motion blur.
BLEND="format=gbrp,tmix=frames=$SUB:weights='1 1 1 1 1 1 1 1',select='eq(mod(n\,$SUB)\,$((SUB - 1)))',setpts=N/(30*TB),scale=in_range=full:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p,noise=c0s=2:c0f=t"
mkdir -p "$O"
for fmt in $FORMATS; do
  ffmpeg -v error -y -framerate $((30 * SUB)) -start_number 0 -i "$F/$fmt/f%05d.jpg" -i "$A/master-music.wav" -filter_complex \
    "[0:v]$BLEND,trim=end_frame=600[v];[1:a]atrim=0:20,afade=t=out:st=19.7:d=0.3[a]" \
    -map "[v]" -map "[a]" $ENC "$O/amerikano-herkes-ekti-tr-$fmt.mp4" || exit 1
  ffmpeg -v error -y -framerate $((30 * SUB)) -start_number 0 -i "$F/$fmt-bumper/f%05d.jpg" -i "$A/master-music.wav" -filter_complex \
    "[0:v]$BLEND,trim=end_frame=180[v];
     [1:a]asplit=2[a1][a2];
     [a1]atrim=0.5:4,asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=3.494:d=0.006[hook];
     [a2]atrim=17:19.5,asetpts=PTS-STARTPTS,afade=t=in:d=0.004,afade=t=out:st=2.2:d=0.3[card];
     [hook][card]concat=n=2:v=0:a=1,volume=0.6dB[a]" \
    -map "[v]" -map "[a]" $ENC "$O/amerikano-herkes-ekti-bumper-tr-$fmt.mp4" || exit 1
  echo "wrote $fmt"
done
