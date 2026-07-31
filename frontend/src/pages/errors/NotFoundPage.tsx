import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/50 p-4 text-center">
      <Card className="max-w-sm">
        <CardContent className="p-8 space-y-4">
          <SearchX className="mx-auto size-16 text-muted-foreground" />
          <h1 className="text-5xl font-bold text-foreground">404</h1>
          <p className="text-lg font-medium text-foreground">Page not found</p>
          <p className="text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="flex justify-center">
            <Link to="/dashboard">
              <Button>Go to Dashboard</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
