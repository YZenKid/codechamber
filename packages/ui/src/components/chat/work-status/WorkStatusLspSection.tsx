import React from 'react';
import { useI18n } from '@/lib/i18n';
import { useDirectorySync } from '@/sync/sync-context';
import { WorkStatusCollapsibleSection, WorkStatusRow } from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';
import type { State } from '@/sync/types';

type Props = {
  directory: string | null;
};

export const WorkStatusLspSection: React.FC<Props> = ({ directory }) => {
  const { t } = useI18n();
  const selectedDirectory = directory?.trim() ? directory : '';
  const hasDirectory = selectedDirectory !== '';
  const config = useDirectorySync(
    React.useCallback((state: State) => state.config, []),
    selectedDirectory || undefined,
  );
  const servers = React.useMemo(() => {
    const lsp = config.lsp;
    if (lsp === undefined || lsp === true || lsp === false) return [];

    return Object.entries(lsp)
      .filter(([, entry]) => 'command' in entry && !entry.disabled && entry.command.length > 0)
      .map(([name]) => name)
      .sort();
  }, [config]);

  const present = hasDirectory && servers.length > 0;
  useReportWorkStatusPresence('lsp', present);

  if (!present) return null;

  return (
    <WorkStatusCollapsibleSection
      id="lsp"
      title={t('chat.workStatus.section.lsp')}
      icon="scan-2"
      summary={servers.length === 1 ? servers[0] : servers.length}
    >
      {servers.map((name) => (
        <WorkStatusRow key={name} label={name} muted />
      ))}
    </WorkStatusCollapsibleSection>
  );
};
