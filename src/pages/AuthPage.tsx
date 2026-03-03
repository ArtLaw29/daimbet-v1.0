import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { motion } from 'framer-motion';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message);
      else toast.success('Bienvenue sur DAIMBet ! 🦌');
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) toast.error(error.message);
      else toast.success('Compte créé ! Vérifie ton email pour confirmer.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.img
            src={daimcoinLogo}
            alt="DAIMcoin"
            className="w-24 h-24 mx-auto mb-4 rounded-full"
            animate={{ rotateY: [0, 360] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          />
          <h1 className="text-5xl font-display gold-text">DAIMBet</h1>
          <p className="text-muted-foreground mt-2">La plateforme de paris entre DAIM 🦌</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 card-glow">
          <div className="flex gap-2 mb-6">
            <Button
              variant={isLogin ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setIsLogin(true)}
            >
              Connexion
            </Button>
            <Button
              variant={!isLogin ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setIsLogin(false)}
            >
              Inscription
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Prénom / Pseudo</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ton prénom"
                  required={!isLogin}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ton@email.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full gold-gradient font-semibold" disabled={loading}>
              {loading ? '...' : isLogin ? 'Se connecter' : "S'inscrire"}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
