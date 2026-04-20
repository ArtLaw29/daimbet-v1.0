import { useState, useEffect } from 'react';

interface CountdownResult {
  text: string;
  isUrgent: boolean;
  diffMs: number;
}

export function useCountdown(targetDate: Date | null): CountdownResult | null {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!targetDate) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (!targetDate) return null;

  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0) return null;

  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffH / 24);
  const remainMin = diffMin % 60;
  const remainH = diffH % 24;

  let text: string;
  if (diffDays >= 1) {
    text = diffDays === 1
      ? `1 jour ${remainH}h`
      : `${diffDays} jours`;
  } else if (diffH > 0) {
    text = `${diffH}h ${remainMin}min`;
  } else {
    text = `${diffMin} min`;
  }

  const isUrgent = diffMin < 30;

  return { text, isUrgent, diffMs };
}
