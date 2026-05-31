import {
  DatabaseError,
  ConstraintViolationError,
  UniqueConstraintError,
  ForeignKeyConstraintError,
  CheckConstraintError,
  NotNullConstraintError,
  NotFoundError,
  ConnectionError,
  TimeoutError,
  DeadlockError,
} from '../../db/errors'

describe('db/errors.ts - Error Classes', () => {
  describe('DatabaseError', () => {
    it('creates DatabaseError with message, code, and statusCode', () => {
      const err = new DatabaseError('Test database error', 'DB_ERROR', 500)

      expect(err).toBeInstanceOf(DatabaseError)
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toBe('Test database error')
      expect(err.code).toBe('DB_ERROR')
      expect(err.statusCode).toBe(500)
    })

    it('sets name property to "DatabaseError"', () => {
      const err = new DatabaseError('Test', 'DB_ERROR', 500)
      expect(err.name).toBe('DatabaseError')
    })

    it('has proper error stack trace', () => {
      const err = new DatabaseError('Test', 'DB_ERROR', 500)
      expect(err.stack).toBeDefined()
      expect(err.stack).toContain('DatabaseError')
    })

    it('preserves code and statusCode as readonly properties', () => {
      const err = new DatabaseError('Test', 'DB_ERROR', 500)
      const code = err.code
      const statusCode = err.statusCode

      expect(code).toBe('DB_ERROR')
      expect(statusCode).toBe(500)
    })
  })

  describe('ConstraintViolationError', () => {
    it('creates ConstraintViolationError with custom statusCode', () => {
      const err = new ConstraintViolationError('Constraint failed', 'CONSTRAINT_VIOLATION', 409)

      expect(err).toBeInstanceOf(ConstraintViolationError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err.message).toBe('Constraint failed')
      expect(err.code).toBe('CONSTRAINT_VIOLATION')
      expect(err.statusCode).toBe(409)
    })

    it('sets default statusCode to 409 when not provided', () => {
      const err = new ConstraintViolationError('Constraint failed', 'CONSTRAINT_VIOLATION')

      expect(err.statusCode).toBe(409)
    })

    it('sets name property to "ConstraintViolationError"', () => {
      const err = new ConstraintViolationError('Test', 'CONSTRAINT')
      expect(err.name).toBe('ConstraintViolationError')
    })

    it('allows custom statusCode override', () => {
      const err = new ConstraintViolationError('Constraint', 'CONSTRAINT', 400)
      expect(err.statusCode).toBe(400)
    })
  })

  describe('UniqueConstraintError', () => {
    it('creates UniqueConstraintError with field name', () => {
      const err = new UniqueConstraintError('email')

      expect(err).toBeInstanceOf(UniqueConstraintError)
      expect(err).toBeInstanceOf(ConstraintViolationError)
      expect(err.message).toBe('email already exists')
      expect(err.code).toBe('DUPLICATE_VALUE')
      expect(err.statusCode).toBe(409)
    })

    it('creates UniqueConstraintError without field name', () => {
      const err = new UniqueConstraintError()

      expect(err.message).toBe('Value already exists')
      expect(err.code).toBe('DUPLICATE_VALUE')
    })

    it('sets name property correctly', () => {
      const err = new UniqueConstraintError('username')
      expect(err.name).toBe('ConstraintViolationError')
    })

    it('handles different field names', () => {
      const fields = ['username', 'email', 'tournament_id', 'phone_number']

      fields.forEach(field => {
        const err = new UniqueConstraintError(field)
        expect(err.message).toBe(`${field} already exists`)
      })
    })

    it('includes field name in message when provided', () => {
      const err = new UniqueConstraintError('api_key')
      expect(err.message).toContain('api_key')
    })
  })

  describe('ForeignKeyConstraintError', () => {
    it('creates ForeignKeyConstraintError with field name', () => {
      const err = new ForeignKeyConstraintError('tournament')

      expect(err).toBeInstanceOf(ForeignKeyConstraintError)
      expect(err).toBeInstanceOf(ConstraintViolationError)
      expect(err.message).toBe('Referenced tournament does not exist')
      expect(err.code).toBe('INVALID_REFERENCE')
      expect(err.statusCode).toBe(400)
    })

    it('creates ForeignKeyConstraintError without field name', () => {
      const err = new ForeignKeyConstraintError()

      expect(err.message).toBe('Referenced record does not exist')
      expect(err.code).toBe('INVALID_REFERENCE')
      expect(err.statusCode).toBe(400)
    })

    it('uses 400 statusCode not 409', () => {
      const err = new ForeignKeyConstraintError('player')
      expect(err.statusCode).toBe(400)
    })

    it('handles different field names', () => {
      const fields = ['player', 'location', 'group', 'organizer']

      fields.forEach(field => {
        const err = new ForeignKeyConstraintError(field)
        expect(err.message).toBe(`Referenced ${field} does not exist`)
      })
    })
  })

  describe('CheckConstraintError', () => {
    it('creates CheckConstraintError with field name', () => {
      const err = new CheckConstraintError('status')

      expect(err).toBeInstanceOf(CheckConstraintError)
      expect(err).toBeInstanceOf(ConstraintViolationError)
      expect(err.message).toBe('Invalid value for status')
      expect(err.code).toBe('INVALID_VALUE')
      expect(err.statusCode).toBe(400)
    })

    it('creates CheckConstraintError without field name', () => {
      const err = new CheckConstraintError()

      expect(err.message).toBe('Invalid constraint value')
      expect(err.code).toBe('INVALID_VALUE')
    })

    it('uses 400 statusCode', () => {
      const err = new CheckConstraintError('tournament_status')
      expect(err.statusCode).toBe(400)
    })

    it('handles various field names', () => {
      const fields = ['match_format', 'registration_status', 'match_status', 'court_status']

      fields.forEach(field => {
        const err = new CheckConstraintError(field)
        expect(err.message).toBe(`Invalid value for ${field}`)
      })
    })
  })

  describe('NotNullConstraintError', () => {
    it('creates NotNullConstraintError with field name', () => {
      const err = new NotNullConstraintError('name')

      expect(err).toBeInstanceOf(NotNullConstraintError)
      expect(err).toBeInstanceOf(ConstraintViolationError)
      expect(err.message).toBe('name is required')
      expect(err.code).toBe('REQUIRED_FIELD')
      expect(err.statusCode).toBe(400)
    })

    it('creates NotNullConstraintError without field name', () => {
      const err = new NotNullConstraintError()

      expect(err.message).toBe('Required field is missing')
      expect(err.code).toBe('REQUIRED_FIELD')
    })

    it('uses 400 statusCode', () => {
      const err = new NotNullConstraintError('tournament_id')
      expect(err.statusCode).toBe(400)
    })

    it('handles compound field names', () => {
      const fields = ['first_name', 'email_address', 'organizer_id', 'sport']

      fields.forEach(field => {
        const err = new NotNullConstraintError(field)
        expect(err.message).toBe(`${field} is required`)
      })
    })
  })

  describe('NotFoundError', () => {
    it('creates NotFoundError with resource name', () => {
      const err = new NotFoundError('Tournament')

      expect(err).toBeInstanceOf(NotFoundError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err.message).toBe('Tournament not found')
      expect(err.code).toBe('NOT_FOUND')
      expect(err.statusCode).toBe(404)
    })

    it('creates NotFoundError without resource name', () => {
      const err = new NotFoundError()

      expect(err.message).toBe('Record not found')
      expect(err.code).toBe('NOT_FOUND')
      expect(err.statusCode).toBe(404)
    })

    it('sets name property to "NotFoundError"', () => {
      const err = new NotFoundError('Player')
      expect(err.name).toBe('NotFoundError')
    })

    it('uses 404 statusCode', () => {
      const err = new NotFoundError('Match')
      expect(err.statusCode).toBe(404)
    })

    it('handles various resource names', () => {
      const resources = ['Tournament', 'Player', 'Group', 'Match', 'Location', 'Court']

      resources.forEach(resource => {
        const err = new NotFoundError(resource)
        expect(err.message).toBe(`${resource} not found`)
      })
    })
  })

  describe('ConnectionError', () => {
    it('creates ConnectionError with custom message', () => {
      const err = new ConnectionError('Connection to database refused')

      expect(err).toBeInstanceOf(ConnectionError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err.message).toBe('Connection to database refused')
      expect(err.code).toBe('DB_UNAVAILABLE')
      expect(err.statusCode).toBe(503)
    })

    it('creates ConnectionError with default message', () => {
      const err = new ConnectionError()

      expect(err.message).toBe('Database connection failed')
      expect(err.code).toBe('DB_UNAVAILABLE')
      expect(err.statusCode).toBe(503)
    })

    it('sets name property to "ConnectionError"', () => {
      const err = new ConnectionError('Custom message')
      expect(err.name).toBe('ConnectionError')
    })

    it('uses 503 statusCode for service unavailable', () => {
      const err = new ConnectionError()
      expect(err.statusCode).toBe(503)
    })

    it('handles various connection error messages', () => {
      const messages = [
        'Connection timeout',
        'Connection refused',
        'Network unreachable',
        'Pool exhausted',
      ]

      messages.forEach(message => {
        const err = new ConnectionError(message)
        expect(err.message).toBe(message)
      })
    })
  })

  describe('TimeoutError', () => {
    it('creates TimeoutError with custom message', () => {
      const err = new TimeoutError('Query execution exceeded 5 seconds')

      expect(err).toBeInstanceOf(TimeoutError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err.message).toBe('Query execution exceeded 5 seconds')
      expect(err.code).toBe('QUERY_TIMEOUT')
      expect(err.statusCode).toBe(503)
    })

    it('creates TimeoutError with default message', () => {
      const err = new TimeoutError()

      expect(err.message).toBe('Database query timeout')
      expect(err.code).toBe('QUERY_TIMEOUT')
      expect(err.statusCode).toBe(503)
    })

    it('sets name property to "TimeoutError"', () => {
      const err = new TimeoutError('Custom timeout message')
      expect(err.name).toBe('TimeoutError')
    })

    it('uses 503 statusCode for service unavailable', () => {
      const err = new TimeoutError()
      expect(err.statusCode).toBe(503)
    })

    it('handles various timeout messages', () => {
      const messages = [
        'Lock timeout expired',
        'Statement timeout',
        'Transaction timeout',
        'Idle timeout',
      ]

      messages.forEach(message => {
        const err = new TimeoutError(message)
        expect(err.message).toBe(message)
      })
    })
  })

  describe('DeadlockError', () => {
    it('creates DeadlockError with fixed message', () => {
      const err = new DeadlockError()

      expect(err).toBeInstanceOf(DeadlockError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err.message).toBe('Database transaction deadlock')
      expect(err.code).toBe('DEADLOCK')
      expect(err.statusCode).toBe(503)
    })

    it('sets name property to "DeadlockError"', () => {
      const err = new DeadlockError()
      expect(err.name).toBe('DeadlockError')
    })

    it('uses 503 statusCode for service unavailable', () => {
      const err = new DeadlockError()
      expect(err.statusCode).toBe(503)
    })

    it('has consistent message across instances', () => {
      const err1 = new DeadlockError()
      const err2 = new DeadlockError()

      expect(err1.message).toBe(err2.message)
      expect(err1.code).toBe(err2.code)
      expect(err1.statusCode).toBe(err2.statusCode)
    })
  })

  describe('Error Inheritance and Instanceof Checks', () => {
    it('UniqueConstraintError is instance of multiple error types', () => {
      const err = new UniqueConstraintError('field')

      expect(err).toBeInstanceOf(UniqueConstraintError)
      expect(err).toBeInstanceOf(ConstraintViolationError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err).toBeInstanceOf(Error)
    })

    it('ForeignKeyConstraintError is instance of multiple error types', () => {
      const err = new ForeignKeyConstraintError('table')

      expect(err).toBeInstanceOf(ForeignKeyConstraintError)
      expect(err).toBeInstanceOf(ConstraintViolationError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err).toBeInstanceOf(Error)
    })

    it('CheckConstraintError is instance of multiple error types', () => {
      const err = new CheckConstraintError('column')

      expect(err).toBeInstanceOf(CheckConstraintError)
      expect(err).toBeInstanceOf(ConstraintViolationError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err).toBeInstanceOf(Error)
    })

    it('NotNullConstraintError is instance of multiple error types', () => {
      const err = new NotNullConstraintError('column')

      expect(err).toBeInstanceOf(NotNullConstraintError)
      expect(err).toBeInstanceOf(ConstraintViolationError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err).toBeInstanceOf(Error)
    })

    it('NotFoundError is instance of DatabaseError and Error', () => {
      const err = new NotFoundError('Resource')

      expect(err).toBeInstanceOf(NotFoundError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err).toBeInstanceOf(Error)
    })

    it('ConnectionError is instance of DatabaseError and Error', () => {
      const err = new ConnectionError()

      expect(err).toBeInstanceOf(ConnectionError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err).toBeInstanceOf(Error)
    })

    it('TimeoutError is instance of DatabaseError and Error', () => {
      const err = new TimeoutError()

      expect(err).toBeInstanceOf(TimeoutError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err).toBeInstanceOf(Error)
    })

    it('DeadlockError is instance of DatabaseError and Error', () => {
      const err = new DeadlockError()

      expect(err).toBeInstanceOf(DeadlockError)
      expect(err).toBeInstanceOf(DatabaseError)
      expect(err).toBeInstanceOf(Error)
    })
  })

  describe('Error Properties and Access', () => {
    it('DatabaseError properties are accessible', () => {
      const err = new DatabaseError('Message', 'CODE', 400)

      expect(typeof err.message).toBe('string')
      expect(typeof err.code).toBe('string')
      expect(typeof err.statusCode).toBe('number')
      expect(typeof err.name).toBe('string')
    })

    it('ConstraintViolationError inherits all properties from DatabaseError', () => {
      const err = new ConstraintViolationError('Message', 'CODE', 409)

      expect(err.message).toBe('Message')
      expect(err.code).toBe('CODE')
      expect(err.statusCode).toBe(409)
      expect(err.name).toBe('ConstraintViolationError')
    })

    it('Error with optional parameter uses default when omitted', () => {
      const errWithField = new UniqueConstraintError('field')
      const errWithoutField = new UniqueConstraintError()

      expect(errWithField.message).not.toBe(errWithoutField.message)
      expect(errWithField.message).toContain('field')
      expect(errWithoutField.message).not.toContain('field')
    })

    it('ConnectionError message is properly replaced with null coalescing', () => {
      const customMessage = 'Custom error'
      const err1 = new ConnectionError(customMessage)
      const err2 = new ConnectionError()

      expect(err1.message).toBe(customMessage)
      expect(err2.message).toBe('Database connection failed')
      expect(err1.message).not.toBe(err2.message)
    })

    it('TimeoutError message is properly replaced with null coalescing', () => {
      const customMessage = 'Custom timeout'
      const err1 = new TimeoutError(customMessage)
      const err2 = new TimeoutError()

      expect(err1.message).toBe(customMessage)
      expect(err2.message).toBe('Database query timeout')
      expect(err1.message).not.toBe(err2.message)
    })
  })

  describe('Error Message Variations', () => {
    it('treats empty string as falsy in UniqueConstraintError', () => {
      const err = new UniqueConstraintError('')

      expect(err.message).toBe('Value already exists')
    })

    it('treats empty string as falsy in ForeignKeyConstraintError', () => {
      const err = new ForeignKeyConstraintError('')

      expect(err.message).toBe('Referenced record does not exist')
    })

    it('treats empty string as falsy in CheckConstraintError', () => {
      const err = new CheckConstraintError('')

      expect(err.message).toBe('Invalid constraint value')
    })

    it('treats empty string as falsy in NotNullConstraintError', () => {
      const err = new NotNullConstraintError('')

      expect(err.message).toBe('Required field is missing')
    })

    it('handles special characters in field names', () => {
      const fieldNames = ['field-name', 'field_name', 'field.name', 'field123']

      fieldNames.forEach(fieldName => {
        const err = new UniqueConstraintError(fieldName)
        expect(err.message).toContain(fieldName)
      })
    })

    it('handles special characters in resource names', () => {
      const resourceNames = ['Tournament-Match', 'Player_Group', 'Location.Court']

      resourceNames.forEach(resourceName => {
        const err = new NotFoundError(resourceName)
        expect(err.message).toContain(resourceName)
      })
    })
  })

  describe('Error Codes and Status Codes', () => {
    it('all DatabaseError subclasses have codes', () => {
      const errors = [
        new DatabaseError('Test', 'DB_ERROR', 500),
        new UniqueConstraintError('field'),
        new ForeignKeyConstraintError('ref'),
        new CheckConstraintError('check'),
        new NotNullConstraintError('null'),
        new NotFoundError('Resource'),
        new ConnectionError(),
        new TimeoutError(),
        new DeadlockError(),
      ]

      errors.forEach(err => {
        expect(err.code).toBeDefined()
        expect(typeof err.code).toBe('string')
        expect(err.code.length).toBeGreaterThan(0)
      })
    })

    it('all DatabaseError subclasses have status codes', () => {
      const errors = [
        new DatabaseError('Test', 'DB_ERROR', 500),
        new UniqueConstraintError('field'),
        new ForeignKeyConstraintError('ref'),
        new CheckConstraintError('check'),
        new NotNullConstraintError('null'),
        new NotFoundError('Resource'),
        new ConnectionError(),
        new TimeoutError(),
        new DeadlockError(),
      ]

      errors.forEach(err => {
        expect(err.statusCode).toBeDefined()
        expect(typeof err.statusCode).toBe('number')
        expect(err.statusCode).toBeGreaterThanOrEqual(400)
        expect(err.statusCode).toBeLessThan(600)
      })
    })

    it('constraint errors use 409 or 400 status codes', () => {
      expect(new UniqueConstraintError('f').statusCode).toBe(409)
      expect(new ForeignKeyConstraintError('f').statusCode).toBe(400)
      expect(new CheckConstraintError('f').statusCode).toBe(400)
      expect(new NotNullConstraintError('f').statusCode).toBe(400)
    })

    it('service errors use 503 status code', () => {
      expect(new ConnectionError().statusCode).toBe(503)
      expect(new TimeoutError().statusCode).toBe(503)
      expect(new DeadlockError().statusCode).toBe(503)
    })

    it('not found error uses 404 status code', () => {
      expect(new NotFoundError('Resource').statusCode).toBe(404)
    })
  })

  describe('Error Instances are Thrown and Caught', () => {
    it('DatabaseError can be thrown and caught', () => {
      expect(() => {
        throw new DatabaseError('Test', 'TEST', 500)
      }).toThrow(DatabaseError)
    })

    it('UniqueConstraintError can be thrown and caught', () => {
      expect(() => {
        throw new UniqueConstraintError('email')
      }).toThrow(UniqueConstraintError)
    })

    it('NotFoundError can be thrown and caught', () => {
      expect(() => {
        throw new NotFoundError('Tournament')
      }).toThrow(NotFoundError)
    })

    it('can be caught by parent class type', () => {
      expect(() => {
        throw new UniqueConstraintError('field')
      }).toThrow(ConstraintViolationError)
    })

    it('can be caught by DatabaseError type', () => {
      expect(() => {
        throw new NotFoundError('Resource')
      }).toThrow(DatabaseError)
    })

    it('can be caught by Error type', () => {
      expect(() => {
        throw new CheckConstraintError('field')
      }).toThrow(Error)
    })
  })
})
