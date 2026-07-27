-- Store numeric passenger count on ASAP / live rides (for council reports).
-- later_bookings already has `passengers`; rides did not, so reports fell back
-- to vehicle_type ("saloon") incorrectly.

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS passengers integer DEFAULT 1;

COMMENT ON COLUMN public.rides.passengers IS
  'Number of passengers for the trip (1, 2, 3…). Used in admin panel and council reports.';

-- Optional alias used by some admin code paths
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS passenger_count integer;

UPDATE public.rides
SET passenger_count = COALESCE(passenger_count, passengers, 1)
WHERE passenger_count IS NULL;

UPDATE public.rides
SET passengers = COALESCE(passengers, passenger_count, 1)
WHERE passengers IS NULL;
