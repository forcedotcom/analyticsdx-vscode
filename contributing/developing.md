# Developing

## Pre-requisites

1.  We are using the same version of Node that the current release of VSCode uses (currently 12.4.0).
    If you need to work with multiple versions of Node (e.g. for other projects), you might consider using
    [nvm](https://github.com/creationix/nvm).
1.  It is suggested, though not required, that you use the Insiders version of VS
    Code from [here](https://code.visualstudio.com/insiders).
1.  There is a list of recommended extensions for this workspace in
    .vscode/extensions.json. The first time you open VS Code on this workspace,
    it will ask you to install them. **Please do so since this includes the
    linters and formatters**.

## Structure

### Extensions

The extensions/ directory contains the vscode extensions npm modules.

### Packages

The packages/ directory contains the different utility npm modules. These can be
be referenced in extensions' package.json dependencies to bring them into vscode, but
should not themselves be extensions.

### Test Assets

The test-assets/ directory should contain files that can be shared across multiple
[tests](tests.md), such as sfdx projects.

### Scripts

The scripts/ directory contains js scripts used for the build and running tests.

## Typical workflow

You would only do this once after you cloned the repository.

1.  We develop on the `develop` branch and release from the `master` branch. At
    this point, unless you are working on releasing, you should do a `git checkout develop` and `git pull` to get the
    latest code, and create your working branch (`git checkout -b your-name`)
1.  `npm install` to bring in all the top-level dependencies. Because of the
    `postinstall` script, this also runs `npm run bootstrap` for you
    automatically the first time.
1.  Open the project in VS Code.
1.  The first time after running `npm install` and opening VS Code against the folder, open any `.ts` file, run
    the `TypeScript: Select TypeScript Version...` command via the Command Palette (CMD+SHIFT+P), and select
    `Use Workspace Version`.

You would usually do the following each time you close/reopen VS Code:

1.  (Optional) Open the Command Palette > Tasks: Run Task > Bootstrap (this
    essentially runs `npm run bootstrap`). This is required if you change the
    dependencies in any of the package.json files.
1.  If you wish to build, you can invoke Command Palette > Build Task
    (Ctrl+Shift+B or Cmd+Shift+B on Mac). The errors will show in the Problems
    panel. This the same as `npm run compile`.
1.  To launch a new VS Code session using the extension you need to run the "Launch
    Extensions" from the debug menu. From the debug link on the left panel, select
    "Launch Extensions" or one of the options that launches and runs tests, etc.
    Once the new VS Code session opens you can point this at any workspace.
1.  To debug tests from VS Code, you can invoke Command Palette. Then type in "debug " (there is
    space after) and from the launch configuration dropdown, pick any of "Launch ... Tests" and hit the
    Run button.

For more information, consult the VS Code
[doc](https://code.visualstudio.com/docs/extensions/debugging-extensions) on how
to run and debug extensions.

When you are ready to [commit](commit-guidelines.md)

1.  Run `npm run lint` to run tslint in more thorough mode to identify any
    errors. If you installed the recommended extension into VSCode, the linting
    warnings should be automatically showing in VSCode already.
1.  Some of the items can be fixed using `tslint --project . fix`. Some you
    might need to fix them manually.
1.  Run the [tests](tests.md).

After you [commit](commit-guidelines.md) your change(s), you should push your branch,
e.g. `git push -u origin local-branch-name`.
When you're ready, you should make a pull request in github for your change to merge into `develop`. This will kick
off various status checks, including compiling, linting, and running the tests, where the status of those will
be reported in the pull request. You should also request a code review from someone. You can make additional
commits and push the branch again to update pull request and retrigger the build jobs.

## Notes About Developing VSCode Extensions

Please read through the [VSCode docs about writing extensions](https://code.visualstudio.com/api), including the
subchapters.

### Files and Paths

In general, when dealing with files in vscode, you should try to use
[`vscode.workspace.fs`](https://code.visualstudio.com/api/references/vscode-api#workspace.fs) instead of
the regular node `fs` package.This is so your code can support any remote fileystems configured in VSCode.

Similarly, when dealing with file paths, you should try to use
[`vscode.Uri`](https://code.visualstudio.com/api/references/vscode-api#Uri)'s, and only use `path.posix` when
manipulating [`URI.path`](https://code.visualstudio.com/api/references/vscode-api#Uri.path), e.g.:

```typescript
import { uriDirname } from './util/vscodeUtils';
const dir = uriDirname(document.uri);
// or
import { posix as path } from 'path';
const relfile = document.uri.with({ path: path.join(path.dirname(document.uri.path), 'rel-file.json') });
```

You should try to avoid using [`Uri.fsPath`](https://code.visualstudio.com/api/references/vscode-api#Uri.fsPath) as
well.

## List of Useful commands

_These commands assume that they are executed from the top-level directory.
Internally, they delegate to `lerna` to call them on each npm module in the
packages directory._

### `npm run bootstrap`

This bootstraps the extensions and packages by issuing an `npm install` on each and
also symlinking any packages that are referenced in other packages or extensions.

You would want do this as the first step after you have made changes in the
modules.

If you change the dependencies in your package.json, you will also need to run
this command.

### `npm run compile`

This runs `npm run compile` on each extension and package source folder.

### `npm run clean`

This run `npm run clean` on each of the folders in extensions and packages.

### `npm run watch`

This runs `npm run watch` on each of the extensions and packages. The `--parallel`
flag tell it to run each in a separate process so that it won't block the main
thread.

### `npm run test`

This runs `npm test` on each of the extensions and packages. The `--concurrency 1` is essential
for VS Code extension tests since they require an instance of Code to run in.
And, only one instance of that can be running at a single time.
