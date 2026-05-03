# Diagnostic

Christophe (et les autres non-admins) ne voient plus :
- le **classement** (vide ou avec eux seuls),
- les **noms d'auteurs** des paris / propositions / messages,
- les listes de joueurs dans Sondages/Tournois/Gouvernement,
ce qui donne l'impression d'être "déconnecté".

## Cause racine

La vue `public.profiles_public` est définie avec `security_invoker=on`. Elle interroge donc la table `profiles` **avec les droits de l'appelant**. Or la policy SELECT de `profiles` est :

```
(auth.uid() = user_id) OR has_role(auth.uid(), 'admin')
```

→ Un utilisateur non-admin ne voit, à travers `profiles_public`, **que sa propre ligne**. C'est confirmé dans les logs réseau de Christophe :

- `GET /profiles_public?select=display_name` → `[]`
- `GET /profiles?select=user_id,balance&order=balance.desc` → 1 seule ligne (la sienne)
- `GET /profiles_public?select=user_id,display_name&user_id=in.(...)` → `[]`

Conséquences observées :
- **LeaderboardPage** : un seul profil renvoyé → classement vide / "1 sur 1".
- **Navbar `topProfiles`**, **PendingProposalsSection** (auteurs), **AdminSondages/Tournois/Gouvernements**, **GazettePage**, **AuthPage** (vérification de pseudos pris) → vides.
- Les paris sont bien retournés par l'API, mais sans noms d'auteurs/joueurs et sans classement, l'interface donne l'illusion d'une déconnexion.

Cette vue a été introduite récemment (mémoire RBAC 2026-04-23) pour cacher les champs sensibles (`is_suspended`, `has_accepted_charter`, `rules_accepted`, `created_at`). Le `security_invoker=on` annule complètement son intérêt public.

# Solution

## 1. Migration SQL

Recréer `profiles_public` **sans** `security_invoker=on` (donc en SECURITY DEFINER implicite, exécutée avec les droits du propriétaire `postgres`), pour que les champs publics soient lisibles par tous les utilisateurs authentifiés, tout en gardant les colonnes sensibles non-exposées.

```sql
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public AS
SELECT
  user_id,
  display_name,
  emoji,
  avatar_url,
  balance,
  visible_in_sondages,
  visible_in_kiss_marry
FROM public.profiles;

-- Lecture publique (champs non-sensibles uniquement)
GRANT SELECT ON public.profiles_public TO authenticated, anon;

-- Empêcher toute écriture via la vue
REVOKE INSERT, UPDATE, DELETE ON public.profiles_public FROM PUBLIC, authenticated, anon;
```

La table de base `profiles` reste protégée par sa RLS actuelle (les champs sensibles `is_suspended`, `has_accepted_charter`, `rules_accepted`, `created_at` ne sont accessibles directement qu'au propriétaire ou à un admin).

## 2. Mettre à jour la mémoire RBAC

Préciser que `profiles_public` est désormais une vue **SECURITY DEFINER** (sans `security_invoker`), exposant uniquement les colonnes publiques, et que la table `profiles` ne doit jamais être interrogée pour lire le profil d'un autre utilisateur.

## 3. Vérification après migration

- Recharger `/classement` → tous les utilisateurs apparaissent.
- Recharger `/` (Events) → noms d'auteurs des paris/propositions s'affichent.
- Vérifier `/jeux` (Sondages, Tournois, Gouvernement) → listes de joueurs OK.
- Vérifier l'inscription (`AuthPage`) → la détection des pseudos déjà pris fonctionne à nouveau.

# Fichiers impactés

- Nouvelle migration SQL (recréation de la vue + grants).
- `mem://tech/auth/rbac` (mise à jour de la note de sécurité).

Aucun changement de code TS nécessaire — toutes les requêtes utilisent déjà `profiles_public`.
