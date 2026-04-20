
## Plan — Correction des 4 findings de sécurité

### 1. 🔴 `profiles.email` exposé (ERROR)
**Constat** : la policy SELECT est `USING true` → tout user authentifié voit l'email de tous. Vérifié : aucun code client ne lit `profiles.email` (l'admin passe par l'edge function `get-user-emails`).

**Fix (migration)** :
```sql
ALTER TABLE public.profiles DROP COLUMN email;
```
- Aucune adaptation code nécessaire (déjà confirmé).
- Trigger `handle_new_user` à mettre à jour : retirer la ligne `email` de l'INSERT.

### 2. 🔴 Realtime sans RLS sur `ticket_messages` (ERROR)
**Constat** : un user authentifié peut s'abonner à n'importe quel canal Realtime et recevoir les messages des tickets d'autres users.

**Fix (migration)** :
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
-- RLS SELECT déjà restrictive (jointure tickets.user_id = auth.uid()) ✅
-- → Realtime appliquera la policy SELECT existante automatiquement.
```
Vérifier aussi que les autres tables exposées via Realtime (gazette, etc.) ont des RLS SELECT cohérentes — la `gazette` est publique donc OK.

### 3. 🟡 HTML injection dans `admin-notify-email` (WARN)
**Constat** : `n.detail` (issu de `public-contact`) est injecté brut dans l'email HTML.

**Fix (`supabase/functions/admin-notify-email/index.ts`)** :
- Ajouter un helper `esc()` qui échappe `& < > "`.
- Wrapper `n.title` et `n.detail` avec `esc()`.
- Idem défensivement dans `public-contact/index.ts` pour le mail direct (qui fait déjà `replace(/</g, '&lt;')` partiellement, à généraliser).

### 4. 🟡 Cron functions non authentifiées (WARN)
**Constat** : `ticket-lifecycle`, `check-auto-close`, `km-reveal-tick` sont publiques → un attaquant peut les déclencher pour purger des données.

**Fix** :
- Ajouter un secret `CRON_SECRET` (via `add_secret` tool).
- Dans chaque fonction : vérifier `req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET')` au début.
- Mettre à jour les jobs `pg_cron` existants pour injecter le header `x-cron-secret`.
- Vérifier d'abord les jobs cron actuels avec une lecture `cron.job` pour les mettre à jour proprement (utiliser `supabase--insert` puisque ça contient des secrets/URL).

### Fichiers touchés
- **Migration SQL** :
  - `DROP COLUMN profiles.email`
  - `CREATE OR REPLACE` du trigger `handle_new_user` sans email
  - `ALTER PUBLICATION supabase_realtime ADD TABLE ticket_messages`
- **Edge functions** :
  - `admin-notify-email/index.ts` — escape HTML
  - `public-contact/index.ts` — escape HTML uniformisé
  - `ticket-lifecycle/index.ts` — vérif `CRON_SECRET`
  - `check-auto-close/index.ts` — vérif `CRON_SECRET`
  - `km-reveal-tick/index.ts` — vérif `CRON_SECRET`
- **Secret** : `add_secret` pour `CRON_SECRET`
- **pg_cron** (`supabase--insert`) : refresh des jobs avec le header
- **Mémoire** : note sur le pattern cron avec secret

### Étapes d'exécution
1. Demander l'ajout du secret `CRON_SECRET`.
2. Migration SQL (drop column email + trigger + realtime publication).
3. Patch des 5 edge functions.
4. Refresh des jobs pg_cron avec le nouveau header.
5. Marquer les 4 findings comme résolus (`security--manage_security_finding`).

### Risques
- **Drop email** : aucun (vérifié, code n'utilise que `auth.users.email` côté admin).
- **Cron secret** : si l'utilisateur ne crée pas le secret tout de suite, les jobs échouent → on attend l'ajout du secret avant de patcher les fonctions.
- **Realtime** : `ticket_messages` doit déjà avoir REPLICA IDENTITY (à vérifier en migration).
