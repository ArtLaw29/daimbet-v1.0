import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';

type Row = {
  created_at: string;
  user_id: string;
  delta_dc: number;
  reason: string;
};

const GAME_TYPES = [
  { value: 'all', label: 'Tous les jeux' },
  { value: 'Blackjack', label: '🎰 Blackjack' },
  { value: 'Roulette', label: '🎡 Roulette' },
  { value: 'Pari', label: '🎯 Paris (DAIMBet)' },
  { value: 'Pari externe', label: '🤝 Paris externes' },
  { value: 'Défi', label: '⚔️ Défis (Pendu/P4/Échecs)' },
  { value: 'Sondage', label: '🗳️ Sondages' },
  { value: 'Tournoi', label: '🏆 Tournois' },
  { value: 'Mot du jour', label: '🔠 Mot du jour' },
  { value: 'Sudoku', label: '🔢 Sudoku' },
  { value: 'Mots fléchés', label: '✏️ Mots fléchés' },
  { value: 'Autre', label: 'Autre / Admin' },
];

function classifyGame(reason: string): string {
  const r = (reason || '').toLowerCase();
  if (r.includes('blackjack')) return 'Blackjack';
  if (r.includes('roulette')) return 'Roulette';
  if (r.includes('pari externe')) return 'Pari externe';
  if (r.includes('défi') || r.includes('defi')) return 'Défi';
  if (r.includes('sondage')) return 'Sondage';
  if (r.includes('tournoi')) return 'Tournoi';
  if (r.includes('wordle') || r.includes('mot du jour')) return 'Mot du jour';
  if (r.includes('sudoku')) return 'Sudoku';
  if (r.includes('mots fléchés') || r.includes('mots fleches')) return 'Mots fléchés';
  if (r.includes('mise sur') || r.includes('gain pari') || r.includes('rétractation') || r.includes('pari')) return 'Pari';
  return 'Autre';
}

function statusFromDelta(delta: number): string {
  if (delta > 0) return 'Victoire';
  if (delta < 0) return 'Mise/Défaite';
  return 'Égalité';
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function AdminGlobalReport() {
  const { isAdmin } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [gameType, setGameType] = useState('all');
  const [loading, setLoading] = useState(false);

  if (!isAdmin) return null;

  const exportCSV = async () => {
    setLoading(true);
    try {
      const fromISO = new Date(dateFrom + 'T00:00:00').toISOString();
      const toISO = new Date(dateTo + 'T23:59:59').toISOString();

      // Paginated fetch to avoid 1000-row cap and browser crashes
      const all: Row[] = [];
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('solde_history')
          .select('created_at,user_id,delta_dc,reason')
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .order('user_id', { ascending: true })
          .order('created_at', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const batch = (data || []) as Row[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        offset += PAGE;
        if (offset > 200000) break; // safety
      }

      // Fetch profiles map
      const userIds = Array.from(new Set(all.map(r => r.user_id)));
      const profMap: Record<string, { name: string; balance: number }> = {};
      if (userIds.length > 0) {
        for (let i = 0; i < userIds.length; i += 200) {
          const slice = userIds.slice(i, i + 200);
          const { data: profs } = await supabase
            .from('profiles')
            .select('user_id,display_name,balance')
            .in('user_id', slice);
          (profs || []).forEach((p: any) => {
            profMap[p.user_id] = { name: p.display_name || '(sans nom)', balance: p.balance ?? 0 };
          });
        }
      }

      // Compute "balance after" per user by reverse cumulative from current balance
      // We need ALL history after dateTo to backtrack precisely. Simpler: compute running balance forward
      // assuming starting balance = current_balance - sum(deltas after dateTo) - sum(deltas in range up to row).
      // To keep it lightweight and accurate within the selected range, fetch deltas AFTER toISO once per user.
      const afterSumByUser: Record<string, number> = {};
      if (userIds.length > 0) {
        // Fetch sum of deltas after toISO in batches
        for (let i = 0; i < userIds.length; i += 200) {
          const slice = userIds.slice(i, i + 200);
          const { data: afterRows } = await supabase
            .from('solde_history')
            .select('user_id,delta_dc')
            .in('user_id', slice)
            .gt('created_at', toISO);
          (afterRows || []).forEach((r: any) => {
            afterSumByUser[r.user_id] = (afterSumByUser[r.user_id] || 0) + (r.delta_dc || 0);
          });
        }
      }

      // Group by user, sort by time asc, compute balances
      const byUser: Record<string, Row[]> = {};
      all.forEach(r => { (byUser[r.user_id] ||= []).push(r); });

      const lines: string[] = [];
      lines.push([
        'Date', 'User ID', 'Display Name', 'Type de jeu', 'Statut',
        'Mise / Delta DC', 'Gain ou Perte net (DC)',
        'Solde avant', 'Solde après', 'Détails (raison)',
      ].map(csvEscape).join(','));

      let totalRows = 0;
      Object.entries(byUser).forEach(([uid, rows]) => {
        rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
        const prof = profMap[uid] || { name: '(inconnu)', balance: 0 };
        const sumInRange = rows.reduce((s, r) => s + (r.delta_dc || 0), 0);
        // Solde au début de la fenêtre = solde actuel - deltas après - deltas dans la fenêtre
        let running = (prof.balance || 0) - (afterSumByUser[uid] || 0) - sumInRange;

        rows.forEach(r => {
          const before = running;
          const after = before + (r.delta_dc || 0);
          running = after;
          const game = classifyGame(r.reason);
          if (gameType !== 'all' && game !== gameType) return;
          totalRows++;
          lines.push([
            r.created_at,
            uid,
            prof.name,
            game,
            statusFromDelta(r.delta_dc),
            r.delta_dc,
            r.delta_dc,
            before,
            after,
            r.reason,
          ].map(csvEscape).join(','));
        });
      });

      if (totalRows === 0) {
        toast.info('Aucune donnée pour cette période / ce filtre');
        return;
      }

      const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `daimbet-rapport-global-${dateFrom}_${dateTo}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Rapport exporté : ${totalRows} lignes 📊`);
    } catch (e: any) {
      console.error(e);
      toast.error('Erreur export : ' + (e?.message || 'inconnue'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4">
      <div>
        <h3 className="font-display text-lg flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" /> Rapport global des jeux (CSV)
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Export comptable complet : Blackjack, Roulette, paris, défis, sondages, tournois, jeux quotidiens.
          Une ligne par mouvement financier, avec solde avant/après.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Du</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} max={dateTo} />
        </div>
        <div>
          <Label className="text-xs">Au</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom} />
        </div>
        <div>
          <Label className="text-xs">Type de jeu</Label>
          <Select value={gameType} onValueChange={setGameType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GAME_TYPES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={exportCSV} disabled={loading} className="gold-gradient w-full sm:w-auto">
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
        Télécharger Rapport Complet (CSV)
      </Button>
    </div>
  );
}
