/**
 * Market Validation Synthesis Service
 * 
 * REFACTORED: Now uses section-wise synthesis with evidence-grounded prompts
 * 
 * Pipeline:
 * 1. Structure external evidence (normalize Tavily results)
 * 2. Calculate IP risk (deterministic)
 * 3. Synthesize each section individually
 * 4. Assemble final report
 */

import { structureExternalEvidence } from './evidenceNormalizer.js';
import { calculateIPRiskScore } from './ipRiskCalculator.js';
import { synthesizeAllSections } from './sectionSynthesizer.js';

/**
 * Generate structured market validation report using new pipeline
 */
export async function synthesizeValidationReport(idea, internalAnalysis, externalIntelligence) {
    console.log(`[Synthesis] Generating validation report for idea ${idea.idea_id}`);

    try {
        // Step 1: Structure external evidence
        const structuredEvidence = structureExternalEvidence(externalIntelligence);
        console.log(`[Synthesis] Structured evidence: ${structuredEvidence.summary.totalSources} sources`);

        // Step 2: Calculate IP risk (deterministic - LLM explains, not decides)
        const ipRisk = calculateIPRiskScore(
            structuredEvidence.patents,
            internalAnalysis?.similarIdeas || []
        );
        console.log(`[Synthesis] IP Risk calculated: ${ipRisk.level} (${ipRisk.score}/100)`);

        // Step 3: Synthesize each section with evidence-grounded prompts
        const sections = await synthesizeAllSections(
            idea,
            internalAnalysis,
            structuredEvidence,
            ipRisk
        );
        console.log(`[Synthesis] All sections synthesized`);

        // Step 4: Assemble final report
        const report = assembleReport(idea, sections, internalAnalysis, structuredEvidence, ipRisk);

        console.log(`[Synthesis] Report generation complete`);
        return report;

    } catch (error) {
        console.error(`[Synthesis] Failed to generate report:`, error.message);
        throw new Error(`LLM synthesis failed: ${error.message}`);
    }
}

/**
 * Assemble final report from individual sections
 */
function assembleReport(idea, sections, internalAnalysis, structuredEvidence, ipRisk) {
    // Generate full report text by combining sections
    const fullReport = buildFullReportText(idea, sections);

    // Generate executive summary/verdict
    const verdict = generateVerdict(sections, ipRisk, structuredEvidence);

    // Collect all sources with dedupe
    const sources = collectSources(structuredEvidence);

    return {
        // Core report content
        fullReport,

        // Structured sections for frontend
        sections: {
            internalPosition: sections.internalPosition,
            marketTrends: sections.marketTrends,
            competitors: sections.competitors,
            patentRisk: sections.patentRisk,
            opportunities: sections.opportunities,
            risks: sections.risks
        },

        // Key metrics
        internalAnalysis: {
            similarIdeas: internalAnalysis?.similarIdeas || [],
            noveltyScore: internalAnalysis?.noveltyScore || 0.5
        },

        externalEvidence: {
            marketTrends: structuredEvidence.marketTrends,
            competitors: structuredEvidence.competitors,
            totalSources: sources.length,
            hasEvidence: structuredEvidence.summary.hasEvidence
        },

        patentSignals: {
            riskLevel: ipRisk.level,
            score: ipRisk.score,
            patents: structuredEvidence.patents,
            factors: ipRisk.factors
        },

        verdict,
        sources,
        generatedAt: new Date().toISOString()
    };
}

/**
 * Build full report text from sections
 */
function buildFullReportText(idea, sections) {
    let report = `# Market Validation Report\n\n`;
    report += `**Idea:** ${idea.title}\n\n`;
    report += `---\n\n`;

    // Section 1: Internal Position
    report += `## 1. Internal Idea Position\n\n`;
    report += `**Novelty Score:** ${sections.internalPosition.noveltyScore}% novel\n\n`;
    report += `${sections.internalPosition.summary}\n\n`;

    if (sections.internalPosition.similarIdeas.length > 0) {
        report += `**Similar Internal Ideas:**\n`;
        sections.internalPosition.similarIdeas.forEach(s => {
            report += `- "${s.title}" (${s.similarityPct}% similar, ${s.band})\n`;
        });
        report += `\n`;
    }
    report += `---\n\n`;

    // Section 2: Market Trends
    report += `## 2. External Market Evidence\n\n`;
    if (sections.marketTrends.hasEvidence) {
        report += `${sections.marketTrends.summary}\n\n`;
        report += `**Sources:** ${sections.marketTrends.trends.length} market trend sources analyzed\n\n`;
    } else {
        report += `${sections.marketTrends.summary}\n\n`;
    }
    report += `---\n\n`;

    // Section 3: Competitor Landscape
    report += `## 3. Competitor Landscape\n\n`;
    if (sections.competitors.hasEvidence) {
        report += `**Competitive Intensity:** ${sections.competitors.competitiveIntensity}\n\n`;
        report += `${sections.competitors.summary}\n\n`;
    } else {
        report += `${sections.competitors.summary}\n\n`;
    }
    report += `---\n\n`;

    // Section 4: Patent & IP Risk
    report += `## 4. Patent & IP Risk Signals\n\n`;
    report += `**Risk Level:** ${sections.patentRisk.riskLevel} (Score: ${sections.patentRisk.score}/100)\n\n`;
    report += `${sections.patentRisk.summary}\n\n`;
    report += `---\n\n`;

    // Section 5: Opportunities
    report += `## 5. Market Opportunities & Strategic Gaps\n\n`;
    report += `${sections.opportunities.summary}\n\n`;
    report += `---\n\n`;

    // Section 6: Risks
    report += `## 6. Risks & Challenges\n\n`;
    report += `${sections.risks.summary}\n\n`;
    report += `---\n\n`;

    return report;
}

/**
 * Generate executive summary/verdict
 */
function generateVerdict(sections, ipRisk, structuredEvidence) {
    const novelty = sections.internalPosition.noveltyScore;
    const hasMarketData = structuredEvidence.summary.hasMarketData;
    const competitorCount = structuredEvidence.competitors.length;
    const riskLevel = ipRisk.level;

    let verdict = '';

    // Novelty assessment
    if (novelty >= 80) {
        verdict += 'This idea shows high internal novelty. ';
    } else if (novelty >= 50) {
        verdict += 'This idea has moderate internal novelty. ';
    } else {
        verdict += 'This idea has low internal novelty with significant overlap to existing concepts. ';
    }

    // Market evidence
    if (hasMarketData) {
        verdict += 'Market evidence suggests active industry interest. ';
    } else {
        verdict += 'Limited market data available for validation. ';
    }

    // Competition
    if (competitorCount >= 3) {
        verdict += 'The competitive landscape is active with multiple players identified. ';
    } else if (competitorCount > 0) {
        verdict += 'Some competition exists but market may have room for entry. ';
    } else {
        verdict += 'No direct competitors identified in search. ';
    }

    // IP risk
    verdict += `IP risk is assessed as ${riskLevel}. `;

    // Final recommendation
    if (novelty >= 70 && riskLevel !== 'High') {
        verdict += 'Recommendation: Proceed with detailed feasibility analysis.';
    } else if (novelty >= 40) {
        verdict += 'Recommendation: Validate competitive differentiation before proceeding.';
    } else {
        verdict += 'Recommendation: Review for potential overlap with existing initiatives.';
    }

    return verdict;
}

/**
 * Collect all unique sources
 */
function collectSources(structuredEvidence) {
    const sources = [];
    const seen = new Set();

    const allEvidence = [
        ...structuredEvidence.marketTrends,
        ...structuredEvidence.competitors,
        ...structuredEvidence.patents
    ];

    allEvidence.forEach(item => {
        if (item.source && !seen.has(item.source)) {
            sources.push({
                title: item.title,
                url: item.source,
                category: item.category
            });
            seen.add(item.source);
        }
    });

    return sources.slice(0, 15); // Max 15 sources
}

export default {
    synthesizeValidationReport
};