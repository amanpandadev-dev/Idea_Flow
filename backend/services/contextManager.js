/**
 * Context Manager Service
 * Handles user search context persistence, filter management, and session state
 */

import pool from '../config/database.js';

/**
 * Save or update user's search context
 * @param {string} userId - User identifier
 * @param {number} sessionId - Chat session ID
 * @param {object} contextData - Filter and state data
 * @returns {Promise<object>} Saved context
 */
export async function saveUserContext(userId, sessionId, contextData) {
    try {
        const result = await pool.query(`
            INSERT INTO user_search_contexts (user_id, session_id, context_data, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (user_id, session_id)
            DO UPDATE SET 
                context_data = $3,
                updated_at = NOW()
            RETURNING *
        `, [userId, sessionId, JSON.stringify(contextData)]);

        return result.rows[0];
    } catch (error) {
        // Table might not exist yet - return the context anyway
        console.warn('[ContextManager] Could not save context (table may not exist):', error.message);
        return { context_data: contextData };
    }
}

/**
 * Get user's most recent search context
 * @param {string} userId - User identifier
 * @param {number} sessionId - Optional session ID
 * @returns {Promise<object|null>} Context data or null
 */
export async function getUserContext(userId, sessionId = null) {
    try {
        let query, params;

        if (sessionId) {
            query = `
                SELECT context_data, updated_at
                FROM user_search_contexts
                WHERE user_id = $1 AND session_id = $2
                ORDER BY updated_at DESC
                LIMIT 1
            `;
            params = [userId, sessionId];
        } else {
            query = `
                SELECT context_data, updated_at
                FROM user_search_contexts
                WHERE user_id = $1
                ORDER BY updated_at DESC
                LIMIT 1
            `;
            params = [userId];
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0].context_data;
    } catch (error) {
        // Table might not exist - return null
        console.warn('[ContextManager] Could not get context:', error.message);
        return null;
    }
}

/**
 * Delete user's search context
 * @param {string} userId - User identifier
 * @param {number} sessionId - Optional session ID to delete specific context
 * @returns {Promise<boolean>} Success status
 */
export async function deleteUserContext(userId, sessionId = null) {
    try {
        let query, params;

        if (sessionId) {
            query = 'DELETE FROM user_search_contexts WHERE user_id = $1 AND session_id = $2';
            params = [userId, sessionId];
        } else {
            query = 'DELETE FROM user_search_contexts WHERE user_id = $1';
            params = [userId];
        }

        await pool.query(query, params);
        return true;
    } catch (error) {
        console.error('[ContextManager] Error deleting context:', error);
        return false;
    }
}

/**
 * Validate and sanitize filter data
 * @param {object} filters - Filter object to validate
 * @returns {object} Sanitized filters
 */
export function validateFilters(filters) {
    const sanitized = {
        technologies: [],
        domains: [],
        businessGroups: [],
        years: [],
        keywords: []
    };

    // Validate technologies (array of strings)
    if (Array.isArray(filters.technologies)) {
        sanitized.technologies = filters.technologies
            .filter(t => typeof t === 'string' && t.length > 0 && t.length <= 100)
            .slice(0, 10); // Max 10 technologies
    }

    // Validate domains
    if (Array.isArray(filters.domains)) {
        sanitized.domains = filters.domains
            .filter(d => typeof d === 'string' && d.length > 0 && d.length <= 100)
            .slice(0, 10);
    }

    // Validate business groups
    if (Array.isArray(filters.businessGroups)) {
        sanitized.businessGroups = filters.businessGroups
            .filter(bg => typeof bg === 'string' && bg.length > 0 && bg.length <= 200)
            .slice(0, 5);
    }

    // Validate years (2020-2030 range)
    if (Array.isArray(filters.years)) {
        sanitized.years = filters.years
            .filter(y => Number.isInteger(y) && y >= 2020 && y <= 2030)
            .slice(0, 5);
    }

    // Validate keywords
    if (Array.isArray(filters.keywords)) {
        sanitized.keywords = filters.keywords
            .filter(k => typeof k === 'string' && k.length > 0 && k.length <= 100)
            .slice(0, 20);
    }

    return sanitized;
}

/**
 * Merge multiple filter objects with priority
 * @param {...object} filterObjects - Filter objects to merge (later args have priority)
 * @returns {object} Merged filters
 */
export function mergeFilters(...filterObjects) {
    const merged = {
        technologies: [],
        domains: [],
        businessGroups: [],
        years: [],
        keywords: []
    };

    for (const filters of filterObjects) {
        if (!filters) continue;

        // Merge arrays, removing duplicates
        if (filters.technologies) {
            merged.technologies = [...new Set([...merged.technologies, ...filters.technologies])];
        }
        if (filters.domains) {
            merged.domains = [...new Set([...merged.domains, ...filters.domains])];
        }
        if (filters.businessGroups) {
            merged.businessGroups = [...new Set([...merged.businessGroups, ...filters.businessGroups])];
        }
        if (filters.years) {
            merged.years = [...new Set([...merged.years, ...filters.years])];
        }
        if (filters.keywords) {
            merged.keywords = [...new Set([...merged.keywords, ...filters.keywords])];
        }
    }

    return validateFilters(merged);
}

/**
 * Get available filter options from database
 * @returns {Promise<object>} Available filter values
 */
export async function getAvailableFilters() {
    try {
        // Get unique business groups
        const bgResult = await pool.query(`
            SELECT DISTINCT business_group 
            FROM ideas 
            WHERE business_group IS NOT NULL 
            ORDER BY business_group
        `);

        // Get unique domains (challenge_opportunity)
        const domainResult = await pool.query(`
            SELECT DISTINCT challenge_opportunity as domain
            FROM ideas 
            WHERE challenge_opportunity IS NOT NULL
            ORDER BY challenge_opportunity
            LIMIT 50
        `);

        // Get available years
        const yearResult = await pool.query(`
            SELECT DISTINCT EXTRACT(YEAR FROM created_at)::INTEGER as year
            FROM ideas 
            WHERE created_at IS NOT NULL
            ORDER BY year DESC
        `);

        // Get common technologies from code_preference
        const techResult = await pool.query(`
            SELECT DISTINCT code_preference as tech
            FROM ideas 
            WHERE code_preference IS NOT NULL AND code_preference != ''
            ORDER BY code_preference
            LIMIT 100
        `);

        return {
            businessGroups: bgResult.rows.map(r => r.business_group),
            domains: domainResult.rows.map(r => r.domain),
            years: yearResult.rows.map(r => r.year),
            technologies: techResult.rows.map(r => r.tech)
        };
    } catch (error) {
        console.error('[ContextManager] Error getting available filters:', error);
        return {
            businessGroups: [],
            domains: [],
            years: [],
            technologies: []
        };
    }
}

export default {
    saveUserContext,
    getUserContext,
    deleteUserContext,
    validateFilters,
    mergeFilters,
    getAvailableFilters
};
