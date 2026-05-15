/**
 * usePageNavigation - Track page navigation and time-on-screen
 *
 * Measures time spent on each page/screen and auto-logs screen_view events
 * to analytics via useAnalytics hook. Ensures cleanup on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAnalytics } from './useAnalytics'

export interface UsePageNavigationReturn {
  currentPage: string
  navigateTo: (page: string) => void
}

export function usePageNavigation(): UsePageNavigationReturn {
  const [currentPage, setCurrentPage] = useState('landing')
  const previousPageRef = useRef<string | null>(null)
  const pageEnterTimeRef = useRef(Date.now())

  const { track } = useAnalytics()

  const navigateTo = useCallback(
    (page: string): void => {
      // Calculate time on previous page
      if (previousPageRef.current) {
        const timeOnScreen = Date.now() - pageEnterTimeRef.current
        track('screen_view', {
          screen: previousPageRef.current,
          duration: timeOnScreen,
        })
      }

      // Update refs for new page
      previousPageRef.current = currentPage
      pageEnterTimeRef.current = Date.now()

      // Update current page state
      setCurrentPage(page)
    },
    [currentPage, track]
  )

  // Cleanup on unmount: log time on current page
  useEffect(() => {
    return () => {
      const timeOnScreen = Date.now() - pageEnterTimeRef.current
      track('screen_view', {
        screen: currentPage,
        duration: timeOnScreen,
      })
    }
  }, [currentPage, track])

  return {
    currentPage,
    navigateTo,
  }
}
