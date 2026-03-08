import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import daimcoinLogo from '@/assets/daimcoin-logo.png';

interface CoinRainProps {
  amount: number;
  onComplete?: () => void;
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export default function CoinRain({ amount, onComplete }: CoinRainProps) {
  const [visible, setVisible] = useState(true);
  const coinCount = 24;

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 4500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const coins = Array.from({ length: coinCount }, (_, i) => ({
    id: i,
    left: randomBetween(5, 95),
    delay: randomBetween(0, 1.5),
    duration: randomBetween(1.8, 3.2),
    size: randomBetween(16, 32),
    rotation: randomBetween(-180, 180),
  }));

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] pointer-events-none overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* Coins */}
          {coins.map(coin => (
            <motion.img
              key={coin.id}
              src={daimcoinLogo}
              alt=""
              className="absolute rounded-full"
              style={{ left: `${coin.left}%`, width: coin.size, height: coin.size }}
              initial={{ y: -50, opacity: 0, rotate: 0 }}
              animate={{ y: '110vh', opacity: [0, 1, 1, 0.5], rotate: coin.rotation }}
              transition={{ delay: coin.delay, duration: coin.duration, ease: 'easeIn' }}
            />
          ))}

          {/* Amount display */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ delay: 0.3, duration: 0.5, type: 'spring', stiffness: 200 }}
          >
            <div className="text-center">
              <motion.p
                className="text-5xl md:text-7xl font-display gold-text drop-shadow-lg"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: 3, duration: 0.8 }}
              >
                +{amount} DC
              </motion.p>
              <motion.p
                className="text-lg text-foreground/90 mt-2 font-medium"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
              >
                🏆 Bravo, tu as gagné !
              </motion.p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
