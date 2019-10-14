#!/usr/bin/env node

const shell = require('shelljs');
shell.set('-e');
shell.set('+v');

// Checks that you have specified the next version as an environment variable, and that it's properly formatted.
const nextVersion = process.env['ANALYTICSDX_VSCODE_VERSION'];
if (!nextVersion) {
  console.log(
    'You must specify the next version of the extension by setting ANALYTICSDX_VSCODE_VERSION as an environment variable.'
  );
  process.exit(-1);
} else {
  const [version, major, minor, patch] = nextVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
  const currentBranch = shell.exec('git rev-parse --abbrev-ref HEAD', {
    silent: true
  }).stdout;

  if (!currentBranch.includes('/v' + nextVersion)) {
    console.log(
      `You must execute this script in a release branch including ANALYTICSDX_VSCODE_VERSION (e.g, release/v${nextVersion} or hotfix/v${nextVersion})`
    );
    process.exit(-1);
  }
}

// Checks that a tag of the next version doesn't already exist
const checkTags = shell.exec('git tag', { silent: true }).stdout;
if (checkTags.includes(nextVersion)) {
  console.log('There is a conflicting git tag. Reclone the repository and start fresh to avoid versioning problems.');
  process.exit(-1);
}

// Real-clean
shell.exec('git clean -xfd -e node_modules');

// Install and bootstrap
shell.exec('npm install');

// Compile
shell.exec('NODE_ENV=production npm run compile');

// lerna publish
// --skip-npm to increment the version number in all extensions & packages but not publish to npmjs
// This will still make a commit in Git with the tag of the version used
shell.exec(`lerna publish --force-publish --exact --repo-version ${nextVersion} --yes --skip-npm`);

// Generate the .vsix files
shell.exec(`npm run vscode:package`);

// Generate the SHA256 and append to the file
shell.exec(`npm run vscode:sha256`);

// Concatenate the contents to the proper SHA256.md
shell.exec('./scripts/concatenate-sha256.js');

// Remove the temp SHA256 file
shell.rm('./SHA256');

// Add SHA256 to git
shell.exec(`git add SHA256.md`);

// Git commit
shell.exec(`git commit -m "Updated SHA256"`);
