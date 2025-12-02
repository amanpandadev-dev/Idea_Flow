import pdf from 'pdf-parse';
import mammoth from 'mammoth';

/**
 * Native text splitter - no LangChain dependency
 * Splits text into chunks with overlap using configurable separators
 */
class RecursiveTextSplitter {
    constructor(options = {}) {
        this.chunkSize = options.chunkSize || 400;
        this.chunkOverlap = options.chunkOverlap || 50;
        this.separators = options.separators || ['\n\n', '\n', '. ', ' ', ''];
    }

    /**
     * Split text into chunks
     * @param {string} text - Text to split
     * @returns {string[]} Array of text chunks
     */
    splitText(text) {
        if (!text || text.trim().length === 0) {
            return [];
        }

        const chunks = [];
        let remaining = text;

        while (remaining.length > 0) {
            // If remaining text is smaller than chunk size, add it and finish
            if (remaining.length <= this.chunkSize) {
                const trimmed = remaining.trim();
                if (trimmed.length > 0) {
                    chunks.push(trimmed);
                }
                break;
            }

            // Find best split point using separators
            let splitPoint = this.chunkSize;
            let foundSeparator = false;

            for (const separator of this.separators) {
                if (separator === '') continue; // Skip empty separator for now

                // Look for separator within chunk size
                const lastIndex = remaining.lastIndexOf(separator, this.chunkSize);

                if (lastIndex > this.chunkSize - this.chunkOverlap && lastIndex !== -1) {
                    splitPoint = lastIndex + separator.length;
                    foundSeparator = true;
                    break;
                }
            }

            // If no separator found, use chunk size
            if (!foundSeparator) {
                splitPoint = this.chunkSize;
            }

            // Extract chunk
            const chunk = remaining.substring(0, splitPoint).trim();
            if (chunk.length > 0) {
                chunks.push(chunk);
            }

            // Move to next chunk with overlap
            const overlapStart = Math.max(0, splitPoint - this.chunkOverlap);
            remaining = remaining.substring(overlapStart);
        }

        return chunks.filter(c => c.length > 0);
    }
}

/**
 * Extract text from PDF buffer
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<string>} Extracted text
 */
export async function extractPDF(buffer) {
    try {
        const data = await pdf(buffer);
        return data.text;
    } catch (error) {
        console.error('Error extracting PDF:', error.message);
        throw new Error(`Failed to extract PDF: ${error.message}`);
    }
}

/**
 * Extract text from DOCX buffer
 * @param {Buffer} buffer - DOCX file buffer
 * @returns {Promise<string>} Extracted text
 */
export async function extractDOCX(buffer) {
    try {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    } catch (error) {
        console.error('Error extracting DOCX:', error.message);
        throw new Error(`Failed to extract DOCX: ${error.message}`);
    }
}

/**
 * Extract text from document based on file type
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - File MIME type
 * @returns {Promise<string>} Extracted text
 */
export async function extractDocument(buffer, mimetype) {
    if (mimetype === 'application/pdf') {
        return await extractPDF(buffer);
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        return await extractDOCX(buffer);
    } else {
        throw new Error(`Unsupported file type: ${mimetype}`);
    }
}

/**
 * Chunk text with overlap using native text splitter
 * @param {string} text - Text to chunk
 * @param {number} chunkSize - Size of each chunk in characters
 * @param {number} overlap - Overlap between chunks
 * @returns {Promise<string[]>} Array of text chunks
 */
export async function chunkText(text, chunkSize = 400, overlap = 50) {
    if (!text || text.trim().length === 0) {
        return [];
    }

    const splitter = new RecursiveTextSplitter({
        chunkSize,
        chunkOverlap: overlap,
        separators: ['\n\n', '\n', '. ', ' ', '']
    });

    try {
        const chunks = splitter.splitText(text);
        return chunks.filter(chunk => chunk.trim().length > 0);
    } catch (error) {
        console.error('Error chunking text:', error.message);
        throw new Error(`Failed to chunk text: ${error.message}`);
    }
}

/**
 * Extract key themes/topics from text chunks
 * Simple keyword extraction based on frequency
 * @param {string[]} chunks - Array of text chunks
 * @param {number} topN - Number of top themes to return
 * @returns {string[]} Array of themes
 */
export function extractThemes(chunks, topN = 5) {
    if (!chunks || chunks.length === 0) {
        return [];
    }

    // Combine all chunks
    const allText = chunks.join(' ').toLowerCase();

    // Common stop words to filter out
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
        'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
        'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
    ]);

    // Extract words (alphanumeric sequences)
    const words = allText.match(/\b[a-z]{3,}\b/g) || [];

    // Count word frequencies
    const wordFreq = {};
    words.forEach(word => {
        if (!stopWords.has(word)) {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
    });

    // Sort by frequency and get top N
    const sortedWords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([word]) => word);

    return sortedWords;
}

/**
 * Process uploaded document: extract, chunk, and extract themes
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - File MIME type
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing results
 */
export async function processDocument(buffer, mimetype, options = {}) {
    const {
        chunkSize = 400,
        chunkOverlap = 50,
        extractThemesCount = 5
    } = options;

    try {
        // Extract text
        const text = await extractDocument(buffer, mimetype);

        if (!text || text.trim().length === 0) {
            throw new Error('No text content found in document');
        }

        // Chunk text
        const chunks = await chunkText(text, chunkSize, chunkOverlap);

        if (chunks.length === 0) {
            throw new Error('Failed to create text chunks');
        }

        // Extract themes
        const themes = extractThemes(chunks, extractThemesCount);

        return {
            success: true,
            text,
            chunks,
            themes,
            stats: {
                originalLength: text.length,
                chunkCount: chunks.length,
                avgChunkLength: Math.round(chunks.reduce((sum, c) => sum + c.length, 0) / chunks.length)
            }
        };
    } catch (error) {
        console.error('Error processing document:', error.message);
        throw error;
    }
}

export default {
    extractPDF,
    extractDOCX,
    extractDocument,
    chunkText,
    extractThemes,
    processDocument
};
