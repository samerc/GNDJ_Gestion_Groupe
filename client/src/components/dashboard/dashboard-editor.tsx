// « Personnaliser l'accueil »: the group dashboard's layout editor (drag to reorder widgets, show / hide, width).
// Its own file so the drag-and-drop library is only downloaded when someone opens the editor (lazy in dashboard.tsx).
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/shared/page'
import { PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'
import { WIDGET_META, type WidgetConfig, type WidgetId, type WidgetWidth } from '@/lib/dashboard-layout'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Eye, EyeOff, SlidersHorizontal, RotateCcw, Check } from 'lucide-react'

const WIDTH_LABELS: { value: WidgetWidth; label: string }[] = [
  { value: 'full', label: 'Pleine largeur' },
  { value: 'half', label: 'Moitié' },
  { value: 'third', label: 'Tiers' },
]

function SortableWidgetRow({ w, onToggle, onWidth }: { w: WidgetConfig; onToggle: () => void; onWidth: (width: WidgetWidth) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className={cn('flex items-center gap-2 rounded-lg border bg-card p-2.5', !w.visible && 'opacity-60')}>
      <button type="button" className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing" {...attributes} {...listeners} aria-label="Déplacer">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 min-w-0 truncate text-sm font-medium">{WIDGET_META[w.id].label}</span>
      <Select value={w.width} onValueChange={(v) => onWidth(v as WidgetWidth)}>
        <SelectTrigger className="h-8 w-32 text-xs" disabled={!w.visible}><SelectValue /></SelectTrigger>
        <SelectContent>
          {WIDTH_LABELS.map(x => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={onToggle}>
        {w.visible ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
        <span className="hidden sm:inline text-xs">{w.visible ? 'Affiché' : 'Masqué'}</span>
      </Button>
    </div>
  )
}

export default function DashboardEditor({ layout, setLayout, onDone, onCancel, onReset, saving }: {
  layout: WidgetConfig[]; setLayout: (l: WidgetConfig[]) => void
  onDone: () => void; onCancel: () => void; onReset: () => void; saving: boolean
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = layout.findIndex(w => w.id === active.id)
    const to = layout.findIndex(w => w.id === over.id)
    if (from >= 0 && to >= 0) setLayout(arrayMove(layout, from, to))
  }
  const update = (id: WidgetId, patch: Partial<WidgetConfig>) => setLayout(layout.map(w => w.id === id ? { ...w, ...patch } : w))

  return (
    <Page>
      <PageHeader
        title="Personnaliser l'accueil"
        icon={SlidersHorizontal}
        description="Glissez pour réorganiser · affichez/masquez · choisissez la largeur."
        actions={<>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onReset}><RotateCcw className="h-4 w-4" />Réinitialiser</Button>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Annuler</Button>
          <Button size="sm" className="gap-1.5" onClick={onDone} disabled={saving}><Check className="h-4 w-4" />{saving ? 'Enregistrement…' : 'Terminé'}</Button>
        </>}
      />
      <Card>
        <CardContent className="space-y-2 pt-6">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={layout.map(w => w.id)} strategy={verticalListSortingStrategy}>
              {layout.map(w => (
                <SortableWidgetRow key={w.id} w={w} onToggle={() => update(w.id, { visible: !w.visible })} onWidth={(width) => update(w.id, { width })} />
              ))}
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>
    </Page>
  )
}
