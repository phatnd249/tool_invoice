import { Link } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function ForbiddenPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/50 p-4 text-center">
      <Card className="max-w-sm">
        <CardContent className="p-8 space-y-4">
          <ShieldX className="mx-auto size-16 text-destructive" />
          <h1 className="text-5xl font-bold text-foreground">403</h1>
          <p className="text-lg font-medium text-foreground">Access Forbidden</p>
          <p className="text-sm text-muted-foreground">
            You don't have permission to access this page. Contact your administrator if you think this is a mistake.
          </p>
          <div className="flex gap-3 justify-center">
            <Link to="/dashboard">
              <Button>Go to Dashboard</Button>
            </Link>
            <Link to={-1 as unknown as string}>
              <Button variant="outline">Go back</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
