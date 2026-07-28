import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarState {
  collapsed: boolean
  mobileOpen: boolean
  // Which admin nav groups are expanded (accordion). Empty by default = all collapsed; the group holding
  // the current route auto-expands regardless (handled in the sidebar). Persisted so it survives reloads.
  openGroups: Record<string, boolean>
  toggle: () => void
  setMobileOpen: (open: boolean) => void
  toggleGroup: (label: string) => void
}

// UI-only store: desktop collapse state + mobile drawer + which nav accordion groups are open.
// Persisted (localStorage) so a manager's collapsed/expanded layout sticks between visits; mobileOpen is
// transient and deliberately not persisted.
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      mobileOpen: false,
      openGroups: {},
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      setMobileOpen: (open: boolean) => set({ mobileOpen: open }),
      toggleGroup: (label: string) =>
        set((s) => ({ openGroups: { ...s.openGroups, [label]: !s.openGroups[label] } })),
    }),
    {
      name: 'gndj-sidebar',
      partialize: (s) => ({ collapsed: s.collapsed, openGroups: s.openGroups }),
    }
  )
)
