-- ASAP rematch hardening (run after rides_asap_driver_cancel_rematch.sql)
-- Prevents the same driver from re-accepting a ride they just cancelled.

CREATE OR REPLACE FUNCTION public.prevent_excluded_driver_accept()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only enforce when a driver is being assigned / accepting
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.driver_id IS NOT DISTINCT FROM NEW.driver_id THEN
    RETURN NEW;
  END IF;

  IF NEW.excluded_driver_ids IS NOT NULL
     AND NEW.driver_id = ANY (NEW.excluded_driver_ids) THEN
    RAISE EXCEPTION
      'Driver % is excluded from rematch on ride %',
      NEW.driver_id, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_excluded_driver_accept ON public.rides;
CREATE TRIGGER trg_prevent_excluded_driver_accept
  BEFORE INSERT OR UPDATE OF driver_id
  ON public.rides
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_excluded_driver_accept();

COMMENT ON FUNCTION public.prevent_excluded_driver_accept() IS
  'Blocks re-accept by drivers listed in rides.excluded_driver_ids after ASAP cancel rematch.';
