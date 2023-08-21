# Tests

## Introduction

There are several kinds of tests for the VS Code Extensions. This document
describes them and gives pointers on how to run/debug them.

The test types from most preferred to least preferred are:

1. [Unit Tests](#unittests)
1. [Vscode-integration Tests](#vscodetests)
1. [Manual Tests](#manualtests)

To run all tests, execute `npm run compile && npm run test` from the top-level
folder.

## <a name="unittests">Unit Tests</a>

For packages that don't have any dependencies on vscode, you would write such tests using Mocha and Chai as you normally
would for NPM modules.

For vscode extension packages, place your strict unit tests in the `test/unit` directory of your package and create an
npm script in your package.json like `"test:unit": "./node_modules/.bin/_mocha --recursive out/test/unit"`
for running the tests. Check out the `"test:unit"` scripts in `extensions/analyticsdx-vscode-templates/package.json` file
to see examples of how to configure code coverage reporting when running the tests.

These tests should not require a VS Code instance or a Salesforce server connection, and
can be run directly using `npm run test:unit`.

## <a name="vscodetests">VS Code Integration Tests</a>

VS Code provides its own special way to run tests that require access to the
extension development host. Basically, it launches your test in another instance
of itself. You have control over what extensions are launched, the tests that
are run, and also the workspace that it will run in. This gives you quite a bit
of flexibility.

More information can be found at the doc
[site](https://code.visualstudio.com/docs/extensions/testing-extensions).

### Assumptions

While the test runner is highly configurable, there are certain assumptions that
will help make writing the tests easier.

1. Ensure that your tests go into the `test/vscode-integration` folder.
1. Ensure that you have an `index.ts` file in the `test/vscode-integration` folder that follows what is
   in the standard configuration (copy from an existing one if you don't have it).
1. Ensure that your test files are named like `<something>.test.ts`. The `.test.` in
   the middle is required.
1. Ensure that your .js test files are compiled into the `out/test/vscode-integration` directory.

### VSCode instance setup

To your `package.json`, you should add scripts like:

```json
{
  "scripts": {
    "setup-vscode-integration": "node ../../scripts/link-vscode-integration-dependency analyticsdx-vscode-core analyticsdx-vscode-templates && node ../../scripts/download-vscode-for-tests && node ../../scripts/install-vsix-dependency salesforce.salesforcedx-vscode-core"
  }
}
```

where this setup task will:

1. run `link-vscode-integration-dependency` for your extension plus any of the other extension
   folders under extensions/ that your extension depends on
1. run `download-vscode-for-tests` to setup a vscode installation for the tests
1. run `install-vsix-dependency` for any other extensions required for your extensions

Those steps will create and update a `.vscode-test/` folder, which will be used for running the tests later. Thus, the
`.vscode-test/` folder should be put into your `.gitignore` and other .ignore files
such as `.npmignore` and `.vscodeignore`.

### Running interactively

There are configurations already created for you at the top level `.vscode/launch.json` file.

If you make a new extension, you will need to edit `.vscode/launch.json`, e.g.:

```json
{
  "name": "Launch Salesforce <extension-name> Vscode-Integration Tests",
  "type": "extensionHost",
  "request": "launch",
  "runtimeExecutable": "${execPath}",
  "args": [
    "${workspaceRoot}/test-assets/sfdx-simple",
    "--extensionDevelopmentPath=${workspaceFolder}/extensions/analyticsdx-vscode-templates/.vscode-test/extensions",
    "--extensionTestsPath=${workspaceRoot}/packages/analyticsdx-vscode-core/out/test/vscode-integration"
  ],
  "stopOnEntry": false,
  "sourceMaps": true,
  "outFiles": ["${workspaceRoot}/extensions/*/out/**/*.js"],
  "preLaunchTask": "analyticsdx-vscode-templates-setup-vscode-integration",
  "internalConsoleOptions": "openOnSessionStart"
}
```

The args are:

- The first parameter is a location to a folder that will serve as
  the workspace to run the tests and should be set to match what your `test:vscode-integration` npm script is
  going to use (normally, `${workspaceRoot}/test-assets/sfdx-simple`).
- `--extensionDevelopmentPath` - This governs what extensions are loaded, and should point to the `.vscode-test/extensions`
  folder under the extension, which is where `link-vscode-integration-dependency` and `install-vsix-dependency` will
  put stuff.
- `--extensionTestsPath` - This governs what tests are actually run. This must be an
  absolute path and cannot be a wildcard. This should be your extensions `out/test/vscode-integration` folder.

For the `preLaunchTask`, this will also require a corresponding entry in `.vscode/tasks.json` to first compile and
run setup-vscode-integration, e.g.:

```json
{
  "label": "analyticsdx-vscode-templates-setup-vscode-integration",
  "command": "npm",
  "type": "shell",
  "presentation": {
    "focus": false,
    "panel": "dedicated"
  },
  "options": {
    "cwd": "${workspaceFolder}/extensions/analyticsdx-vscode-templates"
  },
  "args": ["run", "setup-vscode-integration"],
  "isBackground": false,
  "dependsOn": ["Compile"]
}
```

You can then launch and debug the vscode-integration tests by going to the Debug view, selecting the appropriate
launch target from the drop-down, and hitting the start button (or F5).

### Running through the CLI

To you package.json, you should add a script like:

```json
{
  "scripts": {
    "test:vscode-integration": "npm run setup-vscode-integration && node ../../scripts/run-vscode-integration-tests"
  }
}
```

There are some optional environment variables to configure the test runner:

| Name           | Description                   |
| -------------- | ----------------------------- |
| `CODE_VERSION` | Either 'insiders' or 'stable' |

If you are running this from the top-level root folder, you can issue `npm run test:vscode-integration`.

See VS Code's doc
[site](https://code.visualstudio.com/docs/extensions/testing-extensions#_running-tests-automatically-on-travis-ci-build-machines)
for more information.

### Running the tests against VS Code Insiders

To test your extension with the upcoming version of VS Code, add another entry to your
package.json scripts to run your vscode-integration tests in VS Code - Insiders. The entry
should look like:
`"test:vscode-insiders-integration": "cross-env CODE_VERSION=insiders npm run test:vscode-integration"`

### Running the tests against the generated .vsix's

The methods above run the test against the extensions source folders. To run the tests against the generated
.vsix bundles, you can run `npm run test:vsix-integration` from the top-level folder. This will do a
[`build-all-vsixs`](packaging.md#build-all-vsixs) first, then a regular build, then run `test:vsix-integrations` in
the extensions. (Note: `build-all-vsixes` will do a `git clean` and delete any untracked files, so don't have
any uncommitted or unstashed work when you run it.)

In the extension source folders, you can reuse the `download-vscode-for-tests` and `install-vsix-dependency` scripts to
setup the test vscode instance to point to the generated .vsix files, and the `run-vscode-integration-tests` script to
then run the same vscode integration tests, with script entries in the package.json like:

```json
"setup-vsix-integration": "node ../../scripts/download-vscode-for-tests && node ../../scripts/install-vsix-dependency salesforce.salesforcedx-vscode-core ../analyticsdx-vscode-core/*.vsix ./*.vsix ./analyticsdx-vscode/*.vsix",
"test:vsix-integration": "npm run setup-vsix-integration && node ../../scripts/run-vscode-integration-tests"
```

## <a name="manualtests">Manual Testing</a>

Some testing won't be possible or straight-foward to automate as above, including testing direct UI interaction or
interactions with servers, and will require manual testing.

If the changes have already been published to the
[marketplace](https://marketplace.visualstudio.com/items?itemName=salesforce.analyticsdx-vscode), then just either
install or upgrade the extensions from within VS Code.

Otherwise, you can install the .vsix files from the GitHub build into VS Code:

1. If you have the extensions already installed, either from .vsix files or the marketplace, you should uninstall them
   first:

   1. In VSCode, go to the Extensions tab (**View > Extensions** in the menu)
   1. In the search bar there, enter **@installed analyticsdx-vscode**
   1. For each extension found, click the small gear icon on it and select **Uninstall**
   1. Exit VS Code
   1. In the `.vscode/extensions` in your home directory, remove any `analyticsdx-vscode-*` directories:
      1. On Mac/Linux, you can do: `rm -r ~/.vscode/extensions/salesforce.analyticsdx-vscode-*`
      2. On Windows, you can do: `del /s/q %USERPROFILE%\.vscode\extensions\salesforce.analyticsdx-vscode-*`
   1. Restart VS Code

1. Go to the
   [most recent build](https://github.com/forcedotcom/analyticsdx-vscode/actions?query=workflow%3A%22Build+and+test%22+branch%3Adevelop) that
   has the changes you want, find the `extensions` artifact and download it. It should be a zip file of the .vsix files
   that are the various extensions.

1. Unzip it and install each of the .vsix files; see
   [here for instructions](https://code.visualstudio.com/docs/editor/extension-gallery#_install-from-a-vsix).

1. Restart VS Code and test things out.

If you want to go back to the published extensions, you will need to uninstall the extensions as per step 1 before
installing from the marketplace.
