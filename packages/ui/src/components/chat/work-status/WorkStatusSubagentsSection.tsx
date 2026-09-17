import React from 'react';
import { useI18n } from '@/lib/i18n';
import { useAllLiveSessions, useAllSessionStatuses, useDirectorySync } from '@/sync/sync-context';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { isVSCodeRuntime } from '@/lib/desktop';
import { isEmbeddedSessionChat } from '@/components/layout/contextPanelEmbeddedChat';
import { WorkStatusCollapsibleSection, WorkStatusRow, WorkStatusValue } from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';
import { formatCost } from './subagentCost';
import { useSubagentCostRollup } from './useSubagentCostRollup';
import type { State } from '@/sync/types';

type Props = {
  sessionId: string | null;
  directory: string | null;
};

const SECTION_ID = 'subagents';

type SubagentState = 'permission' | 'question' | 'working' | 'done';

type SubagentRowProps = {
  label: string;
  state: SubagentState;
  cost: number;
  value: string;
  ariaLabel?: string;
  onClick?: () => void;
};

const subagentState = (blocked: boolean, asked: boolean, working: boolean): SubagentState => {
  if (blocked) return 'permission';
  if (asked) return 'question';
  return working ? 'working' : 'done';
};

const isWorking = (status: State['session_status'][string] | undefined): boolean =>
  status?.type === 'busy' || status?.type === 'retry';

const SubagentRow: React.FC<SubagentRowProps> = ({ label, state, cost, value, ariaLabel, onClick }) => (
  <WorkStatusRow
    onClick={onClick}
    ariaLabel={ariaLabel}
    label={label}
    value={(
      <>
        <WorkStatusValue tone={state === 'working' ? 'info' : state === 'done' ? 'muted' : 'warning'}>{value}</WorkStatusValue>
        {cost > 0 ? <WorkStatusValue tone="muted">{formatCost(cost)}</WorkStatusValue> : null}
      </>
    )}
  />
);

/**
 * Running subagents and, more importantly, their blockers: a permission request
 * raised by a child session has no representation in the transcript, so this
 * panel is the only place it becomes visible.
 */
export const WorkStatusSubagentsSection: React.FC<Props> = ({ sessionId, directory }) => {
  const { t } = useI18n();
  const isMobile = useUIStore((state) => state.isMobile);

  const liveSessions = useAllLiveSessions();
  const statuses = useAllSessionStatuses();
  const children = React.useMemo(
    () => (sessionId ? liveSessions.filter((candidate) => candidate.parentID === sessionId) : []),
    [liveSessions, sessionId],
  );

  // Each child's own subtree total (its cost plus every descendant of its
  // own), so nested subagent-of-subagent cost rolls up under the immediate
  // child row shown here rather than disappearing.
  const { perChildCost } = useSubagentCostRollup(sessionId);

  // One subscription covers every child: per-session hooks would multiply
  // store subscriptions by the number of subagents.
  const permissions = useDirectorySync(React.useCallback((state: State) => state.permission, []));
  const questions = useDirectorySync(React.useCallback((state: State) => state.question, []));

  const openContextPanelTab = useUIStore((state) => state.openContextPanelTab);
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);
  const setSectionExpanded = useUIStore((state) => state.setWorkStatusSectionExpanded);

  // Subagents appearing where there were none is the one moment this section
  // has something urgent to say, so it opens itself. Only on the empty→present
  // edge: re-expanding on every count change would fight a user who just
  // collapsed it.
  const hadChildren = React.useRef(children.length > 0);
  React.useEffect(() => {
    const present = children.length > 0;
    if (present && !hadChildren.current) setSectionExpanded(SECTION_ID, true);
    hadChildren.current = present;
  }, [children.length, setSectionExpanded]);

  // Same branch the transcript's Task tool takes: surfaces that cannot host an
  // embedded panel navigate to the child session instead of opening a tab.
  const openChildSession = React.useCallback((childId: string, label: string) => {
    if (!directory) return;
    if (isEmbeddedSessionChat() || isMobile || isVSCodeRuntime()) {
      setCurrentSession(childId, directory);
      return;
    }
    openContextPanelTab(directory, {
      mode: 'chat',
      dedupeKey: `session:${childId}`,
      label,
      readOnly: true,
    });
  }, [directory, isMobile, openContextPanelTab, setCurrentSession]);

  useReportWorkStatusPresence('subagents', children.length > 0);

  if (children.length === 0) return null;

  const workingChildren = children.filter((child) => isWorking(statuses[child.id])).length;
  const rowState = (childId: string): SubagentState => subagentState(
    (permissions[childId]?.length ?? 0) > 0,
    (questions[childId]?.length ?? 0) > 0,
    isWorking(statuses[childId]),
  );
  // Collapsed, one row speaks for the section. Blockers outrank agent order,
  // then work; done children never become a preview.
  const previewChild = children.find((child) => rowState(child.id) === 'permission')
    ?? children.find((child) => rowState(child.id) === 'question')
    ?? children.find((child) => rowState(child.id) === 'working');
  const renderChild = (child: State['session'][number]) => {
    const label = child.title?.trim() || t('chat.workStatus.subagent.untitled');
    const state = rowState(child.id);
    const value = state === 'permission'
      ? t('chat.workStatus.subagent.needsPermission')
      : state === 'question'
        ? t('chat.workStatus.subagent.askedQuestion')
        : state === 'working'
          ? t('chat.workStatus.subagent.working')
          : t('chat.workStatus.subagent.done');
    return (
      <SubagentRow
        key={child.id}
        label={label}
        state={state}
        cost={perChildCost.get(child.id) ?? 0}
        value={value}
        onClick={directory ? () => openChildSession(child.id, label) : undefined}
        ariaLabel={t('chat.workStatus.action.openSubagent', { name: label })}
      />
    );
  };

  return (
    <WorkStatusCollapsibleSection
      id={SECTION_ID}
      title={t('chat.workStatus.section.subagents')}
      icon="ai-agent"
      defaultExpanded
      summary={workingChildren > 0 ? `${workingChildren}/${children.length}` : children.length}
      collapsedContent={previewChild ? renderChild(previewChild) : null}
    >
      <div className="max-h-56 overflow-y-auto">
        {children.map(renderChild)}
      </div>
    </WorkStatusCollapsibleSection>
  );
};
