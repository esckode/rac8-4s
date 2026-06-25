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
