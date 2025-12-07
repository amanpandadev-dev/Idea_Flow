/**
 * Pro Search Test Script
 * Tests the enhanced search API endpoints
 * 
 * Run with: node scripts/test-pro-search.js
 */

const BASE_URL = 'http://localhost:3001';

async function testAPI(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: { 
                'Content-Type': 'application/json',
                'x-user-id': 'test-user'
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`${method} ${endpoint}`);
        console.log('='.repeat(60));
        
        const response = await fetch(`${BASE_URL}${endpoint}`, options);
        const data = await response.json();
        
        console.log(`Status: ${response.status}`);
        console.log('Response:', JSON.stringify(data, null, 2).substring(0, 1000));
        
        if (data.results) {
            console.log(`\nResults count: ${data.results.length}`);
            if (data.results.length > 0) {
                console.log('First result:', data.results[0].title);
            }
        }
        
        return { status: response.status, data };
    } catch (error) {
        console.error(`Error: ${error.message}`);
        return { status: 'error', error: error.message };
    }
}

async function runTests() {
    console.log('\n🧪 PRO SEARCH API TEST SUITE\n');
    console.log('Testing server at:', BASE_URL);
    
    // Test 1: Health check
    console.log('\n📋 TEST 1: Health Check');
    await testAPI('/api/v2/search/health');
    
    // Test 2: Debug info
    console.log('\n📋 TEST 2: Debug Info');
    await testAPI('/api/v2/search/debug');
    
    // Test 3: Sample data
    console.log('\n📋 TEST 3: Sample Data');
    await testAPI('/api/v2/search/sample-data');
    
    // Test 4: Test search endpoint
    console.log('\n📋 TEST 4: Test Search (direct)');
    await testAPI('/api/v2/search/test-search?q=AI');
    
    // Test 5: Force reindex
    console.log('\n📋 TEST 5: Force Reindex');
    const reindexResult = await testAPI('/api/v2/search/reindex', 'POST');
    
    // Wait a bit for indexing
    if (reindexResult.status === 200) {
        console.log('Waiting 2 seconds for indexing to complete...');
        await new Promise(r => setTimeout(r, 2000));
    }
    
    // Test 6: Main search - AI
    console.log('\n📋 TEST 6: Main Search - "AI"');
    await testAPI('/api/v2/search/search', 'POST', {
        query: 'AI',
        userId: 'test-user',
        limit: 10
    });
    
    // Test 7: Main search - Healthcare
    console.log('\n📋 TEST 7: Main Search - "Healthcare"');
    await testAPI('/api/v2/search/search', 'POST', {
        query: 'Healthcare',
        userId: 'test-user',
        limit: 10
    });
    
    // Test 8: Main search - GenAI
    console.log('\n📋 TEST 8: Main Search - "GenAI"');
    await testAPI('/api/v2/search/search', 'POST', {
        query: 'GenAI',
        userId: 'test-user',
        limit: 10
    });
    
    // Test 9: Main search - Show latest ideas
    console.log('\n📋 TEST 9: Main Search - "Show latest ideas"');
    await testAPI('/api/v2/search/search', 'POST', {
        query: 'Show latest ideas',
        userId: 'test-user',
        limit: 10
    });
    
    // Test 10: Greeting
    console.log('\n📋 TEST 10: Greeting - "Hello"');
    await testAPI('/api/v2/search/search', 'POST', {
        query: 'Hello',
        userId: 'test-user',
        limit: 10
    });
    
    // Test 11: Chat session creation
    console.log('\n📋 TEST 11: Create Chat Session');
    const sessionResult = await testAPI('/api/chat/sessions', 'POST', {
        title: 'Test Session'
    });
    
    // Test 12: Get sessions
    console.log('\n📋 TEST 12: Get Chat Sessions');
    await testAPI('/api/chat/sessions');
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST SUITE COMPLETED');
    console.log('='.repeat(60));
}

runTests().catch(console.error);
