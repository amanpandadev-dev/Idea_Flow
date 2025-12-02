import { indexIdea } from './semanticSearch.js';

/**
 * Re-indexes all ideas from the database into ChromaDB.
 * This ensures the in-memory vector store is populated on server startup.
 * 
 * @param {Object} db - PostgreSQL pool
 * @param {Object} chromaClient - ChromaDB client
 */
export async function reindexAllIdeas(db, chromaClient) {
    console.log('🔄 [Indexer] Starting re-indexing of ideas...');
    const start = Date.now();

    try {
        // Fetch all ideas
        const result = await db.query('SELECT * FROM ideas ORDER BY idea_id ASC');
        const ideas = result.rows;

        console.log(`[Indexer] Found ${ideas.length} ideas to index.`);

        const provider = process.env.EMBEDDING_PROVIDER || 'llama';
        console.log(`[Indexer] Using embedding provider: ${provider}`);

        let successCount = 0;
        let failCount = 0;

        // Process sequentially to avoid rate limits/overloading local LLM
        for (const idea of ideas) {
            try {
                // Map DB idea to the format expected by indexIdea
                const mappedIdea = {
                    id: `IDEA-${idea.idea_id}`,
                    title: idea.title,
                    description: idea.summary || idea.challenge_opportunity || '',
                    team: idea.business_group,
                    status: idea.build_phase
                };

                await indexIdea(chromaClient, mappedIdea, provider);
                successCount++;

                // Log progress every 5 items
                if (successCount % 5 === 0) {
                    process.stdout.write(`.`);
                }

            } catch (err) {
                console.error(`\n[Indexer] Failed to index idea ${idea.idea_id}:`, err.message);
                failCount++;
            }
        }

        console.log('\n'); // Newline after dots
        const duration = ((Date.now() - start) / 1000).toFixed(2);
        console.log(`✅ [Indexer] Re-indexing complete in ${duration}s.`);
        console.log(`   Success: ${successCount}, Failed: ${failCount}`);

    } catch (error) {
        console.error('❌ [Indexer] Fatal error during re-indexing:', error);
    }
}
