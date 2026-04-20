
## Plan — Kiss/Marry avec dates de révélation fixes

### Schéma BDD (migration)
1. **Nouvelle table `km_reveal_config`** (1 ligne unique) :
   - `reveal_dates` (timestamptz[]) → `['2026-05-20 10:00+02', '2026-06-19 10:00+02']`
   - `last_reset_at` (timestamptz, nullable) → marqueur du dernier reset effectué
   - RLS : SELECT public authentifié, UPDATE/INSERT admin uniquement.
2. Seed initial avec les 2 dates.

### Logique de "période de vote courante"
Plutôt qu'utiliser `month_year` calendaire dans `kiss_marry_votes`, on continue d'utiliser la colonne `month_year` mais on y stocke un **identifiant de période** = ISO date de la prochaine révélation (ex `"2026-05-20"`). Avantages :
- Pas de migration destructive sur `kiss_marry_votes`.
- Quand on passe à la période suivante (J+1 après reveal), l'identifiant change → les anciens votes sont historisés sans être affichés.
- Reset = simple `DELETE FROM kiss_marry_votes WHERE month_year = <période passée>` côté edge function admin.

### Edge functions
1. **`km-vote`** (existant) : remplacer le calcul `month_year` par un appel à un helper qui lit `km_reveal_config` et renvoie l'ID de la prochaine date de révélation future.
2. **`km-reveal-tick`** (nouveau, scheduled cron toutes les heures) :
   - Lit `km_reveal_config`.
   - Pour chaque date passée mais pas encore traitée (`last_reset_at < date < now() - 24h`) :
     - Supprime les votes de la période expirée (1 jour après la révélation).
     - Met à jour `last_reset_at`.
   - Idempotent.
3. **`km-admin-reveal`** (nouveau, admin only) : déclenche immédiatement une révélation pour la période courante (insère une date "now" dans `reveal_dates` ou marque la période comme révélée + reset après 24h via tick). Plus simple : ajoute une date passée + immédiate.

### Frontend
1. **`KissMarryPage`** :
   - Remplacer `monthYear`/`revealMonthYear` par lecture de `km_reveal_config`.
   - Calcul : `nextRevealDate` = première date future. `currentPeriodId` = ISO de cette date.
   - Mode reveal : `isRevealDay = now >= nextRevealDate && now < nextRevealDate + 24h` → afficher top 3 de la période qui vient de se clore.
   - Compte à rebours discret en haut : "🗓️ Révélation dans 12 jours" (utilise `useCountdown` existant, adapté pour jours).
   - Bandeau pendant la fenêtre de 24h reveal : auto-affiche le top 3.
2. **`AdminKmFullResults`** (existant, à étendre) :
   - Section "Configuration des dates de révélation" : liste éditable des `reveal_dates` (date pickers).
   - Bouton "Déclencher la révélation maintenant" (appelle `km-admin-reveal`).

### Mémoire
- Mettre à jour `mem://features/games/kiss-marry` : périodes désormais bornées par dates fixes admin-configurables, plus de cycle calendaire mensuel.

### Fichiers touchés
- **Migration SQL** : créer `km_reveal_config` + RLS + seed.
- **`supabase/functions/km-vote/index.ts`** : calcul période depuis config.
- **`supabase/functions/km-reveal-tick/index.ts`** (nouveau).
- **`supabase/functions/km-admin-reveal/index.ts`** (nouveau).
- **`supabase/config.toml`** : déclarer les 2 nouvelles fonctions (verify_jwt = false pour tick, true pour admin-reveal qui validera le rôle dans le code).
- **`src/pages/KissMarryPage.tsx`** : refactor logique période + countdown.
- **`src/components/AdminKmFullResults.tsx`** : ajout panneau config dates + bouton reveal manuel.
- **`src/hooks/useCountdown.ts`** : étendre pour afficher en jours quand >24h.
- **Cron** (`supabase--insert`) : pg_cron schedule de `km-reveal-tick` toutes les heures.

### Risques / hypothèses
- Le format `month_year` reste un `text` libre → on peut y mettre une ISO date sans casser le schéma.
- Les anciens votes existants (s'il y en a) resteront avec leur `month_year` calendaire et seront simplement invisibles → OK car ce sont des données de test.
- Fuseau horaire : on stocke en UTC, on affiche en local Europe/Paris.
