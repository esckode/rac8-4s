export class DatabaseError extends Error {
  public readonly code: string
  public readonly statusCode: number

  constructor(message: string, code: string, statusCode: number) {
    super(message)
    this.name = 'DatabaseError'
    this.code = code
    this.statusCode = statusCode
  }
}

export class ConstraintViolationError extends DatabaseError {
  constructor(message: string, code: string) {
    super(message, code, 409)
    this.name = 'ConstraintViolationError'
  }
}

export class UniqueConstraintError extends ConstraintViolationError {
  constructor(field?: string) {
    super(
      field ? `${field} already exists` : 'Value already exists',
      'DUPLICATE_VALUE'
    )
  }
}

export class ForeignKeyConstraintError extends ConstraintViolationError {
  constructor(field?: string) {
    super(
      field ? `Referenced ${field} does not exist` : 'Referenced record does not exist',
      'INVALID_REFERENCE'
    )
    this.statusCode = 400
  }
}

export class CheckConstraintError extends ConstraintViolationError {
  constructor(field?: string) {
    super(
      field ? `Invalid value for ${field}` : 'Invalid constraint value',
      'INVALID_VALUE'
    )
    this.statusCode = 400
  }
}

export class NotNullConstraintError extends ConstraintViolationError {
  constructor(field?: string) {
    super(
      field ? `${field} is required` : 'Required field is missing',
      'REQUIRED_FIELD'
    )
    this.statusCode = 400
  }
}

export class NotFoundError extends DatabaseError {
  constructor(resource?: string) {
    super(
      resource ? `${resource} not found` : 'Record not found',
      'NOT_FOUND',
      404
    )
    this.name = 'NotFoundError'
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message?: string) {
    super(
      message ?? 'Database connection failed',
      'DB_UNAVAILABLE',
      503
    )
    this.name = 'ConnectionError'
  }
}

export class TimeoutError extends DatabaseError {
  constructor(message?: string) {
    super(
      message ?? 'Database query timeout',
      'QUERY_TIMEOUT',
      503
    )
    this.name = 'TimeoutError'
  }
}

export class DeadlockError extends DatabaseError {
  constructor() {
    super('Database transaction deadlock', 'DEADLOCK', 503)
    this.name = 'DeadlockError'
  }
}
