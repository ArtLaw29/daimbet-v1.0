import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const MIN_LENGTH = 8;

function evaluateStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pwd.length >= MIN_LENGTH) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 2) return { score, label: 'Faible', color: 'bg-destructive' };
  if (score === 3) return { score, label: 'Moyen', color: 'bg-yellow-500' };
  return { score, label: 'Fort', color: 'bg-primary' };
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [success, setSuccess] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const errorCode =
      hashParams.get('error_code') ||
      hashParams.get('error') ||
      queryParams.get('error_code') ||
      queryParams.get('error');
    if (errorCode) {
      setLinkInvalid(true);
      return;
    }

    const type = hashParams.get('type') || queryParams.get('type');
    const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');

    if (type === 'recovery') {
      setIsRecovery(true);
      // Force-establish the recovery session so updateUser({ password }) works
      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).catch(() => setLinkInvalid(true));
      }
    }

    // Handle PKCE flow: ?code=... in the query string
    const code = queryParams.get('code');
    if (code && !type) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) setLinkInvalid(true);
        else setIsRecovery(true);
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
    });

    // If we're already authenticated (e.g. AuthContext redirected us here from "/"),
    // assume recovery mode after a short delay.
    const recoveryFromSession = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session && !isRecovery) setIsRecovery(true);
    }, 800);

    // If after a few seconds nothing recovery-related happened, link is invalid.
    const fallback = setTimeout(() => {
      if (!isRecovery && !window.location.hash && !window.location.search) {
        setLinkInvalid(true);
      }
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallback);
      clearTimeout(recoveryFromSession);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const strength = useMemo(() => evaluateStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < MIN_LENGTH) {
      toast.error(`Le mot de passe doit faire au moins ${MIN_LENGTH} caractères.`);
      return;
    }
    if (strength.score < 3) {
      toast.error('Mot de passe trop faible. Ajoute des majuscules, chiffres ou symboles.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      const msg = error.message?.toLowerCase() ?? '';
      if (msg.includes('pwned') || msg.includes('compromised') || msg.includes('breach')) {
        toast.error('Ce mot de passe a été compromis dans une fuite de données. Choisis-en un autre.');
      } else if (msg.includes('session') || msg.includes('expired') || msg.includes('invalid')) {
        toast.error('Lien expiré ou invalide. Demande un nouveau lien.');
        setLinkInvalid(true);
      } else if (msg.includes('weak') || msg.includes('short')) {
        toast.error('Mot de passe trop faible.');
      } else {
        toast.error(error.message || 'Erreur lors de la mise à jour.');
      }
      return;
    }

    setSuccess(true);
    setLoading(false);
    toast.success('Mot de passe modifié ✅');
    // Sign out from ALL devices for security
    await supabase.auth.signOut({ scope: 'global' });
    setTimeout(() => navigate('/connexion'), 3000);
  };

  if (linkInvalid && !success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md text-center space-y-4 rounded-xl border border-border bg-card p-8 card-glow"
        >
          <AlertTriangle className="w-14 h-14 mx-auto text-destructive" />
          <h2 className="text-2xl font-display gold-text">Lien invalide ou expiré</h2>
          <p className="text-muted-foreground">
            Ce lien de réinitialisation n'est plus valide. Demande-en un nouveau depuis la page de connexion.
          </p>
          <Button
            onClick={() => navigate('/connexion?forgot=1')}
            className="w-full gold-gradient font-semibold"
          >
            Demander un nouveau lien
          </Button>
        </motion.div>
      </div>
    );
  }

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Vérification du lien...</p>
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
          <p className="text-muted-foreground">
            Toutes tes sessions ont été déconnectées. Reconnecte-toi avec ton nouveau mot de passe.
          </p>
          <p className="text-xs text-muted-foreground">Redirection vers la connexion...</p>
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
          <p className="text-muted-foreground text-sm mt-2">
            Choisis un mot de passe solide. Il doit faire au moins {MIN_LENGTH} caractères.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 card-glow">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                  aria-label={showPwd ? 'Masquer' : 'Afficher'}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= strength.score ? strength.color : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Force : <span className="font-semibold text-foreground">{strength.label}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                  aria-label={showConfirm ? 'Masquer' : 'Afficher'}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-destructive">Les mots de passe ne correspondent pas</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full gold-gradient font-semibold"
              disabled={
                loading ||
                password.length < MIN_LENGTH ||
                password !== confirmPassword ||
                strength.score < 3
              }
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Valider'}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
