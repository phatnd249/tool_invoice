# Kế hoạch thêm Light Theme (xanh nước biển) vào Frontend

## Tổng quan
Hiện tại frontend chỉ có theme tối (dark), sử dụng Tailwind CSS v4. Cần thêm theme sáng với màu chủ đạo là xanh nước biển (blue), cho phép người dùng chuyển đổi qua lại giữa 2 theme.

## Phân tích hiện trạng
- **Công nghệ**: Tailwind CSS v4 + Vite + React
- **Theme hiện tại**: Toàn bộ class dùng palette `slate` (dark mode)
  - Background: `slate-900`, `slate-950`, `slate-800`
  - Text: `slate-100`, `slate-200`, `slate-400`
  - Border: `slate-800`, `slate-800/60`, `slate-800/80`
  - Accent: `indigo-400`, `indigo-500`, `indigo-600` (giữ nguyên cho cả 2 theme)
- **Số lượng component**: 10 file (.tsx) cần điều chỉnh

---

## Giai đoạn 1: Thiết lập CSS Theme Variables (tailwind v4)

### Bước 1.1: Khai báo CSS custom properties cho Light/Dark theme trong `index.css`

Sử dụng `@theme` directive của Tailwind v4 và CSS custom properties:

```css
@import "tailwindcss";

/* Light theme (mặc định) */
:root {
  --color-bg-primary: #f0f4f8;      /* blue-50 */
  --color-bg-secondary: #ffffff;     /* white */
  --color-bg-tertiary: #e2e8f0;     /* slate-200 */
  --color-border: #cbd5e1;          /* slate-300 */
  --color-border-light: #e2e8f0;    /* slate-200 */
  --color-text-primary: #1e293b;    /* slate-800 */
  --color-text-secondary: #475569;  /* slate-600 */
  --color-text-muted: #94a3b8;      /* slate-400 */
  --color-sidebar: #1e3a5f;         /* blue-900 tint */
  --color-sidebar-hover: #1e40af;   /* blue-800 */
  --color-card: #ffffff;
  --color-input: #ffffff;
  --color-accent: #2563eb;          /* blue-600 */
  --color-accent-hover: #1d4ed8;   /* blue-700 */
  --color-accent-light: #dbeafe;    /* blue-100 */
  --color-danger: #ef4444;          /* red-500 */
  --color-success: #22c55e;         /* green-500 */
}

/* Dark theme */
.dark {
  --color-bg-primary: #0f172a;      /* slate-900 */
  --color-bg-secondary: #020617;    /* slate-950 */
  --color-bg-tertiary: #1e293b;     /* slate-800 */
  --color-border: #1e293b;          /* slate-800 */
  --color-border-light: #334155;    /* slate-700 */
  --color-text-primary: #f1f5f9;    /* slate-100 */
  --color-text-secondary: #94a3b8;  /* slate-400 */
  --color-text-muted: #64748b;      /* slate-500 */
  --color-sidebar: #020617;         /* slate-950 */
  --color-sidebar-hover: #1e293b;   /* slate-800 */
  --color-card: #1e293b;
  --color-input: #0f172a;
  /* accent giữ nguyên */
  --color-accent: #2563eb;
  --color-accent-hover: #1d4ed8;
  --color-accent-light: #1e3a5f;
  --color-danger: #ef4444;
  --color-success: #22c55e;
}
```

### Bước 1.2: Đăng ký custom colors với Tailwind v4

Dùng `@theme` để Tailwind nhận diện các biến màu mới:

```css
@theme {
  --color-bg-primary: var(--color-bg-primary);
  --color-bg-secondary: var(--color-bg-secondary);
  --color-bg-tertiary: var(--color-bg-tertiary);
  --color-border: var(--color-border);
  --color-border-light: var(--color-border-light);
  --color-text-primary: var(--color-text-primary);
  --color-text-secondary: var(--color-text-secondary);
  --color-text-muted: var(--color-text-muted);
  --color-sidebar: var(--color-sidebar);
  --color-sidebar-hover: var(--color-sidebar-hover);
  --color-card: var(--color-card);
  --color-input: var(--color-input);
  --color-accent: var(--color-accent);
  --color-accent-hover: var(--color-accent-hover);
  --color-accent-light: var(--color-accent-light);
  --color-danger: var(--color-danger);
  --color-success: var(--color-success);
}
```

---

## Giai đoạn 2: Thay thế class Tailwind cũ bằng CSS variables

### Mapping class cũ → class mới

| Class cũ (dark) | Class mới (theme-aware) |
|-----------------|------------------------|
| `bg-slate-900` | `bg-bg-primary` |
| `bg-slate-950` | `bg-bg-secondary` |
| `bg-slate-800` | `bg-bg-tertiary` |
| `bg-slate-950/50` | `bg-bg-secondary/50` |
| `bg-slate-900/50` | `bg-bg-primary/50` |
| `bg-slate-950/80` | `bg-bg-secondary/80` |
| `bg-slate-950/60` | `bg-bg-secondary/60` |
| `text-slate-100` | `text-text-primary` |
| `text-slate-200` | `text-text-primary` |
| `text-slate-400` | `text-text-secondary` |
| `text-slate-450` | `text-text-secondary` |
| `text-slate-500` | `text-text-muted` |
| `text-slate-600` | `text-text-muted` |
| `text-slate-700` | `text-text-primary` |
| `border-slate-800` | `border-border` |
| `border-slate-800/60` | `border-border/60` |
| `border-slate-800/80` | `border-border/80` |
| `border-slate-855` | `border-border` |
| `hover:bg-slate-800` | `hover:bg-bg-tertiary` |
| `hover:bg-slate-755` | `hover:bg-bg-tertiary` |
| `placeholder-slate-700` | `placeholder-text-muted` |
| `placeholder-slate-600` | `placeholder-text-muted` |

### Danh sách file cần sửa

1. **`src/App.tsx`** (~200 dòng style, file lớn nhất)
2. **`src/components/InvoiceDownloader.tsx`**
3. **`src/components/InvoiceHistory.tsx`**
4. **`src/components/SchedulePanel.tsx`**
5. **`src/components/ConfigPanel.tsx`**
6. **`src/components/CompanyManager.tsx`**
7. **`src/components/UserManagement.tsx`**
8. **`src/components/FeedbackManager.tsx`**
9. **`src/components/Login.tsx`**
10. **`src/components/TaxLookup.tsx`**

---

## Giai đoạn 3: Tạo Theme Toggle + Context Provider

### Bước 3.1: Tạo `src/context/ThemeContext.tsx`

```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

### Bước 3.2: Bọc App bằng ThemeProvider trong `main.tsx`

```tsx
import { ThemeProvider } from './context/ThemeContext';

<ThemeProvider>
  <App />
</ThemeProvider>
```

### Bước 3.3: Thêm nút toggle theme trong Header của `App.tsx`

Thêm icon Sun/Moon ở header để người dùng chuyển đổi theme.

```tsx
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// Trong header:
<button onClick={toggleTheme} className="...">
  {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
</button>
```

---

## Giai đoạn 4: Xử lý các trường hợp đặc biệt

### 4.1 Accent color (indigo)
Giữ nguyên accent `indigo-*` hoặc đổi sang blue palette tùy theo theme:
- Light: `blue-600`, `blue-700`, `blue-100`
- Dark: giữ `indigo-500`, `indigo-600` để có độ tương phản tốt hơn trên nền tối

→ Dùng CSS variables cho accent colors (đã định nghĩa ở trên)

### 4.2 Gradient text
Các chỗ dùng `bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent` cần được giữ nhưng màu sắc có thể điều chỉnh theo theme.

### 4.3 Shadow
`shadow-lg shadow-indigo-600/30` giữ nguyên vì shadow hoạt động tốt trên cả 2 theme.

### 4.4 Trạng thái loading/error/success
Dùng biến `--color-danger` và `--color-success` để đồng nhất.

### 4.5 Backdrop blur
`backdrop-blur-sm` và `bg-slate-950/60` → `bg-bg-secondary/60` cho modal overlay.

---

## Giai đoạn 5: Kiểm tra & Tinh chỉnh

### Checklist kiểm tra
- [ ] Theme mặc định là light (blue)  
- [ ] Chuyển sang dark theme hoạt động  
- [ ] Toggle theme được lưu vào localStorage  
- [ ] Tất cả component hiển thị đúng ở cả 2 theme  
- [ ] Sidebar, header, modal, form, button, table hiển thị tốt  
- [ ] Text có độ tương phản đủ (WCAG AA)  
- [ ] Không còn class `slate-*` nào sót lại  
- [ ] Accent color (blue) nổi bật trên nền sáng  

### Tinh chỉnh bổ sung
- Thêm transition mượt khi chuyển theme (`transition-colors duration-300` trên `html` hoặc `body`)
- Điều chỉnh màu sidebar light theme nếu cần (hiện đang dùng `blue-900` tint)

---

## Thứ tự triển khai

1. **`src/index.css`** - Định nghĩa CSS variables + `@theme` ✅
2. **`src/context/ThemeContext.tsx`** - Tạo context provider ✅
3. **`src/main.tsx`** - Bọc ThemeProvider ✅
4. **`src/App.tsx`** - Thay class + thêm nút toggle ✅
5. **Các component còn lại** - Thay class (theo mapping table) ✅

---

## Tiến độ hiện tại
✅ **Đợt 1 hoàn thành** - Build thành công.

### Vấn đề còn tồn đọng (cần sửa ở Đợt 2)
1. Các class màu accent cứng (`indigo-*`, `cyan-*`, `emerald-*`, `rose-*`, `purple-*`) chưa được theme hóa
2. Các class màu lạ (`text-slate-650`, `text-slate-350`, `shadow-emerald-650`) còn sót
3. Light theme chưa có màu xanh dương chủ đạo — các button, label, badge, heading vẫn dùng màu tối

---

## Đợt 2: Theme hóa accent colors + đưa xanh dương vào light theme

### Vấn đề chính
Khi chuyển sang light theme:
- Button, badge, heading, label vẫn dùng `indigo-*`, `cyan-*`, `emerald-*`, `rose-*`, `purple-*`
- Các màu này không tự động chuyển thành xanh dương vì là class hardcode, không phải theme variable

### Giải pháp
**Tạo thêm CSS variables cho accent color palette** và thay thế tất cả class accent cứng.

### Bước 1: Bổ sung CSS variables cho accent palette trong `index.css`

```css
:root {
  /* Accent primary - dùng cho button chính, badge active, link */
  --color-accent-default: #2563eb;      /* blue-600 */
  --color-accent-hover-default: #1d4ed8; /* blue-700 */
  --color-accent-light-default: #dbeafe; /* blue-100 */
  --color-accent-subtle-default: #bfdbfe; /* blue-200 */
  
  /* Status colors - semantic, đổi màu ở light theme */
  --color-success-default: #16a34a;      /* green-600 (sáng, đẹp hơn emerald) */
  --color-success-light: #dcfce7;        /* green-100 */
  --color-danger-default: #dc2626;       /* red-600 */
  --color-danger-light: #fee2e2;         /* red-100 */
  --color-warning-default: #d97706;      /* amber-600 */
  --color-warning-light: #fef3c7;        /* amber-100 */
  
  /* Button gradient */
  --color-gradient-from: #2563eb;        /* blue-600 */
  --color-gradient-to: #7c3aed;          /* purple-600 */
  
  /* Special: log terminal colors */
  --color-log-info: #16a34a;
  --color-log-cyan: #0891b2;
}

.dark {
  --color-accent-default: #818cf8;      /* indigo-400 */
  --color-accent-hover-default: #6366f1; /* indigo-500 */
  --color-accent-light-default: #312e81; /* indigo-950 */
  --color-accent-subtle-default: #4338ca; /* indigo-700 */
  
  --color-success-default: #22c55e;
  --color-success-light: #052e16;
  --color-danger-default: #ef4444;
  --color-danger-light: #450a0a;
  --color-warning-default: #f59e0b;
  --color-warning-light: #451a03;
  
  --color-gradient-from: #6366f1;        /* indigo-500 */
  --color-gradient-to: #9333ea;          /* purple-600 */
  
  --color-log-info: #22c55e;
  --color-log-cyan: #22d3ee;
}
```

Thêm vào `@theme`:
```css
@theme {
  --color-accent-default: var(--color-accent-default);
  --color-accent-hover-default: var(--color-accent-hover-default);
  --color-accent-light-default: var(--color-accent-light-default);
  --color-accent-subtle-default: var(--color-accent-subtle-default);
  --color-success-default: var(--color-success-default);
  --color-success-light: var(--color-success-light);
  --color-danger-default: var(--color-danger-default);
  --color-danger-light: var(--color-danger-light);
  --color-warning-default: var(--color-warning-default);
  --color-warning-light: var(--color-warning-light);
  --color-gradient-from: var(--color-gradient-from);
  --color-gradient-to: var(--color-gradient-to);
  --color-log-info: var(--color-log-info);
  --color-log-cyan: var(--color-log-cyan);
}
```

### Bước 2: Mapping class accent cũ → class mới

| Class cũ (dark) | Class mới (theme-aware) |
|-----------------|------------------------|
| `text-indigo-400` | `text-accent-default` |
| `text-indigo-300` | `text-accent-default` (hoặc light hơn) |
| `text-indigo-600/80` | `text-accent-default/80` |
| `bg-indigo-600` | `bg-accent-default` |
| `bg-indigo-500` | `bg-accent-hover-default` |
| `bg-indigo-600/20` | `bg-accent-default/20` |
| `bg-indigo-500/10` | `bg-accent-default/10` |
| `hover:bg-indigo-700` | `hover:bg-accent-hover-default` |
| `hover:bg-indigo-600/20` | `hover:bg-accent-default/20` |
| `hover:bg-indigo-500/20` | `hover:bg-accent-default/20` |
| `hover:bg-indigo-600` | `hover:bg-accent-hover-default` |
| `border-indigo-500` | `border-accent-default` |
| `border-indigo-500/20` | `border-accent-default/20` |
| `border-indigo-500/40` | `border-accent-default/40` |
| `focus:border-indigo-500` | `focus:border-accent-default` |
| `shadow-lg shadow-indigo-600/30` | `shadow-lg shadow-accent-default/30` |
| `shadow-lg shadow-indigo-500/10` | `shadow-lg shadow-accent-default/10` |
| `shadow-lg shadow-indigo-500/20` | `shadow-lg shadow-accent-default/20` |
| `from-indigo-500` (gradient) | `from-accent-default` |
| `hover:from-indigo-600` | `hover:from-accent-hover-default` |
| `from-indigo-400` (gradient) | `from-accent-default` |
| `text-cyan-400` | `text-log-cyan` |
| `from-cyan-400` (gradient) | `from-log-cyan` |
| `text-emerald-400` | `text-success-default` |
| `text-emerald-450` | `text-success-default` |
| `text-emerald-300` | `text-success-default` |
| `bg-emerald-600` | `bg-success-default` |
| `hover:bg-emerald-700` | `hover:bg-success-default` (darken) |
| `bg-emerald-500/10` | `bg-success-light` |
| `border-emerald-500/20` | `border-success-default/20` |
| `border-emerald-500/30` | `border-success-default/30` |
| `hover:border-emerald-500/40` | `hover:border-success-default/40` |
| `hover:bg-emerald-600/20` | `hover:bg-success-default/20` |
| `hover:bg-emerald-500` | `hover:bg-success-default` |
| `shadow-lg shadow-emerald-650/20` | `shadow-lg shadow-success-default/20` |
| `text-rose-400` | `text-danger-default` |
| `text-rose-300` | `text-danger-default` |
| `text-rose-450` | `text-danger-default` |
| `bg-rose-500/10` | `bg-danger-light` |
| `border-rose-500/20` | `border-danger-default/20` |
| `border-rose-500/30` | `border-danger-default/30` |
| `hover:bg-rose-500/10` | `hover:bg-danger-default/10` |
| `hover:bg-rose-600/20` | `hover:bg-danger-default/20` |
| `hover:text-rose-300` | `hover:text-danger-default` |
| `hover:bg-rose-500` | `hover:bg-danger-default` |
| `text-purple-400` | `text-accent-default` |
| `text-purple-600` (gradient) | `text-accent-default` |
| `bg-purple-500/10` | `bg-accent-default/10` |
| `border-purple-500/20` | `border-accent-default/20` |
| `hover:to-purple-700` (gradient) | `hover:to-accent-hover-default` |
| `to-purple-600` (gradient) | `to-accent-hover-default` |

### Bước 3: Xử lý các class lạ còn sót (không phải theme variable)

| Class cũ | Class mới |
|----------|----------|
| `text-slate-650` | `text-text-muted` |
| `text-slate-350` | `text-text-muted` |
| `hover:text-slate-650` | `hover:text-text-secondary` |
| `bg-slate-850` | `bg-bg-tertiary` |
| `hover:bg-slate-850` | `hover:bg-bg-tertiary` |
| `shadow-slate-950/50` | (xóa hoặc đổi thành shadow vừa phải) |

### Bước 4: Cập nhật CSS variables cho Login page
Login page có background gradient và blur circles dùng `purple-*` và `indigo-*`:
- `bg-purple-500/10 blur-[120px]` → dùng `bg-accent-default/10`
- `bg-gradient-to-br from-indigo-900 via-slate-900 to-purple-900` → giữ nguyên (special design)

### Bước 5: Kiểm tra trực quan từng component

#### Checklist
- [ ] **App.tsx**: Sidebar active tab `bg-indigo-600 text-white` → `bg-accent-default text-white`
- [ ] **App.tsx**: Nút 

- [ ] **App.tsx**: `bg-indigo-600`, `text-indigo-400`, `text-rose-*`, `bg-emerald-500`, gradient brand/text → theme variables
- [ ] **CompanyManager.tsx**: Toàn bộ `indigo-*`, `emerald-*`, `rose-*`, `purple-*` → accent/success/danger variables
- [ ] **ConfigPanel.tsx**: `text-indigo-400`, `bg-emerald-500/10`, `bg-rose-500/10` → theme variables
- [ ] **FeedbackManager.tsx**: `text-indigo-400`, `bg-indigo-500/10`, `bg-emerald-500/10`, `bg-rose-500/10` → theme variables
- [ ] **InvoiceDownloader.tsx**: `text-indigo-400`, `text-cyan-400`, `text-emerald-400`, gradient button → theme variables
- [ ] **InvoiceHistory.tsx**: `bg-emerald-600`, `text-emerald-*`, `text-rose-400` → theme variables + class lạ `text-slate-650`, `text-slate-350`
- [ ] **Login.tsx**: Gradient button `from-indigo-500 to-purple-600`, blur circle `bg-purple-500/10` → theme variables
- [ ] **SchedulePanel.tsx**: Gradient button `from-indigo-500 to-purple-600`, `text-cyan-400`, `text-slate-650` → theme variables
- [ ] **TaxLookup.tsx**: Search button `bg-indigo-600 hover:bg-indigo-500`, gradient heading → theme variables
- [ ] **UserManagement.tsx**: Gradient button + `bg-purple-500/10 text-purple-400`, `text-slate-650` → theme variables

---

## Tiến độ Đợt 2

| Bước | Mô tả | Trạng thái |
|------|-------|-----------|
| 1 | Thêm accent CSS variables + `@theme` | ✅ |
| 2 | Batch replace bằng sed | ✅ |
| 3 | Fix thủ công (class lạ, gradient) | ✅ |
| 4 | Build & kiểm tra | ✅ |

### Các thay đổi chính

#### `index.css`
- Thêm 14 CSS variables mới: `--color-accent-default`, `--color-accent-hover-default`, `--color-accent-light-default`, `--color-accent-subtle-default`, `--color-success-default`, `--color-success-light`, `--color-danger-default`, `--color-danger-light`, `--color-warning-default`, `--color-warning-light`, `--color-gradient-from`, `--color-gradient-to`, `--color-log-info`, `--color-log-cyan`
- Mỗi biến có value khác nhau cho light theme và dark theme
- Đăng ký tất cả trong `@theme` để Tailwind nhận diện

#### Batch replace mapping
| Class cũ → Class mới | Số lượng |
|---------------------|----------|
| `indigo-*` → `accent-default/accent-hover-default` | ~50+ |
| `cyan-400` → `log-cyan` | 2 |
| `emerald-*` → `success-default/success-light` | ~15+ |
| `rose-*` → `danger-default/danger-light` | ~10+ |
| `purple-*` → `accent-default/accent-hover-default` | ~8+ |
| `shadow-accent/*` → `shadow-accent-default/*` | ~6 |
| `text-slate-650/350` → `text-text-muted` | 2 |
| `bg-slate-850` → `bg-bg-tertiary` | 1 |
| `border-slate-850` → `border-border` | 4 |
| `divide-slate-850` → `divide-border` | 2 |

#### Kết quả
✅ Build thành công (928ms, 1838 modules)
✅ Không còn class `indigo-*`, `cyan-*`, `emerald-*`, `rose-*`, `purple-*` cứng
✅ Light theme: button xanh dương (#2563eb), badge success xanh lá (#16a34a), badge error đỏ (#dc2626)
✅ Dark theme: giữ nguyên indigo để tương phản tốt
