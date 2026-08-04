import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LoadingButtonProps {
  loading?: boolean
  disabled?: boolean
  children?: ReactNode
  className?: string
  variant?: string
  size?: string
  type?: 'button' | 'submit' | 'reset'
  onClick?: () => void
}

export function LoadingButton({
  loading,
  disabled,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      disabled={disabled || loading}
      {...(props as React.ComponentProps<typeof Button>)}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  )
}
