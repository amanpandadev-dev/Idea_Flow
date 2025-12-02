import 'dotenv/config';
import { getEmbeddingVector } from '../services/embeddingProvider.js';

const runTest = async () => {
    const sampleText = "This is a test sentence for embedding generation.";
    console.log(`Testing with text: "${sampleText}"\n`);

    // --- Test Llama (Local) Provider ---
    try {
        console.log("--- Testing Llama (Local) Provider ---");
        const llamaStartTime = Date.now();
        const llamaEmbedding = await getEmbeddingVector(sampleText, 'llama');
        const llamaTime = Date.now() - llamaStartTime;

        if (llamaEmbedding && llamaEmbedding.length > 0) {
            console.log(`✅ Success! Generated Llama embedding of dimension ${llamaEmbedding.length} in ${llamaTime}ms.`);
            console.log(`   Preview: [${llamaEmbedding.slice(0, 5).join(', ')}...]`);
        } else {
            throw new Error("Received an empty or invalid embedding.");
        }
    } catch (error) {
        console.error(`❌ Llama Provider Test Failed: ${error.message}`);
        console.error("   Ensure your local Ollama instance is running and the model is available.");
    }

    console.log("\n" + "- ".repeat(40) + "\n");

    // --- Test Grok (OpenRouter) Provider ---
    try {
        console.log("--- Testing Grok (OpenRouter) Provider ---");
        if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your-openrouter-api-key') {
            throw new Error("OPENROUTER_API_KEY is not set in the .env file.");
        }

        const grokStartTime = Date.now();
        const grokEmbedding = await getEmbeddingVector(sampleText, 'grok');
        const grokTime = Date.now() - grokStartTime;
        
        if (grokEmbedding && grokEmbedding.length > 0) {
            console.log(`✅ Success! Generated Grok embedding of dimension ${grokEmbedding.length} in ${grokTime}ms.`);
            console.log(`   Preview: [${grokEmbedding.slice(0, 5).join(', ')}...]`);
        } else {
            throw new Error("Received an empty or invalid embedding.");
        }
    } catch (error) {
        console.error(`❌ Grok Provider Test Failed: ${error.message}`);
        console.error("   Ensure your OPENROUTER_API_KEY in the .env file is correct.");
    }
};

runTest();
