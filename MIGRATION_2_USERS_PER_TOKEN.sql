-- Migration: Enable Token Sharing for 2 Users per Token
-- Chạy script này trong Supabase SQL Editor sau khi deploy code mới

-- 1. Drop constraint cũ (cho phép 2 deliveries cùng 1 token)
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS delivery_token_unique_idx;

-- 2. Drop và recreate index với điều kiện mới (claim_count < 2)
DROP INDEX IF EXISTS available_tokens_idx;
CREATE INDEX available_tokens_idx ON token_pool (claim_count) WHERE claim_count < 2;

-- 3. Verify changes
SELECT 'Migration completed!' as status;

-- Kiểm tra tokens hiện có
SELECT 
    LEFT(value, 20) || '...' as token,
    claim_count,
    CASE 
        WHEN claim_count = 0 THEN '🟢 Chưa ai claim'
        WHEN claim_count = 1 THEN '🟡 Có thể share thêm 1 user'
        WHEN claim_count >= 2 THEN '🔴 Đã đủ 2 users'
    END as status
FROM token_pool
ORDER BY created_at
LIMIT 10;
