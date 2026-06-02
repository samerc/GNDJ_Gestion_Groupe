import { useParams, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { FunctionalRolesList } from '@/components/shared/functional-roles-list'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ArrowLeft } from 'lucide-react'

interface UnitTypeDetail {
  id: string; name: string; code: string; description: string | null
  numberOfYears: number | null; createdAt: string; updatedAt: string
}

export default function UnitTypeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: unitType, isLoading } = useQuery({
    queryKey: ['unitTypes', id],
    queryFn: () => apiClient.get<UnitTypeDetail>(`/unit-types/${id}`).then(r => r.data),
    enabled: !!id,
  })

  if (isLoading) return <LoadingSpinner />
  if (!unitType) return <div className="py-12 text-center text-muted-foreground">Type d'unité introuvable.</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/unit-types')}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-2xl font-bold">{unitType.name}</h1>
          <p className="text-sm text-muted-foreground">
            Code: {unitType.code}
            {unitType.numberOfYears && ` — ${unitType.numberOfYears} an${unitType.numberOfYears > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {unitType.description && <p className="text-muted-foreground">{unitType.description}</p>}

      <FunctionalRolesList unitTypeId={id} unitTypeName={unitType.name} />
    </div>
  )
}
