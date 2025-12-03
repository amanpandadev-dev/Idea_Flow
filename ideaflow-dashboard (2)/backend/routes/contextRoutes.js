import express from 'express';
import multer from 'multer';
import { processDocument } from '../services/documentService.js';
import { generateEmbeddings } from '../services/embeddingService.js';
import { addDocuments, deleteCollection, getCollectionStats } from '../services/vectorStoreService.js';

const router = express.Router();

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

        const sessionId = req.session?.id;
        if (!sessionId) {
            return res.status(400).json({ error: true, message: 'Session not available' });
        }

        const { embeddingProvider = 'llama' } = req.body;

        // --- Vector Mismatch Prevention ---
        if (req.session.contextProvider && req.session.contextProvider !== embeddingProvider) {
            console.warn(`[Context] Provider changed from [${req.session.contextProvider}] to [${embeddingProvider}]. Resetting existing context to prevent dimension mismatch.`);
            await deleteCollection(sessionId);
        }

        console.log(`📤 Document upload for session ${sessionId} using [${embeddingProvider}]: ${req.file.originalname}`);

        const processed = await processDocument(req.file.buffer, req.file.mimetype);
        if (!processed.success) {
            throw new Error('Document processing failed');
        }

        console.log(`🔢 Generating embeddings for ${processed.chunks.length} chunks...`);
        const embeddings = await generateEmbeddings(processed.chunks, embeddingProvider);

        const metadatas = processed.chunks.map((chunk, index) => ({
            index,
            chunkLength: chunk.length,
            filename: req.file.originalname,
            uploadedAt: new Date().toISOString()
        }));
        await addDocuments(sessionId, processed.chunks, embeddings, metadatas);

        // Store the provider used to create this context
        req.session.contextProvider = embeddingProvider;

        // Return enhanced RAG data including keywords and suggested questions
        res.json({
            success: true,
            chunksProcessed: processed.chunks.length,
            themes: processed.themes,
            keywords: processed.keywords || [],
            suggestedQuestions: processed.suggestedQuestions || [],
            ragData: processed.ragData || { themes: processed.themes },
            sessionId,
            stats: processed.stats
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
        const sessionId = req.session?.id;
        if (!sessionId) {
            return res.status(400).json({ error: true, message: 'No active session' });
        }

        console.log(`🗑️  Resetting context for session ${sessionId}`);
        const deleted = await deleteCollection(sessionId);

        // Also clear the provider from the session
        delete req.session.contextProvider;

        res.json({
            success: deleted,
            message: deleted ? 'Context cleared successfully' : 'No context to clear',
            sessionId
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
        const sessionId = req.session?.id;

        if (!sessionId) {
            return res.json({
                hasContext: false,
                sessionId: null
            });
        }

        const stats = await getCollectionStats(sessionId);

        res.json({
            hasContext: stats !== null,
            sessionId,
            stats
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
        const sessionId = req.session?.id;
        if (!sessionId) {
            return res.status(400).json({ error: true, message: 'Session not available' });
        }

        const { embeddingProvider = 'grok' } = req.body;

        // Get context stats to extract themes/keywords
        const stats = await getCollectionStats(sessionId);

        if (!stats || !stats.themes) {
            return res.status(404).json({
                error: true,
                message: 'No context available. Please upload a document first.'
            });
        }

        console.log(`[Context] Finding matching ideas for session ${sessionId}`);

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
