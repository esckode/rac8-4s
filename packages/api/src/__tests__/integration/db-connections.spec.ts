import { getDb, initializeDb, closeDb } from '../../db-connections'
import { Pool } from 'pg'

describe('Database Connections', () => {
  // Store original DATABASE_URL
  const originalDbUrl = process.env.DATABASE_URL

  beforeEach(() => {
    // Reset singleton by closing if it exists
    // We access it by trying to get pool, but we need to clear it another way
    // Use process.exit to completely reset module state or manually clear
    jest.resetModules()
  })

  afterAll(async () => {
    // Restore original environment
    if (originalDbUrl) {
      process.env.DATABASE_URL = originalDbUrl
    } else {
      delete process.env.DATABASE_URL
    }

    // Ensure all database connections are closed
    try {
      const module = await import('../../db-connections')
      await module.closeDb()
    } catch (e) {
      // Ignore errors during cleanup
    }
  })

  describe('getDb', () => {
    it('throws error if database not initialized', async () => {
      // Reload module to get fresh state
      jest.resetModules()
      const { getDb: getDbFresh } = await import('../../db-connections')

      expect(() => getDbFresh()).toThrow(/not initialized/)
    })

    it('returns pool instance after initialization', async () => {
      jest.resetModules()
      const module = await import('../../db-connections')
      const { initializeDb: initFresh, getDb: getDbFresh } = module

      // Set a valid DATABASE_URL for testing
      process.env.DATABASE_URL =
        process.env.TEST_DATABASE_URL ||
        'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

      const pool = await initFresh()
      const retrieved = getDbFresh()

      expect(retrieved).toBe(pool)
      expect(retrieved).toBeDefined()
      expect(retrieved.query).toBeDefined()

      // Cleanup
      await module.closeDb()
    })
  })

  describe('initializeDb', () => {
    beforeEach(() => {
      jest.resetModules()
    })

    it('creates pool with correct configuration', async () => {
      process.env.DATABASE_URL =
        process.env.TEST_DATABASE_URL ||
        'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

      const module = await import('../../db-connections')
      const pool = await module.initializeDb()

      expect(pool).toBeDefined()
      expect(pool.options.max).toBe(10)
      expect(pool.options.min).toBe(2)
      expect(pool.options.idleTimeoutMillis).toBe(30000)
      expect(pool.options.connectionTimeoutMillis).toBe(2000)

      await module.closeDb()
    })

    it('tests database connection on initialization', async () => {
      process.env.DATABASE_URL =
        process.env.TEST_DATABASE_URL ||
        'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()

      const module = await import('../../db-connections')
      await module.initializeDb()

      // Should log successful connection
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Database connected'),
        expect.anything()
      )

      consoleLogSpy.mockRestore()
      await module.closeDb()
    })

    it('returns existing pool on second initialization (idempotent)', async () => {
      process.env.DATABASE_URL =
        process.env.TEST_DATABASE_URL ||
        'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

      const module = await import('../../db-connections')

      const pool1 = await module.initializeDb()
      const pool2 = await module.initializeDb()

      expect(pool1).toBe(pool2)

      await module.closeDb()
    })

    it('throws error if DATABASE_URL is not set', async () => {
      delete process.env.DATABASE_URL

      const module = await import('../../db-connections')

      await expect(module.initializeDb()).rejects.toThrow(/DATABASE_URL.*not set/)
    })

    it('connects to the database successfully', async () => {
      process.env.DATABASE_URL =
        process.env.TEST_DATABASE_URL ||
        'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

      const module = await import('../../db-connections')
      const pool = await module.initializeDb()

      // If we got here without error, connection was successful
      expect(pool).toBeDefined()

      await module.closeDb()
    })
  })

  describe('closeDb', () => {
    beforeEach(() => {
      jest.resetModules()
    })

    it('closes pool connection', async () => {
      process.env.DATABASE_URL =
        process.env.TEST_DATABASE_URL ||
        'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

      const module = await import('../../db-connections')
      const pool = await module.initializeDb()

      const poolEndSpy = jest.spyOn(pool, 'end')

      await module.closeDb()

      expect(poolEndSpy).toHaveBeenCalled()
    })

    it('resets singleton after closing', async () => {
      process.env.DATABASE_URL =
        process.env.TEST_DATABASE_URL ||
        'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

      const module = await import('../../db-connections')
      await module.initializeDb()
      await module.closeDb()

      // After closing, getDb should throw
      expect(() => module.getDb()).toThrow(/not initialized/)
    })

    it('can reinitialize pool after closing', async () => {
      process.env.DATABASE_URL =
        process.env.TEST_DATABASE_URL ||
        'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

      const module = await import('../../db-connections')

      const pool1 = await module.initializeDb()
      await module.closeDb()

      const pool2 = await module.initializeDb()

      expect(pool2).toBeDefined()
      expect(pool2.query).toBeDefined()

      await module.closeDb()
    })

    it('handles multiple closeDb calls without error', async () => {
      process.env.DATABASE_URL =
        process.env.TEST_DATABASE_URL ||
        'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

      const module = await import('../../db-connections')
      await module.initializeDb()

      // Should not throw on second close
      await expect(module.closeDb()).resolves.not.toThrow()
      await expect(module.closeDb()).resolves.not.toThrow()
    })
  })

  describe('Pool lifecycle', () => {
    beforeEach(() => {
      jest.resetModules()
    })

    it('maintains singleton throughout application lifecycle', async () => {
      process.env.DATABASE_URL =
        process.env.TEST_DATABASE_URL ||
        'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

      const module = await import('../../db-connections')

      const pool1 = await module.initializeDb()
      const pool2 = module.getDb()
      const pool3 = module.getDb()

      expect(pool1).toBe(pool2)
      expect(pool2).toBe(pool3)

      await module.closeDb()
    })

    it('applies correct pool settings for connection management', async () => {
      process.env.DATABASE_URL =
        process.env.TEST_DATABASE_URL ||
        'postgresql://tournament_user:tournament_pass@localhost:5432/tournament_app'

      const module = await import('../../db-connections')
      const pool = await module.initializeDb()

      // Verify pool settings for optimal connection pooling
      expect(pool.options.min).toBe(2) // Minimum 2 connections
      expect(pool.options.max).toBe(10) // Maximum 10 connections
      expect(pool.options.idleTimeoutMillis).toBe(30000) // 30 second idle timeout
      expect(pool.options.connectionTimeoutMillis).toBe(2000) // 2 second connection timeout

      await module.closeDb()
    })
  })
})
