# 0.7.0

## Added

- Add **SFDX: Create Analytics Dashboard LWC** command.
- Support dashboard components in templates.

## Fixed

- Fixed telemetry for commands.
- Use unique output name for command output.
- Show output view on error from commands.

# 0.6.1

## Added

- Added field for live datasets in templates pilot.

# 0.6.0

## Added

- Show error on empty template-info.json file.

## Fixed

- Removed direct dependency on salesforcedx-vscode-core extension activation, to avoid possible startup error in
  vscode 1.55+.
- Fixed telemetry.

# 0.5.0

## Added

- Show warnings on duplicate asset names and labels in templates.
- Support **SFDX: Open App in Analytics Studio** and **SFDX: Open Analytics Data Manager** commands when running in
  Remote Development mode.
- Add **SFDX: Update Analytics Template From App** command.
- Support embedded app templates in commands.

## Fixed

- Fix **SFDX: Update Template** to correctly not show templates that were decoupled from their source app.
- Show loading and no available items messages in template and app pickers from commands.
- Support nulls in folder.json in templates.

# 0.4.0

## Added

- Updates for template features in Winter '21 release.

# 0.3.1

## Fixed

- Fixed analytics json language services to work in vscode 1.47+.

# 0.3.0

## Added

- Code-completions for adding new variables in variableDefinition files in templates.
- More validation and quick fixes around embedded apps templates.

# 0.2.1

## Fixed

- Telemetry bug fix and README updates.

# 0.2.0

## Added

- **SFDX: Create Analytics App From Template** command.
- Prompt to install or upgrade [analytics sfdx cli plugin](http://sfdc.co/adx_cli_help) on startup.
- **SFDX: Open Analytics Data Manager** command.

## Fixed

- Cleanup hover text in analytics templates files.
- Lazily start analytics template lanauge client, when first template file is opened.
- **SFDX: Open Analytics Studio** commands now works in Visual Studio Codespaces.

# 0.1.0

Initial preview release.
