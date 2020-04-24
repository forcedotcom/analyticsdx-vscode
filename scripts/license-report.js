#!/usr/bin/env node

/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

// Generate a .csv of the license types of all the dependencies of all of projects/packages (i.e. root folder plus
// lerna package folders)

const fs = require('fs');
const lerna = require('lerna-alias');
const { EOL } = require('os');
const nlf = require('nlf');
const path = require('path');
const { promisify } = require('util');

const findLicenses = promisify(nlf.find);
// this will use lerna.json to calculate the moduleName -> directory for our projects
const basedir = path.normalize(path.join(__dirname, '..'));
const packages = lerna.rollup({ directory: basedir, sourceDirectory: false });
// add the basedir in, too
packages['<root>'] = basedir;

// id -> { id, name, version, repo, directory, license, licenseLocation, usedIn }
const licenses = {};
let dups = 0;

// return [license type, source filepath | undefined] | undefined
function getLicenseInfoFromSource(source, id) {
  if (source && Array.isArray(source.sources) && source.sources.length >= 1) {
    return [
      // try the listed license type value first
      source.sources[0].license ||
        // next, see if nlf parsed a license or readme file to get the license type
        (typeof source.sources[0].names === 'function' && source.sources[0].names() && source.sources[0].names()[0]) ||
        // nlf doesn't parse domutils's LICENSE file right, but github says it's BSD-2-Clause
        (id.startsWith('domutils@') && 'BSD-2-Clause') ||
        // otherwise, we're stumped
        'UNKNOWN',
      // this will be undefined for package.json, otherwise the file it came from
      source.sources[0].filePath
    ];
  }
  return undefined;
}

// licenseData: { id, name, version, repository, directory, licenseSources }
async function addLicense(licenseData, pkg) {
  // ignore any dependency that is one of the lerna projects in the repo (since that's in this repo and covered
  // by the repo's license)
  if (!packages[licenseData.name]) {
    const id = licenseData.id;
    if (!licenses[id]) {
      let licenseInfo = getLicenseInfoFromSource(
        licenseData.licenseSources && licenseData.licenseSources.package,
        id
      ) ||
        getLicenseInfoFromSource(licenseData.licenseSources && licenseData.licenseSources.license, id) ||
        getLicenseInfoFromSource(licenseData.licenseSources && licenseData.licenseSources.readme, id) || ['UNKNOWN'];
      licenses[id] = {
        id: id,
        name: licenseData.name,
        version: licenseData.version,
        // nlf doesn't pull out git repository urls from the package.json, so try to do it ourselves
        repo:
          licenseData.repository && licenseData.repository !== '(none)'
            ? licenseData.repository
            : await findRepository(licenseData.directory).catch(er => {
                console.error(`Error find repository for ${id}:`, er);
                return '(error)';
              }),
        directory: licenseData.directory,
        license: licenseInfo[0],
        licenseLocation: licenseInfo[1] ? path.relative(licenseData.directory, licenseInfo[1]) : 'package.json',
        usedIn: [pkg]
      };
    } else {
      licenses[id].usedIn.push(pkg);
      dups++;
    }
  }
}

async function findRepository(dir) {
  const text = await fs.promises.readFile(path.join(dir, 'package.json'), 'utf-8');
  const json = JSON.parse(text);
  return (json.repository && json.repository.url) || '(missing)';
}

async function gatherAllLicenses() {
  for (const pkg in packages) {
    const dir = packages[pkg];
    console.log(`Scanning ${pkg} (${dir})`);
    const data = await findLicenses({
      directory: dir,
      production: false // false to also include devDependencies
    });
    if (Array.isArray(data)) {
      for (const d of data) {
        await addLicense(d, pkg);
      }
    }
  }
}

function writeCsv() {
  const filepath = path.join(basedir, 'analyticsdx-vscode-license-report.csv');
  console.log(`Writing ${filepath}`);
  const stream = fs.createWriteStream(filepath);
  writeCsvLine(stream, ['Name', 'Version', 'Repository', 'License', 'License Location', 'Used In']);
  for (const id of Object.keys(licenses).sort((a, b) => a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase()))) {
    const data = licenses[id];
    writeCsvLine(stream, [
      data.name,
      data.version,
      data.repo,
      data.license,
      data.licenseLocation,
      data.usedIn.join(' ')
    ]);
  }
  stream.close();
}

function writeCsvLine(stream, values) {
  for (let i = 0; i < values.length; i++) {
    if (i !== 0) {
      stream.write(',');
    }
    if (values[i]) {
      if (values[i].indexOf(',') >= 0) {
        stream.write(`"${values[i]}"`);
      } else {
        stream.write(values[i]);
      }
    }
  }
  stream.write(EOL);
}

gatherAllLicenses()
  .then(() => {
    console.log(`Found ${Object.keys(licenses).length} unique package licenses (${dups} duplicates)`);
    writeCsv();
  })
  .catch(console.error);
