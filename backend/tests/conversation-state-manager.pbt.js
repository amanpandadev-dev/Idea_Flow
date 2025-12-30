/**
 * Property-Based Tests for Conversation State Manager
 * Feature: prosearch-rebuild
 * Tests conversation state persistence and retrieval
 */

import 'dotenv/config';
import fc from 'fast-check';
import {
  createConversation,
  loadConversation,
  updateConversation
} from '../services/conversationStateManager.js';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Helper to clean up test conversations
async function cleanupConversation(conversationId) {
  if (!conversationId) return;
  try {
    await pool.query('DELETE FROM prosearch_conversations WHERE conversation_id = $1', [conversationId]);
  } catch (error) {
    // Ignore cleanup errors
  }
}

describe('Conversation State Manager Property Tests', () => {
  /**
   * Feature: prosearch-rebuild, Property 2: Conversation state round-trip
   * Validates: Requirements 1.2, 2.4
   * 
   * Property: For any conversation created with a query and result IDs,
   * storing and then retrieving the conversation should return the exact same
   * base_query and base_result_ids.
   */
  test('Property 2: Conversation state round-trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a query string
        fc.string({ minLength: 1, maxLength: 200 }),
        // Generate an array of idea IDs
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 0, maxLength: 100 }),
        async (baseQuery, baseResultIds) => {
          let conversationId = null;
          
          try {
            // Create conversation
            conversationId = await createConversation(baseQuery, baseResultIds);
            
            // Load conversation
            const loaded = await loadConversation(conversationId);
            
            // Verify round-trip: base_query and base_result_ids should match exactly
            expect(loaded).not.toBeNull();
            expect(loaded.base_query).toBe(baseQuery);
            expect(loaded.base_result_ids).toEqual(baseResultIds);
            
            // Verify initial state: current_result_ids should equal base_result_ids
            expect(loaded.current_result_ids).toEqual(baseResultIds);
            
            // Verify conversation_id is returned
            expect(loaded.conversation_id).toBe(conversationId);
            
          } finally {
            await cleanupConversation(conversationId);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Feature: prosearch-rebuild, Property 3: Conversation retrieval idempotence
   * Validates: Requirements 3.1, 3.2, 3.5
   * 
   * Property: For any conversation, retrieving it multiple times should return
   * identical current_result_ids and applied_filters.
   */
  test('Property 3: Conversation retrieval idempotence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 0, maxLength: 100 }),
        async (baseQuery, baseResultIds) => {
          let conversationId = null;
          
          try {
            // Create conversation
            conversationId = await createConversation(baseQuery, baseResultIds);
            
            // Load conversation multiple times
            const loaded1 = await loadConversation(conversationId);
            const loaded2 = await loadConversation(conversationId);
            const loaded3 = await loadConversation(conversationId);
            
            // Verify all loads return identical data
            expect(loaded1.current_result_ids).toEqual(loaded2.current_result_ids);
            expect(loaded2.current_result_ids).toEqual(loaded3.current_result_ids);
            
            expect(loaded1.applied_filters).toEqual(loaded2.applied_filters);
            expect(loaded2.applied_filters).toEqual(loaded3.applied_filters);
            
            // Verify base data is also identical
            expect(loaded1.base_query).toBe(loaded2.base_query);
            expect(loaded2.base_query).toBe(loaded3.base_query);
            
            expect(loaded1.base_result_ids).toEqual(loaded2.base_result_ids);
            expect(loaded2.base_result_ids).toEqual(loaded3.base_result_ids);
            
          } finally {
            await cleanupConversation(conversationId);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);

  /**
   * Feature: prosearch-rebuild, Property 17: Conversation update immutability
   * Validates: Requirements 6.3
   * 
   * Property: For any conversation update, the conversation_id, base_query,
   * base_result_ids, and created_at should remain unchanged.
   */
  test('Property 17: Conversation update immutability', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 1, maxLength: 100 }),
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 0, maxLength: 50 }),
        fc.record({
          technologies: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
          businessGroups: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
          themes: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 5 }),
          years: fc.array(fc.integer({ min: 2021, max: 2025 }), { maxLength: 5 })
        }),
        async (baseQuery, baseResultIds, newCurrentResultIds, appliedFilters) => {
          let conversationId = null;
          
          try {
            // Create conversation
            conversationId = await createConversation(baseQuery, baseResultIds);
            
            // Load initial state
            const beforeUpdate = await loadConversation(conversationId);
            
            // Update conversation
            await updateConversation(conversationId, newCurrentResultIds, appliedFilters);
            
            // Load after update
            const afterUpdate = await loadConversation(conversationId);
            
            // Verify immutable fields remain unchanged
            expect(afterUpdate.conversation_id).toBe(beforeUpdate.conversation_id);
            expect(afterUpdate.base_query).toBe(beforeUpdate.base_query);
            expect(afterUpdate.base_result_ids).toEqual(beforeUpdate.base_result_ids);
            expect(afterUpdate.created_at).toEqual(beforeUpdate.created_at);
            
            // Verify mutable fields are updated
            expect(afterUpdate.current_result_ids).toEqual(newCurrentResultIds);
            expect(afterUpdate.applied_filters).toEqual(appliedFilters);
            
            // Verify updated_at changed
            expect(afterUpdate.updated_at.getTime()).toBeGreaterThanOrEqual(beforeUpdate.updated_at.getTime());
            
          } finally {
            await cleanupConversation(conversationId);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 60000);
});
