import { create } from 'zustand'

interface SidebarState {
  collapsed: boolean
  mobileOpen: boolean
  toggle: () => void
  setMobileOpen: (open: boolean) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  mobileOpen: false,
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
  setMobileOpen: (open: boolean) => set({ mobileOpen: open }),
}))
