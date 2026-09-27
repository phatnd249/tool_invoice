# Hướng Dẫn Triển Khai Hệ Thống Tool-Invoice Lên Server Thật (Production)

Tài liệu này hướng dẫn chi tiết từng bước triển khai hệ thống **Invoice Pro (tool-invoice)** lên máy chủ thật (Production Server), bao gồm cấu hình tên miền, bảo mật **HTTPS SSL thông qua Cloudflare** (hạn 15 năm, không cần gia hạn định kỳ) hoặc Let's Encrypt Certbot, hỗ trợ cả **Ubuntu Server (Linux)** và **Windows Server**.

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
* `JWT_ACCESS_SECRET` và `JWT_REFRESH_SECRET`: Tạo bằng lệnh `openssl rand -hex 32`
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
# 1. Cài đặt Node.js 22 LTS & PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
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
