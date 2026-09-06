#!/usr/bin/env bash
# Rebuild public/hero-frames from a raw exported frame dump.
#
#   ./scripts/build-hero-frames.sh ~/Downloads/frames-dir
#
# The source is a 1920x1080 JPEG sequence of the cabinet exploding, one file
# per frame, sorted by name. Only the first LAST_MOVING frames carry motion —
# the tail of the export is the finished pose held still, and scrubbing across
# it would read as the animation stalling halfway through the hero.
#
# Output is COUNT frames at WIDTH, JPEG q45: ~25 KB each, ~1.8 MB total, which
# is the whole budget for a desktop-only hero. Bumping COUNT or WIDTH spends
# that budget linearly — measure before you do.
set -euo pipefail

SRC="${1:?usage: build-hero-frames.sh <dir of exported jpgs>}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/hero-frames"
COUNT=72
LAST_MOVING=152
WIDTH=960

# Not `mapfile`: macOS ships bash 3.2, which does not have it.
FRAMES=()
while IFS= read -r f; do FRAMES+=("$f"); done < <(ls "$SRC"/*.jpg | sort)
rm -rf "$OUT"; mkdir -p "$OUT"

for i in $(seq 0 $((COUNT - 1))); do
  # Evenly sample the moving range; nearest-neighbour, no blending.
  src_index=$(( i * (LAST_MOVING - 1) / (COUNT - 1) ))
  printf -v name "%03d" "$i"
  sips -Z "$WIDTH" -s format jpeg -s formatOptions 45 \
    "${FRAMES[$src_index]}" --out "$OUT/$name.jpg" >/dev/null
done

echo "$COUNT frames -> $OUT  ($(du -sh "$OUT" | cut -f1))"
