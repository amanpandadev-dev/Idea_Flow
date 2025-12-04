/**
 * Advanced NLP Query Processor
 * Handles spell correction, query expansion, and semantic understanding
 * for naive user queries
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// Common misspellings and corrections for technical terms
const SPELL_CORRECTIONS = {
  // Cloud & Infrastructure
  'clodus': 'cloud',
  'claud': 'cloud',
  'cloude': 'cloud',
  'kubernets': 'kubernetes',
  'kubernates': 'kubernetes',
  'doker': 'docker',
  'dokcer': 'docker',

  // AI/ML Terms
  'artifical': 'artificial',
  'artifical': 'artificial',
  'machien': 'machine',
  'machin': 'machine',
  'lerning': 'learning',
  'learing': 'learning',
  'deeplearning': 'deep learning',
  'neuralnetwork': 'neural network',

  // Development
  'developement': 'development',
  'devlopment': 'development',
  'programing': 'programming',
  'programm': 'program',
  'databse': 'database',
  'databas': 'database',

  // Business
  'custmer': 'customer',
  'costumer': 'customer',
  'amatuer': 'amateur',
  'amature': 'amateur',
  'bussiness': 'business',
  'buisness': 'business',
  'managment': 'management',
  'manger': 'manager',

  // Common typos
  'teh': 'the',
  'hte': 'the',
  'taht': 'that',
  'thsi': 'this',
  'recieve': 'receive',
  'seperate': 'separate',
  'occured': 'occurred',
  'sucessful': 'successful',
  'realted': 'related',
  'releted': 'related',
  'diferent': 'different',
  'diffrent': 'different',
  'similiar': 'similar',
  'simular': 'similar',
  'definately': 'definitely',
  'definate': 'definite',
  'occassion': 'occasion',
  'occassional': 'occasional',
  'necesary': 'necessary',
  'neccessary': 'necessary',
  'recomend': 'recommend',
  'reccommend': 'recommend'
};

// Domain-specific query expansions
const QUERY_EXPANSIONS = {
  // Monitoring & Observability
  'monitoring': ['monitoring', 'observability', 'tracking', 'surveillance', 'health check', 'metrics', 'alerting'],
  'health': ['health', 'wellness', 'status', 'vitals', 'diagnostics', 'monitoring'],

  // Banking & Finance
  'banking': ['banking', 'financial services', 'fintech', 'payment', 'transaction', 'finance'],
  'payment': ['payment', 'transaction', 'billing', 'checkout', 'financial'],
  'loan': ['loan', 'credit', 'lending', 'mortgage', 'financing'],

  // Healthcare
  'hospital': ['hospital', 'healthcare', 'medical', 'clinical', 'patient care', 'health services'],
  'patient': ['patient', 'healthcare', 'medical records', 'clinical', 'treatment'],
  'medical': ['medical', 'healthcare', 'clinical', 'diagnosis', 'treatment'],

  // E-commerce & Retail
  'shop': ['shop', 'store', 'retail', 'e-commerce', 'marketplace', 'shopping'],
  'cart': ['cart', 'shopping cart', 'basket', 'checkout', 'purchase'],
  'inventory': ['inventory', 'stock', 'warehouse', 'supply chain', 'logistics'],

  // Security
  'security': ['security', 'cybersecurity', 'protection', 'authentication', 'authorization', 'encryption'],
  'auth': ['authentication', 'authorization', 'login', 'access control', 'identity'],

  // AI/ML
  'ai': ['artificial intelligence', 'AI', 'machine learning', 'ML', 'deep learning', 'neural network'],
  'ml': ['machine learning', 'ML', 'artificial intelligence', 'AI', 'predictive analytics'],
  'chatbot': ['chatbot', 'conversational AI', 'virtual assistant', 'bot', 'automated chat'],

  // Cloud & Infrastructure
  'cloud': ['cloud', 'cloud computing', 'AWS', 'Azure', 'GCP', 'infrastructure'],
  'server': ['server', 'backend', 'infrastructure', 'hosting', 'compute'],
  'database': ['database', 'DB', 'data storage', 'SQL', 'NoSQL', 'data management'],

  // Development
  'app': ['application', 'app', 'software', 'system', 'platform'],
  'mobile': ['mobile', 'mobile app', 'iOS', 'Android', 'smartphone'],
  'web': ['web', 'website', 'web application', 'online', 'internet'],

  // Analytics & Data
  'analytics': ['analytics', 'data analysis', 'insights', 'reporting', 'metrics', 'KPI'],
  'dashboard': ['dashboard', 'visualization', 'reporting', 'metrics', 'analytics'],
  'report': ['report', 'reporting', 'analytics', 'insights', 'dashboard'],
};

// Levenshtein distance for fuzzy matching
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Correct spelling using dictionary and fuzzy matching
 */
export function correctSpelling(word) {
  const lowerWord = word.toLowerCase();

  // Direct match in dictionary
  if (SPELL_CORRECTIONS[lowerWord]) {
    return SPELL_CORRECTIONS[lowerWord];
  }

  // Fuzzy match with threshold
  const threshold = 2; // Max edit distance
  let bestMatch = word;
  let bestDistance = threshold + 1;

  for (const [misspelled, correct] of Object.entries(SPELL_CORRECTIONS)) {
    const distance = levenshteinDistance(lowerWord, misspelled);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = correct;
    }
  }

  return bestDistance <= threshold ? bestMatch : word;
}

/**
 * Expand query terms with synonyms and related concepts
 */
export function expandQuery(terms) {
  const expanded = new Set(terms);

  terms.forEach(term => {
    const lowerTerm = term.toLowerCase();

    // Add expansions from dictionary
    if (QUERY_EXPANSIONS[lowerTerm]) {
      QUERY_EXPANSIONS[lowerTerm].forEach(expansion => expanded.add(expansion));
    }

    // Add common variations
    if (term.endsWith('s')) {
      expanded.add(term.slice(0, -1)); // singular
    } else {
      expanded.add(term + 's'); // plural
    }
  });

  return Array.from(expanded);
}

/**
 * Process query with spell correction and expansion
 */
export function processQuery(rawQuery) {
  // Tokenize
  const tokens = rawQuery
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);

  // Correct spelling
  const corrected = tokens.map(correctSpelling);

  // Expand with synonyms
  const expanded = expandQuery(corrected);

  return {
    original: rawQuery,
    corrected: corrected.join(' '),
    expanded: expanded,
    tokens: corrected
  };
}

/**
 * AI-powered query refinement using Gemini 2.0 Flash (Free Tier - 1500 req/day)
 */
export async function refineQueryWithAI(rawQuery, apiKey, modelName = "gemini-2.5-flash") {
  if (!apiKey) {
    console.warn('[NLP] No API key provided, skipping AI refinement');
    return processQuery(rawQuery);
  }

  try {
    const ai = new GoogleGenerativeAI(apiKey);
    // Use the requested model (defaulting to 1.5 Flash)
    const model = ai.getGenerativeModel({ model: modelName });

    const prompt = `You are an intelligent search query optimizer for an innovation idea repository.

Task: Analyze and enhance the user's search query to improve search results.

User Query: "${rawQuery}"

Instructions:
1. Fix any spelling errors (e.g., "clodus" → "cloud", "custmer" → "customer")
2. Expand abbreviations and acronyms (e.g., "AI" → "artificial intelligence", "ML" → "machine learning")
3. Add relevant synonyms and related terms
4. Identify the core intent and key concepts
5. Normalize technical terms to standard industry terminology
6. For naive queries like "monitoring system", expand to "health monitoring, system monitoring, observability, tracking"
7. For domain queries like "banking apps", expand to "banking applications, financial services, fintech, payment systems"

Return ONLY the enhanced search terms as a single line, separated by spaces. Include both the original corrected terms and relevant expansions.

Example:
Input: "AI chatbot for custmer support"
Output: artificial intelligence AI chatbot conversational agent virtual assistant customer support service helpdesk

Input: "monitoring system for hospitals"
Output: monitoring system health monitoring observability tracking hospital healthcare medical clinical patient care diagnostics

Enhanced Query:`;

    const result = await model.generateContent(prompt);
    if (!result || !result.response) {
      console.warn('[NLP] AI refinement failed, using fallback');
      return processQuery(rawQuery);
    }

    const refined = result.response.text().trim();
    console.log(`[NLP] ✅ Original: "${rawQuery}" → AI Refined: "${refined}"`);

    // Parse AI response
    const aiTokens = refined.split(/\s+/).filter(t => t.length > 0);

    return {
      original: rawQuery,
      corrected: refined,
      expanded: aiTokens,
      tokens: aiTokens,
      aiEnhanced: true
    };

  } catch (error) {
    console.error(`[NLP] AI refinement error (${modelName}):`, error.message);
    return processQuery(rawQuery);
  }
}

/**
 * Complete NLP pipeline
 */
export async function enhanceQuery(rawQuery, options = {}) {
  // Using Gemini 2.0 Flash - Free tier with 1500 requests/day
  const { useAI = true, apiKey = null, model = "gemini-2.5-flash" } = options;

  console.log(`[NLP] Processing query: "${rawQuery}"`);

  // Use AI if available and enabled
  if (useAI && apiKey) {
    const result = await refineQueryWithAI(rawQuery, apiKey, model);
    console.log(`[NLP] Expanded to ${result.expanded.length} terms`);
    return result;
  }

  // Fallback to rule-based processing
  const result = processQuery(rawQuery);
  console.log(`[NLP] Expanded to ${result.expanded.length} terms (rule-based)`);
  return result;
}

/**
 * CONVERSATIONAL SEARCH ENHANCEMENTS
 */

/**
 * Detect query intent (search, filter, sort, refine)
 */
export function detectIntent(query) {
  const lowerQuery = query.toLowerCase();

  // Sort intent
  if (lowerQuery.match(/\b(latest|recent|newest|oldest|top|best|highest|lowest)\b/)) {
    return 'sort';
  }

  // Filter intent
  if (lowerQuery.match(/\b(filter|only|just|show me|from|in|by)\b/)) {
    return 'filter';
  }

  // Refine intent (follow-up)
  if (lowerQuery.match(/\b(more|less|exclude|without|except|also)\b/)) {
    return 'refine';
  }

  // Default: search
  return 'search';
}

/**
 * Parse temporal expressions (latest, recent, 2024, etc.)
 */
export function parseTemporalExpression(query) {
  const lowerQuery = query.toLowerCase();
  const currentYear = new Date().getFullYear();

  const temporal = {
    sortBy: null,
    order: null,
    year: null,
    timeframe: null
  };

  // Latest/Recent
  if (lowerQuery.match(/\b(latest|newest|recent)\b/)) {
    temporal.sortBy = 'created_at';
    temporal.order = 'desc';
    temporal.timeframe = 'recent';
  }

  // Oldest
  if (lowerQuery.match(/\b(oldest|earliest)\b/)) {
    temporal.sortBy = 'created_at';
    temporal.order = 'asc';
  }

  // Specific year (2024, 2023, etc.)
  const yearMatch = query.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    temporal.year = parseInt(yearMatch[1]);
  }

  // "This year"
  if (lowerQuery.match(/\b(this year|current year)\b/)) {
    temporal.year = currentYear;
  }

  // "Last year"
  if (lowerQuery.match(/\b(last year)\b/)) {
    temporal.year = currentYear - 1;
  }

  return temporal;
}

/**
 * Extract entities (business group, domain, tech stack, build phase, etc.)
 */
export function extractEntities(query) {
  const lowerQuery = query.toLowerCase();

  const entities = {
    businessGroup: null,
    domain: null,
    techStack: [],
    buildPhase: null,
    buildPreference: null,
    scalability: null,
    novelty: null,
    participationWeek: null,
    timeline: null,
    sortBy: null
  };

  // Business Groups
  const businessGroups = [
    'Corporate Functions', 'Operations', 'Technology', 'Sales', 'Marketing',
    'Finance', 'HR', 'Legal', 'Customer Service', 'Product'
  ];
  for (const bg of businessGroups) {
    if (lowerQuery.includes(bg.toLowerCase())) {
      entities.businessGroup = bg;
      break;
    }
  }

  // Domains/Industries
  const domains = [
    'Healthcare', 'Finance', 'Fintech', 'Banking', 'Insurance',
    'Retail', 'E-commerce', 'Education', 'Manufacturing', 'Logistics',
    'Transportation', 'Energy', 'Telecommunications', 'Media', 'Entertainment'
  ];
  for (const domain of domains) {
    if (lowerQuery.includes(domain.toLowerCase())) {
      entities.domain = domain;
      break;
    }
  }

  // Tech Stack
  const techKeywords = [
    'React', 'Angular', 'Vue', 'Node', 'Python', 'Java', 'JavaScript',
    'TypeScript', 'Go', 'Rust', 'C++', 'C#', 'Ruby', 'PHP',
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'MongoDB', 'PostgreSQL',
    'MySQL', 'Redis', 'Kafka', 'RabbitMQ', 'GraphQL', 'REST',
    'Blockchain', 'AI', 'ML', 'Machine Learning', 'Deep Learning'
  ];
  for (const tech of techKeywords) {
    if (lowerQuery.includes(tech.toLowerCase())) {
      entities.techStack.push(tech);
    }
  }

  // Build Phase
  const buildPhaseMap = {
    'submitted': 'Submitted',
    'in progress': 'In Progress',
    'ongoing': 'In Progress',
    'active': 'In Progress',
    'completed': 'Completed',
    'finished': 'Completed',
    'done': 'Completed',
    'under review': 'Under Review',
    'reviewing': 'Under Review'
  };
  for (const [keyword, phase] of Object.entries(buildPhaseMap)) {
    if (lowerQuery.includes(keyword)) {
      entities.buildPhase = phase;
      break;
    }
  }

  // Build Preference
  const buildPreferenceMap = {
    'new solution': 'New Solution / IP',
    'new ip': 'New Solution / IP',
    'enhancement': 'Enhancement',
    'improve': 'Enhancement',
    'poc': 'POC',
    'proof of concept': 'POC',
    'prototype': 'POC'
  };
  for (const [keyword, preference] of Object.entries(buildPreferenceMap)) {
    if (lowerQuery.includes(keyword)) {
      entities.buildPreference = preference;
      break;
    }
  }

  // Scalability
  if (lowerQuery.match(/\b(high|highly|very)\s+(scalable|scalability)\b/)) {
    entities.scalability = 'high';
  } else if (lowerQuery.match(/\b(scalable|scalability)\b/)) {
    entities.scalability = 'any';
  }

  // Novelty
  if (lowerQuery.match(/\b(innovative|novel|unique|groundbreaking|cutting.?edge|revolutionary)\b/)) {
    entities.novelty = 'high';
  }

  // Participation Week
  const weekMatch = lowerQuery.match(/\b(?:week|wk)\s*(\d+)\b/);
  if (weekMatch) {
    entities.participationWeek = parseInt(weekMatch[1]);
  }

  // Timeline
  const timelineMap = {
    'short term': 'short',
    'quick': 'short',
    'fast': 'short',
    'long term': 'long',
    'extended': 'long',
    'medium term': 'medium',
    'moderate': 'medium'
  };
  for (const [keyword, timeline] of Object.entries(timelineMap)) {
    if (lowerQuery.includes(keyword)) {
      entities.timeline = timeline;
      break;
    }
  }

  // Sort criteria
  if (lowerQuery.match(/\b(high|highest|top|best)\s+(score|rated|rating)\b/)) {
    entities.sortBy = 'score';
  } else if (lowerQuery.match(/\b(high|highest|top)\\s+(impact|score)\b/)) {
    entities.sortBy = 'impactScore';
  } else if (lowerQuery.match(/\b(most|highest)\\s+liked\b/)) {
    entities.sortBy = 'likesCount';
  }

  return entities;
}

/**
 * Parse conversational query with full context
 */
export function parseConversationalQuery(query, previousContext = {}) {
  const intent = detectIntent(query);
  const temporal = parseTemporalExpression(query);
  const entities = extractEntities(query);
  const processed = processQuery(query);

  // Build filters from entities and temporal data
  const filters = {};

  if (entities.businessGroup) filters.businessGroup = entities.businessGroup;
  if (entities.domain) filters.domain = entities.domain;
  if (entities.techStack.length > 0) filters.techStack = entities.techStack;
  if (entities.buildPhase) filters.buildPhase = entities.buildPhase;
  if (entities.buildPreference) filters.buildPreference = entities.buildPreference;
  if (entities.scalability) filters.scalability = entities.scalability;
  if (entities.novelty) filters.novelty = entities.novelty;
  if (entities.participationWeek) filters.participationWeek = entities.participationWeek;
  if (entities.timeline) filters.timeline = entities.timeline;
  if (temporal.year) filters.year = temporal.year;

  // Determine sort order
  let sortBy = entities.sortBy || temporal.sortBy || previousContext.sortBy;
  let sortOrder = temporal.order || previousContext.sortOrder || 'desc';

  // Merge with previous context for refinement
  if (intent === 'refine' && previousContext.filters) {
    Object.assign(filters, previousContext.filters, filters);
  }

  return {
    intent,
    query: processed.corrected,
    keywords: processed.expanded,
    filters,
    sortBy,
    sortOrder,
    temporal,
    entities,
    raw: query
  };
}

/**
 * Generate AI response message for search results
 */
export function generateAIResponse(parsedQuery, resultCount, context = {}) {
  const { intent, filters, temporal, entities } = parsedQuery;

  let response = '';

  // Greeting based on intent
  if (intent === 'search') {
    response = `Found ${resultCount} ideas`;
  } else if (intent === 'filter') {
    response = `Showing ${resultCount} results`;
  } else if (intent === 'refine') {
    response = `Refined to ${resultCount} ideas`;
  } else if (intent === 'sort') {
    response = `Sorted ${resultCount} ideas`;
  }

  // Add filter details
  const filterDetails = [];
  if (filters.domain) filterDetails.push(`in ${filters.domain}`);
  if (filters.businessGroup) filterDetails.push(`from ${filters.businessGroup}`);
  if (filters.techStack && filters.techStack.length > 0) {
    filterDetails.push(`using ${filters.techStack.join(', ')}`);
  }
  if (filters.year) filterDetails.push(`from ${filters.year}`);

  if (filterDetails.length > 0) {
    response += ` ${filterDetails.join(' ')}`;
  }

  // Add temporal context
  if (temporal.timeframe === 'recent') {
    response += '. Showing most recent first';
  }

  response += '.';

  return response;
}

export default {
  correctSpelling,
  expandQuery,
  processQuery,
  refineQueryWithAI,
  enhanceQuery,
  detectIntent,
  parseTemporalExpression,
  extractEntities,
  parseConversationalQuery,
  generateAIResponse,
  SPELL_CORRECTIONS,
  QUERY_EXPANSIONS
};
