# Salesforce Analytics Extensions for Visual Studio Code

This extension pack includes tools for developing on the Salesforce Analytics platform, including setting up analytics
projects and working with analytics application templates.

<!-- TODO: screenshot -->

## Prerequisites

Before you set up Salesforce Analytics Extensions for VS Code, make sure that you have these essentials:

- **Salesforce CLI**  
  Before you use Salesforce Extensions for VS Code, [set up Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup).
- **Analytics Plugin for Salesforce CLI**  
  Be sure to [install the Analytics Plugin for the Salesforce CLI](https://help.salesforce.com/articleView?id=bi_cli_analytics_plugin_install.htm&type=5).
- **[Visual Studio Code](https://code.visualstudio.com/download) v1.74 or later**
- **Salesforce Extension Pack**
  Install the [Salesforce Extension Pack](https://marketplace.visualstudio.com/items?itemName=salesforce.salesforcedx-vscode) from the VS Code Extensions Marketplace.
- **A Salesforce DX project**  
  Open your Salesforce DX project in a directory that contains an `sfdx-project.json` file. Otherwise, some features won't work.  
  If you don't already have a Salesforce DX project, create one with the **SFDX: Create Project** command
  (for development against scratch orgs) or the **SFDX: Create Project with Manifest** command (for development against
  sandboxes or DE orgs), selecting the `analytics` project template, or otherwise selecting the `DevelopmentWave`
  scratch org feature or enabling analytics in the org.
  Or, see [create a Salesforce DX project](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_workspace_setup.htm)
  for information about setting up a project using Salesforce CLI.

## Open Source

- [Issues](https://github.com/forcedotcom/analyticsdx-vscode/issues)
- [Project Boards](https://github.com/forcedotcom/analyticsdx-vscode/projects)
- [GitHub Repository](https://github.com/forcedotcom/analyticsdx-vscode)

## Bugs and Feedback

To report issues with the Salesforce Analytics Extensions for VS Code, open a [bug on GitHub](https://github.com/forcedotcom/analyticsdx-vscode/issues/new?template=Bug_report.md).
If you would like to suggest a feature, create a [feature request on GitHub](https://github.com/forcedotcom/analyticsdx-vscode/issues/new?template=Feature_request.md).

## Included Extensions

The Salesforce Analytics Extension Pack extension installs these extensions:

- [Salesforce Analytics CLI Integration](https://marketplace.visualstudio.com/items?itemName=salesforce.analyticsdx-vscode-core)  
  This extension (`salesforce.analyticsdx-vscode-core`) interacts with the Analytics Plugin for Salesforce CLI to provide core functionality.
- [Salesforce Analytics - App Templates](https://marketplace.visualstudio.com/items?itemName=salesforce.analyticsdx-vscode-templates)  
  This extension (`salesforce.analyticsdx-vscode-templates`) provides editing features for Salesforce analytics application template source files.

---

Currently, Visual Studio Code extensions are not signed or verified on the Microsoft Visual Studio Code Marketplace. Salesforce provides the Secure Hash Algorithm (SHA) of each extension that we publish. Consult [Manually Verify the analyticsdx-vscode Extensions' Authenticity](https://github.com/forcedotcom/analyticsdx-vscode/blob/develop/SHA256.md) to learn how to verify the extensions.

---
