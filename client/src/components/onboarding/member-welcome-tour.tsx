import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { Hand, FileText, UserRound, SunMoon, Users, ArrowRight, ChevronLeft, Smartphone } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { useMarkOnboardingSeen, useSwitchAccounts } from '@/services/my-profile-service'
import { useIsRegularMember } from '@/lib/use-is-manager'
import { useOnboardingTour } from '@/stores/onboarding-store'
import { useContactReviewStore } from '@/stores/contact-review-store'
import { useInstallGuide } from '@/hooks/use-install-guide'
import { usePwaEnabled } from '@/hooks/use-pwa-audience'
import { PwaInstallGuide } from '@/components/shared/pwa-install'

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
  install?: boolean // renders the device-specific install guide instead of the plain body
}

const STEPS: Step[] = [
  {
    icon: Hand,
    title: 'Bienvenue dans votre espace 👋',
    body: "Ici, vous pouvez consulter vos informations, envoyer vos documents et voir le trombinoscope de votre unité une fois qu'il sera publié. Voici l'essentiel en quelques étapes.",
  },
  {
    icon: FileText,
    title: 'Envoyez vos documents',
    body: "La rubrique « Mes documents » sert à envoyer les documents requis pour la réinscription (autorisations, fiche médicale, carte d'identité). Vous les téléversez et vous suivez leur validation.",
    cta: { label: 'Aller à Mes documents', to: '/my-documents' },
  },
  {
    icon: UserRound,
    title: 'Gardez vos infos à jour',
    body: "Dans « Ma fiche », vérifiez et mettez à jour vos informations personnelles et vos coordonnées. De même, vous pourrez mettre à jour vos informations scoutes (badges, étapes scoutes…).",
  },
  {
    icon: SunMoon,
    title: 'Vos réglages',
    body: "En haut à droite, cliquez sur votre nom (ou votre photo) pour ouvrir votre menu. Vous pouvez y changer votre mot de passe, choisir l'affichage Clair, Sombre ou Automatique (selon votre téléphone), et vous déconnecter.",
  },
]

// Shown ONLY to a member who has confirmed brother(s)/sister(s) in the group (added after "Vos réglages",
// since switching lives in that same account menu). Tells the parent they can hop between their children.
const SIBLING_STEP: Step = {
  icon: Users,
  title: 'Passer d’un enfant à l’autre',
  body: "Vous avez plusieurs enfants au groupe ? Depuis votre menu (en haut à droite), « Changer de compte » vous permet de basculer vers le compte d’un frère ou d’une sœur. La première fois, le mot de passe de ce compte est demandé ; ensuite, sur cet appareil, le changement est instantané.",
}

// Shown only when the app isn't already installed AND the browser supports it — the body is replaced by the
// device-specific install steps (getInstallGuide), so an iPhone user sees the Safari steps, Android/desktop a
// button, etc.
const INSTALL_STEP: Step = {
  icon: Smartphone,
  title: "Installez l'application",
  body: "Ajoutez GNDJ à votre écran d'accueil pour y accéder en un geste, comme une vraie application.",
  install: true,
}

export function MemberWelcomeTour() {
  const user = useAuthStore((s) => s.user)
  const markSeen = useMarkOnboardingSeen()
  const navigate = useNavigate()
  const isRegularMember = useIsRegularMember()
  const replay = useOnboardingTour((s) => s.replay)
  const closeReplay = useOnboardingTour((s) => s.close)
  const [step, setStep] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  // Add the account-switch step only for a member who actually has confirmed siblings (else it's noise).
  const { data: siblings } = useSwitchAccounts(isRegularMember && !!user?.memberId)
  // Add the install step only when the app isn't already installed AND this browser can install it — and only
  // while the PWA is enabled for this user (pilot: maîtrise only, so regular members don't see it yet).
  const installGuide = useInstallGuide()
  const pwaEnabled = usePwaEnabled()
  const showInstall = pwaEnabled && installGuide.supported && !installGuide.installed
  const steps = useMemo(() => {
    const base = siblings && siblings.length > 0 ? [...STEPS, SIBLING_STEP] : [...STEPS]
    return showInstall ? [...base, INSTALL_STEP] : base
  }, [siblings, showInstall])

  // Shows automatically to a regular member who hasn't seen it, OR whenever they hit "Revoir le tutoriel"
  // (replay overrides the once-per-member flag). Chefs/admins are excluded (isRegularMember is false, and the
  // menu entry that sets replay is gated the same way).
  // Manual replay ("Revoir le tutoriel") always shows. The AUTO first-login showing waits only while the
  // contact-review popup is actually ON SCREEN (pending AND not yet deferred this session) so the two never
  // stack — then it appears whether the member CONFIRMED the review (needsContactReview flips) OR deferred it
  // with "Plus tard" (reviewSkipped). The two are otherwise independent.
  const reviewSkipped = useContactReviewStore((s) => s.skipped)
  const reviewOnScreen = !!user?.needsContactReview && !reviewSkipped
  const show = replay || (isRegularMember && !user?.hasSeenOnboarding && !dismissed && !reviewOnScreen)

  // Any dismissal (skip / finish / CTA / outside-click) closes the tour. On the FIRST viewing it marks it seen
  // (optimistic: flip the cached flag immediately; the server call is best-effort). A replay of an already-seen
  // member skips the mark. Reset the step so the next open starts at the beginning.
  const finish = (goTo?: string) => {
    if (!user?.hasSeenOnboarding) {
      markSeen.mutate()
      useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, hasSeenOnboarding: true } : s.user }))
    }
    setDismissed(true)
    setStep(0)
    closeReplay()
    if (goTo) navigate(goTo)
  }

  if (!show) return null

  const current = steps[Math.min(step, steps.length - 1)]
  const Icon = current.icon
  const isLast = step === steps.length - 1

  return (
    <Dialog open onOpenChange={(o) => { if (!o) finish() }}>
      <DialogContent className="max-w-md">
        <div className="flex flex-col items-center px-2 pt-2 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-elevated">
            <Icon className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">{current.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{current.body}</p>

          {/* Install slide: device-specific steps + a native button when available (getInstallGuide). */}
          {current.install && (
            <div className="mt-4 w-full rounded-lg border bg-muted/30 p-3">
              <PwaInstallGuide guide={installGuide} onDone={() => finish()} />
            </div>
          )}

          {current.cta && (
            <Button className="mt-4" onClick={() => finish(current.cta!.to)}>
              {current.cta.label}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}

          {/* progress dots */}
          <div className="mt-5 flex items-center gap-1.5">
            {steps.map((_, i) => (
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
