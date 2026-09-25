// "Nettoyage de nouvelle année" — preview + start the yearly reset and download its document archive.
// Backend: NewYearController (api/v1/new-year). The run is a background job: poll the status while it runs.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import { saveBlob } from '@/lib/download'

export interface NewYearPreview {
  scoutYear: string
  documentsToDelete: number; bytesToDelete: number; documentsKept: number; approvalsToReset: number
  sectionsToClear: number; classesToPromote: number; newMembersSkipped: number
  keptTypeNames: string[]; keepApproval: boolean
}

export interface NewYearRun {
  state: 'running' | 'done' | 'failed'
  scoutYear: string; phase: string | null; startedAt: string; finishedAt: string | null; error: string | null
  exported: number | null; missingFiles: number | null; deleted: number | null; approvalsReset: number | null
  sectionsCleared: number | null; classesPromoted: number | null
  archiveFile: string | null; archiveBytes: number | null; startedBy: string | null
}

export interface NewYearStatus {
  preview: NewYearPreview
  doneFor: string | null; doneForCurrentYear: boolean; running: boolean; lastRun: NewYearRun | null
}

// GET /new-year/cleanup — polls every 3 s while a run is in progress.
export function useNewYearCleanup(enabled = true) {
  return useQuery({
    queryKey: ['new-year-cleanup'],
    queryFn: () => apiClient.get<NewYearStatus>('/new-year/cleanup').then(r => r.data),
    enabled,
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  })
}

// POST /new-year/cleanup — starts the background run (202).
export function useStartNewYearCleanup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post('/new-year/cleanup'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['new-year-cleanup'] }),
  })
}

// GET /new-year/archives/{file} — super-admin only.
export async function downloadNewYearArchive(fileName: string) {
  const res = await apiClient.get(`/new-year/archives/${encodeURIComponent(fileName)}`, { responseType: 'blob' })
  saveBlob(res.data, fileName, 'application/zip')
}
