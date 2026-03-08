import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import daimcoinLogo from '@/assets/daimcoin-logo.png';
import { Key, Coins, Target, Trophy } from 'lucide-react';

const STEPS = [
  {
    icon: Key,
    emoji: '🔑',
    title: 'Crée ton compte',
    desc: 'Avec ton email ESSEC et choisis ton prénom dans la liste de la promo',
  },
  {
    icon: Coins,
    emoji: '🪙',
    title: 'Reçois 1 000 DAIMcoins',
    desc: "À l'inscription pour commencer à parier immédiatement",
  },
  {
    icon: Target,
    emoji: '🎯',
    title: 'Parie sur la promo',
    desc: 'Sur les événements de la promo avec des cotes provisoires dynamiques',
  },
  {
    icon: Trophy,
    emoji: '🏆',
    title: "Deviens l'Oracle du Daim",
    desc: 'Gagne, grimpe dans le classement et prouve que tu connais la promo mieux que personne',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ─── HEADER ─── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={daimcoinLogo} alt="" className="w-8 h-8 rounded-full" />
            <span className="font-display text-xl text-primary tracking-wider">DAIMBET 🦌💸</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/connexion">
              <Button variant="outline" size="sm">Se connecter</Button>
            </Link>
            <Link to="/inscription">
              <Button size="sm" className="gold-gradient font-semibold">S'inscrire</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── HERO ─── */}
      <main className="flex-1">
        <section className="container mx-auto px-4 py-16 md:py-24 max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <motion.img
              src={daimcoinLogo}
              alt="DAIMcoin"
              className="w-28 h-28 mx-auto mb-6 rounded-full"
              animate={{ rotateY: [0, 360] }}
              transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 4 }}
            />
            <h1 className="text-4xl md:text-6xl font-display gold-text leading-tight">
              Bienvenue sur DaimBet 🦌💸
            </h1>
            <h2 className="text-lg md:text-xl text-muted-foreground mt-4 max-w-xl mx-auto">
              Le premier marché de prédiction où votre connaissance de la promo vaut de l'or (fictif).
            </h2>
            <p className="text-sm md:text-base text-muted-foreground mt-6 max-w-2xl mx-auto leading-relaxed">
              DaimBet n'est pas un site de paris sportifs classique. C'est la bourse officielle de notre 
              promotion. Ici, vous ne pariez pas contre le casino ou le marché, vous pariez contre les 
              autres daims. Attention, le délit d'initié n'est ni recommandé, ni interdit. Les enquêteurs 
              de l'AMF ne viendront pas vous chercher.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
              <Link to="/inscription">
                <Button size="lg" className="gold-gradient font-semibold text-lg px-8">
                  Rejoindre DaimBet 🦌
                </Button>
              </Link>
              <Link to="/connexion">
                <Button variant="ghost" size="lg" className="text-muted-foreground hover:text-primary">
                  Déjà inscrit ? Se connecter
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>

        {/* ─── HOW IT WORKS ─── */}
        <section className="bg-secondary/30 border-t border-b border-border py-16">
          <div className="container mx-auto px-4 max-w-4xl">
            <h2 className="text-3xl md:text-4xl font-display gold-text text-center mb-12">
              Comment ça marche ?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.15, duration: 0.5 }}
                    className="rounded-xl border border-border bg-card p-6 card-glow flex items-start gap-4"
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg tracking-wider text-foreground">
                        {step.emoji} {step.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">{step.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-border py-6">
        <div className="container mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground">
            © DaimBet · Promo DAIM ESSEC · Monnaie fictive — aucun enjeu financier réel.
          </p>
        </div>
      </footer>
    </div>
  );
}
