import React, { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import type { GitStatus } from '@/lib/api/types';

import { I18nProvider } from '@/lib/i18n';
import { useGitStore } from '@/stores/useGitStore';

import { GitRepositoriesPanel } from './GitRepositoriesPanel';

test('shows repository status, selects rows, and collapses discovered repositories', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    Element: dom.Element,
    HTMLElement: dom.HTMLElement,
    Node: dom.Node,
    Event: dom.Event,
    MouseEvent: dom.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }

  const originalStore = useGitStore.getState();
  const repository = '/project/apps/desktop';
  const status: GitStatus = {
    current: 'feature/repositories',
    tracking: 'origin/feature/repositories',
    ahead: 2,
    behind: 1,
    files: [{ path: 'GitView.tsx', index: ' M', working_dir: 'M ' }],
    isClean: false,
  };
  const selected: string[] = [];
  const { createRoot } = await import('react-dom/client');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  try {
    useGitStore.getState().setActiveDirectory(repository);
    const seeded = useGitStore.getState().getDirectoryState(repository);
    if (!seeded) throw new Error('Missing repository state');
    const directories = new Map(useGitStore.getState().directories);
    directories.set(repository, { ...seeded, isGitRepo: true, status });
    useGitStore.setState({ directories });

    await act(async () => {
      root.render(
        <I18nProvider>
          <GitRepositoriesPanel
            repositories={[repository]}
            repositoryRoot="/project"
            selectedRepository={repository}
            onSelectRepository={(value) => selected.push(value)}
          />
        </I18nProvider>,
      );
    });

    const heading = container.querySelector<HTMLButtonElement>('[aria-label="REPOSITORIES"]');
    const row = container.querySelector<HTMLButtonElement>('button[aria-current="true"]');
    expect(heading).not.toBeNull();
    expect(heading?.title).toBe('REPOSITORIES');
    expect(row?.textContent).toContain('apps/desktop');
    expect(row?.textContent).toContain('feature/repositories');
    expect(row?.getAttribute('aria-label')).toBeNull();
    expect(container.querySelector('[title="Uncommitted changes"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="1↓ 2↑"]')).not.toBeNull();

    await act(async () => { row?.click(); });
    expect(selected).toEqual([repository]);

    await act(async () => { heading?.click(); });
    expect(container.querySelector('[role="listitem"]')).toBeNull();
  } finally {
    await act(async () => { root.unmount(); });
    useGitStore.setState({
      directories: originalStore.directories,
      activeDirectory: originalStore.activeDirectory,
    });
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});
