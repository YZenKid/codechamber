import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useGitLoadingStatus, useGitStatus } from '@/stores/useGitStore';

export interface GitRepositoriesPanelProps {
  repositories: string[];
  repositoryRoot: string;
  selectedRepository: string | null;
  onSelectRepository: (repository: string) => void;
}

interface GitRepositoryRowProps {
  repository: string;
  repositoryRoot: string;
  selected: boolean;
  onSelectRepository: (repository: string) => void;
}

const relativeRepositoryName = (repository: string, repositoryRoot: string): string => {
  const normalizedRepository = repository.replaceAll('\\', '/').replace(/\/+$/, '');
  const normalizedRoot = repositoryRoot.replaceAll('\\', '/').replace(/\/+$/, '') || '/';
  const rootPrefix = normalizedRoot === '/' ? '/' : `${normalizedRoot}/`;
  const relativePath = normalizedRepository.startsWith(rootPrefix)
    ? normalizedRepository.slice(rootPrefix.length)
    : normalizedRepository;

  return relativePath || normalizedRepository.split('/').pop() || repository;
};

const GitRepositoryRow: React.FC<GitRepositoryRowProps> = ({
  repository,
  repositoryRoot,
  selected,
  onSelectRepository,
}) => {
  const { t } = useI18n();
  const status = useGitStatus(repository);
  const loading = useGitLoadingStatus(repository);
  const branch = status?.current.trim();
  const dirty = status ? !status.isClean : false;
  const hasSyncCounts = status ? status.ahead > 0 || status.behind > 0 : false;

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'w-full justify-start gap-2 rounded-none px-2 text-left normal-case',
        selected
          ? 'bg-interactive-selection text-interactive-selection-foreground hover:bg-interactive-selection hover:text-interactive-selection-foreground'
          : 'text-foreground'
      )}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelectRepository(repository)}
    >
      <Icon
        name="folder-3"
        className={cn(
          'size-4 shrink-0',
          selected ? 'text-interactive-selection-foreground/75' : 'text-muted-foreground'
        )}
      />
      <span className="min-w-0 flex-1 truncate typography-ui-label font-medium">
        {relativeRepositoryName(repository, repositoryRoot)}
      </span>

      {status ? (
        <span
          className={cn(
            'flex min-w-0 shrink items-center gap-1.5 typography-micro',
            selected ? 'text-interactive-selection-foreground/75' : 'text-muted-foreground'
          )}
        >
          {branch ? (
            <span className="flex min-w-0 items-center gap-1">
              <Icon name="git-branch" className="size-3 shrink-0" />
              <span className="max-w-28 truncate">{branch}</span>
            </span>
          ) : null}
          {dirty ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-[var(--status-warning)]"
              title={t('gitView.dirtySwitch.title')}
            >
              <span className="sr-only">{t('gitView.dirtySwitch.title')}</span>
            </span>
          ) : null}
          {hasSyncCounts ? (
            <span
              className="flex shrink-0 items-center gap-1 tabular-nums"
              aria-label={t('gitView.sync.syncCounts', {
                behind: status.behind,
                ahead: status.ahead,
              })}
            >
              {status.behind > 0 ? (
                <span aria-hidden="true" className="flex items-center text-[var(--status-warning)]">
                  <Icon name="arrow-down" className="size-3" />
                  {status.behind}
                </span>
              ) : null}
              {status.ahead > 0 ? (
                <span aria-hidden="true" className="flex items-center text-[var(--status-info)]">
                  <Icon name="arrow-up" className="size-3" />
                  {status.ahead}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      ) : loading ? (
        <span className="shrink-0 text-muted-foreground">
          <Icon name="loader-4" className="size-3.5 animate-spin" />
          <span className="sr-only">{t('gitView.loading.loading')}</span>
        </span>
      ) : null}
    </Button>
  );
};

export const GitRepositoriesPanel: React.FC<GitRepositoriesPanelProps> = ({
  repositories,
  repositoryRoot,
  selectedRepository,
  onSelectRepository,
}) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(true);

  return (
    <section className="border-y border-border/50 bg-sidebar">
      <Button
        variant="ghost"
        size="xs"
        className="w-full justify-start gap-1 rounded-none px-2 text-muted-foreground normal-case hover:text-foreground"
        aria-label={t('gitView.repositories.title')}
        title={t('gitView.repositories.title')}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <Icon
          name="arrow-down-s"
          className={cn('size-3.5 shrink-0 transition-transform', !expanded && '-rotate-90')}
        />
        <span className="truncate typography-micro font-semibold uppercase tracking-[0.08em]">
          {t('gitView.repositories.title')}
        </span>
        <span className="ml-auto tabular-nums typography-micro">{repositories.length}</span>
      </Button>

      {expanded ? (
        <div role="list">
          {repositories.map((repository) => (
            <div key={repository} role="listitem">
              <GitRepositoryRow
                repository={repository}
                repositoryRoot={repositoryRoot}
                selected={repository === selectedRepository}
                onSelectRepository={onSelectRepository}
              />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};
