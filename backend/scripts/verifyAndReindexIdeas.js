import 'dotenv/config';
import pg from 'pg';
import { initChromaDB } from '../config/chroma.js';
import { batchIndexIdeas } from '../services/ideaIndexingService.js';

const { Pool } = pg;

/**
 * Script to verify and reindex all ideas in ChromaDB
 * This ensures semantic search works correctly
 */
async function verifyAndReindexIdeas() {
    console.log('🔍 Starting idea verification and reindexing...\n');

    // Initialize database
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // Initialize ChromaDB
    const chromaClient = await initChromaDB();

    try {
        // Test database connection
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected\n');

        // Get ideas collection stats
        try {
            const collection = await chromaClient.getCollection({ name: 'ideas_collection' });
            const count = await collection.count();
            console.log(`📊 Current ChromaDB stats:`);
            console.log(`   - Ideas indexed: ${count}\n`);
        } catch (err) {
            console.log('⚠️  ideas_collection does not exist yet\n');
        }

        // Fetch all ideas from PostgreSQL
        const result = await pool.query(`
            SELECT 
                i.idea_id,
                i.title,
                i.summary as description,
                i.challenge_opportunity as category,
                i.build_phase as status,
                i.business_group as team
            FROM ideas i
            ORDER BY i.idea_id
        `);

        console.log(`📚 Found ${result.rows.length} ideas in PostgreSQL\n`);

        if (result.rows.length === 0) {
            console.log('⚠️  No ideas found in database. Nothing to index.');
            return;
        }

        // Format ideas for indexing
        const ideas = result.rows.map(row => ({
            id: row.idea_id.toString(), // Store as numeric ID string (e.g., "123")
            title: row.title || 'Untitled',
            description: row.description || '',
            category: row.category || '',
            status: row.status || 'Submitted',
            team: row.team || ''
        }));

        // Ask user which provider to use
        console.log('🤖 Select embedding provider:');
        console.log('   1. grok (OpenRouter) - Recommended for production');
        console.log('   2. llama (Local Ollama) - For local development');
        console.log('   3. gemini (Google GenAI) - Alternative option\n');

        // Default to grok for this script
        const provider = 'grok';
        console.log(`Using provider: ${provider}\n`);

        // Batch index all ideas
        console.log('🚀 Starting batch indexing...\n');

        const progressCallback = (progress) => {
            const percent = ((progress.current / progress.total) * 100).toFixed(1);
            console.log(`   Progress: ${progress.current}/${progress.total} (${percent}%) - Last: ${progress.currentIdea}`);
        };

        const stats = await batchIndexIdeas(chromaClient, ideas, provider, progressCallback);

        console.log('\n✅ Indexing complete!');
        console.log(`   - Total: ${stats.total}`);
        console.log(`   - Success: ${stats.successCount}`);
        console.log(`   - Failed: ${stats.failureCount}`);

        // Verify final count
        try {
            const collection = await chromaClient.getCollection({ name: 'ideas_collection' });
            const finalCount = await collection.count();
            console.log(`\n📊 Final ChromaDB count: ${finalCount} ideas indexed`);
        } catch (err) {
            console.log(`\n⚠️  Could not verify final count: ${err.message}`);
        }

        // Test semantic search
        console.log('\n🔍 Testing semantic search with query: "supply chain"...');
        try {
            const collection = await chromaClient.getCollection({ name: 'ideas_collection' });
            const testResults = await collection.query({
                queryTexts: ['supply chain optimization automation'],
                nResults: 3
            });

            if (testResults.ids[0] && testResults.ids[0].length > 0) {
                console.log(`✅ Semantic search working! Found ${testResults.ids[0].length} results:`);
                testResults.ids[0].forEach((id, idx) => {
                    console.log(`   ${idx + 1}. ID: ${id} (distance: ${testResults.distances[0][idx].toFixed(3)})`);
                });
            } else {
                console.log('⚠️  Semantic search returned no results');
            }
        } catch (err) {
            console.log(`⚠️  Could not test semantic search: ${err.message}`);
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    } finally {
        await pool.end();
        console.log('\n✅ Database connection closed');
    }
}

// Run the script
verifyAndReindexIdeas()
    .then(() => {
        console.log('\n🎉 Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Script failed:', error);
        process.exit(1);
    });
