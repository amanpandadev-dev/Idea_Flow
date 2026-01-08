/**
 * Section-Wise Synthesizer
 * 
 * Generates report sections using dedicated, evidence-grounded prompts.
 * Each section uses ONLY its relevant evidence and cannot hallucinate.
 * 
 * Key principle: "If evidence exists, you MUST produce insights."
 */

import { generateChatCompletion } from '../config/ollama.js';

const MODEL_NAME = 'tinyllama:latest';

/**
 * Synthesize all report sections
 */
export async function synthesizeAllSections(idea, internalAnalysis, structuredEvidence, ipRisk) {
    console.log(`[SectionSynthesizer] Generating ${6} sections for idea ${idea.idea_id}`);

    // Generate each section independently
    const [
        internalPosition,
        marketTrends,
        competitors,
        patentRisk,
        opportunities,
        risks
    ] = await Promise.all([
        synthesizeInternalPosition(idea, internalAnalysis),
        synthesizeMarketTrends(idea, structuredEvidence.marketTrends),
        synthesizeCompetitors(idea, structuredEvidence.competitors),
        synthesizePatentRisk(idea, ipRisk, structuredEvidence.patents),
        synthesizeOpportunities(idea, structuredEvidence),
        synthesizeRisks(idea, structuredEvidence, internalAnalysis)
    ]);

    return {
        internalPosition,
        marketTrends,
        competitors,
        patentRisk,
        opportunities,
        risks
    };
}

/**
 * Section 1: Internal Position
 */
async function synthesizeInternalPosition(idea, internalAnalysis) {
    if (!internalAnalysis || internalAnalysis.similarIdeas.length === 0) {
        return {
            summary: 'No similar internal ideas found. This appears to be a novel concept within the organization.',
            noveltyScore: 100,
            similarIdeas: []
        };
    }

    const prompt = `You are analyzing the internal novelty of an innovation idea.

**Idea:** ${idea.title}

**Similar Internal Ideas Found:**
${internalAnalysis.similarIdeas.map((s, idx) =>
        `${idx + 1}. "${s.title}" - ${s.similarityPct}% similar (${s.band}), ${s.businessGroup}`
    ).join('\n')}

**Novelty Score:** ${(internalAnalysis.noveltyScore * 100).toFixed(0)}% novel

Provide a 2-3 sentence assessment:
- State the novelty level
- Identify any duplication risk
- Note if similar ideas are in same/different business groups`;

    const response = await generateChatCompletion([
        { role: 'system', content: 'You are a concise innovation analyst. Stick to facts.' },
        { role: 'user', content: prompt }
    ], MODEL_NAME, { temperature: 0.4, max_tokens: 200 });

    return {
        summary: response.message.content,
        noveltyScore: Math.round(internalAnalysis.noveltyScore * 100),
        similarIdeas: internalAnalysis.similarIdeas
    };
}

/**
 * Section 2: Market Trends
 */
async function synthesizeMarketTrends(idea, marketTrends) {
    if (!marketTrends || marketTrends.length === 0) {
        return {
            summary: 'No market trend data available.',
            trends: [],
            hasEvidence: false
        };
    }

    const prompt = `Using ONLY the following market trend evidence, summarize key industry signals:

${marketTrends.map((t, idx) =>
        `${idx + 1}. ${t.title}\n   ${t.summary}`
    ).join('\n\n')}

Provide 3-4 bullet points covering:
- Key industry signals
- Adoption maturity
- Growth indicators

CRITICAL: Stick ONLY to the provided evidence. If the evidence is irrelevant or junk, identify that you found limited actionable market information. Do NOT hallucinate industry names or trends not in this text. If no evidence is shown above, say "No relevant market data available."`;

    const response = await generateChatCompletion([
        { role: 'system', content: 'You analyze market trends based only on provided evidence. Never hallucinate.' },
        { role: 'user', content: prompt }
    ], MODEL_NAME, { temperature: 0.5, max_tokens: 300 });

    return {
        summary: response.message.content,
        trends: marketTrends,
        hasEvidence: true
    };
}

/**
 * Section 3: Competitors
 */
async function synthesizeCompetitors(idea, competitors) {
    if (!competitors || competitors.length === 0) {
        return {
            summary: 'No competitor data available.',
            competitors: [],
            competitiveIntensity: 'Unknown',
            hasEvidence: false
        };
    }

    const prompt = `Using ONLY the following competitor evidence, analyze the competitive landscape:

${competitors.map((c, idx) =>
        `${idx + 1}. ${c.name}\n   ${c.description}`
    ).join('\n\n')}

Provide an assessment covering:
- Name specific companies found
- Competitive intensity (Low/Medium/High)
- Differentiation opportunities

CRITICAL: Stick ONLY to the provided competitor names and descriptions. If no direct competitors are in the evidence, state that searching found no direct competitors for this specific niche. Do NOT invent competitor names.`;

    const response = await generateChatCompletion([
        { role: 'system', content: 'You analyze competitors based only on provided evidence. Be specific with company names.' },
        { role: 'user', content: prompt }
    ], MODEL_NAME, { temperature: 0.4, max_tokens: 300 });

    // Extract competitive intensity
    const text = response.message.content.toLowerCase();
    let intensity = 'Medium';
    if (text.includes('low') || text.includes('limited competition')) intensity = 'Low';
    if (text.includes('high') || text.includes('intense') || text.includes('crowded')) intensity = 'High';

    return {
        summary: response.message.content,
        competitors,
        competitiveIntensity: intensity,
        hasEvidence: true
    };
}

/**
 * Section 4: Patent & IP Risk
 */
async function synthesizePatentRisk(idea, ipRisk, patents) {
    if (!patents || patents.length === 0) {
        return {
            summary: 'No patent signals found in search. IP risk appears Low based on lack of prior art discovered. This is not legal advice - consult an IP attorney for thorough analysis.',
            riskLevel: 'Low',
            score: 0,
            patents: [],
            hasEvidence: false
        };
    }

    const prompt = `You are explaining an IP risk assessment. Here is the CALCULATED risk score:

**IP Risk Score:** ${ipRisk.score}/100 (${ipRisk.level})

**Risk Calculation Breakdown:**
- Relevant patents found: ${ipRisk.factors.numRelevantPatents}
- Max similarity to internal ideas: ${(ipRisk.factors.maxSimilarity * 100).toFixed(0)}%
- Patent contribution: ${ipRisk.factors.patentContribution} points
- Similarity contribution: ${ipRisk.factors.similarityContribution} points

**Patents Found:**
${patents.slice(0, 5).map((p, idx) => `${idx + 1}. ${p.title}`).join('\n')}

Your task: EXPLAIN this score in 3-4 sentences. You are NOT deciding the risk level - it's already calculated as ${ipRisk.level}.

End with: "${ipRisk.disclaimer}"`;

    const response = await generateChatCompletion([
        { role: 'system', content: 'You explain pre-calculated IP risk scores. You do not decide the risk level.' },
        { role: 'user', content: prompt }
    ], MODEL_NAME, { temperature: 0.3, max_tokens: 250 });

    return {
        summary: response.message.content,
        riskLevel: ipRisk.level,
        score: ipRisk.score,
        patents,
        hasEvidence: true
    };
}

/**
 * Section 5: Opportunities
 */
async function synthesizeOpportunities(idea, structuredEvidence) {
    const hasEvidence = structuredEvidence.summary.hasEvidence;

    let evidenceText = '';
    if (hasEvidence) {
        evidenceText = 'Based on the market evidence:\n\n';
        if (structuredEvidence.marketTrends.length > 0) {
            evidenceText += `Market Trends: ${structuredEvidence.marketTrends.length} signals found\n`;
        }
        if (structuredEvidence.competitors.length > 0) {
            evidenceText += `Competitors: ${structuredEvidence.competitors.length} identified\n`;
        }
    }

    const prompt = `Identify market opportunities for this idea:

**Idea:** ${idea.title}
**Description:** ${idea.summary}

${evidenceText}

List 3-4 strategic opportunities or market gaps that this idea could address.
${hasEvidence ? 'Ground your response in the evidence provided above.' : 'Base on general market knowledge and the idea description.'}`;

    const response = await generateChatCompletion([
        { role: 'system', content: 'You identify market opportunities. Be specific and actionable.' },
        { role: 'user', content: prompt }
    ], MODEL_NAME, { temperature: 0.6, max_tokens: 300 });

    return {
        summary: response.message.content,
        hasEvidence
    };
}

/**
 * Section 6: Risks
 */
async function synthesizeRisks(idea, structuredEvidence, internalAnalysis) {
    const hasCompetitors = structuredEvidence.competitors.length > 0;
    const hasInternalSimilar = internalAnalysis.similarIdeas.length > 0;

    const prompt = `Identify key risks for this innovation idea:

**Idea:** ${idea.title}
**Idea-stated risks:** ${idea.risks || 'None specified'}

Context:
${hasCompetitors ? `- ${structuredEvidence.competitors.length} competitors found` : '- No competitor data available'}
${hasInternalSimilar ? `- ${internalAnalysis.similarIdeas.length} similar internal ideas exist` : '- No internal duplicates'}

List 3-4 key risks covering:
- Market risks
- Technical risks  
- Competitive threats
- Regulatory considerations (if applicable)`;

    const response = await generateChatCompletion([
        { role: 'system', content: 'You identify innovation risks. Be honest and realistic.' },
        { role: 'user', content: prompt }
    ], MODEL_NAME, { temperature: 0.5, max_tokens: 300 });

    return {
        summary: response.message.content,
        hasEvidence: hasCompetitors || hasInternalSimilar
    };
}

export default {
    synthesizeAllSections
};
