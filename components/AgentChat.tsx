import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Bot, ChevronDown, ChevronUp, Sparkles, StopCircle, RefreshCcw, History, Trash2, X, Search, MessageSquare } from 'lucide-react';
import { startAgentSession, getAgentSessionStatus, stopAgentSession, semanticSearchIdeas, fetchAgentHistory, clearAgentHistory, type AgentSession, type SemanticSearchResult, type AgentHistoryItem } from '../services';
import CitationDisplay from './CitationDisplay';
import DocumentUpload from './DocumentUpload';

const SESSION_STORAGE_KEY = 'agent_session_job_id';
const SEMANTIC_RESULTS_KEY_PREFIX = 'agent_semantic_results_';
const SEMANTIC_PAGINATION_KEY_PREFIX = 'agent_semantic_pagination_';
const CURRENT_USER_KEY = 'agent_current_user';
const QUERY_STORAGE_KEY_PREFIX = 'agent_last_query_';

interface AgentChatProps {
    onNavigateToIdea?: (ideaId: string) => void;
}

// SearchHistoryItem is now imported from services.ts as AgentHistoryItem

type SearchMode = 'agent' | 'semantic';

const AgentChat: React.FC<AgentChatProps> = ({ onNavigateToIdea }) => {
    const [query, setQuery] = useState('');
    const [jobId, setJobId] = useState<string | null>(null);
    const [session, setSession] = useState<AgentSession | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showReasoning, setShowReasoning] = useState(false);
    const [embeddingProvider, setEmbeddingProvider] = useState<'llama' | 'grok'>('grok');
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [searchHistory, setSearchHistory] = useState<AgentHistoryItem[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
    const [searchMode, setSearchMode] = useState<SearchMode>('agent');
    const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [totalResults, setTotalResults] = useState(0);
    const [currentQuery, setCurrentQuery] = useState('');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<AgentHistoryItem | null>(null);

    // Helper functions to get user-specific storage keys
    const getSemanticResultsKey = () => currentUserId ? `${SEMANTIC_RESULTS_KEY_PREFIX}${currentUserId}` : null;
    const getSemanticPaginationKey = () => currentUserId ? `${SEMANTIC_PAGINATION_KEY_PREFIX}${currentUserId}` : null;


    const pollingInterval = useRef<NodeJS.Timeout | null>(null);

    const isRunning = session?.status === 'running' || session?.status === 'queued' || session?.status === 'starting';

    // Load search history from database and detect user changes
    useEffect(() => {
        const loadHistory = async () => {
            try {
                const history = await fetchAgentHistory();
                setSearchHistory(history);
                console.log(`[AgentChat] Loaded ${history.length} items from database`);

                // Get current user from localStorage (set during login)
                const currentUser = localStorage.getItem('user');
                const newUserId = currentUser ? JSON.parse(currentUser).id : null;
                const storedUserId = sessionStorage.getItem(CURRENT_USER_KEY);

                // If user changed, clear old data INCLUDING search input and document context
                if (storedUserId && storedUserId !== String(newUserId)) {
                    console.log('[AgentChat] User changed, clearing old search data, input, and suggested questions');
                    
                    // Clear all semantic search data from sessionStorage
                    Object.keys(sessionStorage).forEach(key => {
                        if (key.startsWith(SEMANTIC_RESULTS_KEY_PREFIX) ||
                            key.startsWith(SEMANTIC_PAGINATION_KEY_PREFIX)) {
                            sessionStorage.removeItem(key);
                        }
                    });
                    
                    // Clear user-specific localStorage data
                    const userSpecificKeys = [
                        `agent_last_query_${storedUserId}`,
                        `agent_last_query`, // Legacy key
                        SESSION_STORAGE_KEY
                    ];
                    userSpecificKeys.forEach(key => localStorage.removeItem(key));
                    
                    // PRIVACY FIX: Clear all state when user changes
                    setQuery('');
                    setSemanticResults([]);
                    setCurrentPage(1);
                    setTotalPages(0);
                    setTotalResults(0);
                    setCurrentQuery('');
                    setSuggestedQuestions([]);
                    setSession(null);
                    setJobId(null);
                    setError(null);
                }

                // Store current user ID
                if (newUserId) {
                    sessionStorage.setItem(CURRENT_USER_KEY, String(newUserId));
                    setCurrentUserId(String(newUserId));
                    
                    // Load user-specific search input
                    const userSpecificQuery = localStorage.getItem(`agent_last_query_${newUserId}`);
                    if (userSpecificQuery) {
                        setQuery(userSpecificQuery);
                    }
                }
            } catch (err) {
                console.error('[AgentChat] Failed to load search history:', err);
                // Clear semantic search data on error (likely auth issue)
                Object.keys(sessionStorage).forEach(key => {
                    if (key.startsWith(SEMANTIC_RESULTS_KEY_PREFIX) ||
                        key.startsWith(SEMANTIC_PAGINATION_KEY_PREFIX)) {
                        sessionStorage.removeItem(key);
                    }
                });
                // PRIVACY FIX: Clear search input on auth error
                setQuery('');
                setSuggestedQuestions([]);
            }
        };
        loadHistory();

        // PRIVACY FIX: Cleanup function to clear search input on unmount
        return () => {
            console.log('[AgentChat] Component unmounting, clearing search input');
            setQuery('');
        };
    }, []);

    // Polling effect
    useEffect(() => {
        if (jobId && isRunning) {
            pollingInterval.current = setInterval(async () => {
                try {
                    const status = await getAgentSessionStatus(jobId);
                    setSession(status);
                    if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
                        if (pollingInterval.current) clearInterval(pollingInterval.current);

                        // Reload history from database if completed successfully
                        if (status.status === 'completed' && status.result) {
                            fetchAgentHistory()
                                .then(history => setSearchHistory(history))
                                .catch(err => console.error('[AgentChat] Failed to reload history:', err));
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

                        // Reload history from database if completed
                        if (status.status === 'completed' && status.result) {
                            fetchAgentHistory()
                                .then(history => setSearchHistory(history))
                                .catch(err => console.error('[AgentChat] Failed to reload history:', err));
                        }

                        localStorage.removeItem(SESSION_STORAGE_KEY);
                        setJobId(null);
                    } else {
                        console.log(`[AgentChat] Session ${storedJobId} is ${status.status}, resuming polling...`);
                    }
                } catch (err: any) {
                    console.error(`[AgentChat] Failed to reattach to session ${storedJobId}:`, err.message);
                    setIsReconnecting(false);

                    if (err.message.includes('404') || err.message.includes('not found')) {
                        console.warn(`[AgentChat] Session ${storedJobId} not found on server, clearing stale reference`);
                        localStorage.removeItem(SESSION_STORAGE_KEY);
                        setJobId(null);
                    } else {
                        setError(`Failed to reconnect to session: ${err.message}`);
                    }
                }
            })();
        }
    }, []);

    // Restore preserved search results if available (user-specific)
    useEffect(() => {
        if (!currentUserId) return;

        const resultsKey = getSemanticResultsKey();
        const paginationKey = getSemanticPaginationKey();

        if (!resultsKey || !paginationKey) return;

        const storedResults = sessionStorage.getItem(resultsKey);
        const storedPagination = sessionStorage.getItem(paginationKey);

        if (storedResults && storedPagination) {
            try {
                setSemanticResults(JSON.parse(storedResults));
                const pagination = JSON.parse(storedPagination);
                setCurrentPage(pagination.page);
                setTotalResults(pagination.total);
                setTotalPages(pagination.totalPages);
                setCurrentQuery(pagination.query);
                setSearchMode('semantic');
            } catch (e) {
                console.error('Failed to restore semantic search state', e);
            }
        }
    }, [currentUserId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || isRunning || isSearching) return;

        setError(null);
        setSelectedHistoryId(null);
        localStorage.setItem('agent_last_query', query.trim());

        // Clear preserved state on new search (user-specific)
        const resultsKey = getSemanticResultsKey();
        const paginationKey = getSemanticPaginationKey();
        if (resultsKey) sessionStorage.removeItem(resultsKey);
        if (paginationKey) sessionStorage.removeItem(paginationKey);

        if (searchMode === 'semantic') {
            // Semantic search mode
            setIsSearching(true);
            setSemanticResults([]);
            setSession(null);
            setCurrentQuery(query.trim());
            setCurrentPage(1);

            try {
                console.log(`[AgentChat] Performing semantic search: "${query}"`);
                const response = await semanticSearchIdeas(query.trim(), embeddingProvider, 1, 20, 0.3);
                setSemanticResults(response.results);
                setTotalPages(response.pagination.totalPages);
                setTotalResults(response.pagination.totalResults);
                console.log(`[AgentChat] Found ${response.pagination.totalResults} similar ideas (showing page ${response.pagination.currentPage})`);
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
        // Clear user-specific semantic search data
        const resultsKey = getSemanticResultsKey();
        const paginationKey = getSemanticPaginationKey();
        if (resultsKey) sessionStorage.removeItem(resultsKey);
        if (paginationKey) sessionStorage.removeItem(paginationKey);
    };

    const handleClearQuery = () => {
        setQuery('');
        localStorage.removeItem('agent_last_query');
    };

    const handleNextPage = async () => {
        if (currentPage >= totalPages) return;

        setIsSearching(true);
        try {
            const response = await semanticSearchIdeas(currentQuery, embeddingProvider, currentPage + 1, 20, 0.3);
            setSemanticResults(response.results);
            setCurrentPage(response.pagination.currentPage);
            console.log(`[AgentChat] Loaded page ${response.pagination.currentPage} of ${totalPages}`);
        } catch (err: any) {
            setError(err.message || 'Failed to load next page');
        } finally {
            setIsSearching(false);
        }
    };

    const handlePreviousPage = async () => {
        if (currentPage <= 1) return;

        setIsSearching(true);
        try {
            const response = await semanticSearchIdeas(currentQuery, embeddingProvider, currentPage - 1, 20, 0.3);
            setSemanticResults(response.results);
            setCurrentPage(response.pagination.currentPage);
            console.log(`[AgentChat] Loaded page ${response.pagination.currentPage} of ${totalPages}`);
        } catch (err: any) {
            setError(err.message || 'Failed to load previous page');
        } finally {
            setIsSearching(false);
        }
    };


    const handleViewHistoryItem = (item: AgentHistoryItem) => {
        // MODAL FIX: Open modal instead of replacing main view
        setSelectedHistoryItem(item);
        setShowHistoryModal(true);
        console.log('[AgentChat] Opening history modal for item:', item.id);
    };

    const handleClearHistory = async () => {
        if (confirm('Are you sure you want to clear all search history?')) {
            try {
                await clearAgentHistory();
                setSearchHistory([]);
                console.log('[AgentChat] Search history cleared');
            } catch (err) {
                console.error('[AgentChat] Failed to clear history:', err);
            }
        }
    };

    const handleQuestionsGenerated = (questions: string[]) => {
        console.log(`[AgentChat] Received ${questions.length} suggested questions`);
        setSuggestedQuestions(questions);
    };

    const handleNavigate = (ideaId: string) => {
        // Preserve current search state before navigating (user-specific)
        if (semanticResults.length > 0 && currentUserId) {
            const resultsKey = getSemanticResultsKey();
            const paginationKey = getSemanticPaginationKey();
            if (resultsKey && paginationKey) {
                sessionStorage.setItem(resultsKey, JSON.stringify(semanticResults));
                sessionStorage.setItem(paginationKey, JSON.stringify({
                    page: currentPage,
                    total: totalResults,
                    totalPages: totalPages,
                    query: currentQuery
                }));
            }
        }
        if (onNavigateToIdea) onNavigateToIdea(ideaId);
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
                    <h3 className="text-lg font-semibold text-slate-800">
                        Similar Ideas ({totalResults} total)
                    </h3>
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-slate-600">
                            Page {currentPage} of {totalPages}
                        </div>
                        <button onClick={handleReset} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                            <RefreshCcw className="h-3 w-3" /> New Search
                        </button>
                    </div>
                </div>
                <div className="grid gap-4">
                    {semanticResults.map((idea) => (
                        <div
                            key={idea.id}
                            className="bg-white border border-slate-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer"
                            onClick={() => handleNavigate(idea.id)}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <h4 className="font-semibold text-slate-900 mb-2">
                                        {idea.title}
                                    </h4>
                                    <p className="text-sm text-slate-600 line-clamp-2 mb-3">
                                        {idea.description}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {idea.team && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                {idea.team}
                                            </span>
                                        )}
                                        {idea.category && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                                {idea.category}
                                            </span>
                                        )}
                                        {idea.status && (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                {idea.status}
                                            </span>
                                        )}
                                        {idea.tags && idea.tags.length > 0 && idea.tags.map((tag, idx) => (
                                            <span
                                                key={idx}
                                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-full">
                                        <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                                        <span className="text-sm font-medium text-indigo-700">
                                            {(idea.similarity * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                    {idea.createdAt && (
                                        <span className="text-xs text-slate-500">
                                            {new Date(idea.createdAt).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
                        <button
                            onClick={handlePreviousPage}
                            disabled={currentPage <= 1 || isSearching}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${currentPage <= 1 || isSearching
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                }`}
                        >
                            <ChevronUp className="h-4 w-4 rotate-[-90deg]" />
                            Previous
                        </button>
                        <div className="text-sm text-slate-600">
                            Showing {((currentPage - 1) * 20) + 1}-{Math.min(currentPage * 20, totalResults)} of {totalResults}
                        </div>
                        <button
                            onClick={handleNextPage}
                            disabled={currentPage >= totalPages || isSearching}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${currentPage >= totalPages || isSearching
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                }`}
                        >
                            Next
                            <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                        </button>
                    </div>
                )}
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
                                        <p className="text-xs text-slate-500 mt-1">{formatTimestamp(item.timestamp)}</p>
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
                                className="text-left p-4 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm border border-indigo-200 h-full"
                            >
                                {question}
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
                                <option value="grok">OpenRouter</option>
                                <option value="llama">Llama (Local)</option>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {['What are the latest trends in AI for healthcare?', 'Show me innovations related to customer service automation', 'What AI solutions are we building for retail?', 'How can we use AI to improve operational efficiency?'].map((example, index) => (
                            <button key={index} onClick={() => setQuery(example)} className="text-left p-4 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-sm text-slate-700 h-full">{example}</button>
                        ))}
                    </div>
                </div>
            )}

            {/* History Detail Modal */}
            {showHistoryModal && selectedHistoryItem && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowHistoryModal(false)}>
                    <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-200">
                            <div className="flex-1 min-w-0">
                                <h2 className="text-xl font-bold text-slate-900 truncate">{selectedHistoryItem.query}</h2>
                                <p className="text-sm text-slate-500 mt-1">
                                    {new Date(selectedHistoryItem.created_at).toLocaleString()}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowHistoryModal(false)}
                                className="ml-4 p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                aria-label="Close modal"
                            >
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
                            {selectedHistoryItem.session?.status === 'completed' && selectedHistoryItem.session?.result ? (
                                <div className="space-y-6">
                                    {/* Answer Section */}
                                    <div>
                                        <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                                            <Bot className="h-5 w-5 text-indigo-600" />
                                            Answer
                                        </h3>
                                        <div className="bg-slate-50 rounded-lg p-4">
                                            <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                {selectedHistoryItem.session.result.answer}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Citations Section */}
                                    {selectedHistoryItem.session.result.citations && selectedHistoryItem.session.result.citations.length > 0 && (
                                        <div>
                                            <h3 className="font-semibold text-slate-900 mb-3">Citations</h3>
                                            <CitationDisplay citations={selectedHistoryItem.session.result.citations} />
                                        </div>
                                    )}

                                    {/* Reasoning Section */}
                                    {selectedHistoryItem.session.result.reasoning && (
                                        <div>
                                            <button
                                                onClick={() => setShowReasoning(!showReasoning)}
                                                className="font-semibold text-slate-900 mb-3 flex items-center gap-2 hover:text-indigo-600 transition-colors"
                                            >
                                                {showReasoning ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                View Reasoning Process
                                            </button>
                                            {showReasoning && (
                                                <div className="bg-slate-50 rounded-lg p-4">
                                                    <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono">
                                                        {selectedHistoryItem.session.result.reasoning}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-slate-500">
                                    <p>Session status: {selectedHistoryItem.session?.status || 'Unknown'}</p>
                                    {selectedHistoryItem.session?.error && (
                                        <p className="text-red-600 mt-2">{selectedHistoryItem.session.error}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AgentChat;
