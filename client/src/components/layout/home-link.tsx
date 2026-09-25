// Link to the dashboard ("Accueil") used by the logo/brand. In the installed app it steps back to the dashboard
// already at the bottom of the history instead of stacking another copy (see hooks/use-menu-replace.ts), so the
// phone's back button then closes the app.
import { Link, type LinkProps } from 'react-router'
import { useGoHomeClick } from '@/hooks/use-menu-replace'

export function HomeLink({ onClick, ...props }: Omit<LinkProps, 'to'>) {
  const goHome = useGoHomeClick()
  return (
    <Link
      to="/dashboard"
      {...props}
      onClick={(e) => { goHome(e); onClick?.(e) }}
    />
  )
}
