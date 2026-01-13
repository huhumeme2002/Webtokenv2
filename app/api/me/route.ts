import { NextRequest } from 'next/server'
import { eq, count } from 'drizzle-orm'
import { db } from '@/db/client'
import { keys, deliveries } from '@/db/schema'
import { getUserSession } from '@/lib/auth'
import { getNextAvailableAt } from '@/lib/rateLimit'
import { successResponse, ErrorResponses } from '@/lib/responses'
import { maskKey } from '@/lib/utils'
import { env } from '@/lib/env'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    // Get user session
    const session = await getUserSession()
    if (!session) {
      return ErrorResponses.unauthorized()
    }

    // Get key details
    const keyRecord = await db
      .select()
      .from(keys)
      .where(eq(keys.id, session.sub))
      .limit(1)

    if (keyRecord.length === 0) {
      return ErrorResponses.unauthorized()
    }

    const userKey = keyRecord[0]

    // Get assigned token count
    const assignedCountResult = await db
      .select({ count: count() })
      .from(deliveries)
      .where(eq(deliveries.keyId, session.sub))

    const assignedCount = assignedCountResult[0]?.count || 0

    // Calculate next available time for token generation
    const nextAvailableAt = getNextAvailableAt(userKey.lastTokenAt, env.RATE_LIMIT_MINUTES)

    return successResponse({
      keyId: userKey.id,
      keyMask: maskKey(userKey.key),
      isActive: userKey.isActive,
      expiresAt: userKey.expiresAt.toISOString(),
      lastTokenAt: userKey.lastTokenAt?.toISOString() || null,
      assignedCount,
      nextAvailableAt: nextAvailableAt?.toISOString() || null,
    })
  } catch (error) {
    console.error('Get user info error:', error)
    return ErrorResponses.internalError()
  }
}

export async function POST() {
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
