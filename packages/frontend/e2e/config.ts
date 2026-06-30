/**
 * E2E Test Configuration
 *
 * Centralized configuration for all e2e tests to avoid hardcoding.
 * Update this file if routes, endpoints, or defaults change - all tests will automatically use new values.
 */

// ============================================================================
// API Configuration
// ============================================================================

export const API_CONFIG = {
  BASE_URL: process.env.API_BASE_URL || 'http://localhost:3001',
  TIMEOUT: 10000, // Default API timeout in ms
}

// ============================================================================
// Routes (Application URLs)
// ============================================================================

export const ROUTES = {
  // Auth pages
  LOGIN: '/login',
  SIGNUP: '/signup',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',

  // Protected pages
  BROWSE: '/browse',
  DASHBOARD: '/dashboard',

  // Tournament pages
  TOURNAMENT_LIST: '/tournaments',
  TOURNAMENT_DETAIL: (id: string) => `/tournament/${id}`,
  TOURNAMENT_BROWSE: (id: string) => `/tournament/${id}/browse`,
  TOURNAMENT_MESSAGES: (id: string) => `/tournament/${id}/messages`,

  // Registration pages
  REGISTRATION_CONFIRM: (id: string) => `/registrations/${id}/confirm`,

  // Organizer pages
  ORGANIZE: '/organize',
  ORGANIZE_TOURNAMENT: (id: string) => `/organize/tournament/${id}`,

  // Group stage pages
  GROUP_STAGE: (tournamentId: string) => `/tournament/${tournamentId}/groups`,
  GROUP_STANDINGS: (tournamentId: string) => `/tournament/${tournamentId}/standings`,

  // Bracket pages
  BRACKET: (tournamentId: string) => `/tournament/${tournamentId}/bracket`,

  // Home
  HOME: '/',

  // Groups (G2.5)
  GROUPS: '/groups',
  GROUP_DETAIL: (groupId: string) => `/groups/${groupId}`,
  GROUP_SETTINGS: (groupId: string) => `/groups/${groupId}/settings`,

  // Invite accept landing (P1.7)
  GROUP_INVITE: (groupId: string, token: string, email: string) =>
    `/groups/${groupId}/invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
}

// ============================================================================
// API Endpoints
// ============================================================================

export const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: '/api/auth/login',
    SIGNUP: '/api/auth/signup',
    LOGOUT: '/api/auth/logout',
    ME: '/api/auth/me',
    FORGOT_PASSWORD: '/api/auth/forgot-password',
    RESET_PASSWORD: '/api/auth/reset-password',
  },

  // Tournaments
  TOURNAMENTS: {
    LIST: '/tournaments/public',
    CREATE: '/tournaments',
    GET: (id: string) => `/tournaments/${id}`,
    UPDATE: (id: string) => `/tournaments/${id}`,
  },

  // Registrations
  REGISTRATIONS: {
    CREATE: '/api/registrations',
    GET: (id: string) => `/api/registrations/${id}`,
    CONFIRM: (id: string) => `/api/registrations/${id}/confirm`,
    CANCEL: (id: string) => `/api/registrations/${id}/cancel`,
  },

  // Group Stage
  GROUP_STAGE: {
    LIST: (tournamentId: string) => `/api/tournaments/${tournamentId}/groups`,
    UPDATE_SCORES: (groupId: string) => `/api/groups/${groupId}/scores`,
  },

  // Bracket
  BRACKET: {
    GET: (tournamentId: string) => `/api/tournaments/${tournamentId}/bracket`,
    UPDATE_MATCH: (matchId: string) => `/api/matches/${matchId}`,
  },

  // Messaging
  MESSAGES: {
    HISTORY: (tournamentId: string) => `/tournaments/${tournamentId}/messages`,
    SEND: (tournamentId: string) => `/tournaments/${tournamentId}/messages`,
    ANNOUNCE: (tournamentId: string) => `/tournaments/${tournamentId}/announcements`,
    MARK_READ: (tournamentId: string, msgId: string) => `/tournaments/${tournamentId}/messages/${msgId}/read`,
  },

  // Health check
  HEALTH: '/health',
}

// ============================================================================
// UI Text & Labels (for semantic selectors)
// ============================================================================

export const UI_TEXT = {
  // Button labels
  BUTTONS: {
    SIGN_IN: ['Sign In', 'Log In'],
    SIGN_UP: 'Sign Up',
    CREATE_ACCOUNT: 'Create Account',
    SEND_RESET_CODE: ['Send Reset Code', 'Send', 'Request'],
    UPDATE_PASSWORD: ['Update Password', 'Reset', 'Save'],
    REGISTER: ['Register', 'Register for Tournament'],
    CONFIRM: 'Confirm',
    CANCEL: 'Cancel',
    LOGOUT: ['Logout', 'Log Out', 'Sign Out'],
    SHOW: 'Show',
    HIDE: 'Hide',
  },

  // Links
  LINKS: {
    FORGOT_PASSWORD: 'Forgot password?',
    SIGN_IN: 'Sign in',
    SIGN_UP: 'Sign up',
    BACK: 'Back',
  },

  // Error messages (use these as patterns, not exact matches)
  ERRORS: {
    INVALID_EMAIL: /please enter a valid email/i,
    INVALID_CREDENTIALS: /invalid email or password/i,
    EMAIL_IN_USE: /email already in use/i,
    PASSWORDS_DONT_MATCH: /passwords don't match/i,
    REQUIRED_FIELD: /required/i,
    INVALID_CODE: /invalid|expired/i,
    CODE_LENGTH: /6 digits/i,
  },

  // Success messages (patterns for flexibility)
  SUCCESS: {
    SIGNUP: /success|created|welcome/i,
    LOGIN: /success|logged in/i,
    RESET_SENT: /success|sent|check/i,
    PASSWORD_RESET: /success|updated/i,
    REGISTERED: /success|registered|confirmed/i,
  },
}

// ============================================================================
// Timeout Configuration
// ============================================================================

export const TIMEOUTS = {
  // Navigation waits
  PAGE_LOAD: process.env.TIMEOUT_PAGE_LOAD ? parseInt(process.env.TIMEOUT_PAGE_LOAD) : 10000,
  NETWORK_IDLE: process.env.TIMEOUT_NETWORK_IDLE ? parseInt(process.env.TIMEOUT_NETWORK_IDLE) : 10000,

  // Element visibility
  ELEMENT_VISIBLE: process.env.TIMEOUT_ELEMENT ? parseInt(process.env.TIMEOUT_ELEMENT) : 5000,
  ELEMENT_HIDDEN: process.env.TIMEOUT_ELEMENT ? parseInt(process.env.TIMEOUT_ELEMENT) : 3000,

  // API calls
  API_RESPONSE: process.env.TIMEOUT_API ? parseInt(process.env.TIMEOUT_API) : 10000,

  // Custom waits
  CUSTOM_CONDITION: 5000,

  // Simple delays (use sparingly)
  REQUEST_PROCESSING: 2000,
}

// ============================================================================
// Test Data Defaults
// ============================================================================

export const TEST_DATA = {
  USER: {
    DEFAULT_NAME: 'Test User',
    DEFAULT_PASSWORD: 'TestPassword123',

    // Generate unique email per test run
    generateEmail: () => `test-${Date.now()}@example.com`,
  },

  TOURNAMENT: {
    DEFAULT_NAME_PREFIX: 'Test Tournament',
    DEFAULT_SPORT: 'pickleball',
    DEFAULT_FORMAT_SINGLES: 'singles',
    DEFAULT_FORMAT_DOUBLES: 'doubles',
    DEFAULT_MAX_PLAYERS: 16,

    // Generate unique tournament name per test run
    generateName: () => `Test Tournament ${Date.now()}`,
  },

  REGISTRATION: {
    DEFAULT_PARTNER_TYPE_INVITE: 'invite',
    DEFAULT_PARTNER_TYPE_SELECT: 'select',
  },
}

// ============================================================================
// Selectors (Centralized for maintenance)
// ============================================================================

export const SELECTORS = {
  // Form inputs
  EMAIL_INPUT: 'input[type="email"]',
  PASSWORD_INPUT: 'input[type="password"]',
  NAME_INPUT: 'input[placeholder*="name"], input[placeholder*="Name"]',
  CODE_INPUT: 'input[placeholder*="code"], input[placeholder*="Code"], input[placeholder*="reset"]',

  // Buttons (prefer by text over these)
  SIGN_IN_BUTTON: (text = 'Sign In') => `button:has-text("${text}"), button:has-text("Log In")`,
  CREATE_BUTTON: (text = 'Create Account') => `button:has-text("${text}")`,
  SUBMIT_BUTTON: (text = 'Submit') => `button:has-text("${text}")`,

  // Links
  FORGOT_PASSWORD_LINK: 'button:has-text("Forgot password?")',
  SIGN_IN_LINK: 'text=Sign in',
  SIGN_UP_LINK: 'text=Sign up',

  // Messages
  ERROR_MESSAGE: 'text=/error|invalid|failed/i',
  SUCCESS_MESSAGE: 'text=/success|created|registered/i',

  // Lists
  TOURNAMENT_CARDS: '[data-testid="tournament-card"], .tournament-card',
  TOURNAMENT_LIST: '[data-testid="tournament-list"], .tournament-list',
  STANDINGS_TABLE: '[data-testid="standings-table"], .standings-table',
  STANDINGS_ROW: '[data-testid="standings-row"]',
  STANDINGS_WINS: '[data-testid="standings-wins"]',
  BRACKET_MATCHES: '[data-testid="match-card"], .match-card',

  // Bracket (knockout)
  BRACKET_TREE: '[data-testid="bracket-tree"]',
  BRACKET_ROUND: '[data-testid="bracket-round"]',
  BRACKET_PENDING: '[data-testid="bracket-pending"]',

  // Partner requests (doubles)
  PARTNER_FINDER: '[data-testid="partner-finder"]',
  PARTNER_ROW: '[data-testid="partner-row"]',
  REQUEST_PARTNER_BUTTON: '[data-testid="request-partner-button"]',
  PARTNER_ERROR: '[data-testid="partner-error"]',
  CONFIRM_PARTNERSHIP_BUTTON: '[data-testid="confirm-partnership-button"]',
  CONFIRM_SUCCESS: '[data-testid="confirm-success"]',
  CONFIRM_ERROR: '[data-testid="confirm-error"]',

  // Messaging
  MESSAGE_PANEL: '[data-testid="message-panel"]',
  MESSAGE_ITEM: '[data-testid="message-item"]',
  MESSAGE_INPUT: '[data-testid="message-input"]',
  MESSAGE_SEND_BUTTON: '[data-testid="message-send-button"]',
  ANNOUNCE_BUTTON: '[data-testid="announce-button"]',
  ANNOUNCE_INPUT: '[data-testid="announce-input"]',
  UNREAD_BADGE: '[data-testid="messages-unread-badge"]',
  MESSAGES_TAB: '[data-testid="tab-messages"]',

  // Shared state components — P1.1
  EMPTY_STATE: '[data-testid="empty-state"]',
  LOADING_STATE: '[data-testid="loading-state"]',
  ERROR_STATE: '[data-testid="error-state"]',
  RECONNECTING_INDICATOR: '[data-testid="reconnecting-indicator"]',

  // Groups — G2.5
  NAV_GROUPS: '[data-testid="nav-groups"]',
  GROUPS_UNREAD_BADGE: '[data-testid="groups-unread-badge"]',
  GROUP_LIST_ITEM: '[data-testid="group-list-item"]',
  GROUP_LIST_EMPTY: '[data-testid="group-list-empty"]',
  GROUP_LIST_ERROR: '[data-testid="group-list-error"]',
  GROUP_CHAT_PANEL: '[data-testid="group-chat-panel"]',
  GROUP_MESSAGE_ITEM: '[data-testid="group-message-item"]',
  GROUP_SYSTEM_EVENT: '[data-testid="group-system-event"]',
  GROUP_MESSAGE_INPUT: '[data-testid="group-message-input"]',
  GROUP_MESSAGE_SEND_BUTTON: '[data-testid="group-message-send-button"]',
  GROUP_TAB_CHAT: '[data-testid="group-tab-chat"]',
  GROUP_TAB_MEMBERS: '[data-testid="group-tab-members"]',
  MEMBERS_PANEL: '[data-testid="members-panel"]',
  MEMBER_ITEM: '[data-testid="member-item"]',
  INVITE_EMAIL_INPUT: '[data-testid="invite-email-input"]',
  INVITE_SEND_BUTTON: '[data-testid="invite-send-button"]',
  INVITE_SUCCESS: '[data-testid="invite-success"]',
  INVITE_ERROR: '[data-testid="invite-error"]',

  // Group Settings — P1.4
  GROUP_DETAIL_HEADER: '[data-testid="group-detail-header"]',
  GROUP_SETTINGS_GEAR: '[data-testid="group-settings-gear"]',
  GROUP_SETTINGS_PAGE: '[data-testid="group-settings-page"]',
  GROUP_SETTINGS_OWNER_SECTION: '[data-testid="group-settings-owner-section"]',
  GROUP_SETTINGS_MEMBER_SECTION: '[data-testid="group-settings-member-section"]',

  // Notify-level control + Leave — P1.5
  NOTIFY_LEVEL_CONTROL: '[data-testid="notify-level-control"]',
  NOTIFY_LEVEL_OPTION_ALL: '[data-testid="notify-level-option-all"]',
  NOTIFY_LEVEL_OPTION_MENTIONS_POLLS: '[data-testid="notify-level-option-mentions-polls"]',
  NOTIFY_LEVEL_OPTION_MUTED: '[data-testid="notify-level-option-muted"]',
  LEAVE_GROUP_BUTTON: '[data-testid="leave-group-button"]',

  // Invite accept landing — P1.7
  INVITE_ACCEPT_PAGE: '[data-testid="invite-accept-page"]',
  INVITE_AGE_GATE: '[data-testid="invite-age-gate"]',
  INVITE_UNDERAGE: '[data-testid="invite-underage"]',
  INVITE_INVALID: '[data-testid="invite-invalid"]',
  INVITE_NOT_FOUND: '[data-testid="invite-not-found"]',
  // INVITE_SUCCESS already declared above (shared with invite-send flow)

  // Owner member management + Group config — P1.6
  MANAGE_MEMBERS_LIST: '[data-testid="manage-members-list"]',
  MEMBER_ROW: (playerId: string) => `[data-testid="member-row-${playerId}"]`,
  PROMOTE_BUTTON: '[data-testid="promote-button"]',
  DEMOTE_BUTTON: '[data-testid="demote-button"]',
  KICK_BUTTON: '[data-testid="kick-button"]',
  KICK_CONFIRM_DIALOG: '[data-testid="kick-confirm-dialog"]',
  KICK_CONFIRM_BUTTON: '[data-testid="kick-confirm-button"]',
  LAST_OWNER_ERROR: '[data-testid="last-owner-error"]',
  GROUP_NAME_INPUT: '[data-testid="group-name-input"]',
  GROUP_NAME_SAVE: '[data-testid="group-name-save"]',
  MATCH_FORMAT_SELECT: '[data-testid="match-format-select"]',

  // Poll cards — G3.3
  POLL_CARD: '[data-testid="poll-card"]',
  POLL_QUESTION: '[data-testid="poll-question"]',
  POLL_TARGET_TIME: '[data-testid="poll-target-time"]',
  POLL_VOTE_IN: '[data-testid="poll-vote-in"]',
  POLL_VOTE_OUT: '[data-testid="poll-vote-out"]',
  POLL_VOTE_MAYBE: '[data-testid="poll-vote-maybe"]',
  POLL_TALLY: '[data-testid="poll-tally"]',
  POLL_CLOSE_BUTTON: '[data-testid="poll-close-button"]',
  POLL_LAUNCH_BUTTON: '[data-testid="poll-launch-button"]',
  LEADERBOARD_PANEL: '[data-testid="leaderboard-panel"]',
  LEADERBOARD_INDIVIDUAL: '[data-testid="leaderboard-individual"]',
  LEADERBOARD_PAIRS: '[data-testid="leaderboard-pairs"]',
  LEADERBOARD_INDIVIDUAL_ROW: '[data-testid="leaderboard-individual-row"]',
  LEADERBOARD_PAIR_ROW: '[data-testid="leaderboard-pair-row"]',

  // Messaging — V5.2 thread model
  MESSAGE_THREAD_PANEL: '[data-testid="message-thread-panel"]',
  CHANNEL_SWITCHER: '[data-testid="channel-switcher"]',
  CHANNEL_ANNOUNCEMENTS: '[data-testid="channel-announcements"]',
  CHANNEL_DM: (playerId: string) => `[data-testid="channel-dm-${playerId}"]`,
  CHANNEL_MATCH: (matchId: string) => `[data-testid="channel-match-${matchId}"]`,
  ANNOUNCEMENTS_READONLY_NOTICE: '[data-testid="announcements-readonly-notice"]',
  MESSAGE_OPPONENT_BUTTON: '[data-testid="message-opponent-button"]',
  MATCH_MESSAGE_COMPOSE: '[data-testid="match-message-compose"]',
  MATCH_COMPOSE_CONTEXT: '[data-testid="match-compose-context"]',
  MATCH_COMPOSE_CLOSE: '[data-testid="match-compose-close"]',
  MATCH_COMPOSE_INPUT: '[data-testid="match-compose-input"]',
  MATCH_COMPOSE_SEND: '[data-testid="match-compose-send"]',
}

// ============================================================================
// Browser Configuration
// ============================================================================

export const BROWSER_CONFIG = {
  HEADLESS: process.env.HEADLESS !== 'false',
  SLOWMO: process.env.SLOWMO ? parseInt(process.env.SLOWMO) : 0,
  VIEWPORT_WIDTH: 1280,
  VIEWPORT_HEIGHT: 720,
}

// ============================================================================
// Environment Configuration
// ============================================================================

export const ENV = {
  // Get from environment or use defaults
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3001',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DEBUG: process.env.DEBUG === 'true',
}

// ============================================================================
// Helper function to build full URLs
// ============================================================================

export function getFullUrl(route: string): string {
  return `${ENV.FRONTEND_URL}${route}`
}

export function getApiUrl(endpoint: string): string {
  return `${ENV.API_BASE_URL}${endpoint}`
}

// ============================================================================
// Usage Examples
// ============================================================================

/*
// In your test file:
import { ROUTES, API_ENDPOINTS, TIMEOUTS, UI_TEXT, TEST_DATA, SELECTORS } from './config'

// Routes
await page.goto(ROUTES.LOGIN)
await expect(page).toHaveURL(ROUTES.BROWSE)

// API endpoints
await apiCall(API_ENDPOINTS.AUTH.SIGNUP, 'POST', { ... })
await apiCall(API_ENDPOINTS.TOURNAMENTS.GET('123'), 'GET')

// Timeouts
await page.goto(ROUTES.BROWSE, { waitUntil: 'networkidle' })
await expect(page.locator('...')).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE })

// Test data
const user = {
  email: TEST_DATA.USER.generateEmail(),
  name: TEST_DATA.USER.DEFAULT_NAME,
  password: TEST_DATA.USER.DEFAULT_PASSWORD,
}

// Selectors
await page.fill(SELECTORS.EMAIL_INPUT, 'test@example.com')
await page.click(SELECTORS.SIGN_IN_BUTTON())

// UI text for assertions
await expect(page.locator('text=' + UI_TEXT.ERRORS.INVALID_EMAIL)).toBeVisible()
*/
