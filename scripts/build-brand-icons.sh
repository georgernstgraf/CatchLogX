#!/usr/bin/env bash
# Regenerate the CatchLogX icon artefacts from the master SVG.
#
# Master:  assets/img/catchlogx-icon.svg   (transparent, light keyline around the ink)
# Outputs: app/icon.svg                   (Next.js metadata convention, exact copy)
#          assets/img/catchlogx-icon-512.png
#          app/apple-icon.png             (180x180, opaque - iOS turns alpha black)
#          app/favicon.ico                (48/32/16 for legacy clients, RSS, unfurlers)
#
# The .ico frames get a thicker keyline than the master: at 16-48 px the 10-unit
# halo of the master lands well below a pixel and would vanish on dark surfaces.
#
# Requires: rsvg-convert (librsvg2-bin), ImageMagick.
set -euo pipefail

cd "$(dirname "$0")/.."

MASTER=assets/img/catchlogx-icon.svg
BG='#D8E2E5'
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cp "$MASTER" app/icon.svg
rsvg-convert -w 512 -h 512 "$MASTER" -o assets/img/catchlogx-icon-512.png

# favicon: same artwork, keyline scaled up for the tiny raster frames
sed 's/stroke-width="[0-9.]*"/stroke-width="25"/' "$MASTER" > "$TMP/ico.svg"
rsvg-convert -w 512 -h 512 "$TMP/ico.svg" -o "$TMP/ico512.png"
convert "$TMP/ico512.png" -define icon:auto-resize=48,32,16 app/favicon.ico

# Apple touch icon: full-bleed background, logo inset, no alpha channel
convert -size 512x512 xc:"$BG" assets/img/catchlogx-icon-512.png -composite "$TMP/on-bg.png"
convert "$TMP/on-bg.png" -resize 152x152 \
  -background "$BG" -gravity center -extent 180x180 \
  -alpha remove -alpha off -depth 8 app/apple-icon.png

echo "brand icons rebuilt from $MASTER"
identify app/apple-icon.png app/favicon.ico | sed 's/^/  /'
