import { pgTable, text, uuid, timestamp, boolean, integer, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

// Keys table - user authentication keys
export const keys = pgTable('keys', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  key: text('key').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastTokenAt: timestamp('last_token_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => {
  return {
    keyIdx: unique('key_unique_idx').on(table.key),
  }
})

// Token pool - pre-uploaded tokens to distribute
// Each token can be claimed by up to 2 users
export const tokenPool = pgTable('token_pool', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  value: text('value').notNull().unique(),
  claimCount: integer('claim_count').notNull().default(0), // Track how many times this token has been claimed (max 2)
  assignedTo: uuid('assigned_to').references(() => keys.id), // Last user who claimed this token
  assignedAt: timestamp('assigned_at', { withTimezone: true }), // When the token was last claimed
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => {
  return {
    valueIdx: unique('token_value_unique_idx').on(table.value),
    availableTokensIdx: index('available_tokens_idx').on(table.claimCount).where(sql`claim_count < 2`),
  }
})

// Deliveries - audit log of token distribution
// Multiple deliveries can reference the same token (up to 2 users per token)
export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  keyId: uuid('key_id').notNull().references(() => keys.id),
  tokenId: uuid('token_id').notNull().references(() => tokenPool.id),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => {
  return {
    keyTokenIdx: unique('delivery_key_token_idx').on(table.keyId, table.tokenId), // Prevent same user from claiming same token twice
  }
})

// System notices - admin-configurable announcements for users
export const notices = pgTable('notices', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  content: text('content').notNull(),
  displayMode: text('display_mode').notNull().default('modal'), // 'modal' | 'sidebar' | 'both'
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
})

// Relations
export const keysRelations = relations(keys, ({ many }) => ({
  assignedTokens: many(tokenPool),
  deliveries: many(deliveries),
}))

export const tokenPoolRelations = relations(tokenPool, ({ one, many }) => ({
  assignedKey: one(keys, {
    fields: [tokenPool.assignedTo],
    references: [keys.id],
  }),
  deliveries: many(deliveries), // Changed from one to many since a token can have multiple deliveries
}))

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  key: one(keys, {
    fields: [deliveries.keyId],
    references: [keys.id],
  }),
  token: one(tokenPool, {
    fields: [deliveries.tokenId],
    references: [tokenPool.id],
  }),
}))

// Types
export type Key = typeof keys.$inferSelect
export type NewKey = typeof keys.$inferInsert
export type TokenPool = typeof tokenPool.$inferSelect
export type NewTokenPool = typeof tokenPool.$inferInsert
export type Delivery = typeof deliveries.$inferSelect
export type NewDelivery = typeof deliveries.$inferInsert
export type Notice = typeof notices.$inferSelect
export type NewNotice = typeof notices.$inferInsert
