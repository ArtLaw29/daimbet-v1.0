import SectionTabs from '@/components/SectionTabs';
import EventsPage from '@/pages/EventsPage';
import PariExternePage from '@/pages/PariExternePage';
import { useGameStatus } from '@/hooks/useGameStatus';
import { useAuth } from '@/contexts/AuthContext';
import SectionSuspendedMessage from '@/components/SectionSuspendedMessage';

export default function ParisSection() {
  const { suspended } = useGameStatus('section_paris');
  const { isAdmin } = useAuth();
  if (suspended && !isAdmin) return <SectionSuspendedMessage />;
  return (
    <SectionTabs
      title="Paris"
      titleEmoji="💸"
      subtitle="Mise tes DAIMcoins ou défie tes potes IRL"
      tabs={[
        { key: 'paris_dc',       label: 'Paris DC',       emoji: '💸', render: () => <EventsPage /> },
        { key: 'paris_externes', label: 'Paris externes', emoji: '🤝', render: () => <PariExternePage /> },
      ]}
    />
  );
}