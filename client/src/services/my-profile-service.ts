// Member self-service ("Ma fiche") — edits of the caller's OWN record that need NO members.edit permission
// and NO approval. Backed by /my-profile/* (auth-only; the server resolves the caller's own member id and
// only lets a member change permitted fields). Keep in sync with the approval-gated flows (progression /
// fonctions) which live elsewhere.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// The member-editable profile + medical fields (locked identity fields are intentionally absent).
export interface MyProfileUpdate {
  nationality?: string | null
  school?: string | null
  classe?: string | null
  section?: string | null
  bloodType?: string | null
  allergies?: string | null
  medicalNotes?: string | null
}

// PUT /my-profile/profile → update own editable profile + medical fields; refreshes Ma fiche.
export function useUpdateMyProfile(memberId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: MyProfileUpdate) => apiClient.put('/my-profile/profile', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', memberId] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })
}
