/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'fs';
import { findNodeAtLocation, JSONPath, Node as JsonNode } from 'jsonc-parser';
// have to import this way w/o doing esModuleInterop=true, since that breaks on other stuff
import isEqual = require('lodash.isequal');
import { posix as path } from 'path';
import * as fspath from 'path';
import { getErrorStatusDescription, xhr, XHRResponse } from 'request-light';
import * as vscode from 'vscode';
import {
  CloseAction,
  DidChangeConfigurationNotification,
  DocumentRangeFormattingParams,
  DocumentRangeFormattingRequest,
  ErrorAction,
  InitializeError,
  LanguageClientOptions,
  Message,
  NotificationType,
  RequestType,
  ResponseError
} from 'vscode-languageclient';
import { LanguageClient, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import {
  AutoInstallVariableCodeActionProvider,
  AutoInstallVariableCompletionItemProviderDelegate,
  AutoInstallVariableDefinitionProvider,
  AutoInstallVariableHoverProvider
} from './autoInstall';
import {
  csvFileFilter,
  htmlFileFilter,
  imageFileFilter,
  jsonFileFilter,
  TEMPLATE_INFO,
  TEMPLATE_JSON_LANG_ID
} from './constants';
import { telemetryService } from './telemetry';
import { CreateFolderShareCodeActionProvider, CreateRelPathFileCodeActionProvider } from './templateInfo/actions';
import {
  UiVariableCodeActionProvider,
  UiVariableCompletionItemProviderDelegate,
  UiVariableDefinitionProvider,
  UiVariableHoverProvider
} from './ui';
import { RemoveJsonPropertyCodeActionProvider } from './util/actions';
import { JsonCompletionItemProvider, newRelativeFilepathDelegate } from './util/completions';
import { JsonAttributeRelFilePathDefinitionProvider } from './util/definitions';
import { Disposable } from './util/disposable';
import { matchJsonNodesAtPattern } from './util/jsoncUtils';
import { Logger, PrefixingOutputChannel } from './util/logger';
import { findTemplateInfoFileFor } from './util/templateUtils';
import { isValidRelpath } from './util/utils';
import {
  clearDiagnosticsUnder,
  createRelPathDocumentSelector,
  isSameUri,
  isUriAtOrUnder,
  isUriUnder,
  uriBasename,
  uriDirname,
  uriRelPath,
  uriStat
} from './util/vscodeUtils';
import { NewVariableCompletionItemProviderDelegate, VariableHoverProvider } from './variables';

function templateJsonFileFilter(s: string) {
  return jsonFileFilter(s) && s !== 'template-info.json';
}

/** Wraps the setup for configuring editing for the files in a template directory. */
export class TemplateDirEditing extends Disposable {
  /** A hashkey for checking for equality between different instances. */
  public readonly key: string;

  private _folderDefinitionPath: string | undefined;
  private _autoInstallDefinitionPath: string | undefined;
  private _uiDefinitionPath: string | undefined;
  private _variablesDefinitionPath: string | undefined;
  private _rulesDefinitionPaths: Set<string> | undefined;

  constructor(public readonly dir: vscode.Uri) {
    super();
    // right now, this only configures things based on schema and filepath, so only key on those
    this.key = TemplateDirEditing.key(dir);
  }

  private getRelFilePathFromAttr(tree: JsonNode | undefined, ...attrPath: JSONPath) {
    const node = tree ? findNodeAtLocation(tree, attrPath) : undefined;
    return node && node.type === 'string' ? (node.value as string) : undefined;
  }

  private getRelFilePathsFromPattern(tree: JsonNode | undefined, ...pattern: JSONPath) {
    if (tree) {
      return matchJsonNodesAtPattern(tree, pattern)
        .filter(node => node.type === 'string' && node.value)
        .map(node => node.value as string);
    }
    return undefined;
  }

  /** Set the json tree for the template-info.json in this directory.
   * This will typically come from the linter.
   * @return true if the tree changed any values used for configuring editing.
   */
  public setParsedTemplateInfo(tree: JsonNode | undefined): boolean {
    let updated = false;
    // pull out the various fields that point to other files so we can use them to configure json-schemas later
    let path = this.getRelFilePathFromAttr(tree, 'folderDefinition');
    if (path !== this._folderDefinitionPath) {
      this._folderDefinitionPath = path;
      updated = true;
    }

    path = this.getRelFilePathFromAttr(tree, 'autoInstallDefinition');
    if (path !== this._autoInstallDefinitionPath) {
      this._autoInstallDefinitionPath = path;
      updated = true;
    }

    path = this.getRelFilePathFromAttr(tree, 'uiDefinition');
    if (path !== this._uiDefinitionPath) {
      this._uiDefinitionPath = path;
      updated = true;
    }

    path = this.getRelFilePathFromAttr(tree, 'variableDefinition');
    if (path !== this._variablesDefinitionPath) {
      this._variablesDefinitionPath = path;
      updated = true;
    }

    const paths = new Set(this.getRelFilePathsFromPattern(tree, 'rules', '*', 'file'));
    path = this.getRelFilePathFromAttr(tree, 'ruleDefinition');
    if (path) {
      paths.add(path);
    }
    if (!isEqual(paths, this._rulesDefinitionPaths)) {
      this._rulesDefinitionPaths = paths;
      updated = true;
    }

    // TODO: pull out other rel-paths from template-info
    return updated;
  }

  get folderDefinitionPath() {
    return this._folderDefinitionPath;
  }

  get autoInstallDefinitionPath() {
    return this._autoInstallDefinitionPath;
  }
  /** Tell if the specified file uri corresponds to our autoInstallDefinition path. */
  public isAutoInstallDefinitionFile(file: vscode.Uri): boolean {
    return (
      isUriUnder(this.dir, file) &&
      !!this.autoInstallDefinitionPath &&
      isValidRelpath(this.autoInstallDefinitionPath) &&
      isSameUri(uriRelPath(this.dir, this.autoInstallDefinitionPath), file)
    );
  }

  get uiDefinitionPath() {
    return this._uiDefinitionPath;
  }

  /** Tell if the specified file uri corresponds to our uiDefinition path. */
  public isUiDefinitionFile(file: vscode.Uri): boolean {
    return (
      isUriUnder(this.dir, file) &&
      !!this.uiDefinitionPath &&
      isValidRelpath(this.uiDefinitionPath) &&
      isSameUri(uriRelPath(this.dir, this.uiDefinitionPath), file)
    );
  }

  get variablesDefinitionPath() {
    return this._variablesDefinitionPath;
  }

  /** Tell if the specified file uri corresponds to our variableDefinition path. */
  public isVariablesDefinitionFile(file: vscode.Uri): boolean {
    return (
      isUriUnder(this.dir, file) &&
      !!this.variablesDefinitionPath &&
      isValidRelpath(this.variablesDefinitionPath) &&
      isSameUri(uriRelPath(this.dir, this.variablesDefinitionPath), file)
    );
  }

  get rulesDefinitionPaths() {
    return this._rulesDefinitionPaths;
  }

  public static key(dir: vscode.Uri) {
    // right now, this only configures things based on schema and filepath, so only key on those
    return dir.scheme + ':' + dir.path;
  }

  public start(): this {
    const templateInfoSelector = createRelPathDocumentSelector(this.dir, 'template-info.json');
    // hook up additional code-completions for template-info.json
    const fileCompleter = new JsonCompletionItemProvider(
      // locations that support *.json fies:
      newRelativeFilepathDelegate({
        isSupportedLocation: l => !l.isAtPropertyKey && TEMPLATE_INFO.jsonRelFilePathLocationPatterns.some(l.matches),
        filter: templateJsonFileFilter
      }),
      // attributes that should have html paths
      newRelativeFilepathDelegate({
        isSupportedLocation: l => !l.isAtPropertyKey && TEMPLATE_INFO.htmlRelFilePathLocationPatterns.some(l.matches),
        filter: htmlFileFilter
      }),
      // attribute that should point to images
      newRelativeFilepathDelegate({
        isSupportedLocation: l => !l.isAtPropertyKey && TEMPLATE_INFO.imageRelFilePathLocationPatterns.some(l.matches),
        filter: imageFileFilter
      }),
      // the file in externalFiles should be a .csv
      newRelativeFilepathDelegate({
        isSupportedLocation: l => !l.isAtPropertyKey && TEMPLATE_INFO.csvRelFilePathLocationPatterns.some(l.matches),
        filter: csvFileFilter
      })
    );
    this.disposables.push(vscode.languages.registerCompletionItemProvider(templateInfoSelector, fileCompleter));

    // hook up Go To/Peek Defintion for relative-path fields in template-info.json
    const defProvider = new JsonAttributeRelFilePathDefinitionProvider(TEMPLATE_INFO.allRelFilePathLocationPatterns);
    this.disposables.push(vscode.languages.registerDefinitionProvider(templateInfoSelector, defProvider));

    // hook up quick fixes for deprecated elements that can simply be removed as a fix
    const deprecatedFieldsActionsProvider = new RemoveJsonPropertyCodeActionProvider(
      ['icons', 'templateDetail'],
      ['ruleDefinition'],
      ['assetIcon'],
      ['templateIcon']
    );
    this.disposables.push(
      vscode.languages.registerCodeActionsProvider(templateInfoSelector, deprecatedFieldsActionsProvider, {
        providedCodeActionKinds: RemoveJsonPropertyCodeActionProvider.providedCodeActionKinds
      }),
      // and quick fixes for creating missing relative-path files
      vscode.languages.registerCodeActionsProvider(templateInfoSelector, new CreateRelPathFileCodeActionProvider(), {
        providedCodeActionKinds: CreateRelPathFileCodeActionProvider.providedCodeActionKinds
      }),
      // and quick fixes for embeddedapps w/o shares
      vscode.languages.registerCodeActionsProvider(templateInfoSelector, new CreateFolderShareCodeActionProvider(), {
        providedCodeActionKinds: CreateFolderShareCodeActionProvider.providedCodeActionKinds
      })
    );

    // hookup editing support for the other template file types and operations here
    const relatedFileSelector = createRelPathDocumentSelector(this.dir, '**', '*.json');

    this.disposables.push(
      // hookup Go To Definition from variable name in ui.json to variables.json
      vscode.languages.registerDefinitionProvider(relatedFileSelector, new UiVariableDefinitionProvider(this)),
      // hookup Go To Definition from varaibles name in auto-install.json to variables.json
      vscode.languages.registerDefinitionProvider(relatedFileSelector, new AutoInstallVariableDefinitionProvider(this)),

      vscode.languages.registerCompletionItemProvider(
        relatedFileSelector,
        new JsonCompletionItemProvider(
          // hookup code-completion for variables names in page in ui.json's
          new UiVariableCompletionItemProviderDelegate(this),
          // hoookup compeltions for variables in appConfiguration.values
          new AutoInstallVariableCompletionItemProviderDelegate(this),
          // hookup completions for new variable definitions in variables.json's
          new NewVariableCompletionItemProviderDelegate(this)
        )
      ),

      // hookup quick fixes for variable names in ui.json's
      vscode.languages.registerCodeActionsProvider(relatedFileSelector, new UiVariableCodeActionProvider(this), {
        providedCodeActionKinds: UiVariableCodeActionProvider.providedCodeActionKinds
      }),

      // hookup quick fixes for variable names in auto-install.json's
      vscode.languages.registerCodeActionsProvider(
        relatedFileSelector,
        new AutoInstallVariableCodeActionProvider(this),
        {
          providedCodeActionKinds: AutoInstallVariableCodeActionProvider.providedCodeActionKinds
        }
      ),

      // hookup hover text
      vscode.languages.registerHoverProvider(relatedFileSelector, new UiVariableHoverProvider(this)),
      // REVIEWME: make a multi-proxy hover provider so there's only 1 registration?
      vscode.languages.registerHoverProvider(relatedFileSelector, new VariableHoverProvider(this)),
      vscode.languages.registerHoverProvider(relatedFileSelector, new AutoInstallVariableHoverProvider(this))
    );

    return this;
  }

  /** Tell if our directory is the same as or underneath the specified directory. */
  public isAtOrUnder(uri: vscode.Uri): boolean {
    return isUriAtOrUnder(uri, this.dir);
  }
}

interface ISchemaAssociations {
  [pattern: string]: string[];
}

/** Configure editing support for template files as they're opened. */
export class TemplateEditingManager extends Disposable {
  private templateDirs = new Map<string, TemplateDirEditing>();
  private languageClient: TemplateJsonLanguageClient | undefined;

  private readonly extensionPath: string;
  public readonly baseSchemaPath: vscode.Uri;
  public readonly templateInfoSchemaPath: vscode.Uri;
  public readonly folderSchemaPath: vscode.Uri;
  public readonly autoInstallSchemaPath: vscode.Uri;
  public readonly uiSchemaPath: vscode.Uri;
  public readonly variablesSchemaPath: vscode.Uri;
  public readonly rulesSchemaPath: vscode.Uri;

  private readonly logger: Logger;

  constructor(context: vscode.ExtensionContext, output?: vscode.OutputChannel) {
    super();
    this.extensionPath = context.extensionPath;
    const schemasPath = 'node_modules/analyticsdx-template-lint/out/src/schemas';
    // TODO: warn if any of the schemas are missing
    this.baseSchemaPath = vscode.Uri.file(context.asAbsolutePath(`${schemasPath}/adx-template-json-base-schema.json`));
    this.templateInfoSchemaPath = vscode.Uri.file(context.asAbsolutePath(`${schemasPath}/template-info-schema.json`));
    this.folderSchemaPath = vscode.Uri.file(context.asAbsolutePath(`${schemasPath}/folder-schema.json`));
    this.autoInstallSchemaPath = vscode.Uri.file(context.asAbsolutePath(`${schemasPath}/auto-install-schema.json`));
    this.uiSchemaPath = vscode.Uri.file(context.asAbsolutePath(`${schemasPath}/ui-schema.json`));
    this.variablesSchemaPath = vscode.Uri.file(context.asAbsolutePath(`${schemasPath}/variables-schema.json`));
    this.rulesSchemaPath = vscode.Uri.file(context.asAbsolutePath(`${schemasPath}/rules-schema.json`));
    this.logger = Logger.from(output);
  }

  public dispose() {
    super.dispose();
    this.languageClient = undefined;
    // also dispose all the current active editing setups
    this.templateDirs.forEach(Disposable.safeDispose);
  }

  public start(): this {
    // listen for files being opened, to setup template editing if they're a template file
    this.disposables.push(vscode.workspace.onDidOpenTextDocument(doc => this.opened(doc)));

    // listen for template directories being deleted, we have to listen to everything since, if a parent directory
    // is deleted, you just get 1 callback for the parent directory, so we have to do some calculations to determine
    // if a template folder's folder (or higher) was deleted
    const watcher = vscode.workspace.createFileSystemWatcher('**', true, true, false);
    watcher.onDidDelete(uri => this.deleted(uri));
    this.disposables.push(watcher);

    vscode.workspace.textDocuments.forEach(doc => this.opened(doc));

    return this;
  }

  // start our language client and server, if it's not started yet
  private startLanguageClient() {
    if (!this.languageClient) {
      this.languageClient = new TemplateJsonLanguageClient(this.extensionPath, this.logger, () =>
        this.getSchemaAssociations()
      );
      this.disposables.push(this.languageClient.start());
    }
  }

  public has(dir: vscode.Uri): boolean {
    return this.templateDirs.has(TemplateDirEditing.key(dir));
  }

  public setParsedTemplateInfo(dir: vscode.Uri, tree: JsonNode | undefined) {
    const editing = this.templateDirs.get(TemplateDirEditing.key(dir));
    if (editing && editing.setParsedTemplateInfo(tree)) {
      this.updateSchemaAssociations();
    }
  }

  private startEditing(dir: vscode.Uri): boolean {
    // setup editing for that folder if we haven't yet
    const editing = new TemplateDirEditing(dir);
    if (!this.templateDirs.has(editing.key)) {
      this.logger.log(`Configuring editing for ${dir.toString()}`);
      this.templateDirs.set(editing.key, editing.start());
      this.updateSchemaAssociations();
      telemetryService.sendTemplateEditingConfigured(dir).catch();
      return true;
    }
    return false;
  }

  private stopEditing(dirOrKey: vscode.Uri | string): boolean {
    const key = typeof dirOrKey === 'string' ? dirOrKey : TemplateDirEditing.key(dirOrKey);
    const editing = this.templateDirs.get(key);
    if (editing) {
      this.logger.log(`Stopping editing for ${editing.dir.toString()}`);
      this.templateDirs.delete(key);
      editing.dispose();
      this.updateSchemaAssociations();
      // REVIEWME: reset documentLangId on any adxjson open documents
      return true;
    }
    return false;
  }

  private async opened(doc: vscode.TextDocument) {
    // if they open a file under a template's directory
    const templateInfoFile = await findTemplateInfoFileFor(doc.uri);
    if (templateInfoFile) {
      const dir = uriDirname(templateInfoFile);
      this.startEditing(dir);
      // if it's a json-ish file, be sure to start our language server
      if (doc.languageId === 'json' || doc.languageId === 'jsonc' || doc.languageId === TEMPLATE_JSON_LANG_ID) {
        this.startLanguageClient();
        // and switch it to our our language id
        if (doc.languageId !== TEMPLATE_JSON_LANG_ID) {
          vscode.languages.setTextDocumentLanguage(doc, TEMPLATE_JSON_LANG_ID);
        }
      }
    }
  }

  private deleted(uri: vscode.Uri) {
    const basename = uriBasename(uri);
    const diagnosticCollection = this.languageClient?.diagnosticCollection;
    if (basename === 'template-info.json') {
      const dir = uriDirname(uri);
      this.stopEditing(dir);
      if (diagnosticCollection) {
        clearDiagnosticsUnder(diagnosticCollection, dir);
      }
    } else {
      // if the uri is a folder and it's a template folder, or the ancestor of any started template folders
      // Note: we can't stat the uri since it doesn't exist anymore, so we need to just use the uri path to see if any
      // of our registered template uri paths start with that path, which should be safe enough
      this.templateDirs.forEach(editing => {
        if (editing.isAtOrUnder(uri)) {
          this.stopEditing(editing.key);
          if (diagnosticCollection) {
            clearDiagnosticsUnder(diagnosticCollection, editing.dir);
          }
        }
      });
    }
  }

  public getSchemaAssociations(): ISchemaAssociations {
    const associations: ISchemaAssociations = {};
    // for each template, find the related file paths and configure them with the right json-schema.
    this.templateDirs.forEach(editing => {
      if (editing.dir.scheme === 'file') {
        this.addRelpathSchemaAssociation(
          associations,
          this.folderSchemaPath,
          editing.dir,
          editing.folderDefinitionPath
        );

        this.addRelpathSchemaAssociation(
          associations,
          this.autoInstallSchemaPath,
          editing.dir,
          editing.autoInstallDefinitionPath
        );

        this.addRelpathSchemaAssociation(associations, this.uiSchemaPath, editing.dir, editing.uiDefinitionPath);

        this.addRelpathSchemaAssociation(
          associations,
          this.variablesSchemaPath,
          editing.dir,
          editing.variablesDefinitionPath
        );

        editing.rulesDefinitionPaths?.forEach(filePath => {
          this.addRelpathSchemaAssociation(associations, this.rulesSchemaPath, editing.dir, filePath);
        });

        // TODO: get other associated files from the template-info.json
      }
    });
    // this is a fixed name pattern so we can just do it once
    associations['**/template-info.json'] = [this.templateInfoSchemaPath.toString()];
    // apply the base schema to all adx-template-json files (which is all json files in a template folder)
    associations['**'] = [this.baseSchemaPath.toString()];
    return associations;
  }

  private addRelpathSchemaAssociation(
    associations: ISchemaAssociations,
    schema: vscode.Uri,
    dir: vscode.Uri,
    relpath: string | undefined
  ) {
    if (relpath && isValidRelpath(relpath) && relpath !== 'template-info.json') {
      associations[path.join(dir.path, relpath)] = [schema.toString()];
    }
  }

  private updateSchemaAssociations() {
    if (this.languageClient) {
      // REVIEWME: should we debounce this call?
      // this is called on every file open and edit, including for every initial open file, which could queue up
      // a bunch of these in a row, when we only care about the last one.
      this.languageClient.updateSchemaAssociations();
    }
  }
}

/* Custom json language server and client stuff.
 * This is mostly based off of the json-language-features client code
 * (https://github.com/microsoft/vscode/blob/main/extensions/json-language-features/client/src/jsonClient.ts).
 * Because there is no public api to dynamically associate a json-schema to a file, we need to do it ourselves.
 * This will start a vscode-json-languageserver, but will configure a custom language client, where we can dynamically
 * send up file -> json-schema associations for the various file paths specified in a template-info.json.
 * This is bound to the adx-template-json languageId, so it shouldn't interfer with regular json files.
 */
namespace VSCodeContentRequest {
  export const type: RequestType<string, string, any> = new RequestType('vscode/content');
}
namespace SchemaContentChangeNotification {
  export const type: NotificationType<string> = new NotificationType('json/schemaContent');
}
namespace SchemaAssociationNotification {
  export const type: NotificationType<ISchemaAssociations> = new NotificationType('json/schemaAssociations');
}

function getFormattingOptions(orig: vscode.FormattingOptions): vscode.FormattingOptions {
  const editor = vscode.workspace.getConfiguration('editor');
  // pass in null for the resource to get the languageId section as-is, since we're going to do the computing
  // of the values here, and you get a runtime warning if you leave it off
  const json = vscode.workspace.getConfiguration('[json]', null);
  const adx = vscode.workspace.getConfiguration(`[${TEMPLATE_JSON_LANG_ID}]`, null);

  // look for values first in [adx-template-json], then optionally in [json], and finally in the default editor values;
  // the first value actually set is used
  function getEditorOption<T>(basename: string, def: T, includeJson?: boolean): T;
  function getEditorOption<T>(basename: string, def: undefined, includeJson?: boolean): T | undefined;
  function getEditorOption<T>(basename: string, def: T | undefined, includeJson = true): T | undefined {
    // have to do direct access for [json] and [adx-template-json], since .get() splits up .-seperated names
    let val: T | undefined = adx[`editor.${basename}`];
    if (val === undefined) {
      if (includeJson) {
        val = json[`editor.${basename}`];
      }
      if (val === undefined) {
        val = editor.get<T>(basename);
      }
    }
    return val !== undefined ? val : def;
  }

  // if they have detectIndentation set to true, then just use whatever was passed in, which should be the
  // detected information.
  // only look for it in the [adx-template-json] and default editor sections, since that's where vscode will only
  // look  when calculating the default formatting options.
  const detect = getEditorOption<boolean>('detectIndentation', undefined, false);
  if (detect === true) {
    return orig;
  }

  return {
    // vscode-languageclient's asFormattingOptions() currently only looks at these values,
    // and vscode-json-languageservice will only look for those (to eventually pass into jsonc-parser's format()
    // function)
    insertSpaces: getEditorOption<boolean>('insertSpaces', orig.insertSpaces),
    tabSize: getEditorOption<number>('tabSize', orig.tabSize)
  };
}

class TemplateJsonLanguageClient extends Disposable {
  private languageClient: LanguageClient | undefined;
  private clientReady = false;

  private readonly langOutputChannel: PrefixingOutputChannel;

  /** Constructor.
   * @param extensionPath the base path of this template extension, used to be find vscode-json-languageserver
   * @param logger a logger for log messages, this will be wrapped
   * @param getSchemaAssociations supplier of the file->json-schema associations, this will be invoked when
   *        then language server and client is ready, as well as from updateSchemaAssociations().
   */
  constructor(
    private readonly extensionPath: string,
    logger: Logger,
    private readonly getSchemaAssociations: () => ISchemaAssociations
  ) {
    super();
    this.langOutputChannel = new PrefixingOutputChannel(logger, 'JSON Language Server');
  }

  public dispose() {
    super.dispose();
    this.languageClient = undefined;
    this.clientReady = false;
  }

  public get diagnosticCollection(): vscode.DiagnosticCollection | undefined {
    return this.languageClient?.diagnostics;
  }

  public start(): this {
    // find the vscode-json-languageserver module's main js module
    const serverPath = fspath.join(this.extensionPath, 'node_modules', 'vscode-json-languageserver');
    const serverMain = this.readJSONFile(fspath.join(serverPath, 'package.json')).main;
    const serverModule = fspath.join(serverPath, serverMain);
    // serverModule should then be like '.../out/jsonServerMain', so the actual file will be jsonServerMain.js -- make
    // sure it exists, since we will not get an relevant error message on the callbacks if it doesn't
    if (!fs.existsSync(serverModule + '.js') && !fs.existsSync(serverModule)) {
      this.langOutputChannel.appendLine(`vscode-json-languageserver main module unavailable: ${serverModule}`);
      this.langOutputChannel.appendLine('Some template editing features will be unavailable');
      vscode.window.showWarningMessage(
        'Failed to load vscode-json-languageserver module, some template editing features will be unavailable.'
      );
      return this;
    }

    const serverOptions: ServerOptions = {
      run: { module: serverModule, transport: TransportKind.ipc },
      debug: {
        module: serverModule,
        transport: TransportKind.ipc,
        options: { execArgv: ['--nolazy', '--inspect=' + (9000 + Math.round(Math.random() * 10000))] }
      }
    };

    // Register for our language id
    const documentSelector = [TEMPLATE_JSON_LANG_ID];
    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
      documentSelector,
      outputChannel: this.langOutputChannel,
      traceOutputChannel: this.langOutputChannel,
      initializationFailedHandler: (error: ResponseError<InitializeError> | Error | any) => {
        this.langOutputChannel.appendLine('Initialization failed: ' + (error.message || error));
        return false;
      },
      errorHandler: {
        error: (error: Error, message: Message, count: number) => {
          this.langOutputChannel.appendLine(`Error (#${count}): ${error.message}`);
          return ErrorAction.Continue;
        },
        closed: () => {
          this.langOutputChannel.appendLine('Connection closed');
          return CloseAction.DoNotRestart;
        }
      },
      diagnosticCollectionName: TEMPLATE_JSON_LANG_ID,
      initializationOptions: {
        // language server only loads file-URI. Fetching schemas with other protocols ('http'...) are made on the client.
        handledSchemaProtocols: ['file'],
        // don't provide a default formatter, we'll wire it up ourselves so we can configure the options
        provideFormatter: false,
        customCapabilities: { rangeFormatting: { editLimit: 1000 } }
      },
      synchronize: {
        configurationSection: ['http'],
        fileEvents: vscode.workspace.createFileSystemWatcher('**/*.json')
      },
      uriConverters: {
        // Workaround for https://github.com/Microsoft/vscode-languageserver-node/issues/105 on windows
        code2Protocol: (value: vscode.Uri) => {
          if (/^win32/.test(process.platform)) {
            // The *first* : is also being encoded which is not the standard for URI on Windows
            // Here we transform it back to the standard way
            return value.toString().replace('%3A', ':');
          } else {
            return value.toString();
          }
        },
        protocol2Code: (value: string) => {
          return vscode.Uri.parse(value);
        }
      },
      middleware: {
        workspace: {
          // if the configuration changes (from configurationSection above), send those to the language server
          didChangeConfiguration: () => {
            const httpSettings = vscode.workspace.getConfiguration('http');
            const settings = {
              http: {
                proxy: httpSettings.get('proxy'),
                proxyStrictSSL: httpSettings.get('proxyStrictSSL')
              }
            };
            this.languageClient!.sendNotification(DidChangeConfigurationNotification.type, { settings });
          }
        },
        handleDiagnostics: (uri, diagnostics, next) => {
          // only add the diagnostic if the file still exists (to handle the case of the file's folder was deleted
          // while the lang-server was computing the diagnostics, so we don't have dangling diagnostics).
          // we have to do it here, since we can't control the creation of the diagnosticCollection (only the name).
          uriStat(uri)
            .then(stat => {
              if (stat) {
                // json schema diagnostics seem to come through w/ no source, so set it to the language (which json
                // format diagnostics do)
                diagnostics.forEach(d => (d.source ??= TEMPLATE_JSON_LANG_ID));
                next(uri, diagnostics);
              }
            })
            .catch(console.error);
        }
      }
    };

    this.clientReady = false;
    this.langOutputChannel.appendLine(`Starting language server from ${serverModule}`);
    const hrstart = process.hrtime();
    const client = new LanguageClient(
      TEMPLATE_JSON_LANG_ID,
      'ADX Templates JSON Language Server',
      serverOptions,
      clientOptions
    );
    try {
      client.registerProposedFeatures();
    } catch (e) {
      // don't fail the startup if it fails, just warn in the output channel
      this.langOutputChannel.appendLine(
        'Unable to register proposed language features: ' + ((e as Error)?.message || e)
      );
      if (e instanceof Error && e.stack) {
        this.langOutputChannel.appendLine(e.stack);
      }
    }

    // start the client & server
    this.disposables.push(client.start());
    client
      .onReady()
      .then(() => {
        const schemaDocuments: { [uri: string]: boolean } = {};

        // handle content request
        client.onRequest(VSCodeContentRequest.type, (uriPath: string) => {
          const uri = vscode.Uri.parse(uriPath);
          if (uri.scheme !== 'http' && uri.scheme !== 'https') {
            return vscode.workspace.openTextDocument(uri).then(
              doc => {
                schemaDocuments[uri.toString()] = true;
                return doc.getText();
              },
              error => Promise.reject(error)
            );
          } else {
            const headers = { 'Accept-Encoding': 'gzip, deflate' };
            return xhr({ url: uriPath, followRedirects: 5, headers }).then(
              response => response.responseText,
              (error: XHRResponse) =>
                Promise.reject(
                  new ResponseError(
                    error.status,
                    error.responseText || getErrorStatusDescription(error.status) || error.toString()
                  )
                )
            );
          }
        });

        const handleContentChange = (uriString: string) => {
          if (schemaDocuments[uriString]) {
            client.sendNotification(SchemaContentChangeNotification.type, uriString);
            return true;
          }
          return false;
        };
        this.disposables.push(
          vscode.workspace.onDidChangeTextDocument(e => handleContentChange(e.document.uri.toString()))
        );
        this.disposables.push(
          vscode.workspace.onDidCloseTextDocument(d => {
            const uriString = d.uri.toString();
            if (handleContentChange(uriString)) {
              delete schemaDocuments[uriString];
            }
          })
        );

        // initialize the schema associations
        client.sendNotification(SchemaAssociationNotification.type, this.getSchemaAssociations());

        // manually register / deregister format provider based on the json.format.enable config, and the
        // json and adx-template-json language specific settings
        let rangeFormatting: vscode.Disposable | undefined;
        function updateFormatterRegistration() {
          const formatEnabled = vscode.workspace.getConfiguration().get('json.format.enable');
          if (!formatEnabled && rangeFormatting) {
            rangeFormatting.dispose();
            rangeFormatting = undefined;
          } else if (formatEnabled && !rangeFormatting) {
            rangeFormatting = vscode.languages.registerDocumentRangeFormattingEditProvider(documentSelector, {
              provideDocumentRangeFormattingEdits(
                document: vscode.TextDocument,
                range: vscode.Range,
                options: vscode.FormattingOptions,
                token: vscode.CancellationToken
              ): vscode.ProviderResult<vscode.TextEdit[]> {
                const params: DocumentRangeFormattingParams = {
                  textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
                  range: client.code2ProtocolConverter.asRange(range),
                  // FIXME: get FileFormattingOptions from workspace configs
                  options: client.code2ProtocolConverter.asFormattingOptions(getFormattingOptions(options), {})
                };
                return client.sendRequest(DocumentRangeFormattingRequest.type, params, token).then(
                  edits => {
                    if (Array.isArray(edits)) {
                      return client.protocol2CodeConverter.asTextEdits(edits);
                    }
                    return [];
                  },
                  error => {
                    return client.handleFailedRequest(DocumentRangeFormattingRequest.type, error, []);
                  }
                );
              }
            });
          }
        }

        updateFormatterRegistration();
        this.disposables.push({ dispose: () => rangeFormatting && rangeFormatting.dispose() });
        this.disposables.push(
          vscode.workspace.onDidChangeConfiguration(
            e => e.affectsConfiguration('json.format.enable') && updateFormatterRegistration()
          )
        );

        this.clientReady = true;
        const hrend = process.hrtime(hrstart);
        this.langOutputChannel.appendLine(
          `Language server and client started in ${hrend[0]}s. ${hrend[1] / 1000000}ms.`
        );
      })
      .catch(e => {
        this.langOutputChannel.appendLine('Failed to start language client or server: ' + (e.message || e));
        if (e instanceof Error && e.stack) {
          this.langOutputChannel.appendLine(e.stack);
        }
      });

    // add these lang config rules programmatically, to match what
    // https://github.com/microsoft/vscode/blob/main/extensions/json-language-features/client/src/jsonClient.ts does
    vscode.languages.setLanguageConfiguration(TEMPLATE_JSON_LANG_ID, {
      wordPattern: /("(?:[^\\\"]*(?:\\.)?)*"?)|[^\s{}\[\],:]+/,
      indentationRules: {
        increaseIndentPattern: /({+(?=([^"]*"[^"]*")*[^"}]*$))|(\[+(?=([^"]*"[^"]*")*[^"\]]*$))/,
        decreaseIndentPattern: /^\s*[}\]],?\s*$/
      }
    });

    this.languageClient = client;
    return this;
  }

  public updateSchemaAssociations() {
    if (this.languageClient && this.clientReady) {
      const a = this.getSchemaAssociations();
      this.languageClient.sendNotification(SchemaAssociationNotification.type, a);
    }
  }

  private readJSONFile(location: string) {
    try {
      return JSON.parse(fs.readFileSync(location).toString());
    } catch (e) {
      console.warn(`Problems reading ${location}: ${e}`);
      return {};
    }
  }
}
