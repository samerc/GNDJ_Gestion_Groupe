// Blob download/preview helpers — shared across every "download a PDF/Excel/CSV" and "open a PDF in a
// new tab" site so the createObjectURL → anchor.click → revokeObjectURL boilerplate lives in one place.

// Trigger a browser "save as" for binary data (PDF/Excel/CSV/zip). Creates a temporary object URL,
// clicks a hidden anchor, then revokes the URL.
export function saveBlob(data: BlobPart, fileName: string, mimeType = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

// Open binary data (typically a PDF) in a new browser tab. The URL is revoked after a delay so the
// tab has time to load it. Returns the object URL in case the caller wants to revoke it sooner.
export function openBlob(data: BlobPart, mimeType = 'application/pdf'): string {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }))
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return url
}
