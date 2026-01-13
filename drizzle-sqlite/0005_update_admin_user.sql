-- Update existing admin user with token and force_password_change
-- NOTE: This migration is now idempotent and will run even if token is already set
UPDATE users
SET
  token = 'sh_550e8400e29b41d4a716446655440000550e8400e29b41d4a716446655440000',
  force_password_change = 1,
  updated_at = strftime('%s', 'now') * 1000
WHERE username = 'admin';
