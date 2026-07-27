-- Admin password-reset PIN store (8-digit codes emailed to admin).
-- Service-role only from the admin panel server.

CREATE TABLE IF NOT EXISTS public.admin_password_reset_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  pin_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_password_reset_pins_email_idx
  ON public.admin_password_reset_pins (lower(email), created_at DESC);

ALTER TABLE public.admin_password_reset_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access pins" ON public.admin_password_reset_pins;
CREATE POLICY "Service role full access pins" ON public.admin_password_reset_pins
  FOR ALL
  USING (true)
  WITH CHECK (true);
