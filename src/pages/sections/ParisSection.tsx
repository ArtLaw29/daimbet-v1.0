import SectionTabs from '@/components/SectionTabs';
import EventsPage from '@/pages/EventsPage';
import PariExternePage from '@/pages/PariExternePage';

export default function ParisSection() {
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