import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { PERMISSIONS } from '@/lib/constants'

// Emails are written to the outbox and sent a few moments later by the background sender (they can also fail
// at the provider). So a send action must not say "envoyé": this toast says the mail is queued and, for those
// who can open it, offers a shortcut to the "File d'emails" page where delivery failures show up.
export function useEmailQueuedToast() {
  const navigate = useNavigate()
  const canSeeOutbox = useAuthStore((s) => s.hasPermission(PERMISSIONS.ASSOCIATIONS_MANAGE))

  return useCallback((message: string) => {
    toast.success(message, {
      description: "L'envoi se fait dans les minutes qui suivent.",
      action: canSeeOutbox ? { label: "File d'emails", onClick: () => navigate('/admin/email-outbox') } : undefined,
    })
  }, [canSeeOutbox, navigate])
}
