# Hướng dẫn Xóa Tokens Hàng Loạt

## 🎯 Tính năng

Xóa từ 10-20 tokens liên tiếp theo thứ tự thời gian tạo, bắt đầu từ một token cụ thể.

---

## 🔧 Cách sử dụng

### Bước 1: Vào Admin Dashboard

1. Truy cập: https://tokencursor.io.vn/admin
2. Đăng nhập với admin password
3. Click tab **"Xóa Tokens"**

---

### Bước 2: Lấy Token ID hoặc giá trị token

**Cách 1: Lấy từ database (KHUYẾN NGHỊ)**

```sql
-- Xem danh sách tokens
SELECT 
    id,
    LEFT(value, 30) || '...' as token_preview,
    claim_count,
    created_at
FROM token_pool
ORDER BY created_at
LIMIT 20;
```

Copy **ID** (UUID) hoặc **value** (giá trị token đầy đủ) của token đầu tiên muốn xóa.

**Cách 2: Lấy từ file Excel gốc**

Nếu bạn còn file Excel đã upload, copy giá trị token từ đó.

---

### Bước 3: Nhập thông tin xóa

1. **Token ID hoặc giá trị token**: Paste UUID hoặc giá trị token vào ô này
   - Ví dụ UUID: `550e8400-e29b-41d4-a716-446655440000`
   - Ví dụ value: `ey2hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

2. **Số lượng tokens cần xóa**: Chọn từ 10-20 (mặc định: 10)

3. Click nút **"Xóa Tokens"**

---

### Bước 4: Xác nhận

1. Popup xác nhận sẽ hiện ra
2. Đọc kỹ thông tin: "Bạn có chắc chắn muốn xóa **X tokens** bắt đầu từ token ID này?"
3. Click **"Xác nhận xóa"** để tiếp tục
4. Hoặc click **"Hủy"** để hủy bỏ

---

### Bước 5: Kiểm tra kết quả

Sau khi xóa thành công, bạn sẽ thấy thông báo:

```
✓ Đã xóa X tokens
✓ Đã xóa Y bản ghi phân phối
Successfully deleted X tokens and Y associated deliveries
```

---

## 📊 Ví dụ thực tế

### Scenario 1: Xóa 10 tokens đầu tiên

**Bước 1:** Query để lấy token đầu tiên
```sql
SELECT id, value FROM token_pool ORDER BY created_at LIMIT 1;
```

**Kết quả:**
```
id: 123e4567-e89b-12d3-a456-426614174000
value: ey2hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Bước 2:** Nhập vào form
- Token ID: `123e4567-e89b-12d3-a456-426614174000` (hoặc paste value)
- Số lượng: `10`

**Bước 3:** Click "Xóa Tokens" → Xác nhận

**Kết quả:** 10 tokens đầu tiên (theo thứ tự created_at) sẽ bị xóa.

---

### Scenario 2: Xóa 20 tokens từ token thứ 50

**Bước 1:** Query để lấy token thứ 50
```sql
SELECT id, value FROM token_pool ORDER BY created_at OFFSET 49 LIMIT 1;
```

**Bước 2:** Copy ID hoặc value

**Bước 3:** Nhập vào form
- Token ID: `<paste ID hoặc value>`
- Số lượng: `20`

**Kết quả:** 20 tokens từ vị trí 50-69 sẽ bị xóa.

---

## ⚠️ Lưu ý quan trọng

### 1. Không thể hoàn tác
Sau khi xóa, tokens và deliveries liên quan sẽ bị xóa vĩnh viễn. **KHÔNG THỂ KHÔI PHỤC!**

### 2. Xóa theo thứ tự thời gian
Hệ thống xóa tokens theo `created_at`, không phải theo ID hay value.

Ví dụ:
```
Token A: created_at = 2025-01-01 10:00:00
Token B: created_at = 2025-01-01 10:01:00
Token C: created_at = 2025-01-01 10:02:00
```

Nếu bạn chọn Token A và số lượng = 2, hệ thống sẽ xóa Token A và Token B.

### 3. Xóa cả deliveries
Khi xóa token, tất cả bản ghi phân phối (deliveries) liên quan cũng bị xóa.

### 4. Giới hạn số lượng
- Tối thiểu: 10 tokens
- Tối đa: 20 tokens
- Nếu cần xóa nhiều hơn, chạy nhiều lần

---

## 🔍 Kiểm tra sau khi xóa

```sql
-- Xem tổng số tokens còn lại
SELECT COUNT(*) as total_tokens FROM token_pool;

-- Xem tokens đầu tiên sau khi xóa
SELECT 
    LEFT(value, 30) || '...' as token,
    claim_count,
    created_at
FROM token_pool
ORDER BY created_at
LIMIT 10;

-- Kiểm tra deliveries
SELECT COUNT(*) as total_deliveries FROM deliveries;
```

---

## 🐛 Troubleshooting

### Lỗi: "Invalid token ID format"
**Nguyên nhân:** Đã fix! Bây giờ có thể nhập cả UUID và value.

**Giải pháp:** 
- Đảm bảo Vercel đã deploy code mới
- Refresh trang và thử lại

### Lỗi: "Token not found"
**Nguyên nhân:** Token ID/value không tồn tại trong database.

**Giải pháp:**
```sql
-- Kiểm tra token có tồn tại không
SELECT * FROM token_pool WHERE id = 'your-uuid-here';
-- hoặc
SELECT * FROM token_pool WHERE value = 'your-token-value-here';
```

### Lỗi: "Minimum 10 tokens"
**Nguyên nhân:** Số lượng < 10.

**Giải pháp:** Chọn số lượng từ 10-20.

### Lỗi: "Maximum 20 tokens"
**Nguyên nhân:** Số lượng > 20.

**Giải pháp:** Chọn số lượng từ 10-20. Nếu cần xóa nhiều hơn, chạy nhiều lần.

---

## 📋 Checklist trước khi xóa

- [ ] Đã backup database (nếu cần)
- [ ] Đã xác định đúng token cần xóa
- [ ] Đã kiểm tra số lượng tokens sẽ bị xóa
- [ ] Đã hiểu rằng hành động này không thể hoàn tác
- [ ] Đã đọc kỹ thông báo xác nhận

---

## 🎯 Best Practices

### 1. Luôn kiểm tra trước khi xóa
```sql
-- Xem tokens sẽ bị xóa
SELECT 
    id,
    LEFT(value, 30) || '...' as token,
    claim_count,
    created_at
FROM token_pool
WHERE created_at >= (
    SELECT created_at FROM token_pool WHERE id = 'your-start-token-id'
)
ORDER BY created_at
LIMIT 10; -- thay 10 bằng số lượng bạn muốn xóa
```

### 2. Xóa từng đợt nhỏ
Thay vì xóa 100 tokens, xóa 10-20 tokens mỗi lần để dễ kiểm soát.

### 3. Backup trước khi xóa số lượng lớn
```sql
-- Backup tokens sẽ bị xóa
CREATE TABLE token_pool_backup AS
SELECT * FROM token_pool
WHERE created_at >= (
    SELECT created_at FROM token_pool WHERE id = 'your-start-token-id'
)
ORDER BY created_at
LIMIT 20;
```

---

## ✅ Tóm tắt

1. Vào Admin Dashboard → Tab "Xóa Tokens"
2. Nhập UUID hoặc giá trị token đầu tiên
3. Chọn số lượng (10-20)
4. Click "Xóa Tokens" → Xác nhận
5. Kiểm tra kết quả

**Lưu ý:** Hành động không thể hoàn tác!

