-- TEST LOGIC: Mô phỏng token sharing với ORDER BY claim_count DESC

-- Setup: Tạo 2 tokens test
INSERT INTO token_pool (id, value, claim_count, created_at) VALUES
('11111111-1111-1111-1111-111111111111', 'TOKEN_A', 0, '2025-01-01 10:00:00'),
('22222222-2222-2222-2222-222222222222', 'TOKEN_B', 0, '2025-01-01 10:01:00')
ON CONFLICT (id) DO UPDATE SET claim_count = 0;

-- Tạo 2 users test
INSERT INTO keys (id, "key", expires_at, is_active) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'KEY-USER1-TEST', '2026-01-01', true),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'KEY-USER2-TEST', '2026-01-01', true)
ON CONFLICT (id) DO UPDATE SET is_active = true;

-- Xóa deliveries cũ
DELETE FROM deliveries WHERE key_id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

-- ========================================
-- SCENARIO 1: User 1 claim lần đầu
-- ========================================
SELECT '=== User 1 claim lần 1 ===' as step;

-- Query giống hệt trong code (với ORDER BY claim_count DESC)
SELECT id, value, claim_count
FROM token_pool
WHERE claim_count < 2
  AND id NOT IN (
    SELECT token_id FROM deliveries WHERE key_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  )
ORDER BY claim_count DESC, created_at ASC
LIMIT 1;

-- Kết quả mong đợi: TOKEN_A (claim_count=0, vì cả 2 đều =0, lấy cái cũ nhất)

-- Giả lập claim
INSERT INTO deliveries (key_id, token_id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111');

UPDATE token_pool 
SET claim_count = claim_count + 1 
WHERE id = '11111111-1111-1111-1111-111111111111';

-- ========================================
-- SCENARIO 2: User 2 claim lần đầu
-- ========================================
SELECT '=== User 2 claim lần 1 ===' as step;

-- Query với ORDER BY claim_count DESC
SELECT id, value, claim_count
FROM token_pool
WHERE claim_count < 2
  AND id NOT IN (
    SELECT token_id FROM deliveries WHERE key_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  )
ORDER BY claim_count DESC, created_at ASC
LIMIT 1;

-- Kết quả mong đợi: TOKEN_A (claim_count=1, ưu tiên cao hơn TOKEN_B có claim_count=0)
-- ✅ ĐÚNG: User 2 sẽ nhận cùng TOKEN_A với User 1!

-- Giả lập claim
INSERT INTO deliveries (key_id, token_id) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111');

UPDATE token_pool 
SET claim_count = claim_count + 1 
WHERE id = '11111111-1111-1111-1111-111111111111';

-- ========================================
-- SCENARIO 3: User 1 claim lần 2
-- ========================================
SELECT '=== User 1 claim lần 2 ===' as step;

SELECT id, value, claim_count
FROM token_pool
WHERE claim_count < 2
  AND id NOT IN (
    SELECT token_id FROM deliveries WHERE key_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  )
ORDER BY claim_count DESC, created_at ASC
LIMIT 1;

-- Kết quả mong đợi: TOKEN_B (claim_count=0, vì TOKEN_A đã claim rồi)

-- ========================================
-- KẾT QUẢ CUỐI CÙNG
-- ========================================
SELECT 
    tp.value,
    tp.claim_count,
    STRING_AGG(k."key", ', ') as claimed_by
FROM token_pool tp
LEFT JOIN deliveries d ON tp.id = d.token_id
LEFT JOIN keys k ON d.key_id = k.id
WHERE tp.id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
)
GROUP BY tp.id, tp.value, tp.claim_count
ORDER BY tp.created_at;

-- Kết quả mong đợi:
-- TOKEN_A | claim_count=2 | KEY-USER1-TEST, KEY-USER2-TEST
-- TOKEN_B | claim_count=1 | KEY-USER1-TEST

-- ========================================
-- CLEANUP
-- ========================================
DELETE FROM deliveries WHERE key_id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

DELETE FROM token_pool WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
);

DELETE FROM keys WHERE id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

SELECT '✅ Test completed! Check results above.' as message;

