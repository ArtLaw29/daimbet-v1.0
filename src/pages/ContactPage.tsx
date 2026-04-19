import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

const SUBJECTS = [
  { value: 'mot_de_passe_oublie', label: 'Mot de passe oublié' },
  { value: 'email_non_recu', label: 'Email non reçu' },
  { value: 'compte_bloque', label: 'Compte bloqué' },
  { value: 'inscription', label: 'Problème à l\'inscription' },
  { value: 'autre', label: 'Autre' },
];

export default function ContactPage() {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const emailValid = email.length === 0 || /@essec\.edu$/i.test(email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0) return;
    if (!nom.trim() || !email.trim() || !subject || !message.trim()) {
      toast.error('Tous les champs sont obligatoires');
      return;
    }
    if (!/@essec\.edu$/i.test(email.trim())) {
      toast.error('L\'email doit se terminer par @essec.edu');
      return;
    }
    if (message.trim().length < 5) {
      toast.error('Message trop court');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('public-contact', {
        body: { nom: nom.trim(), email: email.trim(), subject, message: message.trim(), website },
      });
      if (error) throw error;
      if ((data as any)?.error) {
        toast.error((data as any).error);
        setCooldown(60);
        return;
      }
      setSent(true);
    } catch (err: any) {
      toast.error(err?.message || 'Erreur lors de l\'envoi');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center bg-card border border-border rounded-2xl p-8 card-glow"
        >
          <CheckCircle2 className="w-16 h-16 text-primary mx-auto mb-4" />
          <h1 className="font-display text-3xl gold-text mb-2">Message envoyé ✅</h1>
          <p className="text-muted-foreground mb-6">
            L'admin va lire ton message et te répondra par email à <strong className="text-foreground">{email}</strong>.
          </p>
          <Link to="/">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Retour à l'accueil
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={daimcoinLogo} alt="" className="w-8 h-8 rounded-full" />
            <span className="font-display text-xl text-primary tracking-wider">DAIMBET 🦌💸</span>
          </Link>
          <Link to="/connexion">
            <Button variant="outline" size="sm">Se connecter</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-12 max-w-xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-4xl gold-text text-center mb-2">Contacter l'admin</h1>
          <p className="text-center text-muted-foreground mb-8 text-sm">
            Bloqué en dehors de la plateforme ? Écris-nous, on te répond par email.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-border rounded-2xl p-6 card-glow">
            {/* Honeypot — hidden from real users */}
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
              aria-hidden="true"
            />

            <div>
              <Label htmlFor="nom">Ton prénom / nom *</Label>
              <Input
                id="nom"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                maxLength={80}
                placeholder="Comment t'appelles-tu ?"
                required
              />
            </div>

            <div>
              <Label htmlFor="email">Email de réponse (@essec.edu) *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                placeholder="prenom.nom@essec.edu"
                required
                className={!emailValid ? 'border-destructive' : ''}
              />
              {!emailValid && (
                <p className="text-xs text-destructive mt-1">L'email doit se terminer par @essec.edu.</p>
              )}
            </div>

            <div>
              <Label htmlFor="subject">Sujet *</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger id="subject">
                  <SelectValue placeholder="Choisis un sujet" />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="message">Message *</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
                rows={5}
                placeholder="Décris ton problème en quelques lignes…"
                required
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">{message.length}/1000</p>
            </div>

            <Button
              type="submit"
              className="w-full gold-gradient font-semibold"
              disabled={loading || cooldown > 0 || !emailValid}
            >
              {loading
                ? 'Envoi en cours…'
                : cooldown > 0
                  ? `Réessayer dans ${cooldown} s`
                  : 'Envoyer le message'}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Ton message arrive directement chez l'admin. Réponse par email sous 24 h.
            </p>
          </form>

          <div className="text-center mt-6">
            <Link to="/" className="text-sm text-muted-foreground hover:text-primary">
              ← Retour à l'accueil
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
