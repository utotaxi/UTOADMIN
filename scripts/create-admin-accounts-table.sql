-- ============================================================
-- ADMIN ACCOUNTS TABLE
-- Dedicated store for admin panel login email + password.
-- Accessed only via service_role from server actions.
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  auth_user_id UUID,
  full_name TEXT NOT NULL DEFAULT 'System Admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_accounts_email ON admin_accounts (lower(email));

CREATE OR REPLACE FUNCTION update_admin_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_accounts_updated_at ON admin_accounts;
CREATE TRIGGER trg_admin_accounts_updated_at
  BEFORE UPDATE ON admin_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_accounts_updated_at();

ALTER TABLE admin_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON admin_accounts;
CREATE POLICY "Service role full access" ON admin_accounts
  FOR ALL
  USING (true)
  WITH CHECK (true);
