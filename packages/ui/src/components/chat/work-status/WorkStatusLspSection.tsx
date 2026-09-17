import React from 'react';
import { useI18n } from '@/lib/i18n';
import { useDirectorySync } from '@/sync/sync-context';
import { WorkStatusCollapsibleSection, WorkStatusRow, WorkStatusValue } from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';
import type { State } from '@/sync/types';

type Props = {
  directory: string | null;
};

export const WorkStatusLspSection: React.FC<Props> = ({ directory }) => {
  const { t } = useI18n();
  const servers = useDirectorySync(
    React.useCallback((state: State) => state.lsp, []),
    directory ?? undefined,
  );
  const connected = servers.filter((server) => server.status === 'connected').length;

  useReportWorkStatusPresence('lsp', servers.length > 0);

  if (servers.length === 0) return null;

  return (
    <WorkStatusCollapsibleSection
      id="lsp"
      title={t('chat.workStatus.section.lsp')}
      icon="scan-2"
      summary={`${connected}/${servers.length}`}
    >
      {servers.map((server) => {
        const isConnected = server.status === 'connected';
        return (
          <WorkStatusRow
            key={server.id}
            label={server.name}
            muted={!isConnected}
            value={(
              <WorkStatusValue tone={isConnected ? 'success' : 'error'}>
                {t(isConnected ? 'chat.workStatus.lsp.connected' : 'chat.workStatus.lsp.error')}
              </WorkStatusValue>
            )}
          />
        );
      })}
    </WorkStatusCollapsibleSection>
  );
};
