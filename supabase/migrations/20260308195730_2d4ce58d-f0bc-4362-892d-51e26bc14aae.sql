-- Track when user last viewed their ticket thread
ALTER TABLE public.tickets ADD COLUMN user_last_seen_at timestamptz DEFAULT now();
-- Track when admin last responded (for badge notification)  
ALTER TABLE public.tickets ADD COLUMN admin_replied_at timestamptz DEFAULT NULL;