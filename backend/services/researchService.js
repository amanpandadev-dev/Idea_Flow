/**
 * Research Service
 * Handles research mode, tagging, and context-aware follow-up queries
 */

/**
 * Tag an idea with user-defined label
 */
export async function tagIdea(pool, userId, ideaId, tag, notes = null, contextSnapshot = null) {
    try {
        const result = await pool.query(`
            INSERT INTO search_result_tags (user_id, idea_id, tag, notes, context_snapshot)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, idea_id, tag)
            DO UPDATE SET notes = $4, context_snapshot = $5
            RETURNING *
        `, [userId, ideaId, tag, notes, contextSnapshot ? JSON.stringify(contextSnapshot) : null]);

        return result.rows[0];
    } catch (error) {
        console.error('[Research] Failed to tag idea:', error);
        throw error;
    }
}

/**
 * Remove tag from idea
 */
export async function untagIdea(pool, userId, ideaId, tag) {
    try {
        await pool.query(`
            DELETE FROM search_result_tags
            WHERE user_id = $1 AND idea_id = $2 AND tag = $3
        `, [userId, ideaId, tag]);
        return true;
    } catch (error) {
        console.error('[Research] Failed to untag idea:', error);
        return false;
    }
}

/**
 * Get all tags for a user
 */
export async function getUserTags(pool, userId) {
    try {
        const result = await pool.query(`
            SELECT DISTINCT tag, COUNT(*) as count
            FROM search_result_tags
            WHERE user_id = $1
            GROUP BY tag
            ORDER BY count DESC
        `, [userId]);
        return result.rows;
    } catch (error) {
        console.error('[Research] Failed to get user tags:', error);
        return [];
    }
}

/**
 * Get ideas by tag
 */
export async function getIdeasByTag(pool, userId, tag) {
    try {
        const result = await pool.query(`
            SELECT 
                i.idea_id,
                i.title,
                i.summary,
                i.challenge_opportunity as domain,
                i.business_group as "businessGroup",
                i.code_preference as technologies,
                i.score,
                i.created_at,
                t.notes,
                t.created_at as tagged_at
            FROM search_result_tags t
            JOIN ideas i ON t.idea_id = i.idea_id
            WHERE t.user_id = $1 AND t.tag = $2
            ORDER BY t.created_at DESC
        `, [userId, tag]);

        return result.rows.map(row => ({
            id: `IDEA-${row.idea_id}`,
            dbId: row.idea_id,
            title: row.title,
            description: row.summary,
            domain: row.domain,
            businessGroup: row.businessGroup,
            technologies: row.technologies,
            score: row.score,
            submissionDate: row.created_at,
            notes: row.notes,
            taggedAt: row.tagged_at
        }));
    } catch (error) {
        console.error('[Research] Failed to get ideas by tag:', error);
        return [];
    }
}

/**
 * Enable research mode for a session
 */
export async function enableResearchMode(pool, userId, sessionId, baseContext) {
    try {
        await pool.query(`
            UPDATE user_search_contexts
            SET research_mode = TRUE, research_context = $3, updated_at = NOW()
            WHERE user_id = $1 AND session_id = $2
        `, [userId, sessionId, JSON.stringify(baseContext)]);
        return true;
    } catch (error) {
        console.error('[Research] Failed to enable research mode:', error);
        return false;
    }
}

/**
 * Find similar ideas to a given idea
 */
export async function findSimilarIdeas(pool, ideaId, limit = 10) {
    try {
        // Get the source idea
        const sourceResult = await pool.query(`
            SELECT title, summary, challenge_opportunity, code_preference, business_group
            FROM ideas WHERE idea_id = $1
        `, [ideaId]);

        if (sourceResult.rows.length === 0) {
            return [];
        }

        const source = sourceResult.rows[0];

        // Find similar ideas based on domain and technologies
        const result = await pool.query(`
            SELECT 
                idea_id,
                title,
                summary,
                challenge_opportunity as domain,
                business_group as "businessGroup",
                code_preference as technologies,
                score,
                created_at
            FROM ideas
            WHERE idea_id != $1
            AND (
                challenge_opportunity = $2
                OR business_group = $3
                OR code_preference ILIKE $4
            )
            ORDER BY 
                CASE WHEN challenge_opportunity = $2 THEN 1 ELSE 0 END +
                CASE WHEN business_group = $3 THEN 1 ELSE 0 END +
                CASE WHEN code_preference ILIKE $4 THEN 1 ELSE 0 END DESC,
                score DESC
            LIMIT $5
        `, [
            ideaId,
            source.challenge_opportunity,
            source.business_group,
            `%${source.code_preference || ''}%`,
            limit
        ]);

        return result.rows.map(row => ({
            id: `IDEA-${row.idea_id}`,
            dbId: row.idea_id,
            title: row.title,
            description: row.summary,
            domain: row.domain,
            businessGroup: row.businessGroup,
            technologies: row.technologies,
            score: row.score,
            submissionDate: row.created_at,
            matchScore: 75 // Similarity score
        }));
    } catch (error) {
        console.error('[Research] Failed to find similar ideas:', error);
        return [];
    }
}

/**
 * Add context/refinement to existing search
 */
export function refineSearchContext(existingContext, refinement) {
    const refined = { ...existingContext };

    // Parse refinement for additional filters
    const lowerRefinement = refinement.toLowerCase();

    // Add technology refinements
    const techPatterns = {
        'cybersecurity': ['security', 'cybersecurity', 'encryption'],
        'ai': ['ai', 'machine learning', 'ml', 'deep learning'],
        'cloud': ['cloud', 'aws', 'azure', 'gcp'],
        'blockchain': ['blockchain', 'web3', 'crypto'],
        'mobile': ['mobile', 'ios', 'android', 'flutter']
    };

    for (const [tech, keywords] of Object.entries(techPatterns)) {
        if (keywords.some(k => lowerRefinement.includes(k))) {
            if (!refined.technologies) refined.technologies = [];
            if (!refined.technologies.includes(tech)) {
                refined.technologies.push(tech);
            }
        }
    }

    // Add domain refinements
    const domainPatterns = {
        'healthcare': ['healthcare', 'medical', 'health'],
        'finance': ['finance', 'banking', 'fintech'],
        'retail': ['retail', 'ecommerce', 'shopping']
    };

    for (const [domain, keywords] of Object.entries(domainPatterns)) {
        if (keywords.some(k => lowerRefinement.includes(k))) {
            if (!refined.domains) refined.domains = [];
            if (!refined.domains.includes(domain)) {
                refined.domains.push(domain);
            }
        }
    }

    // Add keywords
    const words = refinement.split(/\s+/).filter(w => w.length > 3);
    if (!refined.keywords) refined.keywords = [];
    refined.keywords = [...new Set([...refined.keywords, ...words])].slice(0, 20);

    return refined;
}

/**
 * Parse research commands from user input
 */
export function parseResearchCommand(input) {
    const lowerInput = input.toLowerCase().trim();

    // Similar ideas command
    if (lowerInput.startsWith('similar to') || lowerInput.includes('show similar')) {
        const match = input.match(/idea[- ]?(\d+)/i);
        if (match) {
            return { command: 'similar', ideaId: parseInt(match[1]) };
        }
    }

    // Tag command
    if (lowerInput.startsWith('tag ') || lowerInput.startsWith('bookmark ')) {
        const match = input.match(/(?:tag|bookmark)\s+idea[- ]?(\d+)\s+(?:as|with)?\s*(.+)/i);
        if (match) {
            return { command: 'tag', ideaId: parseInt(match[1]), tag: match[2].trim() };
        }
    }

    // Show tagged
    if (lowerInput.includes('show tagged') || lowerInput.includes('my tags')) {
        const tagMatch = input.match(/tagged\s+(?:as|with)?\s*(.+)/i);
        return { command: 'showTagged', tag: tagMatch ? tagMatch[1].trim() : null };
    }

    // Refine/focus command
    if (lowerInput.startsWith('focus on') || lowerInput.startsWith('refine to') || lowerInput.startsWith('add context')) {
        const context = input.replace(/^(focus on|refine to|add context)\s*/i, '').trim();
        return { command: 'refine', context };
    }

    return { command: 'search', query: input };
}

export default {
    tagIdea,
    untagIdea,
    getUserTags,
    getIdeasByTag,
    enableResearchMode,
    findSimilarIdeas,
    refineSearchContext,
    parseResearchCommand
};
