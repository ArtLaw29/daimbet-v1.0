import { registerMultiplayerGame } from '../gameRegistry';
import PokerTable from '@/components/games/poker/PokerTable';
import { createElement } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

registerMultiplayerGame({
  key: 'poker',
  label: 'Poker',
  emoji: '♠️',
  minPlayers: 2,
  maxPlayers: 8,
  SettingsForm: ({ value, onChange }) => {
    const buyIn = Number(value.buy_in ?? 100);
    const sb = Number(value.small_blind ?? Math.max(1, Math.floor(buyIn / 20)));
    return createElement('div', { className: 'space-y-3' },
      createElement('div', { key: 'b', className: 'space-y-1' },
        createElement(Label, { htmlFor: 'p-bi' }, 'Buy-in (DC, min 10)'),
        createElement(Input, {
          id: 'p-bi', type: 'number', min: 10, value: buyIn,
          onChange: (e: any) => onChange({ ...value, buy_in: Math.max(10, Number(e.target.value) || 10) }),
        }),
        createElement('p', { className: 'text-xs text-muted-foreground' },
          'Débité au lancement. Constitue le stack initial.'),
      ),
      createElement('div', { key: 's', className: 'space-y-1' },
        createElement(Label, { htmlFor: 'p-sb' }, 'Small blind (DC)'),
        createElement(Input, {
          id: 'p-sb', type: 'number', min: 1, value: sb,
          onChange: (e: any) => onChange({ ...value, small_blind: Math.max(1, Number(e.target.value) || 1) }),
        }),
        createElement('p', { className: 'text-xs text-muted-foreground' },
          `Big blind = 2× small blind = ${sb * 2} DC.`),
      ),
    );
  },
  summarizeSettings: (s) => {
    const bi = Number(s.buy_in ?? 100);
    const sb = Number(s.small_blind ?? Math.max(1, Math.floor(bi / 20)));
    return `Buy-in ${bi} DC · SB ${sb}/BB ${sb * 2}`;
  },
  renderGame: ({ roomId }) => createElement(PokerTable, { roomId }),
});