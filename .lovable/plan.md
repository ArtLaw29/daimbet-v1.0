# Remplacement Sophie/Sonia → Sonya

## Contexte

Une recherche dans la base de données (profils, votes Kiss/Marry, suggestions Tiercé, paris, options, sondages, tournois, gazette, propositions Pipeline) **n'a retourné aucune occurrence** de "Sophie" ou "Sonia". Ces prénoms n'existent donc que dans le **code source**, dans les listes de prénoms en dur de la promo.

Trois fichiers contiennent ces prénoms :

1. **`src/lib/pari-mutuel.ts`** — liste maîtresse des prénoms de la promo (utilisée pour Tiercé du Daim, autocomplétion, etc.) → contient `'Sonia'`
2. **`src/components/GouvernementPage.tsx`** — liste des prénoms candidats pour le jeu Gouvernement → contient `'Sonia'`
3. **`src/components/FantasyFirmPage.tsx`** — config Daim Fantasy Firm → contient `'Sophie'` (clé de spécialité + nom complet "Sophie Grinstein")

## Modifications

### 1. `src/lib/pari-mutuel.ts`
- Remplacer `'Sonia'` par `'Sonya'` dans la liste `PROMO_PRENOMS`.
- Re-trier alphabétiquement si la liste est triée (Sonya reste après Sofia).

### 2. `src/components/GouvernementPage.tsx`
- Remplacer `'Sonia'` par `'Sonya'` dans la liste de prénoms (ligne 40).

### 3. `src/components/FantasyFirmPage.tsx`
- Remplacer la clé `'Sophie': 'Droit bancaire/financier et boursier'` par `'Sonya': 'Droit bancaire/financier et boursier'`.
- Remplacer `'Sophie': 'Sophie Grinstein'` par `'Sonya': 'Sonya Grinstein'` dans la map des noms complets.
- Vérifier qu'aucune autre référence à `'Sophie'` ne subsiste dans le fichier (ex: ordre d'affichage, exports).

## Vérification post-changement

- `grep -ri "Sophie\|Sonia"` sur `src/` doit ne rien retourner.
- Lancer le build TypeScript pour s'assurer qu'aucune référence cassée ne subsiste (les maps de FantasyFirm sont consommées par clé).

## Note importante

Aucune migration BDD n'est nécessaire : aucune donnée existante ne référence ces prénoms. Si des votes/paris ont été créés **après** ce changement avec l'ancien nom, ils ne seront pas affectés rétroactivement (mais la requête actuelle confirme qu'il n'y en a aucun).
