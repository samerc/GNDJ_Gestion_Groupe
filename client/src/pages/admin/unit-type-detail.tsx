import { useParams, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { FunctionalRolesList } from '@/components/shared/functional-roles-list'
import { StagesTab, BadgesTab } from '@/pages/admin/progression'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { ArrowLeft, Shield, Star, Award } from 'lucide-react'

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

  if (isLoading) return <LoadingSpinner variant="detail" />
  if (!unitType) return <div className="py-12 text-center text-muted-foreground">Type d'unité introuvable.</div>

  // For the tabs, we pass the unit type as a locked single-item array
  const unitTypes = [{ id: unitType.id, name: unitType.name }]

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

      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles"><Shield className="mr-1 h-4 w-4" />Fonctions</TabsTrigger>
          <TabsTrigger value="stages"><Star className="mr-1 h-4 w-4" />Étapes</TabsTrigger>
          <TabsTrigger value="badges"><Award className="mr-1 h-4 w-4" />Badges</TabsTrigger>
        </TabsList>

        <TabsContent value="roles">
          <FunctionalRolesList unitTypeId={id} unitTypeName={unitType.name} />
        </TabsContent>

        <TabsContent value="stages">
          <StagesTab unitTypeId={unitType.id} unitTypes={unitTypes} />
        </TabsContent>

        <TabsContent value="badges">
          <BadgesTab unitTypeId={unitType.id} unitTypes={unitTypes} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
