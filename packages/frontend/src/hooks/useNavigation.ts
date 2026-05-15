import { useCallback } from 'react'
import { useNavigate as useReactRouterNavigate, useLocation } from 'react-router-dom'

export type NavigationTab = 'standings' | 'matches' | 'bracket' | 'more'

export interface UseNavigationReturn {
  navigate: (tab: NavigationTab) => void
  currentTab: NavigationTab | null
  isActive: (tab: NavigationTab) => boolean
}

export const useNavigation = (): UseNavigationReturn => {
  const navigate = useReactRouterNavigate()
  const location = useLocation()

  const getCurrentTab = useCallback((): NavigationTab | null => {
    const path = location.pathname
    if (path.startsWith('/standings')) return 'standings'
    if (path.startsWith('/matches')) return 'matches'
    if (path.startsWith('/bracket')) return 'bracket'
    if (path.startsWith('/more')) return 'more'
    return null
  }, [location.pathname])

  const handleNavigate = useCallback(
    (tab: NavigationTab) => {
      navigate(`/${tab}`)
    },
    [navigate]
  )

  const handleIsActive = useCallback(
    (tab: NavigationTab) => {
      return getCurrentTab() === tab
    },
    [getCurrentTab]
  )

  return {
    navigate: handleNavigate,
    currentTab: getCurrentTab(),
    isActive: handleIsActive,
  }
}
