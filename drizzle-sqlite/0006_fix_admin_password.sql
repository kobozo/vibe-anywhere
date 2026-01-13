-- Fix admin user password hash to correct "vibe-anywhere" password
UPDATE users
SET
  password_hash = '$2b$12$C12o2o71HFcrmN3T..mLPOoBmU4zYl5vRUQeT6sbB9BMLIWe6Q0SW',
  updated_at = strftime('%s', 'now') * 1000
WHERE username = 'admin';
