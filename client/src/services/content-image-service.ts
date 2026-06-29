import apiClient from '@/lib/api-client'

// Uploads an image for CMS rich-text content and returns its public URL.
export async function uploadContentImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await apiClient.post<{ url: string }>('/content/images', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.url
}

// Uploads a content attachment (PDF or image) and returns its public URL + original name + size.
export async function uploadContentFile(file: File): Promise<{ url: string; name: string; size: number }> {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await apiClient.post<{ url: string; name: string; size: number }>('/content/files', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}
