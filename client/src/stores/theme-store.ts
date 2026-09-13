import { create } from 'zustand'

// Light / dark / system theme. The dark palette is defined in index.css (`.dark` token overrides); toggling the
// `.dark` class on <html> flips every semantic token. The initial class is set BEFORE paint by the inline script
// in index.html (no flash); this store keeps it reactive + persisted afterwards.
export type Theme = 'light' | 'dark' | 'system'

function resolve(t: Theme): 'light' | 'dark' {
  if (t === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return t
}

function apply(t: Theme) {
  document.documentElement.classList.toggle('dark', resolve(t) === 'dark')
}

function stored(): Theme {
  const v = localStorage.getItem('theme')
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export const useThemeStore = create<{ theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void }>((set) => ({
  theme: stored(),
  resolved: resolve(stored()),
  setTheme: (t) => {
    localStorage.setItem('theme', t)
    apply(t)
    set({ theme: t, resolved: resolve(t) })
  },
}))

// Keep "system" in sync if the OS theme changes while the app is open (no-op for explicit light/dark).
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const s = useThemeStore.getState()
    if (s.theme === 'system') { apply('system'); useThemeStore.setState({ resolved: resolve('system') }) }
  })
}
