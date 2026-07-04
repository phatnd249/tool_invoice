# Tách Danh Sách Doanh Nghiệp thành trang riêng

## Hiện trạng

File `frontend/src/components/ConfigPanel.tsx` (~560 dòng) chứa cả 2 chức năng:

| Chức năng | Mô tả | Giữ lại? |
|---|---|---|
| **Cấu hình Gemini API Key** | Form lưu API key toàn cục | ✅ Giữ trong ConfigPanel |
| **Danh Sách Doanh Nghiệp** | Bảng danh sách, Thêm/Sửa/Xoá, Relogin | ❌ Tách ra trang mới |

## Mục tiêu

- **ConfigPanel**: chỉ còn Gemini API Key (gọn, ~80 dòng)
- **CompanyManager** (mới): toàn bộ logic doanh nghiệp + modal Add/Edit/Relogin
- Thêm tab mới **"Doanh Nghiệp"** vào sidebar (giữa "Tra Cứu MST" và "Quản Lý Thành Viên")

---

## Các bước thực hiện

### Bước 1: Tạo file `frontend/src/components/CompanyManager.tsx`

Copy toàn bộ phần "Danh Sách Doanh Nghiệp" từ `ConfigPanel.tsx` sang file mới, bao gồm:

- **State & hooks**: `companies`, `companiesLoading`, các state cho Add/Edit/Relogin modal
- **Functions**: `fetchCompanies`, `handleAddCompany`, `handleAutoRefreshToken`, `handleDeleteCompany`, `handleUpdateCompany`, `handleReloginManualSubmit`, `fetchNewCaptcha`, `fetchReloginCaptcha`, `getTokenStatus`
- **JSX**: phần "2. Companies Table List" và các modal Edit/Add/Relogin

**Component signature:**
```tsx
export default function CompanyManager() { ... }
```

**Không cần thay đổi logic**, chỉ tách file. Import `{ API_BASE_URL }` từ `../config`.

### Bước 2: Rút gọn `ConfigPanel.tsx`

- **Xoá** tất cả code liên quan đến doanh nghiệp (state, hooks, functions, JSX)
- **Giữ lại** phần Gemini API Key (section 1 + style cuối cùng)
- **State giữ lại**: `geminiApiKey`, `settingsLoading`, `settingsMessage`
- **Functions giữ lại**: `fetchSettings`, `handleSaveSettings`
- **Import giữ lại**: `Key`, `RefreshCw`, `Save`, `AlertCircle`, `CheckCircle2` (bỏ `Building2`, `Plus`, `Trash2`, `Lock`, `Edit2`, `Eye`, `EyeOff`, `X` nếu không còn dùng)

### Bước 3: Cập nhật `App.tsx`

**Thêm import:**
```tsx
import CompanyManager from './components/CompanyManager';
```

**Thêm tab type mới:**
```tsx
type Tab = 'download' | 'history' | 'schedules' | 'companies' | 'config' | 'users' | 'feedbacks' | 'tax-lookup';
```

**Thêm case trong `getPageTitle()`:**
```tsx
case 'companies':
  return 'Quản Lý Doanh Nghiệp';
```

**Thêm nút sidebar mới** (giữa Tra Cứu MST và Quản Lý Thành Viên), chỉ hiển thị cho ADMIN:
```tsx
{isAdmin && (
  <button onClick={() => setActiveTab('companies')} ...>
    <Building2 ... />
    {!sidebarCollapsed && <span>Doanh Nghiệp</span>}
  </button>
)}
```

**Thêm render:**
```tsx
{activeTab === 'companies' && <CompanyManager />}
```

**Đổi tên nút "Cấu Hinh" → "API Key"** (vì không còn chứa doanh nghiệp):
```tsx
// Folder hiện tại: <Settings /> + "Cấu Hinh"
// Folder mới:   <Key /> + "API Key"
```

### Bước 4: Kiểm tra

- Nút "Doanh Nghiệp" chỉ hiện với ADMIN
- Trang CompanyManager hiển thị danh sách doanh nghiệp
- Thêm/Sửa/Xoá doanh nghiệp hoạt động bình thường
- Token refresh và re-login manual hoạt động
- Trang ConfigPanel chỉ còn Gemini API Key
- Build không lỗi TypeScript

---

## Tóm tắt thay đổi

| File | Hành động |
|---|---|
| `frontend/src/components/CompanyManager.tsx` | **Tạo mới** — tách toàn bộ phần doanh nghiệp |
| `frontend/src/components/ConfigPanel.tsx` | **Sửa** — chỉ giữ Gemini API Key |
| `frontend/src/App.tsx` | **Sửa** — thêm tab, sidebar button, render |
