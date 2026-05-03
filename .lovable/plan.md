## Problème

Le cabinet Fantasy Firm peut disparaître après changement de page / déconnexion. La logique de chargement est en place mais fragile : elle ne logge pas les erreurs, le nommage met `update` côté UI mais l'état `existingFirm` n'est rechargé qu'à la première visite, et des `INSERT` répétés peuvent créer des doublons silencieux que le tri ne gère pas toujours bien.

Vérifié en base : `game_participations` pour la session `00000000-0000-0000-0000-000000000002` est vide → la sauvegarde n'a pas abouti lors du dernier essai (erreur silencieuse probable).

## Changements (`src/components/FantasyFirmPage.tsx`)

1. **Chargement robuste** dans le `useEffect` :
   - Récupérer toutes les rows de l'utilisateur ordonnées `created_at DESC`.
   - Sélectionner la première ayant un `firm_name` et au moins 1 `member` valide (skip rows vides/corrompues).
   - Logger toute erreur Supabase dans la console pour diagnostic.

2. **Sauvegarde atomique** dans `confirmName` :
   - Toujours `DELETE` les rows existantes de l'utilisateur pour cette session, puis `INSERT` une nouvelle row.
   - Garantit une seule source de vérité, plus de doublons.
   - Logger et propager toute erreur (`throw`) pour que le toast d'erreur s'affiche au lieu d'un succès trompeur.

3. **`resetForm`** (bouton « Former un nouveau cabinet ») reste tel quel : supprime la row puis remet le formulaire à zéro — ce qui satisfait la règle « persistance jusqu'à clic explicite ».

## Résultat

- Cabinet sauvegardé immédiatement et durablement en base.
- Rechargement automatique à chaque visite/connexion tant que l'utilisateur n'a pas cliqué sur « Former un nouveau cabinet ».
- Erreurs visibles dans la console + toast clair en cas d'échec.

Aucun changement DB nécessaire.
