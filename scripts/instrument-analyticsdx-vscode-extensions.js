#!/usr/bin/env node

const shell = require('shelljs');
shell.set('-e');
shell.set('+v');

const path = require('path');

const extensionsToInstrument = ['extensions/analyticsdx-vscode-core', 'extensions/analyticsdx-vscode-templates'];

const folderToInstrument = 'out';

extensionsToInstrument.forEach(extension => {
  const istanbulExecutable = path.join(__dirname, '..', 'node_modules', '.bin', 'istanbul');
  const extensionFolderToInstrument = path.join(__dirname, '..', extension, folderToInstrument);
  const instrumentedFolder = path.join(extension, 'temp-instrumented');
  shell.exec(
    `${istanbulExecutable} instrument ${extensionFolderToInstrument} --complete-copy -o ${instrumentedFolder}`
  );
  shell.rm('-rf', extensionFolderToInstrument);
  shell.mv(instrumentedFolder, extensionFolderToInstrument);
});
