/**
 * Market Validation Synthesis Service
 * 
 * Uses LLaMA to synthesize internal and external intelligence
 * into a structured market validation report
 */

import { generateChatCompletion, getModelNames } from '../config/ollama.js';

/**
 * Generate structured market validation report using LLM
 */
export async function synthesizeValidationReport(idea, internalAnalysis, externalIntelligence) {
    console.log(`[Synthesis] Generating validation report for idea ${idea.idea_id}`);

    // Use TinyLlama for faster generation (avoids timeout)
    const modelName = 'tinyllama:latest';

    // Build comprehensive prompt
    const prompt = buildSynthesisPrompt(idea, internalAnalysis, externalIntelligence);

    try {
        const response = await generateChatCompletion([
            {
                role: 'system',
                content: 'You are a market validation analyst for an enterprise innovation program. Provide structured, evidence-based assessments. Be concise.'
            },
            {
                role: 'user',
                content: prompt
            }
        ], modelName, {
            temperature: 0.5, // Lower for more focused responses
            max_tokens: 1200  // Reduced from 2000 for faster generation
        });

        const reportText = response.message.content;

        console.log(`[Synthesis] Report generated (${reportText.length} chars)`);

        // Parse report into structured sections
        return parseReportSections(reportText, internalAnalysis, externalIntelligence);

    } catch (error) {
        console.error(`[Synthesis] Failed to generate report:`, error.message);
        throw new Error(`LLM synthesis failed: ${error.message}`);
    }
}

/**
 * Build comprehensive synthesis prompt
 */
function buildSynthesisPrompt(idea, internalAnalysis, externalIntelligence) {
    const prompt = `Analyze this innovation idea and provide a structured market validation assessment.

## IDEA DETAILS

**Title:** ${idea.title}

**Problem/Opportunity:** ${idea.challenge_opportunity || idea.summary}

**Proposed Solution:** ${idea.summary}

**Business Group:** ${idea.business_group || 'Not specified'}

**Benefits:** ${idea.benefits || 'Not specified'}

**Risks:** ${idea.risks || 'Not specified'}

## INTERNAL INTELLIGENCE

${formatInternalData(internalAnalysis)}

## EXTERNAL INTELLIGENCE

${formatExternalData(externalIntelligence)}

## REQUIRED OUTPUT FORMAT

Generate a structured report with EXACTLY these sections:

### 1. Idea Understanding
2-3 sentence summary of what this idea proposes.

### 2. Internal Idea Position
- Similar internal ideas (if any)
- Novelty assessment
- Internal duplication risk

### 3. External Market Evidence
- Market trends observed
- Adoption signals
- Real-world examples (if found)

### 4. Competitor Landscape
- Known companies/products
- Competitive intensity: Low/Medium/High
- Differentiation opportunities

### 5. Patent & IP Risk Signals
- Patent indicators found (if any)
- Risk level: Low/Medium/High
- **CRITICAL:** State "This is not legal advice" if patents found

### 6. Risks & Conflicts
- Market risks
- Technical risks
- Regulatory considerations

### 7. Opportunities & Gaps
- Market white spaces
- Strategic advantages
- Growth potential

### 8. Overall Market Validation Verdict
One paragraph executive summary with final assessment.

## RULES

- Use bullet points for lists
- NO inline citations like [1], [2]
- If evidence is weak, say "No strong evidence found"
- Be honest about data limitations
- Base conclusions on provided data only
- Keep language professional and concise`;

    return prompt;
}

/**
 * Format internal intelligence for prompt
 */
function formatInternalData(internalAnalysis) {
    if (!internalAnalysis || internalAnalysis.similarIdeas.length === 0) {
        return 'No similar internal ideas found. This appears novel within the organization.';
    }

    let formatted = `**Novelty Score:** ${(internalAnalysis.noveltyScore * 100).toFixed(0)}% novel\n\n`;
    formatted += `**Similar Internal Ideas:**\n`;

    for (const idea of internalAnalysis.similarIdeas) {
        formatted += `- "${idea.title}" (${(idea.similarity * 100).toFixed(0)}% similar)\n`;
    }

    return formatted;
}

/**
 * Format external intelligence for prompt
 */
function formatExternalData(externalIntelligence) {
    if (!externalIntelligence || externalIntelligence.summary.totalSources === 0) {
        return 'No external market data available. Analysis based on internal data only.';
    }

    const formatted = [];

    // Market trends
    if (externalIntelligence.marketTrends && externalIntelligence.marketTrends.length > 0) {
        formatted.push('**Market Trends:**');
        for (const result of externalIntelligence.marketTrends.slice(0, 3)) {
            formatted.push(`- ${result.title}: ${result.content.substring(0, 150)}...`);
        }
    }

    // Competitors
    if (externalIntelligence.competitors && externalIntelligence.competitors.length > 0) {
        formatted.push('\n**Known Competitors:**');
        for (const result of externalIntelligence.competitors.slice(0, 3)) {
            formatted.push(`- ${result.title}: ${result.content.substring(0, 150)}...`);
        }
    }

    // Patents
    if (externalIntelligence.patents && externalIntelligence.patents.length > 0) {
        formatted.push('\n**Patent Indicators:**');
        for (const result of externalIntelligence.patents.slice(0, 3)) {
            formatted.push(`- ${result.title}`);
        }
    }

    if (formatted.length === 0) {
        return 'External search performed but no relevant results found.';
    }

    return formatted.join('\n');
}

/**
 * Parse LLM response into structured sections
 */
function parseReportSections(reportText, internalAnalysis, externalIntelligence) {
    // Extract patent risk level
    let patentRiskLevel = 'Low';
    if (reportText.toLowerCase().includes('risk level: high') || reportText.toLowerCase().includes('high risk')) {
        patentRiskLevel = 'High';
    } else if (reportText.toLowerCase().includes('risk level: medium') || reportText.toLowerCase().includes('medium risk')) {
        patentRiskLevel = 'Medium';
    }

    // Extract verdict (last paragraph usually)
    const verdictMatch = reportText.match(/### 8\. Overall Market Validation Verdict\s+([\s\S]+?)(?=###|$)/i);
    const verdict = verdictMatch ? verdictMatch[1].trim() : 'Assessment complete. See detailed sections above.';

    // Collect sources
    const sources = [];

    if (externalIntelligence) {
        ['marketTrends', 'competitors', 'patents'].forEach(category => {
            if (externalIntelligence[category]) {
                externalIntelligence[category].forEach(result => {
                    if (result.url && !sources.find(s => s.url === result.url)) {
                        sources.push({
                            title: result.title,
                            url: result.url,
                            category: category
                        });
                    }
                });
            }
        });
    }

    return {
        fullReport: reportText,
        internalAnalysis: {
            similarIdeas: internalAnalysis?.similarIdeas || [],
            noveltyScore: internalAnalysis?.noveltyScore || 0.5
        },
        externalEvidence: {
            marketTrends: externalIntelligence?.marketTrends || [],
            competitors: externalIntelligence?.competitors || [],
            totalSources: sources.length
        },
        patentSignals: {
            riskLevel: patentRiskLevel,
            patents: externalIntelligence?.patents || []
        },
        verdict: verdict.substring(0, 500), // Limit length
        sources: sources.slice(0, 10), // Max 10 sources
        generatedAt: new Date().toISOString()
    };
}

export default {
    synthesizeValidationReport
};