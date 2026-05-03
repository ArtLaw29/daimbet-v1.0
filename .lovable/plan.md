# Problème — Les paris ne se clôturent jamais automatiquement

## Diagnostic

L'edge function `supabase/functions/check-auto-close/index.ts` **existe** et fait correctement le travail : elle scanne les paris `ouvert` dont `close_date <= now()` et appelle `auto_close_bet` pour les passer en `cloture_en_attente`.

**Mais elle n'est jamais appelée.** En inspectant `cron.job`, j'ai trouvé seulement 3 cron jobs actifs :
- `admin-notify-email-daily`
- `ticket-lifecycle-daily`
- `km-reveal-tick-hourly`

→ **Aucun cron n'invoque `check-auto-close`.** Donc tous les paris restent en `ouvert` indéfiniment, et `place_wager` (qui vérifie `status = 'ouvert'`) accepte les mises bien après la `close_date`.

De plus, `place_wager` ne vérifie pas `close_date` — il se fie uniquement au champ `status`. Tant que personne ne flippe le statut, on peut miser.

## Solution (2 niveaux pour défense en profondeur)

### 1. Cron job toutes les minutes (correctif principal)
Ajouter un cron `pg_cron` qui appelle `check-auto-close` chaque minute avec le `x-cron-secret`. Ça refermera les paris dès que leur `close_date` est dépassée (latence max ~1 min).

```sql
SELECT cron.schedule(
  'check-auto-close-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://aiffhgbzoxglfewdutea.supabase.co/functions/v1/check-auto-close',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body:='{}'::jsonb
  );
  $$
);
```

(Insertion via outil insert — pas migration — car l'URL/clé sont spécifiques au projet.)

### 2. Garde-fou serveur dans `place_wager` (ceinture + bretelles)
Modifier la fonction `place_wager` pour rejeter une mise si `now() >= bets.close_date`, même si le statut n'a pas encore basculé (au cas où le cron serait en retard ou désactivé) :

```sql
IF v_bet.close_date IS NOT NULL AND now() >= v_bet.close_date THEN
  RETURN jsonb_build_object('error', 'Les mises sont clôturées pour ce pari');
END IF;
```

Ajouté juste après le check `status <> 'ouvert'`. Migration SQL standard.

### 3. Rattrapage immédiat
Appeler `check-auto-close` une fois manuellement après déploiement pour refermer tous les paris déjà en retard.

## Fichiers touchés
- Insert SQL : création du cron `check-auto-close-every-minute`
- Migration SQL : `place_wager` durci avec check `close_date`
- Aucun changement front (le `BetCard` affichera automatiquement "cloture_en_attente" dès que le statut bascule)

## Vérification post-déploiement
- `SELECT id, title, status, close_date FROM bets WHERE close_date < now() AND status = 'ouvert';` → doit renvoyer 0 ligne quelques minutes après.
- Tenter une mise sur un pari échu via l'UI → doit afficher "Les mises sont clôturées".
