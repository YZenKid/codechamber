import { afterEach, describe, expect, it, mock } from 'bun:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

mock.module('vscode', () => ({
  extensions: { getExtension: () => undefined },
  Uri: { file: (fsPath) => ({ fsPath }) },
}));

const { undoLastUnpushedCommit } = await import('./gitService.ts?undo-last-unpushed-commit-test');

const tempDirs = [];

const createTempDir = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-vscode-git-'));
  tempDirs.push(directory);
  return directory;
};

const runGit = (cwd, args) => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const canRunGit = () => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const createRepositoryWithUpstream = () => {
  const remote = createTempDir();
  const repository = createTempDir();
  runGit(remote, ['init', '--bare', '--initial-branch=main']);
  runGit(repository, ['init', '-b', 'main']);
  runGit(repository, ['config', 'user.email', 'test@example.com']);
  runGit(repository, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(repository, 'README.md'), 'base\n');
  runGit(repository, ['add', 'README.md']);
  runGit(repository, ['commit', '-m', 'base']);
  runGit(repository, ['remote', 'add', 'origin', remote]);
  runGit(repository, ['push', '-u', 'origin', 'main']);
  return repository;
};

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('VS Code undo last unpushed commit', () => {
  it('soft-resets only the latest unpushed commit', async () => {
    if (!canRunGit()) return;

    const repository = createRepositoryWithUpstream();
    const upstreamHead = runGit(repository, ['rev-parse', '@{u}']).trim();
    fs.writeFileSync(path.join(repository, 'README.md'), 'changed\n');
    runGit(repository, ['commit', '-am', 'local change']);

    await expect(undoLastUnpushedCommit(repository)).resolves.toEqual({ success: true });

    expect(runGit(repository, ['rev-parse', 'HEAD']).trim()).toBe(upstreamHead);
    expect(runGit(repository, ['diff', '--cached', '--name-only']).trim()).toBe('README.md');
  });

  it('rejects when HEAD has no configured upstream', async () => {
    if (!canRunGit()) return;

    const repository = createTempDir();
    runGit(repository, ['init', '-b', 'main']);
    runGit(repository, ['config', 'user.email', 'test@example.com']);
    runGit(repository, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(repository, 'README.md'), 'base\n');
    runGit(repository, ['add', 'README.md']);
    runGit(repository, ['commit', '-m', 'base']);

    await expect(undoLastUnpushedCommit(repository)).rejects.toThrow('Current branch has no upstream');
  });

  it('rejects when HEAD has no unpushed commits', async () => {
    if (!canRunGit()) return;

    const repository = createRepositoryWithUpstream();

    await expect(undoLastUnpushedCommit(repository)).rejects.toThrow('Current branch has no unpushed commits');
  });

  for (const operationFile of ['MERGE_HEAD', 'BISECT_LOG']) {
    it(`rejects during ${operationFile}`, async () => {
      if (!canRunGit()) return;

      const repository = createRepositoryWithUpstream();
      fs.writeFileSync(path.join(repository, 'README.md'), 'local\n');
      runGit(repository, ['commit', '-am', 'local change']);
      fs.writeFileSync(path.join(repository, '.git', operationFile), runGit(repository, ['rev-parse', 'HEAD']).trim());

      await expect(undoLastUnpushedCommit(repository)).rejects.toThrow('Cannot undo commit while a Git operation is in progress');
    });
  }
});
