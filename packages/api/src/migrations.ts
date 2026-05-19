import { Pool } from 'pg'
import * as fs from 'fs'
import * as path from 'path'

export async function runMigrations(pool: Pool, migrationsDir: string): Promise<void> {
  const client = await pool.connect()

  try {
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `)

    // Get list of migration files
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    // Run each migration that hasn't been executed yet
    for (const migrationFile of migrationFiles) {
      const result = await client.query('SELECT 1 FROM public.schema_migrations WHERE version = $1', [migrationFile])

      if (result.rows.length === 0) {
        try {
          const filePath = path.join(migrationsDir, migrationFile)
          const sql = fs.readFileSync(filePath, 'utf-8')

          console.log(`Running migration: ${migrationFile}`)
          await client.query(sql)

          // Record that this migration has been run
          await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1)', [migrationFile])
          console.log(`✅ Completed migration: ${migrationFile}`)
        } catch (error) {
          console.error(`❌ Failed to run migration ${migrationFile}:`, error)
          throw error
        }
      } else {
        console.log(`⏭️  Skipped migration (already run): ${migrationFile}`)
      }
    }

    console.log('✅ All migrations completed successfully')
  } finally {
    client.release()
  }
}
