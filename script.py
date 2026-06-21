import os
import sys
import zipfile
import json
import base64
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from dotenv import load_dotenv

# Fix Unicode Encode error on Windows console
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Load configuration from .env file if available
load_dotenv()

# ==============================================================================
# CONFIG CONSTANTS
# ==============================================================================
# Automatically retrieve TOKEN from environment variable (env or .env file)
# If not configured in env, the fallback Token below will be used
TOKEN = os.getenv("TOKEN") or exit("Token not found")

# Directory for storing downloaded invoices
INVOICE_DIR = "invoices"

# ==============================================================================
# DATE UTILITIES
# ==============================================================================
def parse_date(date_str):
    """Convert a string in dd/MM/yyyy format to a date object."""
    return datetime.strptime(date_str.strip(), "%d/%m/%Y").date()

def split_date_range(start_date, end_date):
    """
    Split a date range into smaller chunks of at most 28 days (inclusive of start and end)
    to avoid the "Search period must not exceed 1 month" error from the Tax Authority
    (especially when crossing February).
    """
    chunks = []
    current_start = start_date
    while current_start <= end_date:
        # Use 27 days to create an inclusive 28-day cycle, always less than 1 month
        current_end = min(current_start + timedelta(days=27), end_date)
        chunks.append((current_start, current_end))
        current_start = current_end + timedelta(days=1)
    return chunks

# ==============================================================================
# JWT UTILITY - DECODE TOKEN TO GET TAX CODE (MST)
# ==============================================================================
def get_mst_from_token(token):
    """Decode a JWT Token to automatically retrieve the business Tax Identification Number."""
    try:
        parts = token.split('.')
        if len(parts) >= 2:
            payload_b64 = parts[1]
            # Add Base64 padding if missing
            payload_b64 += '=' * (4 - len(payload_b64) % 4)
            payload_bytes = base64.urlsafe_b64decode(payload_b64)
            payload = json.loads(payload_bytes.decode('utf-8'))
            
            # Tax code (MST) is usually in the 'username', 'mst', or 'sub' field
            mst = payload.get('username') or payload.get('mst') or payload.get('sub')
            if mst:
                return "".join([c for c in mst if c.isalnum() or c == '-'])
    except Exception:
        pass
    return None

# ==============================================================================
# STEP 1: QUERY SOLD INVOICES
# ==============================================================================
def query_invoices_in_range(start_date, end_date, token):
    """
    Query the list of sold invoices within the given date range.
    Uses a dynamic query approach to retrieve all data (automatically adjusts size = total).
    """
    start_str = start_date.strftime("%d/%m/%YT00:00:00")
    end_str = end_date.strftime("%d/%m/%YT23:59:59")
    
    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    
    # Step 1.1: Send request with size=1 to get the total number of invoices
    base_url = "https://hoadondientu.gdt.gov.vn/api/query/invoices/sold"
    url = f"{base_url}?sort=tdlap:desc&size=1&search=tdlap=ge={start_str};tdlap=le={end_str}"
    
    print(f"-> Querying invoice count from {start_date.strftime('%d/%m/%Y')} to {end_date.strftime('%d/%m/%Y')}...")
    try:
        response = requests.get(url, headers=headers, timeout=20)
    except requests.exceptions.RequestException as e:
        print(f"   [ERROR] Cannot connect to the Tax Authority server: {e}")
        return []
        
    if response.status_code == 401:
        print("   [ERROR 401] Token is invalid or expired. Please update the TOKEN constant in the script.")
        return []
    elif response.status_code != 200:
        print(f"   [HTTP ERROR {response.status_code}] Response content: {response.text}")
        return []
        
    try:
        data = response.json()
    except json.JSONDecodeError:
        print("   [ERROR] Response is not valid JSON format.")
        return []
        
    total = data.get("total", 0)
    print(f"   Found {total} invoices.")
    
    if total == 0:
        return []
        
    # Step 1.2: Send a second request with size=total to retrieve the full invoice list
    url_all = f"{base_url}?sort=tdlap:desc&size={total}&search=tdlap=ge={start_str};tdlap=le={end_str}"
    print(f"   Downloading detailed data for {total} invoices...")
    try:
        response_all = requests.get(url_all, headers=headers, timeout=30)
        if response_all.status_code == 200:
            res_data = response_all.json()
            return res_data.get("datas", [])
        else:
            print(f"   [HTTP ERROR {response_all.status_code}] Cannot download invoice list.")
            return []
    except Exception as e:
        print(f"   [ERROR] An error occurred while downloading the list: {e}")
        return []

# ==============================================================================
# STEP 2: DOWNLOAD INVOICE ZIP FROM TAX SYSTEM
# ==============================================================================
def download_invoice_zip(invoice, token, output_dir):
    """
    Send a request to export invoice XML and download the ZIP file.
    Uses mhdon to name the file. Falls back to a combination of invoice info if missing.
    """
    nbmst = invoice.get("nbmst")         # Seller's tax code
    khmshdon = invoice.get("khmshdon")   # Invoice form symbol (e.g.: 1)
    khhdon = invoice.get("khhdon")       # Invoice serial symbol (e.g.: C26TBT)
    shdon = invoice.get("shdon")         # Invoice number (e.g.: 21)
    mhdon = invoice.get("mhdon")         # Invoice code (e.g.: 00EDBB1CBFE923489F96A57F977F6028D2)
    
    # Prepare zip filename
    if mhdon:
        zip_filename = f"{mhdon}.zip"
    elif nbmst and khhdon and shdon is not None and khmshdon is not None:
        zip_filename = f"{nbmst}_{khmshdon}_{khhdon}_{shdon}.zip"
    else:
        print(f"   [WARNING] Invoice is missing information to export XML (ID: {invoice.get('id')})")
        return None
        
    zip_path = os.path.join(output_dir, zip_filename)
    
    # If the file has already been downloaded and is not empty, skip to save time
    if os.path.exists(zip_path) and os.path.getsize(zip_path) > 0:
        return zip_path
        
    export_url = f"https://hoadondientu.gdt.gov.vn/api/query/invoices/export-xml?nbmst={nbmst}&khhdon={khhdon}&shdon={shdon}&khmshdon={khmshdon}"
    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    
    try:
        response = requests.get(export_url, headers=headers, timeout=20)
        if response.status_code == 200:
            with open(zip_path, "wb") as f:
                f.write(response.content)
            return zip_path
        elif response.status_code == 401:
            print("   [ERROR] Token expired while downloading the ZIP file.")
            return None
        else:
            print(f"   [FAILED] XML export for invoice no. {shdon} serial {khhdon} failed (HTTP {response.status_code}).")
            return None
    except Exception as e:
        print(f"   [ERROR] Connection error while downloading ZIP for invoice no. {shdon}: {e}")
        return None

# ==============================================================================
# STEP 3: UNZIP & XML PARSE
# ==============================================================================
def find_xml_element(parent, tag_name):
    """Find the first child element matching tag_name, ignoring namespace."""
    if parent is None:
        return None
    for child in parent.iter():
        local_name = child.tag.split("}")[-1]
        if local_name == tag_name:
            return child
    return None

def find_all_xml_elements(parent, tag_name):
    """Find all elements matching tag_name, ignoring namespace."""
    if parent is None:
        return []
    matches = []
    for child in parent.iter():
        local_name = child.tag.split("}")[-1]
        if local_name == tag_name:
            matches.append(child)
    return matches

def get_xml_text(parent, tag_name, default=""):
    """Get the text content inside the corresponding XML tag, ignoring namespace."""
    el = find_xml_element(parent, tag_name)
    return el.text.strip() if (el is not None and el.text) else default

def get_ma_tra_cuu(dlhdon_el):
    """Find the lookup code in the TTKhac/TTin tag of DLHDon."""
    ttin_els = find_all_xml_elements(dlhdon_el, "TTin")
    for ttin in ttin_els:
        ttruong = get_xml_text(ttin, "TTruong")
        if ttruong == "MaTraCuu":
            return get_xml_text(ttin, "DLieu")
    return ""

def to_float(val):
    """Safely convert a string to float."""
    try:
        return float(val) if val else 0.0
    except ValueError:
        return 0.0

def extract_and_parse_xml(zip_path, output_dir):
    """
    Extract the XML file from the ZIP, rename it to avoid conflicts,
    then parse the XML structure to extract invoice information.
    """
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            xml_files = [name for name in z.namelist() if name.lower().endswith('.xml')]
            if not xml_files:
                print(f"   [ERROR] No XML file found in zip: {zip_path}")
                return None
            
            # Get the first XML file found
            xml_name_in_zip = xml_files[0]
            
            # Name the target XML file to match the zip filename for consistency
            base_name = os.path.splitext(os.path.basename(zip_path))[0]
            target_xml_name = f"{base_name}.xml"
            target_xml_path = os.path.join(output_dir, target_xml_name)
            
            # Extract temporarily
            z.extract(xml_name_in_zip, output_dir)
            extracted_temp_path = os.path.join(output_dir, xml_name_in_zip)
            
            # Move/rename to the root invoices directory if it was nested
            if os.path.exists(target_xml_path):
                os.remove(target_xml_path)
            os.rename(extracted_temp_path, target_xml_path)
            
            # Remove empty directories created during extraction (if zip contains subdirectories)
            temp_dir_parts = xml_name_in_zip.split('/')
            if len(temp_dir_parts) > 1:
                # Remove the empty subdirectory that was just created
                nested_dir = os.path.join(output_dir, temp_dir_parts[0])
                if os.path.exists(nested_dir) and os.path.isdir(nested_dir):
                    # Attempt to remove if directory is empty
                    try:
                        os.rmdir(nested_dir)
                    except OSError:
                        pass
    except Exception as e:
        print(f"   [ERROR] Failed to unzip {zip_path}: {e}")
        return None
        
    # Parse the XML file
    try:
        tree = ET.parse(target_xml_path)
        root = tree.getroot()
    except Exception as e:
        print(f"   [ERROR] Failed to parse XML {target_xml_path}: {e}")
        return None
        
    dlhdon_el = find_xml_element(root, "DLHDon")
    if dlhdon_el is None:
        print(f"   [WARNING] Missing <DLHDon> tag in XML file {target_xml_name}")
        return None
        
    # 1. General invoice information
    ttchung_el = find_xml_element(dlhdon_el, "TTChung")
    pban = get_xml_text(ttchung_el, "PBan")
    thdon = get_xml_text(ttchung_el, "THDon")
    khmshdon = get_xml_text(ttchung_el, "KHMSHDon")
    khhdon = get_xml_text(ttchung_el, "KHHDon")
    shdon = get_xml_text(ttchung_el, "SHDon")
    nlap = get_xml_text(ttchung_el, "NLap")
    dvtte = get_xml_text(ttchung_el, "DVTTe")
    tgia = get_xml_text(ttchung_el, "TGia")
    htttoan = get_xml_text(ttchung_el, "HTTToan")
    msttcgp = get_xml_text(ttchung_el, "MSTTCGP")
    
    # 2. Seller information
    nban_el = find_xml_element(dlhdon_el, "NBan")
    nban_ten = get_xml_text(nban_el, "Ten")
    nban_mst = get_xml_text(nban_el, "MST")
    nban_dchi = get_xml_text(nban_el, "DChi")
    nban_sdthoai = get_xml_text(nban_el, "SDThoai")
    
    # 3. Buyer information
    nmua_el = find_xml_element(dlhdon_el, "NMua")
    nmua_ten = get_xml_text(nmua_el, "Ten")
    nmua_mst = get_xml_text(nmua_el, "MST")
    nmua_dchi = get_xml_text(nmua_el, "DChi")
    nmua_mkhang = get_xml_text(nmua_el, "MKHang")
    
    # 4. Payment summary information
    ttoan_el = find_xml_element(dlhdon_el, "TToan")
    tgtcthue = get_xml_text(ttoan_el, "TgTCThue")
    tgtthue = get_xml_text(ttoan_el, "TgTThue")
    tgtttbso = get_xml_text(ttoan_el, "TgTTTBSo")
    tgtttbchu = get_xml_text(ttoan_el, "TgTTTBChu")
    
    # 5. Goods and services line item details
    items = []
    dshhdvu_el = find_xml_element(dlhdon_el, "DSHHDVu")
    if dshhdvu_el is not None:
        hhdvu_els = find_all_xml_elements(dshhdvu_el, "HHDVu")
        for hhdvu in hhdvu_els:
            stt = get_xml_text(hhdvu, "STT")
            thhdvu = get_xml_text(hhdvu, "THHDVu")
            dvtinh = get_xml_text(hhdvu, "DVTinh")
            sluong = get_xml_text(hhdvu, "SLuong")
            dgia = get_xml_text(hhdvu, "DGia")
            thtien = get_xml_text(hhdvu, "ThTien")
            tsuat = get_xml_text(hhdvu, "TSuat")
            
            items.append({
                "stt": stt,
                "thhdvu": thhdvu,
                "dvtinh": dvtinh,
                "sluong": to_float(sluong),
                "dgia": to_float(dgia),
                "thtien": to_float(thtien),
                "tsuat": tsuat
            })
            
    # 6. Tax authority code & Lookup code
    mccqt = get_xml_text(root, "MCCQT")
    matracuu = get_ma_tra_cuu(dlhdon_el)

    parsed_invoice = {
        "xml_file": target_xml_name,
        "pban": pban,
        "thdon": thdon,
        "khmshdon": khmshdon,
        "khhdon": khhdon,
        "shdon": shdon,
        "nlap": nlap,
        "dvtte": dvtte,
        "tgia": to_float(tgia),
        "htttoan": htttoan,
        "msttcgp": msttcgp,
        
        "mccqt": mccqt,
        "matracuu": matracuu,
        
        "nban_ten": nban_ten,
        "nban_mst": nban_mst,
        "nban_dchi": nban_dchi,
        "nban_sdthoai": nban_sdthoai,
        
        "nmua_ten": nmua_ten,
        "nmua_mst": nmua_mst,
        "nmua_dchi": nmua_dchi,
        "nmua_mkhang": nmua_mkhang,
        
        "tgtcthue": to_float(tgtcthue),
        "tgtthue": to_float(tgtthue),
        "tgtttbso": to_float(tgtttbso),
        "tgtttbchu": tgtttbchu,
        
        "items": items
    }
    return parsed_invoice
  # ==============================================================================
# GENERATE PREMIUM EXCEL
# ==============================================================================
def clean_sheet_name(name, shdon):
    """Clean a sheet name to avoid Excel errors (31 char limit, strip invalid characters)."""
    if not name:
        return f"HD_{shdon}"
    invalid_chars = ['\\', '/', '?', '*', '[', ']', ':']
    cleaned = "".join([c for c in name if c not in invalid_chars])
    return cleaned[:31]

def export_to_excel(invoices_data, output_path):
    """
    Export the list of invoices and goods details to an Excel (.xlsx) file.
    Uses openpyxl with a premium, professional UI style.
    Creates a Summary sheet and individual detail sheets per invoice with cross-links.
    """
    wb = Workbook()
    
    # ---------------------------------------------------------
    # DEFINE COMMON STYLES
    # ---------------------------------------------------------
    font_title = Font(name="Segoe UI", size=16, bold=True, color="1F4E78")
    font_header = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
    font_data = Font(name="Segoe UI", size=10)
    font_total = Font(name="Segoe UI", size=10, bold=True, color="1F4E78")
    
    fill_header = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
    fill_zebra = PatternFill(start_color="F9FBFD", end_color="F9FBFD", fill_type="solid")
    fill_total = PatternFill(start_color="EAF2F8", end_color="EAF2F8", fill_type="solid")
    
    align_center = Alignment(horizontal="center", vertical="center")
    align_right = Alignment(horizontal="right", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")
    align_wrap = Alignment(horizontal="left", vertical="center", wrap_text=True)
    align_header = Alignment(horizontal="center", vertical="center", wrap_text=True)
    
    border_thin = Border(
        left=Side(style="thin", color="D9D9D9"),
        right=Side(style="thin", color="D9D9D9"),
        top=Side(style="thin", color="D9D9D9"),
        bottom=Side(style="thin", color="D9D9D9")
    )
    
    border_total = Border(
        left=Side(style="thin", color="D9D9D9"),
        right=Side(style="thin", color="D9D9D9"),
        top=Side(style="thin", color="1F4E78"),
        bottom=Side(style="double", color="1F4E78") # Accounting double underline at the bottom
    )
    
    # ---------------------------------------------------------
    # SHEET 1: INVOICE OVERVIEW
    # ---------------------------------------------------------
    ws_summary = wb.active
    ws_summary.title = "TongQuan_HoaDon"
    ws_summary.views.sheetView[0].showGridLines = True
    
    # Sheet 1 title
    ws_summary.merge_cells("A1:N1")
    ws_summary["A1"] = "BẢNG TỔNG HỢP HÓA ĐƠN ĐIỆN TỬ BÁN RA"
    ws_summary["A1"].font = font_title
    ws_summary["A1"].alignment = align_center
    ws_summary.row_dimensions[1].height = 40
    
    ws_summary["A2"] = f"Ngày xuất báo cáo: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"
    ws_summary["A2"].font = Font(name="Segoe UI", size=9, italic=True)
    ws_summary.row_dimensions[2].height = 20
    
    headers_summary = [
        "STT", "Số Hóa Đơn", "Ngày Lập", "Mã Tra Cứu", "Mã CQ Thuế (MCCQT)",
        "MST Người Mua", "Tên Người Mua", "Tiền Trước Thuế", "Tiền Thuế",
        "Tổng Cộng Thanh Toán", "Hình Thức TT", "Tiền Bằng Chữ",
        "Chi Tiết Hàng Hóa", "Tên Tệp XML"
    ]
    
    ws_summary.row_dimensions[3].height = 28
    for col_idx, h_text in enumerate(headers_summary, start=1):
        cell = ws_summary.cell(row=3, column=col_idx, value=h_text)
        cell.font = font_header
        cell.fill = fill_header
        cell.alignment = align_header
        cell.border = border_thin
        
    row_num = 4
    for idx, inv in enumerate(invoices_data, start=1):
        ws_summary.row_dimensions[row_num].height = 22
        
        # Write data cells
        c1 = ws_summary.cell(row=row_num, column=1, value=idx)                # STT
        
        # Invoice number as integer for formatting
        try:
            shdon_val = int(inv["shdon"])
        except ValueError:
            shdon_val = inv["shdon"]
        c2 = ws_summary.cell(row=row_num, column=2, value=shdon_val)           # Invoice Number
        
        c3 = ws_summary.cell(row=row_num, column=3, value=inv["nlap"])         # Date Issued
        c4 = ws_summary.cell(row=row_num, column=4, value=inv["matracuu"])     # Lookup Code
        c5 = ws_summary.cell(row=row_num, column=5, value=inv["mccqt"])        # Tax Authority Code (MCCQT)
        c6 = ws_summary.cell(row=row_num, column=6, value=inv["nmua_mst"])     # Buyer Tax Code
        c7 = ws_summary.cell(row=row_num, column=7, value=inv["nmua_ten"])     # Buyer Name
        c8 = ws_summary.cell(row=row_num, column=8, value=inv["tgtcthue"])     # Pre-tax Amount
        c9 = ws_summary.cell(row=row_num, column=9, value=inv["tgtthue"])      # Tax Amount
        c10 = ws_summary.cell(row=row_num, column=10, value=inv["tgtttbso"])   # Total Payment Amount
        c11 = ws_summary.cell(row=row_num, column=11, value=inv["htttoan"])    # Payment Method
        c12 = ws_summary.cell(row=row_num, column=12, value=inv["tgtttbchu"])  # Amount in Words
        
        # Detail link - hyperlink to child sheet
        sheet_con_name = clean_sheet_name(inv["matracuu"], inv["shdon"])
        c13 = ws_summary.cell(row=row_num, column=13, value="Xem chi tiết")
        c13.hyperlink = f"#'{sheet_con_name}'!A1"
        c13.font = Font(name="Segoe UI", size=10, color="0563C1", underline="single")
        
        c14 = ws_summary.cell(row=row_num, column=14, value=inv["xml_file"])   # XML Filename
        
        # Apply alignment and formatting
        for cell in [c1, c3, c4, c5, c6, c11, c13]:
            cell.alignment = align_center
        c2.alignment = align_center
        c2.number_format = '00000000' # Invoice number displayed as 8 digits
        
        for cell in [c7, c12, c14]:
            cell.alignment = align_wrap
            
        for cell in [c8, c9, c10]:
            cell.alignment = align_right
            cell.number_format = '#,##0' # Currency with thousands separator
            
        # Borders & Font & Zebra striping
        is_even = (row_num % 2 == 0)
        for col in range(1, 15):
            cell = ws_summary.cell(row=row_num, column=col)
            # Only apply data font if not the hyperlink column (column 13)
            if col != 13:
                cell.font = font_data
            cell.border = border_thin
            if is_even:
                cell.fill = fill_zebra
                
        row_num += 1
        
    # TOTAL row for Sheet 1
    total_row = row_num
    ws_summary.row_dimensions[total_row].height = 24
    
    # Merge A to G for TOTAL label
    ws_summary.merge_cells(start_row=total_row, start_column=1, end_row=total_row, end_column=7)
    total_label_cell = ws_summary.cell(row=total_row, column=1, value="TỔNG CỘNG")
    total_label_cell.font = font_total
    total_label_cell.alignment = Alignment(horizontal="right", vertical="center")
    
    # Fill in Excel SUM formulas
    c_tot8 = ws_summary.cell(row=total_row, column=8, value=f"=SUM(H4:H{total_row-1})")
    c_tot9 = ws_summary.cell(row=total_row, column=9, value=f"=SUM(I4:I{total_row-1})")
    c_tot10 = ws_summary.cell(row=total_row, column=10, value=f"=SUM(J4:J{total_row-1})")
    
    for cell in [c_tot8, c_tot9, c_tot10]:
        cell.font = font_total
        cell.alignment = align_right
        cell.number_format = '#,##0'
        
    # Apply total border style to the entire row
    for col in range(1, 15):
        cell = ws_summary.cell(row=total_row, column=col)
        cell.border = border_total
        cell.fill = fill_total

    # ---------------------------------------------------------
    # CREATE DETAIL CHILD SHEETS FOR EACH INVOICE
    # ---------------------------------------------------------
    for inv in invoices_data:
        sheet_con_name = clean_sheet_name(inv["matracuu"], inv["shdon"])
        ws_sub = wb.create_sheet(title=sheet_con_name)
        ws_sub.views.sheetView[0].showGridLines = True
        
        # 1. Child sheet main title
        ws_sub.merge_cells("A1:G1")
        ws_sub["A1"] = f"CHI TIẾT HÀNG HÓA DỊCH VỤ HÓA ĐƠN SỐ {inv['s 5
        ws_sub.row_dimensions[5].height = 10
        
        # 6. Detail table header on row 6
        headers_sub = [
            "STT", "Tên Hàng Hóa, Dịch Vụ", "Đơn Vị Tính", "Số Lượng", 
            "Đơn Giá", "Thành Tiền (Chưa Thuế)", "Thuế Suất"
        ]
        
        ws_sub.row_dimensions[6].height = 26
        for col_idx, h_text in enumerate(headers_sub, start=1):
            cell = ws_sub.cell(row=6, column=col_idx, value=h_text)
            cell.font = font_header
            cell.fill = fill_header
            cell.alignment = align_header
            cell.border = border_thin
            
        # 7. Write invoice line items starting from row 7
        sub_row = 7
        for item in inv["items"]:
            ws_sub.row_dimensions[sub_row].height = 22
            
            sc1 = ws_sub.cell(row=sub_row, column=1, value=item["stt"])
            sc2 = ws_sub.cell(row=sub_row, column=2, value=item["thhdvu"])
            sc3 = ws_sub.cell(row=sub_row, column=3, value=item["dvtinh"])
            sc4 = ws_sub.cell(row=sub_row, column=4, value=item["sluong"])
            sc5 = ws_sub.cell(row=sub_row, column=5, value=item["dgia"])
            sc6 = ws_sub.cell(row=sub_row, column=6, value=item["thtien"])
            sc7 = ws_sub.cell(row=sub_row, column=7, value=item["tsuat"])
            
            # Alignment
            sc1.alignment = align_center
            sc2.alignment = align_wrap
            sc3.alignment = align_center
            
            sc4.alignment = align_right
            sc4.number_format = '#,##0.00'
            
            sc5.alignment = align_right
            sc5.number_format = '#,##0'
            
            sc6.alignment = align_right
            sc6.number_format = '#,##0'
            
            sc7.alignment = align_center
            
            # Borders & Zebra striping
            is_sub_even = (sub_row % 2 == 0)
            for col in range(1, 8):
                cell = ws_sub.cell(row=sub_row, column=col)
                cell.font = font_data
                cell.border = border_thin
                if is_sub_even:
                    cell.fill = fill_zebra
                    
            sub_row += 1
            
        # 8. Total row for child table
        total_sub_row = sub_row
        ws_sub.row_dimensions[total_sub_row].height = 24
        
        ws_sub.merge_cells(start_row=total_sub_row, start_column=1, end_row=total_sub_row, end_column=5)
        total_sub_label = ws_sub.cell(row=total_sub_row, column=1, value="TỔNG CỘNG CHI TIẾT THÀNH TIỀN")
        total_sub_label.font = font_total
        total_sub_label.alignment = Alignment(horizontal="right", vertical="center")
        
        c_sub_tot = ws_sub.cell(row=total_sub_row, column=6, value=f"=SUM(F7:F{total_sub_row-1})")
        c_sub_tot.font = font_total
        c_sub_tot.alignment = align_right
        c_sub_tot.number_format = '#,##0'
        
        for col in range(1, 8):
            cell = ws_sub.cell(row=total_sub_row, column=col)
            cell.border = border_total
            cell.fill = fill_total

    # ---------------------------------------------------------
    # AUTO-FIT COLUMN WIDTHS
    # ---------------------------------------------------------
    for ws in wb.worksheets:
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            
            # Calculate the maximum content length across all cells in the column
            for cell in col:
                # Skip t"-> Successfully exported Excel file: {output_path}")

# ==============================================================================
# MAIN EXECUTION FLOW
# ==============================================================================
def main():
    print("=========================================================")
    print(" SCRIPT TỰ ĐỘNG TẢI HÓA ĐƠN ĐIỆN TỬ & CHIẾT XUẤT EXCEL ")
    print("=========================================================")
    
    # 1. Validate Token configuration
    global TOKEN
    if not TOKEN or TOKEN == "YOUR_TOKEN_HERE":
        print("[ERROR] You have not filled in the login TOKEN in the code file. Please open the file and enter the Token.")
        sys.exit(1)
        
    # Automatically retrieve MST from Token as the default tax code
    token_mst = get_mst_from_token(TOKEN)
    if token_mst:
        print(f"[*] Automatically detected your business tax code (MST) from Token: {token_mst}")
    else:
        print("[*] Unable to read MST from Token. Will determine based on downloaded invoices.")

    # 2. Input the date range to query
    print("\n[Step 1] Enter the date range for invoice query:")
    while True:
        try:
            start_date_str = input(" - Enter start date (dd/MM/yyyy): ").strip()
            start_date = parse_date(start_date_str)
            break
        except ValueError:
            print("   Invalid start date format. Please try again (e.g.: 09/05/2026).")
            
    while True:
        try:
            today_str = datetime.now().strftime("%d/%m/%Y")
            end_date_str = input(f" - Enter end date (dd/MM/yyyy) [Default: {today_str}]: ").strip()
            if not end_date_str:
                end_date = datetime.now().date()
            else:
                end_date = parse_date(end_date_str)
            if end_date < start_date:
                print("   End date must be greater than or equal to start date. Please try again.")
                continue
            break
        except ValueError:
            print("   Invalid end date format. Please try again.")

    # Create the invoices directory for downloaded files
    os.makedirs(INVOICE_DIR, exist_ok=True)

    # 3. Split the date range into chunks of max 30 days per request
    date_chunks = split_date_range(start_date, end_date)
    print(f"\n[*] The date range is split into {len(date_chunks)} query cycles (max 30 days/cycle):")
    for idx, (s, e) in enumerate(date_chunks, start=1):
        print(f"  Cycle {idx}: From {s.strftime('%d/%m/%Y')} to {e.strftime('%d/%m/%Y')}")

    # Accumulate all retrieved invoices
    all_invoices = []
    
    # Execute invoice list queries
    print("\n[Step 2] Querying invoice list from Tax Authority...")
    for idx, (s, e) in enumerate(date_chunks, start=1):
        print(f"\n--- Processing cycle {idx}/{len(date_chunks)} ---")
        chunk_invoices = query_invoices_in_range(s, e, TOKEN)
        all_invoices.extend(chunk_invoices)
        
    print(f"\n[*] Total sold invoices found: {len(all_invoices)}")
    if not all_invoices:
        print("[!] No invoices found in the selected date range. Script terminated.")
        sys.exit(0)

    # 4. Download invoice ZIP files & extract XML data
    print("\n[Step 3] Downloading ZIP files and extracting detailed XML invoice data...")
    parsed_invoices = []
    success_count = 0
    
    for idx, inv in enumerate(all_invoices, start=1):
        shdon = inv.get("shdon")
        khhdon = inv.get("khhdon")
        print(f"({idx}/{len(all_invoices)}) Processing invoice no. {shdoOWN"

    # Excel filename format: MST_StartDate_EndDate.xlsx
    # Use hyphens in StartDate and EndDate for clarity and file system safety
    start_format = start_date.strftime("%d-%m-%Y")
    end_format = end_date.strftime("%d-%m-%Y")
    excel_filename = f"{final_mst}_{start_format}_{end_format}.xlsx"
    excel_path = os.path.join(excel_filename)

    # 6. Export to Excel file
    print("\n[Step 4] Writing Excel file...")
    export_to_excel(parsed_invoices, excel_path)
    
    print("\n=========================================================")
    print("   FINISHED!")
    print(f"   - All invoices saved in directory: ./{INVOICE_DIR}/")
    print(f"   - Excel report file: ./{excel_filename}")
    print("=========================================================")

if __name__ == "__main__":
    main()
