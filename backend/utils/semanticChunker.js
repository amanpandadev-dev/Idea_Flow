/**
 * Semantic-Aware Document Chunking
 * 
 * Preserves paragraph boundaries while maintaining optimal chunk sizes
 * for embedding generation. No LLM required - uses rule-based splitting.
 * 
 * @module semanticChunker
 */

const TARGET_CHUNK_SIZE = 600; // tokens (~2400 characters)
const MIN_CHUNK_SIZE = 300;    // tokens (~1200 characters)
const MAX_CHUNK_SIZE = 900;    // tokens (~3600 characters)
const OVERLAP_PARAGRAPHS = 1;  // Number of paragraphs to overlap

/**
 * Semantic-aware document chunking
 * @param {string} text - Document text to chunk
 * @param {Object} options - Chunking options
 * @returns {string[]} Array of semantically coherent chunks
 */
export function semanticChunk(text, options = {}) {
    const {
        targetSize = TARGET_CHUNK_SIZE,
        minSize = MIN_CHUNK_SIZE,
        maxSize = MAX_CHUNK_SIZE,
        overlapParagraphs = OVERLAP_PARAGRAPHS
    } = options;

    const startTime = Date.now();

    // Step 1: Extract paragraphs
    const paragraphs = extractParagraphs(text);
    console.log(`[SemanticChunker] Extracted ${paragraphs.length} paragraphs`);

    // Step 2: Merge paragraphs into semantic chunks
    const chunks = mergeParagraphs(paragraphs, {
        targetSize,
        minSize,
        maxSize,
        overlapParagraphs
    });

    const timeTaken = Date.now() - startTime;
    const avgSize = Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length);

    // Logging
    console.log(`[SemanticChunker] ✅ Created ${chunks.length} chunks`);
    console.log(`[SemanticChunker] 📊 Avg chunk size: ${avgSize} chars (~${Math.round(avgSize / 4)} tokens)`);
    console.log(`[SemanticChunker] ⏱️  Time: ${timeTaken}ms`);

    return chunks;
}

/**
 * Extract paragraphs from document text
 * Splits on double newlines, markdown headings, and section breaks
 */
function extractParagraphs(text) {
    // Normalize line endings
    const normalized = text.replace(/\r\n/g, '\n');

    // Split by:
    // - Double newlines (paragraph breaks)
    // - Markdown headings (# or ##)
    // - Common section breaks (---, ___, ***)
    const paragraphs = normalized
        .split(/\n\s*\n+|(?=\n#+\s)|(?=\n[-_*]{3,}\n)/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

    return paragraphs;
}

/**
 * Merge paragraphs into optimal-sized chunks
 */
function mergeParagraphs(paragraphs, options) {
    const chunks = [];
    let currentChunk = [];
    let currentSize = 0;

    for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i];
        const paraSize = estimateTokenCount(para);

        // Check if adding this paragraph would exceed max size
        if (currentSize > 0 && currentSize + paraSize > options.maxSize) {
            // Save current chunk
            chunks.push(currentChunk.join('\n\n'));

            // Start new chunk with overlap
            const overlapStart = Math.max(0, currentChunk.length - options.overlapParagraphs);
            currentChunk = currentChunk.slice(overlapStart);
            currentSize = estimateTokenCount(currentChunk.join('\n\n'));
        }

        // Add paragraph to current chunk
        currentChunk.push(para);
        currentSize += paraSize;

        // If we've reached a good chunk size, optionally save
        if (currentSize >= options.targetSize && i < paragraphs.length - 1) {
            const nextParaSize = estimateTokenCount(paragraphs[i + 1]);

            // Only break if next paragraph would push us over max
            if (currentSize + nextParaSize > options.maxSize) {
                chunks.push(currentChunk.join('\n\n'));

                // Start new chunk with overlap
                const overlapStart = Math.max(0, currentChunk.length - options.overlapParagraphs);
                currentChunk = currentChunk.slice(overlapStart);
                currentSize = estimateTokenCount(currentChunk.join('\n\n'));
            }
        }
    }

    // Add final chunk
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
    }

    return chunks;
}

/**
 * Estimate token count from character count
 * Rule of thumb: 1 token ≈ 4 characters
 */
function estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
}

/**
 * Get chunking statistics for a document
 */
export function getChunkingStats(text, chunks) {
    return {
        originalLength: text.length,
        chunkCount: chunks.length,
        avgChunkSize: Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length),
        minChunkSize: Math.min(...chunks.map(c => c.length)),
        maxChunkSize: Math.max(...chunks.map(c => c.length)),
        totalChunkLength: chunks.reduce((sum, c) => sum + c.length, 0)
    };
}

export default {
    semanticChunk,
    getChunkingStats
};
