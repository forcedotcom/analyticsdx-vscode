/*
 * rewritten test runner for integrating code coverage;
 * https://github.com/codecov/example-typescript-vscode-extension
 */
'use strict';

import * as fs from 'fs';
import * as glob from 'glob';
import * as paths from 'path';

// tslint:disable:no-var-requires
const istanbulHookRequire = require('istanbul-lib-hook').hookRequire;
const iLibInstrument = require('istanbul-lib-instrument');
const iLibCoverage = require('istanbul-lib-coverage');
const iLibSourceMaps = require('istanbul-lib-source-maps');
const iLibReport = require('istanbul-lib-report');
const iReports = require('istanbul-reports');
// tslint:disable-next-line:variable-name
const Mocha = require('mocha');

// Linux: prevent a weird NPE when mocha on Linux requires the window size from the TTY
// Since we are not running in a tty environment, we just implementt he method statically
const tty = require('tty');
if (!tty.getWindowSize) {
  tty.getWindowSize = (): number[] => {
    return [80, 75];
  };
}

let mocha = new Mocha({
  ui: 'tdd',
  useColors: true,
  reporter: 'mocha-multi-reporters'
});

function configure(mochaOpts: any): void {
  if (mochaOpts.reporter == null) {
    mochaOpts.reporter = 'mocha-multi-reporters';
  }
  if (!mochaOpts.reporterOptions) {
    let xmlPath = '';
    // There were some oddities on Windows where the mocha execution would be inside the downloaded version of vscode and store the test result file there
    // This will fix the pathing for windows.
    if (process.platform === 'win32') {
      xmlPath = paths.normalize(paths.join(process.cwd(), '..', '..'));
    }
    mochaOpts.reporterOptions = {
      reporterEnabled: 'mocha-junit-reporter, spec',
      mochaJunitReporterReporterOptions: {
        mochaFile: xmlPath
          ? paths.join(xmlPath, 'junit-custom-vscodeIntegrationTests.xml')
          : 'junit-custom-vscodeIntegrationTests.xml'
      }
    };
  }
  mocha = new Mocha(mochaOpts);
}
exports.configure = configure;

function _mkDirIfExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

function _readCoverOptions(testsRoot: string): ITestRunnerOptions | undefined {
  const coverConfigPath = paths.join(testsRoot, '..', '..', '..', '..', '..', 'config', 'coverconfig.json');
  let coverConfig: ITestRunnerOptions | undefined;
  if (fs.existsSync(coverConfigPath)) {
    const configContent = fs.readFileSync(coverConfigPath, 'utf-8');
    coverConfig = JSON.parse(configContent);
  }
  return coverConfig;
}

function run(testsRoot: any, clb: any): any {
  // Enable source map support
  require('source-map-support').install();

  // Read configuration for the coverage file
  const coverOptions: ITestRunnerOptions | undefined = _readCoverOptions(testsRoot);
  let coverageRunner: CoverageRunner | undefined;
  if (coverOptions && coverOptions.enabled) {
    // Setup coverage pre-test, including post-test hook to report
    coverageRunner = new CoverageRunner(coverOptions, testsRoot, clb);
    coverageRunner.setupCoverage();
  }

  // Glob test files
  glob('**/**.test.js', { cwd: testsRoot }, (error, files): any => {
    if (error) {
      console.error('An error occured: ' + error);
      return clb(error);
    }
    try {
      // Fill into Mocha
      files.forEach(
        (f): Mocha => {
          return mocha.addFile(paths.join(testsRoot, f));
        }
      );
      // Run the tests
      let failureCount = 0;

      mocha
        .run((failures: any) => {
          process.on('exit', () => {
            console.log(`Existing test process, code should be ${failureCount}`);
            process.exit(failures); // exit with non-zero status if there were failures
          });
        })
        .on('fail', (test: any, err: any): void => {
          const testName =
            (test.parent && test.parent.fullTitle ? test.parent.fullTitle() + ' ' : '') + (test.title || test);
          console.log(`Failure in test '${testName}': ${err}`);
          failureCount++;
        })
        .on('end', (): void => {
          console.log(`Tests ended with ${failureCount} failure(s)`);
          clb(undefined, failureCount);
          if (coverageRunner) {
            coverageRunner.reportCoverage();
          }
        });
    } catch (error) {
      console.error('An error occured: ', error);
      return clb(error);
    }
  });
}
exports.run = run;

interface ITestRunnerOptions {
  enabled?: boolean;
  relativeCoverageDir: string;
  relativeSourcePath: string;
  ignorePatterns: string[];
  includePid?: boolean;
  reports?: string[];
  verbose?: boolean;
}

declare var global: {
  [key: string]: any; // missing index defintion
};

class CoverageRunner {
  private coverageVar: string = '$$cov_' + new Date().getTime() + '$$';
  private transformer: any = undefined;
  private matchFn: any = undefined;
  private instrumenter: any = undefined;
  private unhookRequire: undefined | (() => void) = undefined;

  constructor(
    private options: ITestRunnerOptions,
    private testsRoot: string,
    errorRunCallback: (error: string) => any
  ) {
    if (!options.relativeSourcePath) {
      return errorRunCallback('Error - relativeSourcePath must be defined for code coverage to work');
    }
  }

  public setupCoverage(): void {
    // Set up Code Coverage, hooking require so that instrumented code is returned
    const self = this;
    self.instrumenter = iLibInstrument.createInstrumenter({
      coverageVariable: self.coverageVar
    });
    const sourceRoot = paths.join(self.testsRoot, self.options.relativeSourcePath);
    // Glob source files
    const srcFiles = glob.sync('**/**.js', {
      cwd: sourceRoot,
      ignore: self.options.ignorePatterns
    });
    // Create a match function - taken from the run-with-cover.js in istanbul.
    const decache = require('decache');
    const fileMap: Record<string, boolean> = {};
    srcFiles.forEach(file => {
      const fullPath = paths.join(sourceRoot, file);
      fileMap[fullPath] = true;

      // On Windows, extension is loaded pre-test hooks and this mean we lose
      // our chance to hook the Require call. In order to instrument the code
      // we have to decache the JS file so on next load it gets instrumented.
      // This doesn"t impact tests, but is a concern if we had some integration
      // tests that relied on VSCode accessing our module since there could be
      // some shared global state that we lose.
      decache(fullPath);
    });

    self.matchFn = (file: string): boolean => !!fileMap[file];
    self.matchFn.files = Object.keys(fileMap);

    // Hook up to the Require function so that when this is called, if any of our source files
    // are required, the instrumented version is pulled in instead. These instrumented versions
    // write to a global coverage variable with hit counts whenever they are accessed
    self.transformer = (code: string, file: string | { filename: string }) => {
      const filename = typeof file === 'string' ? file : file.filename;
      if (!filename) {
        return code;
      }
      // Try to load the source map
      let map = undefined;
      try {
        map = JSON.parse(fs.readFileSync(`${filename}.map`, 'utf-8'));
      } catch (err) {
        console.warn(`Unable to load source map ${filename}.map:`, err);
      }
      return self.instrumenter.instrumentSync(code, filename, map);
    };
    const hookOpts = { verbose: false, extensions: ['.js'] };
    self.unhookRequire = istanbulHookRequire(self.matchFn, self.transformer, hookOpts);

    // initialize the global variable to stop mocha from complaining about leaks
    global[self.coverageVar] = {};

    // Hook the process exit event to handle reporting
    // Only report coverage if the process is exiting successfully
    process.on('exit', (code: any) => {
      self.reportCoverage();
    });
  }

  /**
   * Writes a coverage report. Note that as this is called in the process exit callback, all calls must be synchronous.
   *
   * @returns {void}
   *
   * @memberOf CoverageRunner
   */
  public reportCoverage(): void {
    const self = this;
    self.unhookRequire?.();
    let cov: any;
    if (typeof global[self.coverageVar] === 'undefined' || Object.keys(global[self.coverageVar]).length === 0) {
      console.error('No coverage information was collected, exit without writing coverage information');
      return;
    } else {
      cov = global[self.coverageVar];
    }

    // Files that are not touched by code run by the test runner is manually instrumented, to
    // illustrate the missing coverage.
    self.matchFn.files.forEach((file: string) => {
      if (!cov[file]) {
        self.transformer(fs.readFileSync(file, 'utf-8'), file);
        // since the code is never run, we need to add the empty coverage information manually into
        // the global coverage var for the file
        cov[file] = self.instrumenter.lastFileCoverage();
      }
    });

    const reportingDir = paths.join(self.testsRoot, self.options.relativeCoverageDir);
    const includePid = self.options.includePid;
    const pidExt = includePid ? '-' + process.pid : '';
    const coverageFile = paths.resolve(reportingDir, 'coverage' + pidExt + '.json');

    _mkDirIfExists(reportingDir); // yes, do this again since some test runners could clean the dir initially created

    fs.writeFileSync(coverageFile, JSON.stringify(cov), { encoding: 'utf8' });

    const mapStore = iLibSourceMaps.createSourceMapStore({});
    const coverageMap = iLibCoverage.createCoverageMap(cov);
    return mapStore.transformCoverage(coverageMap).then((transformed: any) => {
      fs.writeFileSync(
        paths.resolve(reportingDir, 'coverage-transformed' + pidExt + '.json'),
        JSON.stringify(transformed),
        { encoding: 'utf8' }
      );

      const context = iLibReport.createContext({
        dir: reportingDir,
        coverageMap: transformed
        // TODO: watermarks
      });

      const reportTypes = self.options.reports instanceof Array ? self.options.reports : ['lcov'];
      reportTypes.forEach(reportType => {
        iReports.create(reportType, { skipEmpty: false }).execute(context);
      });
      console.log(`Coverage reports written to ${reportingDir}`);
    });
  }
}
