import { registerMultiplayerGame } from '../gameRegistry';
import UnoGame from '@/components/games/uno/UnoGame';
import { createElement } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

registerMultiplayerGame({
  key: 'uno',
  label: 'Uno',
  emoji: '🃏',
  minPlayers: 2,
  maxPlayers: 8,
  SettingsForm: ({ value, onChange }) => {
    const mise = Number(value.mise ?? 0);
    const malusEnabled = !!value.malus_enabled;
    const malusAmount = Number(value.malus_amount ?? 0);
    return createElement(
      'div',
      { className: 'space-y-4' },
      createElement(
        'div',
        { className: 'space-y-1', key: 'mise' },
        createElement(Label, { htmlFor: 'uno-mise' }, 'Mise par joueur (DC)'),
        createElement(Input, {
          id: 'uno-mise',
          type: 'number',
          min: 0,
          value: mise,
          onChange: (e: any) => onChange({ ...value, mise: Math.max(0, Number(e.target.value) || 0) }),
        }),
        createElement('p', { className: 'text-xs text-muted-foreground' },
          'Débitée au lancement de la partie. Reversée au gagnant.'),
      ),
      createElement(
        'div',
        { className: 'flex items-center justify-between gap-3 pt-2', key: 'toggle' },
        createElement(Label, { htmlFor: 'uno-malus', className: 'cursor-pointer' },
          'Malus au joueur avec le plus de cartes'),
        createElement(Switch, {
          id: 'uno-malus',
          checked: malusEnabled,
          onCheckedChange: (c: boolean) => onChange({ ...value, malus_enabled: c }),
        }),
      ),
      malusEnabled
        ? createElement(
            'div',
            { className: 'space-y-1', key: 'malus' },
            createElement(Label, { htmlFor: 'uno-malus-amount' }, 'Montant du malus (DC)'),
            createElement(Input, {
              id: 'uno-malus-amount',
              type: 'number',
              min: 0,
              value: malusAmount,
              onChange: (e: any) => onChange({ ...value, malus_amount: Math.max(0, Number(e.target.value) || 0) }),
            }),
            createElement('p', { className: 'text-xs text-muted-foreground' },
              'Reversé au gagnant. En cas d’égalité, divisé entre les ex æquo.'),
          )
        : null,
    );
  },
  summarizeSettings: (s) => {
    const parts: string[] = [];
    if (Number(s.mise ?? 0) > 0) parts.push(`Mise ${s.mise} DC`);
    if (s.malus_enabled) parts.push(`Malus ${s.malus_amount ?? 0} DC`);
    return parts.join(' · ') || 'Sans mise';
  },
  renderGame: ({ roomId }) => createElement(UnoGame, { roomId }),
});