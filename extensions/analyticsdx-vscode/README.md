# Salesforce Analytics Extensions for Visual Studio Code

**This extension is in preview. Preview programs are subject to change, and we cannot guarantee acceptance. The feature
isn't generally available unless or until Salesforce announces its general availability in documentation or in press
releases or public statements. We cannot guarantee general availability within any particular time frame or at all.
Make your purchase decisions only on the basis of generally available products and features.**

This extension pack includes tools for developing on the Salesforce Analytics platform. These tools provide features
for setting up analytics projects and working with analytics application templates.

<!-- TODO: screenshot -->

## Prerequisites

Before you set up Salesforce Analytics Extensions for VS Code, make sure that you have these essentials:

- **Salesforce CLI**  
  Before you use Salesforce Extensions for VS Code, [set up Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup).
- **Analytics Plugin for Salesforce CLI**  
  Be sure to [install the Analytics Plugin for the Salesforce CLI](https://help.salesforce.com/articleView?id=bi_cli_analytics_plugin_install.htm&type=5).
- **A Salesforce DX project**  
  Open your Salesforce DX project in a directory that contains an `sfdx-project.json` file. Otherwise, some features won't work.  
  If you don't already have a Salesforce DX project, create one with the **SFDX: Create Project** command
  (for development against scratch orgs) or the **SFDX: Create Project with Manifest** command (for development against
  sandboxes or DE orgs), selecting the `analytics` project template, or otherwise selecting the `DevelopmentWave`
  scratch org feature or enabling analytics in the org.
  Or, see [create a Salesforce DX project](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_workspace_setup.htm)
  for information about setting up a project using Salesforce CLI.
- **[Visual Studio Code](https://code.visualstudio.com/download) v1.38 or later**

<!--

## Documentation

**TBD**

## Open Source

- [GitHub Repository](https://github.com/forcedotcom/analyticsdx-vscode)
- [Project Boards](https://github.com/forcedotcom/analyticsdx-vscode/projects)
- [Issues](https://github.com/forcedotcom/analyticsdx-vscode/issues)

-->

## Bugs and Feedback

To report a bug with this extension or suggest a feature, please open an [issue on GitHub](https://github.com/forcedotcom/sfdx-analytics/issues/new).
Please include your OS and version, Visual Studio Code version, Salesforce Extensions for Visual Studio
Code version, SFDX CLI version (as per `sfdx version`), SFDX CLI plugins' versions (as per `sfdx plugins --core`), and
steps to reproduce.

<!--

To report issues with Salesforce Analytics Extensions for VS Code, open a [bug on GitHub](https://github.com/forcedotcom/analyticsdx-vscode/issues/new?template=Bug_report.md).
If you would like to suggest a feature, create a [feature request on GitHub](https://github.com/forcedotcom/analyticsdx-vscode/issues/new?template=Feature_request.md).

-->

## Included Extensions

The Salesforce Analytics Extension Pack extension installs these extensions:

- [Salesforce Analytics DX CLI Integration](https://marketplace.visualstudio.com/items?itemName=salesforce.analyticsdx-vscode-core)  
  This extension (`analyticsdx-vscode-core`) interacts with Analytics Plugin for Salesforce CLI to provide core functionality.
- [Salesforce Analytics DX - App Templates](https://marketplace.visualstudio.com/items?itemName=salesforce.analyticsdx-vscode-templates)  
  This extension (`analyticsdx-vscode-templates`) provides editing features for Salesforce analytics application template source files.

<!--

---

TBD: SHA256

---

-->

## License

<!-- TODO: remove once the extensions are published, since the marketplace will show this -->

Copyright (c) 2019, Salesforce.com, inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

- Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.

- Neither the name of Salesforce.com nor the names of its contributors may be
  used to endorse or promote products derived from this software without specific
  prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
