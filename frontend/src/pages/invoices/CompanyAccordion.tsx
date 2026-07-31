import { useState } from 'react'
import {
  Building2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Phone,
  User,
  Activity,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InvoiceDownloadForm } from './InvoiceDownloadForm'
import type { Company, DownloadResult } from '@/types'

interface CompanyAccordionProps {
  company: Company
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{value}</span>
    </div>
  )
}

export function CompanyAccordion({ company }: CompanyAccordionProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="transition-all">
      {/* Header (clickable) */}
      <CardHeader
        className="cursor-pointer hover:bg-muted/20 flex flex-row items-center gap-3 py-3.5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <CardTitle className="text-sm truncate">{company.name}</CardTitle>
          <CardDescription className="text-xs">
            MST: {company.taxCode}
            {company.downloadCount > 0 && (
              <span className="ml-2 text-muted-foreground/60">
                • {company.downloadCount.toLocaleString('vi-VN')} lượt tải
              </span>
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={company.loginMode === 'AUTO' ? 'default' : 'secondary'} className="text-xs">
            {company.loginMode === 'AUTO' ? 'Tự động' : 'Thủ công'}
          </Badge>
          {expanded ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {/* Body (expandable) */}
      {expanded && (
        <CardContent className="border-t pt-4 pb-4 space-y-4">
          {/* Company info summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <InfoRow icon={MapPin} label="Địa chỉ" value={company.address} />
            <InfoRow icon={Phone} label="Điện thoại" value={company.phone} />
            <InfoRow icon={User} label="Đại diện" value={company.representative} />
            <InfoRow icon={Activity} label="Tình trạng" value={company.status} />
          </div>

          <Separator />

          {/* Download form */}
          <InvoiceDownloadForm
            company={company}
            onDownloaded={(result: DownloadResult) => {
              // silently track
            }}
          />
        </CardContent>
      )}
    </Card>
  )
}
