import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Hand, FileText, UserRound, ArrowRight, ChevronLeft } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { useMarkOnboardingSeen } from '@/services/my-profile-service'

// First-login welcome tour for REGULAR MEMBERS (youth / parents) — a short, mobile-friendly carousel that
// orients them instead of a DOM-spotlight tour (which breaks when the member nav is behind the hamburger).
// Shown once, gated by a SERVER flag (MeResponse.hasSeenOnboarding) so it doesn't re-appear on another device.
// Chefs (CU/ACU/CG/ACG) and super-admins are EXCLUDED — they get the printed guide instead.
// Self-gating: mounted unconditionally in AppLayout (after the password/contact gates), decides internally.

interface Step {
  icon: typeof Hand
  title: string
  body: string
  cta?: { label: string; to: string }
}

const STEPS: Step[] = [
  {
    icon: Hand,
    title: 'Bienvenue dans votre espace 👋',
    body: "Ici, vous pouvez consulter vos informations, envoyer vos documents et voir le trombinoscope de votre unité. Voici l'essentiel en 3 étapes.",
  },
  {
    icon: FileText,
    title: 'Envoyez vos documents',
    body: 'La maîtrise vous demande quelques documents (autorisations, fiche médicale…). Dans « Mes documents », vous les téléversez et vous suivez leur validation.',
    cta: { label: 'Aller à Mes documents', to: '/my-documents' },
  },
  {
    icon: UserRound,
    title: 'Gardez vos infos à jour',
    body: "Dans « Ma fiche », vérifiez votre école, votre classe et vos coordonnées. Pour changer votre mot de passe ou vous déconnecter, utilisez le menu en haut à droite (votre nom).",
  },
]

export function MemberWelcomeTour() {
  const user = useAuthStore((s) => s.user)
  const markSeen = useMarkOnboardingSeen()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  // A regular member = not a super-admin and not a leader of any kind (a CU/ACU has an isLeader role; a CG/ACG
  // has an isGroupLevel role). Chefs d'équipe (leadsTeam, no isLeader role) are still members → they see it.
  const isRegularMember = !!user && !user.isSuperAdmin && !(user.unitAccess ?? []).some((u) => u.isLeader || u.isGroupLevel)
  const show = isRegularMember && !user?.hasSeenOnboarding && !dismissed

  // Any dismissal (skip / finish / CTA / outside-click) marks it seen so it never re-appears. Optimistic: hide
  // locally + flip the cached user flag immediately; the server call is best-effort (a failure just means it may
  // re-show on the next login, which is acceptable).
  const finish = (goTo?: string) => {
    setDismissed(true)
    markSeen.mutate()
    useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, hasSeenOnboarding: true } : s.user }))
    if (goTo) navigate(goTo)
  }

  if (!show) return null

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  return (
    <Dialog open onOpenChange={(o) => { if (!o) finish() }}>
      <DialogContent className="max-w-md">
        <div className="flex flex-col items-center px-2 pt-2 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-elevated">
            <Icon className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">{current.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.body}</p>

          {current.cta && (
            <Button className="mt-4" onClick={() => finish(current.cta!.to)}>
              {current.cta.label}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}

          {/* progress dots */}
          <div className="mt-5 flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`}
              />
            ))}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" />Précédent
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => finish()}>Passer</Button>
          )}

          {isLast ? (
            <Button size="sm" onClick={() => finish()}>Terminer</Button>
          ) : (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>Suivant</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
