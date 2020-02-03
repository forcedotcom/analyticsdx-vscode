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
  LanguageClient,
  LanguageClientOptions,
  Message,
  NotificationType,
  RequestType,
  ResponseError,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient';
import {
  csvFileFilter,
  htmlFileFilter,
  imageFileFilter,
  jsonFileFilter,
  TEMPLATE_INFO,
  TEMPLATE_JSON_LANG_ID
} from './constants';
import { telemetryService } from './telemetry';
import { RemoveJsonPropertyCodeActionProvider } from './util/actions';
import { JsonAttributeCompletionItemProvider, newRelativeFilepathDelegate } from './util/completions';
import { JsonAttributeRelFilePathDefinitionProvider } from './util/definitions';
import { Disposable } from './util/disposable';
import { matchJsonNodesAtPattern } from './util/jsoncUtils';
import { Logger, PrefixingOutputChannel } from './util/logger';
import { findTemplateInfoFileFor } from './util/templateUtils';
import { isValidRelpath } from './util/utils';
import { clearDiagnosticsUnder, isUriAtOrUnder, uriBasename, uriDirname, uriStat } from './util/vscodeUtils';

function templateJsonFileFilter(s: string) {
  return jsonFileFilter(s) && s !== 'template-info.json';
}

/** Wraps the setup for configuring editing for the files in a template directory. */
class TemplateDirEditing extends Disposable {
  /** A hashkey for checking for equality between different instances. */
  public readonly key: string;

  private _folderDefinitionPath: string | undefined;
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

  get uiDefinitionPath() {
    return this._uiDefinitionPath;
  }

  get variablesDefinitionPath() {
    return this._variablesDefinitionPath;
  }

  get rulesDefinitionPaths() {
    return this._rulesDefinitionPaths;
  }

  public static key(dir: vscode.Uri) {
    // right now, this only configures things based on schema and filepath, so only key on those
    return dir.scheme + ':' + dir.path;
  }

  public start(): this {
    const templateInfoSelector: vscode.DocumentSelector = {
      scheme: this.dir.scheme,
      pattern:
        // RelativePattern is supposed to be a little better here, but only works right for file:// uris
        this.dir.scheme === 'file'
          ? new vscode.RelativePattern(this.dir.fsPath, 'template-info.json')
          : path.join(this.dir.path, 'template-info.json')
    };
    // hook up additional code-completions for template-info.json
    const fileCompleter = new JsonAttributeCompletionItemProvider(
      // locations that support *.json fies:
      newRelativeFilepathDelegate({
        supported: location => TEMPLATE_INFO.jsonRelFilePathLocationPatterns.some(location.matches),
        filter: templateJsonFileFilter
      }),
      // attributes that should have html paths
      newRelativeFilepathDelegate({
        supported: location => TEMPLATE_INFO.htmlRelFilePathLocationPatterns.some(location.matches),
        filter: htmlFileFilter
      }),
      // attribute that should point to images
      newRelativeFilepathDelegate({
        supported: location => TEMPLATE_INFO.imageRelFilePathLocationPatterns.some(location.matches),
        filter: imageFileFilter
      }),
      // the file in externalFiles should be a .csv
      newRelativeFilepathDelegate({
        supported: location => TEMPLATE_INFO.csvRelFilePathLocationPatterns.some(location.matches),
        filter: csvFileFilter
      })
    );
    this.disposables.push(vscode.languages.registerCompletionItemProvider(templateInfoSelector, fileCompleter));

    // hook up Go To/Peek Defintion (Alt+Click) for relative-path fields in template-info.json
    const defProvider = new JsonAttributeRelFilePathDefinitionProvider(TEMPLATE_INFO.allRelFilePathLocationPatterns);
    this.disposables.push(vscode.languages.registerDefinitionProvider(templateInfoSelector, defProvider));

    // hook up quick fixes for deprecated elements that can simply be removed as a fix
    const actionsProvider = new RemoveJsonPropertyCodeActionProvider(
      ['icons', 'templateDetail'],
      ['ruleDefinition'],
      ['assetIcon'],
      ['templateIcon']
    );
    this.disposables.push(
      vscode.languages.registerCodeActionsProvider(templateInfoSelector, actionsProvider, {
        providedCodeActionKinds: RemoveJsonPropertyCodeActionProvider.providedCodeActionKinds
      })
    );

    // TODO: hookup editing support for the other template file types

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
  public readonly templateInfoSchemaPath: vscode.Uri;
  public readonly folderSchemaPath: vscode.Uri;
  public readonly uiSchemaPath: vscode.Uri;
  public readonly variablesSchemaPath: vscode.Uri;
  public readonly rulesSchemaPath: vscode.Uri;

  private readonly logger: Logger;

  constructor(context: vscode.ExtensionContext, output?: vscode.OutputChannel) {
    super();
    this.templateInfoSchemaPath = vscode.Uri.file(context.asAbsolutePath('schemas/template-info-schema.json'));
    this.folderSchemaPath = vscode.Uri.file(context.asAbsolutePath('schemas/folder-schema.json'));
    this.uiSchemaPath = vscode.Uri.file(context.asAbsolutePath('schemas/ui-schema.json'));
    this.variablesSchemaPath = vscode.Uri.file(context.asAbsolutePath('schemas/variables-schema.json'));
    this.rulesSchemaPath = vscode.Uri.file(context.asAbsolutePath('schemas/rules-schema.json'));
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
    // start out custom json schema language services
    this.languageClient = new TemplateJsonLanguageClient(() => this.getSchemaAssociations(), this.logger);
    this.disposables.push(this.languageClient.start());
    // listen for template directories being deleted, we have to listen to everything since, if a parent directory
    // is deleted, you just get 1 callback for the parent directory, so we have to do some calculations to determine
    // if a template folder's folder (or higher) was deleted
    const watcher = vscode.workspace.createFileSystemWatcher('**', true, true, false);
    watcher.onDidDelete(uri => this.deleted(uri));
    this.disposables.push(watcher);

    vscode.workspace.textDocuments.forEach(doc => this.opened(doc));

    return this;
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
      // set documentLangId here on json files so it uses our language server
      if (doc.languageId === 'json' || doc.languageId === 'jsonc') {
        vscode.languages.setTextDocumentLanguage(doc, TEMPLATE_JSON_LANG_ID);
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
    associations['**/template-info.json'] = [this.templateInfoSchemaPath.toString()];
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
 * This is mostly borrowed from the json-language-features client code
 * (https://github.com/microsoft/vscode/blob/master/extensions/json-language-features/client/src/jsonMain.ts).
 * Because there is no public api to dynamically associate a json-schema to a file, we need to do it ourselves.
 * This will start a json-language-server (using the json-language-features extension already included in the
 * VSCode installation), but will configure a custom language client, where we can dynamically send up
 * file -> json-schema associations for the various file paths specified in a template-info.json.
 * This is bound to the adx-template-json languageId, so it shouldn't interfer with regular json files.
 */
namespace VSCodeContentRequest {
  export const type: RequestType<string, string, any, any> = new RequestType('vscode/content');
}
namespace SchemaContentChangeNotification {
  export const type: NotificationType<string, any> = new NotificationType('json/schemaContent');
}
namespace SchemaAssociationNotification {
  export const type: NotificationType<ISchemaAssociations, any> = new NotificationType('json/schemaAssociations');
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

  private langOutputChannel: PrefixingOutputChannel;

  /** Constructor.
   * @param getSchemaAssociations supplier of the file->json-schema associations, this will be invoked when
   *        then language server and client is ready, as well as from updateSchemaAssociations().
   */
  constructor(private readonly getSchemaAssociations: () => ISchemaAssociations, logger: Logger) {
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
    // find the json extension included in the vscode installation
    const jsonExt = vscode.extensions.getExtension('vscode.json-language-features');
    if (!jsonExt) {
      this.langOutputChannel.appendLine(
        'Failed to find vscode.json-language-features extension, some template editing features will be unavailable.'
      );
      vscode.window.showWarningMessage(
        'Failed to find vscode.json-language-features extension, some template editing features will be unavailable.'
      );
      return this;
    }
    const extPath = jsonExt.extensionPath;
    // find the server module's main dir
    const serverPath = fspath.join(extPath, 'server');
    const serverMain = this.readJSONFile(fspath.join(serverPath, 'package.json')).main;
    const serverModule = fspath.join(serverPath, serverMain);

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
      errorHandler: {
        error: (error: Error, message: Message, count: number) => {
          this.langOutputChannel.appendLine(`error (#${count}): ${error}`);
          return ErrorAction.Continue;
        },
        closed: () => {
          this.langOutputChannel.appendLine('closed connection');
          return CloseAction.DoNotRestart;
        }
      },
      diagnosticCollectionName: TEMPLATE_JSON_LANG_ID,
      initializationOptions: {
        // language server only loads file-URI. Fetching schemas with other protocols ('http'...) are made on the client.
        handledSchemaProtocols: ['file'],
        // don't provide a default formatter, we'll wire it up ourselves so we can configure the options
        provideFormatter: false
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
                next(uri, diagnostics);
              }
            })
            .catch(console.error);
        }
      }
    };

    this.clientReady = false;
    this.langOutputChannel.appendLine('Starting language server and client...');
    const hrstart = process.hrtime();
    const client = new LanguageClient(
      TEMPLATE_JSON_LANG_ID,
      'ADX Templates JSON Language Server',
      serverOptions,
      clientOptions
    );
    // for now, turn off proposed features from the vscode proposed api -- this fails with our version of the
    // vscode-languageclient and the current version of vscode, and we're not relying on this right now
    // REVIEWME: figure out if/how to turn on json proposed language features?
    //client.registerProposedFeatures();

    this.disposables.push(client.start());

    // tslint:disable-next-line: no-floating-promises
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

        // initialize the schema associations (normally will be empty)
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
                  options: client.code2ProtocolConverter.asFormattingOptions(getFormattingOptions(options))
                };
                return client
                  .sendRequest(DocumentRangeFormattingRequest.type, params, token)
                  .then(client.protocol2CodeConverter.asTextEdits, error => {
                    client.logFailedRequest(DocumentRangeFormattingRequest.type, error);
                    return Promise.resolve([]);
                  });
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
        this.langOutputChannel.appendLine('Failed to start language client or server: ' + e);
        if (e instanceof Error && e.stack) {
          this.langOutputChannel.appendLine(e.stack);
        }
      });

    // add these lang config rules programmatically, to match what
    // https://github.com/microsoft/vscode/blob/master/extensions/json-language-features/client/src/jsonMain.ts does
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
