
-- Nav config table for admin to hide/show tabs
CREATE TABLE nav_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_key text NOT NULL UNIQUE,
  is_visible boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nav_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read nav config
CREATE POLICY "Nav config readable by authenticated" ON nav_config FOR SELECT TO authenticated USING (true);
-- Only admin can update
CREATE POLICY "Admin can update nav config" ON nav_config FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can insert nav config" ON nav_config FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));

-- Seed default values (gazette always visible, not in this table since it's non-maskable)
INSERT INTO nav_config (tab_key, is_visible) VALUES 
  ('classement', true),
  ('kiss-marry', true);
