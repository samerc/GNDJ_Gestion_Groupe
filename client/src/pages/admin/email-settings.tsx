import { useState } from 'react'
import { parseApiError } from '@/lib/error-utils'
import {
  useSmtpServers, useCreateSmtpServer, useUpdateSmtpServer, useDeleteSmtpServer, useTestSmtp,
  useEmailTemplates, useCreateEmailTemplate, useUpdateEmailTemplate, useDeleteEmailTemplate,
  type SmtpServerDto, type EmailTemplateDto,
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
import { Plus, Trash2, Pencil, Server, FileText, Send } from 'lucide-react'
import { toast } from 'sonner'

// -- Module variables --
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
}

const MODULE_OPTIONS = [
  { value: 'auth', label: 'Authentification' },
  { value: 'documents', label: 'Documents' },
  { value: 'cotisations', label: 'Cotisations' },
  { value: 'passage', label: 'Passage' },
]

// -- SMTP form --
interface SmtpForm {
  name: string; host: string; port: number; username: string; password: string
  fromEmail: string; fromName: string; useSsl: boolean; isActive: boolean
}
const defaultSmtpForm: SmtpForm = { name: '', host: '', port: 587, username: '', password: '', fromEmail: '', fromName: '', useSsl: true, isActive: true }

// -- Template form --
interface TemplateForm {
  name: string; code: string; module: string; subject: string; bodyHtml: string
  variables: string; smtpServerId: string; isActive: boolean
}
const defaultTemplateForm: TemplateForm = { name: '', code: '', module: 'auth', subject: '', bodyHtml: '', variables: '', smtpServerId: '', isActive: true }

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

  const openCreate = () => {
    setEditing(null)
    setForm(defaultSmtpForm)
    setError('')
    setFormOpen(true)
  }

  const openEdit = (server: SmtpServerDto) => {
    setEditing(server)
    setForm({
      name: server.name, host: server.host, port: server.port,
      username: server.username, password: '',
      fromEmail: server.fromEmail, fromName: server.fromName,
      useSsl: server.useSsl, isActive: server.isActive,
    })
    setError('')
    setFormOpen(true)
  }

  const openTest = (serverId: string) => {
    setTestServerId(serverId)
    setTestEmail('')
    setTestDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id, name: form.name, host: form.host, port: form.port,
          username: form.username, password: form.password || undefined,
          fromEmail: form.fromEmail, fromName: form.fromName,
          useSsl: form.useSsl, isActive: form.isActive,
        })
        toast.success('Serveur SMTP modifie')
      } else {
        await createMutation.mutateAsync(form)
        toast.success('Serveur SMTP cree')
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
      toast.success('Serveur SMTP supprime')
      setDeleting(null)
    } catch (err) {
      toast.error(parseApiError(err))
      setDeleting(null)
    }
  }

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await testMutation.mutateAsync({ smtpServerId: testServerId, testEmail })
      toast.success('Email de test envoye')
      setTestDialogOpen(false)
    } catch (err) {
      toast.error(parseApiError(err))
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
                  <TableCell>{s.isActive ? <Badge className="bg-green-600">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)} title="Modifier"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openTest(s.id)} title="Tester"><Send className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(s)} title="Supprimer"><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.useSsl} onChange={(e) => setForm(f => ({ ...f, useSsl: e.target.checked }))} />SSL/TLS</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} />Actif</label>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Creer'}
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
      isActive: tpl.isActive,
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
      }
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, ...payload })
        toast.success('Modele modifie')
      } else {
        await createMutation.mutateAsync(payload)
        toast.success('Modele cree')
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
      toast.success('Modele supprime')
      setDeleting(null)
    } catch (err) {
      toast.error(parseApiError(err))
      setDeleting(null)
    }
  }

  const currentVariables = MODULE_VARIABLES[form.module] ?? []

  if (isLoading) return <LoadingSpinner variant="form" />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nouveau modele</Button>
      </div>

      {!templates || templates.length === 0 ? (
        <EmptyState icon={FileText} title="Aucun modele d'email" description="Creez votre premier modele d'email." action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Creer</Button>} />
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
                      <Button variant="ghost" size="icon" onClick={() => openEdit(tpl)} title="Modifier"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(tpl)} title="Supprimer"><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm(f => ({ ...f, isActive: e.target.checked }))} />
              Actif
            </label>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Creer'}
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
