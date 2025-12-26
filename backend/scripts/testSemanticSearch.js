import 'dotenv/config';
import pg from 'pg';
import { initChromaDB } from '../config/chroma.js';
import { searchSimilarIdeas } from '../services/semanticSearch.js';

const { Pool } = pg;

/**
 * Simple script to test semantic search functionality
 * This verifies that the semantic search fix is working
 */
async function testSemanticSearch() {
    console.log('🔍 Testing Semantic Search Functionality\n');

    let pool;
    let chromaClient;

    try {
        // Initialize ChromaDB
        chromaClient = await initChromaDB();
        console.log('✅ ChromaDB initialized\n');

        // Check if DATABASE_URL is set
        if (!process.env.DATABASE_URL) {
            console.error('❌ DATABASE_URL not set in .env file');
            console.log('\nPlease ensure your .env file has:');
            console.log('DATABASE_URL=postgresql://username:password@localhost:5432/IdeaFlow\n');
            process.exit(1);
        }

        // Initialize database with error handling
        try {
            pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
            });

            // Test connection
            await pool.query('SELECT NOW()');
            console.log('✅ Database connected\n');
        } catch (dbError) {
            console.error('❌ Database connection failed:', dbError.message);
            console.log('\nPossible issues:');
            console.log('1. Check DATABASE_URL format in .env file');
            console.log('2. Ensure PostgreSQL is running');
            console.log('3. Verify username, password, and database name are correct');
            console.log('4. If password has special characters, they may need URL encoding\n');
            process.exit(1);
        }

        // Check ChromaDB collection
        let collection;
        let collectionCount = 0;

        try {
            collection = await chromaClient.getCollection({ name: 'ideas_semantic_index' });
            collectionCount = await collection.count();
            console.log(`📊 ChromaDB Status:`);
            console.log(`   - Collection: ideas_semantic_index`);
            console.log(`   - Ideas indexed: ${collectionCount}\n`);
        } catch (err) {
            console.log('⚠️  ideas_semantic_index does not exist yet');
            console.log('   You need to index ideas first before semantic search will work\n');

            // Offer to create collection and index a few test ideas
            console.log('💡 Tip: Run the authoritative reindexing script:\n');
            console.log('   node backend/scripts/reindexIdeasSemanticIndex.js\n');
            process.exit(0);
        }

        if (collectionCount === 0) {
            console.log('⚠️  No ideas indexed in ChromaDB yet');
            console.log('   Semantic search requires indexed ideas to work\n');
            console.log('💡 Next step: Index your ideas by running:\n');
            console.log('   node backend/scripts/reindexIdeasSemanticIndex.js\n');
            process.exit(0);
        }

        // Test semantic search with a sample query
        const testQueries = [
            'supply chain optimization',
            'AI customer service',
            'automation workflow'
        ];

        console.log('🔍 Testing semantic search with sample queries...\n');

        for (const query of testQueries) {
            console.log(`Query: "${query}"`);

            try {
                const results = await searchSimilarIdeas(
                    chromaClient,
                    pool,
                    query,
                    'grok', // Using grok/openrouter as default
                    5
                );

                if (results.length > 0) {
                    console.log(`✅ Found ${results.length} results:`);
                    results.forEach((result, idx) => {
                        console.log(`   ${idx + 1}. ${result.title} (${(result.similarity * 100).toFixed(1)}% match)`);
                    });
                } else {
                    console.log(`⚠️  No results found`);
                }
                console.log('');
            } catch (searchError) {
                console.error(`❌ Search failed:`, searchError.message);
                console.log('');
            }
        }

        console.log('✅ Semantic search test complete!\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (process.env.NODE_ENV === 'development') {
            console.error('\nFull error:', error);
        }
        process.exit(1);
    } finally {
        if (pool) {
            await pool.end();
            console.log('✅ Database connection closed');
        }
    }
}

// Run the test
testSemanticSearch()
    .then(() => {
        console.log('\n🎉 Test completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Test failed:', error.message);
        process.exit(1);
    });
