#!/bin/sh
# encode.sh <frames-root> <audio-dir> <out-dir> [formats...]
# <frames-root>/<fmt>/ holds 16 s of 8-sample frames from `node render.mjs frames <fmt> <frames-root>/<fmt> 8`.
# Per format, one pass blends the samples into motion blur and writes both uploads:
#   amerikano-reklam-tr-<fmt>.mp4   the 15 s film
#   amerikano-bumper-tr-<fmt>.mp4   6 s: the hook (0-2.5 s) cut straight to the end card (12.5-16 s)
F="$1"; A="$2"; O="$3"; shift 3
SUB=8
FORMATS="${*:-16x9 1x1 4x5 9x16}"
ENC="-r 30 -c:v libx264 -preset slow -crf 16 -profile:v high -level 4.2 -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv -c:a aac -b:a 256k -ar 48000 -movflags +faststart"
mkdir -p "$O"
for fmt in $FORMATS; do
  ffmpeg -v error -y -framerate $((30 * SUB)) -start_number 0 -i "$F/$fmt/f%05d.jpg" -i "$A/master-music.wav" -filter_complex "
    [0:v]format=gbrp,tmix=frames=$SUB:weights='1 1 1 1 1 1 1 1',select='eq(mod(n\,$SUB)\,$((SUB - 1)))',setpts=N/(30*TB),
      scale=in_range=full:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p,noise=c0s=2:c0f=t,split=3[v0][v1][v2];
    [v0]trim=end_frame=450,setpts=PTS-STARTPTS[film];
    [v1]trim=end_frame=75,setpts=PTS-STARTPTS[hook];
    [v2]trim=start_frame=375:end_frame=480,setpts=PTS-STARTPTS[card];
    [hook][card]concat=n=2:v=1:a=0[bumper];
    [1:a]asplit=3[a0][a1][a2];
    [a0]atrim=0:15,afade=t=out:st=14.85:d=0.15[filma];
    [a1]atrim=0:2.5,asetpts=PTS-STARTPTS,afade=t=out:st=2.494:d=0.006[hooka];
    [a2]atrim=12.5:16,asetpts=PTS-STARTPTS,afade=t=in:d=0.004,afade=t=out:st=3.3:d=0.2[carda];
    [hooka][carda]concat=n=2:v=0:a=1,volume=1.3dB[bumpera]" \
    -map "[film]" -map "[filma]" $ENC "$O/amerikano-reklam-tr-$fmt.mp4" \
    -map "[bumper]" -map "[bumpera]" $ENC "$O/amerikano-bumper-tr-$fmt.mp4" || exit 1
  echo "wrote $fmt"
done
