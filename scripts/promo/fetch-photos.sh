#!/usr/bin/env bash
# Downloads the real-people photos used in the promo (free Pexels licence, see CREDITS.md).
# Usage: scripts/promo/fetch-photos.sh <capture_dir/>
set -euo pipefail
OUT="${1:-$(dirname "$0")/out/}"
mkdir -p "$OUT"
get() { curl -fsSL -o "${OUT}photo-$1.jpg" "https://images.pexels.com/photos/$2/pexels-photo-$2.jpeg?auto=compress&cs=tinysrgb&w=1400"; }
get sam 5163809
get mia 10029281
get grace 5231265
echo "saved photos to $OUT"
