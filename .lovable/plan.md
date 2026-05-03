## Problème identifié

Les composants `src/pages/EventsPage.tsx` (feed des paris) et `src/pages/BetDetailPage.tsx` (détail d'un pari) s'abonnent via Supabase Realtime aux tables `bets` et `wagers` pour rafraîchir les cotes pari-mutuel dès qu'une nouvelle mise est posée :

```ts
.on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, …)
.on('postgres_changes', { event: '*', schema: 'public', table: 'wagers' }, …)
```

Or, en interrogeant `pg_publication_tables`, **ces tables ne sont PAS dans la publication `supabase_realtime`**. Seules `profiles`, `gazette_messages`, `gazette_reactions`, `ticket_messages`, `game_sessions`, `game_participations` y sont.

Conséquence : la souscription est créée côté client mais Postgres ne diffuse jamais les changements → les cotes ne se mettent à jour que sur rechargement / changement d'onglet. Les utilisateurs qui laissent l'écran ouvert (Noé, Christophe, Yara, Samory) ne voient donc jamais évoluer les cotes ni la cagnotte.

## Correctif

Une seule migration SQL suffit :

1. Ajouter `public.bets`, `public.wagers` et `public.bet_options` à la publication `supabase_realtime` (avec `IF NOT EXISTS` via bloc `DO` pour rester idempotent).
2. Forcer `REPLICA IDENTITY FULL` sur ces trois tables, requis pour que le payload `UPDATE`/`DELETE` contienne toutes les colonnes nécessaires aux écrans (montants des mises, statut, total_mises_dc).

`bet_options` est ajouté en bonus : `total_mises_dc` est mis à jour à chaque mise et plusieurs vues l'utilisent — c'est cohérent de le diffuser aussi.

## Fichier créé

- `supabase/migrations/<timestamp>_realtime_bets_wagers.sql`

## Vérification post-déploiement

- Re-requête de `pg_publication_tables` pour confirmer que les 3 tables apparaissent.
- Test manuel : ouvrir un pari sur deux navigateurs, miser depuis l'un, vérifier que les cotes/cagnotte bougent automatiquement sur l'autre sans recharger.

Aucun changement de code front nécessaire — les souscriptions existantes commenceront simplement à recevoir des évènements.