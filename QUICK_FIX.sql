-- QUICK FIX: Copy và paste toàn bộ script này vào Neon SQL Editor
-- Truy cập: https://console.neon.tech → Chọn project → SQL Editor

-- 1. Thêm cột claim_count
ALTER TABLE token_pool ADD COLUMN IF NOT EXISTS claim_count integer DEFAULT 0 NOT NULL;

-- 2. Cập nhật giá trị cho tokens hiện tại
UPDATE token_pool SET claim_count = 0 WHERE claim_count IS NULL;

-- 3. Cập nhật claim_count dựa trên deliveries đã có
UPDATE token_pool 
SET claim_count = (
    SELECT COUNT(DISTINCT key_id) 
    FROM deliveries 
    WHERE deliveries.token_id = token_pool.id
)
WHERE id IN (SELECT DISTINCT token_id FROM deliveries);

-- 4. Tạo index để tăng tốc
CREATE INDEX IF NOT EXISTS available_tokens_idx ON token_pool (claim_count);
CREATE INDEX IF NOT EXISTS delivery_key_token_idx ON deliveries (key_id, token_id);

-- 5. Kiểm tra kết quả
SELECT 
    COUNT(*) as total_tokens,
    COUNT(*) FILTER (WHERE claim_count = 0) as available,
    COUNT(*) FILTER (WHERE claim_count = 1) as partial,
    COUNT(*) FILTER (WHERE claim_count >= 2) as full
FROM token_pool;

