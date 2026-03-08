import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Bienvenue, Jordaim Belfort ! 🦌👑');
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success('Email de réinitialisation envoyé ! 📧');
    setLoading(false);
  };

  if (showForgot) {
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
            <h1 className="text-3xl font-display gold-text">Mot de passe oublié</h1>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 card-glow">
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Email"
                  required
                />
              </div>
              <Button type="submit" className="w-full gold-gradient font-semibold" disabled={loading}>
                {loading ? '...' : 'Envoyer le lien 📧'}
              </Button>
            </form>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowForgot(false)}
              className="w-full mt-4 border-primary/50 text-primary hover:bg-primary/10"
            >
              ← Retour à la connexion
            </Button>
          </div>
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
          <motion.div className="relative w-24 h-24 mx-auto mb-4">
            <motion.img
              src={daimcoinLogo}
              alt="DAIMcoin"
              className="w-24 h-24 mx-auto rounded-full"
              animate={{ rotateY: [0, 360] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            />
            <Shield className="absolute -bottom-1 -right-1 w-8 h-8 text-primary bg-background rounded-full p-1 border-2 border-primary" />
          </motion.div>
          <h1 className="text-4xl font-display gold-text">Jordaim Belfort</h1>
          <p className="text-muted-foreground mt-2">Panneau d'administration DAIMBet 🦌👑</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 card-glow">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email administrateur</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Mot de passe</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full gold-gradient font-semibold" disabled={loading}>
              {loading ? '...' : 'Connexion Admin 👑'}
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            onClick={() => setShowForgot(true)}
            className="w-full mt-4 border-primary/50 text-primary hover:bg-primary/10"
          >
            🔑 Mot de passe oublié ?
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
