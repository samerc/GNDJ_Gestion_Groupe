import { useEffect, useReducer } from 'react'
import { onInstallChange, getInstallGuide, type InstallGuide } from '@/lib/pwa'

// Device/browser-specific install guide that re-renders when install availability changes (the
// beforeinstallprompt event can arrive after mount, flipping canPrompt). Backs the install button, banner,
// and welcome-tour slide so they always show the right steps for the user's device.
export function useInstallGuide(): InstallGuide {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => onInstallChange(force), [])
  return getInstallGuide()
}
