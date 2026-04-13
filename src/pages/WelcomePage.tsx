import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import daimcoinLogo from '@/assets/daimcoin-logo.png';

export default function WelcomePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md text-center"
      >
        <motion.img
          src={daimcoinLogo}
          alt="DAIMcoin"
          className="w-24 h-24 mx-auto mb-6 rounded-full"
          animate={{ rotateY: [0, 360] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        />

        <h1 className="text-4xl font-display gold-text mb-4">
          Bienvenue {profile?.display_name} ! 🎉
        </h1>

        <div className="rounded-xl border border-border bg-card p-6 card-glow mb-6">
          <p className="text-foreground text-lg leading-relaxed">
            Tu as reçu <span className="font-bold text-primary">1 000 DaimCoins</span> pour commencer.
          </p>
          <p className="text-muted-foreground mt-3">
            Paris, jeux, sondages, tournois… Tout est prêt. À toi de jouer !
          </p>
        </div>

        <Button
          onClick={() => navigate('/')}
          className="w-full gold-gradient font-semibold text-lg py-6"
          size="lg"
        >
          C'est parti 🦌
        </Button>
      </motion.div>
    </div>
  );
}
