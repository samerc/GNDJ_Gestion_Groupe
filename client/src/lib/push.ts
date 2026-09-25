// Web Push (notifications) client helpers: subscribe/unsubscribe the current device and report the
// subscription to the server. Delivery works on Android/desktop (Chrome/Edge/Firefox) and — crucially — on
// iOS 16.4+ ONLY when the app is installed to the home screen and opened from there (Safari tabs can't receive
// push). Everything is defensive and never throws.
import apiClient from '@/lib/api-client'

// The VAPID public key comes from the server base64url-encoded; the Push API wants a Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// 'granted' | 'denied' | 'default' (not yet asked). 'denied' means the user blocked it in the browser and must
// re-enable it from the browser's site settings — we can't re-prompt.
export function pushPermission(): NotificationPermission {
  try { return Notification.permission } catch { return 'denied' }
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    return !!(await reg.pushManager.getSubscription())
  } catch { return false }
}

export type EnablePushResult = 'ok' | 'denied' | 'unsupported' | 'disabled' | 'error'

// Ask permission, subscribe via the SW's push manager using the server's VAPID key, and register the
// subscription server-side. 'disabled' = push isn't configured on the server (no VAPID keys).
export async function enablePush(): Promise<EnablePushResult> {
  if (!pushSupported()) return 'unsupported'
  try {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return 'denied'

    const { data } = await apiClient.get<{ publicKey: string | null; enabled: boolean }>('/my-profile/push/vapid-key')
    if (!data.enabled || !data.publicKey) return 'disabled'

    await subscribeWithKey(data.publicKey)
    return 'ok'
  } catch { return 'error' }
}

// True when the subscription was created with the given VAPID public key. A subscription made with an OLD key
// (keys rotated on the server) is rejected by the push service forever, so it must be replaced.
function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const current = sub.options?.applicationServerKey
  if (!current) return false
  const a = new Uint8Array(current)
  const b = urlBase64ToUint8Array(publicKey)
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// Reuse the device's subscription when it matches the server key, else replace it; then (re)register it
// server-side (the server upserts by endpoint, so re-posting is harmless).
async function subscribeWithKey(publicKey: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub, publicKey)) {
    await sub.unsubscribe().catch(() => { /* replaced below anyway */ })
    sub = null
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, // required: every push must show a visible notification
      // Cast: the fresh Uint8Array is a valid BufferSource at runtime; the TS DOM lib's ArrayBufferLike
      // generic makes the direct assignment complain.
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  }
  const json = sub.toJSON()
  await apiClient.post('/my-profile/push/subscribe', {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    userAgent: navigator.userAgent,
  })
}

// Silent repair on app open: if this device already has notifications allowed AND a subscription, make sure
// it uses the server's CURRENT key and is registered (the server deletes subscriptions the push service
// rejects). No permission prompt — does nothing unless the user had already turned notifications on.
export async function syncPush(): Promise<void> {
  if (!pushSupported() || pushPermission() !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    if (!(await reg.pushManager.getSubscription())) return
    const { data } = await apiClient.get<{ publicKey: string | null; enabled: boolean }>('/my-profile/push/vapid-key')
    if (!data.enabled || !data.publicKey) return
    await subscribeWithKey(data.publicKey)
  } catch { /* best-effort */ }
}

// Unsubscribe this device (removes it server-side + at the browser).
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await apiClient.post('/my-profile/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => { /* best-effort */ })
      await sub.unsubscribe()
    }
  } catch { /* ignore */ }
}
