import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLoans } from '@/hooks/useLoans';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronDown, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

type Prof = { user_id: string; display_name: string | null; emoji: string | null };

export default function PretsPage() {
  const { user } = useAuth();
  const { loans } = useLoans();
  const [profiles, setProfiles] = useState<Record<string, Prof>>({});
  const [confirmRepay, setConfirmRepay] = useState<string | null>(null);
  const [repaying, setRepaying] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (supabase as any).from('profiles_public').select('user_id, display_name, emoji').then((res: any) => {
      const map: Record<string, Prof> = {};
      (res.data || []).forEach((p: Prof) => { if (p.user_id) map[p.user_id] = p; });
      setProfiles(map);
    });
  }, []);

  const nameOf = (id: string) => profiles[id]?.display_name || '?';
  const emojiOf = (id: string) => profiles[id]?.emoji || '🦌';

  const active = useMemo(() => loans.filter(l => l.status === 'active'), [loans]);
  const repaid = useMemo(() => loans.filter(l => l.status === 'repaid')
    .sort((a, b) => (b.repaid_at || '').localeCompare(a.repaid_at || '')), [loans]);

  // Recap par utilisateur
  const recap = useMemo(() => {
    const map = new Map<string, { user_id: string; debt: number; credit: number }>();
    for (const l of active) {
      const b = map.get(l.borrower_id) || { user_id: l.borrower_id, debt: 0, credit: 0 };
      b.debt += l.total_due;
      map.set(l.borrower_id, b);
      const le = map.get(l.lender_id) || { user_id: l.lender_id, debt: 0, credit: 0 };
      le.credit += l.total_due;
      map.set(l.lender_id, le);
    }
    return Array.from(map.values())
      .filter(r => {
        if (!search) return true;
        const name = (profiles[r.user_id]?.display_name || '').toLowerCase();
        return name.includes(search.toLowerCase());
      })
      .sort((a, b) => (b.debt + b.credit) - (a.debt + a.credit));
  }, [active, profiles, search]);

  const repay = async () => {
    if (!confirmRepay) return;
    setRepaying(true);
    const { data, error } = await supabase.functions.invoke('repay-loan', { body: { loan_id: confirmRepay } });
    setRepaying(false);
    if (error || (data as any)?.error) toast.error((data as any)?.error || error?.message || 'Erreur');
    else toast.success('Remboursé ✅');
    setConfirmRepay(null);
  };

  const isLate = (deadline: string | null) =>
    deadline ? new Date(deadline).getTime() < Date.now() : false;

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-display gold-text">🤝 Prêts</h1>
        <p className="text-sm text-muted-foreground mt-1">Qui doit quoi à qui dans la promo</p>
      </div>

      {/* Prêts actifs */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Prêts actifs ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Aucun prêt en cours.</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prêteur</TableHead>
                  <TableHead>Emprunteur</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Taux</TableHead>
                  <TableHead className="text-right">Total dû</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map(l => {
                  const late = isLate(l.deadline);
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{emojiOf(l.lender_id)} {nameOf(l.lender_id)}</TableCell>
                      <TableCell>{emojiOf(l.borrower_id)} {nameOf(l.borrower_id)}</TableCell>
                      <TableCell className="text-right">{l.principal}</TableCell>
                      <TableCell className="text-right">{l.rate_percent}%</TableCell>
                      <TableCell className="text-right font-semibold">{l.total_due}</TableCell>
                      <TableCell>
                        {l.deadline ? (
                          <span className={late ? 'text-destructive flex items-center gap-1' : ''}>
                            {late && <AlertCircle className="w-3.5 h-3.5" />}
                            {format(new Date(l.deadline), 'dd/MM/yy', { locale: fr })}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {user?.id === l.borrower_id && (
                          <Button size="sm" onClick={() => setConfirmRepay(l.id)}>
                            Rembourser ({l.total_due} DC)
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Récap par utilisateur */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Récap par utilisateur</h2>
        <Input placeholder="Rechercher un pseudo…" value={search} onChange={e => setSearch(e.target.value)} className="mb-3 max-w-sm" />
        {recap.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Personne n'a de prêt en cours.</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead className="text-right">Doit</TableHead>
                  <TableHead className="text-right">Attend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recap.map(r => (
                  <TableRow key={r.user_id}>
                    <TableCell>{emojiOf(r.user_id)} {nameOf(r.user_id)}</TableCell>
                    <TableCell className="text-right">{r.debt > 0 ? <span className="text-destructive font-medium">{r.debt} DC</span> : '—'}</TableCell>
                    <TableCell className="text-right">{r.credit > 0 ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">{r.credit} DC</span> : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Historique */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <span>📜 Historique ({repaid.length})</span>
            <ChevronDown className="w-4 h-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {repaid.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun remboursement.</p>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prêteur</TableHead>
                    <TableHead>Emprunteur</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Remboursé le</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repaid.map(l => (
                    <TableRow key={l.id}>
                      <TableCell>{emojiOf(l.lender_id)} {nameOf(l.lender_id)}</TableCell>
                      <TableCell>{emojiOf(l.borrower_id)} {nameOf(l.borrower_id)}</TableCell>
                      <TableCell className="text-right">{l.total_due} DC</TableCell>
                      <TableCell>{l.repaid_at ? format(new Date(l.repaid_at), 'dd/MM/yy HH:mm', { locale: fr }) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={!!confirmRepay} onOpenChange={(v) => !v && setConfirmRepay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le remboursement</AlertDialogTitle>
            <AlertDialogDescription>
              Le montant sera transféré immédiatement depuis ton solde. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={repay} disabled={repaying}>Rembourser</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}