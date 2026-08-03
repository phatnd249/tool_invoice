import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquareText, Send, Bug, Lightbulb, Wrench, Ellipsis, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { feedbackApi } from '@/api/feedback'
import { getErrorMessage } from '@/lib/apiClient'

const categories = [
  { value: 'bug', label: 'Báo lỗi', icon: Bug, description: 'Tính năng không hoạt động như mong đợi' },
  { value: 'feature', label: 'Đề xuất tính năng', icon: Lightbulb, description: 'Ý tưởng tính năng mới' },
  { value: 'improvement', label: 'Cải thiện', icon: Wrench, description: 'Góp ý để cải thiện tính năng hiện có' },
  { value: 'other', label: 'Khác', icon: Ellipsis, description: 'Góp ý khác' },
]

export function FeedbackPage() {
  const navigate = useNavigate()
  const [category, setCategory] = useState<string>('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!category || !title.trim() || !content.trim()) {
      toast.error('Vui lòng điền đầy đủ thông tin')
      return
    }

    setIsSubmitting(true)
    try {
      await feedbackApi.send({
        category,
        title: title.trim(),
        content: content.trim(),
      })
      toast.success('Cảm ơn bạn đã gửi phản hồi!')
      navigate('/dashboard')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const selectedCategory = categories.find((c) => c.value === category)

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <MessageSquareText className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Góp ý & Phản hồi</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Đóng góp ý kiến để giúp Invoice Pro ngày càng hoàn thiện hơn
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Category selection */}
        <div className="mb-6">
          <Label className="mb-3 block text-sm font-medium">Danh mục</Label>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((cat) => {
              const Icon = cat.icon
              const isSelected = category === cat.value
              return (
                <Card
                  key={cat.value}
                  size="sm"
                  className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/30 ${
                    isSelected
                      ? 'ring-2 ring-primary bg-primary/5'
                      : 'ring-1 ring-border'
                  }`}
                  onClick={() => setCategory(cat.value)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Icon className="size-4 text-muted-foreground" />
                      {cat.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-xs">
                      {cat.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Title */}
        <div className="mb-4">
          <Label htmlFor="title" className="mb-1.5 block text-sm font-medium">
            Tiêu đề
          </Label>
          <Input
            id="title"
            placeholder="Nhập tiêu đề ngắn gọn..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </div>

        {/* Content */}
        <div className="mb-6">
          <Label htmlFor="content" className="mb-1.5 block text-sm font-medium">
            Nội dung chi tiết
          </Label>
          <Textarea
            id="content"
            placeholder="Mô tả chi tiết ý kiến của bạn..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className="resize-y min-h-[120px]"
          />
        </div>

        {/* Category preview */}
        {selectedCategory && (
          <div className="flex items-center gap-2 mb-6 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <selectedCategory.icon className="size-4" />
            <span>
              Bạn đang gửi phản hồi dạng <strong>{selectedCategory.label}</strong>
            </span>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Gửi phản hồi
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Huỷ
          </Button>
        </div>
      </form>
    </div>
  )
}
