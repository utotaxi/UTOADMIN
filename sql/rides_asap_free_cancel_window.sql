-- ASAP 1-minute free cancellation window
-- Ensures EVERY new ASAP ride and EVERY rematch/rebook gets a fresh
-- 60-second free-cancel countdown the rider app can display.

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS free_cancel_until timestamptz,
  ADD COLUMN IF NOT EXISTS free_cancel_seconds integer DEFAULT 60,
  ADD COLUMN IF NOT EXISTS show_free_cancel_timer boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS free_cancel_started_at timestamptz;

COMMENT ON COLUMN public.rides.free_cancel_until IS
  'UTC timestamp when the 1-minute free cancel window ends. Rider apps show countdown until this time.';
COMMENT ON COLUMN public.rides.free_cancel_seconds IS
  'Length of free cancel window in seconds (always 60 for ASAP).';
COMMENT ON COLUMN public.rides.show_free_cancel_timer IS
  'Rider app must show the free-cancel countdown when true and free_cancel_until is in the future.';

CREATE OR REPLACE FUNCTION public.apply_asap_free_cancel_window(p_ride_id text)
RETURNS public.rides
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now();
  v_row public.rides;
BEGIN
  UPDATE public.rides
  SET
    requested_at = v_now,
    free_cancel_started_at = v_now,
    free_cancel_until = v_now + interval '1 minute',
    free_cancel_seconds = 60,
    show_free_cancel_timer = true
  WHERE id = p_ride_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.rides_ensure_free_cancel_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now();
  v_needs_window boolean := false;
BEGIN
  -- Brand-new ASAP ride row
  IF TG_OP = 'INSERT' THEN
    v_needs_window := true;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Rematch / rebook: returned to searching
    IF NEW.status IS DISTINCT FROM OLD.status
       AND lower(coalesce(NEW.status, '')) IN ('pending', 'searching', 'searching_driver', 'finding_driver') THEN
      v_needs_window := true;
    END IF;

    -- Explicit rematch stamp from admin/backend rematch flow
    IF NEW.rematch_started_at IS DISTINCT FROM OLD.rematch_started_at
       AND NEW.rematch_started_at IS NOT NULL THEN
      v_needs_window := true;
    END IF;

    -- Repair only when the window was never set (not when it already expired)
    IF lower(coalesce(NEW.status, '')) IN ('pending', 'searching', 'searching_driver', 'finding_driver')
       AND NEW.free_cancel_until IS NULL THEN
      v_needs_window := true;
    END IF;
  END IF;

  IF v_needs_window THEN
    IF TG_OP = 'INSERT' AND NEW.requested_at IS NULL THEN
      NEW.requested_at := v_now;
    ELSIF TG_OP = 'UPDATE' THEN
      -- Rebook/rematch must restart the rider-facing timer from now.
      NEW.requested_at := v_now;
    END IF;

    NEW.free_cancel_started_at := v_now;
    NEW.free_cancel_until := v_now + interval '1 minute';
    NEW.free_cancel_seconds := 60;
    NEW.show_free_cancel_timer := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rides_ensure_free_cancel_window ON public.rides;
CREATE TRIGGER trg_rides_ensure_free_cancel_window
  BEFORE INSERT OR UPDATE
  ON public.rides
  FOR EACH ROW
  EXECUTE PROCEDURE public.rides_ensure_free_cancel_window();

-- Backfill only rides that never received a free-cancel window.
UPDATE public.rides
SET
  free_cancel_started_at = now(),
  free_cancel_until = now() + interval '1 minute',
  free_cancel_seconds = 60,
  show_free_cancel_timer = true,
  requested_at = coalesce(requested_at, now())
WHERE lower(coalesce(status, '')) IN ('pending', 'searching', 'searching_driver', 'finding_driver')
  AND free_cancel_until IS NULL;
