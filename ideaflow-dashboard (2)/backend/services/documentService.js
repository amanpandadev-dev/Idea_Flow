import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini API
const genAI = process.env.API_KEY ? new GoogleGenerativeAI(process.env.API_KEY) : null;

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
        // Configure pdf-parse with more lenient options
        const options = {
            // Disable strict mode for better compatibility with various PDF structures
            max: 0, // No page limit
            version: 'default'
        };

        const data = await pdf(buffer, options);

        if (!data.text || data.text.trim().length === 0) {
            throw new Error('No text content could be extracted from PDF');
        }

        return data.text;
    } catch (error) {
        console.error('Error extracting PDF:', error.message);

        // Provide more helpful error messages
        if (error.message.includes('Invalid PDF structure')) {
            throw new Error('The PDF file appears to be corrupted or has an unsupported structure. Try re-saving the PDF or using a different file.');
        } else if (error.message.includes('encrypted')) {
            throw new Error('The PDF file is encrypted or password-protected. Please provide an unprotected PDF.');
        } else if (error.message.includes('No text content')) {
            throw new Error('The PDF contains no extractable text. It may be a scanned image. Please use a PDF with selectable text.');
        }

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
 * Extract key themes/topics using Gemini 2.0 Flash (Free Tier - 1500 req/day)
 * @param {string} text - The full document text (or a summary/subset)
 * @returns {Promise<string[]>} Array of themes/insights
 */
export async function extractThemesWithAI(text) {
    if (!genAI) {
        console.warn('Gemini API not initialized, falling back to simple extraction');
        return extractThemesSimple(text);
    }

    try {
        // Using Gemini 2.0 Flash - Free tier with 1500 requests/day
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Truncate text if too long to avoid token limits (approx 10k chars is safe for Flash input context)
        const inputContext = text.length > 15000 ? text.substring(0, 15000) + "..." : text;

        const prompt = `
        Analyze the following document text and extract key insights for a RAG (Retrieval Augmented Generation) system.
        
        Return a JSON object with exactly these 5 arrays:
        1. "topics": Key topics discussed (max 5) - these will be used to find similar ideas
        2. "techStack": Technologies, tools, or frameworks mentioned (max 5)
        3. "industry": Industries or domains relevant to the content (max 3)
        4. "keywords": Important keywords for search (max 10) - single words or short phrases
        5. "suggestedQuestions": 3-5 questions a user might ask about this document
        
        Keep the items concise (1-3 words for topics/tech/industry, short phrases for keywords).
        
        Document Text:
        "${inputContext}"
        `;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 1000, // Keep token usage low as requested
            }
        });

        const responseText = result.response.text();
        const data = JSON.parse(responseText);

        // Return structured data for RAG functionality
        const themes = [
            ...(data.topics || []),
            ...(data.techStack || []),
            ...(data.industry || [])
        ];

        console.log(`[AI Extraction] Extracted ${themes.length} insights using Gemini 2.0 Flash`);

        // Return both themes and additional RAG data
        return {
            themes: themes.slice(0, 10),
            keywords: data.keywords || [],
            suggestedQuestions: data.suggestedQuestions || [],
            topics: data.topics || [],
            techStack: data.techStack || [],
            industry: data.industry || []
        };

    } catch (error) {
        console.error('AI Theme Extraction failed:', error.message);
        return extractThemesSimple(text);
    }
}

/**
 * Fallback: Extract key themes/topics from text chunks based on frequency
 * @param {string} text - Full text
 * @returns {string[]} Array of themes
 */
export function extractThemesSimple(text) {
    if (!text) return [];

    // Common stop words to filter out
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
        'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
        'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
    ]);

    // Extract words (alphanumeric sequences)
    const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];

    // Count word frequencies
    const wordFreq = {};
    words.forEach(word => {
        if (!stopWords.has(word)) {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
    });

    // Sort by frequency and get top 5
    const sortedWords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
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
        chunkOverlap = 50
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

        // Extract themes and RAG data using AI (Gemini 2.0 Flash)
        const ragData = await extractThemesWithAI(text);

        // Handle both old format (array) and new format (object)
        const themes = Array.isArray(ragData) ? ragData : (ragData.themes || []);
        const keywords = Array.isArray(ragData) ? [] : (ragData.keywords || []);
        const suggestedQuestions = Array.isArray(ragData) ? [] : (ragData.suggestedQuestions || []);

        return {
            success: true,
            text,
            chunks,
            themes,
            keywords,
            suggestedQuestions,
            ragData: Array.isArray(ragData) ? { themes: ragData } : ragData,
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
    extractThemesWithAI,
    processDocument
};
