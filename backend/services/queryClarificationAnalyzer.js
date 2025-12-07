/**
 * Query Clarification Analyzer
 * Detects complex queries and generates clarification questions
 */

/**
 * Analyze query complexity and determine if clarification is needed
 */
export function analyzeQueryComplexity(query) {
    const normalized = query.toLowerCase();

    // Detect multiple intents
    const intents = {
        domains: extractDomains(query),
        technologies: extractTechnologies(query),
        years: extractYears(query),
        phases: extractPhases(query),
        connectors: findConnectors(query)
    };

    // Determine if clarification is needed
    const needsClarification = (
        intents.domains.length > 1 ||
        intents.technologies.length > 1 ||
        (intents.domains.length > 0 && intents.years.length > 0) ||
        intents.connectors.includes('and')
    );

    return {
        needsClarification,
        intents,
        questions: needsClarification ? generateClarificationQuestions(intents) : []
    };
}

/**
 * Generate clarification questions based on detected intents
 */
function generateClarificationQuestions(intents) {
    const questions = [];

    // Multiple domains detected
    if (intents.domains.length > 1) {
        const domainList = intents.domains.map(d => d.charAt(0).toUpperCase() + d.slice(1));
        questions.push({
            id: 'domains',
            type: 'multi-select',
            question: `I detected multiple domains: ${domainList.join(', ')}. How would you like to combine them?`,
            options: [
                { value: 'and', label: `Both ${domainList.join(' AND ')} (ideas must match all domains)` },
                { value: 'or', label: `Either ${domainList.join(' OR ')} (ideas can match any domain)` },
                ...intents.domains.map(d => ({
                    value: d,
                    label: `Only ${d.charAt(0).toUpperCase() + d.slice(1)}`
                }))
            ],
            defaultValue: 'and'
        });
    }

    // Year filter detected
    if (intents.years.length > 0) {
        questions.push({
            id: 'year',
            type: 'confirm',
            question: `Do you want ideas only from the year ${intents.years[0]}?`,
            value: intents.years[0],
            defaultValue: true
        });
    }

    // Multiple technologies detected
    if (intents.technologies.length > 1) {
        questions.push({
            id: 'technologies',
            type: 'multi-select',
            question: `Which technologies should the ideas use?`,
            options: intents.technologies.map(t => ({
                value: t,
                label: t.charAt(0).toUpperCase() + t.slice(1)
            })),
            allowMultiple: true
        });
    }

    // Phase detected
    if (intents.phases.length > 0) {
        questions.push({
            id: 'phase',
            type: 'confirm',
            question: `Should ideas be in "${intents.phases[0]}" phase?`,
            value: intents.phases[0],
            defaultValue: true
        });
    }

    return questions;
}

/**
 * Extract domain keywords from query
 */
function extractDomains(query) {
    const domainKeywords = {
        'cloud': ['cloud', 'aws', 'azure', 'gcp', 'infrastructure', 'serverless'],
        'blockchain': ['blockchain', 'crypto', 'web3', 'defi', 'nft'],
        'healthcare': ['healthcare', 'medical', 'health', 'hospital', 'clinical'],
        'finance': ['finance', 'banking', 'fintech', 'payment', 'financial'],
        'ai': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning'],
        'retail': ['retail', 'ecommerce', 'e-commerce', 'shopping'],
        'security': ['security', 'cybersecurity', 'encryption', 'authentication']
    };

    const found = [];
    const lowerQuery = query.toLowerCase();

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
        if (keywords.some(kw => lowerQuery.includes(kw))) {
            found.push(domain);
        }
    }

    return found;
}

/**
 * Extract year from query
 */
function extractYears(query) {
    const yearMatch = query.match(/\b(202[0-9]|2030)\b/g);
    return yearMatch ? yearMatch.map(y => parseInt(y)) : [];
}

/**
 * Extract technology keywords from query
 */
function extractTechnologies(query) {
    const techKeywords = [
        'react', 'angular', 'vue', 'python', 'java', 'javascript',
        'node', 'nodejs', 'tensorflow', 'pytorch', 'flutter', 'swift'
    ];

    const lowerQuery = query.toLowerCase();
    return techKeywords.filter(tech => lowerQuery.includes(tech));
}

/**
 * Extract project phases from query
 */
function extractPhases(query) {
    const phases = ['mvp', 'prototype', 'development', 'production', 'ideation'];
    const lowerQuery = query.toLowerCase();

    return phases.filter(phase => lowerQuery.includes(phase));
}

/**
 * Find logical connectors in query
 */
function findConnectors(query) {
    const connectors = [];
    const lowerQuery = query.toLowerCase();

    if (/\band\b/.test(lowerQuery)) connectors.push('and');
    if (/\bor\b/.test(lowerQuery)) connectors.push('or');
    if (/\bwith\b/.test(lowerQuery)) connectors.push('with');
    if (/\busing\b/.test(lowerQuery)) connectors.push('using');

    return connectors;
}

/**
 * Build filters from clarification answers
 */
export function buildFiltersFromAnswers(answers, originalIntents) {
    const filters = {};

    // Process domain answers
    if (answers.domains) {
        const domainsAnswer = answers.domains.selected || [answers.domains.defaultValue];

        if (domainsAnswer.includes('and')) {
            // User wants all domains - store as array
            filters.domain = originalIntents.domains;
        } else if (domainsAnswer.includes('or')) {
            // User wants any domain - store as array with OR logic
            filters.domain = originalIntents.domains;
            filters.domainLogic = 'or';
        } else {
            // User selected specific domain(s)
            filters.domain = domainsAnswer.filter(d => d !== 'and' && d !== 'or');
        }
    }

    // Process year answer
    if (answers.year) {
        if (answers.year.confirmed) {
            filters.year = answers.year.value;
        }
    }

    // Process technology answers
    if (answers.technologies && answers.technologies.selected) {
        filters.techStack = answers.technologies.selected;
    }

    // Process phase answer
    if (answers.phase && answers.phase.confirmed) {
        filters.buildPhase = answers.phase.value;
    }

    return filters;
}
