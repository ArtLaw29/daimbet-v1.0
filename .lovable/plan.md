## Objectif

Sur la page **Gouvernement** (/jeux → onglet Gouvernement) :
1. Faire apparaître le commentaire du Président Jordaim Belfort **en bas** de la page, après les ministères et après le bouton « Remanier le gouvernement ».
2. Garantir que la session de gouvernement de l'utilisateur soit **toujours conservée** entre les changements de page, jusqu'au clic explicite sur « Remanier le gouvernement ».

## Diagnostic du point 2

Dans `src/components/GouvernementPage.tsx` :
- Chaque clic sur « Former le gouvernement » fait un `INSERT` dans `game_participations` (toujours un nouveau record, ligne ~514).
- Au chargement (`useEffect` ligne ~409), on appelle le RPC `get_gouvernements_public` puis `allData.find(g => g.user_id === user.id)`.
- Le RPC ne fait **aucun ORDER BY**, et `find()` retourne le **premier** match dans l'ordre arbitraire renvoyé par Postgres.
- Conséquence : si l'utilisateur a plusieurs records (ex. tentatives antérieures, anciens gouvernements, ou même un premier insert sans commentaire avant l'UPDATE), `find()` peut tomber sur un record incomplet/vide → l'utilisateur voit la page vide alors que sa session existe pourtant en base.

## Modifications

### 1. `src/components/GouvernementPage.tsx`

**a) Réorganisation du JSX (point 1)**
Déplacer le bloc « commentaire de Jordaim » (actuellement lignes ~597-625) :
- Le retirer de sa position actuelle (juste après `PendingProposalsSection`).
- Le réinsérer **après** la card du formulaire qui contient le bouton « Remanier le gouvernement » (après la fermeture de `</div>` ligne ~723), juste avant la section « Autres gouvernements ».
- Faire pareil pour le bloc `loadingComment` (lignes ~627-632) qui doit aussi se trouver en bas, au même endroit, pour que l'utilisateur voie l'animation de rédaction sous son gouvernement et non au-dessus.

**b) Persistance fiable (point 2)**
Dans le `useEffect` de fetch initial :
- Au lieu de `allData.find(g => g.user_id === user.id)`, sélectionner explicitement le **plus récent** record de l'utilisateur :
  - Filtrer toutes les entrées de l'utilisateur, trier par `created_at` desc, et prendre la première qui contient un `gov_name` non vide (i.e. un gouvernement réellement formé).
- Cela nécessite que le RPC retourne `created_at` (déjà le cas, vérifié).

**c) Anti-régression sur le re-rendu**
Vérifier que `handleSubmit` met bien à jour `existingGouv` avec la version finale (incluant le `comment`) — c'est déjà le cas (ligne ~560 et ~564). RAS.

### 2. (Optionnel mais recommandé) `supabase/migrations/...`

Améliorer le RPC `get_gouvernements_public` pour qu'il retourne les rows triées par `created_at DESC`. Cela rend la lecture plus déterministe pour tous les usages :

```sql
CREATE OR REPLACE FUNCTION public.get_gouvernements_public(p_session_id uuid)
RETURNS TABLE(id uuid, user_id uuid, data jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, user_id, data, created_at
  FROM public.game_participations
  WHERE session_id = p_session_id
  ORDER BY created_at DESC;
$$;
```

Dans la liste « Autres gouvernements », adapter pour ne garder que **le plus récent par utilisateur** (groupement par `user_id`), afin de ne pas afficher plusieurs fois le même joueur s'il a remanié.

## Ce qui ne change pas

- Le bouton « Remanier le gouvernement » continue d'effacer uniquement l'état local (`setExistingGouv(null)`, vidage des sélecteurs). Aucun delete en base — c'est conservé par design pour garder l'historique.
- La logique de génération du commentaire IA et du PDF est inchangée.
- Les autres pages/jeux ne sont pas touchés.

## Fichiers modifiés

- `src/components/GouvernementPage.tsx` (réorganisation JSX + sélection du record le plus récent)
- `supabase/migrations/<timestamp>_order_gouvernements_rpc.sql` (tri du RPC) — optionnel mais recommandé
