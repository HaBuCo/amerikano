#!/bin/sh
# master.sh <audio-dir>: stems -> final masters, -14 LUFS / -1 dBTP with music, about -18 LUFS without.
A="$1"
ffmpeg -v error -y -i "$A/music.wav" -i "$A/sfx.wav" -filter_complex \
  "[0:a]volume=4dB[m];[1:a]volume=12dB[s];[m][s]amix=inputs=2:normalize=0,volume=5.8dB,alimiter=limit=0.8:attack=1.5:release=35:level=disabled,volume=-0.8dB[o]" \
  -map "[o]" -c:a pcm_s24le "$A/master-music.wav"
ffmpeg -v error -y -i "$A/sfx.wav" -af "volume=12dB,volume=4dB,alimiter=limit=0.82:attack=1.5:release=35:level=disabled" -c:a pcm_s24le "$A/master-sfx.wav"
for f in master-music master-sfx; do
  printf "%s: " "$f"; ffmpeg -hide_banner -nostats -i "$A/$f.wav" -af ebur128=peak=true -f null - 2>&1 | grep -E " I: | LRA: |Peak: " | tail -3 | tr -s ' ' | tr '\n' ' '; echo
done
