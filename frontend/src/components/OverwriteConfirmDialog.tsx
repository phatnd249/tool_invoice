import { AlertTriangle, Copy, FileDown, SkipForward } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';

export type OverwriteMode = 'OVERWRITE' | 'NEW_VERSION' | 'SKIP';

interface OverwriteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  startDate: string;
  endDate: string;
  existingCount: number;
  onConfirm: (mode: OverwriteMode) => void;
}

const OPTIONS: Array<{
  value: OverwriteMode;
  icon: React.ReactNode;
  label: string;
  description: string;
}> = [
  {
    value: 'OVERWRITE',
    icon: <FileDown className="w-5 h-5 text-orange-500" />,
    label: 'Ghi đè',
    description:
      'Xoá các file hoá đơn cũ và tải lại file mới.',
  },
  {
    value: 'NEW_VERSION',
    icon: <Copy className="w-5 h-5 text-blue-500" />,
    label: 'Tạo bản sao',
    description:
      'Tải hoá đơn mới với số phiên bản (v1, v2, ...) trong tên file.',
  },
  {
    value: 'SKIP',
    icon: (
      <SkipForward className="w-5 h-5 text-muted-foreground" />
    ),
    label: 'Bỏ qua',
    description:
      'Giữ nguyên các hoá đơn đã tải trước đó, không tải lại.',
  },
];

export default function OverwriteConfirmDialog({
  open,
  onOpenChange,
  companyName,
  startDate,
  endDate,
  existingCount,
  onConfirm,
}: OverwriteConfirmDialogProps) {
  const [selected, setSelected] = useState<OverwriteMode | null>(
    null,
  );

  const handleConfirm = () => {
    if (!selected) return;
    onConfirm(selected);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelected(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <DialogTitle>Hoá đơn đã tồn tại</DialogTitle>
              <DialogDescription className="mt-1">
                Doanh nghiệp <strong>{companyName}</strong> đã có{' '}
                <strong>{existingCount} hoá đơn</strong> được tải
                trong khoảng thời gian từ{' '}
                <strong>{startDate}</strong> đến{' '}
                <strong>{endDate}</strong>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <div className="space-y-3 py-2">
          <Label className="text-sm font-medium">
            Bạn muốn xử lý thế nào?
          </Label>

          <div className="space-y-2">
            {OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelected(option.value)}
                className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  selected === option.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {option.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {option.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {option.description}
                  </p>
                </div>
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    selected === option.value
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground'
                  }`}
                >
                  {selected === option.value && (
                    <div className="h-2 w-2 rounded-full bg-white" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Huỷ
          </Button>
          <Button onClick={handleConfirm} disabled={!selected}>
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
