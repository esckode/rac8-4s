import { useLocation, useNavigate } from 'react-router-dom'

/**
 * True history-back for pushed screens (auth pages, tournament detail, etc.),
 * instead of a hardcoded navigate(<literal>). react-router v6 sets
 * location.key === 'default' on a cold first load (nothing pushed within
 * the router) — nothing to pop in that case, so fall back to the given
 * parent route.
 */
export function useBack(fallback: string = '/'): () => void {
  const location = useLocation()
  const navigate = useNavigate()
  return () => {
    if (location.key !== 'default') {
      navigate(-1)
    } else {
      navigate(fallback)
    }
  }
}
