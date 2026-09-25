import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { OpenCode } from '@opencode/client';
import type { Config } from '@/lib/opencode/model';
import { useUIStore } from '@/stores/useUIStore';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';

let WorkStatusLspSection: typeof import('./WorkStatusLspSection').WorkStatusLspSection;

const directory = '/lsp-test';
const otherDirectory = '/other-lsp-test';
const sdk = OpenCode.make({
  baseUrl: 'http://lsp.test',
  fetch: () => new Promise<Response>(() => undefined),
});

const configuredLsp: Config = {
  lsp: {
    typescript: { command: ['typescript-language-server', '--stdio'], extensions: ['.ts', '.tsx'] },
    disabled: { disabled: true },
  },
};

describe('work-status LSP section', () => {
  let win: Window;
  let root: Root;
  let container: HTMLElement;
  let restoreGlobals: () => void;

  const render = async (selectedDirectory: string | null = directory) => {
    await act(async () => root.render(
      <SyncProvider sdk={sdk} directory={directory}>
        <I18nProvider><WorkStatusLspSection directory={selectedDirectory} /></I18nProvider>
      </SyncProvider>,
    ));
  };
  const publish = async (config: Config, selectedDirectory = directory) => {
    const store = getSyncChildStores().getChild(selectedDirectory);
    if (!store) throw new Error('Expected directory store');
    await act(async () => store.setState((state) => ({ ...state, config })));
  };

  beforeEach(async () => {
    win = new Window({ url: 'http://localhost' });
    const values = {
      window: win, document: win.document, navigator: win.navigator,
      Node: win.Node, Element: win.Element, HTMLElement: win.HTMLElement,
      HTMLIFrameElement: win.HTMLIFrameElement, localStorage: win.localStorage,
      getComputedStyle: win.getComputedStyle.bind(win), ResizeObserver: win.ResizeObserver,
      requestAnimationFrame: win.requestAnimationFrame.bind(win),
      cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    restoreGlobals = () => {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    };
    ({ WorkStatusLspSection } = await import('./WorkStatusLspSection'));
    useUIStore.setState({ workStatusExpandedSections: { lsp: true } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await render();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    await win.happyDOM.close();
    restoreGlobals();
  });

  test('renders nothing for empty or boolean LSP configuration', async () => {
    expect(container.textContent).toBe('');

    await publish({ lsp: true });
    expect(container.textContent).toBe('');

    await publish({ lsp: false });
    expect(container.textContent).toBe('');
  });

  test('lists configured servers and skips disabled entries without claiming runtime status', async () => {
    await publish(configuredLsp);

    expect(container.querySelector('button')?.textContent).toBe('LSPtypescript');
    expect(container.textContent).toContain('typescript');
    expect(container.textContent).not.toContain('disabled');
    expect(container.textContent).not.toContain('Connected');
    expect(container.textContent).not.toContain('Error');
  });

  test('reads only selected directory and does not fall back for null or blank directories', async () => {
    await publish(configuredLsp);

    await render(otherDirectory);
    expect(container.textContent).toBe('');

    await publish({ lsp: { rust: { command: ['rust-analyzer'] } } }, otherDirectory);
    expect(container.querySelector('button')?.textContent).toBe('LSPrust');

    await render(null);
    expect(container.textContent).toBe('');

    await render('   ');
    expect(container.textContent).toBe('');
  });
});
