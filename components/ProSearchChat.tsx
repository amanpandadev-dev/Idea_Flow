import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Sparkles, X, Filter, TrendingUp, Calendar, Code, Building2, Compass, PanelLeftClose, PanelLeft } from 'lucide-react';
import type { Idea } from '../types';
import ExploreModal, { ExploreFilters } from './ExploreModal';
import ChatHistorySidebar from './ChatHistorySidebar';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    metadata?: {
        results?: Idea[];
        searchMetadata?: SearchMetadata;
        resultsCount?: number;
    };
}

interface SearchMetadata {
    intent: string;
    filters: {
        domain?: string;
        businessGroup?: string;
        techStack?: string[];
        year?: number;
        buildPhase?: string;
        buildPreference?: string;
        scalability?: string;
        novelty?: string;
        participationWeek?: number;
        timeline?: string;
    };
    sortBy?: string;
    sortOrder?: string;
    totalResults: number;
}

interface ProSearchChatProps {
    onNavigateToIdea?: (idea: Idea) => void;
    availableTechnologies?: string[];
    availableThemes?: string[];
    availableBusinessGroups?: string[];
    userId?: string;
}

const ProSearchChat: React.FC<ProSearchChatProps> = ({
    onNavigateToIdea,
    availableTechnologies = [],
    availableThemes = [],
    availableBusinessGroups = [],
    userId = 'anonymous'
}) => {
    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [results, setResults] = useState<Idea[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [metadata, setMetadata] = useState<SearchMetadata | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeResultMessageId, setActiveResultMessageId] = useState<string | null>(null);
    const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

    // Fun loading messages that rotate while searching
    const loadingMessages = [
        "🔍 Searching through ideas...",
        "🧠 Analyzing your query...",
        "⚡ Processing with AI magic...",
        "📊 Matching relevant results...",
        "🎯 Almost there...",
        "✨ Preparing your results...",
        "🚀 Just a moment...",
        "💡 Finding the best matches...",
        "🔮 Working on it...",
        "📚 Scanning the database..."
    ];

    // Chat History State
    const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
    const [showSidebar, setShowSidebar] = useState(true);

    // Explore Modal State
    const [isExploreOpen, setIsExploreOpen] = useState(false);
    const [exploreFilters, setExploreFilters] = useState<ExploreFilters>({
        themes: [],
        businessGroups: [],
        technologies: []
    });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Rotate loading messages while searching
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isSearching) {
            setLoadingMessageIndex(0);
            interval = setInterval(() => {
                setLoadingMessageIndex(prev => (prev + 1) % loadingMessages.length);
            }, 2000); // Change message every 2 seconds
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isSearching, loadingMessages.length]);

    // Initialize with welcome message
    const initializeNewChat = () => {
        setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: 'Hello! I can help you find ideas using natural language. Try queries like "latest blockchain ideas", "filter by healthcare", or "show React projects from 2024".',
            timestamp: new Date().toISOString()
        }]);
        setSuggestions([
            'Show me latest ideas',
            'Find blockchain projects',
            'Filter by healthcare domain',
            'React projects from 2024'
        ]);
        setResults([]);
        setMetadata(null);
        setCurrentSessionId(null);
        setActiveResultMessageId(null);
    };

    useEffect(() => {
        initializeNewChat();
    }, []);

    // Create a new session when first message is sent
    const createSession = async (): Promise<number | null> => {
        try {
            const response = await fetch('/api/chat/sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId
                },
                body: JSON.stringify({ title: 'New Chat' })
            });
            if (response.ok) {
                const data = await response.json();
                return data.session.id;
            }
        } catch (err) {
            console.error('Failed to create session:', err);
        }
        return null;
    };

    // Save message to session
    const saveMessage = async (sessionId: number, role: string, content: string, metadata?: any) => {
        try {
            await fetch(`/api/chat/sessions/${sessionId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId
                },
                body: JSON.stringify({ role, content, metadata })
            });
        } catch (err) {
            console.error('Failed to save message:', err);
        }
    };

    // Load session messages and restore search results with metadata
    const loadSession = async (sessionId: number) => {
        try {
            const response = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
                headers: { 'x-user-id': userId }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.messages.length > 0) {
                    // Map messages and preserve metadata for assistant messages with results
                    const loadedMessages = data.messages.map((msg: any) => ({
                        id: `msg_${msg.id}`,
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp,
                        metadata: msg.role === 'assistant' && msg.metadata ? {
                            results: msg.metadata.results || [],
                            searchMetadata: msg.metadata.searchMetadata || null,
                            resultsCount: msg.metadata.resultsCount || 0
                        } : undefined
                    }));
                    
                    setMessages(loadedMessages);
                    
                    // Find the last assistant message with results metadata and show those results
                    const lastAssistantMsg = [...data.messages]
                        .reverse()
                        .find((msg: any) => msg.role === 'assistant' && msg.metadata?.results?.length > 0);
                    
                    if (lastAssistantMsg?.metadata?.results) {
                        setResults(lastAssistantMsg.metadata.results);
                        setMetadata(lastAssistantMsg.metadata.searchMetadata || null);
                        // Find the message ID for the last assistant message with results
                        const lastMsgWithResults = loadedMessages.find(
                            (m: Message) => m.role === 'assistant' && m.metadata?.results?.length > 0
                        );
                        setActiveResultMessageId(lastMsgWithResults?.id || null);
                    } else {
                        setResults([]);
                        setMetadata(null);
                        setActiveResultMessageId(null);
                    }
                } else {
                    // Empty session, show welcome
                    setMessages([{
                        id: 'welcome',
                        role: 'assistant',
                        content: 'Continue your conversation or start fresh!',
                        timestamp: new Date().toISOString()
                    }]);
                    setResults([]);
                    setMetadata(null);
                }
                setCurrentSessionId(sessionId);
            }
        } catch (err) {
            console.error('Failed to load session:', err);
        }
    };

    // Show results for a specific message when clicked
    const handleMessageClick = (message: Message) => {
        if (message.role === 'assistant' && message.metadata?.results && message.metadata.results.length > 0) {
            setResults(message.metadata.results);
            setMetadata(message.metadata.searchMetadata || null);
            setActiveResultMessageId(message.id);
        }
    };

    const handleSearch = async (searchQuery: string) => {
        if (!searchQuery.trim() || isSearching) return;

        // Create session if needed
        let sessionId = currentSessionId;
        if (!sessionId) {
            sessionId = await createSession();
            if (sessionId) {
                setCurrentSessionId(sessionId);
            }
        }

        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: searchQuery,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage]);
        setQuery('');
        setIsSearching(true);
        setError(null);

        // Save user message
        if (sessionId) {
            saveMessage(sessionId, 'user', searchQuery);
        }

        try {
            const mappedFilters: any = {};
            if (exploreFilters.technologies.length > 0) mappedFilters.techStack = exploreFilters.technologies;
            if (exploreFilters.businessGroups.length > 0) mappedFilters.businessGroup = exploreFilters.businessGroups;
            if (exploreFilters.themes.length > 0) mappedFilters.domain = exploreFilters.themes;

            const response = await fetch('/api/search/conversational', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    query: searchQuery,
                    additionalFilters: mappedFilters
                })
            });

            if (!response.ok) throw new Error('Search failed');

            const data = await response.json();

            const searchResults = data.results || [];
            const searchMeta = data.metadata || null;
            
            const aiMessage: Message = {
                id: `ai_${Date.now()}`,
                role: 'assistant',
                content: data.aiResponse || `Found ${searchResults.length} results`,
                timestamp: new Date().toISOString(),
                metadata: {
                    results: searchResults,
                    searchMetadata: searchMeta,
                    resultsCount: searchResults.length
                }
            };

            setMessages(prev => [...prev, aiMessage]);
            setResults(searchResults);
            setSuggestions(data.suggestions || []);
            setMetadata(searchMeta);
            setActiveResultMessageId(aiMessage.id);

            // Save AI response with results for later retrieval
            if (sessionId) {
                saveMessage(sessionId, 'assistant', aiMessage.content, {
                    resultsCount: searchResults.length,
                    filters: searchMeta?.filters,
                    results: searchResults, // Store results for session restore
                    searchMetadata: searchMeta
                });
            }

        } catch (err: any) {
            setError(err.message || 'Search failed');
            const errorMessage: Message = {
                id: `error_${Date.now()}`,
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please try again.',
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSearch(query);
    };

    const handleSuggestionClick = (suggestion: string) => {
        handleSearch(suggestion);
    };

    const handleNewChat = () => {
        initializeNewChat();
        setExploreFilters({ themes: [], businessGroups: [], technologies: [] });
    };

    const handleSelectSession = (sessionId: number) => {
        loadSession(sessionId);
    };

    const handleDeleteSession = (sessionId: number) => {
        if (currentSessionId === sessionId) {
            initializeNewChat();
        }
    };

    const handleClearChat = () => {
        handleNewChat();
    };

    const handleExploreApply = (filters: ExploreFilters) => {
        setExploreFilters(filters);
        if (query.trim()) {
            handleSearch(query);
        } else {
            setMessages(prev => [...prev, {
                id: `sys_${Date.now()}`,
                role: 'assistant',
                content: `Filters applied: ${filters.themes.length + filters.businessGroups.length + filters.technologies.length} active. Type a query to search with these filters.`,
                timestamp: new Date().toISOString()
            }]);
        }
    };

    const activeFilterCount = exploreFilters.themes.length + exploreFilters.businessGroups.length + exploreFilters.technologies.length;

    return (
        <div className="flex h-full bg-gradient-to-br from-slate-50 to-blue-50">
            {/* Chat History Sidebar */}
            {showSidebar && (
                <ChatHistorySidebar
                    currentSessionId={currentSessionId}
                    onSelectSession={handleSelectSession}
                    onNewChat={handleNewChat}
                    onDeleteSession={handleDeleteSession}
                    userId={userId}
                />
            )}

            {/* LEFT SIDE - CHAT */}
            <div className={`${showSidebar ? 'w-2/5' : 'w-1/2'} flex flex-col border-r border-slate-200 bg-white shadow-lg transition-all`}>
                {/* Chat Header */}
                <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-purple-600">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowSidebar(!showSidebar)}
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                                title={showSidebar ? 'Hide history' : 'Show history'}
                            >
                                {showSidebar ? (
                                    <PanelLeftClose className="w-4 h-4 text-white" />
                                ) : (
                                    <PanelLeft className="w-4 h-4 text-white" />
                                )}
                            </button>
                            <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                                <Sparkles className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-white">Pro Search</h2>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setIsExploreOpen(true)}
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors relative"
                                title="Explore Filters"
                            >
                                <Compass className="w-4 h-4 text-white" />
                                {activeFilterCount > 0 && (
                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-blue-600" />
                                )}
                            </button>
                            <button
                                onClick={handleClearChat}
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                                title="Clear chat"
                            >
                                <X className="w-4 h-4 text-white" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Chat Messages */}
                <div
                    ref={chatContainerRef}
                    className="flex-1 overflow-y-auto p-4 space-y-4"
                    style={{ maxHeight: 'calc(100vh - 280px)' }}
                >
                    {messages.map((message) => {
                        const hasResults = message.role === 'assistant' && message.metadata?.results && message.metadata.results.length > 0;
                        const isActiveResult = hasResults && activeResultMessageId === message.id;
                        
                        return (
                            <div
                                key={message.id}
                                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    onClick={() => hasResults && handleMessageClick(message)}
                                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.role === 'user'
                                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                                        : hasResults 
                                            ? `bg-slate-100 text-slate-800 cursor-pointer hover:bg-slate-200 transition-colors ${isActiveResult ? 'ring-2 ring-blue-500' : ''}`
                                            : 'bg-slate-100 text-slate-800'
                                    }`}
                                >
                                    <p className="text-sm leading-relaxed">{message.content}</p>
                                    <div className={`flex items-center justify-between mt-1 ${message.role === 'user' ? 'text-blue-100' : 'text-slate-500'}`}>
                                        <p className="text-xs">
                                            {new Date(message.timestamp).toLocaleTimeString()}
                                        </p>
                                        {hasResults && (
                                            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full ml-2">
                                                {message.metadata?.resultsCount || message.metadata?.results?.length} results • Click to view
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {isSearching && (
                        <div className="flex justify-start">
                            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl px-4 py-3 border border-blue-100 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                        <div className="absolute inset-0 w-5 h-5 animate-ping opacity-20 bg-blue-500 rounded-full" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-700 transition-all duration-300">
                                            {loadingMessages[loadingMessageIndex]}
                                        </p>
                                        <div className="flex gap-1 mt-1">
                                            {[0, 1, 2].map((i) => (
                                                <div
                                                    key={i}
                                                    className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
                                                    style={{ animationDelay: `${i * 0.15}s` }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Suggestions */}
                {suggestions.length > 0 && (
                    <div className="px-4 py-2 border-t border-slate-200 bg-slate-50">
                        <p className="text-xs font-medium text-slate-600 mb-1.5">Suggestions:</p>
                        <div className="flex flex-wrap gap-1.5">
                            {suggestions.map((suggestion, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSuggestionClick(suggestion)}
                                    className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-full hover:border-blue-400 hover:bg-blue-50 transition-all"
                                    disabled={isSearching}
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input Form */}
                <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 bg-white">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Ask me anything..."
                            className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            disabled={isSearching}
                        />
                        <button
                            type="submit"
                            disabled={!query.trim() || isSearching}
                            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
                        >
                            {isSearching ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Send className="w-5 h-5" />
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* RIGHT SIDE - RESULTS */}
            <div className={`${showSidebar ? 'w-3/5' : 'w-1/2'} flex flex-col bg-slate-50 transition-all`}>
                {/* Results Header */}
                <div className="px-6 py-4 bg-white border-b border-slate-200">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">
                                Search Results {results.length > 0 && `(${results.length})`}
                            </h3>
                            {metadata && (
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    {metadata.filters.domain && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                                            <Filter className="w-3 h-3" />
                                            {metadata.filters.domain}
                                        </span>
                                    )}
                                    {metadata.filters.businessGroup && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                                            <Building2 className="w-3 h-3" />
                                            {metadata.filters.businessGroup}
                                        </span>
                                    )}
                                    {metadata.filters.techStack && metadata.filters.techStack.length > 0 && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                                            <Code className="w-3 h-3" />
                                            {metadata.filters.techStack.join(', ')}
                                        </span>
                                    )}
                                    {metadata.filters.year && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">
                                            <Calendar className="w-3 h-3" />
                                            {metadata.filters.year}
                                        </span>
                                    )}
                                    {metadata.sortBy && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-xs">
                                            <TrendingUp className="w-3 h-3" />
                                            {metadata.sortBy}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Results Grid */}
                <div className="flex-1 overflow-y-auto p-6">
                    {results.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <Sparkles className="w-16 h-16 text-slate-300 mb-4" />
                            <p className="text-slate-500 text-lg">Start a conversation to see results</p>
                            <p className="text-slate-400 text-sm mt-2">Try asking for "latest ideas" or "blockchain projects"</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {results.map((idea, index) => {
                                // Safely handle technologies - could be string or array
                                const techs = idea.technologies as string | string[] | undefined;
                                const techArray: string[] = Array.isArray(techs) 
                                    ? techs 
                                    : (typeof techs === 'string' && techs)
                                        ? techs.split(',').map(t => t.trim()).filter(Boolean)
                                        : [];
                                
                                return (
                                    <div
                                        key={idea.id || `result-${index}`}
                                        className="bg-white rounded-xl p-5 border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer group"
                                        onClick={() => onNavigateToIdea?.(idea)}
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                                                    {idea.title || 'Untitled'}
                                                </h4>
                                                <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                                                    {idea.description || 'No description available'}
                                                </p>
                                            </div>
                                            {idea.matchScore && idea.matchScore > 0 && (
                                                <div className="ml-4 flex-shrink-0">
                                                    <div className="px-3 py-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full text-xs font-bold">
                                                        {idea.matchScore}% Match
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap">
                                            {idea.domain && (
                                                <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                                                    {idea.domain}
                                                </span>
                                            )}
                                            {idea.businessGroup && (
                                                <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                                                    {idea.businessGroup}
                                                </span>
                                            )}
                                            {techArray.slice(0, 2).map((tech, idx) => (
                                                <span key={idx} className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs">
                                                    {tech}
                                                </span>
                                            ))}
                                            {idea.submissionDate && (
                                                <span className="text-xs text-slate-400 ml-auto">
                                                    {new Date(idea.submissionDate).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Explore Modal */}
            <ExploreModal
                isOpen={isExploreOpen}
                onClose={() => setIsExploreOpen(false)}
                onApplyFilters={handleExploreApply}
                initialFilters={exploreFilters}
                availableTechnologies={availableTechnologies}
                availableThemes={availableThemes}
                availableBusinessGroups={availableBusinessGroups}
            />
        </div>
    );
};

export default ProSearchChat;
