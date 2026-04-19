
## Plan : masquer toute trace de "Coup d'un soir" et "Plan Q" quand désactivés

### Contexte
Ces deux catégories Kiss/Marry sont contrôlées par un toggle admin (probablement via `nav_config` ou un flag équivalent). Quand elles sont cachées, des mentions résiduelles subsistent dans l'UI (intros, légendes, messages d'annonce, etc.) — il faut tout supprimer côté utilisateur.

### Exploration nécessaire
1. Lire `src/components/TabIntro.tsx` → supprimer la ligne `🌙 Coup d'un soir et 🔥 Plan Q — optionnels` du bloc `INTRO_KISS_MARRY` (ou la rendre conditionnelle).
2. Lire `src/pages/KissMarryPage.tsx` pour identifier toutes les mentions textuelles de "Coup d'un soir" / "Plan Q" / "🌙" / "🔥" (titres, sous-titres, instructions, écrans de confirmation, récap…).
3. Vérifier comment l'activation des catégories est gérée (probablement un flag `kiss_marry_sensitive_enabled` dans `nav_config` ou table dédiée — cf. mémoire `features/games/kiss-marry`).
4. Chercher d'autres références dans : `Navbar.tsx`, `LandingPage.tsx`, `GamesPage.tsx`, intros, messages Gazette/annonces auto liés à Kiss/Marry.

### Approche
- **Si désactivé côté admin** : aucune mention textuelle, aucun emoji, aucune étape, aucun récap ne doit évoquer ces deux catégories. L'utilisateur ne doit pas savoir qu'elles existent.
- **Si activé** : tout réapparaît normalement.

Concrètement :
1. **`TabIntro.tsx`** : transformer `INTRO_KISS_MARRY` en composant fonction qui lit le flag `nav_config` (ou prop) et affiche/masque la ligne `🌙 Coup d'un soir et 🔥 Plan Q — optionnels`.
2. **`KissMarryPage.tsx`** : envelopper toutes les sections (form, récap, confirmation) liées à Coup d'un soir / Plan Q dans des conditions `{sensitiveEnabled && …}`. Supprimer les mentions résiduelles dans les textes d'intro, légendes, étapes restantes.
3. **Annonces Gazette** : si des messages auto mentionnent ces catégories, les rendre conditionnels au flag.
4. **Pages publiques** (`LandingPage`, `GamesPage`) : vérifier qu'aucune mention promotionnelle n'évoque ces catégories quand désactivées.

### Fichiers touchés (estimés)
- `src/components/TabIntro.tsx`
- `src/pages/KissMarryPage.tsx`
- Éventuellement `src/pages/GamesPage.tsx`, `src/pages/LandingPage.tsx`, ou messages auto dans `supabase/functions/*` si annonces concernées.

### Hors-scope
- Logique backend de vote (inchangée).
- Le toggle admin lui-même (déjà existant).
- Aucune migration SQL.

Une fois validé, je passe en mode default pour explorer en détail puis appliquer les modifs.
