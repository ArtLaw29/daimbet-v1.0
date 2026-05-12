## Refonte « Mot du jour » — 6 variantes par jour

### 1. Base de données (migration)

- Ajouter une colonne `variant text` à `daily_scores` (nullable, default `NULL`).
- Remplacer la contrainte d'unicité actuelle `(user_id, game_type, played_on)` par un index unique partiel :
  - `(user_id, game_type, played_on)` quand `variant IS NULL` (autres jeux)
  - `(user_id, game_type, played_on, variant)` quand `variant IS NOT NULL` (wordle)
- Nouvelle RPC `submit_wordle_variant(p_variant text, p_score jsonb, p_completed boolean)` :
  - Variantes acceptées : `5`, `6`, `7`, `8`, `9`, `culture`.
  - Lit `daily_content` du jour de type `wordle`, vérifie que `data->>'word_'||variant` existe.
  - Calcule le rang en comptant les `daily_scores` avec `game_type='wordle'`, `played_on=today`, `variant=p_variant`, `rewarded=true` déjà présents.
  - Récompenses lues dans `data->'rewards_'||variant` (sinon défaut `[500,300,200,50,50]`).
  - Crédite le profil + insère `solde_history` (raison `Mot du jour [variante] – rang N`).
  - Empêche un second gain pour la même variante du même jour ; autorise les autres variantes.

### 2. Admin (`AdminDailyContent.tsx`)

- `WordleEditor` réécrit : 6 inputs (5/6/7/8/9 lettres + Culture).
- Validation longueur : exact pour 5–9, plage 5–12 pour Culture, A–Z uniquement.
- 6 blocs `RewardsSettings` (un par variante), stockés sous `rewards_5`, `rewards_6`, …, `rewards_culture`.
- Sauvegarde dans `daily_content.data = { word_5, word_6, …, word_culture, rewards_5, … }`.
- Compatibilité ascendante : si un ancien enregistrement a juste `word`, on le mappe vers `word_5` au chargement.

### 3. Page joueur (`WordlePage.tsx`)

- Écran « Défis du jour » : grille de 6 cartes (5/6/7/8/9 + Culture) avec :
  - Couleur/icône par difficulté.
  - Carte Culture stylée or (bordure dorée + badge « Élite »).
  - Badge ✅ « Terminé » si l'utilisateur a déjà gagné cette variante (via `daily_scores` filtrée par `variant`).
- Écran de jeu : grille `ROWS=6` × `COLS=length(word)` adaptative. Bouton « Retour aux défis ».
- LocalStorage : clé `wordle:{date}:{variant}` stockant `{ guesses, finished }` pour reprise sans perte de progression.
- Au gain → appel `supabase.rpc('submit_wordle_variant', { p_variant, p_score, p_completed: true })`.
- Classement par variante (filtré côté client).

### 4. Détails techniques

- `normalize_daily_game_type` n'a pas besoin de changer (on garde `wordle` comme `game_type`).
- Pour ne pas casser les jeux qui appelaient `submit_game_result('wordle', …)` : la nouvelle RPC remplace cet appel uniquement dans `WordlePage`.
- Pas de changement requis pour les autres jeux quotidiens (sudoku, mots fléchés).

### 5. Hors scope

- Pas de refonte des stats admin (compteur global `wordle` continue de fonctionner — toutes variantes confondues).
- Pas de réinitialisation des anciens scores ni des contenus déjà programmés (le mapping rétrocompatible suffit).
