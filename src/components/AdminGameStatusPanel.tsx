import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Pause, Play, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { GAME_KEYS, GAME_KEY_GROUPS } from '@/lib/gameKeys';
import { useAllGameStatus } from '@/hooks/useGameStatus';
import { useNavConfig } from '@/contexts/NavConfigContext';

const NAV_TABS = [
  { key: 'paris',     label: 'Paris',          emoji: '💸', gameKey: 'section_paris' },
  { key: 'promo',     label: 'Jeux de promo',  emoji: '🏛️', gameKey: 'section_promo' },
  { key: 'jeux',      label: 'Jeux',           emoji: '🎮', gameKey: 'section_jeux' },
  { key: 'mini-jeux', label: 'Mini-jeux',      emoji: '🧩', gameKey: 'section_mini_jeux' },
  { key: 'casino',    label: 'Casino',         emoji: '🎰', gameKey: 'section_casino' },
  { key: 'la-promo',  label: 'La promo',       emoji: '📰', gameKey: 'section_la_promo' },
] as const;

export default function AdminGameStatusPanel() {
  const { statuses } = useAllGameStatus();
  const { visibleTabs: navConfig, toggleTab } = useNavConfig();
  const [resetTarget, setResetTarget] = useState<{ key: string; label: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (key: string, field: 'suspended' | 'hidden', current: boolean) => {
    setBusy(`${key}:${field}`);
    const { error } = await supabase
      .from('game_status')
      .update({ [field]: !current })
      .eq('game_key', key);
    setBusy(null);
    if (error) toast.error(error.message);
    else toast.success(field === 'suspended' ? (!current ? 'Jeu suspendu 🚨' : 'Jeu réactivé ✅') : (!current ? 'Jeu caché 🙈' : 'Jeu visible 👁️'));
  };

  const doReset = async () => {
    if (!resetTarget) return;
    setBusy(`reset:${resetTarget.key}`);
    try {
      // Delete unfinished game_state_sessions
      await supabase.from('game_state_sessions').delete()
        .eq('game_type', resetTarget.key)
        .is('completed_at', null);
      // Delete unfinished games_sessions (multi)
      await supabase.from('games_sessions').delete()
        .eq('game_type', resetTarget.key)
        .neq('status', 'termine');
      await supabase.from('game_status')
        .update({ last_reset_at: new Date().toISOString() })
        .eq('game_key', resetTarget.key);
      toast.success(`${resetTarget.label} réinitialisé 🔄`);
    } catch (e: any) {
      toast.error(e.message || 'Erreur');
    }
    setBusy(null);
    setResetTarget(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="text-sm font-display flex items-center gap-2 text-destructive">
        🚨 Suspension par jeu (nouveau système)
      </h3>
      <p className="text-xs text-muted-foreground">
        Active / suspend / cache instantanément chaque jeu ou sous-onglet. La réinitialisation supprime les parties en cours.
      </p>

      <div className="space-y-2 pb-3 border-b border-border/50">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          🗂️ Configuration des onglets de navigation
        </p>
        <p className="text-[11px] text-muted-foreground italic">
          "Cacher" retire l'onglet du menu. "Suspendre" maintient l'onglet visible dans la navbar mais bloque l'accès à la section.
        </p>
        <div className="space-y-1.5">
          {NAV_TABS.map(tab => {
            const isVisible = navConfig[tab.key] !== false;
            const s = statuses[tab.gameKey] || { suspended: false, hidden: false };
            const suspBusy = busy === `${tab.gameKey}:suspended`;
            const visBusy  = busy === `${tab.key}:nav`;
            return (
              <div key={tab.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/40 border border-border/50 flex-wrap gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.suspended ? 'bg-destructive' : isVisible ? 'bg-primary' : 'bg-muted'}`} />
                  <span className="text-sm">{tab.emoji} {tab.label}</span>
                  {!isVisible && <span className="text-[10px] text-muted-foreground font-semibold">CACHÉ</span>}
                  {s.suspended && isVisible && <span className="text-[10px] text-destructive font-semibold">SUSPENDU</span>}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button size="sm" variant={s.suspended ? 'outline' : 'destructive'} className="text-xs h-7"
                    disabled={suspBusy}
                    onClick={async () => {
                      setBusy(`${tab.gameKey}:suspended`);
                      const { error } = await supabase
                        .from('game_status')
                        .update({ suspended: !s.suspended })
                        .eq('game_key', tab.gameKey);
                      setBusy(null);
                      if (error) toast.error(error.message);
                      else toast.success(!s.suspended ? 'Section suspendue 🚨' : 'Section réactivée ✅');
                    }}>
                    {s.suspended ? <><Play className="w-3 h-3 mr-1" /> Réactiver</> : <><Pause className="w-3 h-3 mr-1" /> Suspendre</>}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7"
                    disabled={visBusy}
                    onClick={async () => {
                      setBusy(`${tab.key}:nav`);
                      await toggleTab(tab.key, !isVisible);
                      setBusy(null);
                      toast.success(isVisible ? 'Onglet caché 🙈' : 'Onglet visible 👁️');
                    }}>
                    {isVisible ? <><EyeOff className="w-3 h-3 mr-1" /> Cacher</> : <><Eye className="w-3 h-3 mr-1" /> Afficher</>}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {GAME_KEY_GROUPS.map(group => {
        const items = GAME_KEYS.filter(g => g.group === group);
        return (
          <div key={group} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group}</p>
            <div className="space-y-1.5">
              {items.map(item => {
                const s = statuses[item.key] || { suspended: false, hidden: false };
                const suspBusy = busy === `${item.key}:suspended`;
                const hidBusy = busy === `${item.key}:hidden`;
                const resetBusy = busy === `reset:${item.key}`;
                return (
                  <div key={item.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/40 border border-border/50 flex-wrap gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.suspended ? 'bg-destructive' : 'bg-primary'}`} />
                      <span className="text-sm">{item.emoji} {item.label}</span>
                      {s.suspended && <span className="text-[10px] text-destructive font-semibold">SUSPENDU</span>}
                      {s.hidden && <span className="text-[10px] text-muted-foreground font-semibold">CACHÉ</span>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button size="sm" variant={s.suspended ? 'outline' : 'destructive'} className="text-xs h-7"
                        disabled={suspBusy}
                        onClick={() => toggle(item.key, 'suspended', s.suspended)}>
                        {s.suspended ? <><Play className="w-3 h-3 mr-1" /> Reprendre</> : <><Pause className="w-3 h-3 mr-1" /> Suspendre</>}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7"
                        disabled={hidBusy}
                        onClick={() => toggle(item.key, 'hidden', s.hidden)}>
                        {s.hidden ? <><Eye className="w-3 h-3 mr-1" /> Afficher</> : <><EyeOff className="w-3 h-3 mr-1" /> Cacher</>}
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
                        disabled={resetBusy}
                        onClick={() => setResetTarget({ key: item.key, label: item.label })}>
                        <RefreshCw className="w-3 h-3 mr-1" /> Réinitialiser
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <AlertDialog open={!!resetTarget} onOpenChange={open => { if (!open) setResetTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Réinitialiser {resetTarget?.label} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Toutes les parties en cours de ce jeu seront supprimées définitivement. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={doReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Réinitialiser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}