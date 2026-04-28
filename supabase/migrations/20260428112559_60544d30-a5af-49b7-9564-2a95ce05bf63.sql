-- Temporary cleanup: remove duplicate auth user for James-Marie
DO $$
BEGIN
  DELETE FROM auth.identities WHERE user_id = 'dcaf7eed-d82a-4e60-ac11-38d9b912503c';
  DELETE FROM auth.users WHERE id = 'dcaf7eed-d82a-4e60-ac11-38d9b912503c';
END $$;