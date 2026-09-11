import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost' });
const undoCalls: string[] = [];
const refreshCalls: string[] = [];
const toastSuccesses: string[] = [];
const toastErrors: string[] = [];
let resolveUndo: (() => void) | null = null;
let undoError: Error | null = null;

const status = {
  current: 'feature/undo',
  tracking: 'origin/feature/undo',
  ahead: 1,
  behind: 0,
  files: [],
  isClean: true,
};

let supportsUndoLastUnpushedCommit = true;

const unsupportedGit = {};

const git = {
  undoLastUnpushedCommit: (directory: string) => {
    undoCalls.push(directory);
    if (undoError) {
      return Promise.reject(undoError);
    }
    return new Promise<void>((resolve) => {
      resolveUndo = resolve;
    });
  },
};

const gitStore = {
  setActiveDirectory: () => undefined,
  ensureAll: () => undefined,
  ensureStatus: () => undefined,
  fetchStatus: (directory: string) => {
    refreshCalls.push(`status:${directory}`);
    return Promise.resolve();
  },
  fetchBranches: (directory: string) => {
    refreshCalls.push(`branches:${directory}`);
    return Promise.resolve();
  },
  fetchLog: (directory: string) => {
    refreshCalls.push(`log:${directory}`);
    return Promise.resolve();
  },
  setLogMaxCount: () => undefined,
  fetchIdentity: () => Promise.resolve(),
  prefetchDiffs: () => undefined,
  clearDiffCache: () => undefined,
  moveStatusPathsOptimistically: () => null,
  restoreStatus: () => undefined,
  bumpIndexRevision: () => undefined,
  ensureNestedRepos: () => undefined,
  selectNestedRepo: () => undefined,
};

mock.module('@/sync/session-ui-store', () => ({
  useSessionUIStore: <T,>(selector: (state: { currentSessionId: null; newSessionDraft: null; setDraftBootstrapPendingDirectory: () => void; worktreeMetadata: Map<string, never>; availableWorktrees: never[] }) => T) => selector({
    currentSessionId: null,
    newSessionDraft: null,
    setDraftBootstrapPendingDirectory: () => undefined,
    worktreeMetadata: new Map<string, never>(),
    availableWorktrees: [],
  }),
}));
mock.module('@/stores/useConfigStore', () => ({ useConfigStore: () => false }));
mock.module('@/contexts/FireworksContext', () => ({ useFireworksCelebration: () => ({ triggerFireworks: () => undefined }) }));
mock.module('@/lib/search/fuzzySearch', () => ({ rankByQuery: <T,>(items: T[]) => items }));
mock.module('@/stores/useGitIdentitiesStore', () => ({
  useGitIdentitiesStore: <T,>(selector: (state: { profiles: never[]; globalIdentity: null; defaultGitIdentityId: null; loadProfiles: () => Promise<void>; loadGlobalIdentity: () => Promise<void>; loadDefaultGitIdentityId: () => Promise<void> }) => T) => selector({
    profiles: [], globalIdentity: null, defaultGitIdentityId: null,
    loadProfiles: () => Promise.resolve(), loadGlobalIdentity: () => Promise.resolve(), loadDefaultGitIdentityId: () => Promise.resolve(),
  }),
}));
mock.module('@/hooks/useEffectiveDirectory', () => ({ useEffectiveDirectory: () => '/repo' }));
mock.module('@/hooks/useGitmojiList', () => ({ useGitmojiList: () => ({ gitmojis: [] }) }));
mock.module('@/lib/clipboard', () => ({ copyTextToClipboard: () => Promise.resolve({ ok: true }) }));
mock.module('@/stores/useGitStore', () => ({
  useGitStore: <T,>(selector: (state: typeof gitStore) => T) => selector(gitStore),
  useGitStatus: () => status,
  useGitBranches: () => ({ branches: {} }),
  useGitLog: () => ({ all: [] }),
  useGitIdentity: () => null,
  useIsGitRepo: () => true,
  useGitLoadingStatus: () => false,
  useGitLoadingLog: () => false,
}));
mock.module('@/hooks/useNestedGitDirectory', () => ({ useNestedGitDirectory: () => ({ rootIsGitRepo: true, gitDirectory: '/repo', nestedRepos: [] }) }));
mock.module('@/hooks/useWorktreeBootstrapPending', () => ({ useWorktreeBootstrapPending: () => false }));
mock.module('@/hooks/useRuntimeAPIs', () => ({
  useRuntimeAPIs: () => ({
    git: supportsUndoLastUnpushedCommit ? git : unsupportedGit,
  }),
}));
mock.module('@/stores/useUIStore', () => ({ useUIStore: () => false }));
mock.module('@/hooks/useDetectedWorktreeRoot', () => ({ useDetectedWorktreeMetadata: () => undefined }));
mock.module('@/sync/session-worktree-store', () => ({ useSessionWorktreeStore: () => undefined }));
mock.module('@/sync/session-worktree-contract', () => ({ getSessionWorktreeRepairActions: () => [], getMutationBlockingReasons: () => [] }));
mock.module('@/lib/worktrees/worktreeStatus', () => ({ getRootBranch: () => Promise.resolve(null) }));
mock.module('@/lib/gitApi', () => ({ generateCommitMessage: () => Promise.resolve({ message: {} }), getGitWorktreeBootstrapStatus: () => Promise.resolve({ status: 'ready' }) }));
mock.module('@/lib/sessionEvents', () => ({ sessionEvents: { onGitRefreshHint: () => () => undefined } }));
mock.module('@/stores/useGitHubPrStatusStore', () => ({ useGitHubPrStatusStore: () => null, getFreshestPrStatusForBranch: () => null }));
mock.module('./git/gitIndexMutationQueue', () => ({ createGitIndexMutationQueue: () => ({ flush: () => undefined, clear: () => undefined, size: () => 0, isRunning: () => false, enqueue: () => undefined }) }));
mock.module('@/lib/utils', () => ({ cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ') }));
mock.module('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
mock.module('@/components/ui', () => ({ toast: { success: (message: string) => toastSuccesses.push(message), error: (message: string) => toastErrors.push(message), warning: () => undefined, info: () => undefined } }));
mock.module('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) => open ? <>{children}</> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
mock.module('@/components/ui/button', () => ({ Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} /> }));
mock.module('@/components/ui/command', () => ({ Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, CommandInput: () => <input />, CommandItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
mock.module('@/components/icon/Icon', () => ({ Icon: () => null }));
mock.module('@/components/ui/ScrollableOverlay', () => ({ ScrollableOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
mock.module('@/components/ui/ScrollShadow', () => ({ ScrollShadow: () => null }));
mock.module('./git/GitHeader', () => ({ GitHeader: ({ onUndoLastUnpushedCommit }: { onUndoLastUnpushedCommit?: () => void }) => onUndoLastUnpushedCommit ? <button data-testid="undo-opener" onClick={onUndoLastUnpushedCommit}>undo</button> : null }));
mock.module('./git/NestedRepoResolutionStates', () => ({ NestedRepoResolutionStates: () => null }));
mock.module('./git/GitRepositoriesPanel', () => ({ GitRepositoriesPanel: () => null }));
mock.module('./git/IntegrateCommitsSection', () => ({ IntegrateCommitsSection: () => null }));
mock.module('./git/StashesDialog', () => ({ StashesDialog: () => null }));
mock.module('./git/ChangesPanel', () => ({ ChangesPanel: () => null }));
mock.module('./git/CommitSection', () => ({ CommitSection: () => null }));
mock.module('./git/GitEmptyState', () => ({ GitEmptyState: () => null }));
mock.module('./git/HistorySection', () => ({ HistorySection: () => null }));
mock.module('./git/ConflictDialog', () => ({ ConflictDialog: () => null }));
mock.module('./git/StashDialog', () => ({ StashDialog: () => null }));
mock.module('./git/DirtyBranchSwitchDialog', () => ({ DirtyBranchSwitchDialog: () => null }));
mock.module('./git/InProgressOperationBanner', () => ({ InProgressOperationBanner: () => null }));
mock.module('./git/BranchIntegrationSection', () => ({ BranchIntegrationSection: () => null }));
mock.module('./git/baseBranch', () => ({ deriveBaseBranch: () => null }));

const { GitView } = await import('./GitView');

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    HTMLElement: browser.HTMLElement,
    Element: browser.Element,
    Node: browser.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  supportsUndoLastUnpushedCommit = true;
  undoCalls.length = 0;
  refreshCalls.length = 0;
  toastSuccesses.length = 0;
  toastErrors.length = 0;
  resolveUndo = null;
  undoError = null;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

test('hides undo entry when runtime does not support it', async () => {
  supportsUndoLastUnpushedCommit = false;
  await act(async () => root.render(<GitView isActive />));
  expect(host.querySelector('[data-testid="undo-opener"]')).toBeNull();
});

test('confirms undo once, refreshes repository state, and closes after success', async () => {
  await act(async () => root.render(<GitView isActive />));

  const opener = host.querySelector<HTMLButtonElement>('[data-testid="undo-opener"]');
  if (!opener) throw new Error('Undo opener missing');
  await act(async () => opener.click());
  expect(host.textContent).toContain('gitView.undoLastUnpushedCommit.title');

  const confirm = [...host.querySelectorAll('button')].find((button) => button.textContent === 'gitView.undoLastUnpushedCommit.confirm');
  if (!confirm) throw new Error('Undo confirm missing');
  await act(async () => {
    confirm.click();
    confirm.click();
  });
  expect(undoCalls).toEqual(['/repo']);

  await act(async () => resolveUndo?.());
  expect(host.textContent).not.toContain('gitView.undoLastUnpushedCommit.title');
  expect(toastSuccesses).toEqual(['gitView.undoLastUnpushedCommit.success']);
  expect(refreshCalls.some((entry) => entry === 'status:/repo')).toBe(true);
  expect(refreshCalls.some((entry) => entry === 'branches:/repo')).toBe(true);
  expect(refreshCalls.some((entry) => entry === 'log:/repo')).toBe(true);
});

test('keeps undo dialog open and reports failure', async () => {
  undoError = new Error('undo failed');
  await act(async () => root.render(<GitView isActive />));

  const opener = host.querySelector<HTMLButtonElement>('[data-testid="undo-opener"]');
  if (!opener) throw new Error('Undo opener missing');
  await act(async () => opener.click());

  const confirm = [...host.querySelectorAll('button')].find((button) => button.textContent === 'gitView.undoLastUnpushedCommit.confirm');
  if (!confirm) throw new Error('Undo confirm missing');
  await act(async () => confirm.click());

  expect(host.textContent).toContain('gitView.undoLastUnpushedCommit.title');
  expect(toastErrors).toEqual(['undo failed']);
});
