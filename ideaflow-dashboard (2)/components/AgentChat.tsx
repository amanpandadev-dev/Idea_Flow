import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Bot, ChevronDown, ChevronUp, Sparkles, StopCircle, RefreshCcw, History, Trash2, X, Search, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import {
    startAgentSession,
    getAgentSessionStatus,
    stopAgentSession,
    semanticSearchIdeas,
    saveSearchHistory,
    getSearchHistory,
    rerunSearch,
    toggleLikeIdea,
    type AgentSession,
    type SemanticSearchResult,
    type SearchHistoryEntry
} from '../services';
import { Idea } from '../types';
import CitationDisplay from './CitationDisplay';
import DocumentUpload from './DocumentUpload';
import IdeaCard from './IdeaCard';

const SESSION_STORAGE_KEY = 'agent_session_job_id';

interface AgentChatProps {
    user: any;
    onNavigateToIdea?: (ideaId: string) => void;
}

type SearchMode = 'agent' | 'semantic';

const AgentChat: React.FC<AgentChatProps> = ({ user, onNavigateToIdea }) => {
    const [query, setQuery] = useState('');
    const [jobId, setJobId] = useState<string | null>(null);
    const [session, setSession] = useState<AgentSession | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showReasoning, setShowReasoning] = useState(false);
    const [embeddingProvider, setEmbeddingProvider] = useState<'llama' | 'grok'>('llama');
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
    const [searchMode, setSearchMode] = useState<SearchMode>('agent');
    const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const pollingInterval = useRef<NodeJS.Timeout | null>(null);

    const isRunning = session?.status === 'running' || session?.status === 'queued' || session?.status === 'starting';

    // Load search history from API
    useEffect(() => {
        const loadHistory = async () => {
            if (user?.emp_id) {
                try {
                    console.log(`[AgentChat] Loading history for user: ${user.emp_id}`);
                    const history = await getSearchHistory(user.emp_id);
                    setSearchHistory(history);
                } catch (err) {
                    console.error('[AgentChat] Failed to load search history:', err);
                }
            } else if (user) {
                console.warn('[AgentChat] User loaded but emp_id is missing', user);
            }
        };
        loadHistory();
    }, [user]);

    // Polling effect
    useEffect(() => {
        if (jobId && isRunning) {
            pollingInterval.current = setInterval(async () => {
                try {
                    const status = await getAgentSessionStatus(jobId);
                    setSession(status);
                    if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
                        if (pollingInterval.current) clearInterval(pollingInterval.current);

                        // Add to history if completed successfully
                        if (status.status === 'completed' && status.result && user?.emp_id) {
                            try {
                                await saveSearchHistory({
                                    user_emp_id: user.emp_id,
                                    query: status.query,
                                    embedding_provider: embeddingProvider,
                                    session_id: jobId
                                });
                                // Reload history
                                const history = await getSearchHistory(user.emp_id);
                                setSearchHistory(history);
                            } catch (err) {
                                console.error('Failed to save agent history', err);
                            }
                        }

                        localStorage.removeItem(SESSION_STORAGE_KEY);
                        setJobId(null);
                    }
                } catch (err) {
                    setError('Failed to get session status.');
                    if (pollingInterval.current) clearInterval(pollingInterval.current);
                }
            }, 2000);
        }

        return () => {
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
            }
        };
    }, [jobId, isRunning]);

    // Re-attach to session on mount
    useEffect(() => {
        const storedJobId = localStorage.getItem(SESSION_STORAGE_KEY);
        const storedQuery = localStorage.getItem('agent_last_query');

        if (storedQuery) {
            setQuery(storedQuery);
        }

        if (storedJobId) {
            console.log(`[AgentChat] Reattaching to session: ${storedJobId}`);
            setJobId(storedJobId);
            setIsReconnecting(true);

            (async () => {
                try {
                    const status = await getAgentSessionStatus(storedJobId);
                    setSession(status);
                    setIsReconnecting(false);

                    if (status.query) {
                        setQuery(status.query);
                        localStorage.setItem('agent_last_query', status.query);
                    }

                    if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
                        console.log(`[AgentChat] Session ${storedJobId} already finished with status: ${status.status}`);

                        if (status.status === 'completed' && status.result && user?.emp_id) {
                            try {
                                await saveSearchHistory({
                                    user_emp_id: user.emp_id,
                                    query: status.query,
                                    embedding_provider: embeddingProvider,
                                    session_id: storedJobId
                                });
                                const history = await getSearchHistory(user.emp_id);
                                setSearchHistory(history);
                            } catch (err) {
                                console.error('Failed to save agent history', err);
                            }
                        }

                        localStorage.removeItem(SESSION_STORAGE_KEY);
                        setJobId(null);
                    } else {
                        console.log(`[AgentChat] Session ${storedJobId} is ${status.status}, resuming polling...`);
                    }
                } catch (err: any) {
                    console.error(`[AgentChat] Failed to reattach to session ${storedJobId}:`, err.message);
                    setIsReconnecting(false);

                    // If session not found (404) or server error, clear the stale session
                    if (err.message.includes('404') || err.message.includes('not found') || err.message.includes('Job not found')) {
                        console.warn(`[AgentChat] Session ${storedJobId} not found on server, clearing stale reference`);
                        localStorage.removeItem(SESSION_STORAGE_KEY);
                        setJobId(null);
                        setSession(null); // Ensure session state is cleared
                    } else {
                        // Only show error for non-404 issues
                        setError(`Failed to reconnect to session: ${err.message}`);
                    }
                }
            })();
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || isRunning || isSearching) return;

        setError(null);
        setSelectedHistoryId(null);
        localStorage.setItem('agent_last_query', query.trim());

        if (searchMode === 'semantic') {
            // Semantic search mode
            setIsSearching(true);
            setSemanticResults([]);
            setSession(null);

            try {
                console.log(`[AgentChat] Performing semantic search: "${query}"`);
                setPage(1);
                setHasMore(true);
                const results = await semanticSearchIdeas(query.trim(), embeddingProvider, 10, 1);
                setSemanticResults(results);
                if (results.length < 10) setHasMore(false);
                console.log(`[AgentChat] Found ${results.length} similar ideas`);

                // Save history
                if (user?.emp_id) {
                    await saveSearchHistory({
                        user_emp_id: user.emp_id,
                        query: query.trim(),
                        embedding_provider: embeddingProvider,
                        result_ids: results.map(r => r.id)
                    });
                    // Reload history
                    const history = await getSearchHistory(user.emp_id);
                    setSearchHistory(history);
                }
            } catch (err: any) {
                setError(err.message || 'Semantic search failed');
            } finally {
                setIsSearching(false);
            }
        } else {
            // Agent Q&A mode
            setSession(null);
            setShowReasoning(false);
            setSemanticResults([]);

            try {
                setSession({ status: 'queued', query, id: '', history: [], result: null, createdAt: Date.now(), updatedAt: Date.now() });
                const { jobId: newJobId } = await startAgentSession(query.trim(), embeddingProvider);
                setJobId(newJobId);
                localStorage.setItem(SESSION_STORAGE_KEY, newJobId);
            } catch (err: any) {
                setError(err.message || 'Failed to start agent session');
                setSession(null);
            }
        }
    };

    const handleCancel = async () => {
        if (jobId) {
            try {
                await stopAgentSession(jobId);
            } catch (err: any) {
                setError(err.message || 'Failed to stop session');
            }
        }
    };

    const handleReset = () => {
        setQuery('');
        setJobId(null);
        setSession(null);
        setError(null);
        setShowReasoning(false);
        setSelectedHistoryId(null);
        setSemanticResults([]);
        localStorage.removeItem(SESSION_STORAGE_KEY);
        localStorage.removeItem('agent_last_query');
    };

    const handleClearQuery = () => {
        setQuery('');
        localStorage.removeItem('agent_last_query');
    };

    const handleViewHistoryItem = async (item: SearchHistoryEntry) => {
        setQuery(item.query);
        setEmbeddingProvider(item.embedding_provider as any);
        setShowHistory(false);
        setShowReasoning(false);
        setSelectedHistoryId(item.id);

        setIsSearching(true);
        setSearchMode('semantic'); // Default to semantic for rerun
        setSemanticResults([]);
        setSession(null);

        try {
            const response = await rerunSearch(item.id);
            if (response.success && response.results) {
                setSemanticResults(response.results);
                console.log(`[AgentChat] Rerun found ${response.results.length} results`);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to rerun search');
        } finally {
            setIsSearching(false);
        }
    };

    const handleClearHistory = () => {
        if (confirm('Are you sure you want to clear all search history?')) {
            setSearchHistory([]);
            // TODO: Add API endpoint to clear history
            console.log('[AgentChat] Search history cleared (local state only)');
        }
    };

    const handleQuestionsGenerated = (questions: string[]) => {
        console.log(`[AgentChat] Received ${questions.length} suggested questions`);
        setSuggestedQuestions(questions);
    };

    const handleNavigate = (ideaId: string) => {
        if (onNavigateToIdea) onNavigateToIdea(ideaId);
    };

    const handleNextPage = async () => {
        const nextPage = page + 1;
        setIsSearching(true);
        try {
            const results = await semanticSearchIdeas(query.trim(), embeddingProvider, 10, nextPage);
            setSemanticResults(results);
            setPage(nextPage);
        } catch (err: any) {
            setError(err.message || 'Failed to load next page');
        } finally {
            setIsSearching(false);
        }
    };

    const handlePrevPage = async () => {
        if (page <= 1) return;
        const prevPage = page - 1;
        setIsSearching(true);
        try {
            const results = await semanticSearchIdeas(query.trim(), embeddingProvider, 10, prevPage);
            setSemanticResults(results);
            setPage(prevPage);
        } catch (err: any) {
            setError(err.message || 'Failed to load previous page');
        } finally {
            setIsSearching(false);
        }
    };

    const handleLike = async (e: React.MouseEvent, idea: Idea) => {
        e.stopPropagation();
        try {
            const { liked } = await toggleLikeIdea(idea.id);
            setSemanticResults(prev => prev.map(item => {
                if (item.id === idea.id) {
                    return {
                        ...item,
                        isLiked: liked,
                        likesCount: liked ? (item.likesCount || 0) + 1 : (item.likesCount || 0) - 1
                    };
                }
                return item;
            }));
        } catch (err) {
            console.error('Failed to toggle like', err);
        }
    };

    const renderLoadingState = () => (
        <div className="flex items-center gap-3 text-indigo-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <div className="text-sm font-medium">
                <p>{isReconnecting ? 'Reconnecting to session...' : session?.status === 'queued' ? 'Waiting in queue...' : 'Processing...'}</p>
                {session?.history && session.history.length > 0 &&
                    <p className="text-xs text-slate-500">{session.history[session.history.length - 1]}</p>
                }
            </div>
        </div>
    );

    const renderSemanticResults = () => {
        if (semanticResults.length === 0) {
            return (
                <div className="bg-slate-50 rounded-xl p-8 text-center">
                    <Search className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                    <p className="text-slate-600 font-medium">No similar ideas found</p>
                    <p className="text-sm text-slate-500 mt-1">Try adjusting your search query or keywords</p>
                </div>
            );
        }

        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">Found {semanticResults.length} Similar Ideas</h3>
                    <button onClick={handleReset} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                        <RefreshCcw className="h-3 w-3" /> New Search
                    </button>
                </div>
                <div className="grid gap-3">
                    {semanticResults.map((idea) => (
                        <IdeaCard
                            key={idea.id}
                            idea={idea}
                            similarity={idea.similarity * 100}
                            onClick={() => handleNavigate(idea.id)}
                            onLike={handleLike}
                        />
                    ))}
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-2">
                    <button
                        onClick={handlePrevPage}
                        disabled={page === 1 || isSearching}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4" /> Previous
                    </button>
                    <span className="text-sm text-slate-500 font-medium">Page {page}</span>
                    <button
                        onClick={handleNextPage}
                        disabled={semanticResults.length < 10 || isSearching}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                    >
                        Next <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </div>
        );
    };

    const renderFinalResponse = () => {
        if (!session?.result) return null;
        const response = session.result;
        const isFromHistory = selectedHistoryId !== null;

        return (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                {isFromHistory && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                        <History className="h-4 w-4" />
                        Viewing result from search history
                    </div>
                )}
                {response.usedEphemeralContext && (
                    <div className="flex items-center gap-2 text-sm text-purple-600 bg-purple-50 px-3 py-2 rounded-lg border border-purple-200">
                        <Sparkles className="h-4 w-4" />
                        Response includes context from your uploaded document
                    </div>
                )}
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Bot className="h-5 w-5 text-indigo-600" />
                        <h3 className="font-semibold text-slate-900">Answer</h3>
                    </div>
                    <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                        {response.answer}
                    </div>
                </div>
                {(response.citations.internal.length > 0 || response.citations.external.length > 0) && (
                    <div>
                        <h3 className="font-semibold text-slate-900 mb-2">Sources</h3>
                        <CitationDisplay citations={response.citations} onNavigateToIdea={handleNavigate} />
                    </div>
                )}
                {response.reasoning && (
                    <div className="border-t border-slate-200 pt-4">
                        <button onClick={() => setShowReasoning(!showReasoning)} className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-indigo-600 transition-colors">
                            {showReasoning ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            Agent Reasoning Process
                        </button>
                        {showReasoning && (
                            <div className="mt-2 p-3 bg-slate-50 rounded-lg text-sm text-slate-600 font-mono whitespace-pre-wrap">
                                {response.reasoning}
                            </div>
                        )}
                    </div>
                )}
                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-200 pt-3">
                    <span>Processing time: {response.processingTime}s</span>
                    <button onClick={handleReset} className="flex items-center gap-1 hover:text-indigo-600">
                        <RefreshCcw className="h-3 w-3" /> Ask another question
                    </button>
                </div>
            </div>
        )
    };

    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return date.toLocaleDateString();
    };

    const getPlaceholder = () => {
        if (searchMode === 'semantic') {
            return 'Search for similar ideas (e.g., "AI customer service automation")...';
        }
        return 'Ask me anything about AI innovations, trends, or specific ideas...';
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-3 mb-2"><Bot className="h-8 w-8" /><h1 className="text-2xl font-bold">AI Agent Assistant</h1></div>
                        <p className="text-indigo-100">Ask questions about our innovation repository and get insights from internal ideas and external research</p>
                    </div>
                    {searchHistory.length > 0 && (
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm font-medium"
                        >
                            <History className="h-4 w-4" />
                            History ({searchHistory.length})
                        </button>
                    )}
                </div>
            </div>

            {showHistory && searchHistory.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                            <History className="h-5 w-5 text-indigo-600" />
                            Search History
                        </h3>
                        <button
                            onClick={handleClearHistory}
                            className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                        >
                            <Trash2 className="h-3 w-3" />
                            Clear All
                        </button>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {searchHistory.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => handleViewHistoryItem(item)}
                                className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedHistoryId === item.id
                                    ? 'border-indigo-300 bg-indigo-50'
                                    : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900 truncate">{item.query}</p>
                                        <p className="text-xs text-slate-500 mt-1">{formatTimestamp(new Date(item.created_at).getTime())}</p>
                                    </div>
                                    <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">Completed</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <DocumentUpload embeddingProvider={embeddingProvider} onQuestionsGenerated={handleQuestionsGenerated} />

            {suggestedQuestions.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-indigo-600" />
                        Suggested Questions
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {suggestedQuestions.map((question, idx) => (
                            <button
                                key={idx}
                                onClick={() => setQuery(question)}
                                className="text-left px-4 py-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm border border-indigo-200 flex items-start gap-2 h-full"
                            >
                                <Sparkles className="h-4 w-4 mt-0.5 shrink-0 opacity-70" />
                                <span>{question}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                {/* Mode Selector */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setSearchMode('agent')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${searchMode === 'agent'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        <MessageSquare className="h-4 w-4" />
                        Agent Q&A
                    </button>
                    <button
                        onClick={() => setSearchMode('semantic')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${searchMode === 'semantic'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        <Search className="h-4 w-4" />
                        Find Similar Ideas
                    </button>
                </div>

                {/* Search Form */}
                <form onSubmit={handleSubmit}>
                    <div className="flex flex-wrap sm:flex-nowrap gap-3">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={getPlaceholder()}
                                className="w-full px-4 py-3 pr-10 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                disabled={isRunning || isSearching}
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={handleClearQuery}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <select
                                value={embeddingProvider}
                                onChange={(e) => setEmbeddingProvider(e.target.value as 'llama' | 'grok')}
                                className="px-4 py-3 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                disabled={isRunning || isSearching}
                            >
                                <option value="llama">Llama (Local)</option>
                                <option value="grok">Grok (OpenRouter)</option>
                            </select>
                            <button
                                type="submit"
                                disabled={isRunning || isSearching || !query.trim()}
                                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
                            >
                                {searchMode === 'semantic' ? <Search className="h-5 w-5" /> : <Send className="h-5 w-5" />}
                                {searchMode === 'semantic' ? 'Search' : 'Ask Agent'}
                            </button>
                            {isRunning && (
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
                                >
                                    <StopCircle className="h-5 w-5" /> Cancel
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800">
                    <div className="font-medium">Error</div>
                    <div className="text-sm mt-1">{error}</div>
                </div>
            )}

            {(isRunning || isReconnecting) && <div className="bg-white rounded-xl border border-slate-200 p-6">{renderLoadingState()}</div>}

            {isSearching && (
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <div className="flex items-center gap-3 text-indigo-600">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm font-medium">Searching for similar ideas...</span>
                    </div>
                </div>
            )}

            {searchMode === 'semantic' && !isSearching && semanticResults.length >= 0 && query && (
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    {renderSemanticResults()}
                </div>
            )}

            {searchMode === 'agent' && session?.status === 'completed' && renderFinalResponse()}

            {session?.status === 'failed' && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800"><div className="font-medium">Execution Failed</div><div className="text-sm mt-1">{session.error}</div></div>}
            {session?.status === 'cancelled' && <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-yellow-800"><div className="font-medium">Execution Cancelled</div></div>}

            {!session && !isReconnecting && searchMode === 'agent' && semanticResults.length === 0 && (
                <div className="bg-slate-50 rounded-xl p-6">
                    <h3 className="font-semibold text-slate-900 mb-3">Example Questions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {['What are the latest trends in AI for healthcare?', 'Show me innovations related to customer service automation', 'What AI solutions are we building for retail?', 'How can we use AI to improve operational efficiency?'].map((example, index) => (
                            <button key={index} onClick={() => setQuery(example)} className="text-left p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-sm text-slate-700">{example}</button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AgentChat;
