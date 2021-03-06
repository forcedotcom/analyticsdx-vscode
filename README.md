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
  automatically installs the following extensions for you.  
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

## Be an Efficient Salesforce Developer with VS Code

Dreamforce 2019 session on the preview features of the analytics extensions:

[Asset Version Management - Taking Control of Einstein Analytics App Development](https://www.youtube.com/watch?v=G0zLdF2JIBU&t=878)

Dreamforce 2018 session on how to use Visual Studio Code and Salesforce Extensions for VS Code:

[Be An Efficient Salesforce Developer with VS Code](https://www.youtube.com/watch?v=hw9LBvjo4PQ)

## Getting Started

If you are interested in contributing, please take a look at the [contributing doc](CONTRIBUTING.md).

If you are interested in building the extensions locally or publishing to the marketplace, please take a look at the
[packaging doc](contributing/packaging.md).

For information about using the extensions, consult the README.md file for each package.
