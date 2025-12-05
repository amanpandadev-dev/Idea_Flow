import express from 'express';
import multer from 'multer';
import { processDocument } from '../services/documentService.js';
import { generateEmbeddings } from '../services/embeddingService.js';
import { addDocuments, deleteCollection, getCollectionStats } from '../services/vectorStoreService.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all context routes
router.use(auth);

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and DOCX files are supported'));
        }
    }
});

/**
 * POST /api/context/upload
 * Upload document for ephemeral context
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: true, message: 'No file uploaded' });
        }

        // Get user ID from JWT token
        const userId = req.user?.user?.emp_id;
        if (!userId) {
            return res.status(401).json({ error: true, message: 'User not authenticated' });
        }

        const { embeddingProvider = 'llama' } = req.body;
        const collectionId = `user_${userId}`;

        // --- Vector Mismatch Prevention ---
        if (req.session.contextProvider && req.session.contextProvider !== embeddingProvider) {
            console.warn(`[Context] Provider changed from [${req.session.contextProvider}] to [${embeddingProvider}]. Resetting existing context to prevent dimension mismatch.`);
            await deleteCollection(collectionId);
        }

        console.log(`📤 Document upload for user ${userId} using [${embeddingProvider}]: ${req.file.originalname}`);

        const processed = await processDocument(req.file.buffer, req.file.mimetype);
        if (!processed.success) {
            throw new Error('Document processing failed');
        }

        console.log(`🔢 Generating embeddings for ${processed.chunks.length} chunks...`);

        let embeddings;
        let actualProvider = embeddingProvider;

        try {
            embeddings = await generateEmbeddings(processed.chunks, embeddingProvider);
        } catch (error) {
            // If Grok fails, automatically fallback to Gemini
            if (embeddingProvider === 'grok') {
                console.warn(`⚠️  Grok embeddings failed: ${error.message}`);
                console.log(`🔄 Falling back to Gemini embeddings...`);
                actualProvider = 'gemini';
                embeddings = await generateEmbeddings(processed.chunks, 'gemini');
            } else {
                throw error;
            }
        }

        const metadatas = processed.chunks.map((chunk, index) => {
            const baseMetadata = {
                index,
                chunkLength: chunk.length,
                filename: req.file.originalname,
                uploadedAt: new Date().toISOString(),
                userId
            };

            // Store suggested questions and keywords in the first chunk's metadata
            if (index === 0) {
                baseMetadata.suggestedQuestions = processed.suggestedQuestions || [];
                baseMetadata.keywords = processed.keywords || [];
                baseMetadata.themes = processed.themes || [];
            }

            return baseMetadata;
        });
        await addDocuments(collectionId, processed.chunks, embeddings, metadatas);

        // Store the provider used to create this context (may be different if fallback occurred)
        req.session.contextProvider = actualProvider;

        // Store enhanced context metadata in session for later retrieval
        req.session.contextMetadata = {
            themes: processed.themes,
            keywords: processed.keywords || [],
            suggestedQuestions: processed.suggestedQuestions || [],
            ragData: processed.ragData || { themes: processed.themes }
        };

        // Return enhanced RAG data including keywords and suggested questions
        res.json({
            success: true,
            chunksProcessed: processed.chunks.length,
            themes: processed.themes,
            keywords: processed.keywords || [],
            suggestedQuestions: processed.suggestedQuestions || [],
            ragData: processed.ragData || { themes: processed.themes },
            userId,
            collectionId,
            stats: processed.stats,
            embeddingProvider: actualProvider // Return the actual provider used
        });

    } catch (error) {
        console.error('Context upload error:', error.message);
        if (error.message.includes('file type')) {
            return res.status(400).json({ error: true, message: error.message });
        }
        if (error.message.includes('File too large')) {
            return res.status(413).json({ error: true, message: 'File size exceeds 10MB limit' });
        }
        if (error.message.includes('Invalid PDF structure') || error.message.includes('corrupted')) {
            return res.status(400).json({
                error: true,
                message: 'The PDF file appears to be corrupted or has an unsupported structure. Try re-saving the PDF or using a different file.'
            });
        }
        if (error.message.includes('encrypted') || error.message.includes('password')) {
            return res.status(400).json({
                error: true,
                message: 'The PDF file is encrypted or password-protected. Please provide an unprotected PDF.'
            });
        }
        if (error.message.includes('No text content') || error.message.includes('no extractable text')) {
            return res.status(400).json({
                error: true,
                message: 'The PDF contains no extractable text. It may be a scanned image. Please use a PDF with selectable text.'
            });
        }
        res.status(500).json({ error: true, message: 'Failed to process document', details: error.message });
    }
});

/**
 * DELETE /api/context/reset
 * Clear ephemeral context for current session
 */
router.delete('/reset', async (req, res) => {
    try {
        const userId = req.user?.user?.emp_id;
        if (!userId) {
            return res.status(401).json({ error: true, message: 'User not authenticated' });
        }

        const collectionId = `user_${userId}`;
        console.log(`🗑️  Resetting context for user ${userId}`);
        const deleted = await deleteCollection(collectionId);

        // Also clear the provider and metadata from the session
        delete req.session.contextProvider;
        delete req.session.contextMetadata;

        res.json({
            success: deleted,
            message: deleted ? 'Context cleared successfully' : 'No context to clear',
            userId,
            collectionId
        });

    } catch (error) {
        console.error('Context reset error:', error.message);
        res.status(500).json({ error: true, message: 'Failed to reset context', details: error.message });
    }
});

/**
 * GET /api/context/status
 * Get current context status
 */
router.get('/status', async (req, res) => {
    try {
        const userId = req.user?.user?.emp_id;

        if (!userId) {
            return res.status(401).json({ error: true, message: 'User not authenticated' });
        }

        const collectionId = `user_${userId}`;
        const stats = await getCollectionStats(collectionId);
        const hasContext = stats !== null;

        // Try to get suggested questions from ChromaDB metadata (first document)
        let suggestedQuestions = [];
        let keywords = [];
        let themes = [];
        let filename = null;

        if (hasContext && stats.documentCount > 0) {
            try {
                // Import queryCollection to get the first document's metadata
                const { queryCollection } = await import('../services/vectorStoreService.js');
                const { generateSingleEmbedding } = await import('../services/embeddingService.js');

                // Query with a simple text to get the first document's metadata
                // We just need any valid embedding to retrieve the metadata
                const queryEmbedding = await generateSingleEmbedding('document', 'gemini');
                const results = await queryCollection(collectionId, queryEmbedding, 1);

                if (results.metadatas && results.metadatas.length > 0) {
                    const firstMetadata = results.metadatas[0];
                    suggestedQuestions = firstMetadata.suggestedQuestions || [];
                    keywords = firstMetadata.keywords || [];
                    themes = firstMetadata.themes || [];
                    filename = firstMetadata.filename || null;
                    console.log(`[Context Status] Retrieved ${suggestedQuestions.length} suggested questions from ChromaDB`);
                }
            } catch (err) {
                console.warn('[Context Status] Failed to retrieve suggested questions from ChromaDB:', err.message);
                // Fall back to session metadata if available
                const contextMetadata = req.session.contextMetadata || {};
                suggestedQuestions = contextMetadata.suggestedQuestions || [];
                keywords = contextMetadata.keywords || [];
                themes = contextMetadata.themes || [];
            }
        }

        res.json({
            hasContext,
            userId,
            collectionId,
            stats: hasContext ? {
                ...stats,
                themes,
                keywords,
                suggestedQuestions,
                filename
            } : null
        });

    } catch (error) {
        console.error('Context status error:', error.message);
        res.status(500).json({
            error: true,
            message: 'Failed to get context status'
        });
    }
});

/**
 * POST /api/context/find-matching-ideas
 * Find ideas matching uploaded document keywords
 */
router.post('/find-matching-ideas', async (req, res) => {
    try {
        const userId = req.user?.user?.emp_id;
        if (!userId) {
            return res.status(401).json({ error: true, message: 'User not authenticated' });
        }

        const { embeddingProvider = 'llama' } = req.body;
        const collectionId = `user_${userId}`;

        // Get context stats to extract themes/keywords
        const stats = await getCollectionStats(collectionId);

        if (!stats || !stats.themes) {
            return res.status(404).json({
                error: true,
                message: 'No context available. Please upload a document first.'
            });
        }

        console.log(`[Context] Finding matching ideas for user ${userId}`);

        // Import keyword matcher
        const { findIdeasFromDocumentKeywords } = await import('../services/keywordMatcher.js');

        // Get ChromaDB and database instances
        const chromaClient = req.app.get('chromaClient');
        const db = req.app.get('db');

        if (!chromaClient || !db) {
            return res.status(500).json({
                error: true,
                message: 'Database not initialized'
            });
        }

        const matchingIdeas = await findIdeasFromDocumentKeywords(
            stats,
            chromaClient,
            db,
            embeddingProvider
        );

        res.json({
            success: true,
            keywords: stats.themes,
            count: matchingIdeas.length,
            ideas: matchingIdeas
        });

    } catch (error) {
        console.error('Keyword matching error:', error.message);
        res.status(500).json({
            error: true,
            message: 'Failed to find matching ideas'
        });
    }
});

export default router;
