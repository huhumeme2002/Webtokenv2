import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/db/client'
import { tokenPool } from '@/db/schema'
import { getAdminSession } from '@/lib/auth'
import { successResponse, ErrorResponses } from '@/lib/responses'
import { sql } from 'drizzle-orm'

export const runtime = 'nodejs'

const querySchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50),
  offset: z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
  filter: z.enum(['all', 'available', 'partial', 'full', 'assigned']).optional().default('all'),
})

export async function GET(request: NextRequest) {
  try {
    // Verify admin session
    const adminSession = await getAdminSession()
    if (!adminSession) {
      return ErrorResponses.unauthorized()
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const { limit, offset, filter } = querySchema.parse({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      filter: searchParams.get('filter') || 'all',
    })

    // Build filter condition
    let filterCondition = ''
    switch (filter) {
      case 'available':
        filterCondition = 'WHERE claim_count = 0'
        break
      case 'assigned':
        filterCondition = 'WHERE claim_count = 1'
        break
      default:
        filterCondition = ''
    }

    // Get tokens with pagination
    const tokensResult = await db.execute(sql`
      SELECT 
        id,
        value,
        claim_count,
        created_at,
        assigned_to,
        assigned_at
      FROM token_pool
      ${sql.raw(filterCondition)}
      ORDER BY created_at ASC
      LIMIT ${limit}
      OFFSET ${offset};
    `)

    // Get total count
    const countResult = await db.execute(sql`
      SELECT COUNT(*) as total
      FROM token_pool
      ${sql.raw(filterCondition)};
    `)

    const tokens = tokensResult.rows as Array<{
      id: string;
      value: string;
      claim_count: number;
      created_at: string;
      assigned_to: string | null;
      assigned_at: string | null;
    }>

    const total = (countResult.rows[0] as { total: number }).total

    return successResponse({
      tokens: tokens.map(t => ({
        id: t.id,
        value: t.value.substring(0, 20) + '...', // Mask token value for security
        claimCount: t.claim_count,
        createdAt: t.created_at,
        assignedTo: t.assigned_to,
        assignedAt: t.assigned_at,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + tokens.length < total,
      },
    })
  } catch (error) {
    console.error('Get tokens error:', error)
    
    if (error instanceof z.ZodError) {
      return ErrorResponses.invalidInput(error.errors[0]?.message)
    }
    
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

