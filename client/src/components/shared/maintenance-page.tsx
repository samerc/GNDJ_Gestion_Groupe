import { Wrench } from 'lucide-react'

// Full-screen "Sous maintenance" page shown when a module (or the whole site) is turned off from settings.
export function MaintenancePage({ message }: { message?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Wrench className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold">Sous maintenance</h1>
      <p className="max-w-md text-muted-foreground">
        {message || 'Cette partie du site est momentanément en maintenance. Merci de réessayer plus tard.'}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        Réessayer
      </button>
    </div>
  )
}
