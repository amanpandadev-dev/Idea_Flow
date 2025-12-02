import React, { useState, useCallback, useEffect } from 'react';
import { Upload, X, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadContext, resetContext, getContextStatus, findMatchingIdeas, generateQuestions, type ContextUploadResponse, type MatchingIdeasResponse } from '../services';

interface DocumentUploadProps {
    embeddingProvider: 'llama' | 'grok';
    onUploadSuccess?: (response: ContextUploadResponse) => void;
    onReset?: () => void;
    onMatchingIdeasFound?: (response: MatchingIdeasResponse) => void;
    onQuestionsGenerated?: (questions: string[]) => void;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ embeddingProvider, onUploadSuccess, onReset, onMatchingIdeasFound, onQuestionsGenerated }) => {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadedContext, setUploadedContext] = useState<ContextUploadResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);

    // Check for existing context on mount
    useEffect(() => {
        const checkExistingContext = async () => {
            setIsCheckingStatus(true);
            try {
                const status = await getContextStatus();

                if (status.hasContext && status.stats) {
                    console.log('[DocumentUpload] Found existing context, restoring state');
                    // Reconstruct the uploadedContext from status
                    setUploadedContext({
                        success: true,
                        chunksProcessed: status.stats.documentCount,
                        themes: [], // Themes not available from status endpoint
                        sessionId: status.sessionId || '',
                        stats: {
                            originalLength: 0,
                            chunkCount: status.stats.documentCount,
                            avgChunkLength: 0
                        }
                    });
                } else {
                    console.log('[DocumentUpload] No existing context found');
                }
            } catch (err: any) {
                console.error('[DocumentUpload] Failed to check context status:', err.message);
                // Don't show error to user, just log it
            } finally {
                setIsCheckingStatus(false);
            }
        };

        checkExistingContext();
    }, []);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    }, []);

    const handleFileSelect = (selectedFile: File) => {
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

        if (!allowedTypes.includes(selectedFile.type)) {
            setError('Only PDF and DOCX files are supported');
            return;
        }

        if (selectedFile.size > 10 * 1024 * 1024) {
            setError('File size must be less than 10MB');
            return;
        }

        setFile(selectedFile);
        setError(null);
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        setError(null);

        try {
            const response = await uploadContext(file, embeddingProvider);
            setUploadedContext(response);
            setFile(null);
            onUploadSuccess?.(response);

            // Also trigger matching ideas search
            if (response.success) {
                try {
                    const matches = await findMatchingIdeas(embeddingProvider);
                    onMatchingIdeasFound?.(matches);
                } catch (matchErr) {
                    console.error('Failed to find matching ideas:', matchErr);
                }

                // Generate suggested questions
                if (onQuestionsGenerated) {
                    try {
                        // Pass context stats with themes
                        const questions = await generateQuestions({ themes: response.themes }, embeddingProvider);
                        onQuestionsGenerated(questions);
                    } catch (qErr) {
                        console.error('Failed to generate questions:', qErr);
                    }
                }
            }
        } catch (err: any) {
            console.error('Upload failed:', err);
            setError(err.message || 'Failed to upload document');
        } finally {
            setUploading(false);
        }
    };

    const handleReset = async () => {
        try {
            await resetContext();
            setUploadedContext(null);
            setFile(null);
            setError(null);
            onReset?.();
        } catch (err: any) {
            setError(err.message || 'Reset failed');
        }
    };

    // Show loading state while checking for existing context
    if (isCheckingStatus) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                        <FileText className="h-5 w-5 text-indigo-600" />
                        Document Context
                    </h3>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-indigo-600 py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking for existing context...
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-indigo-600" />
                    Document Context
                </h3>
                {uploadedContext && (
                    <button
                        onClick={handleReset}
                        className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                    >
                        <X className="h-3 w-3" />
                        Reset
                    </button>
                )}
            </div>

            {!uploadedContext ? (
                <>
                    <div
                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragActive
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-slate-300 hover:border-indigo-400'
                            }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        {!file ? (
                            <>
                                <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                                <p className="text-sm text-slate-600 mb-1">
                                    Drag & drop a document or{' '}
                                    <label className="text-indigo-600 hover:text-indigo-700 cursor-pointer font-medium">
                                        browse
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept=".pdf,.docx"
                                            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                                        />
                                    </label>
                                </p>
                                <p className="text-xs text-slate-500">PDF or DOCX, max 10MB</p>
                            </>
                        ) : (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-indigo-600" />
                                    <span className="text-sm font-medium text-slate-900">{file.name}</span>
                                    <span className="text-xs text-slate-500">
                                        ({(file.size / 1024).toFixed(1)} KB)
                                    </span>
                                </div>
                                <button
                                    onClick={() => setFile(null)}
                                    className="text-slate-400 hover:text-red-600"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    {file && !uploading && (
                        <button
                            onClick={handleUpload}
                            className="mt-3 w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
                        >
                            Upload & Process
                        </button>
                    )}

                    {uploading && (
                        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-indigo-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Processing document...
                        </div>
                    )}
                </>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                        <div className="flex-1">
                            <div className="text-sm font-medium text-green-900">Context Loaded</div>
                            <div className="text-xs text-green-700 mt-1">
                                {uploadedContext.chunksProcessed} chunks processed
                            </div>
                        </div>
                    </div>

                    {uploadedContext.themes && uploadedContext.themes.length > 0 && (
                        <div>
                            <div className="text-xs font-medium text-slate-700 mb-2">Extracted Themes:</div>
                            <div className="flex flex-wrap gap-1">
                                {uploadedContext.themes.map((theme, index) => (
                                    <span
                                        key={index}
                                        className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full"
                                    >
                                        {theme}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="text-xs text-slate-500">
                        Your queries will now include context from this document
                    </div>
                </div>
            )}
        </div>
    );
};

export default DocumentUpload;
