INSERT INTO public.nav_config (tab_key, is_visible) VALUES
  ('paris', true), ('promo', true), ('jeux', true),
  ('mini-jeux', true), ('casino', true), ('la-promo', true), ('profil', true)
ON CONFLICT (tab_key) DO NOTHING;

INSERT INTO public.game_status (game_key, suspended, hidden) VALUES
  ('section_paris', false, false),
  ('section_promo', false, false),
  ('section_jeux', false, false),
  ('section_mini_jeux', false, false),
  ('section_casino', false, false),
  ('section_la_promo', false, false)
ON CONFLICT (game_key) DO NOTHING;