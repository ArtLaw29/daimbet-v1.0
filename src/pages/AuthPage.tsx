import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { motion } from 'framer-motion';
import { PROMO_NAMES, isValidSchoolEmail } from '@/lib/pari-mutuel';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';

const EMOJI_POOL = [
  '🦌', '🐻', '🦊', '🐺', '🦁', '🐯', '🐮', '🐷', '🐸', '🐵',
  '🦉', '🦅', '🐧', '🐦', '🦋', '🐝', '🐞', '🐙', '🦑', '🐠',
  '🌟', '⭐', '🔥', '💎', '🎯', '🎲', '🃏', '👑', '🏆', '💰',
  '🚀', '⚡', '🌈', '🍀', '🎪', '🎭', '🎬', '🎤', '🎸', '🎺',
  '🧊', '🌊', '🌸', '🌺', '🌻', '🍕', '🍷', '🥂', '🎂', '🧁',
  '🦄', '🐲', '🦈', '🐬', '🦩', '🐆', '🦎', '🦜', '🐢', '🦇',
];

function getEmojiForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return EMOJI_POOL[Math.abs(hash) % EMOJI_POOL.length];
}

function extractBasePrenom(name: string): string {
  return name.replace(/\s+[A-Z]\.$/, '').toLowerCase();
}

export default function AuthPage() {
  const location = useLocation();
  const initialMode = location.pathname === '/inscription' ? 'inscription' : 'connexion';
  const [mode, setMode] = useState<'connexion' | 'inscription'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');

  const [takenNames, setTakenNames] = useState<Set<string>>(new Set());
  const [checkingName, setCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [emailValid, setEmailValid] = useState<boolean | null>(null);
  const [emailPrenomMatch, setEmailPrenomMatch] = useState<boolean | null>(null);

  useEffect(() => {
    fetchTakenNames();
  }, []);

  const fetchTakenNames = async () => {
    const { data } = await supabase.from('profiles').select('display_name');
    if (data) {
      setTakenNames(new Set(data.map(p => p.display_name)));
    }
  };

  useEffect(() => {
    if (!selectedName || mode !== 'inscription') { setNameAvailable(null); return; }
    setCheckingName(true);
    const timer = setTimeout(() => {
      setNameAvailable(!takenNames.has(selectedName));
      setCheckingName(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [selectedName, takenNames, mode]);

  useEffect(() => {
    if (!email || mode !== 'inscription') { setEmailValid(null); setEmailPrenomMatch(null); return; }
    const valid = isValidSchoolEmail(email);
    setEmailValid(valid);
    if (valid && selectedName) {
      const basePrenom = extractBasePrenom(selectedName);
      const emailPrefix = email.split('@')[0].split('.')[0].toLowerCase();
      const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      setEmailPrenomMatch(normalize(emailPrefix) === normalize(basePrenom));
    } else {
      setEmailPrenomMatch(null);
    }
  }, [email, selectedName, mode]);

  // ─── CONNEXION ───
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes('Email not confirmed')) {
        toast.error('Ton email n\'est pas encore confirmé. Vérifie ta boîte mail (et tes spams) pour cliquer sur le lien de confirmation.');
      } else {
        toast.error('Email ou mot de passe incorrect.');
      }
      setLoading(false);
      return;
    }

    // Check is_activated
    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', data.user.id)
        .single();

      if (profile && !(profile as any).is_activated) {
        await supabase.auth.signOut();
        toast.error('Ton compte n\'est pas encore activé. Vérifie ta boîte mail (et tes spams) pour cliquer sur le lien de confirmation.');
        setLoading(false);
        return;
      }
    }

    toast.success('Bienvenue sur DAIMBet ! 🦌');
    setLoading(false);
  };

  // ─── INSCRIPTION ───
  const canSignup = () => {
    return (
      selectedName && email && password && confirmPassword &&
      nameAvailable === true && emailValid === true && emailPrenomMatch === true &&
      password === confirmPassword && password.length >= 6
    );
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSignup()) return;
    setLoading(true);

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('display_name', selectedName)
      .maybeSingle();

    if (existingProfile) {
      toast.error('Ce prénom est déjà utilisé. Si c\'est le tien, contacte Jordaim Belfort.');
      setNameAvailable(false);
      setTakenNames(prev => new Set([...prev, selectedName]));
      setLoading(false);
      return;
    }

    const emoji = getEmojiForName(selectedName);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: selectedName, emoji },
        emailRedirectTo: `${window.location.origin}/welcome`,
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setSignupEmail(email);
    setSignupDone(true);
    setLoading(false);
  };

  const isFormValid = canSignup();

  // ─── POST-SIGNUP: Email sent confirmation ───
  if (signupDone) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md text-center"
        >
          <div className="rounded-xl border border-border bg-card p-8 card-glow">
            <Mail className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h2 className="text-2xl font-display gold-text mb-4">Vérifie ta boîte mail !</h2>
            <p className="text-foreground leading-relaxed mb-2">
              Un email de confirmation a été envoyé à{' '}
              <span className="font-semibold text-primary">{signupEmail}</span>.
            </p>
            <p className="text-muted-foreground text-sm">
              Clique sur le lien dans l'email pour continuer ton inscription. Pense à vérifier tes spams !
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => { setSignupDone(false); setMode('connexion'); }}
            >
              Retour à la connexion
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
          <motion.img
            src={daimcoinLogo}
            alt="DAIMcoin"
            className="w-24 h-24 mx-auto mb-4 rounded-full"
            animate={{ rotateY: [0, 360] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          />
          <h1 className="text-5xl font-display gold-text">DAIMBET</h1>
          <p className="text-muted-foreground mt-2">La plateforme de paris entre DAIM 🦌</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 card-glow">
          <div className="flex gap-2 mb-6">
            <Button
              variant={mode === 'connexion' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => { setMode('connexion'); setSelectedName(''); }}
            >
              Connexion
            </Button>
            <Button
              variant={mode === 'inscription' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => { setMode('inscription'); setSelectedName(''); }}
            >
              Inscription
            </Button>
          </div>

          {mode === 'connexion' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prénom.nom@essec.edu" required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Mot de passe</Label>
                <Input
                  id="login-password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6}
                />
              </div>
              <Button type="submit" className="w-full gold-gradient font-semibold" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Se connecter 🦌'}
              </Button>
              <button
                type="button" onClick={() => { setShowForgot(true); setForgotEmail(email); setForgotSent(false); }}
                className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Mot de passe oublié ?
              </button>
            </form>
          )}

          {mode === 'inscription' && (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Ton prénom</Label>
                <select
                  id="signup-name" value={selectedName}
                  onChange={(e) => setSelectedName(e.target.value)} required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Choisis ton prénom...</option>
                  {PROMO_NAMES.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {selectedName && (
                  <div className="flex items-center gap-2 text-sm mt-1">
                    {checkingName ? (
                      <><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> <span className="text-muted-foreground">Vérification...</span></>
                    ) : nameAvailable === true ? (
                      <><CheckCircle className="w-4 h-4 text-primary" /> <span className="text-primary">Prénom disponible ✓</span></>
                    ) : nameAvailable === false ? (
                      <><XCircle className="w-4 h-4 text-destructive" /> <span className="text-destructive">Ce prénom est déjà utilisé. Si c'est le tien, contacte Jordaim Belfort.</span></>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prénom.nom@essec.edu" required
                />
                {email && emailValid === false && (
                  <p className="text-xs text-destructive mt-1">Format requis : prénom.nom@essec.edu</p>
                )}
                {email && emailValid === true && emailPrenomMatch === false && (
                  <p className="text-xs text-destructive mt-1">L'email doit commencer par ton prénom ({extractBasePrenom(selectedName)})</p>
                )}
                {email && emailValid === true && emailPrenomMatch === true && (
                  <p className="text-xs text-primary mt-1">✓ Email valide</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-password">Mot de passe</Label>
                <Input
                  id="signup-password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-confirm">Confirmer le mot de passe</Label>
                <Input
                  id="signup-confirm" type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6}
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-destructive mt-1">Les mots de passe ne correspondent pas</p>
                )}
              </div>

              <Button type="submit" className="w-full gold-gradient font-semibold" disabled={!isFormValid || loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer mon compte 🦌'}
              </Button>
            </form>
          )}

          {showForgot && mode === 'connexion' && (
            <div className="mt-4 pt-4 border-t border-border space-y-3">
              <p className="text-sm text-foreground leading-relaxed">
                Essaie d'abord de te souvenir de ton mot de passe. Si vraiment tu ne t'en souviens plus, indique ton adresse email ci-dessous et clique sur le bouton. Tu recevras un email avec un lien pour choisir un nouveau mot de passe.
              </p>
              <p className="text-xs text-muted-foreground">
                ⚠️ Clique une seule fois sur le bouton, même si ça semble ne rien faire — le mail peut mettre quelques instants à arriver (vérifie aussi tes spams).
              </p>
              <Input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="prénom.nom@essec.edu"
              />
              <Button
                type="button"
                className="w-full"
                disabled={forgotSent || forgotLoading || !forgotEmail}
                onClick={async () => {
                  setForgotLoading(true);
                  await supabase.auth.resetPasswordForEmail(forgotEmail, {
                    redirectTo: `${window.location.origin}/reset-password`,
                  });
                  setForgotSent(true);
                  setForgotLoading(false);
                }}
              >
                {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : forgotSent ? 'Lien envoyé ✅' : 'Recevoir le lien'}
              </Button>
              {forgotSent && (
                <p className="text-sm text-primary">Si cette adresse est associée à un compte, un email a été envoyé.</p>
              )}
              <button
                type="button" onClick={() => { setShowForgot(false); setForgotSent(false); }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
