## Diagnostic révisé

La correction de `profiles_public` a fonctionné (le classement est revenu pour Christophe). Mais l'évolution des paris reste invisible parce que **la cause n'est pas la même**. C'est la RLS de la table `wagers` :

```
Users view own wagers : USING (auth.uid() = user_id)
Admin view all wagers : USING (has_role(...,'admin'))
```

Conséquence : quand `EventsPage`, `BetDetailPage` ou `ProfilePage` font `supabase.from('wagers').select(...).eq('bet_id', ...)`, un non-admin ne reçoit **que ses propres mises**. Donc :

- les **pools par option** (calculés client-side en sommant les `montant_dc`) restent vides ou ne reflètent que ses mises,
- le **nombre de participants** par pari = 1 (lui-même) ou 0,
- l'**évolution des cotes** dans le temps n'est pas perceptible — même si `bet_options.cote_actuelle` est bien à jour côté DB, l'UI affiche aussi la répartition des mises et un total qui restent vides.

Christophe voit donc des paris "morts" : 0 DC misés, 0 participants, pas de mouvement. D'où sa sensation d'être déconnecté.

## Pourquoi NE PAS rouvrir la RLS de `wagers`

Élargir `wagers` SELECT à tous exposerait `user_id + option_id + montant_dc` → on saurait **qui** a parié **quoi** et **combien**, ce qui casse la confidentialité du pari mutuel (et permet du metagaming). Mauvaise idée.

## Pourquoi NE PAS revenir sur `profiles_public`

Elle est désormais correcte (sans `security_invoker`) et expose uniquement les champs publics. C'est elle qui a réparé le classement. La toucher à nouveau ne résoudrait rien pour les pools de wagers.

## Solution proposée — RPC publique d'agrégats

Créer **deux fonctions SECURITY DEFINER** qui renvoient uniquement des **agrégats anonymisés** (jamais de `user_id` ni `montant` individuel) :

```sql
-- 1) Pools par (bet, option) + total + nb participants distincts
CREATE OR REPLACE FUNCTION public.get_bet_pools(p_bet_ids uuid[])
RETURNS TABLE (
  bet_id uuid,
  option_id uuid,
  pool_dc bigint,
  participants bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bet_id, option_id,
         COALESCE(SUM(montant_dc), 0)::bigint,
         COUNT(DISTINCT user_id)::bigint
  FROM public.wagers
  WHERE bet_id = ANY(p_bet_ids) AND is_retracted = false
  GROUP BY bet_id, option_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_bet_pools(uuid[]) TO authenticated;

-- 2) Compteur global de participants par pari (pour les cards)
CREATE OR REPLACE FUNCTION public.get_bet_participant_counts(p_bet_ids uuid[])
RETURNS TABLE (bet_id uuid, participants bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bet_id, COUNT(DISTINCT user_id)::bigint
  FROM public.wagers
  WHERE bet_id = ANY(p_bet_ids) AND is_retracted = false
  GROUP BY bet_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_bet_participant_counts(uuid[]) TO authenticated;
```

Ces fonctions ne révèlent **jamais** `user_id` ni le détail d'une mise. La RLS de `wagers` reste stricte.

## Modifs front

Remplacer dans **3 fichiers** la requête `supabase.from('wagers').select(...)` utilisée pour calculer les pools, par un appel RPC + une seconde requête restreinte à `eq('user_id', user.id)` pour récupérer la mise personnelle :

- `src/pages/EventsPage.tsx` (`fetchBets`) :
  - `supabase.rpc('get_bet_pools', { p_bet_ids: betIds })` → alimente `wagerPools`, `betTotals`, `wagerCounts`.
  - `supabase.from('wagers').select('bet_id, option_id, montant_dc').eq('user_id', user.id).in('bet_id', betIds).eq('is_retracted', false)` → alimente `userWagers`.

- `src/pages/BetDetailPage.tsx` (`fetchBet`) : même pattern (RPC pour pools/total/participants, requête `user_id = me` pour `myWagers`).

- `src/components/BetBottomSheet.tsx` / `BetCard.tsx` : aucun changement, ils consomment déjà `pools/totalPool/wagerCount` en props.

`ProfilePage.tsx` continue d'utiliser `from('wagers')` directement — il n'affiche que les mises de l'utilisateur courant, ce qui marche déjà avec la RLS actuelle.

## Vérifications après déploiement

1. Sur le compte Christophe, recharger `/` → les cards de paris affichent un total de mises > 0 et plusieurs participants.
2. Ouvrir un pari → la barre de répartition par option est correcte.
3. Vérifier que la cote affichée bouge bien après qu'un autre user mise (déjà OK côté DB via `recalculate_odds`, juste plus visible).
4. Vérifier qu'aucun endpoint front ne révèle `user_id` d'autres parieurs.

## Fichiers impactés

- Nouvelle migration SQL (2 fonctions SECURITY DEFINER + GRANT).
- `src/pages/EventsPage.tsx` (fetch wagers → RPC + requête perso).
- `src/pages/BetDetailPage.tsx` (idem).
- `mem://tech/auth/rbac` : ajouter `wagers` au pattern « table privée + RPC publique d'agrégats ».
