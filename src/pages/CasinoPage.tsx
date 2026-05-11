import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';

const DC_GAMES = [
  { id: 'blackjack', emoji: '🃏', label: 'Blackjack', subtitle: 'Bats le croupier', route: '/jeux/blackjack', available: true },
  { id: 'wordle', emoji: '🔠', label: 'Wordle du jour', subtitle: 'Défi quotidien', route: '/jeux/wordle', available: true },
  { id: 'sudoku', emoji: '🔢', label: 'Sudoku Race', subtitle: 'Le plus rapide gagne', route: '/jeux/sudoku', available: true },
  { id: 'mots-croises', emoji: '📝', label: 'Mots croisés', subtitle: 'Grille du jour', route: '/jeux/mots-croises', available: true },
  { id: 'duels', emoji: '⚔️', label: 'Duels', subtitle: 'Pendu, P4, Échecs', route: '/jeux/duels', available: true },
  { id: 'pari-externe', emoji: '🤝', label: 'Pari externe', subtitle: 'Parie sur la vraie vie', route: '/jeux/pari-externe', available: true },
];

export default function CasinoPage() {
  const navigate = useNavigate();
  return (
    <div className="container mx-auto px-4 py-6 pb-20 md:pb-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-display gold-text">🎰 Casino</h1>
        <p className="text-sm text-muted-foreground mt-1">Mise tes DAIMcoins, défie tes potes, ou tente le contenu du jour</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {DC_GAMES.map(g => (
          <button
            key={g.id}
            onClick={() => g.available && navigate(g.route)}
            disabled={!g.available}
            className={`p-4 rounded-xl border text-left transition-all ${
              g.available
                ? 'border-primary/30 bg-card hover:border-primary hover:shadow-lg hover:-translate-y-0.5'
                : 'border-border/50 bg-muted/20 opacity-60 cursor-not-allowed'
            }`}
          >
            <div className="text-3xl mb-2">{g.emoji}</div>
            <p className="font-semibold text-sm">{g.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {g.available ? g.subtitle : <span className="inline-flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Bientôt</span>}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}