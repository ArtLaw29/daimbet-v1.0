import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Shield } from 'lucide-react';

interface CharterModalProps {
  userId: string;
  onAccepted: () => void;
}

export default function CharterModal({ userId, onAccepted }: CharterModalProps) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(15);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleAccept = async () => {
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ has_accepted_charter: true })
      .eq('user_id', userId);

    if (error) {
      toast.error('Erreur lors de l\'acceptation de la charte');
    } else {
      toast.success('Bienvenue sur DAIMBet ! 🦌');
      onAccepted();
    }
    setLoading(false);
  };

  const canAccept = accepted && countdown <= 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, type: 'spring' }}
          className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 card-glow shadow-2xl"
        >
          <div className="text-center mb-6">
            <Shield className="w-12 h-12 mx-auto text-primary mb-3" />
            <h2 className="text-2xl font-display gold-text">Charte d'utilisation</h2>
            <p className="text-xs text-muted-foreground mt-1">Tu dois accepter avant de continuer</p>
          </div>

          <div className="bg-secondary/50 rounded-xl p-4 mb-6 border border-border/50">
            <p className="text-sm leading-relaxed text-foreground">
              🦌 <strong>Jordaim Belfort veille au grain.</strong> Tous les paris sont modérés, 
              leur résolution est assurée par l'admin, et une règle est sacrée sur DaimBet : 
              <strong> on rigole ensemble.</strong> Les paris 
              méchants ou humiliants n'ont pas leur place ici — et cette règle sera appliquée 
              sans exception.
            </p>
            <p className="text-sm leading-relaxed text-foreground mt-3">
              Un <strong>rake de 5%</strong> sur les gains nets est prélevé automatiquement à 
              chaque résolution — cela maintient l'économie équilibrée sur la durée.
            </p>
            <p className="text-sm leading-relaxed text-foreground mt-3">
              Bonne chance à toi. 💸
            </p>
          </div>

          <div className="flex items-start gap-3 mb-6">
            <Checkbox
              id="charter-accept"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
              className="mt-0.5"
            />
            <label
              htmlFor="charter-accept"
              className="text-sm text-foreground cursor-pointer select-none"
            >
              J'ai lu et j'accepte la charte d'utilisation de DaimBet
            </label>
          </div>

          <Button
            className="w-full gold-gradient font-semibold"
            disabled={!canAccept || loading}
            onClick={handleAccept}
          >
            {loading ? '...' : countdown > 0 ? `Patiente encore ${countdown}s ⏳` : "J'ai compris et j'accepte 🦌"}
          </Button>

          {countdown > 0 && (
            <div className="mt-3">
              <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 15, ease: 'linear' }}
                />
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
