UPDATE auth.users
SET email = 'b00831024@essec.edu',
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE id = '5b0f232f-04e6-4af1-85ec-7647f322b626';

UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{email}', '"b00831024@essec.edu"'),
    updated_at = now()
WHERE user_id = '5b0f232f-04e6-4af1-85ec-7647f322b626'
  AND provider = 'email';