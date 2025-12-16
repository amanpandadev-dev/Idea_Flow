/**
 * Enterprise Metadata Matchers for ProSearch
 * 
 * Provides regex-based extraction of enterprise innovation metadata
 * from natural language queries WITHOUT requiring LLM calls.
 * 
 * Supports:
 * - Technology stack (Java, Python, AWS, etc.)
 * - Years (2020-2029)
 * - Business groups (BFSI, CMT, RCL, etc.)
 * - AI themes (21-theme taxonomy)
 * - Domains (Banking, Healthcare, etc.)
 */

// Enterprise regex patterns
export const ENTERPRISE_PATTERNS = {
    // Technology Stack
    // Matches: "using Java", "with Python", "built with AWS"
    technology: /\b(using|with|built\s+with|filter\s+by|in|tech\s*stack\s*using)\s+(java|python|spring\s*boot|node\.?js|react|angular|vue|aws|azure|gcp|docker|kubernetes|flutter|sap|oracle|typescript|javascript)\b/i,
    // Year/Time
    // Matches: "from 2024", "in 2023", "created in 2022"
    year: /\b(from|in|created\s+in|year|during)\s+(20\d{2})\b/i,

    // Business Groups (TCS standard)
    // Matches: "BFSI", "Banking", "CMT", "Healthcare"
    businessGroup: /\b(bfsi|banking\s*and\s*financial|cmt|communications?\s*media\s*tech|retail|rcl|retail\s*consumer|manufacturing|healthcare|hillsi|health|public\s*sector|government|travel|hospitality|education|hi[- ]?tech|technology)\b/i,

    // AI Themes (21-theme taxonomy)
    // Matches all standard AI innovation themes
    aiTheme: /\b(agentic\s*ai|multi[- ]agent|genai|generative\s*ai|gen\s*ai|classical\s*ai|traditional\s*ai|deep\s*learning|machine\s*learning|ml|edge\s*ai|on[- ]device\s*ai|copilot|ai\s*copilot|virtual\s*worker|digital\s*worker|orchestration|workflow\s*automation|mcp|model\s*context\s*protocol|responsible\s*ai|ai\s*ethics|ai\s*governance|finops\s*for\s*ai|ai\s*cost|cybersecurity\s*for\s*ai|ai\s*for\s*cybersecurity|ai\s*security|open\s*source\s*model|oss\s*model|proprietary\s*model|closed\s*model|deep\s*tech|creative\s*ai|ai\s*art)\b/i,

    // Domain Keywords
    // Matches: "banking", "healthcare", "retail"
    domain: /\b(banking|insurance|financial\s*services|retail|e[- ]commerce|logistics|supply\s*chain|healthcare|medical|pharma|manufacturing|industrial|energy|utilities|education|e[- ]learning|government|public\s*sector)\b/i,

    // Reset/Clear commands
    reset: /\b(reset|clear|start\s*over|new\s*search|remove\s*all)\b/i,

    // Implementation status
    status: /\b(proposed|poc|proof\s*of\s*concept|pilot|implemented|production|deployed)\b/i
};

// Normalize extracted values to standard format
const NORMALIZATION_MAP = {
    technology: {
        'node.js': 'NodeJS',
        'nodejs': 'NodeJS',
        'spring boot': 'Spring Boot',
        'springboot': 'Spring Boot',
        'react native': 'React Native',
        'gcp': 'Google Cloud',
        'google cloud': 'Google Cloud',
        'k8s': 'Kubernetes',
        '.net': 'DotNet',
        'c#': 'CSharp'
    },
    businessGroup: {
        'bfsi': 'BFSI',
        'banking and financial': 'BFSI',
        'cmt': 'CMT',
        'communications media tech': 'CMT',
        'rcl': 'RCL',
        'retail consumer': 'RCL',
        'hillsi': 'HILLSI',
        'hi-tech': 'Hi-Tech',
        'hitech': 'Hi-Tech'
    },
    aiTheme: {
        'gen ai': 'Generative AI',
        'genai': 'Generative AI',
        'ml': 'Machine Learning',
        'multi-agent': 'Agentic AI',
        'on-device ai': 'Edge AI',
        'oss model': 'Open Source Model'
    }
};

/**
 * Extract enterprise metadata from a natural language query
 * 
 * @param {string} query - Natural language search query
 * @returns {Object} Extracted metadata with normalized values
 * 
 * @example
 * extractEnterpriseMetadata("Find Java projects from 2024 in BFSI")
 * // Returns: { technology: "Java", year: 2024, businessGroup: "BFSI" }
 */
export function extractEnterpriseMetadata(query) {
    const lower = query.toLowerCase();
    const metadata = {};

    // Extract technology stack
    const techMatch = lower.match(ENTERPRISE_PATTERNS.technology);
    if (techMatch) {
        let tech = techMatch[2].trim();
        // Normalize to standard format
        tech = NORMALIZATION_MAP.technology[tech] || tech.charAt(0).toUpperCase() + tech.slice(1);
        metadata.technology = tech;
    }

    // Extract year
    const yearMatch = lower.match(ENTERPRISE_PATTERNS.year);
    if (yearMatch) {
        metadata.year = parseInt(yearMatch[2]);
    }

    // Extract business group
    const bgMatch = lower.match(ENTERPRISE_PATTERNS.businessGroup);
    if (bgMatch) {
        let bg = bgMatch[1].trim();
        bg = NORMALIZATION_MAP.businessGroup[bg] || bg.toUpperCase();
        metadata.businessGroup = bg;
    }

    // Extract AI theme
    const themeMatch = lower.match(ENTERPRISE_PATTERNS.aiTheme);
    if (themeMatch) {
        let theme = themeMatch[1].trim();
        theme = NORMALIZATION_MAP.aiTheme[theme] ||
            theme.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        metadata.aiTheme = theme;
    }

    // Extract domain
    const domainMatch = lower.match(ENTERPRISE_PATTERNS.domain);
    if (domainMatch) {
        let domain = domainMatch[1].trim();
        domain = domain.charAt(0).toUpperCase() + domain.slice(1);
        metadata.domain = domain;
    }

    // Extract status
    const statusMatch = lower.match(ENTERPRISE_PATTERNS.status);
    if (statusMatch) {
        let status = statusMatch[1].trim();
        if (status === 'poc') status = 'POC';
        else status = status.charAt(0).toUpperCase() + status.slice(1);
        metadata.status = status;
    }

    return metadata;
}

/**
 * Check if query indicates a domain shift
 * Domain shifts require a new base search rather than refinement
 * 
 * @param {string} query - Natural language query
 * @param {string} currentDomain - Current context domain (if any)
 * @returns {boolean} True if domain has shifted
 */
export function isDomainShift(query, currentDomain = null) {
    const metadata = extractEnterpriseMetadata(query);

    // If no current domain, not a shift
    if (!currentDomain) return false;

    // If query has domain and it differs from current, it's a shift
    if (metadata.domain && metadata.domain.toLowerCase() !== currentDomain.toLowerCase()) {
        return true;
    }

    // If query has business group and it differs, it's a shift
    if (metadata.businessGroup && metadata.businessGroup.toLowerCase() !== currentDomain.toLowerCase()) {
        return true;
    }

    return false;
}

/**
 * Determine if query is a refinement (has metadata filters)
 * 
 * @param {string} query - Natural language query
 * @returns {boolean} True if query contains refinement metadata
 */
export function isRefinement(query) {
    const metadata = extractEnterpriseMetadata(query);

    // Refinement if has tech/year/status but NO domain/businessGroup
    const hasFilters = metadata.technology || metadata.year || metadata.status;
    const hasDomainChange = metadata.domain || metadata.businessGroup;

    return hasFilters && !hasDomainChange;
}
