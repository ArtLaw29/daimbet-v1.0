# Correction du compte Chris-Aurélien

## Situation

Un seul compte existe pour Chris-Aurélien :

| Champ | Valeur actuelle | Problème |
|---|---|---|
| Email | `chris-aurelien.ndjilaagassi@essec.edu` (avec tiret) | Mauvais — pas reconnu comme email ESSEC officiel |
| Confirmé | Non | Bloqué à la connexion |
| Display name | `Chris-Aurélien` | OK |
| Solde | 1000 DC | OK |
| Activité | Aucune (0 paris, 0 votes, 0 tickets) | RAS |
| UUID | `133ec0c2-a304-4f4f-929f-90dcc682a0fe` | — |

Le bon email officiel `chrisaurelien.ndjilaagassi@essec.edu` (sans tiret) n'existe **pas** dans la base : aucun doublon à supprimer.

## Action unique

Corriger l'email du compte **et** le confirmer manuellement, via une migration SQL ciblée sur `auth.users` et `auth.identities` :

```sql
-- 1. Corriger l'email + confirmer
UPDATE auth.users
SET email = 'chrisaurelien.ndjilaagassi@essec.edu',
    email_confirmed_at = now(),
    updated_at = now()
WHERE id = '133ec0c2-a304-4f4f-929f-90dcc682a0fe';

-- 2. Mettre à jour l'identity associée (provider 'email')
UPDATE auth.identities
SET identity_data = jsonb_set(
      identity_data, 
      '{email}', 
      '"chrisaurelien.ndjilaagassi@essec.edu"'
    ),
    email = 'chrisaurelien.ndjilaagassi@essec.edu',
    updated_at = now()
WHERE user_id = '133ec0c2-a304-4f4f-929f-90dcc682a0fe'
  AND provider = 'email';
```

## Après la correction

Chris-Aurélien devra utiliser **"Mot de passe oublié"** depuis la page de login pour définir son mot de passe (puisqu'il n'avait jamais confirmé le compte initialement, il n'a probablement pas de mot de passe utilisable). Je le précise dans la confirmation finale.

## Vérification

Une requête de contrôle après migration pour confirmer :
- Email = `chrisaurelien.ndjilaagassi@essec.edu`
- `email_confirmed_at` non nul
- Profil + solde 1000 DC intacts

## Aucun changement de code

Opération de maintenance pure, aucun fichier source modifié.
