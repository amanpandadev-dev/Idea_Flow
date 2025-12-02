import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Bot, ChevronDown, ChevronUp, Sparkles, StopCircle, RefreshCcw, History, Trash2, X, Search, MessageSquare } from 'lucide-react';
import { startAgentSession, getAgentSessionStatus, stopAgentSession, semanticSearchIdeas, type AgentSession, type SemanticSearchResult } from '../services';
import CitationDisplay from './CitationDisplay';
import DocumentUpload from './DocumentUpload';

const SESSION_STORAGE_KEY = 'agent_session_job_id';
const HISTORY_STORAGE_KEY = 'agent_search_history';

interface AgentChatProps {
    onNavigateToIdea?: (ideaId: string) => void;
}

interface SearchHistoryItem {
    id: string;
    query: string;
    timestamp: number;
    session: AgentSession;
}

type SearchMode = 'agent' | 'semantic';

const AgentChat: React.FC<AgentChatProps> = ({ onNavigateToIdea }) => {
    const [query, setQuery] = useState('');
    const [jobId, setJobId] = useState<string | null>(null);
    const [session, setSession] = useState<AgentSession | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showReasoning, setShowReasoning] = useState(false);
    const [embeddingProvider, setEmbeddingProvider] = useState<'llama' | 'grok'>('grok');
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
    const [searchMode, setSearchMode] = useState<SearchMode>('agent');
    const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);

    const pollingInterval = useRef<NodeJS.Timeout | null>(null);

    const isRunning = session?.status === 'running' || session?.status === 'queued' || session?.status === 'starting';

    // Load search history from localStorage on mount
    useEffect(() => {
        const loadHistory = () => {
            try {
                const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
                if (stored) {
                    const history: SearchHistoryItem[] = JSON.parse(stored);
                    setSearchHistory(history);
                    console.log(`[AgentChat] Loaded ${history.length} items from search history`);
                }
            } catch (err) {
                console.error('[AgentChat] Failed to load search history:', err);
            }
        };
        loadHistory();
    }, []);

    // Save search history to localStorage whenever it changes
    useEffect(() => {
        if (searchHistory.length > 0) {
            try {
                localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(searchHistory));
                console.log(`[AgentChat] Saved ${searchHistory.length} items to search history`);
            } catch (err) {
                console.error('[AgentChat] Failed to save search history:', err);
            }
        }
    }, [searchHistory]);

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
                        if (status.status === 'completed' && status.result) {
                            const historyItem: SearchHistoryItem = {
                                id: jobId,
                                query: status.query,
                                timestamp: Date.now(),
                                session: status
                            };
                            setSearchHistory(prev => [historyItem, ...prev].slice(0, 20));
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

                        if (status.status === 'completed' && status.result) {
                            const exists = searchHistory.some(item => item.id === storedJobId);
                            if (!exists) {
                                const historyItem: SearchHistoryItem = {
                                    id: storedJobId,
                                    query: status.query,
                                    timestamp: Date.now(),
                                    session: status
                                };
                                setSearchHistory(prev => [historyItem, ...prev].slice(0, 20));
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
                const results = await semanticSearchIdeas(query.trim(), embeddingProvider, 10);
                setSemanticResults(results);
                console.log(`[AgentChat] Found ${results.length} similar ideas`);
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

    const handleViewHistoryItem = (item: SearchHistoryItem) => {
        setSession(item.session);
        setQuery(item.query);
        setSelectedHistoryId(item.id);
        setShowHistory(false);
        setShowReasoning(false);
        setSearchMode('agent');
        setSemanticResults([]);
    };

    const handleClearHistory = () => {
        if (confirm('Are you sure you want to clear all search history?')) {
            setSearchHistory([]);
            localStorage.removeItem(HISTORY_STORAGE_KEY);
            console.log('[AgentChat] Search history cleared');
        }
    };

    const handleQuestionsGenerated = (questions: string[]) => {
        console.log(`[AgentChat] Received ${questions.length} suggested questions`);
        setSuggestedQuestions(questions);
    };

    const handleNavigate = (ideaId: string) => {
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
                    <h3 className="font-semibold text-slate-900">Found {semanticResults.length} Similar Ideas</h3>
                    <button onClick={handleReset} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                        <RefreshCcw className="h-3 w-3" /> New Search
                    </button>
                </div>
                <div className="grid gap-3">
                    {semanticResults.map((idea) => (
                        <div key={idea.id} className="bg-white rounded-lg border border-slate-200 p-4 hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => handleNavigate(idea.id)}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-slate-900 mb-1">{idea.title}</h4>
                                    <p className="text-sm text-slate-600 line-clamp-2 mb-2">{idea.description}</p>
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="text-slate-500">{idea.team}</span>
                                        {idea.tags && idea.tags.length > 0 && (
                                            <>
                                                <span className="text-slate-300">•</span>
                                                <div className="flex gap-1">
                                                    {idea.tags.slice(0, 3).map((tag, idx) => (
                                                        <span key={idx} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded">{tag}</span>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <div className="px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded">
                                        {(idea.similarity * 100).toFixed(0)}% match
                                    </div>
                                    <span className="text-xs text-slate-400">{new Date(idea.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    ))}
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
                    <div className="flex flex-wrap gap-2">
                        {suggestedQuestions.map((question, idx) => (
                            <button
                                key={idx}
                                onClick={() => setQuery(question)}
                                className="text-left px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm border border-indigo-200"
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
                                <option value="grok">Grok (OpenRouter)</option>
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
