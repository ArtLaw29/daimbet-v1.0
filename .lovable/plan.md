

## Plan : corrections d'orthographe, grammaire et cohérence (FR)

J'ai parcouru les principaux écrans utilisateurs (Landing, Auth, Welcome, Contact, Profile, TabIntro, Charter, Tournoi, Glossary…). La langue est globalement bonne — je n'ai trouvé aucune faute d'orthographe grossière. En revanche, j'ai relevé une dizaine de petites coquilles typographiques, d'incohérences et d'erreurs grammaticales légères à corriger.

### Corrections proposées

**Typographie — espace insécable avant `%`** (règle française stricte)
- `src/components/CharterModal.tsx` ligne 73 : `rake de 5%` → `rake de 5 %`
- `src/pages/ProfilePage.tsx` lignes 488-489 : `5%` / `30%` / `15%` → `5 %` / `30 %` / `15 %`
- `src/pages/EventsPage.tsx` ligne 195 : `rake 5%` → `rake 5 %`
- `src/pages/BetDetailPage.tsx` lignes 183, 439, 446 : `15%`, `30%`, `5%` → `15 %`, `30 %`, `5 %`
- `src/pages/AdminPage.tsx` lignes 53-55, 937 : idem (`30%`, `15%`, `5 %` est déjà correct ligne 937)
- `src/components/BetCard.tsx` ligne 99 : `Mise max 15%` → `Mise max 15 %`
- `src/components/SondagePage.tsx` ligne 531 : `20%` → `20 %`

**Cohérence de marque — DaimCoins / DaimBet**
La mémoire dit "DAIMcoin (DC)" mais le code mélange `DaimCoins`, `DAIMcoin`, `DAIMBet`, `DaimBet`. Pour rester cohérent avec la mémoire et l'UI actuelle :
- `src/pages/WelcomePage.tsx` ligne 33 : `1 000 DaimCoins` → `1 000 DAIMcoins` (alignement avec landing page)
- Vérifier dans `TournoiPage.tsx` (ligne 447) et autres : harmoniser sur `DAIMcoins` partout côté UI utilisateur.

**Petites améliorations grammaticales / ponctuation**
- `src/pages/AuthPage.tsx` ligne 244 : `La plateforme de jeux entre DAIM 🦌` → OK, déjà corrigé récemment. RAS.
- `src/pages/AuthPage.tsx` ligne 333 : `L'email doit commencer par ton prénom` → ajouter point final.
- `src/pages/AuthPage.tsx` ligne 357 : `Les mots de passe ne correspondent pas` → ajouter point final.
- `src/pages/ContactPage.tsx` ligne 157 : `L'email doit se terminer par @essec.edu` → ajouter point final.
- `src/pages/ContactPage.tsx` ligne 201 : `sous 24h` → `sous 24 h` (espace insécable + h minuscule, norme FR).
- `src/pages/AuthPage.tsx` ligne 373 : `Renvoyer dans ${forgotCooldown}s` → `${forgotCooldown} s`.
- `src/pages/ContactPage.tsx` ligne 196 : `Réessayer dans ${cooldown}s` → `${cooldown} s`.

**Ellipse — uniformisation**
Mélange de `…` (caractère unicode) et `...` (trois points). On garde `…` partout pour le rendu propre :
- `src/pages/WelcomePage.tsx` ligne 36 : `Paris, jeux, sondages, tournois…` ✅ déjà OK.
- `src/pages/ProfilePage.tsx` ligne 517 : `Décris ton problème...` → `Décris ton problème…`
- `src/pages/AuthPage.tsx` ligne 304 : `Choisis ton prénom...` → `Choisis ton prénom…`
- `src/pages/AuthPage.tsx` ligne 312 : `Vérification...` → `Vérification…`

**Reformulations mineures**
- `src/components/CharterModal.tsx` ligne 68 : `<strong> on rigole ensemble.</strong>` → harmoniser avec TabIntro et ProfilePage : `<strong> on rigole ensemble, jamais aux dépens de quelqu'un.</strong>` (la version courte est isolée, les deux autres écrans utilisent la version longue).
- `src/pages/LandingPage.tsx` ligne 71 : `Attention, le délit d'initié n'est ni recommandé, ni interdit.` → tournure ambiguë (« ni recommandé, ni interdit » = double négation paradoxale voulue, mais peut être lu comme erreur). Remplacer par : `Attention, le délit d'initié n'est pas recommandé… mais pas interdit non plus.` (clarifie l'humour).

### Hors-scope (volontaire)
- Textes admin déjà cohérents.
- Emojis et anglicismes assumés (rake, pari mutuel) : conservés tels quels (lexique métier validé en mémoire).

### Fichiers touchés (8)
`AuthPage.tsx`, `ContactPage.tsx`, `WelcomePage.tsx`, `ProfilePage.tsx`, `LandingPage.tsx`, `CharterModal.tsx`, `BetCard.tsx`, `BetDetailPage.tsx`, `EventsPage.tsx`, `AdminPage.tsx`, `SondagePage.tsx`, `TournoiPage.tsx`.

Aucune modification de logique, uniquement du texte.

