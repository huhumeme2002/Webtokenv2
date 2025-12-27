# Hướng dẫn Test Fix Token Sharing

## 🐛 Vấn đề đã sửa:

**TRƯỚC KHI SỬA:**
- User 1 claim → Nhận Token A
- User 2 claim → Nhận Token B (SAI! ❌)

**SAU KHI SỬA:**
- User 1 claim → Nhận Token A  
- User 2 claim → Nhận Token A (ĐÚNG! ✅ Cùng token)

## 🔧 Thay đổi trong code:

File: `app/api/token/route.ts`

**Trước:**
```sql
ORDER BY created_at ASC
```

**Sau:**
```sql
ORDER BY claim_count DESC, created_at ASC
```

**Giải thích:**
- `claim_count DESC` → Ưu tiên tokens có `claim_count=1` (đã có 1 user) TRƯỚC
- `created_at ASC` → Trong cùng mức claim_count, lấy token cũ nhất
- Kết quả: User thứ 2 sẽ nhận cùng token với User 1 thay vì nhận token mới

---

## 📋 Cách test sau khi Vercel deploy xong:

### Bước 1: Reset database

```sql
-- Xóa tất cả deliveries
DELETE FROM deliveries;

-- Reset claim_count về 0
UPDATE token_pool SET claim_count = 0;

-- Reset rate limit
UPDATE keys SET last_token_at = NULL;

-- Upload 2 tokens test
INSERT INTO token_pool (value, claim_count) VALUES
('TOKEN_TEST_A', 0),
('TOKEN_TEST_B', 0);
```

### Bước 2: Tạo 2 users

1. Vào Admin Dashboard
2. Tab "Quản lý Keys"
3. Tạo 2 keys:
   - `KEY-USER1-TEST`
   - `KEY-USER2-TEST`

### Bước 3: Test với User 1

1. Logout (nếu đang login)
2. Login với `KEY-USER1-TEST`
3. Click "Lấy Token"
4. **Ghi nhớ token nhận được** (ví dụ: `TOKEN_TEST_A`)

### Bước 4: Test với User 2

1. Logout
2. Login với `KEY-USER2-TEST`
3. Click "Lấy Token"
4. **Kiểm tra token nhận được**

### ✅ Kết quả mong đợi:

**User 2 phải nhận CÙNG token với User 1!**

```
User 1: TOKEN_TEST_A ✅
User 2: TOKEN_TEST_A ✅ (CÙNG!)
```

### ❌ Nếu kết quả SAI:

```
User 1: TOKEN_TEST_A
User 2: TOKEN_TEST_B (KHÁC! ❌)
```

→ Vercel chưa deploy code mới, cần đợi thêm hoặc force redeploy

---

## 🔍 Kiểm tra trong database:

```sql
-- Xem tokens và số lần claim
SELECT 
    value,
    claim_count,
    CASE 
        WHEN claim_count = 0 THEN '🟢 Chưa ai claim'
        WHEN claim_count = 1 THEN '🟡 Đã có 1 user'
        WHEN claim_count = 2 THEN '🔴 Đã đủ 2 users'
    END as status
FROM token_pool
WHERE value LIKE 'TOKEN_TEST%'
ORDER BY created_at;

-- Xem ai claim token nào
SELECT 
    LEFT(k."key", 20) as user_key,
    tp.value as token,
    tp.claim_count,
    d.delivered_at
FROM deliveries d
JOIN keys k ON d.key_id = k.id
JOIN token_pool tp ON d.token_id = tp.id
WHERE k."key" LIKE 'KEY-USER%-TEST'
ORDER BY d.delivered_at;
```

### Kết quả mong đợi:

```
value         | claim_count | status
--------------|-------------|------------------
TOKEN_TEST_A  | 2           | 🔴 Đã đủ 2 users
TOKEN_TEST_B  | 0           | 🟢 Chưa ai claim

user_key          | token        | claim_count | delivered_at
------------------|--------------|-------------|------------------
KEY-USER1-TEST    | TOKEN_TEST_A | 2           | 2025-01-09 ...
KEY-USER2-TEST    | TOKEN_TEST_A | 2           | 2025-01-09 ...
```

---

## 🧪 Test scenario đầy đủ (4 claims với 2 tokens):

### Setup:
- 2 tokens: A, B
- 2 users: User1, User2

### Expected flow:

| Claim # | User   | Token nhận được | claim_count sau khi claim |
|---------|--------|-----------------|---------------------------|
| 1       | User1  | Token A         | A=1, B=0                  |
| 2       | User2  | Token A ✅      | A=2, B=0                  |
| 3       | User1  | Token B         | A=2, B=1                  |
| 4       | User2  | Token B ✅      | A=2, B=2                  |
| 5       | User1  | ❌ OUT_OF_STOCK | -                         |

---

## 🚀 Sau khi test xong:

### Nếu PASS ✅:
```sql
-- Cleanup test data
DELETE FROM deliveries WHERE key_id IN (
    SELECT id FROM keys WHERE "key" LIKE 'KEY-USER%-TEST'
);
DELETE FROM token_pool WHERE value LIKE 'TOKEN_TEST%';
DELETE FROM keys WHERE "key" LIKE 'KEY-USER%-TEST';
```

### Nếu FAIL ❌:

1. Kiểm tra Vercel deployment status
2. Xem Vercel logs để tìm lỗi
3. Chạy `TEST_TOKEN_SHARING_LOGIC.sql` để test logic trực tiếp trong database
4. Báo lại kết quả để debug tiếp

---

## 📊 Monitoring sau khi deploy production:

```sql
-- Xem phân bố claim_count
SELECT 
    claim_count,
    COUNT(*) as token_count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM token_pool
GROUP BY claim_count
ORDER BY claim_count;

-- Kết quả lý tưởng:
-- claim_count | token_count | percentage
-- 0           | 10          | 10%
-- 1           | 20          | 20%
-- 2           | 70          | 70%
-- → Phần lớn tokens được share đầy đủ (claim_count=2)
```

---

## ⏱️ Timeline:

1. **Ngay bây giờ**: Code đã được push lên GitHub
2. **1-2 phút**: Vercel tự động build và deploy
3. **Sau khi deploy xong**: Test theo hướng dẫn trên
4. **Nếu OK**: Hệ thống hoạt động đúng! 🎉
5. **Nếu lỗi**: Debug theo hướng dẫn phần FAIL

Good luck! 🚀

