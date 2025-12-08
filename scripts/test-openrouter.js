/**
 * Test OpenRouter API Integration
 */
import dotenv from 'dotenv';
dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free';

console.log('='.repeat(60));
console.log('OpenRouter API Test');
console.log('='.repeat(60));
console.log(`API Key: ${OPENROUTER_API_KEY ? '✅ Found (' + OPENROUTER_API_KEY.slice(0, 15) + '...)' : '❌ Missing'}`);
console.log(`Model: ${MODEL}`);
console.log('='.repeat(60));

async function testOpenRouter(query) {
  const prompt = `You are a search query optimizer. Enhance this search query with synonyms and related terms.
Query: "${query}"
Return comma-separated terms only. Keep compound terms together.
Enhanced:`;

  try {
    console.log(`\n🔍 Testing query: "${query}"`);
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'IdeaFlow Test'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`❌ API Error: ${response.status}`);
      console.log(error);
      return null;
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim();
    
    console.log(`✅ Response: ${result}`);
    console.log(`   Model used: ${data.model}`);
    console.log(`   Tokens: ${data.usage?.total_tokens || 'N/A'}`);
    
    return result;
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return null;
  }
}

// Run tests
async function runTests() {
  if (!OPENROUTER_API_KEY) {
    console.log('\n❌ OPENROUTER_API_KEY not found in .env');
    process.exit(1);
  }

  const testQueries = [
    'cloud computing',
    'AI chatbot for customer support',
    'blockchain 2024',
    'healthcare monitoring system'
  ];

  for (const query of testQueries) {
    await testOpenRouter(query);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ OpenRouter integration test complete!');
  console.log('='.repeat(60));
}

runTests();
