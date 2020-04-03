/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

const shell = require('shelljs');
shell.set('-e');
shell.set('+v');

const logger = require('./logger-util');

const NODE_VERSION = shell
  .cat('.nvmrc')
  .trim()
  .replace(/^v(.*)/, '$1');

/** Utility methods for validating the current environment setup before doing build/publish operations. */
module.exports = {
  checkVersionTag: nextVersion => {
    const tagName = `v${nextVersion}`;
    const existingTag = shell.exec(`git tag -l ${tagName}`, { silent: true }).stdout.trim();
    if (existingTag !== '') {
      logger.error(`Git tag ${tagName} already exists in repo.`);
      logger.info('Please use a different version # or delete the tag.');
      process.exit(-1);
    }
    return tagName;
  },

  checkVSCodeVersion: () => {
    const nextVersion = process.env['ANALYTICSDX_VSCODE_VERSION'];
    if (!nextVersion || !nextVersion.match(/^(\d+)\.(\d+)\.(\d+)$/)) {
      logger.error("You must set environment variable 'ANALYTICSDX_VSCODE_VERSION'.");
      logger.info("To set: 'export ANALYTICSDX_VSCODE_VERSION=xx.yy.zz'. Where xx.yy.zz is the release number.");
      process.exit(-1);
    }
    return nextVersion;
  },

  checkNodeVersion: () => {
    logger.header(`\nVerifying node version ${NODE_VERSION} is installed.`);
    const [version, major, minor, patch] = process.version.match(/^v(\d+)\.?(\d+)\.?(\*|\d+)$/);
    if (parseInt(major) != NODE_VERSION.split('.')[0] || parseInt(minor) < NODE_VERSION.split('.')[1]) {
      logger.error(`Please update from node version ${process.version} to ${NODE_VERSION}`);
      process.exit(-1);
    }
  },

  checkSalesforcePublisherAccess: () => {
    logger.header('\nVerifying access to the Salesforce publisher.');
    const publishers = shell.exec('vsce ls-publishers', { silent: true }).stdout.trim();
    if (!publishers.includes('salesforce')) {
      logger.error('You do not have access to the salesforce publisher id as part of vsce.');
      logger.info('Either the marketplace token is incorrect or your access to our publisher was removed.');
      process.exit(-1);
    }
  }
};
