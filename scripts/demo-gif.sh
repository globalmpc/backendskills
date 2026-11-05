#!/usr/bin/env bash
# Builds the gifs from their HTML source: one headless-Chrome screenshot per frame, joined by ffmpeg.
#   scripts/demo-gif.sh          docs/demo.html  → docs/demo.gif  (README, 1280×720)
#   scripts/demo-gif.sh promo    docs/promo.html → docs/promo.gif (social posts, 720×720)
# Needs Google Chrome and ffmpeg.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# name, size, then frame:seconds on screen
if [[ ${1:-} == promo ]]; then
  name=promo size=720,720
  frames="h1:0.5 h2:0.6 h3:1.6 t0:0.5 t1:0.7 t2:0.5 t3:0.5 t4:0.9 t5:1.6 p1:0.9 p2:0.3 p3:0.3 p4:0.3 p5:1.6 f1:1.1 f2:2.2 c1:0.4 c2:2.8"
else
  name=demo size=1280,720
  frames="a1:2.2 a2:1.4 a3:4.5 b1:2.6 b2:1.4 b3:4.8 c0:6"
fi

for fd in $frames; do
  f=${fd%%:*}
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=$size --force-device-scale-factor=1 \
    --screenshot="$tmp/$f.png" "file://$ROOT/docs/$name.html?f=$f" >/dev/null 2>&1
  printf "file '%s'\nduration %s\n" "$tmp/$f.png" "${fd##*:}" >> "$tmp/list.txt"
done
printf "file '%s'\n" "$tmp/${f}.png" >> "$tmp/list.txt" # concat needs the last frame twice for its duration

ffmpeg -loglevel error -y -f concat -safe 0 -i "$tmp/list.txt" -fps_mode vfr \
  -vf "split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=bayer" -loop 0 "$ROOT/docs/$name.gif"
ls -la "$ROOT/docs/$name.gif"
