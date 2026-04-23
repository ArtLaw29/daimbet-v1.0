import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, ScrollText, Filter } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LogEntry {
  id: string;
  action_type: string;
  target_type: string;
  target_id: string | null;
  description: string;
  motif: string | null;
  actor_id: string | null;
  created_at: string;
}

const ACTION_TYPES = ['suppression', 'suspension', 'validation', 'rejet', 'reinitialisation', 'modification'];
const TARGET_TYPES = ['pari', 'sondage', 'tournoi', 'kiss_marry', 'ticket', 'utilisateur', 'proposition', 'gouvernement', 'fantasy', 'gazette', 'autre'];

export default function AdminModerationLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [targetFilter, setTargetFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('moderation_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) {
      toast.error('Erreur de chargement du journal');
      setLoading(false);
      return;
    }
    const list = (data || []) as LogEntry[];
    setEntries(list);

    // Fetch actor display names
    const ids = Array.from(new Set(list.map(e => e.actor_id).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const { data: profs } = await (supabase as any).from('profiles_public').select('user_id, display_name').in('user_id', ids);
      const map: Record<string, string> = {};
      (profs || []).forEach(p => { map[p.user_id] = p.display_name; });
      setActorNames(map);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (actionFilter !== 'all' && e.action_type !== actionFilter) return false;
      if (targetFilter !== 'all' && e.target_type !== targetFilter) return false;
      if (dateFrom && new Date(e.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(e.created_at) > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [entries, actionFilter, targetFilter, dateFrom, dateTo]);

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Journal de modération — DAIMBET', 14, 16);
    doc.setFontSize(10);
    doc.text(`Généré le ${new Date().toLocaleString('fr-FR')} · ${filtered.length} entrée(s)`, 14, 22);

    autoTable(doc, {
      startY: 28,
      head: [['Date', 'Action', 'Cible', 'Description', 'Motif', 'Admin']],
      body: filtered.map(e => [
        new Date(e.created_at).toLocaleString('fr-FR'),
        e.action_type,
        e.target_type,
        e.description,
        e.motif || '—',
        e.actor_id ? (actorNames[e.actor_id] || e.actor_id.slice(0, 8)) : '—',
      ]),
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 30, 30] },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 22 },
        2: { cellWidth: 22 },
        3: { cellWidth: 60 },
        4: { cellWidth: 35 },
        5: { cellWidth: 22 },
      },
    });

    doc.save(`journal-moderation-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF exporté');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-display flex items-center gap-2">
          <ScrollText className="w-5 h-5" /> Journal de modération
        </h2>
        <Button onClick={exportPdf} disabled={filtered.length === 0} size="sm">
          <Download className="w-4 h-4 mr-1" /> Exporter en PDF
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Trace immuable de toutes les actions de modération (insert-only). Cette section est strictement réservée à l'administrateur.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 rounded-lg bg-muted/30 border border-border">
        <div>
          <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Filter className="w-3 h-3" /> Action</label>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {ACTION_TYPES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Cible</label>
          <Select value={targetFilter} onValueChange={setTargetFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {TARGET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Du</label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Au</label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Aucune entrée pour ces filtres.</p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Date</th>
                  <th className="text-left p-2 font-medium">Action</th>
                  <th className="text-left p-2 font-medium">Cible</th>
                  <th className="text-left p-2 font-medium">Description</th>
                  <th className="text-left p-2 font-medium">Motif</th>
                  <th className="text-left p-2 font-medium">Admin</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-2 whitespace-nowrap">{new Date(e.created_at).toLocaleString('fr-FR')}</td>
                    <td className="p-2"><span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] uppercase">{e.action_type}</span></td>
                    <td className="p-2">{e.target_type}</td>
                    <td className="p-2">{e.description}</td>
                    <td className="p-2 text-muted-foreground">{e.motif || '—'}</td>
                    <td className="p-2 text-muted-foreground">{e.actor_id ? (actorNames[e.actor_id] || e.actor_id.slice(0, 8)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
