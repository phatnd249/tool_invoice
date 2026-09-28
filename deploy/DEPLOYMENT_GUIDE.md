# Hướng Dẫn Triển Khai Hệ Thống Tool-Invoice Lên Server Thật (Production)

Tài liệu này hướng dẫn chi tiết từng bước triển khai hệ thống **Invoice Pro (tool-invoice)** lên máy chủ thật (Production Server), bao gồm cấu hình tên miền, bảo mật **HTTPS SSL thông qua Cloudflare** (hạn 15 năm, không cần gia hạn định kỳ) hoặc Let's Encrypt Certbot, hỗ trợ cả **Ubuntu Server (Linux)** và **Windows Server**.

> **Yêu cầu:** Node.js **22 LTS** trở lên (Dockerfile sử dụng `node:22-slim`).

---

## 1. Yêu Cầu Máy Chủ & Tên Miền

* **Hệ điều hành:**
  * Ubuntu Server: 20.04 LTS, 22.04 LTS, hoặc 24.04 LTS (Khuyên dùng).
  * Windows Server: 2019 Standard / Datacenter, hoặc 2022.
* **Cấu hình tối thiểu:**
  * CPU: 2 Core trở lên.
  * RAM: 4 GB RAM trở lên (Khuyến nghị 4GB - 8GB để xử lý nén file và PDF).
  * Ổ cứng: SSD 40GB+ (tùy thuộc vào số lượng hóa đơn lưu trữ).
* **Mạng & Firewall:**
  * Mở port: **80** (HTTP), **443** (HTTPS), và **22** (SSH - Ubuntu) hoặc **3389** (RDP - Windows).
* **Tên miền qua Cloudflare:**
  * Trỏ bản ghi **A Record** (Bật đám mây cam 🟠 **Proxied**) về IP Public của máy chủ:
    * **Type:** A
    * **Name:** `invoice` (ví dụ `invoice.yourcompany.com`)
    * **IPv4 address:** `<Địa chỉ IP Public của Server>`
    * **Proxy status:** Proxied (Bật cam)

---

## 2. Cấu Hình HTTPS Trên Cloudflare (Cực Kỳ Quan Trọng)

Khi sử dụng Cloudflare làm proxy bảo mật:

### 2.1 Chọn chế độ mã hóa SSL/TLS: Full (Strict)
1. Vào Dashboard Cloudflare -> Chọn tên miền -> Mục **SSL/TLS**.
2. Chọn chế độ: **Full (Strict)** hoặc **Full**.
3. **Tuyệt đối KHÔNG chọn "Flexible":** Vì chế độ Flexible sẽ gây ra lỗi vòng lặp chuyển hướng vô tận (`ERR_TOO_MANY_REDIRECTS`).

### 2.2 Tạo chứng chỉ Cloudflare Origin Certificate (Thời hạn 15 năm)
Bạn không cần phải chạy Certbot gia hạn mỗi 90 ngày. Cloudflare cấp miễn phí chứng chỉ Origin Server có hạn tới 15 năm:
1. Vào **SSL/TLS** -> **Origin Server** -> Bấm **Create Certificate**.
2. Giữ nguyên mặc định (RSA 2048, Hostnames: `*.yourcompany.com`, `yourcompany.com`, Validity: `15 years`).
3. Bấm **Create**, màn hình sẽ hiện:
   * **Origin Certificate:** Copy toàn bộ nội dung, lưu thành file trên server:  
     `/etc/ssl/cloudflare/invoice.crt` (hoặc `C:\ssl\cloudflare\invoice.crt` trên Windows).
   * **Private Key:** Copy toàn bộ nội dung, lưu thành file trên server:  
     `/etc/ssl/cloudflare/invoice.key` (hoặc `C:\ssl\cloudflare\invoice.key` trên Windows).
4. Phân quyền an toàn trên Ubuntu:
   ```bash
   sudo mkdir -p /etc/ssl/cloudflare
   sudo chmod 600 /etc/ssl/cloudflare/invoice.key
   ```

---

## 3. Kịch Bản A: Triển Khai Trên Ubuntu Server

### Phương pháp 1: Docker Compose + Nginx (Chuẩn Production)

#### Bước 1: Cài đặt Docker & Nginx
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx docker.io docker-compose-v2
sudo systemctl enable --now docker
```

#### Bước 2: Clone source code & cấu hình .env
```bash
cd /var/www
sudo git clone https://github.com/tr1nh/tool-invoice.git
cd tool-invoice
sudo cp backend/.env.example backend/.env
sudo nano backend/.env
```
*Các biến môi trường quan trọng:*
* `APP_URL=https://invoice.yourcompany.com` (Bắt buộc dùng domain HTTPS)
* `PORT=3000`
* `JWT_ACCESS_SECRET` và `JWT_REFRESH_SECRET`: **Bắt buộc** tạo giá trị ngẫu nhiên mạnh:
  ```bash
  # Chạy 2 lần, dùng kết quả cho 2 biến khác nhau
  openssl rand -hex 32
  ```
  > ⚠️ **KHÔNG sử dụng giá trị mặc định** trong docker-compose.yml cho production. Hãy ghi đè bằng biến môi trường hoặc file `.env`.
* `GOOGLE_SERVICE_ACCOUNT_JSON` và `GOOGLE_DRIVE_FOLDER_ID`: Thiết lập backup Drive

#### Bước 3: Cấu hình Nginx với Cloudflare Real IP & Origin SSL
```bash
sudo cp deploy/nginx/tool-invoice.conf /etc/nginx/sites-available/tool-invoice.conf
sudo nano /etc/nginx/sites-available/tool-invoice.conf
```
*Sửa `server_name` thành tên miền của bạn (ví dụ: `invoice.yourcompany.com`).*

Kích hoạt cấu hình:
```bash
sudo ln -s /etc/nginx/sites-available/tool-invoice.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Bước 4: Khởi chạy hệ thống bằng Docker Compose
```bash
sudo docker compose up -d --build
```
Kiểm tra trạng thái containers:
```bash
sudo docker compose ps
```

---

### Phương pháp 2: Triển khai trực tiếp với PM2 (Không dùng Docker)
```bash
# 0. Yêu cầu: Node.js 22 LTS
# 1. Cài đặt Node.js 22 LTS & PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential
sudo npm install -g pm2

# 2. Chạy Gotenberg (Engine chuyển đổi PDF)
docker run -d --name gotenberg --restart unless-stopped -p 3001:3000 gotenberg/gotenberg:8

# 3. Chạy script deploy PM2
cd /var/www/tool-invoice
bash deploy/ubuntu/deploy-pm2.sh

# 4. Thiết lập PM2 tự khởi động cùng hệ thống khi reboot
pm2 startup
pm2 save
```

---

## 4. Kịch Bản B: Triển Khai Trên Windows Server

### Bước 1: Cài đặt Node.js, Git & PM2
1. Tải và cài đặt **Node.js 22 LTS** từ [nodejs.org](https://nodejs.org).
2. Tải và cài đặt **Git for Windows** từ [git-scm.com](https://git-scm.com).
3. Mở PowerShell (Run as Administrator), cài PM2:
   ```powershell
   npm install -g pm2
   ```

### Bước 2: Tải Caddy Server làm Reverse Proxy
1. Tải `caddy.exe` từ [caddyserver.com/download](https://caddyserver.com/download).
2. Tạo thư mục `C:\caddy`, lưu file vào `C:\caddy\caddy.exe` và thêm `C:\caddy` vào biến môi trường `Path`.

### Bước 3: Build & Khởi chạy ứng dụng
Mở PowerShell tại thư mục dự án:
```powershell
Set-Location D:\Projects\tool-invoice
Copy-Item backend\.env.example backend\.env
notepad backend\.env
```
*(Chỉnh sửa `APP_URL=https://invoice.yourcompany.com`, JWT Secret)*

Chạy script deploy tự động:
```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\deploy-pm2.ps1
```

### Bước 4: Chạy Gotenberg (PDF Engine)
Nếu có Docker Desktop for Windows:
```powershell
docker run -d --name gotenberg --restart unless-stopped -p 3001:3000 gotenberg/gotenberg:8
```

### Bước 5: Kích hoạt HTTPS với Cloudflare trên Caddy
Chỉnh sửa file [deploy/caddy/Caddyfile](file:///d:/Projects/tool-invoice/deploy/caddy/Caddyfile):
```caddy
invoice.yourcompany.com {
    tls C:/ssl/cloudflare/invoice.crt C:/ssl/cloudflare/invoice.key
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        transport http {
            response_header_timeout 3600s
        }
    }
}
```
Khởi động Caddy chạy nền:
```powershell
caddy start --config deploy\caddy\Caddyfile
```

---

## 5. Cấu Hình Tường Lửa (Firewall Security)

Chỉ mở port **80** và **443** ra ngoài:

* **Trên Ubuntu (UFW):**
  ```bash
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
  ```
* **Trên Windows Server (PowerShell Admin):**
  ```powershell
  New-NetFirewallRule -DisplayName "Allow HTTP 80" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow
  New-NetFirewallRule -DisplayName "Allow HTTPS 443" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow
  ```

---

## 6. Quy Trình Cập Nhật Khi Có Phiên Bản Mới

* **Trên Ubuntu (Docker):**
  ```bash
  cd /var/www/tool-invoice && bash deploy/ubuntu/deploy-docker.sh
  ```
* **Trên Ubuntu (PM2):**
  ```bash
  cd /var/www/tool-invoice && bash deploy/ubuntu/deploy-pm2.sh
  ```
* **Trên Windows Server:**
  ```powershell
  Set-Location D:\Projects\tool-invoice
  powershell -ExecutionPolicy Bypass -File deploy\windows\deploy-pm2.ps1
  ```

---

## 7. Bảo Mật Production (Security Hardening)

### 7.1 Tạo JWT Secret mạnh
Không bao giờ dùng giá trị mặc định trong production. Tạo secret ngẫu nhiên:
```bash
# Ubuntu / macOS
openssl rand -hex 32

# Windows PowerShell
[System.BitConverter]::ToString((1..32 | % { Get-Random -Max 256 }) -as [byte[]]).Replace('-','').ToLower()
```
Gán kết quả vào file `backend/.env`:
```env
JWT_ACCESS_SECRET=<giá_trị_ngẫu_nhiên_1>
JWT_REFRESH_SECRET=<giá_trị_ngẫu_nhiên_2>
```

### 7.2 Đổi mật khẩu Admin sau lần đầu triển khai
Sau khi seed tạo tài khoản admin (qua `ADMIN_EMAIL` và `ADMIN_INITIAL_PASSWORD`), hãy **đăng nhập và đổi mật khẩu ngay lập tức**.

### 7.3 Không expose port nội bộ ra ngoài
* Port `9000` (backend) và Gotenberg chỉ nên truy cập qua reverse proxy (Nginx/Caddy), **không mở trực tiếp ra Internet**.
* Nếu dùng Docker, Gotenberg đã được cấu hình internal-only (không `ports` mapping).

---

## 8. Dữ Liệu & Volume (Data Persistence)

### 8.1 Khi dùng Docker Compose
Docker Compose sử dụng volume `app_data` để lưu trữ lâu dài:
```
app_data:/app/backend/data
    ├── dev.db          ← SQLite database (toàn bộ dữ liệu hệ thống)
    ├── dev.db-wal      ← SQLite WAL journal
    └── invoices/       ← File hoá đơn (ZIP, XML, PDF) đã tải
```
> ⚠️ Xoá volume = **mất toàn bộ dữ liệu**. Chỉ chạy `docker compose down` (không có flag `-v`).

**Backup volume Docker:**
```bash
# Tạo bản sao thủ công của volume
docker run --rm -v tool-invoice_app_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/data_backup_$(date +%Y%m%d).tar.gz -C /data .
```

**Migrate volume sang server mới:**
```bash
# Trên server cũ: export
docker run --rm -v tool-invoice_app_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/data_export.tar.gz -C /data .

# Chuyển file data_export.tar.gz sang server mới, sau đó:
docker compose up -d  # Tạo volume trống trước
docker compose stop backend
docker run --rm -v tool-invoice_app_data:/data -v $(pwd):/backup alpine \
  sh -c "cd /data && tar xzf /backup/data_export.tar.gz"
docker compose start backend
```

### 8.2 Khi dùng PM2 (không Docker)
Dữ liệu lưu trực tiếp trong thư mục dự án:
```
backend/
    ├── prisma/dev.db   ← SQLite database
    └── invoices/       ← File hoá đơn
```
**Cần backup định kỳ** các thư mục trên (hoặc cấu hình Google Drive backup tự động).

---

## 9. Sao Lưu & Phục Hồi Với Google Drive

### 9.1 Cấu hình Backup tự động lên Google Drive

1. **Tạo Service Account trên Google Cloud Console:**
   - Truy cập https://console.cloud.google.com/ → IAM & Admin → Service Accounts
   - Tạo Service Account mới → Keys → Add Key → Create new key → **JSON**
   - Tải file JSON về

2. **Tạo thư mục backup trên Google Drive:**
   - Tạo thư mục mới (ví dụ: `Invoice-Backups`)
   - Copy **Folder ID** từ URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`
   - Share thư mục cho email Service Account (trong file JSON, field `client_email`) → quyền **Editor**

3. **Cấu hình biến môi trường** trong `backend/.env`:
   ```env
   GOOGLE_DRIVE_FOLDER_ID=<Folder_ID_ở_trên>
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...",...}

   # Tùy chọn
   BACKUP_AUTO_ENABLED=true
   BACKUP_CRON_SCHEDULE="0 2 * * *"   # 2 giờ sáng mỗi ngày
   BACKUP_RETENTION_COUNT=7            # Giữ 7 bản mới nhất
   BACKUP_MODE=INCREMENTAL             # Chỉ backup file mới/thay đổi
   BACKUP_MAX_CHUNK_SIZE_MB=15         # Tách file nếu > 15MB
   ```

4. **Kiểm tra kết nối:** Vào giao diện web → Trang **Sao lưu** → Bấm **Kiểm tra kết nối**.

### 9.2 Phục hồi (Restore) từ file backup

```bash
# 1. Tải file backup ZIP từ Google Drive về server
# 2. Giải nén
unzip invoice_backup_2026-09-28_02-00-00.zip -d /tmp/restore

# 3. Dừng ứng dụng
docker compose stop backend   # hoặc: pm2 stop invoice-backend

# 4. Khôi phục database
cp /tmp/restore/database/dev.db backend/data/dev.db        # Docker
# hoặc: cp /tmp/restore/database/dev.db backend/prisma/dev.db  # PM2

# 5. Khôi phục file hoá đơn
cp -r /tmp/restore/invoices/* backend/data/invoices/        # Docker
# hoặc: cp -r /tmp/restore/invoices/* backend/invoices/        # PM2

# 6. Chạy migration (đảm bảo schema đúng phiên bản)
cd backend && npx prisma migrate deploy && cd ..

# 7. Khởi động lại
docker compose start backend   # hoặc: pm2 start invoice-backend
```

> Nếu backup chia thành nhiều phần (multi-part), giải nén tất cả các phần rồi gộp thư mục `invoices/` lại.

---

## 10. Giám Sát Hệ Thống (Monitoring)

### 10.1 Kiểm tra Healthcheck
```bash
# Docker: xem trạng thái health
docker inspect --format='{{.State.Health.Status}}' backend

# Hoặc gọi API trực tiếp
curl -s http://localhost:9000/api | head -c 200
```

### 10.2 Theo dõi dung lượng ổ cứng
SQLite database và thư mục invoices sẽ **tăng dần theo thời gian**:
```bash
# Docker: kiểm tra dung lượng volume
docker exec backend du -sh /app/backend/data/

# PM2: kiểm tra trực tiếp
du -sh backend/prisma/dev.db backend/invoices/
```

### 10.3 Xem Log ứng dụng
```bash
# Docker
docker compose logs -f backend --tail 100

# PM2
pm2 logs invoice-backend --lines 100
```

---

## 11. PM2 Tự Khởi Động Khi Reboot

### Ubuntu
```bash
pm2 startup        # Tạo script systemd tự khởi động
pm2 save           # Lưu danh sách process hiện tại
```

### Windows Server
PM2 trên Windows **không hỗ trợ `pm2 startup`** mặc định. Cần cài thêm:
```powershell
# Cách 1: pm2-windows-startup (đơn giản)
npm install -g pm2-windows-startup
pm2-startup install
pm2 save

# Cách 2: Tạo Windows Service thủ công bằng NSSM
# Tải NSSM: https://nssm.cc/download
nssm install InvoiceBackend "C:\Program Files\nodejs\node.exe" "C:\Users\<user>\AppData\Roaming\npm\node_modules\pm2\bin\pm2" resurrect
nssm start InvoiceBackend
```

---

## 12. Xử Lý Sự Cố (Troubleshooting)

| Triệu chứng | Nguyên nhân | Cách khắc phục |
|---|---|---|
| `ERR_TOO_MANY_REDIRECTS` | Cloudflare SSL đặt chế độ **Flexible** | Đổi sang **Full (Strict)** trong Cloudflare Dashboard |
| Container backend khởi động rồi crash | DB migration lỗi hoặc thiếu biến môi trường | `docker compose logs backend` để xem chi tiết lỗi |
| `EACCES: permission denied` (PM2) | Chạy npm install bằng root nhưng PM2 chạy bằng user khác | `sudo chown -R $USER:$USER /var/www/tool-invoice` |
| Port 9000/3000 bị chiếm | Có process khác đang dùng port | Ubuntu: `sudo lsof -i :9000` / Windows: `netstat -ano \| findstr :9000` |
| Backup lỗi 403 Forbidden | Chưa share thư mục Drive cho Service Account | Share thư mục cho email `client_email` với quyền **Editor** |
| `JavaScript heap out of memory` khi build | Server thiếu RAM | Thêm `NODE_OPTIONS="--max-old-space-size=4096"` trước lệnh build |
| Gotenberg timeout khi xuất PDF | File hoá đơn quá lớn hoặc Gotenberg chưa chạy | Kiểm tra `docker ps \| grep gotenberg`, restart nếu cần |
| PM2 không tự khởi động sau reboot (Windows) | Chưa cài `pm2-windows-startup` | Xem mục 11 ở trên |

---

## 13. Checklist Triển Khai Lần Đầu

- [ ] Server đáp ứng yêu cầu tối thiểu (2 Core, 4GB RAM, 40GB SSD)
- [ ] Node.js 22 LTS đã cài đặt (nếu dùng PM2)
- [ ] Docker + Docker Compose đã cài đặt (nếu dùng Docker)
- [ ] Tên miền đã trỏ A Record về IP server trên Cloudflare (Proxied 🟠)
- [ ] Cloudflare SSL/TLS đặt chế độ **Full (Strict)**
- [ ] Chứng chỉ Cloudflare Origin Certificate đã tạo và lưu trên server
- [ ] File `backend/.env` đã cấu hình đầy đủ:
  - [ ] `APP_URL` = domain HTTPS
  - [ ] `JWT_ACCESS_SECRET` = giá trị ngẫu nhiên (không dùng mặc định)
  - [ ] `JWT_REFRESH_SECRET` = giá trị ngẫu nhiên (không dùng mặc định)
  - [ ] `GOOGLE_DRIVE_FOLDER_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` (nếu cần backup)
- [ ] Firewall chỉ mở port 80, 443 (và 22/3389 cho quản trị)
- [ ] Nginx/Caddy đã cấu hình reverse proxy + SSL
- [ ] Ứng dụng chạy thành công, truy cập được qua domain HTTPS
- [ ] Đã đăng nhập và **đổi mật khẩu admin** mặc định
- [ ] Backup Google Drive đã kiểm tra kết nối thành công
- [ ] PM2 đã thiết lập auto-startup (Ubuntu: `pm2 startup`, Windows: `pm2-windows-startup`)
