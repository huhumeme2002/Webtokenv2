import { NextRequest } from 'next/server'
import { eq, and, gt, isNull, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { keys, tokenPool, deliveries } from '@/db/schema'
import { getUserSession } from '@/lib/auth'
import { isRateLimited, getNextAvailableAt } from '@/lib/rateLimit'
import { successResponse, errorResponse, ErrorResponses, validateHeaders } from '@/lib/responses'
import { env } from '@/lib/env'

// Use Node.js runtime for transaction support with FOR UPDATE SKIP LOCKED
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    // Validate headers for CSRF protection
    if (!validateHeaders(request)) {
      return errorResponse('INVALID_REQUEST', 400, 'Missing required headers')
    }

    // Get user session
    const session = await getUserSession()
    if (!session) {
      return ErrorResponses.unauthorized()
    }

    const keyId = session.sub

    // Transaction to handle token distribution atomically
    // Neon-http driver doesn't support transactions, use sequential operations
    try {
      // First, get current key status
      const keyRecord = await db
        .select()
        .from(keys)
        .where(eq(keys.id, keyId))
        .limit(1)

      if (keyRecord.length === 0) {
        throw new Error('KEY_NOT_FOUND')
      }

      const userKey = keyRecord[0]

      // Check if key is still active and not expired
      if (!userKey.isActive) {
        throw new Error('KEY_INACTIVE')
      }

      if (userKey.expiresAt <= new Date()) {
        throw new Error('KEY_EXPIRED')
      }

      // Check rate limiting
      const rateLimitCheck = isRateLimited(userKey.lastTokenAt, env.RATE_LIMIT_MINUTES)
      if (rateLimitCheck.limited) {
        throw new Error('RATE_LIMITED')
      }

      // Atomically update last_token_at with cooldown check
      const updateResult = await db.execute(sql`
        UPDATE keys
        SET last_token_at = now()
        WHERE id = ${keyId}
          AND (
            last_token_at IS NULL OR
            now() >= (last_token_at + (${env.RATE_LIMIT_MINUTES} || ' minutes')::interval)
          )
        RETURNING id, last_token_at;
      `)

      if (updateResult.rowCount === 0) {
        // This means we're in cooldown period (race condition caught)
        const nextAvailableAt = getNextAvailableAt(userKey.lastTokenAt, env.RATE_LIMIT_MINUTES)
        throw new Error('COOLDOWN_RACE_CONDITION')
      }

      const updatedLastTokenAt = (updateResult.rows[0] as { id: string; last_token_at: string }).last_token_at

      // Retry logic for race conditions (max 3 attempts)
      let tokenValue: string | null = null
      let tokenId: string | null = null
      let retryCount = 0
      const MAX_RETRIES = 3

      while (retryCount < MAX_RETRIES && !tokenValue) {
        try {
          // Pick a token with claim_count < 2 (can be shared by 2 users)
          // Priority: tokens with claim_count = 1 first (to fill up before moving to new ones)
          const tokenResult = await db.execute(sql`
            SELECT id, value, claim_count
            FROM token_pool
            WHERE claim_count < 2
              AND id NOT IN (
                SELECT token_id FROM deliveries WHERE key_id = ${keyId}
              )
            ORDER BY claim_count DESC, created_at ASC
            LIMIT 1;
          `)

          if (tokenResult.rowCount === 0) {
            throw new Error('OUT_OF_STOCK')
          }

          const selectedToken = tokenResult.rows[0] as { id: string; value: string; claim_count: number }
          tokenId = selectedToken.id
          const currentClaimCount = selectedToken.claim_count

          console.log(`[Token Selection] Attempt ${retryCount + 1}: Token ${tokenId}, claim_count=${currentClaimCount}`)

          // Assign token to user (increment claim_count, max 2)
          const updateTokenResult = await db.execute(sql`
            UPDATE token_pool
            SET claim_count = claim_count + 1,
                assigned_to = ${keyId},
                assigned_at = now()
            WHERE id = ${tokenId}
              AND claim_count < 2
            RETURNING id, claim_count, value;
          `)

          if (updateTokenResult.rowCount === 0) {
            // Race condition: token was claimed by another user between SELECT and UPDATE
            console.log(`[Race Condition] Token ${tokenId} was modified by another request, retrying...`)
            retryCount++
            if (retryCount >= MAX_RETRIES) {
              throw new Error('TOKEN_RACE_CONDITION')
            }
            // Wait a bit before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 50 * retryCount))
            continue
          }

          tokenValue = (updateTokenResult.rows[0] as { value: string }).value
          console.log(`[Token Assigned] Token ${tokenId} assigned to user ${keyId}, new claim_count=${(updateTokenResult.rows[0] as { claim_count: number }).claim_count}`)

          // Create delivery record
          await db
            .insert(deliveries)
            .values({
              keyId,
              tokenId,
              deliveredAt: new Date(),
            })

          break // Success, exit loop
        } catch (err) {
          if (err instanceof Error && err.message === 'OUT_OF_STOCK') {
            throw err // Don't retry for out of stock
          }
          if (retryCount >= MAX_RETRIES - 1) {
            throw err // Max retries reached
          }
          retryCount++
        }
      }

      if (!tokenValue || !tokenId) {
        throw new Error('TOKEN_RACE_CONDITION')
      }

      // Calculate next available time
      const nextAvailableAt = getNextAvailableAt(new Date(updatedLastTokenAt), env.RATE_LIMIT_MINUTES)

      const result = {
        token: tokenValue,
        createdAt: new Date().toISOString(),
        nextAvailableAt: nextAvailableAt?.toISOString() || null,
      }

      return successResponse(result)
    } catch (transactionError) {
      throw transactionError
    }

  } catch (error) {
    // Enhanced error logging for debugging
    console.error('Token generation error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    })

    if (error instanceof Error) {
      switch (error.message) {
        case 'KEY_NOT_FOUND':
        case 'KEY_INACTIVE':
        case 'KEY_EXPIRED':
          return ErrorResponses.unauthorized()

        case 'RATE_LIMITED':
        case 'COOLDOWN_RACE_CONDITION':
          // Get current key to calculate nextAvailableAt
          try {
            const keyRecord = await db
              .select()
              .from(keys)
              .where(eq(keys.id, (await getUserSession())?.sub!))
              .limit(1)

            if (keyRecord.length > 0) {
              const nextAvailableAt = getNextAvailableAt(keyRecord[0].lastTokenAt, env.RATE_LIMIT_MINUTES)
              if (nextAvailableAt) {
                return ErrorResponses.rateLimited(nextAvailableAt)
              }
            }
          } catch (e) {
            // Fallback error
          }
          return errorResponse('RATE_LIMITED', 429, 'Too many requests')

        case 'TOKEN_RACE_CONDITION':
          // Retry logic could be implemented here, but for now just return out of stock
          return ErrorResponses.outOfStock()

        case 'OUT_OF_STOCK':
          return ErrorResponses.outOfStock()

        default:
          return ErrorResponses.internalError()
      }
    }

    return ErrorResponses.internalError()
  }
}

export async function GET() {
  return ErrorResponses.methodNotAllowed()
}

export async function PUT() {
  return ErrorResponses.methodNotAllowed()
}

export async function DELETE() {
  return ErrorResponses.methodNotAllowed()
}

export async function PATCH() {
  return ErrorResponses.methodNotAllowed()
}
