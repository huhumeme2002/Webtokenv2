# Giải thích Fix Cuối Cùng - Token Sharing

## 🐛 Vấn đề bạn gặp:

**Test với 1 user, 2 tokens:**
- Lần 1: ✅ Nhận Token 1
- Lần 2: ❌ Internal Server Error
- Lần 3: ✅ Nhận Token 2

## 🔍 Nguyên nhân:

### Vấn đề 1: Race Condition
Khi 2 requests đồng thời (hoặc rất gần nhau):
1. Request A: SELECT token (claim_count=0)
2. Request B: SELECT token (claim_count=0) - cùng token!
3. Request A: UPDATE claim_count=1 ✅
4. Request B: UPDATE với `WHERE claim_count < 2` → Vẫn thành công nhưng có thể gây lỗi logic

### Vấn đề 2: Thiếu Optimistic Locking
Code cũ:
```sql
WHERE id = ${tokenId} AND claim_count < 2
```

Điều này cho phép UPDATE ngay cả khi `claim_count` đã thay đổi giữa SELECT và UPDATE!

### Vấn đề 3: Không có Retry Logic
Khi race condition xảy ra → Trả về lỗi ngay → User thấy "Internal Server Error"

---

## ✅ Giải pháp đã áp dụng:

### 1. Optimistic Locking
```sql
-- Thêm điều kiện: claim_count phải CHÍNH XÁC bằng giá trị đã SELECT
WHERE id = ${tokenId} 
  AND claim_count = ${currentClaimCount}  -- ← MỚI!
  AND claim_count < 2
```

**Lợi ích:** Nếu token đã bị claim bởi request khác, UPDATE sẽ trả về 0 rows → Phát hiện race condition!

### 2. Retry Logic (Max 3 attempts)
```typescript
while (retryCount < MAX_RETRIES && !tokenValue) {
  try {
    // SELECT token
    // UPDATE với optimistic locking
    // Nếu thành công → break
  } catch (err) {
    if (race condition) {
      retryCount++
      await sleep(50 * retryCount) // Exponential backoff
      continue // Thử lại
    }
    throw err // Lỗi khác → throw ngay
  }
}
```

**Lợi ích:** 
- Tự động retry khi race condition
- Exponential backoff (50ms, 100ms, 150ms) để tránh thundering herd
- Max 3 attempts để tránh infinite loop

### 3. Chi tiết Logging
```typescript
console.log(`[Token Selection] Attempt ${retryCount + 1}: Token ${tokenId}, claim_count=${currentClaimCount}`)
console.log(`[Race Condition] Token ${tokenId} was modified, retrying...`)
console.log(`[Token Assigned] Token ${tokenId} assigned, new claim_count=${newCount}`)
```

**Lợi ích:** Dễ debug qua Vercel logs

---

## 🧪 Cách test sau khi deploy:

### Test Case 1: 2 Users, 2 Tokens (ĐÚNG)

**Setup:**
```sql
DELETE FROM deliveries;
UPDATE token_pool SET claim_count = 0;
UPDATE keys SET last_token_at = NULL;
```

**Test:**
1. User 1 claim → Token A (claim_count=0→1)
2. User 2 claim → Token A (claim_count=1→2) ✅ CÙNG TOKEN!
3. User 1 claim → Token B (claim_count=0→1)
4. User 2 claim → Token B (claim_count=1→2) ✅ CÙNG TOKEN!

**Kết quả mong đợi:**
```
Token A: claim_count=2, users=[User1, User2]
Token B: claim_count=2, users=[User1, User2]
```

---

### Test Case 2: 1 User, 2 Tokens (Giới hạn)

**Test:**
1. User 1 claim → Token A (claim_count=0→1)
2. User 1 claim → Token B (claim_count=0→1)
3. User 1 claim → ❌ OUT_OF_STOCK (đã claim hết 2 tokens)

**Giải thích:** 
- Mỗi user chỉ claim mỗi token 1 lần
- Với 2 tokens, 1 user chỉ claim được 2 lần
- Lần 3 sẽ OUT_OF_STOCK (ĐÚNG!)

---

### Test Case 3: Concurrent Requests (Race Condition)

**Scenario:** 2 users click "Lấy Token" cùng lúc

**Trước khi fix:**
- Request 1: ✅ Nhận token
- Request 2: ❌ Internal Server Error (race condition)

**Sau khi fix:**
- Request 1: ✅ Nhận token
- Request 2: Phát hiện race condition → Retry → ✅ Nhận cùng token!

---

## 📊 Monitoring qua Vercel Logs:

Sau khi deploy, vào Vercel Dashboard → Logs, bạn sẽ thấy:

```
[Token Selection] Attempt 1: Token abc-123, claim_count=0
[Token Assigned] Token abc-123 assigned to user xyz, new claim_count=1
```

Nếu có race condition:
```
[Token Selection] Attempt 1: Token abc-123, claim_count=1
[Race Condition] Token abc-123 was modified by another request, retrying...
[Token Selection] Attempt 2: Token def-456, claim_count=0
[Token Assigned] Token def-456 assigned to user xyz, new claim_count=1
```

---

## 🎯 Tóm tắt thay đổi:

| Vấn đề | Trước | Sau |
|--------|-------|-----|
| Race condition | ❌ Lỗi ngay | ✅ Retry tự động |
| Optimistic locking | ❌ Không có | ✅ Check claim_count |
| Logging | ❌ Ít thông tin | ✅ Chi tiết từng bước |
| User experience | ❌ Internal Error | ✅ Thành công hoặc Out of Stock |

---

## ⏱️ Timeline:

1. ✅ **Đã xong**: Code đã push lên GitHub
2. 🔄 **Đang chạy**: Vercel đang deploy (1-2 phút)
3. ⏳ **Tiếp theo**: Test theo hướng dẫn trên

---

## 🚀 Sau khi Vercel deploy xong:

### Bước 1: Reset database
```sql
DELETE FROM deliveries;
UPDATE token_pool SET claim_count = 0;
UPDATE keys SET last_token_at = NULL;
```

### Bước 2: Tạo 2 users (nếu chưa có)
- Admin Dashboard → Quản lý Keys → Tạo 2 keys

### Bước 3: Test với 2 users
1. Login User 1 → Lấy token → Ghi nhớ
2. Login User 2 → Lấy token → **PHẢI CÙNG TOKEN với User 1!**

### Bước 4: Verify
```sql
SELECT 
    tp.value,
    tp.claim_count,
    STRING_AGG(LEFT(k."key", 20), ', ') as users
FROM token_pool tp
JOIN deliveries d ON tp.id = d.token_id
JOIN keys k ON d.key_id = k.id
GROUP BY tp.id, tp.value, tp.claim_count
ORDER BY tp.created_at;
```

**Kết quả mong đợi:**
```
value     | claim_count | users
----------|-------------|------------------
TOKEN_A   | 2           | USER1, USER2
```

---

## ❓ Nếu vẫn lỗi:

1. Kiểm tra Vercel logs để xem error message
2. Chạy `TEST_TOKEN_SHARING_LOGIC.sql` để test logic trực tiếp
3. Báo lại kết quả cụ thể (screenshot + logs)

Good luck! 🎉

