import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { INTRO_PROFIL } from '@/components/TabIntro';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { Button } from '@/components/ui/button';
import { LogOut, MessageSquarePlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ProposalForm from '@/components/ProposalForm';

export default function ProfilePage() {
  const { profile, signOut } = useAuth();
  const [showProposalForm, setShowProposalForm] = useState(false);

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl pb-20 md:pb-6">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-display gold-text">👤 Mon Profil</h1>
      </div>
      {INTRO_PROFIL}

      {profile && (
        <div className="rounded-xl border border-border bg-card p-6 card-glow space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-3xl">
              {profile.emoji || '🦌'}
            </div>
            <div>
              <h2 className="text-2xl font-display">{profile.display_name}</h2>
              <p className="text-sm text-muted-foreground">Membre de la promo DAIM</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <span>🪙</span>
              </div>
              <p className="text-2xl font-display text-primary">{profile.balance} DC</p>
              <p className="text-xs text-muted-foreground">Solde actuel</p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <span>📅</span>
              </div>
              <p className="text-sm font-medium text-foreground">
                {new Date(profile.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p className="text-xs text-muted-foreground">Membre depuis</p>
            </div>
          </div>

          <Button onClick={() => setShowProposalForm(true)} className="w-full gold-gradient font-semibold">
            <MessageSquarePlus className="w-4 h-4 mr-2" /> Soumettre une proposition 🗳️
          </Button>

          <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" /> Se déconnecter
          </Button>
        </div>
      )}

      <Dialog open={showProposalForm} onOpenChange={setShowProposalForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display gold-text">🗳️ Nouvelle Proposition</DialogTitle>
          </DialogHeader>
          <ProposalForm
            onClose={() => setShowProposalForm(false)}
            onSubmitted={() => setShowProposalForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
