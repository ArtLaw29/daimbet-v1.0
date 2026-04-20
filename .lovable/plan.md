
Je propose 3 fixes ciblés correspondant aux bugs prioritaires identifiés dans l'audit précédent.

## Plan — Correction des 3 bugs prioritaires

### Bug 1 : RLS permissive sur `kiss_marry_votes`
**Problème** : la policy INSERT a `WITH CHECK true` → un utilisateur peut bourrer les urnes (insertion arbitraire de votes via SQL direct).
**Fix (migration SQL)** :
- Remplacer la policy par une `WITH CHECK` qui force le passage par l'edge function `km-vote` :
  - Soit `WITH CHECK (false)` côté client + l'edge function `km-vote` (en service role) reste seul autorisé à insérer.
  - C'est la solution propre car `km-vote` valide déjà l'unicité par `voter_hash`/mois.
- Vérifier ensuite que `km-vote/index.ts` utilise bien `SUPABASE_SERVICE_ROLE_KEY` (à confirmer en lisant le fichier).

### Bug 2 : Table `content_reports` orpheline + trigger actif
**Problème** : la table et le trigger `handle_content_report` sont toujours présents en BDD alors que toute l'UI a été supprimée. Surface d'attaque résiduelle.
**Fix (migration SQL)** :
```sql
DROP TRIGGER IF EXISTS on_content_report ON public.content_reports;
DROP FUNCTION IF EXISTS public.handle_content_report();
DROP TABLE IF EXISTS public.content_reports;
ALTER TABLE public.daimocratie_proposals DROP COLUMN IF EXISTS report_count, DROP COLUMN IF EXISTS is_hidden;
ALTER TABLE public.game_sessions DROP COLUMN IF EXISTS report_count, DROP COLUMN IF EXISTS is_hidden;
```
- Vérifier d'abord en code (`code--search_files`) qu'aucun composant ne lit encore `report_count`/`is_hidden` avant le DROP COLUMN. Si c'est le cas → adapter le code (afficher tout sans filtre `is_hidden`).

### Bug 3 : IDs de session hardcodés dans `AdminGouvernements` / `AdminHarassmentFlags`
**Problème** : `00000000-0000-0000-0000-000000000001/2` ne survivent pas à un nuclear reset → écrans vides en silence.
**Fix (TypeScript)** :
- Dans les deux composants, remplacer le filtre `eq('session_id', HARDCODED_ID)` par un lookup dynamique :
  ```ts
  const { data: govSession } = await supabase
    .from('game_sessions')
    .select('id')
    .eq('game_type', 'gouvernement')
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  ```
- Si la session n'existe pas, afficher un placeholder explicite "Aucune session Gouvernement active" plutôt qu'un écran vide.
- Idem pour Fantasy Firm (`game_type='fantasy_firm'`).
- **Vérification préalable** : confirmer les valeurs exactes du type enum `game_type` (lire `types.ts`) avant de coder.

### Détails techniques par étape
1. **Lecture** : `supabase/functions/km-vote/index.ts`, `src/components/AdminModeration.tsx` (résiduel `report_count`?), `src/integrations/supabase/types.ts` (enum `game_type`).
2. **Migration 1** : durcir RLS `kiss_marry_votes`.
3. **Migration 2** : drop `content_reports` + trigger + colonnes orphelines.
4. **Code** : refactor `AdminGouvernements.tsx` et `AdminHarassmentFlags.tsx` pour lookup dynamique des sessions simulation.
5. **Mémoire** : ajouter une note `mem://tech/constraints/db-constraints` sur le pattern "session simulation = lookup dynamique, jamais hardcodé".

### Impact
- 🔒 Aucune perte de fonctionnalité utilisateur ou admin.
- ✅ Surface d'attaque réduite (1 RLS, 1 table, 1 trigger).
- ✅ Robustesse au nuclear reset.

### Risque
- **Migration 2** : si du code référence encore `is_hidden`/`report_count`, il faut le retirer dans le même commit. Je vérifierai avant le DROP COLUMN.
