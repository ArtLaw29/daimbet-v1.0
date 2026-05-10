import { useEffect, useState } from 'react';

export const todayStr = () =>
  new Date()
    .toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
    .split('/')
    .reverse()
    .join('-');

function parisNow(): Date {
  // Returns a Date whose UTC fields equal Paris wall time
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
}

function parseRevealAt(revealAt: string | null | undefined, dateStr: string): Date | null {
  if (!revealAt) return null;
  const [h, m, s] = revealAt.split(':').map((n) => parseInt(n, 10) || 0);
  // Build a fake-UTC date matching Paris wall time at reveal
  const target = new Date(`${dateStr}T00:00:00Z`);
  target.setUTCHours(h, m, s || 0, 0);
  return target;
}

export function useRevealCountdown(revealAt: string | null | undefined, dateStr: string) {
  const target = parseRevealAt(revealAt, dateStr);
  const [now, setNow] = useState<Date>(() => parisNow());

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(parisNow()), 1000);
    return () => clearInterval(id);
  }, [revealAt, dateStr]);

  if (!target) return { revealed: true, countdown: '' };
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return { revealed: true, countdown: '' };
  const totalSec = Math.floor(diff / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return { revealed: false, countdown: `${h}:${m}:${s}` };
}