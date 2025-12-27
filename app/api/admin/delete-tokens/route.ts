import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/db/client'
import { tokenPool, deliveries } from '@/db/schema'
import { getAdminSession } from '@/lib/auth'
import { successResponse, ErrorResponses, validateHeaders } from '@/lib/responses'
import { sql, eq, inArray } from 'drizzle-orm'

// Use Node.js runtime for bulk operations
export const runtime = 'nodejs'

const deleteTokensSchema = z.object({
  startTokenId: z.string().min(1, 'Token ID or value is required'),
  count: z.number().int().min(10, 'Minimum 10 tokens').max(20, 'Maximum 20 tokens'),
})

export async function POST(request: NextRequest) {
  try {
    // Validate headers for CSRF protection
    if (!validateHeaders(request)) {
      return ErrorResponses.unauthorized()
    }

    // Verify admin session
    const adminSession = await getAdminSession()
    if (!adminSession) {
      return ErrorResponses.unauthorized()
    }

    // Parse and validate request body
    const body = await request.json()
    const { startTokenId, count } = deleteTokensSchema.parse(body)

    // Check if input is UUID or token value
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(startTokenId)

    // Get the starting token to verify it exists and get its creation time
    const startTokenResult = await db.execute(
      isUUID
        ? sql`
            SELECT id, value, created_at, claim_count
            FROM token_pool
            WHERE id = ${startTokenId}
            LIMIT 1;
          `
        : sql`
            SELECT id, value, created_at, claim_count
            FROM token_pool
            WHERE value = ${startTokenId}
            LIMIT 1;
          `
    )

    if (startTokenResult.rowCount === 0) {
      return ErrorResponses.invalidInput('Token not found. Please check the token ID or value.')
    }

    const startToken = startTokenResult.rows[0] as { 
      id: string; 
      value: string; 
      created_at: string;
      claim_count: number;
    }

    // Get the next N tokens starting from this token (ordered by created_at)
    const tokensToDeleteResult = await db.execute(sql`
      SELECT id, value, claim_count
      FROM token_pool
      WHERE created_at >= ${startToken.created_at}
      ORDER BY created_at
      LIMIT ${count};
    `)

    if (tokensToDeleteResult.rowCount === 0) {
      return ErrorResponses.invalidInput('No tokens found to delete')
    }

    const tokensToDelete = tokensToDeleteResult.rows as Array<{
      id: string;
      value: string;
      claim_count: number;
    }>

    const tokenIds = tokensToDelete.map(t => t.id)

    // Delete associated deliveries first (foreign key constraint)
    // Use IN clause instead of ANY for better compatibility
    const deletedDeliveriesResult = await db
      .delete(deliveries)
      .where(inArray(deliveries.tokenId, tokenIds))
      .returning({ id: deliveries.id })

    const deletedDeliveriesCount = deletedDeliveriesResult.length

    // Delete the tokens
    const deletedTokensResult = await db
      .delete(tokenPool)
      .where(inArray(tokenPool.id, tokenIds))
      .returning({ id: tokenPool.id, value: tokenPool.value })

    const deletedTokensCount = deletedTokensResult.length

    return successResponse({
      deletedTokens: deletedTokensCount,
      deletedDeliveries: deletedDeliveriesCount,
      tokenIds: tokenIds,
      message: `Successfully deleted ${deletedTokensCount} tokens and ${deletedDeliveriesCount} associated deliveries`,
    })
  } catch (error) {
    console.error('Delete tokens error:', error)
    
    if (error instanceof z.ZodError) {
      return ErrorResponses.invalidInput(error.errors[0]?.message)
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

