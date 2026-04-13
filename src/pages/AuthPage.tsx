import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return EMOJI_POOL[Math.abs(hash) % EMOJI_POOL.length];
}

/**
 * Extract the base first name from a PROMO_NAMES entry for email cross-validation.
 * "Charles P." → "charles", "Chris-Aurélien" → "chris-aurélien", "Laura L." → "laura"
 */
function extractBasePrenom(name: string): string {
  // Remove trailing initial like " P.", " V.", " L."
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


  // Real-time checks for inscription
  const [takenNames, setTakenNames] = useState<Set<string>>(new Set());
  const [registeredNames, setRegisteredNames] = useState<string[]>([]);
  const [checkingName, setCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [emailValid, setEmailValid] = useState<boolean | null>(null);
  const [emailPrenomMatch, setEmailPrenomMatch] = useState<boolean | null>(null);

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

  // Real-time email validation + cross-validation with prénom
  useEffect(() => {
    if (!email || mode !== 'inscription') {
      setEmailValid(null);
      setEmailPrenomMatch(null);
      return;
    }
    const valid = isValidEssecEmail(email);
    setEmailValid(valid);

    if (valid && selectedName) {
      const basePrenom = extractBasePrenom(selectedName);
      const emailPrefix = email.split('@')[0].split('.')[0].toLowerCase();
      // Normalize accented characters for comparison
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

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error('Email ou mot de passe incorrect.');
    } else {
      toast.success('Bienvenue sur DAIMBet ! 🦌');
    }
    setLoading(false);
  };

  // ─── INSCRIPTION ───
  const canSignup = () => {
    return (
      selectedName &&
      email &&
      password &&
      confirmPassword &&
      nameAvailable === true &&
      emailValid === true &&
      emailPrenomMatch === true &&
      password === confirmPassword &&
      password.length >= 6
    );
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSignup()) return;
    setLoading(true);

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
      setLoading(false);
      return;
    }

    toast.success('Bienvenue sur DAIMBet ! 🦌');
    setLoading(false);
  };

  const isFormValid = canSignup();

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

              <Button type="submit" className="w-full gold-gradient font-semibold" disabled={!isFormValid || loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer mon compte 🦌'}
              </Button>
            </form>
          )}

          {/* Forgot password — message informatif */}
          {showForgot && mode === 'connexion' && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm text-foreground leading-relaxed">
                D'abord, essaie de te souvenir de ton mot de passe. Si vraiment tu ne t'en souviens pas, envoie un mail à{' '}
                <a href="mailto:jordaim.belfort@daimbet.com" className="text-primary font-semibold hover:underline">jordaim.belfort@daimbet.com</a>{' '}
                depuis ton adresse <strong>@essec.edu</strong>. Dans ce mail, indique le nouveau mot de passe que tu souhaites utiliser, puis patiente le temps que l'administrateur fasse la modification.
              </p>
              <button
                type="button"
                onClick={() => setShowForgot(false)}
                className="mt-2 text-xs text-muted-foreground hover:text-primary transition-colors"
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
