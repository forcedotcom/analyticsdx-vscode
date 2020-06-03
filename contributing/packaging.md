# Update changelog

Always update the [extensions/analyticsdx-vscode/CHANGELOG.md](../extensions/analyticsdx-vscode/CHANGELOG.md) with high
level changes since the last version. Follow the existing formatting. This should be committed and pushed, either
before or with the the version changes.

# Do it all in one step

Run `ANALYTICSDX_VSCODE_VERSION=<X.Y.Z> npm run publish-all-vsixs`. That will do all of the steps listed below.

# Individual steps

## Update version numbers

If you want to update the version of the extensions, run `ANALYTICSDX_VSCODE_VERSION=<X.Y.Z> npm run update-versions`.
This will update the appropriate files, but won't immediately check them in.

## Packaging as .vsix

Normally, just run `npm run build-all-vsixs`.

This will:

1. `git clean -xfe node_modules` to do do a full clean of the repo.
2. `npm install` to install all the dependencies and to symlink interdependent local modules.
3. `NODE_ENV=product npm run compile` to compile all the TypeScript files for production.
4. `npm run vscode:package` packages _each_ extension as a .vsix.

**At this stage, it is possible to share the .vsix directly for manual installation.**

## Generating SHA256

Due to [vscode-vsce#191](https://github.com/Microsoft/vscode-vsce/issues/191)
the .vsix are neither signed nor verified.

For now, we want to update the [SHA256.md](../SHA256.md) file in the repository with the checksums. This is done by
running `npm run update-sha256`, which will update the SHA256.md file from the .vsix files in the extension folders, but
won't immediately check it in.

## Pushing .vsix's to Visual Studio Marketplace

1. Get an access token from your marketplace account.
2. Login to the salesforce publisher: `./node_modules/.bin/vsce login salesforce` and enter your access token
3. Run `npm run vscode:publish`

After publishing, you will normally want to commit and push any of the updated files (i.e. SHA256.md, lerna.json,
package.json's) and generate a tag for the version, like `git tag vX.Y.Z -m "Release X.Y.Z" && git push origin vX.Y.Z`
