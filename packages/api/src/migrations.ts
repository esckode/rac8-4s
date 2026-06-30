import { Pool } from 'pg'
import * as fs from 'fs'
import * as path from 'path'

export async function runMigrations(pool: Pool, migrationsDir: string): Promise<void> {
  const client = await pool.connect()

  try {
    // Ensure public schema exists
    await client.query('CREATE SCHEMA IF NOT EXISTS public')

    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Get list of migration files
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- migrationsDir is a fixed app-config path, not user input
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
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is built from the fixed migrationsDir and a filename already read from that same directory listing
          const sql = fs.readFileSync(filePath, 'utf-8')

          console.log(`Running migration: ${migrationFile}`)
          await client.query(sql)

          // Record that this migration has been run (use upsert to handle concurrent resets)
          await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING', [migrationFile])
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
