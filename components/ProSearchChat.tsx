import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Sparkles, X, Filter, TrendingUp, Calendar, Code, Building2, Compass, PanelLeftClose, PanelLeft, Trash2, Bookmark, Edit2 } from 'lucide-react';
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
    isVisible?: boolean;
}

// Session storage key for persisting chat state
const CHAT_STATE_KEY = 'prosearch_chat_state';

const ProSearchChat: React.FC<ProSearchChatProps> = ({
    onNavigateToIdea,
    availableTechnologies = [],
    availableThemes = [],
    availableBusinessGroups = [],
    userId = 'anonymous',
    isVisible = true
}) => {
    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [results, setResults] = useState<Idea[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [metadata, setMetadata] = useState<SearchMetadata | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeResultMessageId, setActiveResultMessageId] = useState<string | null>(null);
    const [hasInitialized, setHasInitialized] = useState(false);
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
    
    // Last Query State - allows filter refinement without retyping
    const [lastQuery, setLastQuery] = useState<string>('');

    // Explore Modal State
    const [isExploreOpen, setIsExploreOpen] = useState(false);
    const [exploreFilters, setExploreFilters] = useState<ExploreFilters>({
        themes: [],
        businessGroups: [],
        technologies: []
    });

    // Context Management State
    const [savedContext, setSavedContext] = useState<any>(null);
    const [contextLoading, setContextLoading] = useState(false);
    const [contextMessage, setContextMessage] = useState<string>('');

    // Tagging State (Local for now)
    const [taggedIdeas, setTaggedIdeas] = useState<Set<string>>(new Set());

    // Resizable Panels State
    const [sidebarWidth, setSidebarWidth] = useState(260);
    const [chatWidth, setChatWidth] = useState(450); // px
    const [isResizing, setIsResizing] = useState<'sidebar' | 'chat' | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Resize Handlers
    const startResizing = (type: 'sidebar' | 'chat') => {
        setIsResizing(type);
    };

    const stopResizing = () => {
        setIsResizing(null);
    };

    const handleResize = (e: MouseEvent) => {
        if (!isResizing || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();

        if (isResizing === 'sidebar') {
            const newWidth = e.clientX - containerRect.left;
            if (newWidth >= 150 && newWidth <= 500) {
                setSidebarWidth(newWidth);
            }
        } else if (isResizing === 'chat') {
            // Chat width = Mouse X - Sidebar Width (if visible)
            const sidebarOffset = showSidebar ? sidebarWidth : 0;
            const newWidth = e.clientX - containerRect.left - sidebarOffset;
            if (newWidth >= 300 && newWidth <= 800) {
                setChatWidth(newWidth);
            }
        }
    };

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', handleResize);
            window.addEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', handleResize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, sidebarWidth, showSidebar]);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handlers for Interactive Features
    const handleEditMessage = (content: string) => {
        setQuery(content);
        // Focus input logic could go here if ref was exposed
    };

    const handleToggleTag = (ideaId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setTaggedIdeas(prev => {
            const next = new Set(prev);
            if (next.has(ideaId)) next.delete(ideaId);
            else next.add(ideaId);
            return next;
        });
    };

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
        // Clear saved state when starting new chat
        try {
            sessionStorage.removeItem(CHAT_STATE_KEY);
        } catch (e) {
            // Ignore storage errors
        }
    };

    // Save chat state to sessionStorage whenever it changes
    useEffect(() => {
        if (!hasInitialized) return;
        
        // Only save if we have meaningful state (not just welcome message)
        if (messages.length > 1 || results.length > 0) {
            try {
                const stateToSave = {
                    messages,
                    results,
                    suggestions,
                    metadata,
                    currentSessionId,
                    activeResultMessageId,
                    lastQuery,
                    exploreFilters
                };
                sessionStorage.setItem(CHAT_STATE_KEY, JSON.stringify(stateToSave));
            } catch (e) {
                console.warn('[ProSearchChat] Failed to save state to sessionStorage:', e);
            }
        }
    }, [messages, results, suggestions, metadata, currentSessionId, activeResultMessageId, lastQuery, exploreFilters, hasInitialized]);

    // Restore state from sessionStorage on mount
    useEffect(() => {
        try {
            const savedState = sessionStorage.getItem(CHAT_STATE_KEY);
            if (savedState) {
                const parsed = JSON.parse(savedState);
                if (parsed.messages && parsed.messages.length > 0) {
                    setMessages(parsed.messages);
                    setResults(parsed.results || []);
                    setSuggestions(parsed.suggestions || []);
                    setMetadata(parsed.metadata || null);
                    setCurrentSessionId(parsed.currentSessionId || null);
                    setActiveResultMessageId(parsed.activeResultMessageId || null);
                    setLastQuery(parsed.lastQuery || '');
                    if (parsed.exploreFilters) {
                        setExploreFilters(parsed.exploreFilters);
                    }
                    setHasInitialized(true);
                    console.log('[ProSearchChat] Restored state from sessionStorage');
                    return;
                }
            }
        } catch (e) {
            console.warn('[ProSearchChat] Failed to restore state from sessionStorage:', e);
        }
        
        // No saved state, initialize new chat
        initializeNewChat();
        setHasInitialized(true);
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

    // Context Management Functions
    // Auto-save context silently after each search
    const autoSaveContext = async (searchQuery: string, searchFilters: any) => {
        try {
            const effectiveFilters = { ...exploreFilters };
            
            // Merge search filters
            if (searchFilters) {
                if (searchFilters.domain && !effectiveFilters.themes.includes(searchFilters.domain)) {
                    effectiveFilters.themes = [...effectiveFilters.themes, searchFilters.domain];
                }
                if (searchFilters.businessGroup && !effectiveFilters.businessGroups.includes(searchFilters.businessGroup)) {
                    effectiveFilters.businessGroups = [...effectiveFilters.businessGroups, searchFilters.businessGroup];
                }
                if (searchFilters.techStack?.length > 0) {
                    const newTechs = searchFilters.techStack.filter((t: string) => !effectiveFilters.technologies.includes(t));
                    effectiveFilters.technologies = [...effectiveFilters.technologies, ...newTechs];
                }
                if (searchFilters.year && !effectiveFilters.year) {
                    effectiveFilters.year = searchFilters.year;
                }
            }

            await fetch('/api/search/context/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    filters: effectiveFilters,
                    query: searchQuery,
                    minSimilarity: 30,
                    pagination: { page: 1, limit: 20 }
                })
            });
            
            // Update local state
            setSavedContext({
                filters: effectiveFilters,
                query: searchQuery,
                savedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Auto-save context error:', error);
        }
    };

    const saveContext = async () => {
        setContextLoading(true);
        setContextMessage('');

        // Merge explicit filters with implicit NLP filters from metadata
        const effectiveFilters = { ...exploreFilters };

        if (metadata?.filters) {
            // Merge Domain (Themes)
            if (metadata.filters.domain && !effectiveFilters.themes.includes(metadata.filters.domain)) {
                effectiveFilters.themes = [...effectiveFilters.themes, metadata.filters.domain];
            }

            // Merge Business Group
            if (metadata.filters.businessGroup && !effectiveFilters.businessGroups.includes(metadata.filters.businessGroup)) {
                effectiveFilters.businessGroups = [...effectiveFilters.businessGroups, metadata.filters.businessGroup];
            }

            // Merge Tech Stack
            if (metadata.filters.techStack && metadata.filters.techStack.length > 0) {
                const newTechs = metadata.filters.techStack.filter(t => !effectiveFilters.technologies.includes(t));
                effectiveFilters.technologies = [...effectiveFilters.technologies, ...newTechs];
            }

            // Capture Year if implicit
            if (metadata.filters.year && !effectiveFilters.year) {
                effectiveFilters.year = metadata.filters.year;
            }
        }

        try {
            const response = await fetch('/api/search/context/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    filters: effectiveFilters,
                    query,
                    minSimilarity: 30,
                    pagination: { page: 1, limit: 20 }
                })
            });

            if (response.ok) {
                const data = await response.json();
                setSavedContext(data.context);
                setContextMessage('✓ Context saved');
                setTimeout(() => setContextMessage(''), 3000);
            } else {
                setContextMessage('✗ Failed to save');
            }
        } catch (error) {
            console.error('Save context error:', error);
            setContextMessage('✗ Error saving');
        } finally {
            setContextLoading(false);
        }
    };

    const clearContext = async () => {
        setContextLoading(true);
        setContextMessage('');

        try {
            const response = await fetch(`/api/search/context/${userId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                setSavedContext(null);
                setExploreFilters({
                    themes: [],
                    businessGroups: [],
                    technologies: [],
                    year: undefined
                });
                setLastQuery(''); // Clear accumulated query context
                setResults([]); // Clear results
                setMetadata(null);
                setContextMessage('✓ Context cleared');
                setTimeout(() => setContextMessage(''), 3000);
            } else {
                setContextMessage('✗ Failed to clear');
            }
        } catch (error) {
            console.error('Clear context error:', error);
            setContextMessage('✗ Error clearing');
        } finally {
            setContextLoading(false);
        }
    };

    const loadContext = async () => {
        try {
            const response = await fetch(`/api/search/context/${userId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.context && data.context.savedAt) {
                    setSavedContext(data.context);
                    if (data.context.filters) {
                        setExploreFilters(data.context.filters);
                    }
                }
            }
        } catch (error) {
            console.error('Load context error:', error);
        }
    };

    // Load context on mount
    useEffect(() => {
        loadContext();
    }, [userId]);

    // Load session messages and restore search results with metadata
    const loadSession = async (sessionId: number) => {
        try {
            console.log(`[ProSearchChat] Loading session ${sessionId}`);
            const response = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
                headers: { 'x-user-id': userId }
            });
            if (response.ok) {
                const data = await response.json();
                console.log(`[ProSearchChat] Received ${data.messages.length} messages`);

                if (data.messages.length > 0) {
                    // Debug: Check which messages have results
                    data.messages.forEach((msg: any, idx: number) => {
                        if (msg.metadata?.results) {
                            console.log(`[ProSearchChat] Message ${idx} has ${msg.metadata.results.length} results`);
                        }
                    });

                    // Map messages and preserve metadata for assistant messages with results
                    const loadedMessages = data.messages.map((msg: any) => ({
                        id: `msg_${msg.id}`,
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp,
                        metadata: msg.role === 'assistant' && msg.metadata ? {
                            results: msg.metadata.results || [],
                            searchMetadata: msg.metadata.searchMetadata || null,
                            resultsCount: msg.metadata.resultsCount || msg.metadata.results?.length || 0
                        } : undefined
                    }));

                    setMessages(loadedMessages);

                    // Find the last assistant message with results metadata and show those results
                    const lastAssistantMsg = [...data.messages]
                        .reverse()
                        .find((msg: any) => msg.role === 'assistant' && msg.metadata?.results?.length > 0);

                    console.log(`[ProSearchChat] Last message with results:`, lastAssistantMsg ? 'found' : 'not found');

                    if (lastAssistantMsg?.metadata?.results) {
                        console.log(`[ProSearchChat] Restoring ${lastAssistantMsg.metadata.results.length} results`);
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

    const handleSearch = async (searchQuery: string, useLastQuery: boolean = false) => {
        // Use lastQuery if useLastQuery is true (for filter refinement)
        const effectiveQuery = useLastQuery && lastQuery ? lastQuery : searchQuery;
        
        if (!effectiveQuery.trim() || isSearching) return;
        
        // Save as lastQuery for future filter refinements
        setLastQuery(effectiveQuery);

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
            content: useLastQuery ? `[Filter refinement] ${effectiveQuery}` : effectiveQuery,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage]);
        setQuery('');
        setIsSearching(true);
        setError(null);

        // Save user message
        if (sessionId) {
            saveMessage(sessionId, 'user', effectiveQuery);
        }

        try {
            const mappedFilters: any = {};
            if (exploreFilters.technologies.length > 0) mappedFilters.techStack = exploreFilters.technologies;
            if (exploreFilters.businessGroups.length > 0) mappedFilters.businessGroup = exploreFilters.businessGroups;
            if (exploreFilters.themes.length > 0) mappedFilters.domain = exploreFilters.themes;
            if (exploreFilters.year) mappedFilters.year = exploreFilters.year;
            if (exploreFilters.challengeOpportunity) mappedFilters.challengeOpportunity = exploreFilters.challengeOpportunity;
            if (exploreFilters.createdFrom) mappedFilters.createdFrom = exploreFilters.createdFrom;
            if (exploreFilters.createdTo) mappedFilters.createdTo = exploreFilters.createdTo;

            const response = await fetch('/api/search/conversational', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    query: effectiveQuery,
                    additionalFilters: mappedFilters,
                    userId: userId,
                    limit: 200  // Increased limit for more results
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

            // Accumulate filters from search results into exploreFilters
            if (searchMeta?.filters) {
                setExploreFilters(prev => {
                    const updated = { ...prev };
                    
                    // Accumulate domain/themes
                    if (searchMeta.filters.domain) {
                        const domains = Array.isArray(searchMeta.filters.domain) 
                            ? searchMeta.filters.domain 
                            : [searchMeta.filters.domain];
                        domains.forEach((d: string) => {
                            if (d && !updated.themes.includes(d)) {
                                updated.themes = [...updated.themes, d];
                            }
                        });
                    }
                    
                    // Accumulate business groups
                    if (searchMeta.filters.businessGroup) {
                        const groups = Array.isArray(searchMeta.filters.businessGroup)
                            ? searchMeta.filters.businessGroup
                            : [searchMeta.filters.businessGroup];
                        groups.forEach((g: string) => {
                            if (g && !updated.businessGroups.includes(g)) {
                                updated.businessGroups = [...updated.businessGroups, g];
                            }
                        });
                    }
                    
                    // Accumulate technologies
                    if (searchMeta.filters.techStack) {
                        const techs = Array.isArray(searchMeta.filters.techStack)
                            ? searchMeta.filters.techStack
                            : [searchMeta.filters.techStack];
                        techs.forEach((t: string) => {
                            if (t && !updated.technologies.includes(t)) {
                                updated.technologies = [...updated.technologies, t];
                            }
                        });
                    }
                    
                    // Set year if detected
                    if (searchMeta.filters.year && !updated.year) {
                        updated.year = searchMeta.filters.year;
                    }
                    
                    return updated;
                });
            }

            // Save AI response with results for later retrieval
            if (sessionId) {
                saveMessage(sessionId, 'assistant', aiMessage.content, {
                    resultsCount: searchResults.length,
                    filters: searchMeta?.filters,
                    results: searchResults, // Store results for session restore
                    searchMetadata: searchMeta
                });
            }

            // Auto-save context after successful search
            autoSaveContext(effectiveQuery, searchMeta?.filters);

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

    // Clear search context/filters on the server
    const handleClearContext = async (filterType: string = 'all') => {
        try {
            const response = await fetch('/api/search/clear-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, filterType })
            });

            if (response.ok) {
                const data = await response.json();
                setMessages(prev => [...prev, {
                    id: `sys_${Date.now()}`,
                    role: 'assistant',
                    content: data.message || 'Context cleared successfully.',
                    timestamp: new Date().toISOString()
                }]);
                setSuggestions(['Show latest ideas', 'AI projects', 'Healthcare innovations']);
            }
        } catch (err) {
            console.error('Failed to clear context:', err);
        }
    };

    const handleExploreApply = async (filters: ExploreFilters) => {
        setExploreFilters(filters);
        
        const filterCount = filters.themes.length + filters.businessGroups.length + filters.technologies.length + (filters.year ? 1 : 0);
        
        // Always trigger a search when filters are applied
        if (lastQuery) {
            // Re-run with lastQuery and new filters
            handleSearch(lastQuery, true);
        } else if (filterCount > 0) {
            // No previous query but filters applied - search with filter description
            const filterDesc = [];
            if (filters.themes.length > 0) filterDesc.push(filters.themes.join(', '));
            if (filters.businessGroups.length > 0) filterDesc.push(`business group: ${filters.businessGroups.join(', ')}`);
            if (filters.technologies.length > 0) filterDesc.push(`tech: ${filters.technologies.join(', ')}`);
            if (filters.year) filterDesc.push(`year ${filters.year}`);
            
            const filterQuery = filterDesc.join(' ') || 'all ideas';
            handleSearch(filterQuery, false);
        } else {
            setMessages(prev => [...prev, {
                id: `sys_${Date.now()}`,
                role: 'assistant',
                content: 'All filters cleared. Type a query to search.',
                timestamp: new Date().toISOString()
            }]);
        }
    };

    const activeFilterCount = exploreFilters.themes.length + exploreFilters.businessGroups.length + exploreFilters.technologies.length + (exploreFilters.year ? 1 : 0);

    return (
        <div ref={containerRef} className="flex h-full w-full bg-gradient-to-br from-slate-50 to-blue-50 overflow-hidden relative selection:bg-blue-100">
            {/* Chat History Sidebar */}
            {showSidebar && (
                <ChatHistorySidebar
                    currentSessionId={currentSessionId}
                    onSelectSession={handleSelectSession}
                    onNewChat={handleNewChat}
                    onDeleteSession={handleDeleteSession}
                    userId={userId}
                    width={sidebarWidth}
                />
            )}

            {/* RESIZE HANDLE: Sidebar <-> Chat */}
            {showSidebar && (
                <div
                    className="w-1 hover:w-1.5 bg-slate-200 hover:bg-blue-400 cursor-col-resize z-50 transition-all flex items-center justify-center group"
                    onMouseDown={() => startResizing('sidebar')}
                >
                    <div className="w-0.5 h-8 bg-slate-300 group-hover:bg-white rounded-full" />
                </div>
            )}

            {/* LEFT SIDE - CHAT */}
            <div
                className="flex flex-col border-r border-slate-200 bg-white shadow-lg transition-all min-w-[300px] flex-shrink-0"
                style={{ width: `${chatWidth}px` }}
            >
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
                        <div className="flex items-center gap-2">
                            {/* Clear Context Button - Always visible */}
                            <button
                                onClick={clearContext}
                                disabled={contextLoading}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors ${contextLoading
                                    ? 'bg-white/10 cursor-not-allowed'
                                    : 'bg-white/20 hover:bg-white/30'
                                    }`}
                                title="Clear saved context and filters"
                            >
                                <Trash2 className="w-4 h-4 text-white" />
                                <span className="text-white text-xs font-medium">Clear Context</span>
                            </button>

                            {contextMessage && (
                                <span className="text-white text-xs font-medium px-2 py-1 bg-white/20 rounded">
                                    {contextMessage}
                                </span>
                            )}
                            <button
                                onClick={() => setIsExploreOpen(true)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors relative"
                                title="Open filter explorer"
                            >
                                <Compass className="w-4 h-4 text-white" />
                                <span className="text-white text-xs font-medium">Explore</span>
                                {activeFilterCount > 0 && (
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border border-white text-white text-[10px] flex items-center justify-center font-bold">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Context Status Indicator */}
                {savedContext && savedContext.savedAt && (
                    <div className="px-4 py-2 bg-green-50 border-b border-green-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-sm text-green-800">
                                Context saved on {new Date(savedContext.savedAt).toLocaleString()}
                            </span>
                        </div>
                        {savedContext.filters && (
                            <span className="text-xs text-green-700 font-medium">
                                {Object.keys(savedContext.filters).filter(k =>
                                    savedContext.filters[k]?.length > 0
                                ).length} filters active
                            </span>
                        )}
                    </div>
                )}

                {/* Chat Messages */}
                <div
                    ref={chatContainerRef}
                    className="flex-1 overflow-y-auto p-4 space-y-4"
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
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs">
                                                {new Date(message.timestamp).toLocaleTimeString()}
                                            </p>
                                            {message.role === 'user' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEditMessage(message.content); }}
                                                    className="p-1 hover:bg-white/20 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Edit query"
                                                >
                                                    <Edit2 className="w-3 h-3 text-blue-100" />
                                                </button>
                                            )}
                                        </div>
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

            {/* RESIZE HANDLE: Chat <-> Results */}
            <div
                className="w-1 hover:w-1.5 bg-slate-200 hover:bg-blue-400 cursor-col-resize z-50 transition-all flex items-center justify-center group flex-shrink-0"
                onMouseDown={() => startResizing('chat')}
            >
                <div className="w-0.5 h-8 bg-slate-300 group-hover:bg-white rounded-full" />
            </div>

            {/* RIGHT SIDE - RESULTS */}
            <div className="flex-1 flex flex-col bg-slate-50 transition-all min-w-[350px]">
                {/* Results Header */}
                <div className="px-6 py-4 bg-white border-b border-slate-200">
                    {/* Active Context Banner - if explicit context is saved */}
                    {savedContext && (
                        <div className="mb-4 p-3 bg-blue-50/50 rounded-lg border border-blue-100/50">
                            <div className="flex items-center gap-2 mb-2">
                                <Bookmark className="w-3.5 h-3.5 text-blue-600" />
                                <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Active Context Filters</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {/* Context Queries/Terms */}
                                {savedContext.query && (
                                    <span className="inline-flex items-center px-2 py-1 bg-white border border-blue-200 text-blue-800 rounded text-xs">
                                        "{savedContext.query}"
                                    </span>
                                )}
                                {/* Saved Year */}
                                {savedContext.filters?.year && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 border border-orange-200 text-orange-700 rounded text-xs">
                                        <Calendar className="w-3 h-3" />
                                        {savedContext.filters.year}
                                    </span>
                                )}
                                {/* Saved Domains */}
                                {savedContext.filters?.themes?.map(theme => (
                                    <span key={theme} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded text-xs">
                                        <Filter className="w-3 h-3" />
                                        {theme}
                                    </span>
                                ))}
                                {/* Saved Business Groups */}
                                {savedContext.filters?.businessGroups?.map(group => (
                                    <span key={group} className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 text-green-700 rounded text-xs">
                                        <Building2 className="w-3 h-3" />
                                        {group}
                                    </span>
                                ))}
                                {/* Saved Technologies */}
                                {savedContext.filters?.technologies?.map(tech => (
                                    <span key={tech} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-xs">
                                        <Code className="w-3 h-3" />
                                        {tech}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

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
                                            <div className="ml-4 flex-shrink-0 flex items-center gap-2">
                                                {idea.matchScore && idea.matchScore > 0 && (
                                                    <div className="px-3 py-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full text-xs font-bold">
                                                        {idea.matchScore}% Match
                                                    </div>
                                                )}
                                                <button
                                                    onClick={(e) => handleToggleTag(idea.id, e)}
                                                    className={`p-1.5 rounded-full transition-all ${taggedIdeas.has(idea.id)
                                                            ? 'bg-blue-100 text-blue-600'
                                                            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                                        }`}
                                                    title={taggedIdeas.has(idea.id) ? "Remove tag" : "Tag idea"}
                                                >
                                                    <Bookmark className={`w-4 h-4 ${taggedIdeas.has(idea.id) ? 'fill-current' : ''}`} />
                                                </button>
                                            </div>
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
