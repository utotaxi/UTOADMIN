-- Optional: allow driver_assigned in later_bookings.status
-- Admin panel no longer requires this (it uses assignment_status=pending),
-- but you can run this if you want driver_assigned as a valid status value.

DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'later_bookings_status_check'
    AND conrelid = 'public.later_bookings'::regclass;

  IF def IS NULL THEN
    RAISE NOTICE 'later_bookings_status_check not found — skipping.';
    RETURN;
  END IF;

  IF def ILIKE '%driver_assigned%' THEN
    RAISE NOTICE 'driver_assigned already allowed — skipping.';
    RETURN;
  END IF;

  ALTER TABLE public.later_bookings DROP CONSTRAINT later_bookings_status_check;

  ALTER TABLE public.later_bookings
    ADD CONSTRAINT later_bookings_status_check
    CHECK (
      status IS NULL OR status IN (
        'scheduled',
        'driver_assigned',
        'driver_accepted',
        'accepted',
        'arrived',
        'started',
        'in_progress',
        'completed',
        'cancelled',
        'cancelled_no_drivers',
        'expired',
        'marketplace',
        'searching_driver',
        'pending'
      )
    );
END $$;
