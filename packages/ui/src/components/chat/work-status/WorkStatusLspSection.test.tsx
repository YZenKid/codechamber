import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { createOpencodeClient, type LspStatus } from '@opencode-ai/sdk/v2';
import { useUIStore } from '@/stores/useUIStore';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';

let WorkStatusLspSection: typeof import('./WorkStatusLspSection').WorkStatusLspSection;
const directory = '/lsp-test';
const server = (id: string, name: string, status: LspStatus['status']): LspStatus => ({ id, name, root: `/root/${id}`, status });

describe('work-status LSP section', () => {
  let win: Window;
  let root: Root;
  let container: HTMLElement;
  let restoreGlobals: () => void;
  const sdk = createOpencodeClient({ baseUrl: 'http://lsp.test', fetch: () => new Promise<Response>(() => undefined) });
  const render = async (visible = true, selectedDirectory = directory) => {
    await act(async () => root.render(
      <SyncProvider sdk={sdk} directory={directory}>
        <I18nProvider>{visible ? <WorkStatusLspSection directory={selectedDirectory} /> : null}</I18nProvider>
      </SyncProvider>,
    ));
  };
  const publish = async (servers: LspStatus[], selectedDirectory = directory) => {
    const store = getSyncChildStores().getChild(selectedDirectory);
    if (!store) throw new Error('Expected directory store');
    await act(async () => store.setState((state) => ({ ...state, lsp: servers })));
  };
  /** Inline colours, in document order: the status column paints each row's state. */
  const statusColors = () => Array.from(container.querySelectorAll<HTMLElement>('[style]'))
    .map((element) => element.style.color)
    .filter(Boolean);

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

  test('renders nothing until authoritative LSP data has a server', async () => {
    await publish([]);
    expect(container.textContent).toBe('');
    await publish([server('typescript', 'TypeScript', 'connected')]);
    expect(container.querySelector('button')?.textContent).toBe('LSP1/1');
  });

  test('summarizes connected servers against the directory total and scopes by directory', async () => {
    await publish([
      server('typescript', 'TypeScript', 'connected'),
      server('rust', 'rust-analyzer', 'error'),
    ]);
    expect(container.querySelector('button')?.textContent).toBe('LSP1/2');
    expect(container.textContent).toContain('TypeScript');
    expect(container.textContent).toContain('rust-analyzer');

    await render(true, '/other-lsp');
    expect(container.querySelector('button')).toBeNull();
    await publish([server('other', 'Other', 'error')], '/other-lsp');
    expect(container.querySelector('button')?.textContent).toBe('LSP0/1');
  });

  test('states each server status in the reader locale with the shared semantic color', async () => {
    await publish([
      server('typescript', 'TypeScript', 'connected'),
      server('rust', 'rust-analyzer', 'error'),
    ]);
    expect(container.textContent).toBe('LSP1/2TypeScriptConnectedrust-analyzerError');
    expect(statusColors()).toEqual(['var(--status-success)', 'var(--status-error)']);
    // The root path is not part of the readout.
    expect(container.textContent).not.toContain('/root/');
  });
});
