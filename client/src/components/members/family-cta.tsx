// A one-line link from Ma fiche to « Ma famille », shown only when the member has confirmed brothers or sisters.
// Says how many of them still have something to do, so a parent knows to look.
import { Link } from 'react-router'
import { Users, ArrowRight } from 'lucide-react'
import { useMyFamily } from '@/services/my-profile-service'
import { todoLeft } from '@/lib/my-todo'

export function FamilyCta() {
  const { data: family } = useMyFamily()
  const siblings = (family ?? []).filter((c) => !c.isMe)
  if (siblings.length === 0) return null
  const pending = siblings.filter((c) => c.todo && (c.todo.onHold || todoLeft(c.todo).length > 0)).length

  return (
    <Link to="/ma-famille"
      className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm shadow-card transition-colors hover:bg-muted/50">
      <Users className="h-5 w-5 shrink-0 text-primary" />
      <span className="flex-1">
        <span className="font-medium">Ma famille</span>
        <span className="text-muted-foreground">
          {' — '}{pending > 0
            ? `${pending} frère${pending > 1 ? 's' : ''} ou sœur${pending > 1 ? 's' : ''} ${pending > 1 ? 'ont' : 'a'} encore quelque chose à faire`
            : 'tout est en ordre pour vos frères et sœurs'}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
