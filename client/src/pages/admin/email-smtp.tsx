// Admin screen "Serveurs SMTP" (super-admin). CRUD of SMTP servers (+ a "test" dialog that sends a probe
// email via the server). Split out of the old combined Email / SMTP page so the SMTP config no longer pulls
// in the heavy rich-text editor (that now lives only in the "Modèles d'email" page).
// `embedded` = rendered as a tab inside Paramètres (hides the standalone back-link + h1, since the settings
// left-nav already labels the section). The /admin/email-settings route redirects here via ?tab=cfg:smtp.
import { useState } from 'react'
import { parseApiError } from '@/lib/error-utils'
import {
  useSmtpServers, useCreateSmtpServer, useUpdateSmtpServer, useDeleteSmtpServer, useTestSmtp,
  type SmtpServerDto,
} from '@/services/email-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { BackToSettings } from '@/components/shared/back-to-settings'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { RequiredLabel } from '@/components/shared/required-label'
import { Tip } from '@/components/ui/tooltip'
import { Plus, Trash2, Pencil, Server, Send } from 'lucide-react'
import { toast } from 'sonner'

// -- SMTP form --
interface SmtpForm {
  name: string; host: string; port: number; username: string; password: string
  fromEmail: string; fromName: string; useSsl: boolean; isActive: boolean
  maxPerHour: string   // kept as string in the form ('' = unlimited); parsed to number|null on save
}
const defaultSmtpForm: SmtpForm = { name: '', host: '', port: 587, username: '', password: '', fromEmail: '', fromName: '', useSsl: true, isActive: true, maxPerHour: '' }

export default function EmailSmtpPage({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className="space-y-6">
      {!embedded && (
        <>
          <BackToSettings />
          <h1 className="text-2xl font-bold">Serveurs SMTP</h1>
        </>
      )}
      <SmtpTab />
    </div>
  )
}

function SmtpTab() {
  const { data: servers, isLoading } = useSmtpServers()
  const createMutation = useCreateSmtpServer()
  const updateMutation = useUpdateSmtpServer()
  const deleteMutation = useDeleteSmtpServer()
  const testMutation = useTestSmtp()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SmtpServerDto | null>(null)
  const [form, setForm] = useState<SmtpForm>(defaultSmtpForm)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<SmtpServerDto | null>(null)

  // Test dialog
  const [testDialogOpen, setTestDialogOpen] = useState(false)
  const [testServerId, setTestServerId] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [testError, setTestError] = useState('')

  const openCreate = () => {
    setEditing(null)
    setForm(defaultSmtpForm)
    setError('')
    setFormOpen(true)
  }

  const openEdit = (server: SmtpServerDto) => {
    setEditing(server)
    setForm({
      // password intentionally blanked: the server never returns it; empty on submit = "keep existing".
      name: server.name, host: server.host, port: server.port,
      username: server.username, password: '',
      fromEmail: server.fromEmail, fromName: server.fromName,
      useSsl: server.useSsl, isActive: server.isActive,
      maxPerHour: server.maxPerHour != null ? String(server.maxPerHour) : '',
    })
    setError('')
    setFormOpen(true)
  }

  const openTest = (serverId: string) => {
    setTestServerId(serverId)
    setTestEmail('')
    setTestError('')
    setTestDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    // Parse the optional rate cap: blank field = null (unlimited).
    const maxPerHour = form.maxPerHour.trim() === '' ? null : parseInt(form.maxPerHour, 10)
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id, name: form.name, host: form.host, port: form.port,
          username: form.username, password: form.password || undefined,
          fromEmail: form.fromEmail, fromName: form.fromName,
          useSsl: form.useSsl, isActive: form.isActive, maxPerHour,
        })
        toast.success('Serveur SMTP modifié')
      } else {
        await createMutation.mutateAsync({
          name: form.name, host: form.host, port: form.port,
          username: form.username, password: form.password,
          fromEmail: form.fromEmail, fromName: form.fromName,
          useSsl: form.useSsl, isActive: form.isActive, maxPerHour,
        })
        toast.success('Serveur SMTP créé')
      }
      setFormOpen(false)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await deleteMutation.mutateAsync(deleting.id)
      toast.success('Serveur SMTP supprimé')
      setDeleting(null)
    } catch (err) {
      toast.error(parseApiError(err))
      setDeleting(null)
    }
  }

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault()
    setTestError('')
    try {
      await testMutation.mutateAsync({ smtpServerId: testServerId, testEmail })
      toast.success('Email de test envoyé')
      setTestDialogOpen(false)
    } catch (err) {
      // Keep the FULL SMTP error visible in the dialog (a transient toast is easy to miss while debugging).
      const msg = parseApiError(err)
      setTestError(msg)
      toast.error(msg)
    }
  }

  if (isLoading) return <LoadingSpinner variant="form" />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nouveau serveur</Button>
      </div>

      {!servers || servers.length === 0 ? (
        <EmptyState icon={Server} title="Aucun serveur SMTP" description="Configurez votre premier serveur SMTP." action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Creer</Button>} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Hote</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Email expediteur</TableHead>
                <TableHead>Limite/h</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((s) => (
                <TableRow key={s.id} className="even:bg-muted/30">
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.host}</TableCell>
                  <TableCell>{s.port}</TableCell>
                  <TableCell>{s.fromEmail}</TableCell>
                  <TableCell>{s.maxPerHour != null ? `${s.maxPerHour}/h` : <span className="text-muted-foreground">Illimité</span>}</TableCell>
                  <TableCell>{s.isActive ? <Badge className="bg-green-600">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Tip content="Modifier"><Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button></Tip>
                      <Tip content="Envoyer un test"><Button variant="ghost" size="icon" onClick={() => openTest(s.id)}><Send className="h-4 w-4" /></Button></Tip>
                      <Tip content="Supprimer"><Button variant="ghost" size="icon" onClick={() => setDeleting(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le serveur SMTP' : 'Nouveau serveur SMTP'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <RequiredLabel required>Nom</RequiredLabel>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-2">
                <RequiredLabel required>Hote</RequiredLabel>
                <Input value={form.host} onChange={(e) => setForm(f => ({ ...f, host: e.target.value }))} required placeholder="smtp.example.com" />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Port</RequiredLabel>
                <Input type="number" value={form.port} onChange={(e) => setForm(f => ({ ...f, port: parseInt(e.target.value) || 0 }))} required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <RequiredLabel required>Utilisateur</RequiredLabel>
                <Input value={form.username} onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel required={!editing}>Mot de passe{editing ? ' (laisser vide pour ne pas changer)' : ''}</RequiredLabel>
                <Input type="password" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} required={!editing} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <RequiredLabel required>Email expediteur</RequiredLabel>
                <Input type="email" value={form.fromEmail} onChange={(e) => setForm(f => ({ ...f, fromEmail: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Nom expediteur</RequiredLabel>
                <Input value={form.fromName} onChange={(e) => setForm(f => ({ ...f, fromName: e.target.value }))} required />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Max emails / heure</label>
              <Input type="number" min={1} value={form.maxPerHour} onChange={(e) => setForm(f => ({ ...f, maxPerHour: e.target.value }))} placeholder="Illimité" />
              <p className="text-xs text-muted-foreground">
                Laissez vide pour ne pas limiter. Renseignez le plafond horaire du fournisseur pour lisser les
                gros envois (ex. SendPulse gratuit&nbsp;: 50/h → mettez&nbsp;45). Les emails en trop sont
                automatiquement échelonnés dans le temps, sans échec.
              </p>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.useSsl} onChange={(e) => setForm(f => ({ ...f, useSsl: e.target.checked }))} />SSL/TLS</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} />Actif</label>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Test dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tester le serveur SMTP</DialogTitle></DialogHeader>
          <form onSubmit={handleTest} className="space-y-4">
            {testError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive break-words">
                <p className="font-medium">Échec de l'envoi</p>
                <p className="mt-1 whitespace-pre-wrap">{testError}</p>
              </div>
            )}
            <div className="space-y-2">
              <RequiredLabel required>Adresse email de test</RequiredLabel>
              <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} required placeholder="test@example.com" />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setTestDialogOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={testMutation.isPending}>
                {testMutation.isPending ? 'Envoi...' : 'Envoyer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer le serveur SMTP"
        description={`Supprimer le serveur « ${deleting?.name} » ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
