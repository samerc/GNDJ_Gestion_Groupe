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
