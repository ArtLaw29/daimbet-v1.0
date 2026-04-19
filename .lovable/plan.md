

## Plan : améliorer notifications tickets + email quotidien

### Problèmes identifiés

1. **Pas de notification admin** sur création de ticket ni sur nouveau message dans une conversation existante.
2. **Le 1er message du ticket disparaît** : le code insère `sender: 'user'` mais le CHECK constraint en base n'autorise que `'utilisateur'` ou `'admin'` → l'insertion échoue silencieusement.
3. **Email à 2 notifications non traitées** déclenche du bruit. Préférence : un récap quotidien à 21h.

### Solution

**1. Notifications rouges admin pour les tickets**

- **Trigger Postgres** sur `tickets` (AFTER INSERT) : crée une `admin_notifications` de type `new_ticket` avec titre `Nouveau ticket : <subject>` et `reference_id = ticket.id`.
- **Trigger Postgres** sur `ticket_messages` (AFTER INSERT) : si `sender = 'utilisateur'`, crée une `admin_notifications` de type `ticket_message` avec titre `Nouveau message ticket : <subject>`. (On évite de notifier sur les réponses de l'admin.)
- Avantage : indépendant du client, fiable, et la pastille rouge admin existante (basée sur `is_read = false`) se mettra à jour toute seule via realtime.

**2. Réparer le 1er message du ticket**

- Dans `src/pages/ProfilePage.tsx` (ligne 534), remplacer `sender: 'user'` par `sender: 'utilisateur'` pour respecter la contrainte CHECK.
- Ajouter un toast d'erreur si l'insertion du message échoue (au lieu d'un succès silencieux).

**3. Email quotidien à 21h au lieu d'un email à 2 notifications**

- Garder la fonction `admin-notify-email` (elle envoie déjà un récap des notifications non lues), mais :
  - Retirer toute logique côté client/edge qui déclenche l'envoi à partir de 2 notifications (vérifier qu'il n'y en a pas — d'après ma recherche, l'envoi semble manuel/non câblé actuellement).
  - **Mettre à jour `admin-notify-email`** pour qu'elle envoie réellement l'email via Resend (aujourd'hui elle ne fait que logger dans `admin_emails_log` avec status `logged`).
  - Supprimer la condition `unread.length < 2` → envoyer dès qu'il y a ≥ 1 notification non lue.
- **Planifier un cron quotidien à 21h (Europe/Paris = 19h UTC)** via `pg_cron` + `pg_net` qui appelle `admin-notify-email`. Migration utilisateur-spécifique (avec URL + anon key) insérée via l'outil `insert`, pas via migration classique.

### Détail technique

- Triggers SQL avec `SECURITY DEFINER` et `search_path = public` pour pouvoir insérer dans `admin_notifications` malgré la RLS.
- Type `new_ticket` et `ticket_message` ajoutés librement (la colonne `type` est `text`, pas un enum).
- Cron : `0 19 * * *` UTC (21h Paris en hiver ; en été ce sera 20h Paris — acceptable pour un récap, sinon on peut faire `0 19 * * *` toute l'année et accepter le décalage saisonnier d'1 h).
- Realtime déjà activé sur `admin_notifications` côté `AdminPage` (à vérifier ; si non, on l'ajoute pour que la pastille rouge bouge en direct).

### Fichiers touchés

- Migration SQL : 2 nouveaux triggers (tickets + ticket_messages).
- `src/pages/ProfilePage.tsx` : fix `sender: 'utilisateur'` + gestion d'erreur.
- `supabase/functions/admin-notify-email/index.ts` : envoi réel via Resend, suppression du seuil 2.
- Insertion SQL (via `insert`, pas migration) : `cron.schedule` quotidien à 19h UTC.
- Vérification realtime sur `admin_notifications` côté `AdminPage` (ajout si absent).

