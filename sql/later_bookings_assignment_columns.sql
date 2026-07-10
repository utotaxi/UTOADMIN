-- =============================================================================
-- UTO Admin: later_bookings assignment tracking + web_booker edit link
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Safe to re-run (IF NOT EXISTS / DROP IF EXISTS guards).
-- =============================================================================

-- 1) Assignment fields on later_bookings (admin assign + driver response)
ALTER TABLE public.later_bookings
  ADD COLUMN IF NOT EXISTS assigned_driver_name text,
  ADD COLUMN IF NOT EXISTS assignment_status text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS assignment_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS assignment_note text;

COMMENT ON COLUMN public.later_bookings.assigned_driver_name IS
  'Display name of the driver assigned by admin or marketplace.';
COMMENT ON COLUMN public.later_bookings.assignment_status IS
  'Driver response to assignment: pending | accepted | declined';
COMMENT ON COLUMN public.later_bookings.assigned_at IS
  'When the driver was assigned (admin or system).';
COMMENT ON COLUMN public.later_bookings.assignment_responded_at IS
  'When the driver accepted or declined the assignment.';
COMMENT ON COLUMN public.later_bookings.assignment_note IS
  'Optional note about the assignment (e.g. admin manual assign).';

ALTER TABLE public.later_bookings
  DROP CONSTRAINT IF EXISTS later_bookings_assignment_status_check;

ALTER TABLE public.later_bookings
  ADD CONSTRAINT later_bookings_assignment_status_check
  CHECK (
    assignment_status IS NULL
    OR assignment_status IN ('pending', 'accepted', 'declined')
  );

-- Backfill: if a driver is already on the booking and status looks accepted, mark accepted.
UPDATE public.later_bookings
SET
  assignment_status = COALESCE(assignment_status, 'accepted'),
  assigned_at = COALESCE(assigned_at, updated_at, created_at),
  assignment_responded_at = COALESCE(assignment_responded_at, updated_at, created_at)
WHERE driver_id IS NOT NULL
  AND status IN ('driver_accepted', 'accepted', 'arrived', 'started', 'in_progress', 'completed')
  AND assignment_status IS NULL;

-- Backfill: if driver_id is set but ride is still scheduled/assigned, mark pending.
UPDATE public.later_bookings
SET
  assignment_status = COALESCE(assignment_status, 'pending'),
  assigned_at = COALESCE(assigned_at, updated_at, created_at)
WHERE driver_id IS NOT NULL
  AND status IN ('scheduled', 'driver_assigned', 'marketplace', 'searching_driver', 'pending')
  AND assignment_status IS NULL;

-- 2) Link web_booker rows to later_bookings so admin can Review/Edit app bookings
ALTER TABLE public.web_booker
  ADD COLUMN IF NOT EXISTS later_booking_id uuid;

COMMENT ON COLUMN public.web_booker.later_booking_id IS
  'Optional link to the source later_bookings row (app scheduled ride) for admin edit/review.';

CREATE UNIQUE INDEX IF NOT EXISTS web_booker_later_booking_id_uidx
  ON public.web_booker (later_booking_id)
  WHERE later_booking_id IS NOT NULL;

-- Optional FK (comment out if you prefer no FK constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'web_booker_later_booking_id_fkey'
  ) THEN
    ALTER TABLE public.web_booker
      ADD CONSTRAINT web_booker_later_booking_id_fkey
      FOREIGN KEY (later_booking_id)
      REFERENCES public.later_bookings (id)
      ON DELETE SET NULL;
  END IF;
END $$;
