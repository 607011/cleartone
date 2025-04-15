#!/bin/sh

source .env

DIST=dist
mkdir -p ${DIST}
echo Copying files ...
cp -r index.html app.js ${DIST}
echo Minifying ...
minify ${DIST}/index.html -o ${DIST}/index.html
minify ${DIST}/app.js -o ${DIST}/app.js
echo Syncing to ${DST} ...
cd ${DIST}
rsync --exclude '.DS_Store' -Rrav . ${DST}
