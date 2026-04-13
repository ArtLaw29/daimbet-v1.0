-- Add nav_config entry for the new "jeux" tab (replacing kiss-marry)
INSERT INTO public.nav_config (tab_key, is_visible) VALUES ('jeux', true)
ON CONFLICT DO NOTHING;