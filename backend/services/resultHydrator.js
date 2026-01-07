/**
 * Result Hydrator Service
 * Fetches and hydrates idea results from PostgreSQL with complete metadata
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

/**
 * Hydrate idea results from PostgreSQL
 * @param {number[]} ideaIds - Array of idea IDs to fetch
 * @param {number[]} baseResultIds - Original search order for scoring (optional)
 * @param {Object} options - Optional configuration
 * @param {boolean} options.applyScoreFilter - Whether to filter results by ≥70% matchScore (default: true)
 * @param {number[]} options.chromaScores - ChromaDB similarity scores (0-1) for each idea (optional)
 * @returns {Promise<Object[]>} Array of IdeaCard objects
 */
export async function hydrateResults(ideaIds, baseResultIds = null, options = {}) {
    // Validate inputs
    if (!Array.isArray(ideaIds)) {
        throw new Error('ideaIds must be an array');
    }

    // Handle empty array case
    if (ideaIds.length === 0) {
        return [];
    }

    // Use ideaIds as baseResultIds if not provided
    const scoringOrder = baseResultIds || ideaIds;
    
    // Default: apply score filter
    const applyScoreFilter = options.applyScoreFilter !== false;
    
    // Check if we have ChromaDB scores
    const chromaScores = options.chromaScores || null;
    const useChromaScores = chromaScores && chromaScores.length === ideaIds.length;
    
    console.log(`[hydrateResults] Processing ${ideaIds.length} ideas`);
    console.log(`[hydrateResults] ChromaScores provided: ${chromaScores ? chromaScores.length : 0}`);
    console.log(`[hydrateResults] Using ChromaScores: ${useChromaScores}`);

    try {
        // Batch fetch ideas using WHERE idea_id = ANY($1) with ALL columns
        const result = await pool.query(`
            SELECT 
                i.idea_id,
                i.title,
                i.summary,
                i.theme,
                i.business_group,
                i.code_preference,
                i.created_at,
                i.challenge_opportunity,
                i.scalability,
                i.novelty,
                i.benefits,
                i.risks,
                i.responsible_ai,
                i.additional_info,
                i.prototype_url,
                i.timeline,
                i.success_metrics,
                i.expected_outcomes,
                i.scalability_potential,
                i.business_model,
                i.competitive_analysis,
                i.risk_mitigation,
                i.participation_week,
                i.build_phase,
                i.build_preference,
                i.score,
                i.submitter_id,
                u.name as submitter_name,
                u.emp_id as submitter_emp_id
            FROM ideas i
            LEFT JOIN users u ON i.submitter_id = u.id
            WHERE i.idea_id = ANY($1)
        `, [ideaIds]);

        // Create a map for quick lookup
        const ideasMap = new Map();
        result.rows.forEach(row => {
            ideasMap.set(row.idea_id, row);
        });

        // Hydrate results preserving order from ideaIds
        const hydratedResults = ideaIds
            .map((ideaId, index) => {
                const row = ideasMap.get(ideaId);
                if (!row) {
                    return null; // Skip missing ideas
                }

                // Parse technologies from code_preference column
                const technologies = parseTechnologies(row.code_preference);

                // Extract year from created_at timestamp
                const year = extractYear(row.created_at);

                // Calculate matchScore based on ChromaDB similarity OR position
                let matchScore;
                if (useChromaScores) {
                    // Use pre-normalized scores directly (already 0-100)
                    matchScore = chromaScores[index];
                } else {
                    // Fallback to position-based scoring
                    matchScore = calculateMatchScore(ideaId, scoringOrder);
                }
                
                // Log first few scores for debugging
                if (index < 3) {
                    console.log(`[hydrateResults] Idea ${ideaId}: matchScore=${matchScore}% (useChromaScores=${useChromaScores})`);
                }

                // Return complete IdeaCard object with all required fields from database
                return {
                    id: String(row.idea_id),
                    idea_id: row.idea_id,
                    title: row.title || '',
                    description: row.summary || '',
                    summary: row.summary || '',
                    theme: row.theme || '',
                    domain: row.theme || '',
                    business_group: row.business_group || '',
                    businessGroup: row.business_group || '',
                    technologies: technologies,
                    code_preference: row.code_preference || '',
                    created_at: row.created_at,
                    submissionDate: row.created_at,
                    year: year,
                    matchScore: matchScore,
                    // Real data from database
                    challengeOpportunity: row.challenge_opportunity || '',
                    scalability: row.scalability || '',
                    novelty: row.novelty || '',
                    benefits: row.benefits || '',
                    risks: row.risks || '',
                    responsibleAi: row.responsible_ai || '',
                    additional_info: row.additional_info || '',
                    prototype_url: row.prototype_url || '',
                    timeline: row.timeline || '',
                    success_metrics: row.success_metrics || '',
                    expected_outcomes: row.expected_outcomes || '',
                    scalability_potential: row.scalability_potential || '',
                    business_model: row.business_model || '',
                    competitive_analysis: row.competitive_analysis || '',
                    risk_mitigation: row.risk_mitigation || '',
                    participation_week: row.participation_week || '',
                    build_phase: row.build_phase || '',
                    build_preference: row.build_preference || '',
                    buildType: row.build_preference || '',
                    score: row.score || 0,
                    // Submitter information
                    associateId: row.submitter_id || 0,
                    associateAccount: row.submitter_name || row.submitter_emp_id || 'Unknown',
                    // Like status (will be populated by frontend if needed)
                    isLiked: false,
                    likesCount: 0,
                    // Status (default since not in DB)
                    status: 'Submitted'
                };
            })
            .filter(idea => idea !== null); // Remove null entries for missing ideas

        // Apply ≥70% matchScore filter if enabled
        if (applyScoreFilter) {
            const filteredResults = hydratedResults.filter(idea => idea.matchScore >= 70);
            
            console.log(`[ProSearch] >=70% results count: ${filteredResults.length}`);
            console.log(`[hydrateResults] Filtered ${hydratedResults.length} → ${filteredResults.length} results (≥70% matchScore)`);
            
            return filteredResults;
        }

        return hydratedResults;
    } catch (error) {
        console.error('[hydrateResults] Error:', error);
        throw error;
    }
}

/**
 * Parse technologies from code_preference column
 * @param {string|null} codePreference - Comma-separated technology string
 * @returns {string[]} Array of technology names
 */
function parseTechnologies(codePreference) {
    if (!codePreference || typeof codePreference !== 'string') {
        return [];
    }

    // Split by comma and trim whitespace
    return codePreference
        .split(',')
        .map(tech => tech.trim())
        .filter(tech => tech.length > 0);
}

/**
 * Extract year from created_at timestamp
 * @param {Date|string|null} createdAt - Timestamp value
 * @returns {number} Year as integer
 */
function extractYear(createdAt) {
    if (!createdAt) {
        return new Date().getFullYear(); // Default to current year
    }

    const date = new Date(createdAt);
    if (isNaN(date.getTime())) {
        return new Date().getFullYear(); // Default to current year if invalid
    }

    return date.getFullYear();
}

/**
 * Calculate match score based on position in base result IDs
 * Score ranges from 0 to 100, with earlier positions having higher scores
 * @param {number} ideaId - The idea ID to score
 * @param {number[]} baseResultIds - Original search order
 * @returns {number} Match score between 0 and 100
 */
function calculateMatchScore(ideaId, baseResultIds) {
    const position = baseResultIds.indexOf(ideaId);
    
    if (position === -1) {
        return 0; // Not found in base results
    }

    const totalResults = baseResultIds.length;
    
    if (totalResults === 1) {
        return 100; // Single result gets perfect score
    }

    // Linear decay: first result = 100, last result approaches 0
    // Formula: 100 * (1 - (position / (totalResults - 1)))
    const score = 100 * (1 - (position / (totalResults - 1)));
    
    // Round to nearest integer
    return Math.round(score);
}

export default {
    hydrateResults
};
