

## Plan — Correction des 6 findings de sécurité

### Contexte
Je dois prendre des décisions qui ont un impact fonctionnel important. Je préfère présenter le plan avec les conséquences pour validation avant exécution, car certains "fix" cassent des features visibles.

### 1. 🔴 `realtime.messages` — channel auth
**Constat** : Supabase signale qu'un user authentifié peut s'abonner à n'importe quel topic Realtime.
**Réalité du code** : l'app n'utilise **que `postgres_changes`** (CDC), jamais broadcast/presence. Pour `postgres_changes`, Supabase applique automatiquement la RLS de la table source → pas de fuite réelle.
**Décision proposée** : ignorer ce finding (déjà ignoré au tour précédent — RAS).

### 2. 🔴 `profiles.balance` exposé via SELECT public
**Constat** : tout user authentifié lit toutes les colonnes de `profiles`, y compris `balance`, `is_suspended`, `has_accepted_charter`, `rules_accepted`.
**Usage** : `LeaderboardPage` lit `balance` de tous les profils → c'est intentionnel (classement public).
**Fix** :
- Créer une vue `public.profiles_public` (`security_invoker=on`) avec uniquement les colonnes affichables : `user_id, display_name, emoji, avatar_url, balance, visible_in_kiss_marry, visible_in_sondages, created_at`.
- Restreindre la RLS SELECT de `profiles` à : `auth.uid() = user_id OR has_role(auth.uid(), 'admin')`.
- Adapter le code client qui lit `profiles` pour la liste de tous les users → utiliser `profiles_public`. À auditer : `LeaderboardPage`, `AdminGameSessions`, tout `from('profiles').select(...)` sans filtre `user_id = me`.

### 3. 🟡 `daimocratie_votes` lisible par tous
**Constat** : SELECT `USING true`. Mais d'après la mémoire `mem://features/privacy`, les votes Pipeline sont **anonymes en cumul** — le client a besoin d'agréger, pas de connaître le votant.
**Fix** :
- Restreindre SELECT à `auth.uid() = user_id OR has_role admin`.
- Créer une vue agrégée `public.daimocratie_vote_counts` (proposal_id, votes_positive, votes_negative) `security_invoker=on` accessible à tous les authentifiés pour le compteur public.
- Adapter `ProposalCard` / `ProposalsPage` / `lib/proposals.ts` pour lire la vue au lieu de `daimocratie_votes`.

### 4. 🟡 `tierce_suggestions` lisible par tous
**Constat** : SELECT public. Les suggestions sont affichées sur le détail du pari (Tiercé du Daim) → besoin public légitime, mais on peut masquer l'auteur.
**Fix** :
- Créer une vue `public.tierce_suggestions_public` (`bet_id, prenom_suggested, status, created_at` — sans `suggested_by` ni `comment`) accessible à tous les authentifiés.
- Restreindre SELECT base table à : auteur + admin.
- Adapter le code lecteur (probable : `BetDetailPage`).

### 5. 🟡 `game_participations` lisible par tous
**Constat** : SELECT public. Or `data` JSON contient des **votes secrets** (pronostic, kiss/marry intermédiaires) → fuite directe.
**Fix** :
- Restreindre SELECT à : `auth.uid() = user_id OR has_role admin`.
- Créer une vue agrégée `public.game_session_stats` exposant uniquement les stats publiques (count par session) si nécessaire pour l'affichage du nombre de participants.
- Adapter le code : tournois (qui affiche les votes par round APRÈS résolution), sondages (résultats stockés dans `game_sessions.config` après clôture → OK), KissMarry (résultats via RPC `get_km_top3` admin-only → OK).
- **Risque** : la vue tournoi en direct (votes par round) doit lire `game_participations` pour afficher l'avancement. Il faudra soit garder une vue dédiée tournoi (round courant uniquement), soit déplacer l'agrégation côté serveur via RPC.

### 6. 🟡 `solde_history` WITH CHECK strict
**Constat** : la policy INSERT n'a que `has_role admin`, sans contrainte sur `user_id` → admin pourrait écrire sur n'importe quel user (acceptable) mais pas de défense en profondeur.
**Fix** : pas de changement strict nécessaire (admin seul peut insérer), mais on peut ajouter un trigger qui valide que `delta_dc` correspond à un mouvement réel, OU simplement marquer ce finding "ignored" (intentionnel : seuls admin/SECURITY DEFINER funcs y écrivent). 
**Décision proposée** : ignorer (les RPC `place_wager`, `resolve_bet`, etc. sont SECURITY DEFINER et passent outre la RLS de toute façon).

### Étapes d'exécution
1. **Audit code** : grep tous les `from('profiles')`, `from('daimocratie_votes')`, `from('tierce_suggestions')`, `from('game_participations')` pour mesurer l'impact avant migration.
2. **Migration SQL** :
   - Restreindre 4 RLS SELECT (profiles, daimocratie_votes, tierce_suggestions, game_participations).
   - Créer 4 vues `security_invoker=on` : `profiles_public`, `daimocratie_vote_counts`, `tierce_suggestions_public`, `game_session_stats` (si besoin).
3. **Patch frontend** : remplacer les requêtes brutes par les vues dans les composants identifiés.
4. **Patch types** : `types.ts` se régénère automatiquement, les vues seront typées.
5. **Marquer findings** : `mark_as_fixed` (#2, #3, #4, #5) ; `ignore` (#1, #6) avec justifications.
6. **Mémoire** : note `mem://tech/auth/rbac` mise à jour avec le pattern "vue agrégée publique + base table restreinte".

### Risques
- **Tournois en direct** : si l'UI montre le détail des votes par round avant clôture, il faut soit créer une RPC dédiée, soit garder une vue spécifique. À confirmer en lisant `TournoiPage.tsx`.
- **Leaderboard** : doit continuer à fonctionner via `profiles_public`.
- **Régressions silencieuses** : tout `select('*')` sur ces tables qui s'attendait à voir les rangs d'autres users pourrait casser. Audit grep obligatoire.

### Questions ouvertes (à confirmer avant exécution)
Aucune question bloquante — je propose d'auditer le code en début d'exécution et d'adapter les vues à ce qui est réellement nécessaire. Si une feature majeure casse, je reviens vers toi avant de pousser.

