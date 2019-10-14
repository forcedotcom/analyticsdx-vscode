#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');

const srcDir = path.join(__dirname, '..', 'extensions');
const extensionsDir = path.join('.vscode-test', 'extensions');
if (!fs.existsSync(extensionsDir)) {
  mkdirp.sync(extensionsDir);
}

function symlink(src, dest) {
  try {
    if (fs.lstatSync(dest)) {
      fs.unlinkSync(dest);
    }
  } catch (ignore) {}
  fs.symlinkSync(src, dest);
}

// all the args should be folder names (under extensions/) of source extensions
for (let arg = 2; arg < process.argv.length; arg++) {
  const dir = process.argv[arg];
  symlink(path.join(srcDir, dir), path.join(extensionsDir, dir));
}
