
## Plan : Écran "Règles" obligatoire à l'inscription

### 1. Migration BDD
Ajouter à `profiles` :
- `rules_accepted` (boolean, default false)
- `rules_accepted_at` (timestamptz, nullable)

Mettre à jour le trigger `handle_new_user` pour insérer `rules_accepted = true` et `rules_accepted_at = now()` (puisque les règles sont acceptées **avant** que `signUp` ne soit appelé).

### 2. `src/pages/AuthPage.tsx`
- Ajouter un state `step: 'form' | 'rules'`.
- Quand l'utilisateur soumet le form d'inscription valide → ne pas appeler `signUp` directement, basculer sur `step = 'rules'`.
- Nouvel écran plein-page "Règles de DaimBet" avec le contenu fourni + bouton **"J'accepte et je crée mon compte"**.
- Le clic sur ce bouton appelle `supabase.auth.signUp(...)` (logique actuelle déplacée).
- Bouton "Retour" pour revenir au formulaire.

### 3. Nouveau composant `src/components/RulesScreen.tsx`
Composant réutilisable affichant les règles avec un bouton d'action paramétrable (label + onAccept). Utilisé à la fois :
- pendant l'inscription (label : "J'accepte et je crée mon compte")
- au login si `rules_accepted = false` (label : "J'accepte les règles")

### 4. `src/contexts/AuthContext.tsx`
- Ajouter `rulesAccepted: boolean` au context (lu depuis `profile.rules_accepted`).

### 5. `src/App.tsx` (garde-fou login)
Dans la branche "LOGGED IN", si `rulesAccepted === false` et `!isAdmin` → afficher `<RulesScreen onAccept={...}>` plein écran à la place de toutes les routes. Le `onAccept` met à jour `profiles.rules_accepted = true, rules_accepted_at = now()` puis `refreshProfile()`.

### Fichiers (4 + 1 migration)
- ➕ Migration SQL (colonnes + trigger update)
- ➕ `src/components/RulesScreen.tsx`
- ✏️ `src/pages/AuthPage.tsx` (étape règles avant signUp)
- ✏️ `src/contexts/AuthContext.tsx` (expose rulesAccepted)
- ✏️ `src/App.tsx` (garde-fou)

### Hors-scope
- Pas de modif du flux admin.
- Pas de modif des autres écrans/jeux.
- Conserve le système charter existant (silencieux, indépendant) — les nouvelles règles sont une couche distincte plus stricte.
