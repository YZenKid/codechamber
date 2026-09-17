import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { createOpencodeClient, type PermissionRequest, type QuestionRequest, type Session, type SessionStatus } from '@opencode-ai/sdk/v2';
import { useUIStore } from '@/stores/useUIStore';
import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';
import type { State } from '@/sync/types';

let WorkStatusSubagentsSection: typeof import('./WorkStatusSubagentsSection').WorkStatusSubagentsSection;
const directory = '/subagents-test';
const sessionId = 'parent';
const rootSession: Session = { id: sessionId, slug: 'parent', projectID: 'project', directory, title: 'Parent', version: '1', time: { created: 0, updated: 1 } };
const child = (id: string, title: string): Session => ({ id, parentID: sessionId, slug: id, projectID: 'project', directory, title, version: '1', time: { created: 0, updated: 1 } });
const first = child('first', 'First');
const second = child('second', 'Second');
const permission: PermissionRequest = { id: 'permission', sessionID: first.id, permission: 'read', patterns: ['*'], metadata: {}, always: [] };
const question: QuestionRequest = { id: 'question', sessionID: first.id, questions: [] };
const busy: SessionStatus = { type: 'busy' };
const retry: SessionStatus = { type: 'retry', attempt: 1, message: 'retrying', next: 0 };

describe('collapsible work-status subagents', () => {
  let win: Window;
  let root: Root;
  let container: HTMLElement;
  let restoreGlobals: () => void;
  const sdk = createOpencodeClient({ baseUrl: 'http://subagents.test', fetch: () => new Promise<Response>(() => undefined) });
  const render = async () => {
    await act(async () => root.render(
      <SyncProvider sdk={sdk} directory={directory}>
        <I18nProvider><WorkStatusSubagentsSection sessionId={sessionId} directory={directory} /></I18nProvider>
      </SyncProvider>,
    ));
  };
  const store = () => {
    const result = getSyncChildStores().getChild(directory);
    if (!result) throw new Error('Expected directory store');
    return result;
  };
  const publish = async (state: Pick<State, 'session' | 'session_status' | 'permission' | 'question'>) => {
    await act(async () => store().setState(state));
  };
  const heading = () => {
    const button = container.querySelector<HTMLButtonElement>('button[aria-expanded]');
    if (!button) throw new Error('Expected Subagents heading');
    return button;
  };
  const collapse = async () => { await act(async () => heading().click()); };

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
    ({ WorkStatusSubagentsSection } = await import('./WorkStatusSubagentsSection'));
    useUIStore.setState({ workStatusExpandedSections: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await render();
    await publish({ session: [rootSession, first, second], session_status: { [first.id]: busy }, permission: {}, question: {} });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    await win.happyDOM.close();
    restoreGlobals();
  });

  test('updates collapsed preview for live busy and retry activity', async () => {
    await collapse();
    expect(heading().getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).toBe('Subagents1/2Firstis working');
    expect(container.querySelectorAll('[aria-label^="Open "]').length).toBe(1);

    await publish({ session: [rootSession, first, second], session_status: { [second.id]: retry }, permission: {}, question: {} });
    expect(container.textContent).toBe('Subagents1/2Secondis working');
    expect(container.querySelectorAll('[aria-label^="Open "]').length).toBe(1);
  });

  test('prioritizes permission, then question, then activity and removes an empty preview', async () => {
    await collapse();
    await publish({
      session: [rootSession, first, second],
      session_status: { [first.id]: busy, [second.id]: retry },
      permission: {},
      question: { [first.id]: [question] },
    });
    expect(container.textContent).toBe('Subagents2/2Firstasked a question');

    await publish({
      session: [rootSession, first, second],
      session_status: { [first.id]: busy, [second.id]: retry },
      permission: { [second.id]: [{ ...permission, sessionID: second.id }] },
      question: { [first.id]: [question] },
    });
    expect(container.textContent).toBe('Subagents2/2Secondneeds permission');

    await publish({
      session: [rootSession, first, second],
      session_status: { [first.id]: busy },
      permission: { [first.id]: [permission] },
      question: { [first.id]: [question] },
    });
    expect(container.textContent).toBe('Subagents1/2Firstneeds permission');

    await publish({
      session: [rootSession, first, second],
      session_status: { [first.id]: busy },
      permission: {},
      question: { [first.id]: [question] },
    });
    expect(container.textContent).toBe('Subagents1/2Firstasked a question');

    await publish({ session: [rootSession, first, second], session_status: { [first.id]: busy }, permission: {}, question: {} });
    expect(container.textContent).toBe('Subagents1/2Firstis working');

    await publish({ session: [rootSession, first, second], session_status: {}, permission: {}, question: {} });
    expect(container.textContent).toBe('Subagents2');
    await collapse();
    expect(container.textContent).toBe('Subagents2FirstDoneSecondDone');
  });
});
