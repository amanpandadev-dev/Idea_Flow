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
    } else if (mimetype === 'text/plain') {
        // Support plain text files
        return buffer.toString('utf-8');
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
 * Extract key themes/topics using Gemini 1.5 Flash with structured JSON output
 * @param {string} text - The full document text (or a summary/subset)
 * @returns {Promise<Object>} Structured RAG data with themes, keywords, and suggested questions
 */
export async function extractThemesWithAI(text) {
    if (!genAI) {
        console.warn('Gemini API not initialized, falling back to simple extraction');
        return extractThemesSimple(text);
    }

    try {
        // Using Gemini 2.0 Flash Experimental - Latest fast model
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Truncate text if too long to avoid token limits (approx 15k chars is safe for Flash input context)
        const inputContext = text.length > 15000 ? text.substring(0, 15000) + "..." : text;

        const prompt = `Analyze the following document text and extract key insights for a RAG (Retrieval Augmented Generation) system.

Return a JSON object with exactly these 5 arrays:
1. "topics": Key topics discussed (max 5) - these will be used to find similar ideas
2. "techStack": Technologies, tools, or frameworks mentioned (max 5)
3. "industry": Industries or domains relevant to the content (max 3)
4. "keywords": Important keywords for search (max 10) - single words or short phrases
5. "suggestedQuestions": 5-8 questions that are SPECIFIC to this document's content

IMPORTANT for suggestedQuestions:
- Questions MUST be specific to the actual content, problems, and solutions mentioned in the document
- Include the main problem/challenge mentioned in the question
- Reference specific technologies, processes, or domains from the document
- Ask about implementation details, expected outcomes, or technical approaches
- DO NOT use generic questions like "What are the main topics?" or "Can you summarize?"
- Examples of GOOD questions: "How can AI optimize delivery routes in real-time?", "What data sources are needed for predictive routing?"

Document Text:
${inputContext}`;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 1000,
            }
        });

        const responseText = result.response.text();
        const data = JSON.parse(responseText);

        // Validate and normalize the response structure
        const topics = Array.isArray(data.topics) ? data.topics.slice(0, 5) : [];
        const techStack = Array.isArray(data.techStack) ? data.techStack.slice(0, 5) : [];
        const industry = Array.isArray(data.industry) ? data.industry.slice(0, 3) : [];
        const keywords = Array.isArray(data.keywords) ? data.keywords.slice(0, 10) : [];
        const suggestedQuestions = Array.isArray(data.suggestedQuestions) ? data.suggestedQuestions.slice(0, 8) : [];

        // Ensure we have at least 5 suggested questions
        if (suggestedQuestions.length < 5) {
            console.warn(`Only ${suggestedQuestions.length} questions generated, expected 5-8`);
        }

        // Combine topics, techStack, and industry into themes array
        const themes = [...topics, ...techStack, ...industry].slice(0, 10);

        console.log(`[AI Extraction] Extracted ${themes.length} themes, ${keywords.length} keywords, ${suggestedQuestions.length} questions using Gemini 1.5 Flash`);

        // Return structured data for RAG functionality
        return {
            themes,
            keywords,
            suggestedQuestions,
            topics,
            techStack,
            industry
        };

    } catch (error) {
        console.error('AI Theme Extraction failed:', error.message);
        console.error('Error details:', error);

        // Fallback to simple extraction on any error
        return extractThemesSimple(text);
    }
}

/**
 * Fallback: Extract key themes/topics from text chunks based on frequency
 * @param {string} text - Full text
 * @returns {Object} Structured RAG data with simple extraction
 */
export function extractThemesSimple(text) {
    if (!text) {
        return {
            themes: [],
            keywords: [],
            suggestedQuestions: [],
            topics: [],
            techStack: [],
            industry: []
        };
    }

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

    // Sort by frequency and get top keywords
    const sortedWords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word]) => word);

    // Use top 5 as themes
    const themes = sortedWords.slice(0, 5);

    // Generate simple questions based on themes
    const suggestedQuestions = [
        'What are the main topics discussed in this document?',
        'Can you summarize the key points?',
        'What are the important concepts mentioned?',
        'How does this relate to innovation?',
        'What are the practical applications?'
    ];

    console.log(`[Simple Extraction] Extracted ${themes.length} themes using frequency analysis`);

    return {
        themes,
        keywords: sortedWords,
        suggestedQuestions,
        topics: themes,
        techStack: [],
        industry: []
    };
}

/**
 * Process uploaded document: extract, chunk, and extract themes with AI-powered extraction
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - File MIME type
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing results with enhanced RAG data structure
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

        // Extract themes and RAG data using AI (Gemini 1.5 Flash)
        // This will automatically fall back to simple extraction if AI fails
        const ragData = await extractThemesWithAI(text);

        // Validate ragData structure
        if (!ragData || typeof ragData !== 'object') {
            throw new Error('Invalid RAG data structure returned from extraction');
        }

        // Extract fields with defaults
        const themes = ragData.themes || [];
        const keywords = ragData.keywords || [];
        const suggestedQuestions = ragData.suggestedQuestions || [];
        const topics = ragData.topics || [];
        const techStack = ragData.techStack || [];
        const industry = ragData.industry || [];

        console.log(`[Document Processing] Successfully processed document: ${chunks.length} chunks, ${themes.length} themes, ${keywords.length} keywords, ${suggestedQuestions.length} questions`);

        return {
            success: true,
            text,
            chunks,
            themes,
            keywords,
            suggestedQuestions,
            ragData: {
                themes,
                keywords,
                suggestedQuestions,
                topics,
                techStack,
                industry
            },
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
