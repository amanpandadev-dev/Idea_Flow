import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Sparkles, X, Filter, TrendingUp, Calendar, Code, Building2, Compass, PanelLeftClose, PanelLeft, Save, Trash2 } from 'lucide-react';
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
    processingTime?: number;
    nlpEnhanced?: boolean;
    correctedQuery?: string;
    originalQuery?: string;
    context?: {
        query?: string;
        filters?: Record<string, string[]>;
    };
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
    userId
}) => {
    const [query, setQuery] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [results, setResults] = useState<Idea[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [metadata, setMetadata] = useState<SearchMetadata | null>(null);
    const [filtersApplied, setFiltersApplied] = useState<any>({}); // From backend
    const [strictFilters, setStrictFilters] = useState<any>({}); // NEW: Strict AND filters from backend
    const [resultContext, setResultContext] = useState<any>(null); // NEW: Result origin metadata
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null); // Progressive narrowing
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

    // Context Management State
    const [savedContext, setSavedContext] = useState<any>(null);
    const [contextLoading, setContextLoading] = useState(false);
    const [contextMessage, setContextMessage] = useState<string>('');

    // Resizable Panels State
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        // Load from localStorage or default to 221px
        const saved = localStorage.getItem('prosearchSidebarWidth');
        return saved ? parseFloat(saved) : 221;
    });
    const [chatWidthPercent, setChatWidthPercent] = useState(() => {
        // Load from localStorage or default to 35%
        const saved = localStorage.getItem('prosearchChatWidth');
        return saved ? parseFloat(saved) : 35;
    });
    const [isResizing, setIsResizing] = useState<'sidebar' | 'chat' | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

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
    const initializeNewChat = (preserveState = false) => {
        setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: 'Hello! I can help you find ideas using natural language. Try queries like "latest blockchain ideas", "filter by healthcare", or "show React projects from 2024".',
            timestamp: new Date().toISOString()
        }]);
        setSuggestions([
            'Find blockchain projects',
            'Filter by healthcare domain',
            'React projects from 2024'
        ]);

        if (!preserveState) {
            setResults([]);
            setMetadata(null);
            setCurrentSessionId(null);
            setActiveResultMessageId(null);

            // CRITICAL: Clear conversation state for new chat
            setConversationId(null);
            setResultContext(null);
            setFiltersApplied({});
            sessionStorage.removeItem(`prosearch_conversationId_${userId}`);
            sessionStorage.removeItem(`prosearch_results_${userId}`);
            console.log('[ProSearch] New chat initialized - conversation state cleared');
        } else {
            console.log('[ProSearch] New chat initialized - preserving existing state');
        }
    };

    // Load most recent session on mount or show welcome
    const loadMostRecentSession = async () => {
        try {
            const response = await fetch('/api/chat/sessions', {
                headers: { 'x-user-id': userId || '' },
                credentials: 'include'
            });

            // Handle authentication errors gracefully
            if (response.status === 401) {
                console.warn('[ProSearch] Authentication failed when loading sessions');
                // Only show welcome if we don't have a userId
                if (!userId) {
                    initializeNewChat();
                }
                return;
            }

            if (response.ok) {
                const data = await response.json();
                const sessions = data.sessions;

                // Get most recent session from all groups
                let mostRecentSession = null;
                for (const group in sessions) {
                    if (sessions[group].length > 0) {
                        const groupMostRecent = sessions[group][0]; // Already sorted by updated_at DESC
                        if (!mostRecentSession ||
                            new Date(groupMostRecent.updatedAt) > new Date(mostRecentSession.updatedAt)) {
                            mostRecentSession = groupMostRecent;
                        }
                    }
                }

                if (mostRecentSession) {
                    console.log(`[ProSearch] Loading most recent session: ${mostRecentSession.id}`);
                    await loadSession(mostRecentSession.id);
                } else {
                    // No sessions exist, show welcome but check if we have rehydrated state
                    const hasRehydratedState = !!sessionStorage.getItem(`prosearch_conversationId_${userId}`);
                    console.log('[ProSearch] No previous sessions, showing welcome. Preserving state:', hasRehydratedState);
                    initializeNewChat(hasRehydratedState);
                }
            } else {
                console.warn('[ProSearch] Failed to load sessions, showing welcome');
                initializeNewChat();
            }
        } catch (err) {
            console.error('[ProSearch] Failed to load recent session:', err);
            initializeNewChat();
        }
    };

    // Component Mount: Load chat history and restore results from sessionStorage
    useEffect(() => {
        console.log('[ProSearch] Component mounted, userId:', userId);

        // PROGRESSIVE NARROWING: Check for existing conversationId
        const savedConversationId = sessionStorage.getItem(`prosearch_conversationId_${userId}`);
        if (savedConversationId) {
            console.log(`[ProSearch] Found conversationId: ${savedConversationId}`);
            setConversationId(savedConversationId);

            // Reload conversation from backend
            loadConversation(savedConversationId);
        } else {
            // Restore results from sessionStorage as backup
            try {
                const savedResults = sessionStorage.getItem(`prosearch_results_${userId}`);
                const savedMetadata = sessionStorage.getItem(`prosearch_metadata_${userId}`);

                if (savedResults) {
                    const parsedResults = JSON.parse(savedResults);
                    if (parsedResults && parsedResults.length > 0) {
                        console.log(`[ProSearch] Restored ${parsedResults.length} results from sessionStorage`);
                        setResults(parsedResults);
                    }
                }

                if (savedMetadata) {
                    setMetadata(JSON.parse(savedMetadata));
                }
            } catch (error) {
                console.error('[ProSearch] Error restoring from sessionStorage:', error);
            }
        }

        // Load chat history if userId is provided (even if it's a string ID)
        if (userId) {
            console.log('[ProSearch] Loading chat history for user:', userId);
            loadMostRecentSession();
            // loadContext() removed - not needed in hybrid search architecture
        } else {
            console.log('[ProSearch] No userId, showing welcome');
            initializeNewChat();
        }
    }, [userId]);

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
                // Persist to localStorage
                localStorage.setItem('prosearchSidebarWidth', newWidth.toString());
            }
        } else if (isResizing === 'chat') {
            // Calculate chat width as percentage of container width
            const sidebarOffset = showSidebar ? sidebarWidth : 0;
            const availableWidth = containerRect.width - sidebarOffset;
            const chatPixelWidth = e.clientX - containerRect.left - sidebarOffset;
            const newWidthPercent = (chatPixelWidth / availableWidth) * 100;

            // Constrain between 25% and 55%
            if (newWidthPercent >= 25 && newWidthPercent <= 55) {
                setChatWidthPercent(newWidthPercent);
                // Persist to localStorage
                localStorage.setItem('prosearchChatWidth', newWidthPercent.toString());
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

    // Context Management Functions
    const saveContext = async () => {
        setContextLoading(true);
        setContextMessage('');

        try {
            const response = await fetch('/api/search/context/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    filters: exploreFilters,
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
        if (!confirm('Clear saved search context and filters?')) {
            return;
        }

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
                    technologies: []
                });
                setContextMessage('✓ Cleared');
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
        setContextLoading(true);
        try {
            const response = await fetch(`/api/search/context/${userId}`);

            // Handle 404 - endpoint doesn't exist in new hybrid search
            if (response.status === 404) {
                console.log('[ProSearch] Context endpoint not available (hybrid search mode)');
                setContextLoading(false);
                return;
            }

            if (!response.ok) {
                throw new Error('Failed to load context');
            }

            const data = await response.json();
            if (data.filters) {
                setExploreFilters(data.filters);
            }
        } catch (err) {
            // Silently handle errors - context is optional
            console.log('[ProSearch] Context not loaded:', err);
        } finally {
            setContextLoading(false);
        }
    };

    // ========================================
    // STRICT FILTER MANAGEMENT
    // ========================================

    /**
     * Remove a single strict filter value
     */
    const removeStrictFilter = async (filterType: string, filterValue: string | number) => {
        if (!conversationId) return;

        try {
            const response = await fetch(
                `/api/search/context/strict-filter?userId=${userId}&conversationId=${conversationId}&filterType=${filterType}&filterValue=${encodeURIComponent(String(filterValue))}`,
                { method: 'DELETE' }
            );

            if (response.ok) {
                const data = await response.json();
                setStrictFilters(data.strictFilters || {});
                console.log(`[StrictFilter] Removed ${filterType}: ${filterValue}`);

                // Re-run search with updated filters
                if (query) {
                    handleSearch(query);
                }
            }
        } catch (error) {
            console.error('[StrictFilter] Remove failed:', error);
        }
    };

    /**
     * Clear all strict filters
     */
    const clearAllStrictFilters = async () => {
        if (!conversationId) return;

        try {
            const response = await fetch(
                `/api/search/context/strict-filters?userId=${userId}&conversationId=${conversationId}`,
                { method: 'DELETE' }
            );

            if (response.ok) {
                setStrictFilters({});
                console.log('[StrictFilter] Cleared all filters');

                // Re-run base search
                if (query) {
                    handleSearch(query);
                }
            }
        } catch (error) {
            console.error('[StrictFilter] Clear failed:', error);
        }
    };

    /**
     * Check if any strict filters are active
     */
    const hasActiveStrictFilters = (): boolean => {
        return Object.values(strictFilters).some((values: any) =>
            Array.isArray(values) && values.length > 0
        );
    };

    /**
     * Load conversation state from backend using conversation_search_state table
     * This is the SINGLE SOURCE OF TRUTH for search results
     * Messages are for UI history only - results come from DB
     */
    const loadConversation = async (convId: string) => {
        try {
            console.log(`[ProSearch] Loading conversation: ${convId}`);

            // ✅ CORRECT: Load from conversation_search_state table via /rehydrate
            const response = await fetch('/api/search/rehydrate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId: convId })
            });

            if (!response.ok) {
                console.warn('[ProSearch] Conversation not found or expired');
                // Clear stale conversationId
                sessionStorage.removeItem(`prosearch_conversationId_${userId}`);
                setConversationId(null);
                return;
            }

            const data = await response.json();

            if (data.results && data.results.length > 0) {
                console.log(`[ProSearch] ✅ Rehydrated ${data.results.length} results from DB`);

                // Restore results from conversation_search_state
                setResults(data.results);
                setFiltersApplied(data.filters || {});
                setMetadata({
                    intent: 'rehydrated',
                    totalResults: data.results.length,
                    filters: data.filters || {},
                    processingTime: 0,
                    context: {
                        query: data.baseQuery,
                        filters: data.filters
                    }
                });

                // Show reload message
                // const reloadMsg: Message = {
                //     id: `reload_${ Date.now() }`,
                //     role: 'assistant',
                //     content: `Conversation restored! Showing ${ data.results.length } results.`,
                //     timestamp: new Date().toISOString()
                // };
                // setMessages(prev => [...prev, reloadMsg]);
            } else {
                console.log('[ProSearch] No results to restore');
            }

        } catch (error) {
            console.error('[ProSearch] Failed to load conversation:', error);
        }
    };

    // Create a new session when first message is sent
    const createSession = async (): Promise<number | null> => {
        try {
            const response = await fetch('http://localhost:3001/api/chat/sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId || ''
                },
                credentials: 'include',
                body: JSON.stringify({ title: 'New Chat' })
            });

            if (response.status === 401) {
                console.warn('[ProSearch] Not authenticated, cannot create session');
                return null;
            }

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
            const response = await fetch(`http://localhost:3001/api/chat/sessions/${sessionId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId || ''
                },
                credentials: 'include',
                body: JSON.stringify({ role, content, metadata })
            });

            if (response.status === 401) {
                console.warn('[ProSearch] Not authenticated, message not saved');
                return;
            }
        } catch (err) {
            console.error('Failed to save message:', err);
        }
    };

    // Load session messages and restore search results with metadata
    const loadSession = async (sessionId: number) => {
        try {
            const response = await fetch(`http://localhost:3001/api/chat/sessions/${sessionId}/messages`, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId || ''
                },
                credentials: 'include'
            });

            if (response.status === 401) {
                console.warn('[ProSearch] Not authenticated, cannot load session');
                initializeNewChat();
                return;
            }

            if (response.ok) {
                const data = await response.json();
                if (data.messages.length > 0) {
                    // Map messages and rehydrate results from metadata
                    const loadedMessages = await Promise.all(data.messages.map(async (msg: any) => {
                        const message: Message = {
                            id: `msg_${msg.id}`,
                            role: msg.role,
                            content: msg.content,
                            timestamp: msg.timestamp
                        };

                        // Rehydrate results for assistant messages with resultIds
                        if (msg.role === 'assistant' && msg.metadata?.resultIds && msg.metadata.resultIds.length > 0) {
                            try {
                                // Fetch full idea objects using resultIds
                                const rehydratedResults = await rehydrateIdeas(msg.metadata.resultIds);
                                message.metadata = {
                                    results: rehydratedResults,
                                    searchMetadata: msg.metadata.searchMetadata,
                                    resultsCount: rehydratedResults.length
                                };
                            } catch (error) {
                                console.error('[ProSearch] Failed to rehydrate results for message:', error);
                            }
                        }

                        return message;
                    }));

                    setMessages(loadedMessages);

                    // Find the last assistant message with results to display
                    const lastMsgWithResults = [...loadedMessages]
                        .reverse()
                        .find((msg: Message) => msg.role === 'assistant' && msg.metadata?.results && msg.metadata.results.length > 0);

                    if (lastMsgWithResults) {
                        setResults(lastMsgWithResults.metadata!.results);
                        setMetadata(lastMsgWithResults.metadata!.searchMetadata || null);
                        setActiveResultMessageId(lastMsgWithResults.id);
                        console.log(`[ProSearch] Restored ${lastMsgWithResults.metadata!.results.length} results from last message`);
                    }

                    // Restore conversationId for continued filtering
                    const lastMsgWithConvId = [...data.messages]
                        .reverse()
                        .find((msg: any) => msg.role === 'assistant' && msg.metadata?.conversationId);

                    if (lastMsgWithConvId?.metadata?.conversationId) {
                        const convId = lastMsgWithConvId.metadata.conversationId;
                        setConversationId(convId);
                        sessionStorage.setItem(`prosearch_conversationId_${userId}`, convId);
                        console.log(`[ProSearch] Restored conversationId: ${convId}`);
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

    // Rehydrate full idea objects from idea IDs
    const rehydrateIdeas = async (ideaIds: number[]): Promise<Idea[]> => {
        try {
            const response = await fetch('/api/ideas/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ ideaIds })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch ideas');
            }

            const data = await response.json();
            return data.ideas || [];
        } catch (error) {
            console.error('[ProSearch] Failed to rehydrate ideas:', error);
            return [];
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
            // FIX: Match keys with postgresFilterService expectations
            if (exploreFilters.technologies.length > 0) mappedFilters.technologies = exploreFilters.technologies;
            if (exploreFilters.businessGroups.length > 0) mappedFilters.businessGroups = exploreFilters.businessGroups;
            if (exploreFilters.themes.length > 0) mappedFilters.domains = exploreFilters.themes;

            // Get recent conversation history for context-aware search (last 5 messages)
            const conversationHistory = messages
                .slice(-5) // Last 5 messages
                .map(msg => ({
                    role: msg.role,
                    content: msg.content
                }));

            const response = await fetch('/api/prosearch/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    conversationId: conversationId || null, // Send existing conversationId or null for new chat
                    message: searchQuery // The new API expects 'message' instead of 'query'
                })
            });

            if (!response.ok) throw new Error('Search failed');

            const data = await response.json();

            const searchResults = data.results || [];
            // Map new API response to expected SearchMetadata format
            const searchMeta: SearchMetadata = {
                intent: data.isNewBaseSearch ? 'new_search' : 'filter_refinement',
                filters: {
                    techStack: data.appliedFilters?.technologies || [],
                    businessGroup: data.appliedFilters?.businessGroups?.[0],
                    domain: data.appliedFilters?.themes?.[0],
                    year: data.appliedFilters?.years?.[0]
                },
                totalResults: searchResults.length
            };

            // PROGRESSIVE NARROWING: Save conversationId
            if (data.conversationId) {
                setConversationId(data.conversationId);
                sessionStorage.setItem(`prosearch_conversationId_${userId}`, data.conversationId);
                console.log(`[ProSearch] Saved conversationId: ${data.conversationId}`);
            }

            // Save filters from backend (map appliedFilters to filtersApplied)
            if (data.appliedFilters) {
                setFiltersApplied(data.appliedFilters);
                console.log(`[FiltersApplied]`, data.appliedFilters);
            }

            const aiMessage: Message = {
                id: `ai_${Date.now()}`,
                role: 'assistant',
                content: `Found ${searchResults.length} results`,
                timestamp: new Date().toISOString(),
                metadata: {
                    results: searchResults,
                    searchMetadata: searchMeta,
                    resultsCount: searchResults.length
                }
            };

            setMessages(prev => [...prev, aiMessage]);
            setResults(searchResults);
            setSuggestions([]);
            setMetadata(searchMeta);
            setActiveResultMessageId(aiMessage.id);

            // Persist results in sessionStorage for navigation persistence
            try {
                sessionStorage.setItem(`prosearch_results_${userId}`, JSON.stringify(searchResults));
                sessionStorage.setItem(`prosearch_metadata_${userId}`, JSON.stringify(searchMeta));
            } catch (error) {
                console.warn('[ProSearch] Failed to save to sessionStorage:', error);
            }

            // Save AI response with results for later retrieval
            // NOTE: Only save result IDs to avoid database payload limits
            // CRITICAL: Include conversationId for result rehydration
            if (sessionId) {
                saveMessage(sessionId, 'assistant', aiMessage.content, {
                    conversationId: data.conversationId,  // ✅ CRITICAL for rehydration
                    resultsCount: searchResults.length,
                    filters: searchMeta?.filters,
                    resultIds: searchResults.map((r: any) => r.idea_id), // Use idea_id from ProSearch API
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

    // Helper function to format active filters for display
    const formatActiveFilters = (filters: any) => {
        const parts: string[] = [];

        if (filters.technologies?.length > 0) {
            parts.push(filters.technologies.join(', '));
        }
        if (filters.years?.length > 0) {
            parts.push(`year ${filters.years.join(', ')}`);
        }
        if (filters.domains?.length > 0) {
            parts.push(filters.domains.join(', '));
        }
        if (filters.businessGroups?.length > 0) {
            parts.push(filters.businessGroups.join(', '));
        }
        if (filters.themes?.length > 0) {
            parts.push(filters.themes.join(', '));
        }

        return parts.join(', ');
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
        console.log('[ProSearch] Applying explore filters:', filters);
        setExploreFilters(filters);
        setIsExploreOpen(false);
        
        // Convert filters to a natural language message for ProSearch
        const filterParts = [];
        if (filters.themes.length > 0) {
            filterParts.push(`themes: ${filters.themes.join(', ')}`);
        }
        if (filters.businessGroups.length > 0) {
            filterParts.push(`business groups: ${filters.businessGroups.join(', ')}`);
        }
        if (filters.technologies.length > 0) {
            filterParts.push(`technologies: ${filters.technologies.join(', ')}`);
        }
        
        if (filterParts.length > 0) {
            const filterMessage = `Filter by ${filterParts.join(' and ')}`;
            console.log('[ProSearch] Sending filter message:', filterMessage);
            handleSearch(filterMessage);
        } else {
            setMessages(prev => [...prev, {
                id: `sys_${Date.now()}`,
                role: 'assistant',
                content: 'No filters selected. Please select at least one filter.',
                timestamp: new Date().toISOString()
            }]);
        }
    };

    const activeFilterCount = exploreFilters.themes.length + exploreFilters.businessGroups.length + exploreFilters.technologies.length;

    return (
        <div ref={containerRef} className="flex h-full w-full bg-gradient-to-br from-slate-50 to-blue-50 overflow-hidden relative selection:bg-blue-100">
            {/* Chat History Sidebar */}
            {showSidebar && userId && (
                <ChatHistorySidebar
                    currentSessionId={currentSessionId}
                    onSelectSession={handleSelectSession}
                    onNewChat={handleNewChat}
                    onDeleteSession={handleDeleteSession}
                    userId={userId}
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
                className="flex flex-col border-r border-slate-200 bg-white shadow-lg transition-all flex-shrink-0"
                style={{
                    width: `${chatWidthPercent}%`,
                    minWidth: '280px',
                    maxWidth: '50%'
                }}
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
                            {/* Context Management Buttons */}


                            <button
                                onClick={() => setIsExploreOpen(true)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors relative"
                                title="Open filter explorer"
                            >
                                <Compass className="w-4 h-4 text-white" />
                                <span className="text-white text-xs font-medium">Filter By</span>
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
                    style={{ maxHeight: 'calc(100vh - 280px)' }}
                >
                    {messages.map((message) => {
                        const hasResults = message.role === 'assistant' && message.metadata?.results && message.metadata.results.length > 0;
                        const isActiveResult = hasResults && activeResultMessageId === message.id;

                        return (
                            <div
                                key={message.id}
                                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} `}
                            >
                                <div
                                    onClick={() => handleMessageClick(message)}
                                    className={`max-w-[85%] rounded-2xl px-5 py-4 ${message.role === 'user'
                                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white cursor-pointer hover:from-blue-700 hover:to-purple-700 shadow-md hover:shadow-lg transition-all'
                                        : 'bg-slate-100 text-slate-800 cursor-pointer hover:bg-slate-200 shadow-sm hover:shadow-md transition-all'
                                        }`}
                                >
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                                    <div className={`flex items - center justify - between mt - 1 ${message.role === 'user' ? 'text-blue-100' : 'text-slate-500'} `}>
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
                                                    style={{ animationDelay: `${i * 0.15} s` }}
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
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-slate-800">
                                Search Results {results.length > 0 && `(${results.length})`}
                            </h3>

                            {/* NEW: Result Context Header */}
                            {resultContext && results.length > 0 && (
                                <p className="text-sm text-slate-600 mt-1">
                                    {resultContext.action === 'base_search' && (
                                        <>Showing results for <span className="font-medium">"{resultContext.query}"</span></>
                                    )}
                                    {resultContext.action === 'refine' && (
                                        <>Refined to {results.length} results from <span className="font-medium">"{resultContext.query}"</span></>
                                    )}
                                    {resultContext.action === 'filter' && (
                                        <>
                                            Showing results for <span className="font-medium">"{resultContext.query}"</span>
                                            {Object.values(resultContext.filters || {}).some((f: any) => f?.length > 0) && (
                                                <> filtered by {formatActiveFilters(resultContext.filters)}</>
                                            )}
                                        </>
                                    )}
                                    {resultContext.action === 'reset' && (
                                        <>All results for <span className="font-medium">"{resultContext.query}"</span></>
                                    )}
                                </p>
                            )}

                            {metadata && (
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    {/* Technologies - from backend filtersApplied */}
                                    {filtersApplied.technologies?.map((tech: string) => (
                                        <span key={tech} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                                            <Code className="w-3 h-3" />
                                            {tech}
                                        </span>
                                    ))}

                                    {/* Years - from backend filtersApplied */}
                                    {filtersApplied.years?.map((year: number) => (
                                        <span key={year} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">
                                            <Calendar className="w-3 h-3" />
                                            {year}
                                        </span>
                                    ))}

                                    {/* Domains - from backend filtersApplied */}
                                    {filtersApplied.domains?.map((domain: string) => (
                                        <span key={domain} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                                            <Filter className="w-3 h-3" />
                                            {domain}
                                        </span>
                                    ))}

                                    {/* Business Groups - from backend filtersApplied */}
                                    {filtersApplied.businessGroups?.map((group: string) => (
                                        <span key={group} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                                            <Building2 className="w-3 h-3" />
                                            {group}
                                        </span>
                                    ))}

                                    {/* Themes - from backend filtersApplied */}
                                    {filtersApplied.themes?.map((theme: string) => (
                                        <span key={theme} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs">
                                            <Filter className="w-3 h-3" />
                                            {theme}
                                        </span>
                                    ))}

                                    {metadata.sortBy && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-xs">
                                            <TrendingUp className="w-3 h-3" />
                                            {metadata.sortBy}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* 🆕 STRICT AND FILTERS - With Remove Buttons */}
                            {hasActiveStrictFilters() && (
                                <div className="flex items-center gap-2 mt-3 flex-wrap p-2 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
                                    <span className="text-xs font-semibold text-slate-600 mr-1">Active Filters (AND):</span>

                                    {/* Tech Stack */}
                                    {strictFilters.techStack?.map((tech: string) => (
                                        <span key={`strict-tech-${tech}`} className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs group hover:bg-green-200 transition-colors">
                                            <Code className="w-3 h-3" />
                                            {tech}
                                            <button
                                                onClick={() => removeStrictFilter('techStack', tech)}
                                                className="ml-0.5 hover:text-red-500 opacity-60 group-hover:opacity-100"
                                                title={`Remove ${tech} filter`}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}

                                    {/* Years */}
                                    {strictFilters.years?.map((year: number) => (
                                        <span key={`strict-year-${year}`} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs group hover:bg-amber-200 transition-colors">
                                            <Calendar className="w-3 h-3" />
                                            {year}
                                            <button
                                                onClick={() => removeStrictFilter('years', year)}
                                                className="ml-0.5 hover:text-red-500 opacity-60 group-hover:opacity-100"
                                                title={`Remove ${year} filter`}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}

                                    {/* Concepts */}
                                    {strictFilters.concepts?.map((concept: string) => (
                                        <span key={`strict-concept-${concept}`} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs group hover:bg-purple-200 transition-colors">
                                            <Sparkles className="w-3 h-3" />
                                            {concept}
                                            <button
                                                onClick={() => removeStrictFilter('concepts', concept)}
                                                className="ml-0.5 hover:text-red-500 opacity-60 group-hover:opacity-100"
                                                title={`Remove ${concept} filter`}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}

                                    {/* Business Groups */}
                                    {strictFilters.businessGroups?.map((bg: string) => (
                                        <span key={`strict-bg-${bg}`} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs group hover:bg-blue-200 transition-colors">
                                            <Building2 className="w-3 h-3" />
                                            {bg}
                                            <button
                                                onClick={() => removeStrictFilter('businessGroups', bg)}
                                                className="ml-0.5 hover:text-red-500 opacity-60 group-hover:opacity-100"
                                                title={`Remove ${bg} filter`}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}

                                    {/* Themes */}
                                    {strictFilters.themes?.map((theme: string) => (
                                        <span key={`strict-theme-${theme}`} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs group hover:bg-indigo-200 transition-colors">
                                            <Filter className="w-3 h-3" />
                                            {theme}
                                            <button
                                                onClick={() => removeStrictFilter('themes', theme)}
                                                className="ml-0.5 hover:text-red-500 opacity-60 group-hover:opacity-100"
                                                title={`Remove ${theme} filter`}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}

                                    {/* Clear All Button */}
                                    <button
                                        onClick={clearAllStrictFilters}
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-600 rounded-full text-xs hover:bg-red-200 transition-colors font-medium"
                                        title="Clear all strict filters"
                                    >
                                        <X className="w-3 h-3" />
                                        Clear All
                                    </button>
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

                                // Get theme (try both field names)
                                const theme = idea.theme || idea.domain;
                                
                                // Get business group (try both field names)
                                const businessGroup = idea.business_group || idea.businessGroup;
                                
                                // Get year (from year field or created_at)
                                const year = idea.year || (idea.created_at ? new Date(idea.created_at).getFullYear() : null);

                                return (
                                    <div
                                        key={idea.id || idea.idea_id || `result-${index}`}
                                        className="bg-white rounded-xl p-5 border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer group"
                                        onClick={() => onNavigateToIdea?.(idea)}
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                                                    {idea.title || 'Untitled'}
                                                </h4>
                                                <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                                                    {idea.description || idea.summary || 'No description available'}
                                                </p>
                                            </div>
                                            {/* High-Recall Hybrid Score Display */}
                                            {(idea.hybridScore !== undefined || (idea.matchScore && idea.matchScore > 0)) && (
                                                <div className="ml-4 flex-shrink-0">
                                                    <div
                                                        className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full text-xs font-bold shadow-lg flex items-center gap-2"
                                                        title={idea.scoreBreakdown ?
                                                            `Vector: ${(idea.scoreBreakdown.vector * 100).toFixed(0)}% | Metadata: ${(idea.scoreBreakdown.metadata * 100).toFixed(0)}% | Keyword: ${(idea.scoreBreakdown.keyword * 100).toFixed(0)}%`
                                                            : 'Match score'}
                                                    >
                                                        {idea.hybridScore !== undefined ? (
                                                            <>
                                                                <TrendingUp className="w-3 h-3" />
                                                                <span>{Math.round(idea.hybridScore * 100)}%</span>
                                                            </>
                                                        ) : (
                                                            <span>{Math.round(idea.matchScore || 0)}%</span>
                                                        )}
                                                    </div>
                                                    {idea.scoreBreakdown && (
                                                        <div className="text-[10px] text-slate-500 text-center mt-1">
                                                            Hybrid
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap">
                                            {theme && (
                                                <span className="px-2 py-1 bg-purple-50 text-purple-600 rounded text-xs font-medium">
                                                    {theme}
                                                </span>
                                            )}
                                            {businessGroup && (
                                                <span className="px-2 py-1 bg-green-50 text-green-600 rounded text-xs font-medium">
                                                    {businessGroup}
                                                </span>
                                            )}
                                            {year && (
                                                <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {year}
                                                </span>
                                            )}
                                            {techArray.slice(0, 3).map((tech, idx) => (
                                                <span key={idx} className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs">
                                                    {tech}
                                                </span>
                                            ))}
                                            {techArray.length > 3 && (
                                                <span className="text-xs text-slate-400">
                                                    +{techArray.length - 3} more
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
