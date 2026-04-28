# Correction du flux de connexion et de vérification d'email

## Diagnostic

J'ai identifié **deux bugs distincts** qui se combinent pour produire les deux symptômes que tu décris.

### Bug n°1 — La connexion déconnecte tous les utilisateurs (cause principale)

Dans `src/pages/AuthPage.tsx` (handleLogin) **et** `src/contexts/AuthContext.tsx` (fetchProfile), le code lit et essaie de mettre à jour une colonne **`is_activated`** sur la table `profiles`.

Or cette colonne **n'existe plus** dans la base de données (elle a été supprimée lors du nettoyage du flux d'inscription, en même temps que la colonne `email`). Aujourd'hui, la table `profiles` n'a plus de notion d'activation — la confirmation d'email gère ça nativement côté Supabase Auth.

Conséquence dans `AuthPage.handleLogin` :
```ts
if (profile && !(profile as any).is_activated) {
  await supabase.auth.signOut();
  toast.error("Ton compte n'est pas encore activé...");
}
```
`profile.is_activated` vaut `undefined` → `!undefined` vaut `true` → **tout utilisateur qui se connecte est immédiatement déconnecté** et renvoyé sur la landing page. C'est exactement le symptôme n°2 que tu décris ("certains utilisateurs… sont directement renvoyés sur la page de base").

(Le toast d'erreur existe bien mais peut passer inaperçu si la page change vite ou si l'utilisateur ne regarde pas en haut de l'écran.)

Dans `AuthContext.fetchProfile`, le même bug fait qu'à chaque chargement de session le code tente un `UPDATE profiles SET is_activated = true` qui échoue silencieusement (erreur 400 dans la console) puis re-fetch inutilement le profil. Pas bloquant, mais à nettoyer.

### Bug n°2 — Vérification d'email renvoie sur la landing page

Quand l'utilisateur clique sur le lien de confirmation, Supabase ouvre `…/welcome#access_token=…`. Pour que ça marche, l'URL `/welcome` (sur les 3 domaines : `daimbet.com`, `www.daimbet.com`, `daimbet.lovable.app`) doit être dans la **liste des Redirect URLs autorisées** de Supabase Auth.

Si une de ces URLs manque dans l'allowlist, Supabase ignore le `emailRedirectTo` et redirige vers la **Site URL** par défaut (souvent `/`). L'utilisateur arrive donc sur la landing page sans token → pas connecté → reste sur la landing.

De plus, même si la redirection vers `/welcome` réussit, la route `/welcome` n'est définie **que dans la branche "logged in"** de `AppRoutes`. Tant que la session n'est pas restaurée (le temps que Supabase parse le hash), `/welcome` tombe sur le `*` qui rend `LandingPage`. Pour les utilisateurs avec une connexion lente, ça se traduit par un flash visible voire un blocage.

## Corrections

### 1. Nettoyer toute référence à `is_activated` (corrige le bug bloquant)

**`src/pages/AuthPage.tsx`** — supprimer le bloc de vérification (lignes 124-138) :
```ts
// Check is_activated  ← À SUPPRIMER intégralement
if (data.user) { ... }
```
Conserver uniquement le `toast.success('Bienvenue…')` après un login réussi. Si l'email n'est pas confirmé, Supabase renvoie déjà l'erreur `Email not confirmed` qui est gérée juste au-dessus.

**`src/contexts/AuthContext.tsx`** — dans `fetchProfile`, supprimer le bloc d'auto-activation (lignes 51-64) :
```ts
if (data && !(data as any).is_activated) {
  await supabase.from('profiles').update({ is_activated: true } as any)...
  // toute cette logique disparaît
}
```
Garder uniquement le SELECT initial + `setProfile(data)` + `setHasAcceptedCharter`.

### 2. Rendre `/welcome` accessible aussi quand la session n'est pas encore chargée

**`src/App.tsx`** — ajouter `/welcome` dans la branche **NOT LOGGED IN** (et idéalement dans la branche maintenance), pour qu'on rende toujours `WelcomePage` quand l'URL est `/welcome`. Comme `WelcomePage` lit `profile?.display_name` avec `?.`, il fonctionne même si le profil n'est pas encore chargé (affiche "Bienvenue !").

Alternative plus robuste : ajouter une `<Route path="/welcome">` qui soit **rendue tout en haut de `AppRoutes`, avant les branches conditionnelles**, pour qu'elle s'affiche toujours indépendamment de l'état de loading/auth.

### 3. Vérifier la liste des Redirect URLs Supabase

C'est une étape de configuration côté Lovable Cloud (pas du code). Il faut s'assurer que les URLs suivantes sont dans la liste blanche des redirections d'authentification :
- `https://daimbet.com/welcome`
- `https://www.daimbet.com/welcome`
- `https://daimbet.lovable.app/welcome`
- `https://daimbet.com/reset-password` (idem pour reset de mot de passe)
- `https://www.daimbet.com/reset-password`
- `https://daimbet.lovable.app/reset-password`

Et que la **Site URL** soit `https://daimbet.com`.

Une fois le plan approuvé, je peux :
- te donner les liens directs vers la config Cloud → Users → URL Configuration pour vérifier toi-même, **ou**
- faire les ajustements de config via les outils Lovable Cloud si tu préfères.

## Fichiers modifiés

- `src/pages/AuthPage.tsx` — suppression du check `is_activated` dans `handleLogin`
- `src/contexts/AuthContext.tsx` — simplification de `fetchProfile`
- `src/App.tsx` — `/welcome` rendu accessible avant la garde d'authentification

## Détails techniques

Aucune migration SQL nécessaire : la base est déjà cohérente, c'est uniquement le code front qui a pris du retard sur le schéma. Le trigger `handle_new_user` en base est déjà à jour (vérifié) et crée correctement les profils sans `is_activated`/`email`.

Aucun risque pour les comptes existants : on retire un blocage erroné, on n'ajoute pas de nouvelle restriction.
