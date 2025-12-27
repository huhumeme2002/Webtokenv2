# Giải thích cơ chế Token Sharing (2 users/token)

## 🎯 Cách hoạt động

### Quy tắc:
1. **Mỗi token có thể được claim bởi TỐI ĐA 2 users KHÁC NHAU**
2. **Cùng 1 user KHÔNG THỂ claim cùng 1 token 2 lần**
3. Tokens được phân phối theo thứ tự FIFO (First In First Out)

## 📊 Ví dụ thực tế

### Scenario 1: Có 2 tokens, 1 user

```
Tokens ban đầu:
- Token A: claim_count = 0
- Token B: claim_count = 0

User 1 claim lần 1:
- Nhận Token A
- Token A: claim_count = 1 ✅
- Token B: claim_count = 0

User 1 claim lần 2:
- KHÔNG thể nhận Token A (đã claim rồi)
- Nhận Token B
- Token A: claim_count = 1
- Token B: claim_count = 1 ✅

User 1 claim lần 3:
- KHÔNG thể nhận Token A (đã claim rồi)
- KHÔNG thể nhận Token B (đã claim rồi)
- ❌ OUT_OF_STOCK → Internal Server Error
```

**Kết luận**: Với 1 user, 2 tokens chỉ có thể claim được 2 lần!

---

### Scenario 2: Có 2 tokens, 2 users (ĐÚNG)

```
Tokens ban đầu:
- Token A: claim_count = 0
- Token B: claim_count = 0

User 1 claim lần 1:
- Nhận Token A
- Token A: claim_count = 1 ✅

User 2 claim lần 1:
- Nhận Token A (cùng token với User 1!)
- Token A: claim_count = 2 ✅

User 1 claim lần 2:
- KHÔNG thể nhận Token A (đã claim rồi)
- Nhận Token B
- Token B: claim_count = 1 ✅

User 2 claim lần 2:
- KHÔNG thể nhận Token A (đã claim rồi)
- Nhận Token B (cùng token với User 1!)
- Token B: claim_count = 2 ✅

User 1 claim lần 3:
- ❌ OUT_OF_STOCK (đã claim hết 2 tokens)

User 2 claim lần 3:
- ❌ OUT_OF_STOCK (đã claim hết 2 tokens)
```

**Kết luận**: Với 2 users, 2 tokens có thể claim được 4 lần (2 users × 2 tokens)!

---

## 🧮 Công thức tính

```
Số lần claim tối đa = Số tokens × 2
Số lần claim mỗi user = Số tokens
```

Ví dụ:
- 10 tokens → 20 lần claim (10 users × 2 hoặc 20 users × 1)
- 100 tokens → 200 lần claim

---

## 🔍 Kiểm tra trạng thái hiện tại

Chạy SQL này để xem:

```sql
-- Xem tokens và số lần đã claim
SELECT 
    LEFT(value, 20) || '...' as token,
    claim_count,
    CASE 
        WHEN claim_count = 0 THEN '🟢 Chưa ai claim'
        WHEN claim_count = 1 THEN '🟡 Đã có 1 user claim'
        WHEN claim_count >= 2 THEN '🔴 Đã đủ 2 users'
    END as status
FROM token_pool
ORDER BY created_at;

-- Xem ai đã claim token nào
SELECT 
    LEFT(k."key", 15) || '...' as user,
    LEFT(tp.value, 20) || '...' as token,
    tp.claim_count,
    d.delivered_at
FROM deliveries d
JOIN keys k ON d.key_id = k.id
JOIN token_pool tp ON d.token_id = tp.id
ORDER BY d.delivered_at;

-- Tính toán
SELECT 
    COUNT(*) as total_tokens,
    COUNT(*) FILTER (WHERE claim_count < 2) as available_for_new_users,
    COUNT(*) * 2 as max_total_claims,
    (SELECT COUNT(*) FROM deliveries) as actual_claims,
    COUNT(*) * 2 - (SELECT COUNT(*) FROM deliveries) as remaining_claims
FROM token_pool;
```

---

## 🛠️ Để test đúng tính năng

### Cách 1: Tạo thêm user

1. Vào Admin Dashboard
2. Tab "Quản lý Keys"
3. Thêm key mới (ví dụ: `KEY-TEST2`)
4. Logout và login bằng key mới
5. Claim token → Sẽ nhận cùng token với user đầu tiên!

### Cách 2: Upload thêm tokens

1. Vào Admin Dashboard
2. Tab "Upload Tokens"
3. Upload file Excel với 10-20 tokens
4. Test lại

### Cách 3: Reset để test lại

```sql
-- Xóa tất cả deliveries
DELETE FROM deliveries;

-- Reset claim_count
UPDATE token_pool SET claim_count = 0;

-- Reset rate limit
UPDATE keys SET last_token_at = NULL;
```

---

## ❓ FAQ

**Q: Tại sao lại 2 users/token?**
A: Để tiết kiệm tokens. Thay vì 100 tokens cho 100 users, bây giờ chỉ cần 50 tokens.

**Q: User có thể claim cùng 1 token 2 lần không?**
A: KHÔNG. Mỗi user chỉ claim mỗi token 1 lần duy nhất.

**Q: Nếu có 3 users thì sao?**
A: User 3 sẽ nhận token khác. Mỗi token chỉ chia cho 2 users.

**Q: Làm sao biết token đã được claim bao nhiêu lần?**
A: Xem cột `claim_count` trong bảng `token_pool`.

---

## 🎯 Tóm tắt

✅ **Đúng**: 2 users khác nhau claim → Nhận cùng 1 token
❌ **Sai**: 1 user claim 2 lần → Nhận 2 tokens khác nhau
❌ **Sai**: 1 user claim 3 lần với 2 tokens → OUT_OF_STOCK

