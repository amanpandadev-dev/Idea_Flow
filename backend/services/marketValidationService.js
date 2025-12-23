/**
 * Market Validation Service
 * 
 * Core orchestration service for market validation
 * - Fetches idea details from PostgreSQL
 * - Analyzes internal position using Chroma
 * - Coordinates with external intelligence
 */

import { getChromaClient } from '../config/chroma.js';
import { generateOllamaEmbedding } from '../config/ollama.js';

/**
 * Fetch idea details from PostgreSQL
 */
export async function fetchIdeaDetails(ideaId, pool) {
    console.log(`[MarketValidation] Fetching idea ${ideaId}`);

    // Extract numeric ID from string like "IDEA-474" -> 474
    const numericId = typeof ideaId === 'string' && ideaId.includes('-')
        ? parseInt(ideaId.split('-')[1])
        : parseInt(ideaId);

    if (isNaN(numericId)) {
        throw new Error(`Invalid idea ID format: ${ideaId}`);
    }

    const result = await pool.query(`
        SELECT 
            idea_id,
            title,
            summary,
            challenge_opportunity,
            scalability,
            novelty,
            benefits,
            risks,
            business_group,
            participation_week,
            created_at
        FROM ideas
        WHERE idea_id = $1
    `, [numericId]);

    if (result.rows.length === 0) {
        throw new Error(`Idea ${ideaId} not found`);
    }

    return result.rows[0];
}

/**
 * Analyze internal position using Chroma embeddings
 */
export async function analyzeInternalPosition(idea) {
    console.log(`[MarketValidation] Analyzing internal position for idea ${idea.idea_id}`);

    try {
        // Build searchable text from idea
        const ideaText = `${idea.title} ${idea.summary} ${idea.challenge_opportunity || ''}`.trim();

        // Generate embedding
        const embedding = await generateOllamaEmbedding(ideaText);

        // Query Chroma for similar ideas
        const chromaClient = getChromaClient();
        const collection = await chromaClient.getCollection({ name: 'ideas_collection' });

        const maxSimilarIdeas = parseInt(process.env.MARKET_VALIDATION_MAX_SIMILAR_IDEAS || '5');

        const results = await collection.query({
            queryEmbeddings: [embedding],
            nResults: maxSimilarIdeas + 1 // +1 to exclude self
        });

        // Filter out the current idea itself
        const similarIdeas = [];
        if (results.ids && results.ids[0]) {
            for (let i = 0; i < results.ids[0].length; i++) {
                const similarId = results.ids[0][i];
                const ideaIdStr = `idea_${idea.idea_id}`;

                // Skip if it's the same idea
                if (similarId === ideaIdStr) {
                    continue;
                }

                const similarity = 1 - (results.distances[0][i] || 1);
                const metadata = results.metadatas[0][i];

                similarIdeas.push({
                    id: similarId.replace('idea_', ''),
                    title: metadata.title || 'Unknown',
                    similarity: parseFloat(similarity.toFixed(3)),
                    similarityPct: Math.round(similarity * 100),
                    band: getSimilarityBand(similarity),
                    businessGroup: metadata.business_group || 'Unknown'
                });

                if (similarIdeas.length >= maxSimilarIdeas) {
                    break;
                }
            }
        }

        console.log(`[MarketValidation] Found ${similarIdeas.length} similar internal ideas`);

        return {
            similarIdeas,
            noveltyScore: calculateNoveltyScore(similarIdeas),
            totalIdeasAnalyzed: results.ids[0]?.length || 0
        };

    } catch (error) {
        console.error(`[MarketValidation] Internal analysis failed:`, error.message);

        // Return empty analysis if Chroma fails
        return {
            similarIdeas: [],
            noveltyScore: 0.5, // Neutral score
            totalIdeasAnalyzed: 0,
            error: 'Internal analysis unavailable'
        };
    }
}

/**
 * Get similarity band for display
 */
function getSimilarityBand(similarity) {
    if (similarity >= 0.8) return 'Strong overlap';
    if (similarity >= 0.5) return 'Moderate overlap';
    return 'Low overlap';
}

/**
 * Calculate novelty score (0-1) based on similarity to existing ideas
 */
function calculateNoveltyScore(similarIdeas) {
    if (similarIdeas.length === 0) {
        return 1.0; // Completely novel (no similar ideas)
    }

    // Get highest similarity
    const maxSimilarity = Math.max(...similarIdeas.map(idea => idea.similarity));

    // Novelty is inverse of similarity
    // If max similarity is 0.9, novelty is 0.1
    // If max similarity is 0.3, novelty is 0.7
    return parseFloat((1 - maxSimilarity).toFixed(2));
}

/**
 * Format internal analysis for LLM synthesis
 */
export function formatInternalAnalysis(internalAnalysis) {
    if (internalAnalysis.similarIdeas.length === 0) {
        return 'No similar internal ideas found. This appears to be a novel concept within the organization.';
    }

    let formatted = `Found ${internalAnalysis.similarIdeas.length} similar internal ideas:\n\n`;

    for (const idea of internalAnalysis.similarIdeas) {
        formatted += `- "${idea.title}" (${(idea.similarity * 100).toFixed(0)}% similar, ${idea.businessGroup})\n`;
    }

    formatted += `\nNovelty Score: ${(internalAnalysis.noveltyScore * 100).toFixed(0)}% novel`;

    return formatted;
}

/**
 * Save validation report to database
 */
export async function saveValidationReport(pool, ideaId, createdBy, report) {
    try {
        // Extract numeric ID from string like "IDEA-474" -> 474
        const numericId = typeof ideaId === 'string' && ideaId.includes('-')
            ? parseInt(ideaId.split('-')[1])
            : parseInt(ideaId);

        await pool.query(`
            INSERT INTO market_validations (
                idea_id,
                report,
                created_by,
                generated_at,
                novelty_score,
                patent_risk_level
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            numericId,
            JSON.stringify(report),
            createdBy,
            report.generatedAt,
            report.internalAnalysis?.noveltyScore || null,
            report.patentSignals?.riskLevel || null
        ]);

        console.log(`[MarketValidation] Report saved to database for idea ${ideaId}`);
    } catch (error) {
        console.error(`[MarketValidation] Failed to save report:`, error.message);
        // Non-fatal - report is still returned to user
    }
}

export default {
    fetchIdeaDetails,
    analyzeInternalPosition,
    formatInternalAnalysis,
    saveValidationReport
};