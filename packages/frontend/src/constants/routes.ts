/**
 * Route constants - Centralized route path definitions
 *
 * Prevents hardcoding route paths throughout the application.
 * Enables easy refactoring of routes without scattered string searches.
 */

export const ROUTES = {
  // Public routes (no auth required)
  HOME: '/',

  // Auth routes (public, but redirected if already authenticated)
  LOGIN: '/login',
  SIGNUP: '/signup',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',

  // Protected routes (require authentication)
  BROWSE: '/browse',
  MATCHES: '/matches',
  STANDINGS: '/standings',
  TOURNAMENT_DETAIL: '/tournament/:tournamentId',
  TOURNAMENT_TAB: '/tournament/:tournamentId/:tab',
}
