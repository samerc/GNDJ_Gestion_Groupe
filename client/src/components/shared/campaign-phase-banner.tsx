import { useDocumentCampaign } from '@/services/documents-campaign-service'
import { CalendarClock } from 'lucide-react'

// Compact banner shown to leaders (CU) on the documents matrix: the current document-verification phase +
// what it means + the relevant date, so a CU always knows whether uploads are open and what to do next.
// Renders nothing when no campaign is configured/active.

function fr(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''
}

export function CampaignPhaseBanner() {
  const { data: c } = useDocumentCampaign()
  if (!c || !c.enabled || c.phase === 'Inactive') return null

  // Phase → (label, message, tone). Keeps a single source and avoids reassignment lint.
  const info: Record<string, { label: string; message: string; tone: string }> = {
    Avant: { label: 'Avant ouverture', message: `Le dépôt des documents ouvrira le ${fr(c.depositStart)}.`, tone: 'border-sky-200 bg-sky-50 text-sky-900' },
    Depot: { label: 'Dépôt ouvert', message: `Les familles peuvent téléverser leurs documents jusqu'au ${fr(c.depositDeadline)}.`, tone: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
    Verification1: { label: 'Vérification 1', message: `Dépôt fermé — vérifiez (acceptez / refusez) chaque document. La correction rouvre le ${fr(c.correctionStart)} ; un email d'erreur partira automatiquement aux familles dès que toutes les unités ont terminé.`, tone: 'border-amber-200 bg-amber-50 text-amber-900' },
    Correction: { label: 'Correction', message: `Les familles corrigent leurs documents jusqu'au ${fr(c.correctionDeadline)}.`, tone: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
    Verification2: { label: 'Vérification 2', message: `Dépôt fermé — re-vérifiez les dossiers. Les dossiers encore incomplets seront mis en attente le ${fr(c.finalDeadline)}.`, tone: 'border-amber-200 bg-amber-50 text-amber-900' },
    Termine: { label: 'Campagne terminée', message: `La campagne de vérification des documents ${c.scoutYear ?? ''} est terminée.`, tone: 'border-slate-200 bg-slate-50 text-slate-700' },
  }
  const entry = info[c.phase]
  if (!entry) return null
  const { label, message, tone } = entry

  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${tone}`}>
      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
      <span><strong>Vérification des documents — {label}.</strong> {message}</span>
    </div>
  )
}
