/**
 * Market Validation DTO (Data Transfer Object)
 * 
 * Normalizes backend report structure for frontend consumption
 * Ensures consistent data contract between backend and frontend
 */

/**
 * Normalize market validation report for frontend
 * Transforms backend synthesis output into UI-ready format
 */
export function normalizeReportForFrontend(report, idea) {
    console.log('[DTO] Starting normalization for idea:', idea.idea_id);

    const normalized = {
        success: true,
        ideaId: idea.idea_id,
        idea: {
            id: idea.idea_id,
            title: idea.title
        },

        // Metrics for dashboard/summary
        metrics: {
            noveltyScore: report.internalAnalysis?.noveltyScore || 0.5,
            ipRiskScore: report.patentSignals?.score || 0,
            ipRiskLevel: report.patentSignals?.riskLevel || 'Unknown'
        },

        // Similar Ideas (UI-ready with full metadata)
        similarIdeas: normalizeSimilarIdeas(report.internalAnalysis?.similarIdeas || []),

        // Sections (direct access, no parsing needed)
        // Extract string content from section objects
        sections: {
            internalPosition: extractSectionContent(report.sections?.internalPosition),
            externalEvidence: extractSectionContent(report.sections?.marketTrends),
            competitors: extractSectionContent(report.sections?.competitors),
            patents: extractSectionContent(report.sections?.patentRisk),
            opportunities: extractSectionContent(report.sections?.opportunities),
            risks: extractSectionContent(report.sections?.risks)
        },

        // Patent/IP Risk
        patentSignals: {
            riskLevel: report.patentSignals?.riskLevel || 'Unknown',
            score: report.patentSignals?.score || 0,
            patents: report.patentSignals?.patents || [],
            factors: report.patentSignals?.factors || []
        },

        // Internal Analysis (for metrics display)
        // Use normalized similar ideas to prevent React rendering errors
        internalAnalysis: {
            similarIdeas: normalizeSimilarIdeas(report.internalAnalysis?.similarIdeas || []),
            noveltyScore: report.internalAnalysis?.noveltyScore || 0.5
        },

        // Sources for citations
        sources: report.sources || [],

        // Full report text (for PDF/download)
        fullReport: report.fullReport || '',

        // Metadata
        generatedAt: report.generatedAt || new Date().toISOString(),

        // Verdict/Summary
        verdict: report.verdict || ''
    };

    // Verify all sections are strings
    console.log('[DTO] Section types:', {
        internalPosition: typeof normalized.sections.internalPosition,
        externalEvidence: typeof normalized.sections.externalEvidence,
        competitors: typeof normalized.sections.competitors,
        patents: typeof normalized.sections.patents,
        opportunities: typeof normalized.sections.opportunities,
        risks: typeof normalized.sections.risks
    });

    console.log('[DTO] Normalization complete - all sections are strings:',
        Object.values(normalized.sections).every(s => typeof s === 'string'));

    return normalized;
}

/**
 * Normalize similar ideas array for frontend rendering
 * Ensures all required fields are present and in correct format
 */
function normalizeSimilarIdeas(similarIdeas) {
    return similarIdeas.map(idea => ({
        ideaId: idea.id,
        title: idea.title || 'Untitled Idea',
        similarityPercent: idea.similarityPct || Math.round((idea.similarity || 0) * 100),
        similarity: idea.similarity || 0,
        businessGroup: idea.businessGroup || 'Unknown',
        band: idea.band || getSimilarityBand(idea.similarity || 0),
        tags: idea.tags || []
    }));
}

/**
 * Extract string content from section (handles both string and object formats)
 */
function extractSectionContent(section) {
    if (!section) return '';

    // If it's already a string, return it
    if (typeof section === 'string') return section;

    // If it's an object with content/summary field, extract it
    if (typeof section === 'object') {
        return section.content || section.summary || section.text || '';
    }

    return '';
}

/**
 * Get similarity band for display
 */
function getSimilarityBand(similarity) {
    if (similarity >= 0.8) return 'Strong overlap';
    if (similarity >= 0.5) return 'Moderate overlap';
    return 'Low overlap';
}

export default {
    normalizeReportForFrontend
};
