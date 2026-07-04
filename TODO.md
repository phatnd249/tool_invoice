# Sửa lỗi redirect về login khi Gemini giải captcha sai 3 lần

## Vấn đề

Khi thêm doanh nghiệp mới với chế độ AUTO (Gemini), nếu Gemini giải captcha sai 3 lần liên tiếp, backend `auth.service.ts` throw exception. Controller `company.controller.ts` bắt lỗi và trả về:

```ts
res.status(401).json({ error: 'Xác thực tài khoản với Tổng cục Thuế thất bại.', ... });
```

Frontend `App.tsx` có **axios interceptor** bắt `status === 401`:

```ts
if (error.response && (error.response.status === 401 || error.response.status === 403)) {
  handleLogout(errMsg);  // → redirect về login!
}
```

→ HTTP 401 bị hiểu nhầm là "phiên hết hạn" thay vì "GDT từ chối captcha".

## Giải pháp

### Bước 1: Sửa backend `company.controller.ts` — đổi HTTP status

Khi lỗi xác thực với GDT (captcha sai), trả về **HTTP 400** (Bad Request) thay vì 401 (Unauthorized). 401 chỉ nên dùng cho lỗi token JWT của chính ứng dụng, không phải lỗi với bên thứ 3.

```ts
// Hiện tại
res.status(401).json({ error: 'Xác thực tài khoản với Tổng cục Thuế thất bại.', details: error.message });

// Sửa thành
res.status(400).json({ error: 'Xác thực tài khoản với Tổng cục Thuế thất bại.', details: error.message });
```

Kiểm tra toàn bộ file — tất cả `res.status(401)` mà liên quan đến lỗi GDT (không phải lỗi token JWT) đều đổi thành 400.

### Bước 2: Sửa frontend axios interceptor — chỉ logout khi thực sự hết hạn

Trong `App.tsx`, thêm phân biệt:

```ts
if (error.response) {
  const status = error.response.status;
  // Chỉ logout nếu là lỗi token JWT (401/403 từ backend auth middleware)
  // Các 401 do bên thứ 3 không nên trigger logout
  const errorMsg = error.response.data?.error || '';
  const isAuthError = 
    (status === 401 || status === 403) &&
    (errorMsg.includes('Yêu cầu xác thực') || 
     errorMsg.includes('không có quyền') ||
     errorMsg.includes('hết hạn') ||
     errorMsg.includes('Phiên'));
  
  if (isAuthError) {
    handleLogout(errorMsg);
  }
}
```

---

## Tóm tắt thay đổi

| File | Hành động |
|---|---|
| `backend/src/controllers/company.controller.ts` | Đổi mã lỗi GDT từ 401 → 400 (dòng 111, 173, 285) |
| `frontend/src/App.tsx` | Thêm logic phân biệt lỗi auth thật và lỗi third-party |
