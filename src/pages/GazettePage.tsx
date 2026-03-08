import { INTRO_GAZETTE } from '@/components/TabIntro';

export default function GazettePage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl pb-20 md:pb-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-display gold-text">📰 La Gazette du Daim</h1>
      </div>
      {INTRO_GAZETTE}
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">Le fil d'actualité arrive bientôt...</p>
        <p className="text-sm mt-1">Jordaim Belfort prépare la première édition 🦌</p>
      </div>
    </div>
  );
}
