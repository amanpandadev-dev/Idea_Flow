/**
 * Advanced NLP Query Processor
 * Handles spell correction, query expansion, and semantic understanding
 * for naive user queries
 * 
 * Uses OpenRouter API for AI-powered query refinement
 */

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
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

// Words to skip (greetings, common words that shouldn't be corrected)
const SKIP_WORDS = new Set([
  'hi', 'hello', 'hey', 'bye', 'yes', 'no', 'ok', 'okay',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'can', 'could', 'should', 'may', 'might', 'must',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
  'my', 'your', 'his', 'its', 'our', 'their',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
  'all', 'any', 'some', 'no', 'not', 'only', 'just', 'more', 'most',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about',
  'show', 'find', 'get', 'list', 'search', 'filter', 'sort'
]);

/**
 * Correct spelling using dictionary and fuzzy matching
 */
export function correctSpelling(word) {
  const lowerWord = word.toLowerCase();

  if (SKIP_WORDS.has(lowerWord)) return word;
  if (lowerWord.length <= 2) return word;
  if (SPELL_CORRECTIONS[lowerWord]) return SPELL_CORRECTIONS[lowerWord];
  if (lowerWord.length < 4) return word;

  const threshold = 2;
  let bestMatch = word;
  let bestDistance = threshold + 1;

  for (const [misspelled, correct] of Object.entries(SPELL_CORRECTIONS)) {
    if (Math.abs(misspelled.length - lowerWord.length) > 2) continue;

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

    if (QUERY_EXPANSIONS[lowerTerm]) {
      QUERY_EXPANSIONS[lowerTerm].forEach(expansion => expanded.add(expansion));
    }

    if (term.endsWith('s')) {
      expanded.add(term.slice(0, -1));
    } else {
      expanded.add(term + 's');
    }
  });

  return Array.from(expanded);
}

/**
 * Process query with spell correction and expansion (rule-based)
 */
export function processQuery(rawQuery) {
  const tokens = rawQuery
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);

  const corrected = tokens.map(correctSpelling);
  const expanded = expandQuery(corrected);

  return {
    original: rawQuery,
    corrected: corrected.join(' '),
    expanded: expanded,
    tokens: corrected
  };
}


/**
 * AI-powered query refinement using OpenRouter API
 * Supports multiple models: llama, mistral, claude, gpt-4, etc.
 * 
 * @param {string} rawQuery - The user's search query
 * @param {string} apiKey - OpenRouter API key
 * @param {string} modelName - Model to use (default: mistralai/mistral-7b-instruct:free)
 */
export async function refineQueryWithOpenRouter(rawQuery, apiKey, modelName = "mistralai/mistral-7b-instruct:free") {
  if (!apiKey) {
    console.warn('[NLP] No OpenRouter API key provided, using rule-based processing');
    return processQuery(rawQuery);
  }

  // Check if query contains a year - we'll preserve it but not add new ones
  const hasYear = /\b(202[0-9]|2030)\b/.test(rawQuery);
  const yearMatch = rawQuery.match(/\b(202[0-9]|2030)\b/);
  const queryYear = yearMatch ? yearMatch[0] : null;

  const prompt = `You are a search query optimizer for an innovation idea database.

User Query: "${rawQuery}"

Task: Expand this query with 3-5 relevant synonyms and related terms.

Rules:
1. Fix spelling errors
2. Add ONLY closely related terms to the main topic
3. DO NOT add years, dates, or time references unless the user explicitly mentioned one
4. DO NOT add unrelated technologies or domains
5. Keep compound terms together (e.g., "machine learning" not "machine" "learning")
6. Return ONLY the enhanced terms, comma-separated

Examples:
"blockchain" → blockchain, distributed ledger, web3, smart contracts, decentralized
"AI chatbot" → AI chatbot, conversational AI, virtual assistant, chatbot, artificial intelligence
"healthcare" → healthcare, medical, patient care, health services, clinical

Enhanced terms:`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'IdeaFlow Pro Search'
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.warn('[NLP] OpenRouter API error:', error);
      return processQuery(rawQuery);
    }

    const data = await response.json();
    const refined = data.choices?.[0]?.message?.content?.trim();

    if (!refined) {
      console.warn('[NLP] OpenRouter returned empty response');
      return processQuery(rawQuery);
    }

    // Parse AI response and clean up
    let aiTerms = refined
      .split(/,/)
      .map(t => t.trim())
      .filter(t => t.length > 0 && t.length < 50); // Filter out overly long terms

    // CRITICAL: Remove any years that AI added if user didn't ask for them
    if (!hasYear) {
      aiTerms = aiTerms.filter(t => !/\b(202[0-9]|2030)\b/.test(t));
    }

    // Remove duplicate-ish terms (case insensitive)
    const seen = new Set();
    aiTerms = aiTerms.filter(t => {
      const lower = t.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

    // Limit to reasonable number of terms (but leave room for year if needed)
    aiTerms = aiTerms.slice(0, hasYear ? 9 : 10);
    
    // User DID include a year - make sure it's preserved in the results (add at end)
    if (hasYear && queryYear && !aiTerms.some(t => t.includes(queryYear))) {
      aiTerms.push(queryYear);
    }

    console.log(`[NLP] ✅ OpenRouter: "${rawQuery}" → [${aiTerms.join(', ')}]`);

    const searchText = aiTerms.join(' ');

    return {
      original: rawQuery,
      corrected: searchText,
      expanded: aiTerms,
      tokens: aiTerms,
      aiEnhanced: true,
      provider: 'openrouter',
      model: modelName,
      compoundTerms: aiTerms.filter(t => t.includes(' ')),
      detectedYear: queryYear ? parseInt(queryYear) : null
    };

  } catch (error) {
    console.error(`[NLP] OpenRouter error:`, error.message);
    return processQuery(rawQuery);
  }
}

/**
 * Complete NLP pipeline - Uses OpenRouter for AI refinement
 * 
 * @param {string} rawQuery - The user's search query
 * @param {object} options - Configuration options
 * @param {boolean} options.useAI - Whether to use AI refinement
 * @param {string} options.openRouterKey - OpenRouter API key
 * @param {string} options.openRouterModel - Model to use
 */
export async function enhanceQuery(rawQuery, options = {}) {
  const { 
    useAI = true, 
    openRouterKey = null,
    openRouterModel = "mistralai/mistral-7b-instruct:free"
  } = options;

  console.log(`[NLP] Processing query: "${rawQuery}"`);

  // Use OpenRouter for AI refinement if key is available
  if (useAI && openRouterKey) {
    console.log(`[NLP] Using OpenRouter with model: ${openRouterModel}`);
    const result = await refineQueryWithOpenRouter(rawQuery, openRouterKey, openRouterModel);
    console.log(`[NLP] Expanded to ${result.expanded.length} terms`);
    return result;
  }

  // Fallback to rule-based processing
  console.log(`[NLP] Using rule-based processing (no API key)`);
  const result = processQuery(rawQuery);
  console.log(`[NLP] Expanded to ${result.expanded.length} terms (rule-based)`);
  return result;
}

// Legacy function name for backward compatibility
export const refineQueryWithAI = refineQueryWithOpenRouter;

export default {
  correctSpelling,
  expandQuery,
  processQuery,
  refineQueryWithOpenRouter,
  refineQueryWithAI,
  enhanceQuery,
  SPELL_CORRECTIONS,
  QUERY_EXPANSIONS
};
