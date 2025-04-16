#!/bin/sh

source .env

DIST=dist
mkdir -p ${DIST}
echo Copying files ...
cp -r index.html app.js noise.js ${DIST}
echo Minifying ...
minify ${DIST}/index.html -o ${DIST}/index.html
minify ${DIST}/app.js -o ${DIST}/app.js
minify ${DIST}/noise.js -o ${DIST}/noise.js
echo Syncing to ${DST} ...
cd ${DIST}
rsync --exclude '.DS_Store' -Rrav . ${DST}
