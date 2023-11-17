# Salesforce Analytics Extensions for VS Code

[![Build Status](https://github.com/forcedotcom/analyticsdx-vscode/workflows/Build%20and%20test/badge.svg)](https://github.com/forcedotcom/analyticsdx-vscode/actions?query=workflow%3A%22Build+and+test%22+branch%3Adevelop)

<!-- TODO: badges for security and code coverage when we hook those up -->

## Introduction

This repository contains the source code for the Salesforce Analytics Extensions for Visual Studio Code.
These extensions include tools for developing on the Salesforce Analytics platform, including setting up analytics
projects and working with analytics application templates.

Currently, this repository contains source for the following extensions:

- **[analyticsdx-vscode](extensions/analyticsdx-vscode/README.md)**  
  [A top-level extension pack](https://marketplace.visualstudio.com/items?itemName=salesforce.analyticsdx-vscode) that
  automatically installs the extensions below for you.
  ![Installs](https://img.shields.io/visual-studio-marketplace/i/salesforce.analyticsdx-vscode) ![Downloads](https://img.shields.io/visual-studio-marketplace/d/salesforce.analyticsdx-vscode)

- **[analyticsdx-vscode-core](extensions/analyticsdx-vscode-core/README.md)**  
  [This extension](https://marketplace.visualstudio.com/items?itemName=salesforce.analyticsdx-vscode-core) interacts
  with the [Salesforce CLI Analytics Plugin](http://sfdc.co/adx_cli_help)
  to provide analytics commands.  
  ![Installs](https://img.shields.io/visual-studio-marketplace/i/salesforce.analyticsdx-vscode-core) ![Downloads](https://img.shields.io/visual-studio-marketplace/d/salesforce.analyticsdx-vscode-core)

- **[analyticsdx-vscode-templates](extensions/analyticsdx-vscode-templates/README.md)**  
  [This extension](https://marketplace.visualstudio.com/items?itemName=salesforce.analyticsdx-vscode-templates) provides
  editing features for Salesforce analytics application template source files, including validation, hover text,
  code-completion suggestions, quick fixes, and code navigation.  
  ![Installs](https://img.shields.io/visual-studio-marketplace/i/salesforce.analyticsdx-vscode-templates) ![Downloads](https://img.shields.io/visual-studio-marketplace/d/salesforce.analyticsdx-vscode-templates)

## Getting Started

If you are interested in contributing, please take a look at the [contributing doc](CONTRIBUTING.md).

If you are interested in building the extensions locally or publishing to the marketplace, please take a look at the
[packaging doc](contributing/packaging.md).

For information about using the extensions, consult the README.md file for each package.
