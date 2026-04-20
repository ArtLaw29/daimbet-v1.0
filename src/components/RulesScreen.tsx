import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Shield, Loader2, ArrowLeft } from 'lucide-react';

interface RulesScreenProps {
  acceptLabel: string;
  onAccept: () => void | Promise<void>;
  onBack?: () => void;
  loading?: boolean;
}

export default function RulesScreen({ acceptLabel, onAccept, onBack, loading }: RulesScreenProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = loading || internalLoading;

  const handleAccept = async () => {
    setInternalLoading(true);
    try {
      await onAccept();
    } finally {
      setInternalLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 card-glow shadow-2xl">
          <div className="text-center mb-6">
            <Shield className="w-12 h-12 mx-auto text-primary mb-3" />
            <h1 className="text-3xl font-display gold-text">Règles de DaimBet</h1>
          </div>

          <div className="bg-secondary/40 rounded-xl p-5 mb-6 border border-border/50 space-y-4">
            <p className="text-sm leading-relaxed text-foreground">
              DaimBet est un jeu entre nous. Quelques règles simples :
            </p>

            <p className="text-sm leading-relaxed text-foreground">
              🤝 Chaque proposition doit rester <strong>bienveillante et drôle pour tout le monde</strong>, y compris la personne concernée.
            </p>

            <p className="text-sm leading-relaxed text-foreground">
              🚫 Les contenus <strong>insultants, humiliants, à caractère sexuel ou discriminatoire</strong> sont interdits et seront supprimés.
            </p>

            <p className="text-sm leading-relaxed text-foreground">
              🚩 Si un contenu te met mal à l'aise, contacte <strong>Jordaim Belfort</strong>.
            </p>

            <p className="text-sm leading-relaxed text-foreground">
              👤 Tu peux te <strong>retirer des jeux à tout moment</strong> depuis ton profil.
            </p>

            <p className="text-xs text-muted-foreground italic pt-2 border-t border-border/50">
              En continuant, tu acceptes ces règles.
            </p>
          </div>

          <Button
            className="w-full gold-gradient font-semibold"
            disabled={isLoading}
            onClick={handleAccept}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : acceptLabel}
          </Button>

          {onBack && (
            <Button
              variant="ghost"
              className="w-full mt-2"
              onClick={onBack}
              disabled={isLoading}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Retour
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
