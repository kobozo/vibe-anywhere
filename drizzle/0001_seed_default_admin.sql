-- Seed default admin user
-- Username: admin
-- Password: vibe-anywhere (bcrypt hash with 12 rounds)
-- User will be forced to change password on first login

INSERT INTO users (
  id,
  username,
  password_hash,
  token,
  role,
  status,
  force_password_change,
  created_at,
  updated_at
)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'admin',
  '$2b$12$C12o2o71HFcrmN3T..mLPOoBmU4zYl5vRUQeT6sbB9BMLIWe6Q0SW',
  'sh_550e8400e29b41d4a716446655440000550e8400e29b41d4a716446655440000',
  'admin',
  'active',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
