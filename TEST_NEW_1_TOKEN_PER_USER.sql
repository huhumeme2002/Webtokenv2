-- Test script to verify 1 token per user behavior
-- This script tests that tokens are NOT shared between users

-- Clean up existing test data
DELETE FROM deliveries WHERE key_id LIKE 'test-user-%';
DELETE FROM token_pool WHERE value LIKE 'TEST-TOKEN-%';

-- Insert test tokens
INSERT INTO token_pool (value) VALUES 
  ('TEST-TOKEN-USER1-ONLY'),
  ('TEST-TOKEN-USER2-ONLY');

-- Get token for user1
SELECT id, value, claim_count
FROM token_pool
WHERE claim_count = 0
  AND id NOT IN (
    SELECT token_id FROM deliveries WHERE key_id = 'test-user-1'
  )
ORDER BY created_at ASC
LIMIT 1;

-- Simulate user1 claiming the first token
UPDATE token_pool
SET claim_count = 1,
    assigned_to = 'test-user-1',
    assigned_at = now()
WHERE value = 'TEST-TOKEN-USER1-ONLY'
  AND claim_count = 0;

-- Record the delivery
INSERT INTO deliveries (key_id, token_id) 
SELECT 'test-user-1', id 
FROM token_pool 
WHERE value = 'TEST-TOKEN-USER1-ONLY';

-- Get token for user2 (should get the second token, NOT the same as user1)
SELECT id, value, claim_count
FROM token_pool
WHERE claim_count = 0
  AND id NOT IN (
    SELECT token_id FROM deliveries WHERE key_id = 'test-user-2'
  )
ORDER BY created_at ASC
LIMIT 1;

-- Expected result: user2 should get TEST-TOKEN-USER2-ONLY, NOT TEST-TOKEN-USER1-ONLY
-- This confirms 1 token per user behavior is working correctly
