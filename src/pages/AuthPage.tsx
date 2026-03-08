import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { motion } from 'framer-motion';
import { PROMO_NAMES, isValidEssecEmail } from '@/lib/pari-mutuel';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

// Emoji pool for auto-assignment
const EMOJI_POOL = [
  '🦌', '🐻', '🦊', '🐺', '🦁', '🐯', '🐮', '🐷', '🐸', '🐵',
  '🦉', '🦅', '🐧', '🐦', '🦋', '🐝', '🐞', '🐙', '🦑', '🐠',
  '🌟', '⭐', '🔥', '💎', '🎯', '🎲', '🃏', '👑', '🏆', '💰',
  '🚀', '⚡', '🌈', '🍀', '🎪', '🎭', '🎬', '🎤', '🎸', '🎺',
  '🧊', '🌊', '🌸', '🌺', '🌻', '🍕', '🍷', '🥂', '🎂', '🧁',
  '🦄', '🐲', '🦈', '🐬', '🦩', '🐆', '🦎', '🦜', '🐢', '🦇',
];

function getEmojiForName(name: string): string {
  // Deterministic emoji based on name hash
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return EMOJI_POOL[Math.abs(hash) % EMOJI_POOL.length];
}

export default function AuthPage() {
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  // Real-time checks for inscription
  const [takenNames, setTakenNames] = useState<Set<string>>(new Set());
  const [registeredNames, setRegisteredNames] = useState<string[]>([]);
  const [checkingName, setCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [emailValid, setEmailValid] = useState<boolean | null>(null);

  // Load taken names on mount
  useEffect(() => {
    fetchTakenNames();
  }, []);

  const fetchTakenNames = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name');
    if (data) {
      const names = new Set(data.map(p => p.display_name));
      setTakenNames(names);
      setRegisteredNames(data.map(p => p.display_name).sort());
    }
  };

  // Real-time name availability check
  useEffect(() => {
    if (!selectedName || mode !== 'inscription') {
      setNameAvailable(null);
      return;
    }
    setCheckingName(true);
    const timer = setTimeout(async () => {
      const isTaken = takenNames.has(selectedName);
      setNameAvailable(!isTaken);
      setCheckingName(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [selectedName, takenNames, mode]);

  // Real-time email validation
  useEffect(() => {
    if (!email || mode !== 'inscription') {
      setEmailValid(null);
      return;
    }
    setEmailValid(isValidEssecEmail(email));
  }, [email, mode]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success('Email de réinitialisation envoyé ! Vérifie ta boîte mail 📧');
    setLoading(false);
  };

  // ─── CONNEXION ───
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedName) {
      toast.error('Sélectionne ton prénom');
      return;
    }
    setLoading(true);

    // Find email for this display_name
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('display_name', selectedName)
      .single();

    if (!profile) {
      toast.error('Prénom ou mot de passe incorrect.');
      setLoading(false);
      return;
    }

    // We need the email to sign in. We'll use the email field the user provides.
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error('Prénom ou mot de passe incorrect.');
    } else {
      toast.success('Bienvenue sur DAIMBet ! 🦌');
    }
    setLoading(false);
  };

  // ─── INSCRIPTION ───
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate email
    if (!isValidEssecEmail(email)) {
      toast.error('Seuls les emails au format prénom.nom@essec.edu sont acceptés ! 🎓');
      setLoading(false);
      return;
    }

    if (!selectedName) {
      toast.error('Choisis ton prénom dans la liste ! 🦌');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      setLoading(false);
      return;
    }

    // Double-check name availability at submit time
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
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Compte créé ! Vérifie ton email pour confirmer. 📧');
    }
    setLoading(false);
  };

  const isSignupDisabled = loading ||
    !email || !password || !confirmPassword || !selectedName ||
    nameAvailable === false || emailValid === false || password !== confirmPassword;

  const availableForLogin = registeredNames.length > 0 ? registeredNames : [];

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        {/* Header */}
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
          {/* Mode toggle */}
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

          {/* ─── CONNEXION ─── */}
          {mode === 'connexion' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-name">Ton prénom</Label>
                <select
                  id="login-name"
                  value={selectedName}
                  onChange={(e) => setSelectedName(e.target.value)}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Choisis ton prénom...</option>
                  {availableForLogin.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prénom.nom@essec.edu"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Mot de passe</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full gold-gradient font-semibold" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Se connecter 🦌'}
              </Button>
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Mot de passe oublié ?
              </button>
            </form>
          )}

          {/* ─── INSCRIPTION ─── */}
          {mode === 'inscription' && (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Ton prénom</Label>
                <select
                  id="signup-name"
                  value={selectedName}
                  onChange={(e) => setSelectedName(e.target.value)}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Choisis ton prénom...</option>
                  {PROMO_NAMES.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {/* Name availability indicator */}
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
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prénom.nom@essec.edu"
                  required
                />
                {email && emailValid === false && (
                  <p className="text-xs text-destructive mt-1">Format requis : prénom.nom@essec.edu</p>
                )}
                {email && emailValid === true && (
                  <p className="text-xs text-green-500 mt-1">✓ Format valide</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-password">Mot de passe</Label>
                <Input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-confirm">Confirmer le mot de passe</Label>
                <Input
                  id="signup-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-destructive mt-1">Les mots de passe ne correspondent pas</p>
                )}
              </div>

              <Button type="submit" className="w-full gold-gradient font-semibold" disabled={isSignupDisabled}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer mon compte 🦌'}
              </Button>
            </form>
          )}

          {/* Forgot password */}
          {showForgot && mode === 'connexion' && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground mb-3">Entre ton email pour recevoir un lien de réinitialisation :</p>
              <form onSubmit={handleForgotPassword} className="space-y-3">
                <Input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="prénom.nom@essec.edu"
                  required
                />
                <Button type="submit" variant="outline" className="w-full" disabled={loading}>
                  {loading ? '...' : 'Envoyer le lien'}
                </Button>
              </form>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
