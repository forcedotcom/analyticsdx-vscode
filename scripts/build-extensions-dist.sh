#!/bin/sh

# Helper script to locally build the .vsix files to the top-level dist/ folder

# always run in top-level folder
cd `dirname $0`/..
# clear/make dist foler
if [ -d dist ]; then
  rm -rf dist/analyticsdx-vscode-*.vsix
else
  mkdir dist
fi
# it's ok if clean fails
npm run clean

npm install &&\
  NODE_ENV=production npm run compile &&\
  npm run vscode:package &&\
  find . -name '*.vsix' -type f -exec mv {} dist \;
