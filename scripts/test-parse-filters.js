/**
 * Test parseFilters function
 */

// TechStack detection from query text - use word boundaries to avoid false positives
const techMap = {
    'react': ['\\breact\\b', '\\breactjs\\b', '\\breact\\.js\\b'],
    'python': ['\\bpython\\b', '\\bdjango\\b', '\\bflask\\b', '\\bfastapi\\b'],
    'javascript': ['\\bjavascript\\b', '\\bnodejs\\b', '\\bnode\\.js\\b'],
    'typescript': ['\\btypescript\\b'],
    'java': ['\\bjava\\b', '\\bspring\\b', '\\bspringboot\\b'],
};

function parseFilters(query) {
    const filters = {};
    const normalizedQuery = query.toLowerCase();
    
    for (const [tech, patterns] of Object.entries(techMap)) {
        if (patterns.some(pattern => new RegExp(pattern, 'i').test(normalizedQuery))) {
            if (!filters.techStack) filters.techStack = [];
            if (!filters.techStack.includes(tech)) filters.techStack.push(tech);
        }
    }
    
    return filters;
}

// Test cases
const testCases = [
    'React projects',
    'python ideas',
    'typescript apps',
    'java spring boot',
    'show all ideas',
    'blockchain projects'
];

console.log('Testing parseFilters techStack detection:\n');
for (const query of testCases) {
    const filters = parseFilters(query);
    console.log(`Query: "${query}"`);
    console.log(`  TechStack: ${filters.techStack ? filters.techStack.join(', ') : 'none'}`);
    console.log();
}
