-- Ensure admin user has force_password_change = 1
-- This is a safety net in case migrations run out of order or the flag gets reset
-- Migration 0005's original WHERE clause (token IS NULL) prevented it from working
-- because 0003 had already set a token, so this migration ensures the flag is set
UPDATE users
SET
  force_password_change = 1,
  updated_at = strftime('%s', 'now') * 1000
WHERE username = 'admin';
