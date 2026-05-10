import { useEffect } from 'react';

/**
 * Affiche l'alerte native du navigateur avant de quitter une page de duel
 * tant que la session est en statut 'en_cours'.
 */
export function useBeforeUnloadGame(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Le message custom est ignoré par les navigateurs modernes mais déclenche bien la confirmation native.
      const msg = "Tu as une partie en cours. Si tu quittes, ton adversaire pourra te déclarer forfait pour inactivité.";
      e.returnValue = msg;
      return msg;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}