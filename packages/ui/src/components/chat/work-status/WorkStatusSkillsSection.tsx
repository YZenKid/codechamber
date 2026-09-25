import React from 'react';
import { useI18n } from '@/lib/i18n';
import { useConfigStore } from '@/stores/useConfigStore';
import { selectSkillsForDirectory, useSkillsStore, type DiscoveredSkill } from '@/stores/useSkillsStore';
import { WorkStatusCollapsibleSection, WorkStatusRow } from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';

type Props = {
  directory: string | null;
};

const EMPTY_SKILLS: DiscoveredSkill[] = [];

export const WorkStatusSkillsSection: React.FC<Props> = ({ directory }) => {
  const { t } = useI18n();
  const skills = useSkillsStore(
    React.useCallback(
      (state) => directory?.trim() ? selectSkillsForDirectory(state, directory) : EMPTY_SKILLS,
      [directory],
    ),
  );
  const loadSkills = useSkillsStore((state) => state.loadSkills);
  const isConnected = useConfigStore((state) => state.isConnected);

  // A null panel directory means there is no selected project to ask (managed
  // Chats deliberately pass none). Without that distinction, an empty directory
  // would fall back to whatever project the app happens to have active.
  React.useEffect(() => {
    if (!directory?.trim()) return;
    void loadSkills(directory);
  }, [directory, isConnected, loadSkills]);

  useReportWorkStatusPresence('skills', skills.length > 0);

  if (skills.length === 0) return null;

  const summary = skills.length === 1
    ? t('chat.workStatus.breakdown.skillCountSingle', { count: skills.length })
    : t('chat.workStatus.breakdown.skillCountPlural', { count: skills.length });

  return (
    <WorkStatusCollapsibleSection
      id="skills"
      title={t('chat.workStatus.section.skills')}
      icon="sparkling"
      summary={summary}
    >
      <div className="max-h-56 overflow-y-auto">
        {skills.map((skill) => <WorkStatusRow key={`${skill.source}:${skill.path}`} label={skill.name} muted />)}
      </div>
    </WorkStatusCollapsibleSection>
  );
};
