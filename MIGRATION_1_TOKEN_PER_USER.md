# Migration Instructions for 1 Token Per User Update

## Database Schema Changes

The following changes have been made to enforce 1 token per user:

### 1. Updated `token_pool` table:
- Changed comment from "Each token can be claimed by up to 2 users" to "Each token can be claimed by only 1 user"
- Updated `claimCount` comment to reflect max 1 claim instead of 2
- Changed `availableTokensIdx` condition from `claim_count < 2` to `claim_count < 1`
- Updated `assignedTo` and `assignedAt` comments to reflect current usage (not deprecated)

### 2. Updated `deliveries` table:
- Changed comment from "Multiple deliveries can now reference the same token (up to 2)" to "Each delivery references a unique token (1 user per token)"
- Added `tokenUniqueIdx` unique constraint on `tokenId` to ensure each token is delivered to only one user

## API Changes

### 1. `/api/token` endpoint:
- Changed token selection query from `claim_count < 2` to `claim_count = 0`
- Removed prioritization of `claim_count = 1` tokens
- Simplified UPDATE to set `claim_count = 1` directly instead of incrementing
- Updated comments to reflect 1 token per user behavior

### 2. `/api/admin/tokens` endpoint:
- Changed filter from 'partial' to 'assigned' for clarity
- Removed 'full' filter case as it's no longer applicable
- Updated filter conditions to match new schema

## Test Updates

### 1. Updated `tests/api.token.test.ts`:
- Changed test from "should allow token sharing between 2 users" to "should not allow token sharing between 2 users"
- Updated test logic to verify second user gets a different token

## New Test Scripts

### 1. `TEST_NEW_1_TOKEN_PER_USER.sql`:
- Created new SQL test script to verify 1 token per user behavior
- Tests that two users get different tokens

## Migration Steps

To apply these changes to your database:

1. **Backup your database** before running migrations

2. **Run the migration**:
   ```bash
   # If you have DATABASE_URL set
   npx drizzle-kit push:pg
   
   # Or manually run the generated migration:
   # The migration file is at: drizzle/0000_unusual_nemesis.sql
   ```

3. **Update existing data** (if needed):
   ```sql
   -- Reset any tokens that have claim_count > 1 back to 0
   UPDATE token_pool SET claim_count = 0, assigned_to = NULL, assigned_at = NULL WHERE claim_count > 1;
   
   -- Remove duplicate deliveries if any exist
   DELETE FROM deliveries WHERE id NOT IN (
     SELECT DISTINCT ON (token_id) id FROM deliveries
   );
   ```

4. **Test the changes**:
   - Run the test suite: `npm test`
   - Use the new test script: `TEST_NEW_1_TOKEN_PER_USER.sql`
   - Manually test with two different users to ensure they get different tokens

## Verification

After migration, verify:
1. Each token can only be assigned to one user
2. Admin dashboard shows correct statistics
3. Token requests return unique tokens for different users
4. All tests pass

## Rollback Plan

If you need to rollback:
1. Restore from database backup
2. Or manually revert schema changes:
   - Remove `tokenUniqueIdx` constraint from deliveries table
   - Update `availableTokensIdx` to `claim_count < 2`
   - Revert API changes to allow sharing
