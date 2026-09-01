// Admin screen "Email / SMTP" (super-admin). Two tabs:
//  - SmtpTab: CRUD of SMTP servers (+ a "test" dialog that sends a probe email via the server).
//  - TemplatesTab: CRUD of email templates (TipTap RichTextEditor body) bound to a module and an
//    optional SMTP server. Templates use {{variable}} placeholders substituted server-side at send time;
//    MODULE_VARIABLES drives both the reference chip list and the editor's variable-insertion dropdown.
import { useState } from 'react'
import { parseApiError } from '@/lib/error-utils'
import {
  useSmtpServers, useCreateSmtpServer, useUpdateSmtpServer, useDeleteSmtpServer, useTestSmtp,
  useEmailTemplates, useCreateEmailTemplate, useUpdateEmailTemplate, useDeleteEmailTemplate,
  type SmtpServerDto, type EmailTemplateDto, type EmailAttachment,
} from '@/services/email-service'
import { RichTextEditor } from '@/components/shared/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { RequiredLabel } from '@/components/shared/required-label'
import { Tip } from '@/components/ui/tooltip'
import { Plus, Trash2, Pencil, Server, FileText, Send, Paperclip, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { uploadContentFile } from '@/services/content-image-service'

// -- Module variables --
// Per-module set of {{placeholders}} the backend will substitute. Keyed by template.module; selecting a
// module in the form swaps which chips/insert-dropdown entries are shown. Keys must match server expansion.
const MODULE_VARIABLES: Record<string, { key: string; label: string }[]> = {
  auth: [
    { key: 'memberName', label: 'Nom du membre' },
    { key: 'resetLink', label: 'Lien de reinitialisation' },
    { key: 'expiryHours', label: 'Duree de validite' },
  ],
  documents: [
    { key: 'memberName', label: 'Nom du membre' },
    { key: 'documentType', label: 'Type de document' },
    { key: 'unitName', label: "Nom de l'unite" },
  ],
  cotisations: [
    { key: 'memberName', label: 'Nom du membre' },
    { key: 'amount', label: 'Montant' },
    { key: 'scoutYear', label: 'Année scoute' },
  ],
  passage: [
    { key: 'memberName', label: 'Nom du membre' },
    { key: 'fromUnit', label: 'Unite actuelle' },
    { key: 'toUnit', label: 'Nouvelle unite' },
  ],
  demande: [
    { key: 'contactName', label: 'Nom du parent / contact' },
    { key: 'demandeNumber', label: 'Numéro de demande (INS-…)' },
    { key: 'verifyLink', label: "Lien de vérification de l'email" },
    { key: 'expiryDays', label: 'Validité du lien (jours)' },
    { key: 'childName', label: "Nom de l'enfant" },
    { key: 'unitName', label: "Unité d'affectation" },
    { key: 'username', label: 'Identifiant du nouveau membre' },
    { key: 'tempPassword', label: 'Mot de passe temporaire' },
    { key: 'loginUrl', label: 'Lien de connexion' },
    { key: 'reason', label: 'Motif (refus)' },
  ],
  general: [
    { key: 'senderName', label: "Nom de l'expéditeur" },
    { key: 'senderEmail', label: "Email de l'expéditeur" },
    { key: 'subject', label: 'Sujet' },
    { key: 'message', label: 'Message' },
    // Rentrée onboarding (Message aux chefs) — resolved per recipient at send time.
    { key: 'leaderName', label: 'Nom du chef' },
    { key: 'unitName', label: 'Unité' },
    { key: 'scoutYear', label: 'Année scoute' },
    { key: 'username', label: 'Identifiant' },
    // Adding {{activationLink}} makes the send stamp a set-password token per recipient (one-email onboarding).
    { key: 'activationLink', label: "Lien d'activation (définir le mot de passe)" },
    { key: 'expiryDays', label: 'Validité du lien (jours)' },
    { key: 'loginUrl', label: 'Lien de connexion' },
  ],
}

const MODULE_OPTIONS = [
  { value: 'auth', label: 'Authentification' },
  { value: 'documents', label: 'Documents' },
  { value: 'cotisations', label: 'Cotisations' },
  { value: 'passage', label: 'Passage' },
  { value: 'demande', label: "Demande d'inscription" },
  { value: 'general', label: 'Général' },
]

// -- SMTP form --
interface SmtpForm {
  name: string; host: string; port: number; username: string; password: string
  fromEmail: string; fromName: string; useSsl: boolean; isActive: boolean
  maxPerHour: string   // kept as string in the form ('' = unlimited); parsed to number|null on save
}
const defaultSmtpForm: SmtpForm = { name: '', host: '', port: 587, username: '', password: '', fromEmail: '', fromName: '', useSsl: true, isActive: true, maxPerHour: '' }

// -- Template form --
interface TemplateForm {
  name: string; code: string; module: string; subject: string; bodyHtml: string
  variables: string; smtpServerId: string; isActive: boolean; attachments: EmailAttachment[]
}
const defaultTemplateForm: TemplateForm = { name: '', code: '', module: 'auth', subject: '', bodyHtml: '', variables: '', smtpServerId: '', isActive: true, attachments: [] }

export default function EmailSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Email / SMTP</h1>
      <Tabs defaultValue="smtp">
        <TabsList>
          <TabsTrigger value="smtp">Serveurs SMTP</TabsTrigger>
          <TabsTrigger value="templates">Modeles d'email</TabsTrigger>
        </TabsList>
        <TabsContent value="smtp"><SmtpTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
      </Tabs>
    </div>
  )
}

// ==========  SMTP Tab  ==========
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
        description={`Supprimer le serveur \u00ab ${deleting?.name} \u00bb ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}

// ==========  Templates Tab  ==========
function TemplatesTab() {
  const { data: templates, isLoading } = useEmailTemplates()
  const { data: servers } = useSmtpServers()
  const createMutation = useCreateEmailTemplate()
  const updateMutation = useUpdateEmailTemplate()
  const deleteMutation = useDeleteEmailTemplate()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<EmailTemplateDto | null>(null)
  const [form, setForm] = useState<TemplateForm>(defaultTemplateForm)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<EmailTemplateDto | null>(null)
  const [uploading, setUploading] = useState(false)

  // Upload a file (PDF/image) via the content-files endpoint and append it as a template attachment.
  // Reuses uploadContentFile — it sets the multipart Content-Type header (the default apiClient JSON
  // content-type would otherwise make the server reject the upload with 415).
  const handleUploadAttachment = async (file: File) => {
    setUploading(true)
    try {
      const data = await uploadContentFile(file)
      setForm(f => ({ ...f, attachments: [...f.attachments, { name: data.name, url: data.url }] }))
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setUploading(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm(defaultTemplateForm)
    setError('')
    setFormOpen(true)
  }

  const openEdit = (tpl: EmailTemplateDto) => {
    setEditing(tpl)
    setForm({
      name: tpl.name, code: tpl.code, module: tpl.module,
      subject: tpl.subject, bodyHtml: tpl.bodyHtml,
      variables: tpl.variables ?? '', smtpServerId: tpl.smtpServerId ?? '',
      isActive: tpl.isActive, attachments: tpl.attachments ?? [],
    })
    setError('')
    setFormOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const payload = {
        name: form.name, code: form.code, module: form.module,
        subject: form.subject, bodyHtml: form.bodyHtml,
        variables: form.variables || null,
        smtpServerId: form.smtpServerId || null,
        isActive: form.isActive,
        attachments: form.attachments,
      }
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload })
        toast.success('Modèle modifié')
      } else {
        await createMutation.mutateAsync(payload)
        toast.success('Modèle créé')
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
      toast.success('Modèle supprimé')
      setDeleting(null)
    } catch (err) {
      toast.error(parseApiError(err))
      setDeleting(null)
    }
  }

  // Variables for the selected module — fed to both the reference chips and the editor insert dropdown.
  const currentVariables = MODULE_VARIABLES[form.module] ?? []

  if (isLoading) return <LoadingSpinner variant="form" />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nouveau modele</Button>
      </div>

      {!templates || templates.length === 0 ? (
        <EmptyState icon={FileText} title="Aucun modèle d'email" description="Créez votre premier modèle d'email." action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Créer</Button>} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Serveur SMTP</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((tpl) => (
                <TableRow key={tpl.id} className="even:bg-muted/30">
                  <TableCell className="font-medium">{tpl.name}</TableCell>
                  <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{tpl.code}</code></TableCell>
                  <TableCell>{MODULE_OPTIONS.find(m => m.value === tpl.module)?.label ?? tpl.module}</TableCell>
                  <TableCell className="text-muted-foreground">{tpl.smtpServerName ?? 'Par defaut'}</TableCell>
                  <TableCell>{tpl.isActive ? <Badge className="bg-green-600">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Tip content="Modifier"><Button variant="ghost" size="icon" onClick={() => openEdit(tpl)}><Pencil className="h-4 w-4" /></Button></Tip>
                      <Tip content="Supprimer"><Button variant="ghost" size="icon" onClick={() => setDeleting(tpl)}><Trash2 className="h-4 w-4 text-destructive" /></Button></Tip>
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
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le modele' : 'Nouveau modele d\'email'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <RequiredLabel required>Nom</RequiredLabel>
                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <RequiredLabel required>Code</RequiredLabel>
                <Input value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} required placeholder="password-reset" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <RequiredLabel required>Module</RequiredLabel>
                <Select value={form.module} onValueChange={(v) => setForm(f => ({ ...f, module: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MODULE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <RequiredLabel>Serveur SMTP</RequiredLabel>
                <Select value={form.smtpServerId} onValueChange={(v) => setForm(f => ({ ...f, smtpServerId: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Par defaut" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Par defaut</SelectItem>
                    {servers?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <RequiredLabel required>Sujet</RequiredLabel>
              <Input value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} required placeholder="Reinitialisation du mot de passe" />
            </div>

            {/* Variables reference */}
            {currentVariables.length > 0 && (
              <div className="rounded-md bg-muted/50 border p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Variables disponibles pour ce module :</p>
                <div className="flex flex-wrap gap-2">
                  {currentVariables.map(v => (
                    <code key={v.key} className="rounded bg-background px-1.5 py-0.5 text-xs font-mono border">
                      {`{{${v.key}}}`} — {v.label}
                    </code>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <RequiredLabel required>Contenu</RequiredLabel>
              <RichTextEditor
                content={form.bodyHtml}
                onChange={(html) => setForm(f => ({ ...f, bodyHtml: html }))}
                variables={currentVariables}
                placeholder="Redigez votre email..."
              />
            </div>
            {/* Attachments — files added to every email sent from this template (e.g. an official letter). */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Pièces jointes</span>
              </div>
              {form.attachments.length > 0 && (
                <ul className="space-y-1">
                  {form.attachments.map((a, i) => (
                    <li key={i} className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-1.5 text-sm">
                      <a href={a.url} target="_blank" rel="noreferrer" className="truncate hover:underline">{a.name}</a>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                        onClick={() => setForm(f => ({ ...f, attachments: f.attachments.filter((_, j) => j !== i) }))}>
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50">
                <Upload className="h-4 w-4" />{uploading ? 'Téléversement…' : 'Ajouter une pièce jointe'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadAttachment(f); e.target.value = '' }} />
              </label>
              <p className="text-xs text-muted-foreground">PDF ou image — jointe à chaque envoi. Pensez à la mettre à jour chaque année.</p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} />
              Actif
            </label>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Supprimer le modele"
        description={`Supprimer le modele \u00ab ${deleting?.name} \u00bb ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
