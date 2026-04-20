

## Diagnostic — Reset password ne fonctionne pas

### Cause racine (preuves dans les logs auth)
Logs auth `2026-04-20T09:51` :
1. `09:51:23` → `user_recovery_requested` envoyé ✅ (le mail part)
2. `09:51:38` → `/verify` réussi MAIS log_type = **`login`** (pas recovery) → l'utilisateur est **connecté silencieusement** au lieu d'être amené sur l'écran reset
3. `09:51:45` & `09:52:32` → autres clics sur le lien : **`403 One-time token not found`** (le token a déjà été consommé au premier clic)

### Trois problèmes cumulés

**Problème #1 — Le token recovery est consommé par un préfetch / double-clic**
Le lien de reset est un OTP **à usage unique**. Quand l'email client (Outlook, Gmail, antivirus, Safe Links Microsoft) ou le navigateur fait un préfetch du lien, le token est consommé côté Supabase → l'utilisateur arrive avec un token déjà mort. Résultat : `303` vers le site, sans hash `#access_token=…&type=recovery` → la page ne détecte pas le mode recovery.

**Problème #2 — `ProfilePage.resetPassword` n'envoie PAS de `redirectTo`**
```ts
// src/pages/ProfilePage.tsx:250
await supabase.auth.resetPasswordForEmail(user.email); // ❌ pas de redirectTo
```
Sans `redirectTo`, Supabase utilise la **Site URL** par défaut du projet → l'utilisateur est redirigé vers `/` (qui le connecte directement vu qu'il a une session) au lieu de `/reset-password`. C'est exactement ce qu'on voit dans le log : `/verify` → `login` event → redirection vers la home.

**Problème #3 — `ResetPasswordPage` ne gère pas le cas "user déjà loggué + event PASSWORD_RECOVERY"**
Quand le user est déjà connecté (cas Outlook qui ouvre dans la même session), Supabase déclenche bien `PASSWORD_RECOVERY` mais notre `App.tsx` route `/reset-password` derrière Navbar. Si la route appelée est `/` (à cause du #2), on n'arrive même pas sur la page.

### Plan de correction

**Fix 1 — Ajouter `redirectTo` dans `ProfilePage.resetPassword`** (1 ligne)
```ts
await supabase.auth.resetPasswordForEmail(user.email, {
  redirectTo: `${window.location.origin}/reset-password`,
});
```

**Fix 2 — Robustifier `ResetPasswordPage`** :
- Lire à la fois `window.location.hash` ET `window.location.search` (selon la version du flow Supabase, le token arrive en query ou en fragment).
- Si on détecte un `access_token` + `type=recovery` dans le hash, appeler `supabase.auth.setSession(...)` explicitement pour forcer l'event `PASSWORD_RECOVERY`.
- Allonger le timeout de fallback (1500 ms → 4000 ms) pour laisser le temps à `onAuthStateChange` de se déclencher.
- Si `error_code=otp_expired` ou `access_denied` dans le hash, afficher l'écran "Lien expiré" avec bouton "Renvoyer" qui appelle directement `resetPasswordForEmail` sur l'email courant.

**Fix 3 — Intercepter `PASSWORD_RECOVERY` au niveau global (`AuthContext`)**
Si l'event `PASSWORD_RECOVERY` arrive alors qu'on n'est pas sur `/reset-password` (cas où Supabase redirige vers `/` à cause d'une mauvaise Site URL ou d'un préfetch), forcer `navigate('/reset-password')` automatiquement. Sinon le user est connecté sur la home sans jamais voir l'écran reset.

**Fix 4 — Vérifier la config Supabase Auth** (info à donner à l'utilisateur)
Dans **Cloud → Auth → URL Configuration**, vérifier que :
- **Site URL** = `https://daimbet.lovable.app`
- **Redirect URLs** contient bien `https://daimbet.lovable.app/reset-password` ET `https://id-preview--*.lovable.app/reset-password` (preview).
Si `/reset-password` n'est pas whitelisté, Supabase **silencieusement** rabat sur la Site URL (`/`) → exactement le bug observé.

### Fichiers modifiés
- `src/pages/ProfilePage.tsx` — ajouter `redirectTo`
- `src/pages/ResetPasswordPage.tsx` — gérer query string + setSession + écran "lien expiré" enrichi
- `src/contexts/AuthContext.tsx` — listener global `PASSWORD_RECOVERY` → redirect

### Risques
- Le Fix 3 ne doit pas créer de boucle de navigation (guard sur `location.pathname !== '/reset-password'`).
- Si la cause #4 (Redirect URLs non whitelistée) est réelle, seul l'utilisateur peut la corriger côté config — je le signalerai clairement après la correction code.

### Test final
Demander un nouveau lien depuis `/connexion`, ouvrir l'email **dans un onglet privé** (évite préfetch Outlook), vérifier qu'on atterrit bien sur le formulaire "Nouveau mot de passe".

