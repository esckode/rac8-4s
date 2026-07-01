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

  // Public invite landing (no auth required)
  GROUP_INVITE: '/groups/:groupId/invite',

  // Protected routes (require authentication)
  BROWSE: '/browse',
  ORGANIZER: '/organizer',
  MATCHES: '/matches',
  STANDINGS: '/standings',
  GROUPS: '/groups',
  GROUP_DETAIL: '/groups/:groupId',
  GROUP_SETTINGS: '/groups/:groupId/settings',
  TOURNAMENT_DETAIL: '/tournament/:tournamentId',
  TOURNAMENT_TAB: '/tournament/:tournamentId/:tab',
  TOURNAMENT_MANAGE: '/tournament/:tournamentId/manage',
  REGISTRATION_CONFIRM: '/registrations/:registrationId/confirm',
  NOTIFICATIONS: '/notifications',
}
