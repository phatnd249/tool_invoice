import { useState } from 'react';
import axios from 'axios';
import { Search, Hash, MapPin, Info, User, Phone, Calendar, Users, Building, Loader2, AlertCircle, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { API_BASE_URL } from '../config';

interface TaxInfo {
  name: string;
  taxCode: string;
  taxAddress: string;
  address: string;
  status: string;
  representative: string;
  representativeExtra: string | null;
  phone: string;
  activeDate: string;
  managedBy: string;
  type: string;
}

export default function TaxLookup() {
  const [taxCode, setTaxCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taxInfo, setTaxInfo] = useState<TaxInfo | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taxCode.trim()) return;

    setLoading(true);
    setError(null);
    setTaxInfo(null);

    try {
      const response = await axios.get(`${API_BASE_URL}/api/masothue/${taxCode.trim()}`);
      setTaxInfo(response.data);
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError('Không thể kết nối đến máy chủ. Vui lòng thử lại sau.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-6 w-6" />
              Tra Cứu Mã Số Thuế
            </CardTitle>
            <CardDescription>
              Tra cứu thông tin doanh nghiệp nhanh chóng và chính xác từ masothue.com
            </CardDescription>
          </div>
          <form onSubmit={handleSearch} className="flex w-full md:w-auto">
            <Input
              type="text"
              value={taxCode}
              onChange={(e) => setTaxCode(e.target.value)}
              placeholder="Nhập mã số thuế..."
              className="rounded-r-none w-full md:w-80"
            />
            <Button
              type="submit"
              disabled={loading || !taxCode.trim()}
              className="rounded-l-none min-w-[120px]"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Tìm kiếm
            </Button>
          </form>
        </CardHeader>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {taxInfo && (
        <Card>
          <CardHeader className="bg-muted/30">
            <CardTitle className="flex items-center gap-2 uppercase tracking-wide">
              <Building2 className="h-5 w-5" />
              {taxInfo.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            <InfoRow icon={<Hash className="h-4 w-4" />} label="Mã số thuế" value={taxInfo.taxCode} />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Địa chỉ Thuế" value={taxInfo.taxAddress} />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Địa chỉ" value={taxInfo.address} />
            <InfoRow icon={<Info className="h-4 w-4" />} label="Tình trạng" value={<Badge variant="outline">{taxInfo.status}</Badge>} />
            <InfoRow icon={<User className="h-4 w-4" />} label="Người đại diện">
              <div>
                <span className="font-medium">{taxInfo.representative}</span>
                {taxInfo.representativeExtra && (
                  <p className="text-sm text-muted-foreground mt-1 italic">
                    Ngoài ra, {taxInfo.representative} còn đại diện các doanh nghiệp, đơn vị:
                  </p>
                )}
              </div>
            </InfoRow>
            <InfoRow icon={<Phone className="h-4 w-4" />} label="Điện thoại" value={taxInfo.phone} />
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Ngày hoạt động" value={taxInfo.activeDate} />
            <InfoRow icon={<Users className="h-4 w-4" />} label="Quản lý bởi" value={taxInfo.managedBy} />
            <InfoRow icon={<Building className="h-4 w-4" />} label="Loại hình DN" value={taxInfo.type} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value, children }: { icon: React.ReactNode; label: string; value?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 p-4 md:p-5 hover:bg-muted/30 transition-colors">
      <div className="font-semibold flex items-center gap-3 mb-1 md:mb-0">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </div>
      <div className="md:col-span-3 text-muted-foreground">
        {value || children}
      </div>
    </div>
  );
}
