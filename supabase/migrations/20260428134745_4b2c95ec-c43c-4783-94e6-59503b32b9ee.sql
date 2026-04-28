UPDATE auth.users
SET email = 'chrisaurelien.ndjilaagassi@essec.edu',
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE id = '133ec0c2-a304-4f4f-929f-90dcc682a0fe';

UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{email}', '"chrisaurelien.ndjilaagassi@essec.edu"'),
    updated_at = now()
WHERE user_id = '133ec0c2-a304-4f4f-929f-90dcc682a0fe'
  AND provider = 'email';