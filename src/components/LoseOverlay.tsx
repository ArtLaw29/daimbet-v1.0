import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface LoseOverlayProps {
  onComplete?: () => void;
}

export default function LoseOverlay({ onComplete }: LoseOverlayProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 3500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="bg-background/80 backdrop-blur-sm rounded-2xl px-8 py-6 text-center max-w-sm mx-4">
            <motion.p
              className="text-4xl mb-3"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              😔
            </motion.p>
            <p className="text-foreground font-display text-xl tracking-[0.05em] mb-2">
              Pas de chance cette fois
            </p>
            <p className="text-sm text-muted-foreground">
              Tes DAIMcoins restent en jeu pour le prochain pari.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
