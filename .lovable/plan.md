# Nettoyage du compte James-Marie

## Situation actuelle

Deux comptes existent dans la base :

| Compte | Email | Statut | Action |
|---|---|---|---|
| Doublon | `james-marie.bruniaux@essec.edu` (avec tiret) | Jamais confirmé, créé par erreur | À supprimer entièrement |
| Officiel | `jamesmarie.bruniaux@essec.edu` | Confirmé, fonctionnel, 1000 DC | À conserver, renommer en "James Marie" |

## Actions à effectuer

### 1. Supprimer entièrement le compte doublon (`dcaf7eed-d82a-4e60-ac11-38d9b912503c`)

Appel à la fonction edge `admin-delete-user` pour supprimer en cascade :
- L'utilisateur `auth.users`
- Son profil `profiles`
- Ses rôles `user_roles` (s'il y en a)
- Tout son historique `solde_history`, paris `wagers`, votes, etc.

Cette fonction existe déjà dans le projet et utilise la `service_role` pour bypasser les RLS.

### 2. Renommer le display_name du compte officiel

Mise à jour SQL ciblée sur le compte conservé :
```sql
UPDATE public.profiles
SET display_name = 'James Marie', updated_at = now()
WHERE user_id = '35a2afe1-1146-4a2e-b50e-0ce76c83f992';
```

### 3. Vérification finale

Une requête de contrôle pour confirmer :
- Qu'il ne reste qu'**un seul** compte James-Marie
- Que son email est bien `jamesmarie.bruniaux@essec.edu`
- Que son display_name est bien `James Marie`
- Que son solde de 1000 DC est intact

## Aucun changement de code

Aucun fichier source n'est modifié. C'est une opération de nettoyage de données ponctuelle via la fonction admin existante + un UPDATE ciblé.
