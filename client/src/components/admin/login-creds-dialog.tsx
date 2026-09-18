// Shows the result of creating logins: how many got an activation email, and the credentials of the no-email
// members for the CG to relay by hand (WhatsApp/paper). Used by the "Comptes manquants" page and the inline
// "créer les comptes manquants" action in "Envoyer les accès".
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/shared/copy-button'

export interface LoginCred {
  memberName: string
  username: string
  temporaryPassword: string
}

export function LoginCredsDialog({
  open, onOpenChange, emailSent, creds, alreadyHad = 0,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  emailSent: number
  creds: LoginCred[]
  alreadyHad?: number
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Comptes créés</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          {emailSent > 0 && (
            <p className="text-emerald-700 dark:text-emerald-300">
              {emailSent} membre(s) ont reçu un email d'activation (un lien pour choisir leur mot de passe).
            </p>
          )}
          {alreadyHad > 0 && <p className="text-muted-foreground">{alreadyHad} avai(en)t déjà un compte (ignoré).</p>}

          {creds.length > 0 && (
            <div>
              <p className="mb-2 text-amber-700 dark:text-amber-300">
                {creds.length} membre(s) sans email — communiquez-leur ces identifiants (ils changeront le mot de
                passe à la première connexion) :
              </p>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {creds.map((c) => (
                  <div key={c.username} className="rounded-md border p-2">
                    <div className="mb-1 font-medium">{c.memberName}</div>
                    <div className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-muted-foreground">Identifiant</span>
                      <code className="min-w-0 truncate text-xs">{c.username}</code>
                      <CopyButton value={c.username} className="ml-auto" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-muted-foreground">Mot de passe</span>
                      <code className="text-xs">{c.temporaryPassword}</code>
                      <CopyButton value={c.temporaryPassword} className="ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {emailSent === 0 && creds.length === 0 && (
            <p className="text-muted-foreground">Aucun compte à créer.</p>
          )}
        </div>
        <DialogFooter><Button onClick={() => onOpenChange(false)}>Fermer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
