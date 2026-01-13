-- ============================================
-- QUICK TEST: Chạy script này sau khi Vercel deploy xong
-- ============================================

-- BƯỚC 1: Reset toàn bộ để test sạch
DELETE FROM deliveries;
UPDATE token_pool SET claim_count = 0;
UPDATE keys SET last_token_at = NULL;

SELECT '✅ Đã reset database' as step_1;

-- BƯỚC 2: Kiểm tra có bao nhiêu tokens và keys
SELECT 
    (SELECT COUNT(*) FROM token_pool) as total_tokens,
    (SELECT COUNT(*) FROM token_pool WHERE claim_count < 2) as available_tokens,
    (SELECT COUNT(*) FROM keys WHERE is_active = true) as active_keys;

-- Nếu total_tokens < 2, cần upload thêm tokens
-- Nếu active_keys < 2, cần tạo thêm keys

-- BƯỚC 3: Xem danh sách tokens
SELECT 
    LEFT(value, 30) || '...' as token_preview,
    claim_count,
    created_at
FROM token_pool
ORDER BY created_at
LIMIT 5;

-- BƯỚC 4: Xem danh sách keys
SELECT 
    LEFT("key", 20) || '...' as key_preview,
    is_active,
    expires_at > now() as not_expired
FROM keys
WHERE is_active = true
ORDER BY created_at DESC
LIMIT 5;

-- ============================================
-- HƯỚNG DẪN TEST TIẾP THEO:
-- ============================================

SELECT '
📋 HƯỚNG DẪN TEST:

1. Nếu có ít hơn 2 tokens:
   → Vào Admin Dashboard → Upload thêm tokens

2. Nếu có ít hơn 2 keys:
   → Vào Admin Dashboard → Tạo thêm keys

3. Test với 2 users:
   a) Login với key thứ 1 → Click "Lấy Token" → Ghi nhớ token
   b) Logout → Login với key thứ 2 → Click "Lấy Token"
   c) Kiểm tra: Token của user 2 PHẢI GIỐNG token của user 1!

4. Sau khi test, chạy query này để xem kết quả:
' as instructions;

-- ============================================
-- QUERY ĐỂ KIỂM TRA KẾT QUẢ SAU KHI TEST
-- ============================================

SELECT '
-- Copy và chạy query này sau khi test:

SELECT 
    tp.value as token,
    tp.claim_count,
    STRING_AGG(LEFT(k."key", 20), '', '') as users_claimed
FROM token_pool tp
LEFT JOIN deliveries d ON tp.id = d.token_id
LEFT JOIN keys k ON d.key_id = k.id
GROUP BY tp.id, tp.value, tp.claim_count
HAVING COUNT(d.id) > 0
ORDER BY tp.created_at;

-- Kết quả mong đợi:
-- Token đầu tiên phải có claim_count = 2 và 2 users khác nhau!
' as check_results_query;

