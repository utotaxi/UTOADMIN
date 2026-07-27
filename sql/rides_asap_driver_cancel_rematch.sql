-- ASAP driver-cancel rematch support for public.rides
-- Run in Supabase SQL editor if these columns are missing.

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS excluded_driver_ids text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rematch_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rider_message text,
  ADD COLUMN IF NOT EXISTS status_message text,
  ADD COLUMN IF NOT EXISTS last_driver_cancel_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_cancelled_driver_id text,
  ADD COLUMN IF NOT EXISTS rematch_started_at timestamptz;

COMMENT ON COLUMN public.rides.excluded_driver_ids IS
  'Driver IDs that cancelled after accept and must not be rematched for this ASAP ride.';
COMMENT ON COLUMN public.rides.rider_message IS
  'Rider-facing status copy, e.g. driver cancelled — still finding a nearby driver.';
COMMENT ON COLUMN public.rides.status_message IS
  'Alias/status banner for rider apps that read status_message.';

-- Optional rider notification inbox (safe if already exists)
CREATE TABLE IF NOT EXISTS public.rider_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id text,
  user_id text,
  ride_id text,
  type text,
  title text,
  message text,
  body text,
  status text DEFAULT 'unread',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rider_notifications_rider_id_idx
  ON public.rider_notifications (rider_id);

CREATE INDEX IF NOT EXISTS rider_notifications_ride_id_idx
  ON public.rider_notifications (ride_id);
