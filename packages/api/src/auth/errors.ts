export class AuthError extends Error {
  public readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Invalid email or password', 'INVALID_CREDENTIALS')
  }
}

export class UserNotFoundError extends AuthError {
  constructor() {
    super('User not found', 'USER_NOT_FOUND')
  }
}

export class TokenExpiredError extends AuthError {
  constructor() {
    super('Token has expired', 'TOKEN_EXPIRED')
  }
}

export class TokenInvalidError extends AuthError {
  constructor(reason?: string) {
    super(reason ?? 'Token is invalid', 'TOKEN_INVALID')
  }
}

export class MissingTokenError extends AuthError {
  constructor() {
    super('Authorization token is required', 'MISSING_TOKEN')
  }
}

export class ForbiddenError extends AuthError {
  constructor(resource?: string) {
    super(
      resource ? `Access to ${resource} is forbidden` : 'Access is forbidden',
      'FORBIDDEN'
    )
  }
}

// ISSUE-24: an authenticated account JWT with no linked playerId is not a bad
// token — re-authenticating cannot fix it. Distinct from TOKEN_INVALID so the
// frontend can stop offering "sign in again" as the remedy.
export class PlayerNotLinkedError extends AuthError {
  constructor() {
    super('Account has no linked player', 'PLAYER_NOT_LINKED')
  }
}
