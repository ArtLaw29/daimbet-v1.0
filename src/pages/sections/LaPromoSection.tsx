import SectionTabs from '@/components/SectionTabs';
import GazettePage from '@/pages/GazettePage';
import LeaderboardPage from '@/pages/LeaderboardPage';
import PretsPage from '@/pages/PretsPage';

export default function LaPromoSection() {
  return (
    <SectionTabs
      title="La promo"
      titleEmoji="📰"
      subtitle="L'actu de la promo et le classement"
      tabs={[
        { key: 'gazette',    label: 'Gazette',    emoji: '📰', render: () => <GazettePage /> },
        { key: 'prets',      label: 'Prêts',      emoji: '🤝', render: () => <PretsPage /> },
        { key: 'classement', label: 'Classement', emoji: '🏅', render: () => <LeaderboardPage /> },
      ]}
    />
  );
}