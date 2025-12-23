/**
 * Market Validation Data Adapter
 * 
 * Transforms backend API responses into UI-safe data structures with explicit
 * field mappings and safe defaults. This adapter ensures the frontend never
 * receives undefined/null values in required fields and provides consistent
 * data shapes for rendering.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

// ============================================================================
// Input Interfaces (Raw API Response)
// ============================================================================

interface RawSectionData {
  summary?: string;
  evidence?: Array<any>;
  metadata?: Record<string, any>;
  hasEvidence?: boolean;
  // Section-specific fields
  noveltyScore?: number;
  similarIdeas?: Array<any>;
  trends?: Array<any>;
  competitors?: Array<any>;
  competitiveIntensity?: string;
  patents?: Array<any>;
  riskLevel?: string;
  score?: number;
}

export interface RawMarketValidationResponse {
  success: boolean;
  ideaId: number;
  idea: { id: number; title: string };
  fullReport: string;
  sections: {
    internalPosition: RawSectionData;
    marketTrends: RawSectionData;
    competitors: RawSectionData;
    patentRisk: RawSectionData;
    opportunities: RawSectionData;
    risks: RawSectionData;
  };
  internalAnalysis: {
    similarIdeas: Array<any>;
    noveltyScore: number;
  };
  externalEvidence: {
    marketTrends: Array<any>;
    competitors: Array<any>;
    totalSources: number;
  };
  patentSignals: {
    riskLevel: string;
    score: number;
    patents: Array<any>;
    factors?: any;
  };
  verdict: string;
  sources: Array<any>;
  generatedAt: string;
}

// ============================================================================
// Output Interfaces (Normalized UI-Safe Structure)
// ============================================================================

export interface EvidenceItem {
  title: string;
  description: string;
  source?: string;
  category?: string;
  score?: number;
}

export interface NormalizedSection {
  hasData: boolean;
  summary: string;
  evidence: Array<EvidenceItem>;
  metadata: Record<string, any>;
}

export interface NormalizedSimilarIdea {
  id: string;
  title: string;
  similarity: number;
  similarityPct: number;
  band: string;
  businessGroup: string;
}

export interface NormalizedPatentRisk {
  level: 'Low' | 'Medium' | 'High';
  score: number;
  patentCount: number;
  factors: {
    numRelevantPatents: number;
    maxSimilarity: number;
    patentContribution: number;
    similarityContribution: number;
  };
  disclaimer: string;
}

export interface NormalizedSource {
  title: string;
  url: string;
  category: string;
}

export interface NormalizedMarketValidationReport {
  metadata: {
    ideaId: number;
    ideaTitle: string;
    generatedAt: string;
    hasData: boolean;
  };
  sections: {
    internalPosition: NormalizedSection;
    marketTrends: NormalizedSection;
    competitors: NormalizedSection;
    patentRisk: NormalizedSection;
    opportunities: NormalizedSection;
    risks: NormalizedSection;
  };
  metrics: {
    noveltyScore: number;
    noveltyLabel: string;
    totalSources: number;
    similarIdeasCount: number;
  };
  patentRisk: NormalizedPatentRisk;
  similarIdeas: Array<NormalizedSimilarIdea>;
  verdict: string;
  sources: Array<NormalizedSource>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Safely extracts a string value with fallback
 */
function safeString(value: any, fallback: string = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

/**
 * Safely extracts a number value with fallback
 */
function safeNumber(value: any, fallback: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Safely extracts an array with fallback
 */
function safeArray<T>(value: any, fallback: Array<T> = []): Array<T> {
  return Array.isArray(value) ? value : fallback;
}

/**
 * Determines novelty label from score
 */
function getNoveltyLabel(score: number): string {
  if (score >= 80) return 'Highly Novel';
  if (score >= 60) return 'Novel';
  if (score >= 40) return 'Moderately Novel';
  if (score >= 20) return 'Low Novelty';
  return 'Not Novel';
}

// ============================================================================
// Evidence Normalizers
// ============================================================================

/**
 * Normalizes evidence items for market trends, competitors, and patents
 * Requirements: 6.4
 */
function normalizeEvidence(
  evidence: Array<any>,
  type: 'trends' | 'competitors' | 'patents'
): Array<EvidenceItem> {
  if (!Array.isArray(evidence)) {
    console.warn(`Evidence for ${type} is not an array:`, evidence);
    return [];
  }

  return evidence.map((item, index) => {
    if (!item || typeof item !== 'object') {
      console.warn(`Invalid evidence item at index ${index} for ${type}:`, item);
      return {
        title: 'Unknown',
        description: 'No description available',
      };
    }

    switch (type) {
      case 'trends':
        return {
          title: safeString(item.title, 'Untitled Trend'),
          description: safeString(item.summary || item.description, 'No summary available'),
          source: safeString(item.source),
          category: safeString(item.category),
          score: safeNumber(item.score),
        };
      
      case 'competitors':
        return {
          title: safeString(item.name || item.title, 'Unknown Competitor'),
          description: safeString(item.description || item.summary, 'No description available'),
          source: safeString(item.source),
          category: safeString(item.category),
        };
      
      case 'patents':
        return {
          title: safeString(item.title, 'Untitled Patent'),
          description: safeString(item.abstract || item.description, 'No abstract available'),
          source: safeString(item.source),
          category: safeString(item.category),
        };
      
      default:
        return {
          title: safeString(item.title, 'Unknown'),
          description: safeString(item.description || item.summary, 'No description available'),
          source: safeString(item.source),
        };
    }
  });
}

// ============================================================================
// Similar Ideas Normalizer
// ============================================================================

/**
 * Normalizes similar ideas with similarity percentage preservation
 * Requirements: 6.4, 2.2
 */
export function normalizeSimilarIdeas(
  ideas: Array<any>
): Array<NormalizedSimilarIdea> {
  if (!Array.isArray(ideas)) {
    console.warn('Similar ideas is not an array:', ideas);
    return [];
  }

  return ideas.map((idea, index) => {
    if (!idea || typeof idea !== 'object') {
      console.warn(`Invalid similar idea at index ${index}:`, idea);
      return {
        id: `unknown-${index}`,
        title: 'Unknown Idea',
        similarity: 0,
        similarityPct: 0,
        band: 'unknown',
        businessGroup: 'Unknown',
      };
    }

    // Preserve backend-calculated similarity - NEVER default to 0
    const similarity = safeNumber(idea.similarity);
    const similarityPct = safeNumber(idea.similarityPct || idea.similarity * 100);

    if (similarity === 0 && similarityPct === 0 && (idea.similarity !== 0 && idea.similarityPct !== 0)) {
      console.warn(`Similar idea "${idea.title}" has missing similarity data:`, idea);
    }

    return {
      id: safeString(idea.id || idea.ideaId, `idea-${index}`),
      title: safeString(idea.title, 'Untitled Idea'),
      similarity,
      similarityPct,
      band: safeString(idea.band, 'unknown'),
      businessGroup: safeString(idea.businessGroup || idea.business_group, 'Unknown'),
    };
  });
}

// ============================================================================
// Patent Risk Normalizer
// ============================================================================

/**
 * Normalizes patent risk data with factors and disclaimer
 * Requirements: 6.4, 3.1, 3.2, 3.5
 */
export function normalizePatentRisk(
  patentSignals: any
): NormalizedPatentRisk {
  if (!patentSignals || typeof patentSignals !== 'object') {
    console.warn('Patent signals is missing or invalid:', patentSignals);
    return {
      level: 'Low',
      score: 0,
      patentCount: 0,
      factors: {
        numRelevantPatents: 0,
        maxSimilarity: 0,
        patentContribution: 0,
        similarityContribution: 0,
      },
      disclaimer: 'This is a preliminary assessment based on available patent data. Consult with IP counsel for comprehensive analysis.',
    };
  }

  const riskLevel = safeString(patentSignals.riskLevel, 'Low');
  const validRiskLevels = ['Low', 'Medium', 'High'];
  const normalizedLevel = validRiskLevels.includes(riskLevel) 
    ? riskLevel as 'Low' | 'Medium' | 'High'
    : 'Low';

  const patents = safeArray(patentSignals.patents);
  const factors = patentSignals.factors || {};

  return {
    level: normalizedLevel,
    score: safeNumber(patentSignals.score),
    patentCount: patents.length,
    factors: {
      numRelevantPatents: safeNumber(factors.numRelevantPatents || patents.length),
      maxSimilarity: safeNumber(factors.maxSimilarity),
      patentContribution: safeNumber(factors.patentContribution),
      similarityContribution: safeNumber(factors.similarityContribution),
    },
    disclaimer: safeString(
      patentSignals.disclaimer,
      'This is a preliminary assessment based on available patent data. Consult with IP counsel for comprehensive analysis.'
    ),
  };
}

// ============================================================================
// Section Normalizers
// ============================================================================

/**
 * Normalizes a section object with safe defaults
 * Requirements: 6.3, 6.6
 */
function normalizeSection(
  sectionData: RawSectionData | undefined,
  sectionType: string,
  apiResponse: RawMarketValidationResponse
): NormalizedSection {
  if (!sectionData) {
    console.warn(`Section ${sectionType} is missing or null`);
    return {
      hasData: false,
      summary: 'No data available',
      evidence: [],
      metadata: {},
    };
  }

  let evidence: Array<EvidenceItem> = [];
  let hasData = false;

  // Extract evidence based on section type
  switch (sectionType) {
    case 'internalPosition':
      // Internal position uses similar ideas as evidence
      hasData = Boolean(sectionData.summary || sectionData.similarIdeas?.length);
      break;

    case 'marketTrends':
      evidence = normalizeEvidence(
        sectionData.trends || sectionData.evidence || [],
        'trends'
      );
      hasData = Boolean(sectionData.summary || evidence.length > 0);
      break;

    case 'competitors':
      evidence = normalizeEvidence(
        sectionData.competitors || sectionData.evidence || [],
        'competitors'
      );
      hasData = Boolean(sectionData.summary || evidence.length > 0);
      break;

    case 'patentRisk':
      evidence = normalizeEvidence(
        sectionData.patents || sectionData.evidence || [],
        'patents'
      );
      hasData = Boolean(sectionData.summary || evidence.length > 0);
      break;

    case 'opportunities':
    case 'risks':
      hasData = Boolean(sectionData.summary);
      break;

    default:
      console.warn(`Unknown section type: ${sectionType}`);
      hasData = Boolean(sectionData.summary);
  }

  return {
    hasData,
    summary: safeString(sectionData.summary, hasData ? '' : 'No data available'),
    evidence,
    metadata: sectionData.metadata || {},
  };
}

// ============================================================================
// Source Normalizer
// ============================================================================

/**
 * Normalizes source items
 */
function normalizeSources(sources: Array<any>): Array<NormalizedSource> {
  if (!Array.isArray(sources)) {
    console.warn('Sources is not an array:', sources);
    return [];
  }

  return sources.map((source, index) => {
    if (!source || typeof source !== 'object') {
      console.warn(`Invalid source at index ${index}:`, source);
      return {
        title: 'Unknown Source',
        url: '',
        category: 'unknown',
      };
    }

    return {
      title: safeString(source.title || source.name, 'Unknown Source'),
      url: safeString(source.url || source.link),
      category: safeString(source.category || source.type, 'unknown'),
    };
  });
}

// ============================================================================
// Main Adapter Function
// ============================================================================

/**
 * Main adapter function that transforms raw API response into UI-safe structure
 * Requirements: 6.1, 6.2, 6.7
 */
export function normalizeMarketValidationReport(
  apiResponse: RawMarketValidationResponse
): NormalizedMarketValidationReport {
  // Validate input
  if (!apiResponse || typeof apiResponse !== 'object') {
    console.error('Invalid API response:', apiResponse);
    throw new Error('Invalid market validation API response');
  }

  // Extract and validate core data
  const ideaId = safeNumber(apiResponse.ideaId);
  const ideaTitle = safeString(apiResponse.idea?.title, 'Unknown Idea');
  const generatedAt = safeString(apiResponse.generatedAt, new Date().toISOString());

  // Normalize sections
  const sections = apiResponse.sections || {} as any;
  const normalizedSections = {
    internalPosition: normalizeSection(sections.internalPosition, 'internalPosition', apiResponse),
    marketTrends: normalizeSection(sections.marketTrends, 'marketTrends', apiResponse),
    competitors: normalizeSection(sections.competitors, 'competitors', apiResponse),
    patentRisk: normalizeSection(sections.patentRisk, 'patentRisk', apiResponse),
    opportunities: normalizeSection(sections.opportunities, 'opportunities', apiResponse),
    risks: normalizeSection(sections.risks, 'risks', apiResponse),
  };

  // Normalize similar ideas from internalAnalysis
  const internalAnalysis = apiResponse.internalAnalysis || {} as any;
  const similarIdeas = normalizeSimilarIdeas(
    sections.internalPosition?.similarIdeas || internalAnalysis.similarIdeas || []
  );

  // Normalize patent risk
  const patentRisk = normalizePatentRisk(apiResponse.patentSignals);

  // Calculate metrics
  const noveltyScore = safeNumber(
    sections.internalPosition?.noveltyScore || internalAnalysis.noveltyScore
  );
  const externalEvidence = apiResponse.externalEvidence || {} as any;
  const totalSources = safeNumber(externalEvidence.totalSources);

  // Normalize sources
  const sources = normalizeSources(apiResponse.sources || []);

  // Check if report has any meaningful data
  const hasData = Object.values(normalizedSections).some(section => section.hasData);

  return {
    metadata: {
      ideaId,
      ideaTitle,
      generatedAt,
      hasData,
    },
    sections: normalizedSections,
    metrics: {
      noveltyScore,
      noveltyLabel: getNoveltyLabel(noveltyScore),
      totalSources,
      similarIdeasCount: similarIdeas.length,
    },
    patentRisk,
    similarIdeas,
    verdict: safeString(apiResponse.verdict, 'No verdict available'),
    sources,
  };
}
