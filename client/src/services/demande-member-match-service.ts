// « Déjà membre ? » answers on a demande (confirm / reject / undo). Kept out of demande-admin-service, which the
// menu loads at start-up, so this code only loads with the demandes page.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// POST /demandes/{id}/member-match/confirm → « Oui, c'est la même personne ». Not sent yet: the send updates that
// member. Already sent: the new file is merged into it now and the access email is sent. Invalidates ['demandes'].
export interface ConfirmMemberMatchResult { merged: boolean; accessSent: boolean; note: string | null; alreadyMember?: boolean }
export function useConfirmMemberMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ demandeId, memberId }: { demandeId: string; memberId: string }) =>
      apiClient.post<ConfirmMemberMatchResult>(`/demandes/${demandeId}/member-match/confirm`, { memberId }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demandes'] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

// POST /demandes/{id}/member-match/reject → « Non, personne différente »: a new member file will be created.
export function useRejectMemberMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ demandeId, memberId }: { demandeId: string; memberId: string }) =>
      apiClient.post(`/demandes/${demandeId}/member-match/reject`, { memberId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandes'] }) },
  })
}

// DELETE /demandes/{id}/member-match → undo an answer given by mistake (only while nothing was merged).
export function useClearMemberMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (demandeId: string) => apiClient.delete(`/demandes/${demandeId}/member-match`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['demandes'] }) },
  })
}
