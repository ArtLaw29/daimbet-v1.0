

## Plan : Rendre l'étape 3 du bouton nucléaire plus robuste

### Problème
L'envoi du rapport pré-réinitialisation échoue avec un code non-2xx. Le SDK masque le détail de l'erreur. Causes possibles : timeout, taille du rapport, problème Resend, ou crash d'encodage.

### Modifications

**1. `supabase/functions/nuclear-reset/index.ts`**
- Ajouter un `try/catch` spécifique autour du bloc `send_report` pour capturer et renvoyer l'erreur exacte
- Limiter la taille du rapport : tronquer les données si le JSON dépasse 10 Mo (ne garder que les counts + un échantillon)
- Remplacer `btoa(unescape(encodeURIComponent(...)))` par un encodage base64 compatible Deno (`btoa` natif ou `base64` standard library)
- Ajouter des logs `console.log` à chaque étape pour faciliter le debug futur
- Si Resend n'est pas configuré (pas de clé API), skip l'envoi et retourner succès avec un message "Rapport non envoyé (pas de clé email configurée)"

**2. `src/pages/AdminPage.tsx`**
- Améliorer le traitement de l'erreur à l'étape 3 : afficher le message d'erreur détaillé retourné par la fonction
- Ajouter un bouton "Passer cette étape" pour permettre de continuer sans le rapport si l'envoi échoue à répétition

### Détail technique
- Le SDK Supabase, quand une edge function retourne un status non-2xx, encapsule la réponse dans `error` et peut masquer le body. On ajoutera un meilleur parsing côté client.
- L'encodage base64 dans Deno fonctionne mieux avec `btoa(String.fromCharCode(...new TextEncoder().encode(str)))` ou la lib standard.

