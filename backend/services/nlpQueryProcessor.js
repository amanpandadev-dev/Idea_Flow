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
  'clod': 'cloud',
  'kubernets': 'kubernetes',
  'kubernates': 'kubernetes',
  'k8s': 'kubernetes',
  'doker': 'docker',
  'dokcer': 'docker',
  'containr': 'container',
  'microservce': 'microservice',
  'serverles': 'serverless',

  // AI/ML Terms
  'artifical': 'artificial',
  'artifcial': 'artificial',
  'machien': 'machine',
  'machin': 'machine',
  'lerning': 'learning',
  'learing': 'learning',
  'learnig': 'learning',
  'deeplearning': 'deep learning',
  'neuralnetwork': 'neural network',
  'chatbots': 'chatbot',
  'chatbt': 'chatbot',
  'nlp': 'natural language processing',
  'gpt': 'GPT',
  'llm': 'large language model',
  'genai': 'generative AI',
  'gen-ai': 'generative AI',

  // Development
  'developement': 'development',
  'devlopment': 'development',
  'devlop': 'develop',
  'programing': 'programming',
  'programm': 'program',
  'databse': 'database',
  'databas': 'database',
  'api': 'API',
  'apis': 'APIs',
  'frontend': 'front-end',
  'backedn': 'backend',
  'fullstack': 'full-stack',
  'reactjs': 'React',
  'nodejs': 'Node.js',
  'javascrpt': 'JavaScript',
  'typescrpt': 'TypeScript',
  'pythn': 'Python',
  'pyton': 'Python',

  // Business
  'custmer': 'customer',
  'costumer': 'customer',
  'customr': 'customer',
  'amatuer': 'amateur',
  'amature': 'amateur',
  'bussiness': 'business',
  'buisness': 'business',
  'busines': 'business',
  'managment': 'management',
  'manger': 'manager',
  'employe': 'employee',
  'employes': 'employees',
  'finace': 'finance',
  'financal': 'financial',
  'bankin': 'banking',
  'ecomerce': 'ecommerce',
  'ecommrce': 'ecommerce',
  'retial': 'retail',

  // Healthcare
  'helthcare': 'healthcare',
  'healtcare': 'healthcare',
  'hospitl': 'hospital',
  'patint': 'patient',
  'medcal': 'medical',
  'clincal': 'clinical',
  'diagnosic': 'diagnostic',

  // Common typos
  'teh': 'the',
  'hte': 'the',
  'taht': 'that',
  'thsi': 'this',
  'recieve': 'receive',
  'seperate': 'separate',
  'occured': 'occurred',
  'sucessful': 'successful',
  'anayltics': 'analytics',
  'analtics': 'analytics',
  'dashbord': 'dashboard',
  'dashbaord': 'dashboard',
  'automtion': 'automation',
  'automatoin': 'automation',
  'integation': 'integration',
  'intergration': 'integration',
  'optimzation': 'optimization',
  'optmization': 'optimization',
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
export async function refineQueryWithAI(rawQuery, apiKey, modelName = "gemini-2.5-flash-lite") {
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
  const { useAI = true, apiKey = null, model = "gemini-2.5-flash-lite" } = options;

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

export default {
  correctSpelling,
  expandQuery,
  processQuery,
  refineQueryWithAI,
  enhanceQuery,
  SPELL_CORRECTIONS,
  QUERY_EXPANSIONS
};
