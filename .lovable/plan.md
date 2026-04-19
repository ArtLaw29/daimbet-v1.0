

L'utilisateur a validé : footer landing+connexion, similaire aux tickets mais différencié dans l'admin, exige nom + email de réponse, validation @essec.edu stricte, immédiat (notif rouge + email Resend), fire-and-forget.

## Plan : portail "Contacter l'admin" public

### 1. Base de données (migration)
Nouvelle table `public_contact_messages` :
- `id`, `created_at`
- `nom` (text, qui est derrière le message)
- `email` (text, @essec.edu, validé)
- `subject` (text, ex: "Mot de passe oublié")
- `message` (text, max 1000)
- `ip_address` (text, pour rate-limit)
- `is_handled` (bool, default false)

RLS :
- SELECT : admin uniquement
- UPDATE : admin uniquement (marquer traité)
- INSERT : refusé en direct (uniquement via edge function avec service role)
- DELETE : admin uniquement

### 2. Edge function publique `public-contact` (`verify_jwt = false`)
- Valide les inputs avec zod : `nom` (1-80), `email` (regex `@essec.edu`), `subject` (enum), `message` (1-1000), honeypot vide
- Rate-limit : refuse si > 1 message/IP/5min ou > 5/IP/24h (lecture sur `public_contact_messages`)
- Insert dans `public_contact_messages` via service role
- Insert dans `admin_notifications` (type `public_contact`, titre `📬 Contact public : <subject>`, detail = nom + email + extrait message)
- Envoie email immédiat à l'admin via Resend (template HTML DAIMBet, sujet `[DAIMBet] Contact public : <subject>`, contient nom, email de réponse, message)
- Retourne toujours un message générique de succès

### 3. Page `/contact` (publique, hors auth)
- Form : Nom, Email (@essec.edu, message d'erreur si autre), Sujet (Select : Mot de passe oublié / Email non reçu / Compte bloqué / Inscription / Autre), Message (textarea + compteur 1000 char)
- Honeypot caché (champ `website` masqué visuellement)
- Cooldown 60 s côté client après envoi
- Après succès : écran de confirmation "Message envoyé ✅ — l'admin te répondra par email à <ton email>"

### 4. Liens d'accès
- **Footer** de `LandingPage.tsx` : ajouter "Bloqué ? Contacter l'admin →" pointant vers `/contact`
- **Footer/bas du formulaire** de `AuthPage.tsx` (page connexion) : même lien
- Ajouter route `/contact` dans `App.tsx` (accessible logged-in OR out)

### 5. Côté admin
Nouveau composant `AdminPublicContacts.tsx` ajouté dans la sidebar admin (section dédiée, distincte de "Tickets") :
- Liste des messages, badge non-traités
- Affiche nom, email (cliquable `mailto:`), sujet, message complet, date
- Bouton "Marquer traité" → update `is_handled = true`
- Filtres : non-traités / tous

### 6. Notifications admin
Le clic sur une notif `public_contact` dans le panel admin ouvre la section "Contacts publics".

### Fichiers touchés
- Nouvelle migration SQL : table + RLS
- Nouvelle edge function `supabase/functions/public-contact/index.ts`
- Nouvelle page `src/pages/ContactPage.tsx`
- Nouveau composant `src/components/AdminPublicContacts.tsx`
- `src/App.tsx` : route `/contact`
- `src/pages/LandingPage.tsx` : lien footer
- `src/pages/AuthPage.tsx` : lien sous le formulaire
- `src/pages/AdminPage.tsx` : nouvelle entrée sidebar + handler notif

