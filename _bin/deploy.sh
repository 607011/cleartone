#!/bin/sh

source .env

DIST=dist
echo Copying files ...
mkdir -p ${DIST}/static/images
cp -r static/images ${DIST}/static/
echo Minifying ...
minify index.html -o ${DIST}/index.html
minify static/css/default.css -o ${DIST}/static/css/default.css
minify static/js/app.js -o ${DIST}/static/js/app.js
minify static/js/noise.js -o ${DIST}/static/js/noise.js
echo Optimizing images ...
optipng -quiet -o7 ${DIST}/images/*.png
echo Syncing to ${DST} ...
cd ${DIST}
rsync --exclude '.DS_Store' -Rrav . ${DST}
