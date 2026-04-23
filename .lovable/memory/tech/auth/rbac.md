---
name: RBAC / Sécurité
description: Politique RLS, has_role, pattern vue/RPC SECURITY DEFINER pour les jeux
type: feature
---

La gestion des accès s'appuie sur le rôle 'admin' et des politiques RLS strictes. L'insertion dans solde_history est réservée aux admins et aux fonctions SECURITY DEFINER (place_wager, resolve_bet, retract_wager, recount_proposal_votes…).

**Pattern « table privée + RPC publique »** (sécurité 2026-04) :
- `daimocratie_votes` : SELECT restreint à l'auteur. Compteurs publics via les colonnes `votes_positive/negative` sur `daimocratie_proposals`, recalculés par `recount_proposal_votes(uuid)`.
- `tierce_suggestions` : SELECT restreint à l'auteur+admin. Lecture publique via `get_tierce_suggestions_public(p_bet_id)` (pas de `suggested_by` ni `comment`).
- `game_participations` : SELECT restreint à l'auteur+admin. RPCs publiques :
  - `get_session_participation_counts(uuid[])` — compteurs
  - `get_gouvernements_public(uuid)` — jeu collaboratif Gouvernement
  - `get_sondage_combos_public(uuid)` — combos sans pronostic ni mise
  - `get_session_data_for_harassment(uuid[])` — admin uniquement

**Pattern « table privée + vue publique »** (sécurité 2026-04-23) :
- `profiles` : SELECT restreint au propriétaire + admin. Vue `profiles_public` (security_invoker=on) expose uniquement : `user_id, display_name, emoji, avatar_url, balance, visible_in_sondages, visible_in_kiss_marry`. Les champs `is_suspended, has_accepted_charter, rules_accepted, created_at` ne sont plus visibles par les autres users. Tout `from('profiles').select(...)` côté front pour lire les profils d'autres users doit utiliser `profiles_public`. Garder `from('profiles')` uniquement pour : (a) son propre profil, (b) écrans admin nécessitant les flags sensibles.

**Toujours** créer une RPC SECURITY DEFINER plutôt que d'élargir la RLS quand un usage public limité est nécessaire.
