import { AlertTriangle } from 'lucide-react'
import { useSettingValue } from '@/services/settings-service'

// Launch guardrail for the bulk email-sending pages (Envoyer les accès, Message aux chefs, Relance documents).
// When `email.override_recipient` is set, EmailService REDIRECTS every outgoing email to that one test address —
// so a mass send *looks* successful (counts + "envoyé") but no real recipient gets anything. Before go-live this
// silently swallows leader activation links / reminders. This banner makes the test mode impossible to miss.
// Reads the setting via GET /settings/{key} (auth-only, so a CG can see it); the test address itself is not shown.
export function EmailDeliveryWarning() {
  const override = useSettingValue('email.override_recipient')
  if (!override || !override.trim()) return null
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div>
        <p className="font-semibold">Emails en mode test</p>
        <p className="mt-0.5 text-amber-800">
          Tous les emails sont actuellement redirigés vers une adresse de test — les destinataires ne recevront
          rien. Faites vider ce réglage (Paramètres → Email &amp; contact → « Redirection de test ») par un
          super-administrateur avant tout envoi réel.
        </p>
      </div>
    </div>
  )
}
