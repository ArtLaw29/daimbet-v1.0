import { useState, useEffect } from 'react';

interface CountdownResult {
  text: string;
  isUrgent: boolean;
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
  const remainMin = diffMin % 60;

  const text = diffH > 0 ? `${diffH}h ${remainMin}min` : `${diffMin} min`;
  const isUrgent = diffMin < 30;

  return { text, isUrgent };
}
