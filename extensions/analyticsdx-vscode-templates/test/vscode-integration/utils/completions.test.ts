/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as vscode from 'vscode';
import { csvFileFilter, TEMPLATE_INFO } from '../../../src/constants';
import {
  JsonCompletionItemProvider,
  JsonCompletionItemProviderDelegate,
  newCompletionItem,
  newRelativeFilepathDelegate
} from '../../../src/util/completions';
import { closeAllEditors, findPositionByJsonPath, openTemplateInfo } from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('JsonCompletionItemProvider', () => {
  let cancellationTokenSource: vscode.CancellationTokenSource;

  beforeEach(async () => {
    await closeAllEditors();
    cancellationTokenSource = new vscode.CancellationTokenSource();
  });

  afterEach(async () => {
    await closeAllEditors();
    if (cancellationTokenSource) {
      cancellationTokenSource.dispose();
    }
  });

  it('find *.csv matches', async () => {
    const [doc] = await openTemplateInfo('allRelpaths');
    const position = findPositionByJsonPath(doc, TEMPLATE_INFO.csvRelFilePathLocationPatterns[0]);
    expect(position, 'position').to.not.be.undefined;
    const provider = new JsonCompletionItemProvider(
      // locations that support *.csv fies:
      newRelativeFilepathDelegate({
        isSupportedLocation: l => !l.isAtPropertyKey && TEMPLATE_INFO.csvRelFilePathLocationPatterns.some(l.matches),
        filter: csvFileFilter
      })
    );

    const list = await provider.provideCompletionItems(doc, position!, cancellationTokenSource.token, {
      triggerKind: vscode.CompletionTriggerKind.Invoke
    });
    expect(list, 'items list').to.not.be.undefined.and.not.be.null;
    const items = list!.items;
    expect(items, 'items').to.not.be.undefined.and.not.be.null;
    expect(items.length, 'items length').to.be.equals(1);
    const path = 'externalFiles/externalFile.csv';
    // these 2 will have it wrapped in double-quotes
    expect(items[0].label, 'item label').to.be.equals(`"${path}"`);
    expect(items[0].insertText, 'item insertText').to.be.equals(`"${path}"`);
    // this one specifically won't wrap in double-quotes
    expect(items[0].detail, 'item detail').to.be.equals(`${path}`);
    expect(items[0].kind, 'item kind').to.be.equals(vscode.CompletionItemKind.File);
    // TODO: test that item.range is right
  });

  it('finds no files on unsupported location', async () => {
    const [doc] = await openTemplateInfo('allRelpaths');
    const position = findPositionByJsonPath(doc, TEMPLATE_INFO.csvRelFilePathLocationPatterns[0]);
    expect(position, 'position').to.not.be.undefined;
    // make a provider with a filter that will match no location
    const provider = new JsonCompletionItemProvider(
      newRelativeFilepathDelegate({
        isSupportedLocation: () => false,
        filter: csvFileFilter
      })
    );

    const list = await provider.provideCompletionItems(doc, position!, cancellationTokenSource.token, {
      triggerKind: vscode.CompletionTriggerKind.Invoke
    });
    expect(list, 'items list').to.be.undefined;
  });

  it('finds no matching files', async () => {
    const [doc] = await openTemplateInfo('allRelpaths');
    const position = findPositionByJsonPath(doc, TEMPLATE_INFO.csvRelFilePathLocationPatterns[0]);
    expect(position, 'position').to.not.be.undefined;
    // make a provider with a filter that will match no files
    const provider = new JsonCompletionItemProvider(
      newRelativeFilepathDelegate({
        isSupportedLocation: l => !l.isAtPropertyKey && TEMPLATE_INFO.csvRelFilePathLocationPatterns.some(l.matches),
        filter: () => false
      })
    );

    const list = await provider.provideCompletionItems(doc, position!, cancellationTokenSource.token, {
      triggerKind: vscode.CompletionTriggerKind.Invoke
    });
    expect(list, 'items list').to.not.be.undefined.and.not.be.null;
    const items = list!.items;
    expect(items, 'items').to.not.be.undefined.and.not.be.null;
    expect(items, 'item').to.be.deep.equals([]);
  });

  it("doesn't leak across delegates by document", async () => {
    // this one will always return items
    const delegate1: JsonCompletionItemProviderDelegate = {
      isSupportedDocument: () => true,
      isSupportedLocation: () => true,
      getItems: () => {
        return [newCompletionItem('good')];
      }
    };
    // this one should never match on document
    const delegate2: JsonCompletionItemProviderDelegate = {
      isSupportedDocument: () => false,
      isSupportedLocation: () => true,
      getItems: () => {
        return [newCompletionItem('bad')];
      }
    };
    const [doc] = await openTemplateInfo('allRelpaths');

    const provider = new JsonCompletionItemProvider(delegate1, delegate2);
    const items = (
      await provider.provideCompletionItems(doc, new vscode.Position(0, 0), cancellationTokenSource.token, {
        triggerKind: vscode.CompletionTriggerKind.Invoke
      })
    )?.items;
    expect(items, 'items').to.not.be.undefined;
    if (items!.length !== 1) {
      expect.fail('Expected 1 completion item, got: ' + items!.map(c => c.label).join(', '));
    }
    expect(items![0].label, 'item label').to.equal('"good"');
  });

  it("doesn't leak across delegates by location", async () => {
    // this one will always return items
    const delegate1: JsonCompletionItemProviderDelegate = {
      isSupportedDocument: () => true,
      isSupportedLocation: () => true,
      getItems: () => {
        return [newCompletionItem('good')];
      }
    };
    // this one should never match on location
    const delegate2: JsonCompletionItemProviderDelegate = {
      isSupportedDocument: () => true,
      isSupportedLocation: () => false,
      getItems: () => {
        return [newCompletionItem('bad')];
      }
    };
    const [doc] = await openTemplateInfo('allRelpaths');

    const provider = new JsonCompletionItemProvider(delegate1, delegate2);
    const items = (
      await provider.provideCompletionItems(doc, new vscode.Position(0, 0), cancellationTokenSource.token, {
        triggerKind: vscode.CompletionTriggerKind.Invoke
      })
    )?.items;
    expect(items, 'items').to.not.be.undefined;
    if (items!.length !== 1) {
      expect.fail('Expected 1 completion item, got: ' + items!.map(c => c.label).join(', '));
    }
    expect(items![0].label, 'item label').to.equal('"good"');
  });
});
