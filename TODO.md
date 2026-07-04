# Thêm chức năng Search & Filter trong Quản Lý Doanh Nghiệp

## Hiện trạng

Trang `CompanyManager.tsx` hiển thị toàn bộ danh sách doanh nghiệp, không có cách lọc/tìm kiếm. Khi có nhiều doanh nghiệp (>20), khó tìm được doanh nghiệp cụ thể.

## Mục tiêu

Thêm thanh search + filter ngay trên bảng danh sách để:
- **Tìm kiếm**: theo mã số thuế hoặc tên doanh nghiệp (text input)
- **Lọc**: theo chế độ đăng nhập (Tự động / Thủ công / Tất cả) và trạng thái token (Còn hạn / Hết hạn / Tất cả)
- Tất cả xử lý **phía frontend** (không cần API mới), vì danh sách companies đã được fetch toàn bộ

## Các bước thực hiện

### Bước 1: Thêm state filter trong `CompanyManager.tsx`

```ts
// Search & Filter State
const [searchText, setSearchText] = useState('');
const [filterLoginMode, setFilterLoginMode] = useState<'ALL' | 'AUTO' | 'MANUAL'>('ALL');
const [filterTokenStatus, setFilterTokenStatus] = useState<'ALL' | 'VALID' | 'EXPIRED'>('ALL');
```

### Bước 2: Tạo hàm filter (computed, không phải async)

```ts
const filteredCompanies = useMemo(() => {
  return companies.filter(c => {
    // Search by tax code or name (case-insensitive)
    const keyword = searchText.toLowerCase().trim();
    if (keyword) {
      const matchesTaxCode = c.taxCode.toLowerCase().includes(keyword);
      const matchesName = c.name.toLowerCase().includes(keyword);
      if (!matchesTaxCode && !matchesName) return false;
    }

    // Filter by login mode
    if (filterLoginMode !== 'ALL' && c.loginMode !== filterLoginMode) return false;

    // Filter by token status
    if (filterTokenStatus === 'VALID') {
      if (!c.tokenExpiredAt || new Date(c.tokenExpiredAt) < new Date()) return false;
    } else if (filterTokenStatus === 'EXPIRED') {
      if (c.tokenExpiredAt && new Date(c.tokenExpiredAt) >= new Date()) return false;
    }

    return true;
  });
}, [companies, searchText, filterLoginMode, filterTokenStatus]);
```

### Bước 3: Thêm UI filter bar giữa title và bảng

Thay thế dòng `Danh Sách Doanh Nghiệp Đăng Ký ({companies.length})` bằng phần header mới có chứa search + filter:

```tsx
<div className="flex items-center justify-between mb-4 flex-wrap gap-3">
  <h2 className="text-lg font-semibold text-indigo-400 flex items-center">
    <Building2 className="w-5 h-5 mr-2" /> 
    Danh Sách Doanh Nghiệp ({filteredCompanies.length}/{companies.length})
  </h2>
  <button onClick={() => setIsAddModalOpen(true)} ...>
    <Plus /> <span>Thêm Doanh Nghiệp</span>
  </button>
</div>

{/* Search & Filter Bar */}
<div className="flex flex-wrap items-center gap-3 mb-4">
  {/* Search input */}
  <div className="relative flex-1 min-w-[200px]">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
    <input
      type="text"
      value={searchText}
      onChange={(e) => setSearchText(e.target.value)}
      placeholder="Tìm theo MST hoặc tên..."
      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
    />
  </div>

  {/* Login mode filter */}
  <select
    value={filterLoginMode}
    onChange={(e) => setFilterLoginMode(e.target.value as any)}
    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
  >
    <option value="ALL">Tất cả chế độ</option>
    <option value="AUTO">Tự động</option>
    <option value="MANUAL">Thủ công</option>
  </select>

  {/* Token status filter */}
  <select
    value={filterTokenStatus}
    onChange={(e) => setFilterTokenStatus(e.target.value as any)}
    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
  >
    <option value="ALL">Tất cả token</option>
    <option value="VALID">Còn hiệu lực</option>
    <option value="EXPIRED">Hết hiệu lực</option>
  </select>
</div>
```

### Bước 4: Thay `companies.map(...)` → `filteredCompanies.map(...)`

Trong phần render bảng, đổi `companies.map(...)` thành `filteredCompanies.map(...)` và thêm thông báo nếu filter trả về 0 kết quả:

```tsx
) : filteredCompanies.length === 0 ? (
  <tr>
    <td colSpan={7} className="p-8 text-center text-slate-500">
      {companies.length > 0 ? 'Không tìm thấy doanh nghiệp phù hợp.' : 'Chưa có doanh nghiệp nào được lưu cấu hình.'}
    </td>
  </tr>
) : (
  filteredCompanies.map((c) => { ...
```

---

## Tóm tắt thay đổi

| File | Hành động |
|---|---|
| `frontend/src/components/CompanyManager.tsx` | Thêm `useMemo`, state filter, UI search + dropdown, đổi render sang `filteredCompanies` |

## Chi tiết kỹ thuật

- Dùng `useMemo` để filter chỉ chạy lại khi `companies`, `searchText`, hoặc filter thay đổi
- Import thêm `Search` icon từ `lucide-react`
- Giữ nguyên toàn bộ logic modal Add/Edit/Relogin
