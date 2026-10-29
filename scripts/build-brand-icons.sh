#!/usr/bin/env bash
# Regenerate the CatchLogX icon artefacts from the master SVG.
#
# Master:  assets/img/catchlogx-icon.svg   (transparent, ink flips in dark mode)
# Outputs: app/icon.svg                   (Next.js metadata convention, exact copy)
#          assets/img/catchlogx-icon-512.png
#          app/apple-icon.png             (180x180, opaque - iOS turns alpha black)
#          app/favicon.ico                (48/32/16, opaque disc for legacy clients)
#
# The disc behind the .ico/apple-icon is derived geometrically: the master's
# viewBox *is* the circle's bounding box, so the disc is inscribed in the square.
#
# Requires: rsvg-convert (librsvg2-bin), ImageMagick.
set -euo pipefail

cd "$(dirname "$0")/.."

MASTER=assets/img/catchlogx-icon.svg
BG='#D8E2E5'
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cp "$MASTER" app/icon.svg
rsvg-convert -w 512 -h 512 "$MASTER" -o "$TMP/flat512.png"
cp "$TMP/flat512.png" assets/img/catchlogx-icon-512.png

# opaque disc version (light circle, transparent corners) for legacy clients
convert -size 512x512 xc:none -fill "$BG" -draw "circle 256,256 256,0" \
  "$TMP/flat512.png" -composite "$TMP/disc512.png"

convert "$TMP/disc512.png" -define icon:auto-resize=48,32,16 app/favicon.ico

# Apple touch icon: full-bleed background, logo inset, no alpha channel
convert "$TMP/flat512.png" -resize 152x152 \
  -background "$BG" -gravity center -extent 180x180 \
  -alpha remove -alpha off app/apple-icon.png

echo "brand icons rebuilt from $MASTER"
identify app/apple-icon.png app/favicon.ico | sed 's/^/  /'
