

L'utilisateur demande des conseils/un plan sur les procédures à mettre en place pour un flux de reset password sécurisé et fluide. Je regarde l'état actuel : `ResetPasswordPage.tsx` existe déjà, le flux "mot de passe oublié" dans `AuthPage.tsx` existe aussi, et la route est probablement déjà câblée. Donc la base est là — je dois identifier ce qui manque pour rendre l'expérience vraiment robuste, sécurisée et fluide.

Lacunes probables actuelles :
- Pas de feedback visuel (toast) sur succès/échec dans `ResetPasswordPage`
- Pas d'indicateur de force du mot de passe
- Longueur minimale faible (6 caractères)
- Pas de protection HIBP (mots de passe compromis)
- Pas de bouton "voir/masquer" le mot de passe
- Pas de gestion explicite du cas "lien expiré" avec CTA pour redemander un lien
- Email de reset non brandé (template Supabase par défaut)
- Pas de déconnexion forcée des autres sessions après reset
- Le `signOut()` après update est bien présent mais on pourrait clarifier l'UX

## Plan : flux de réinitialisation de mot de passe complet et sécurisé

### Ce qui existe déjà
- Bouton "Mot de passe oublié ?" sur `/connexion` qui envoie un lien via `resetPasswordForEmail`
- Page `/reset-password` qui détecte le `type=recovery` et appelle `updateUser({ password })`
- Redirection vers `/connexion` après succès

### Ce qu'il faut ajouter / améliorer

**1. Sécurité du mot de passe (`ResetPasswordPage.tsx`)**
- Passer la longueur minimale de 6 → 8 caractères
- Ajouter un indicateur visuel de force (faible / moyen / fort) basé sur longueur + variété (majuscule, chiffre, symbole)
- Bouton œil pour afficher/masquer le mot de passe sur les deux champs
- Refuser explicitement les mots de passe identiques à l'email ou au prénom
- Activer la **protection HIBP** (Have I Been Pwned) côté Lovable Cloud pour bloquer les mots de passe déjà compromis

**2. Feedback utilisateur**
- Ajouter des toasts (`sonner`) pour succès et erreur dans `ResetPasswordPage`
- Afficher un message d'erreur clair et lisible si `updateUser` échoue (lien expiré, session invalide, mot de passe trop faible…)
- Si le lien est invalide/expiré, afficher un CTA "Demander un nouveau lien" qui renvoie vers `/connexion` avec le formulaire "mot de passe oublié" déjà ouvert

**3. UX du lien email**
- Personnaliser le template email de récupération Supabase aux couleurs DAIMBet (logo, ton, FR) via `scaffold_auth_email_templates` — nécessite qu'un domaine email soit configuré
- Texte clair dans l'email : "Ce lien expire dans 1 heure", "Si tu n'as pas demandé ça, ignore cet email"

**4. Sécurité post-réinitialisation**
- Après `updateUser({ password })`, appeler `signOut({ scope: 'global' })` pour déconnecter toutes les sessions actives sur tous les appareils (déjà presque fait, à passer en `global`)
- Forcer une nouvelle connexion avec le nouveau mot de passe (déjà fait via redirection)

**5. Anti-abus côté formulaire "mot de passe oublié"**
- Le bouton se désactive déjà après envoi (bien)
- Ajouter un cooldown de 60 s avant de pouvoir redemander un lien depuis le même formulaire (compteur visible)
- Conserver le message générique "Si cette adresse est associée à un compte…" (déjà en place — bon pour ne pas révéler l'existence du compte)

### Détail technique
- `ResetPasswordPage.tsx` : ajouter `useState` pour visibilité mot de passe, calcul de force (regex), toasts via `sonner`, gestion explicite du cas `!isRecovery` avec CTA retour
- `AuthPage.tsx` : ajouter un `setTimeout` de 60 s qui réactive le bouton "Recevoir le lien" avec un compteur affiché
- Lovable Cloud : activer le **Password HIBP Check** dans Cloud → Users → Auth Settings → Email
- Email template : appeler `scaffold_auth_email_templates` (nécessite domaine email configuré au préalable)

### Ordre de mise en œuvre suggéré
1. Renforcer `ResetPasswordPage` (force, visibilité, toasts, gestion erreurs, signOut global)
2. Ajouter le cooldown sur le formulaire "mot de passe oublié" dans `AuthPage`
3. Activer la protection HIBP
4. (Optionnel) Personnaliser le template email — nécessite un domaine email

