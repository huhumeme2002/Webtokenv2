import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'
import { env } from '@/lib/env'

// Lazy initialization to avoid errors during build time
let _db: ReturnType<typeof drizzle> | null = null

export const getDb = () => {
  if (!_db) {
    const sql = neon(env.DATABASE_URL)
    _db = drizzle(sql as any, { schema })
  }
  return _db
}

// For backward compatibility
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>]
  }
})
