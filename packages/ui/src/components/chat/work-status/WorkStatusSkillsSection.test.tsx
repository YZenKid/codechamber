import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { OpenCode } from '@opencode/client';
import { I18nProvider } from '@/lib/i18n';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSkillsStore, type DiscoveredSkill } from '@/stores/useSkillsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useUIStore } from '@/stores/useUIStore';
import { SyncProvider } from '@/sync/sync-context';

mock.module('@/hooks/useRuntimeAPIs', () => ({
  useRuntimeAPIs: () => ({ linear: null }),
}));

let WorkStatusSkillsSection: typeof import('./WorkStatusSkillsSection').WorkStatusSkillsSection;
let WorkStatusContextSection: typeof import('./WorkStatusContextSection').WorkStatusContextSection;

const directory = '/skills-test';
const skill = (name: string): DiscoveredSkill => ({
  name,
  path: `${directory}/.agents/skills/${name}/SKILL.md`,
  scope: 'project',
  source: 'agents',
});

describe('work-status skills section', () => {
  let win: Window;
  let root: Root;
  let container: HTMLElement;
  let restoreGlobals: () => void;
  const loadCalls: string[] = [];
  const loadSkills = async (selected?: string | null) => {
    if (selected) loadCalls.push(selected);
    return true;
  };
  const sdk = OpenCode.make({ baseUrl: 'http://skills.test', fetch: () => new Promise<Response>(() => undefined) });

  const renderSkills = async (selectedDirectory: string | null = directory) => {
    await act(async () => root.render(
      <I18nProvider><WorkStatusSkillsSection directory={selectedDirectory} /></I18nProvider>,
    ));
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

    ({ WorkStatusSkillsSection } = await import('./WorkStatusSkillsSection'));
    ({ WorkStatusContextSection } = await import('./WorkStatusContextSection'));
    loadCalls.length = 0;
    useConfigStore.setState({ isConnected: true });
    useSessionUIStore.setState({ newSessionDraft: { ...useSessionUIStore.getState().newSessionDraft, open: false } });
    useUIStore.setState({ workStatusExpandedSections: { skills: true, 'context-sources': true } });
    useSkillsStore.setState({
      skills: [skill('Ambient skill')],
      skillsByDirectory: {
        [directory]: [skill('Accessibility audit'), skill('Release notes')],
        '/other-project': [skill('Wrong project skill')],
      },
      loadSkills,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    await win.happyDOM.close();
    restoreGlobals();
  });

  test('loads and lists only skills for the selected directory with a localized count', async () => {
    await renderSkills();

    expect(loadCalls).toEqual([directory]);
    expect(container.querySelector('button[aria-expanded]')?.textContent).toBe('Skills2 skills');
    expect(container.textContent).toContain('Accessibility audit');
    expect(container.textContent).toContain('Release notes');
    expect(container.textContent).not.toContain('Ambient skill');
    expect(container.textContent).not.toContain('Wrong project skill');
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });

  test('does not use ambient skills when the panel has no project directory', async () => {
    useSkillsStore.setState({
      skillsByDirectory: {
        __default__: [skill('Ambient skill')],
        [directory]: [skill('Project skill')],
      },
    });

    await renderSkills(null);

    expect(loadCalls).toHaveLength(0);
    expect(container.textContent).toBe('');
  });

  test('does not keep Context sources alive when skills are the only available source', async () => {
    await act(async () => root.render(
      <SyncProvider sdk={sdk} directory={directory}>
        <I18nProvider><WorkStatusContextSection sessionId={null} directory={null} /></I18nProvider>
      </SyncProvider>,
    ));

    expect(container.textContent).toBe('');
  });
});
