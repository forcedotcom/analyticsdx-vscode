const process = require('process');
const fs = require('fs-extra');
const path = require('path');
const shell = require('shelljs');

const junitFilesToCheck = [
  'junit-custom.xml',
  'junit-custom-unitTests.xml',
  'junit-custom-integrationTests.xml',
  'junit-custom-vscodeIntegrationTests.xml'
];
const currDir = process.cwd();
shell.mkdir(path.join(process.cwd(), 'junit-aggregate'));

['packages', 'extensions'].forEach(basedirname => {
  const basedir = path.join(currDir, basedirname);
  fs.readdirSync(basedir)
    .filter(file => {
      return fs.statSync(path.join(basedir, file)).isDirectory();
    })
    .forEach(dir => {
      junitFilesToCheck.forEach(junitFile => {
        var fullFilePath = path.join(basedir, dir, junitFile);
        if (fs.existsSync(fullFilePath)) {
          shell.cp(fullFilePath, path.join(process.cwd(), `junit-aggregate/${dir}-${junitFile}`));
        }
      });
    });
});
