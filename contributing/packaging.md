# Packaging as .vsix

## Prerequisite

- (Optional) Lerna is properly installed (`npm install -g lerna@2.4.0`).
- All tests have been run prior to publishing. We don't run the tests during the
  publishing cycle since it generates artifacts that we do not want to include
  in the packaged extensions.

## Steps

1. `npm install` to install all the dependencies and to symlink interdependent
   local modules.
1. `npm run compile` to compile all the TypeScript files.
1. (Optional, only needed it doing release build) `lerna package ...` (see scripts/package.js for the full command) will
   increment the version in the individual package.json to prepare for
   publication. **This also commits the changes to git and adds a tag.**
1. `npm run vscode:package` packages _each_ extension as a .vsix.

**At this stage, it is possible to share the .vsix directly for manual installation.**

# Generating SHA256

Due to [vscode-vsce#191](https://github.com/Microsoft/vscode-vsce/issues/191)
the .vsix are neither signed nor verified.

To ensure that they have not been
tampered with, we generate a SHA256 file of the contents and (**TBD**)publish that to
https://developer.salesforce.com/media/vscode/SHA256

## Pushing .vsix to Visual Studio Marketplace

**TBD**
