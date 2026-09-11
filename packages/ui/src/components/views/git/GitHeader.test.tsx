import React, { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import type { GitStatus } from '@/lib/api/types';
import { I18nProvider } from '@/lib/i18n';


const baseStatus: GitStatus = {
  current: 'feature/undo-commit',
  tracking: 'origin/feature/undo-commit',
  ahead: 1,
  behind: 0,
  files: [],
  isClean: true,
};

test('offers undo only for an idle tracked branch with an unpushed commit and confirms selection once', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    localStorage: dom.localStorage,
    Element: dom.Element,
    HTMLElement: dom.HTMLElement,
    Node: dom.Node,
    Event: dom.Event,
    KeyboardEvent: dom.KeyboardEvent,
    MouseEvent: dom.MouseEvent,
    PointerEvent: dom.PointerEvent,
    MutationObserver: dom.MutationObserver,
    ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }

  const { createRoot } = await import('react-dom/client');
  const { GitHeader } = await import('./GitHeader');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let undoSelections = 0;

  const render = async (status: GitStatus, withHandler = true) => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <GitHeader
            directory="/repo"
            status={status}
            localBranches={[status.current]}
            remoteBranches={[]}
            branchInfo={undefined}
            syncAction={null}
            remotes={[]}
            onFetch={() => undefined}
            onSync={() => undefined}
            onRemoveRemote={() => undefined}
            removingRemoteName={null}
            onCheckoutBranch={() => undefined}
            onCreateBranch={async () => undefined}
            activeIdentityProfile={null}
            availableIdentities={[]}
            onSelectIdentity={() => undefined}
            isApplyingIdentity={false}
            isWorktreeMode={false}
            onOpenHistory={() => undefined}
            onUndoLastUnpushedCommit={withHandler ? () => { undoSelections += 1; } : undefined}
          />
        </I18nProvider>,
      );
    });
  };

  const openMenu = async () => {
    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Repository views"]');
    if (!trigger) throw new Error('Missing repository menu trigger');
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    });
  };

  const undoItem = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .find((item) => item.textContent?.includes('Undo last unpushed commit'));

  try {
    await render(baseStatus);
    await openMenu();
    const item = undoItem();
    expect(item).toBeDefined();
    if (!item) throw new Error('Missing undo menu item');
    await act(async () => { item.click(); });
    expect(undoSelections).toBe(1);

    for (const status of [
      { ...baseStatus, tracking: null },
      { ...baseStatus, ahead: 0 },
      { ...baseStatus, mergeInProgress: { head: 'abc123', message: 'Merge' } },
      { ...baseStatus, rebaseInProgress: { headName: 'feature/undo-commit', onto: 'main' } },
      { ...baseStatus, attentionReason: 'cherry-pick' as const },
    ]) {
      await render(status);
      await openMenu();
      expect(undoItem()).toBe(undefined);
      await act(async () => { document.body.click(); });
    }

    await render(baseStatus, false);
    await openMenu();
    expect(undoItem()).toBeUndefined();
  } finally {
    await act(async () => { root.unmount(); });
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});
