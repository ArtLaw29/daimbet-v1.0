INSERT INTO public.game_sessions (id, game_type, title, status, config)
VALUES ('00000000-0000-0000-0000-000000000001', 'gouvernement', 'République du DAIM', 'active', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;