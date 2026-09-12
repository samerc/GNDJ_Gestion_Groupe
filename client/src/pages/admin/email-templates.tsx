// Admin screen "Modèles d'email" (super-admin). CRUD of email templates (TipTap RichTextEditor body) bound
// to a module and an optional SMTP server. Templates use {{variable}} placeholders substituted server-side at
// send time; MODULE_VARIABLES drives both the reference chip list and the editor's variable-insertion dropdown.
// Split out of the old combined Email / SMTP page so the (heavy) rich-text editor only loads on this tab.
// `embedded` = rendered as a tab inside Paramètres (hides the standalone back-link + h1).
import { useState } from 'react'
import { parseApiError } from '@/lib/error-utils'
import {
  useSmtpServers,
  useEmailTemplates, useCreateEmailTemplate, useUpdateEmailTemplate, useDeleteEmailTemplate,
  type EmailTemplateDto, type EmailAttachment,
} from '@/services/email-service'
import { RichTextEditor } from '@/components/shared/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { BackToSettings } from '@/components/shared/back-to-settings'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { RequiredLabel } from '@/components/shared/required-label'
import { Tip } from '@/components/ui/tooltip'
import { Plus, Trash2, Pencil, FileText, Paperclip, Upload, X } from 'lucide-react'
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

// -- Template form --
interface TemplateForm {
  name: string; code: string; module: string; subject: string; bodyHtml: string
  variables: string; smtpServerId: string; isActive: boolean; attachments: EmailAttachment[]
}
const defaultTemplateForm: TemplateForm = { name: '', code: '', module: 'auth', subject: '', bodyHtml: '', variables: '', smtpServerId: '', isActive: true, attachments: [] }

export default function EmailTemplatesPage({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className="space-y-6">
      {!embedded && (
        <>
          <BackToSettings />
          <h1 className="text-2xl font-bold">Modèles d'email</h1>
        </>
      )}
      <TemplatesTab />
    </div>
  )
}

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
        description={`Supprimer le modele « ${deleting?.name} » ?`}
        confirmLabel="Supprimer"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
