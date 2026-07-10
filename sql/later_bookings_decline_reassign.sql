-- =============================================================================
-- UTO Admin: decline / re-assign tracking for later_bookings
-- Run in Supabase SQL Editor after later_bookings_assignment_columns.sql
-- =============================================================================

-- Extra decline fields on later_bookings
ALTER TABLE public.later_bookings
  ADD COLUMN IF NOT EXISTS last_declined_driver_id text,
  ADD COLUMN IF NOT EXISTS last_declined_driver_name text,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz;

COMMENT ON COLUMN public.later_bookings.last_declined_driver_id IS
  'Driver id of the most recent driver who declined this booking.';
COMMENT ON COLUMN public.later_bookings.last_declined_driver_name IS
  'Display name of the most recent driver who declined this booking.';
COMMENT ON COLUMN public.later_bookings.declined_at IS
  'When the most recent driver decline happened.';

-- Ensure assignment_status allows pending | accepted | declined
ALTER TABLE public.later_bookings
  DROP CONSTRAINT IF EXISTS later_bookings_assignment_status_check;

ALTER TABLE public.later_bookings
  ADD CONSTRAINT later_bookings_assignment_status_check
  CHECK (
    assignment_status IS NULL
    OR assignment_status IN ('pending', 'accepted', 'declined')
  );

-- Assignment event history (assign / accept / decline / reassign / cancel)
CREATE TABLE IF NOT EXISTS public.later_booking_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  later_booking_id uuid NOT NULL REFERENCES public.later_bookings(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  driver_id text,
  driver_name text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT later_booking_assignment_events_type_check
    CHECK (event_type IN ('assigned', 'accepted', 'declined', 'reassigned', 'cancelled', 'marketplace'))
);

CREATE INDEX IF NOT EXISTS later_booking_assignment_events_booking_idx
  ON public.later_booking_assignment_events (later_booking_id, created_at DESC);

COMMENT ON TABLE public.later_booking_assignment_events IS
  'Audit log of driver assignment lifecycle for scheduled (later) bookings.';

-- Helper for the driver app when a driver declines:
-- UPDATE later_bookings SET
--   assignment_status = 'declined',
--   last_declined_driver_id = <driver_id>,
--   last_declined_driver_name = <driver_name>,
--   declined_at = now(),
--   assignment_responded_at = now(),
--   driver_id = NULL,
--   assigned_driver_name = NULL,
--   status = 'scheduled'   -- or marketplace if your app uses that value
-- WHERE id = <booking_id>;
--
-- INSERT INTO later_booking_assignment_events
--   (later_booking_id, event_type, driver_id, driver_name, note)
-- VALUES
--   (<booking_id>, 'declined', <driver_id>, <driver_name>, 'Declined in driver app');
