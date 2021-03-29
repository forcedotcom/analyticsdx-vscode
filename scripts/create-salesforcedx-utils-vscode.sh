#!/bin/sh

set -e

# the salesforce-vscode-core version to download
VERSION=51.6.0

# need to get the parent directory as an absolute path
BASEDIR="$( cd -- "$(dirname "$0")"/.. >/dev/null 2>&1 ; pwd -P )"

VSIX=salesforcedx-vscode-core-$VERSION.vsix
VSIXDIR=salesforcedx-vscode-core

PKG=$BASEDIR/lib/salesforcedx-utils-vscode.tgz

if [ ! -f $VSIX ]; then
  # Note: if you do the download too much, you will get rate-limited by azure, and you'll get a json blob instead
  # of a vsix, and the unzip below will fail with "End-of-central-directory signature not found.  Either this file
  # is not a zipfile".
  # There's no need to delete the .vsix after this, plus it's ignored by .gitignore already
  curl --output $VSIX --compressed\
    https://marketplace.visualstudio.com/_apis/public/gallery/publishers/salesforce/vsextensions/salesforcedx-vscode-core/$VERSION/vspackage
fi

if [ -d $VSIXDIR ]; then
  rm -rf $VSIXDIR/*
else
  mkdir -p $VSIXDIR
fi
unzip $VSIX 'extension/node_modules/@salesforce/salesforcedx-utils-vscode/*' -d $VSIXDIR

if [ -f $PKG ]; then
  rm $PKG
fi
(set -e; cd $VSIXDIR/extension/node_modules/@salesforce/salesforcedx-utils-vscode; npm pack; mv salesforce-salesforcedx-utils-vscode-*.tgz $PKG)
echo Updated $PKG
rm -r $VSIXDIR
