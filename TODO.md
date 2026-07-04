# Gom nhóm và sắp xếp sidebar theo logic

## Hiện trạng

Sidebar hiển thị các item theo thứ tự add dần, không có phân nhóm:

```
Tải Hoá Đơn
Lịch Sử Hoá Đơn
Đặt Lịch Tải
Tra Cứu MST
Doanh Nghiệp
Quản Lý Thành Viên
Ý Kiến Đóng Góp
API Key
```

Các item không phân biệt được đâu là chức năng nghiệp vụ, đâu là quản trị hệ thống, đâu dành cho ADMIN hay dùng chung.

## Mục tiêu

Gom thành **3 nhóm có label**, sắp xếp theo tần suất sử dụng:

| Nhóm | Mô tả | Icon | Ai thấy? |
|---|---|---|---|
| **HOÁ ĐƠN** | Chức năng chính | | |
| Tải Hoá Đơn | Tải mới | CloudDownload | Tất cả |
| Lịch Sử | Xem lịch sử đã tải | History | Tất cả |
| Đặt Lịch | Lập lịch tự động | CalendarDays | Tất cả |
| Tra Cứu MST | Tra cứu mã số thuế | Search | Tất cả |
| **QUẢN TRỊ** | Quản lý dữ liệu | | |
| Doanh Nghiệp | Danh sách công ty | Building2 | ADMIN |
| Thành Viên | Quản lý user | Users | ADMIN |
| Ý Kiến | Feedback từ user | MessageSquare | ADMIN |
| **HỆ THỐNG** | Cấu hình | | |
| API Key | Gemini API Key | Key | ADMIN |

## Các bước thực hiện

### Bước 1: Định nghĩa cấu trúc sidebar groups

Tạo 1 mảng `sidebarGroups` thay vì render thủ công từng nút:

```tsx
const sidebarGroups = [
  {
    label: 'HOÁ ĐƠN',
    items: [
      { id: 'download', label: 'Tải Hoá Đơn', icon: CloudDownload, adminOnly: false },
      { id: 'history', label: 'Lịch Sử', icon: History, adminOnly: false },
      { id: 'schedules', label: 'Đặt Lịch', icon: CalendarDays, adminOnly: false },
      { id: 'tax-lookup', label: 'Tra Cứu MST', icon: Search, adminOnly: false },
    ],
  },
  {
    label: 'QUẢN TRỊ',
    items: [
      { id: 'companies', label: 'Doanh Nghiệp', icon: Building2, adminOnly: true },
      { id: 'users', label: 'Thành Viên', icon: Users, adminOnly: true },
      { id: 'feedbacks', label: 'Ý Kiến', icon: MessageSquare, adminOnly: true },
    ],
  },
  {
    label: 'HỆ THỐNG',
    items: [
      { id: 'config', label: 'API Key', icon: Key, adminOnly: true },
    ],
  },
];
```

### Bước 2: Render sidebar từ mảng

Thay toàn bộ `<button>` thủ công bằng:

```tsx
{sidebarGroups.map(group => (
  <div key={group.label} className="mb-2">
    {!sidebarCollapsed && (
      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3 mb-2 mt-2">
        {group.label}
      </p>
    )}
    {group.items
      .filter(item => !item.adminOnly || isAdmin)
      .map(item => (
        <button
          key={item.id}
          onClick={() => setActiveTab(item.id)}
          className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer mb-1 ${
            activeTab === item.id
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <item.icon className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
          {!sidebarCollapsed && <span>{item.label}</span>}
        </button>
      ))}
  </div>
))}
```

### Bước 3: Dọn dẹp code cũ

Xoá toàn bộ các `<button>` render thủ công cũ (~60 dòng). Giữ nguyên logic `activeTab`, `isAdmin`, `sidebarCollapsed`.

### Bước 4: Kiểm tra

- ADMIN thấy đủ 3 nhóm với label
- STAFF chỉ thấy nhóm HOÁ ĐƠN
- Sidebar collapsed: ẩn label nhóm, chỉ hiện icon

---

## Tóm tắt thay đổi

| File | Hành động |
|---|---|
| `frontend/src/App.tsx` | Thêm mảng `sidebarGroups`, thay render thủ công bằng loop, xoá code cũ |
