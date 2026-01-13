-- Seed default admin user
-- Password: vibe-anywhere (bcrypt hash with 12 rounds)
-- Token will be generated on first login by migration 0005
INSERT OR IGNORE INTO users (
  id,
  username,
  password_hash,
  created_at,
  updated_at
)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'admin',
  '$2b$12$C12o2o71HFcrmN3T..mLPOoBmU4zYl5vRUQeT6sbB9BMLIWe6Q0SW',
  strftime('%s', 'now') * 1000,
  strftime('%s', 'now') * 1000
);
