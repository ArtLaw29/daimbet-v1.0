import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('type') === 'recovery') {
      setIsRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return;
    if (password.length < 6) return;

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    await supabase.auth.signOut();
    setTimeout(() => navigate('/connexion'), 3000);
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Lien de réinitialisation invalide ou expiré.</p>
          <Button onClick={() => navigate('/connexion')} variant="outline">Retour à la connexion</Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <CheckCircle className="w-16 h-16 mx-auto text-primary" />
          <h2 className="text-2xl font-display gold-text">Mot de passe modifié ✅</h2>
          <p className="text-muted-foreground">Redirection vers la connexion...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <img src={daimcoinLogo} alt="DAIMcoin" className="w-24 h-24 mx-auto mb-4 rounded-full" />
          <h1 className="text-4xl font-display gold-text">Nouveau mot de passe</h1>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 card-glow">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nouveau mot de passe</Label>
              <Input
                id="password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <Input
                id="confirmPassword" type="password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••" required minLength={6}
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-destructive mt-1">Les mots de passe ne correspondent pas</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full gold-gradient font-semibold"
              disabled={loading || password.length < 6 || password !== confirmPassword}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Valider'}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
