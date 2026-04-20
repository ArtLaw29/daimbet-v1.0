
## Plan : bouton "Cacher" pour chaque jeu (indépendant de "Suspendre")

### Contexte actuel
- Côté admin, chaque jeu a déjà un toggle **Suspendre** (`platform_settings` clé `suspend_<gameId>`) → affiche "Jeu suspendu" mais l'onglet reste visible.
- Il manque un toggle **Cacher** : l'onglet disparaît totalement de la barre des jeux pour les utilisateurs.

### Approche
Ajouter un second flag indépendant `hide_<gameId>` dans `platform_settings` (même mécanique que `suspend_`), avec son propre bouton dans l'admin.

### Modifications

1. **`src/components/AdminGameSessions.tsx`** (ou la section qui gère les toggles Suspendre)
   - Ajouter un second bouton **Cacher / Afficher** par jeu (5 jeux : daimocratie, you-decide, gouvernement, fantasy-firm, kiss-marry).
   - Lecture/écriture de `platform_settings` clé `hide_<gameId>` (valeur `'true'`/`'false'`).
   - UI : icône Eye/EyeOff + libellé clair, distinct visuellement du bouton Suspendre.

2. **`src/pages/GamesPage.tsx`**
   - Étendre le `useEffect` qui fetch les settings pour aussi récupérer les clés `hide_*`.
   - Filtrer `GAME_TABS` : si `hidden[tab.id]` → ne pas afficher l'onglet du tout.
   - Si l'onglet actif devient caché → basculer sur le premier onglet visible.
   - Si **tous** les jeux sont cachés → afficher un message "Aucun jeu disponible pour le moment".

### Sémantique
- **Suspendre** : onglet visible mais grisé + message "Jeu suspendu" (utilisateur sait qu'il existe).
- **Cacher** : onglet invisible (utilisateur ne sait pas qu'il existe). Indépendants.

### Hors-scope
- Pas de migration SQL (utilise `platform_settings` existant).
- Pas de changement de logique de jeu.
- Pas de modification de la navbar principale (jeux gérés via la sous-nav `GamesPage`).

### Fichiers touchés (2)
- `src/components/AdminGameSessions.tsx`
- `src/pages/GamesPage.tsx`
