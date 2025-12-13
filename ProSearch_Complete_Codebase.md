# ProSearch Complete Codebase

This document contains all the code files related to the ProSearch component implementation.

## Table of Contents

1. [Frontend Components](#frontend-components)
2. [Backend Routes](#backend-routes)
3. [Backend Services](#backend-services)
4. [Supporting Files](#supporting-files)

---

## Frontend Components

### 1. components/ProSearchModal.tsx

```typescript
import React from 'react';
import { X } from 'lucide-react';
import ProSearchChat from './ProSearchChat';
import { Idea } from '../types';

interface ProSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewDetails: (idea: Idea) => void;
  onRefreshData: () => void;
  // New props for persistence
  initialQuery?: string;
  initialResults?: Idea[];
  onSearchComplete?: (query: string, results: Idea[]) => void;

  // Filter Data
  availableTechnologies: string[];
  availableThemes: string[];
  availableBusinessGroups: string[];
  // User ID for chat history
  userId?: string;
}

const ProSearchModal: React.FC<ProSearchModalProps> = ({
  isOpen,
  onClose,
  onViewDetails,
  availableTechnologies,
  availableThemes,
  availableBusinessGroups,
  userId = 'anonymous'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white">
      {/* Fullscreen Modal */}
      <div className="w-full h-full flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-purple-600">
          <h2 className="text-xl font-bold text-white">Pro Search - Conversational AI</h2>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-white" />
            <span className="text-white text-sm font-medium">Close</span>
          </button>
        </div>

        {/* Chat Interface - Full Height */}
        <div className="flex-1 overflow-hidden">
          <ProSearchChat
            onNavigateToIdea={onViewDetails}
            availableTechnologies={availableTechnologies}
            availableThemes={availableThemes}
            availableBusinessGroups={availableBusinessGroups}
            userId={userId}
          />
        </div>
      </div>
    </div>
  );
};

export default ProSearchModal;
```
### 2.
 components/ProSearchChat.tsx (Part 1)

```typescript
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

    // Context Management State
    const [savedContext, setSavedContext] = useState<any>(null);
    const [contextLoading, setContextLoading] = useState(false);
    const [contextMessage, setContextMessage] = useState<string>('');

    // Resizable Panels State
    const [sidebarWidth, setSidebarWidth] = useState(260);
    const [chatWidth, setChatWidth] = useState(450); // px
    const [isResizing, setIsResizing] = useState<'sidebar' | 'chat' | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
```### 
2. components/ProSearchChat.tsx (Part 2 - Functions)

```typescript
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
```#
## 2. components/ProSearchChat.tsx (Part 3 - Context & Session Management)

```typescript
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
```### 2.
 components/ProSearchChat.tsx (Part 4 - Search & Event Handlers)

```typescript
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
```### 2. 
components/ProSearchChat.tsx (Part 5 - JSX Render)

```typescript
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
                            {/* Context Management Buttons */}
                            <button
                                onClick={saveContext}
                                disabled={contextLoading}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors ${contextLoading
                                    ? 'bg-white/10 cursor-not-allowed'
                                    : 'bg-white/20 hover:bg-white/30'
                                    }`}
                                title="Save current filters and query"
                            >
                                <Save className="w-4 h-4 text-white" />
                                <span className="text-white text-xs font-medium">Save</span>
                            </button>

                            {savedContext && (
                                <button
                                    onClick={clearContext}
                                    disabled={contextLoading}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors ${contextLoading
                                        ? 'bg-white/10 cursor-not-allowed'
                                        : 'bg-red-500/80 hover:bg-red-500'
                                        }`}
                                    title="Clear saved context"
                                >
                                    <Trash2 className="w-4 h-4 text-white" />
                                    <span className="text-white text-xs font-medium">Clear</span>
                                </button>
                            )}

                            {contextMessage && (
                                <span className="text-white text-xs font-medium px-2 py-1 bg-white/20 rounded">
                                    {contextMessage}
                                </span>
                            )}

                            <button
                                onClick={() => handleClearContext('all')}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                                title="Clear search context and filters"
                            >
                                <Filter className="w-4 h-4 text-white" />
                                <span className="text-white text-xs font-medium">Clear Context</span>
                            </button>
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
```### 2.
 components/ProSearchChat.tsx (Part 6 - Chat Messages & Results)

```typescript
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
```### 2. 
components/ProSearchChat.tsx (Part 7 - Results Grid & Export)

```typescript
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
```

### 3. components/Header.tsx

```typescript
import React from 'react';
import { Lightbulb, Bell, UserCircle, LogOut, Heart, Sparkles, Bot, LayoutDashboard, FolderKanban } from 'lucide-react';

interface HeaderProps {
  user?: { name: string; role: string } | null;
  onLogout?: () => void;
  onOpenWishlist?: () => void;
  onOpenProfile?: () => void;
  onOpenProSearch?: () => void;
  likedCount?: number;
  ideaCount?: number;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const Header: React.FC<HeaderProps> = ({
  user,
  onLogout,
  onOpenWishlist,
  onOpenProfile,
  onOpenProSearch,
  likedCount = 0,
  ideaCount = 0,
  activeTab,
  onTabChange
}) => {

  const getNavClass = (tabName: string) =>
    `flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tabName
      ? 'bg-indigo-50 text-indigo-700'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => onTabChange && onTabChange('dashboard')}
            >
              <div className="bg-indigo-600 p-2 rounded-lg">
                <Lightbulb className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">IdeaFlow</h1>
              </div>
            </div>

            {/* Primary Navigation - Centered if possible or next to logo */}
            {onTabChange && (
              <nav className="hidden md:flex items-center gap-1">
                <button
                  onClick={() => onTabChange('dashboard')}
                  className={getNavClass('dashboard')}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </button>

                <button
                  onClick={() => onTabChange('projects')}
                  className={getNavClass('projects')}
                >
                  <FolderKanban className="h-4 w-4" />
                  Ideas
                  {ideaCount > 0 && (
                    <span className="ml-1.5 bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full border border-slate-200">
                      {ideaCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => onTabChange('agent')}
                  className={getNavClass('agent')}
                >
                  <Bot className="h-4 w-4" />
                  AI Agent
                </button>
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3">

            {/* Pro Search Button */}
            {onOpenProSearch && (
              <button
                onClick={onOpenProSearch}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-full text-xs font-medium hover:shadow-md transition-all hover:-translate-y-0.5 mr-2"
              >
                <Sparkles className="h-3 w-3" />
                Pro Search
              </button>
            )}

            {/* Wishlist / My Likes */}
            {onOpenWishlist && (
              <button
                onClick={onOpenWishlist}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all relative group"
                title="My Like List"
              >
                <span className="hidden sm:inline">My Likes</span>
                {likedCount > 0 && (
                  <span >
                    ({likedCount > 99 ? '99+' : likedCount})
                  </span>
                )}
              </button>
            )}

            <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block"></div>

            {/* User Profile */}
            <div className="flex items-center gap-2 pl-1">
              <button
                onClick={onOpenProfile}
                className="flex items-center gap-2 hover:bg-slate-50 p-1.5 rounded-lg transition-colors group text-left"
                title="View Profile"
              >
                <UserCircle className="h-8 w-8 text-slate-400 group-hover:text-indigo-600" />
                <div className="hidden lg:block text-sm">
                  <p className="font-medium text-slate-700 group-hover:text-indigo-700 max-w-[100px] truncate">{user?.name || 'Guest'}</p>
                  <p className="text-[10px] text-slate-500 capitalize">{user?.role || 'Viewer'}</p>
                </div>
              </button>

              {onLogout && (
                <button
                  onClick={onLogout}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                  title="Sign Out"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
```#
## 4. App.tsx (ProSearch Integration)

```typescript
// ... (imports and other code)

// Pro Search State Interface
interface ProSearchState {
  query: string;
  results: Idea[];
  isOpen: boolean;
  hasSearched: boolean;
}

const App: React.FC = () => {
  // ... (other state)

  // Pro Search State
  const [proSearchState, setProSearchState] = useState<ProSearchState>({
    query: '',
    results: [],
    isOpen: false,
    hasSearched: false
  });

  // ... (other handlers)

  const handleOpenProSearch = () => {
    setProSearchState(prev => ({ ...prev, isOpen: true }));
  };

  const handleCloseProSearch = () => {
    setProSearchState(prev => ({ ...prev, isOpen: false }));
  };

  const handleProSearchComplete = (query: string, results: Idea[]) => {
    setProSearchState({ query, results, isOpen: true, hasSearched: true });
  };

  const handleViewDetails = (idea: Idea) => {
    if (proSearchState.isOpen) {
      setPreviousTab('pro-search');
      // Store the idea in proSearchState.results so it can be found when rendering details
      setProSearchState(prev => ({
        ...prev,
        isOpen: false,
        results: prev.results.some(r => r.id === idea.id)
          ? prev.results
          : [...prev.results, idea]
      }));
    } else {
      setPreviousTab(activeTab);
    }
    setActiveTab(`detail:${idea.id}`);
  };

  const handleBackFromDetails = () => {
    if (previousTab === 'pro-search') {
      setProSearchState(prev => ({ ...prev, isOpen: true }));
      setActiveTab('dashboard');
    } else if (activeTab.includes('wishlist')) {
      setIsWishlistOpen(true);
      setActiveTab('dashboard');
    } else {
      setActiveTab(previousTab);
    }
  };

  // ... (rest of component)

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Header
        user={user}
        onLogout={handleLogout}
        onOpenWishlist={handleOpenWishlist}
        onOpenProfile={handleViewProfile}
        onOpenProSearch={handleOpenProSearch}
        likedCount={likedIdeas.length}
        ideaCount={ideas.length}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {/* ... (main content) */}

      {proSearchState.isOpen && (
        <ProSearchModal
          isOpen={proSearchState.isOpen}
          onClose={handleCloseProSearch}
          onViewDetails={handleViewDetails}
          onRefreshData={handleRefreshData}
          initialQuery={proSearchState.query}
          initialResults={proSearchState.results}
          onSearchComplete={handleProSearchComplete}
          availableTechnologies={allTechnologies}
          availableThemes={allThemes}
          availableBusinessGroups={allBusinessGroups}
        />
      )}
    </div>
  );
};

export default App;
```

---

## Backend Routes

### 1. backend/routes/proSearchRoutes.js (Part 1)

```javascript
/**
 * Pro Search Routes - Advanced Semantic Search with NLP
 * 
 * Features:
 * - ChromaDB for fast vector similarity search
 * - Google Gemini for embeddings and AI responses
 * - NLP query processing with spell correction
 * - Context validation to block off-topic queries
 * - Smart suggestions and query expansion
 */

import express from 'express';
import { validateQuery, extractEntities, generateErrorMessage } from '../services/contextValidator.js';
import { getChromaClient } from '../config/chroma.js';
import { enhanceQuery, processQuery } from '../services/nlpQueryProcessor.js';
import {
    generateGeminiEmbeddingWithRetry,
    generateText,
    isGeminiAvailable,
    initializeGemini
} from '../config/gemini.js';
import { contextsRouter } from './proSearchContextRoutes.js';

const router = express.Router();

console.log('✅ [Pro Search] Routes loaded with ChromaDB + Gemini + NLP');

// Mount context management routes
router.use('/', contextsRouter);

// Ensure Gemini is initialized
initializeGemini();

// Cache for ideas collection
let ideasCollection = null;
let lastIndexTime = null;
let isIndexing = false; // Prevent concurrent indexing
const INDEX_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

/**
 * Generate embedding using Gemini (with robust fallback)
 */
async function getEmbedding(text) {
    if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
    }

    // Truncate to avoid token limits (increased limit for Con #10 fix)
    const truncatedText = text.substring(0, 5000);

    // Try Gemini first, but with quick timeout
    if (isGeminiAvailable()) {
        try {
            const embedding = await Promise.race([
                generateGeminiEmbeddingWithRetry(truncatedText, 2), // Max 2 retries
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Embedding timeout')), 10000)
                )
            ]);
            return embedding;
        } catch (error) {
            console.warn('[Pro Search] Gemini embedding failed, using local fallback');
        }
    }

    // Fallback: TF-IDF style embedding (more meaningful than simple hash)
    return generateLocalEmbedding(truncatedText);
}

/**
 * Local TF-IDF style embedding generator (no external API needed)
 */
function generateLocalEmbedding(text) {
    const EMBEDDING_DIM = 768;
    const embedding = new Array(EMBEDDING_DIM).fill(0);

    // Tokenize and clean
    const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);

    if (words.length === 0) {
        return embedding;
    }

    // Word frequency
    const wordFreq = {};
    words.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Generate embedding using multiple hash functions for better distribution
    Object.entries(wordFreq).forEach(([word, freq]) => {
        // Multiple hash positions for each word
        for (let h = 0; h < 3; h++) {
            const hash = word.split('').reduce((acc, char, i) =>
                acc + char.charCodeAt(0) * (i + 1) * (h + 1), h * 1000);
            const index = Math.abs(hash) % EMBEDDING_DIM;

            // TF-IDF style weighting
            const tf = freq / words.length;
            const idf = Math.log(1 + 1 / (freq + 1));
            embedding[index] += tf * idf * (h === 0 ? 1 : 0.5);
        }
    });

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
        for (let i = 0; i < EMBEDDING_DIM; i++) {
            embedding[i] /= magnitude;
        }
    }

    return embedding;
}

// Track if we've already checked the index this session
let indexChecked = false;
```### 1. 
backend/routes/proSearchRoutes.js (Part 2 - Indexing)

```javascript
/**
 * Ensure ChromaDB index exists (index only once per server session)
 */
async function indexIdeasToChroma(pool) {
    // FAST PATH: Already indexed this session - skip everything
    if (indexChecked) {
        return;
    }

    // Prevent concurrent indexing
    if (isIndexing) {
        return;
    }

    try {
        const chromaClient = getChromaClient();

        // Check if collection already has data (loaded from disk)
        const hasCollection = chromaClient.hasCollection('ideas_search');
        const stats = hasCollection ? chromaClient.getStats('ideas_search') : null;

        if (hasCollection && stats && stats.documentCount > 0) {
            // Collection exists with data - mark as checked and skip indexing
            lastIndexTime = Date.now();
            indexChecked = true;
            console.log(`[Pro Search] ✅ Using existing index with ${stats.documentCount} ideas (loaded from disk)`);
            return;
        }

        // Set indexing flag to prevent concurrent runs
        isIndexing = true;

        console.log('[Pro Search] Indexing ideas to ChromaDB...');

        // Fetch ALL fields from ideas table for comprehensive indexing
        const result = await pool.query(`
            SELECT 
                idea_id, title, summary, challenge_opportunity,
                scalability, novelty, benefits, risks,
                responsible_ai, additional_info, prototype_url,
                timeline, success_metrics, expected_outcomes,
                scalability_potential, business_model, competitive_analysis,
                risk_mitigation, participation_week, build_phase,
                build_preference, code_preference, business_group,
                score, created_at, updated_at
            FROM ideas
            ORDER BY created_at DESC
            LIMIT 1000
        `);

        if (result.rows.length === 0) {
            console.log('[Pro Search] No ideas to index');
            return;
        }

        // Process in batches
        const batchSize = 25;
        let indexed = 0;

        for (let i = 0; i < result.rows.length; i += batchSize) {
            const batch = result.rows.slice(i, i + batchSize);

            const documents = [];
            const embeddings = [];
            const metadatas = [];

            for (const idea of batch) {
                // Create comprehensive searchable text from ALL fields
                const textParts = [
                    idea.title,
                    idea.summary,
                    idea.challenge_opportunity,
                    idea.benefits,
                    idea.risks,
                    idea.additional_info,
                    idea.success_metrics,
                    idea.expected_outcomes,
                    idea.business_model,
                    idea.competitive_analysis,
                    idea.risk_mitigation,
                    idea.code_preference,
                    idea.build_preference,
                    idea.scalability,
                    idea.novelty,
                    idea.timeline,
                    idea.responsible_ai
                ].filter(Boolean).join(' ').trim();

                if (!textParts || textParts.length < 10) continue;

                try {
                    // Truncate for embedding but keep it comprehensive
                    const embedding = await getEmbedding(textParts.substring(0, 3000));

                    documents.push(textParts);
                    embeddings.push(embedding);

                    // Store comprehensive metadata for filtering and display
                    metadatas.push({
                        idea_id: idea.idea_id,
                        title: idea.title || '',
                        summary: (idea.summary || '').substring(0, 500),
                        domain: idea.challenge_opportunity || '',
                        businessGroup: idea.business_group || '',
                        technologies: idea.code_preference || '',
                        buildPhase: idea.build_phase || '',
                        buildPreference: idea.build_preference || '',
                        scalability: idea.scalability || '',
                        novelty: idea.novelty || '',
                        timeline: idea.timeline || '',
                        participationWeek: idea.participation_week || '',
                        score: idea.score || 0,
                        created_at: idea.created_at?.toISOString() || '',
                        // Additional searchable fields in metadata
                        benefits: (idea.benefits || '').substring(0, 300),
                        risks: (idea.risks || '').substring(0, 300),
                        successMetrics: (idea.success_metrics || '').substring(0, 300)
                    });
                    indexed++;
                } catch (embError) {
                    console.warn(`[Pro Search] Failed to embed idea ${idea.idea_id}:`, embError.message);
                }
            }

            if (documents.length > 0) {
                chromaClient.addDocuments('ideas_search', documents, embeddings, metadatas);
            }

            // Small delay to avoid rate limits
            if (i + batchSize < result.rows.length) {
                await new Promise(r => setTimeout(r, 50));
            }
        }

        lastIndexTime = Date.now();
        indexChecked = true; // Mark as indexed for this session
        console.log(`✅ [Pro Search] Indexed ${indexed} ideas to ChromaDB (will not re-index this session)`);

    } catch (error) {
        console.error('[Pro Search] Indexing error:', error.message);
        // Still mark as checked to prevent retry loops
        indexChecked = true;
    } finally {
        isIndexing = false; // Always reset the flag
    }
}
```#
## 1. backend/routes/proSearchRoutes.js (Part 3 - Search Functions)

```javascript
/**
 * Semantic search with enhanced pagination and filtering
 * @param {string} query - Search query
 * @param {Object} filters - Filter criteria
 * @param {number} page - Page number (1-indexed)
 * @param {number} limit - Results per page
 * @param {number} minSimilarity - Minimum similarity threshold (0-100)
 * @returns {Object} { results, pagination, facets }
 */
async function semanticSearch(query, filters = {}, page = 1, limit = 20, minSimilarity = 30) {
    try {
        const chromaClient = getChromaClient();

        if (!chromaClient.hasCollection('ideas_search')) {
            return { results: [], pagination: { page: 1, limit, total: 0, totalPages: 0 }, facets: {} };
        }

        // Generate query embedding
        const queryEmbedding = await getEmbedding(query);

        // Query ChromaDB with larger pool for better pagination
        // Fetch 200 results to have a good pool after filtering
        const topK = Math.min(200, limit * 10);
        const results = chromaClient.query('ideas_search', queryEmbedding, topK);

        if (!results || results.documents.length === 0) {
            return { results: [], pagination: { page: 1, limit, total: 0, totalPages: 0 }, facets: {} };
        }

        // Map results with similarity scores
        let ideas = results.documents.map((doc, idx) => {
            const metadata = results.metadatas[idx] || {};
            const distance = results.distances[idx] || 1;
            const similarity = Math.max(0, Math.round((1 - distance) * 100));
            const dbId = metadata.idea_id;

            return {
                id: `IDEA-${dbId}`,
                dbId: dbId,
                title: metadata.title || 'Untitled',
                description: metadata.summary || doc.substring(0, 500), // Increased from 300
                domain: metadata.domain || 'General',
                businessGroup: metadata.businessGroup || 'Unknown',
                technologies: metadata.technologies || '',
                score: metadata.score || 0,
                submissionDate: metadata.created_at || new Date().toISOString(),
                matchScore: similarity,
                // Additional metadata for better display
                benefits: metadata.benefits || '',
                risks: metadata.risks || '',
                buildPhase: metadata.buildPhase || '',
                buildPreference: metadata.buildPreference || ''
            };
        });

        // Apply similarity threshold
        ideas = ideas.filter(idea => idea.matchScore >= minSimilarity);

        // Apply filters
        let filtered = ideas;

        if (filters.domain?.length > 0) {
            const domains = Array.isArray(filters.domain) ? filters.domain : [filters.domain];
            filtered = filtered.filter(idea =>
                domains.some(d => idea.domain.toLowerCase().includes(d.toLowerCase()))
            );
        }

        if (filters.businessGroup?.length > 0) {
            const groups = Array.isArray(filters.businessGroup) ? filters.businessGroup : [filters.businessGroup];
            filtered = filtered.filter(idea =>
                groups.some(g => idea.businessGroup.toLowerCase().includes(g.toLowerCase()))
            );
        }

        if (filters.techStack?.length > 0) {
            const techs = Array.isArray(filters.techStack) ? filters.techStack : [filters.techStack];
            filtered = filtered.filter(idea =>
                techs.some(t => idea.technologies.toLowerCase().includes(t.toLowerCase()))
            );
        }

        if (filters.year) {
            filtered = filtered.filter(idea => {
                if (!idea.submissionDate) return false;
                // Parse the submissionDate (created_at) to get the year
                const year = new Date(idea.submissionDate).getFullYear();
                return year === parseInt(filters.year);
            });
        }

        // Sort by match score
        filtered = filtered.sort((a, b) => b.matchScore - a.matchScore);

        // Calculate facets for filter preview (Con #9 fix)
        const facets = calculateFacets(filtered);

        // Apply pagination
        const total = filtered.length;
        const totalPages = Math.ceil(total / limit);
        const startIdx = (page - 1) * limit;
        const endIdx = startIdx + limit;
        const paginatedResults = filtered.slice(startIdx, endIdx);

        return {
            results: paginatedResults,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            },
            facets
        };

    } catch (error) {
        console.error('[Pro Search] Semantic search error:', error.message);
        return { results: [], pagination: { page: 1, limit, total: 0, totalPages: 0 }, facets: {} };
    }
}

/**
 * Calculate facet counts for available filters
 */
function calculateFacets(ideas) {
    const facets = {
        domains: {},
        businessGroups: {},
        technologies: {},
        buildPhases: {},
        years: {}
    };

    ideas.forEach(idea => {
        // Domain facets
        if (idea.domain) {
            facets.domains[idea.domain] = (facets.domains[idea.domain] || 0) + 1;
        }

        // Business group facets
        if (idea.businessGroup && idea.businessGroup !== 'Unknown') {
            facets.businessGroups[idea.businessGroup] = (facets.businessGroups[idea.businessGroup] || 0) + 1;
        }

        // Technology facets
        if (idea.technologies) {
            const techs = idea.technologies.split(',').map(t => t.trim()).filter(Boolean);
            techs.forEach(tech => {
                facets.technologies[tech] = (facets.technologies[tech] || 0) + 1;
            });
        }

        // Build phase facets
        if (idea.buildPhase) {
            facets.buildPhases[idea.buildPhase] = (facets.buildPhases[idea.buildPhase] || 0) + 1;
        }

        // Year facets
        if (idea.submissionDate) {
            const year = new Date(idea.submissionDate).getFullYear();
            facets.years[year] = (facets.years[year] || 0) + 1;
        }
    });

    // Sort facets by count (descending)
    Object.keys(facets).forEach(facetType => {
        const sorted = Object.entries(facets[facetType])
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10); // Top 10 per facet
        facets[facetType] = Object.fromEntries(sorted);
    });

    return facets;
}

/**
 * Parse filters from natural language query
 */
function parseFilters(query, additionalFilters = {}) {
    const filters = { ...additionalFilters };
    const normalizedQuery = query.toLowerCase();

    // Year detection
    const yearMatch = query.match(/\b(202[0-9]|2030)\b/);
    if (yearMatch) filters.year = parseInt(yearMatch[0]);

    // Domain detection keywords
    const domainMap = {
        'healthcare': ['healthcare', 'medical', 'hospital', 'patient', 'clinical', 'health'],
        'finance': ['finance', 'banking', 'payment', 'fintech', 'loan', 'financial'],
        'retail': ['retail', 'ecommerce', 'e-commerce', 'shop', 'store', 'inventory'],
        'ai': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'neural'],
        'cloud': ['cloud', 'aws', 'azure', 'gcp', 'infrastructure', 'serverless'],
        'security': ['security', 'cybersecurity', 'authentication', 'encryption']
    };

    for (const [domain, keywords] of Object.entries(domainMap)) {
        if (keywords.some(kw => normalizedQuery.includes(kw))) {
            if (!filters.domain) filters.domain = [];
            if (!filters.domain.includes(domain)) filters.domain.push(domain);
        }
    }

    return filters;
}
```### 
1. backend/routes/proSearchRoutes.js (Part 4 - AI Response & Main Route)

```javascript
/**
 * Generate AI-powered response using Gemini
 */
async function generateAIResponse(query, results, filters, nlpResult) {
    // Safety check
    if (!results) {
        console.error('[Pro Search] generateAIResponse called with undefined results');
        return 'Search completed. Please try refining your query.';
    }

    const count = results.length;

    // For no results
    if (count === 0) {
        let response = `I couldn't find any ideas matching "${query}".`;
        if (nlpResult?.corrected && nlpResult.corrected !== nlpResult.original) {
            response += ` I also searched for "${nlpResult.corrected}".`;
        }
        response += ' Try using different keywords or broader terms.';
        return response;
    }

    // Try AI-generated response
    if (isGeminiAvailable() && count > 0) {
        try {
            const topIdeas = results.slice(0, 3).map(r => r.title).join(', ');
            const domains = [...new Set(results.slice(0, 5).map(r => r.domain))].join(', ');

            const prompt = `You are a helpful assistant for an innovation idea repository. 
A user searched for: "${query}"
Found ${count} matching ideas. Top results: ${topIdeas}
Domains covered: ${domains}

Write a brief, friendly 1-2 sentence response summarizing what was found. Be concise and helpful.
Do NOT reveal any confidential information or discuss topics outside of idea search.`;

            const aiText = await generateText(prompt, { maxOutputTokens: 150, temperature: 0.7 });
            if (aiText && aiText.length > 10) {
                return aiText.trim();
            }
        } catch (error) {
            // Detect quota exceeded errors
            const isQuotaError = error.message?.includes('quota') ||
                error.message?.includes('429') ||
                error.message?.includes('Too Many Requests');

            if (isQuotaError) {
                console.warn('[Pro Search] ⚠️  Gemini API quota exceeded - using fallback response. The API will automatically retry once quota resets.');
            } else {
                console.warn('[Pro Search] AI response generation failed:', error.message);
            }
            // Falls through to static fallback response below
        }
    }

    // Fallback response
    let response = `Found ${count} idea${count > 1 ? 's' : ''} matching your search`;

    const filterParts = [];
    if (filters.year) filterParts.push(`from ${filters.year}`);
    if (filters.domain?.length) filterParts.push(`in ${filters.domain.join(', ')}`);
    if (filters.businessGroup?.length) filterParts.push(`for ${filters.businessGroup.join(', ')}`);

    if (filterParts.length > 0) response += ` ${filterParts.join(' ')}`;

    if (nlpResult?.corrected && nlpResult.corrected !== nlpResult.original) {
        response += `. (Searched: "${nlpResult.corrected}")`;
    }

    response += '.';

    // Add insight
    if (count > 0) {
        const topDomains = [...new Set(results.slice(0, 5).map(r => r.domain).filter(Boolean))];
        if (topDomains.length > 0) {
            response += ` Top domains: ${topDomains.slice(0, 3).join(', ')}.`;
        }
    }

    return response;
}

/**
 * Generate smart suggestions
 */
function generateSuggestions(query, results, filters) {
    const suggestions = new Set();

    // Safety check
    if (!results || !Array.isArray(results)) {
        return ['Show latest ideas', 'AI and ML projects', 'Healthcare innovations'];
    }

    // Based on results
    if (results.length > 0) {
        const topDomains = [...new Set(results.slice(0, 5).map(r => r.domain).filter(Boolean))];
        if (topDomains[0]) suggestions.add(`More ${topDomains[0]} ideas`);

        const topTechs = [...new Set(results.slice(0, 5).map(r => r.technologies).filter(Boolean))];
        if (topTechs[0]) suggestions.add(`${topTechs[0]} projects`);
    }

    // Filter suggestions
    if (!filters.year) suggestions.add('Ideas from 2024');
    if (!filters.businessGroup?.length) suggestions.add('Filter by business group');

    // Default suggestions
    suggestions.add('Show latest ideas');
    suggestions.add('AI and ML projects');
    suggestions.add('Healthcare innovations');

    return Array.from(suggestions).slice(0, 4);
}

/**
 * POST /api/search/conversational - Main Pro Search endpoint
 */
router.post('/conversational', async (req, res) => {
    const startTime = Date.now();

    try {
        const {
            query,
            additionalFilters = {},
            page = 1,
            limit = 20,
            minSimilarity = 30,
            overrideValidation = false
        } = req.body;

        // Validate input
        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: true,
                message: 'Query is required'
            });
        }

        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 2) {
            return res.status(400).json({
                error: true,
                message: 'Query too short'
            });
        }

        // STEP 1: Context Validation - Block off-topic/confidential queries
        const validation = validateQuery(trimmedQuery);

        // Handle greetings specially
        if (validation.isGreeting) {
            console.log(`[Pro Search] Greeting detected: "${trimmedQuery}"`);
            return res.json({
                results: [],
                aiResponse: "Hi there! 👋 I'm your Pro Search assistant. I can help you discover innovation ideas and projects. Try asking me things like:\n\n• \"Show me latest AI projects\"\n• \"Find healthcare innovations\"\n• \"Search for React applications\"\n\nWhat would you like to explore today?",
                suggestions: ['Show me latest ideas', 'Find AI projects', 'Healthcare innovations', 'Cloud solutions'],
                pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
                facets: {},
                metadata: {
                    intent: 'greeting',
                    filters: {},
                    totalResults: 0
                }
            });
        }

        if (!validation.valid) {
            console.log(`[Pro Search] Rejected query: "${trimmedQuery}" - ${validation.reason}`);
            const errorMsg = generateErrorMessage(validation.reason, validation.suggestion);
            return res.json({
                results: [],
                aiResponse: errorMsg + "\n\n💡 Tip: You can add 'overrideValidation: true' to bypass validation if this is a legitimate query.",
                suggestions: ['Show me latest ideas', 'Find AI projects', 'Healthcare innovations'],
                pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
                facets: {},
                metadata: {
                    intent: 'rejected',
                    reason: validation.reason,
                    canOverride: true,
                    filters: {},
                    totalResults: 0
                }
            });
        }

        console.log(`[Pro Search] Processing: "${trimmedQuery}" (page ${page}, limit ${limit}, similarity >= ${minSimilarity}%)`);

        // Get database pool
        const pool = req.app.get('db');
        if (!pool) {
            return res.status(503).json({
                error: true,
                message: 'Database not available'
            });
        }

        // STEP 2: Index ideas to ChromaDB (if needed)
        await indexIdeasToChroma(pool);

        // STEP 3: NLP Processing - Spell correction & query expansion
        const apiKey = process.env.API_KEY;
        const nlpResult = await enhanceQuery(trimmedQuery, {
            useAI: !!apiKey && isGeminiAvailable(),
            apiKey,
            model: 'gemini-2.5-flash'
        });

        console.log(`[Pro Search] NLP: "${trimmedQuery}" → "${nlpResult.corrected}"`);

        // STEP 4: Parse filters from query
        const filters = parseFilters(nlpResult.corrected, additionalFilters);

        // STEP 5: Semantic search using ChromaDB + Gemini embeddings
        const searchQuery = nlpResult.expanded?.join(' ') || nlpResult.corrected;
        let searchResult = await semanticSearch(searchQuery, filters, page, limit, minSimilarity);

        // STEP 6: Fallback to database if no semantic results (only on first page)
        if (searchResult.results.length === 0 && page === 1) {
            console.log('[Pro Search] No semantic results, trying keyword search...');

            // Use multiple search terms from NLP processing
            const searchTerms = nlpResult.tokens || trimmedQuery.split(/\s+/);
            const primaryTerm = searchTerms[0] || trimmedQuery;

            // Build dynamic OR conditions for better matching
            let whereConditions = [];
            let params = [];
            let paramIndex = 1;

            // Add conditions for each significant term (max 3)
            const significantTerms = searchTerms.filter(t => t.length > 2).slice(0, 3);

            for (const term of significantTerms) {
                whereConditions.push(`(title ILIKE $${paramIndex} OR summary ILIKE $${paramIndex} OR challenge_opportunity ILIKE $${paramIndex} OR code_preference ILIKE $${paramIndex})`);
                params.push(`%${term}%`);
                paramIndex++;
            }

            // Fallback if no terms
            if (whereConditions.length === 0) {
                whereConditions.push(`(title ILIKE $1 OR summary ILIKE $1)`);
                params.push(`%${primaryTerm}%`);
            }

            const dbResult = await pool.query(`
                SELECT idea_id, title, summary as description,
                       challenge_opportunity as domain, business_group as "businessGroup",
                       COALESCE(code_preference, '') as technologies,
                       created_at as "submissionDate", score
                FROM ideas
                WHERE ${whereConditions.join(' OR ')}
                ORDER BY score DESC, created_at DESC
                LIMIT ${limit * 5}
            `, params);

            const dbResults = dbResult.rows.map(row => ({
                id: `IDEA-${row.idea_id}`, // Format as string ID for frontend
                dbId: row.idea_id, // Keep numeric ID for database operations
                title: row.title,
                description: row.description,
                domain: row.domain || 'General',
                businessGroup: row.businessGroup || 'Unknown',
                technologies: row.technologies || '',
                submissionDate: row.submissionDate,
                score: row.score || 0,
                matchScore: 65 // Default score for keyword results
            }));

            console.log(`[Pro Search] Keyword search found ${dbResults.length} results`);

            // Apply pagination to fallback results
            const total = dbResults.length;
            const totalPages = Math.ceil(total / limit);
            const startIdx = (page - 1) * limit;
            const endIdx = startIdx + limit;

            searchResult = {
                results: dbResults.slice(startIdx, endIdx),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                },
                facets: calculateFacets(dbResults)
            };
        }

        // STEP 7: Generate AI response (only on first page)
        const aiResponse = page === 1
            ? await generateAIResponse(trimmedQuery, searchResult.results, filters, nlpResult)
            : `Showing page ${page} of ${searchResult.pagination.totalPages}`;

        // STEP 8: Generate suggestions (only on first page)
        const suggestions = page === 1
            ? generateSuggestions(trimmedQuery, searchResult.results, filters)
            : [];

        const duration = Date.now() - startTime;
        console.log(`[Pro Search] Completed in ${duration}ms, ${searchResult.pagination.total} total results, page ${page}/${searchResult.pagination.totalPages}`);

        res.json({
            results: searchResult.results,
            aiResponse,
            suggestions,
            pagination: searchResult.pagination,
            facets: searchResult.facets,
            metadata: {
                intent: 'search',
                filters,
                totalResults: searchResult.pagination.total,
                processingTime: duration,
                nlp: nlpResult,
                page: searchResult.pagination.page
            }
        });

    } catch (error) {
        console.error('[Pro Search] Error:', error);
        console.error('[Pro Search] Stack:', error.stack);
        res.status(500).json({
            error: true,
            message: 'Search failed. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});
```###
 1. backend/routes/proSearchRoutes.js (Part 5 - Additional Routes)

```javascript
/**
 * GET /api/search/suggestions - Get search suggestions
 */
router.get('/suggestions', async (req, res) => {
    try {
        const suggestions = [
            'Show me latest ideas',
            'Find AI and ML projects',
            'Healthcare innovations',
            'Cloud infrastructure solutions',
            'Customer experience improvements',
            'Automation projects'
        ];
        res.json({ suggestions });
    } catch (error) {
        console.error('[Pro Search] Suggestions error:', error);
        res.status(500).json({ error: true, message: 'Failed to get suggestions' });
    }
});

/**
 * POST /api/search/reindex - Force reindex ideas
 */
router.post('/reindex', async (req, res) => {
    try {
        const pool = req.app.get('db');
        if (!pool) {
            return res.status(503).json({ error: true, message: 'Database not available' });
        }

        // Reset to force reindex
        lastIndexTime = null;
        const chromaClient = getChromaClient();
        chromaClient.deleteCollection('ideas_search');

        await indexIdeasToChroma(pool);

        res.json({
            success: true,
            message: 'Ideas reindexed successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Pro Search] Reindex error:', error);
        res.status(500).json({ error: true, message: 'Reindex failed' });
    }
});

/**
 * GET /api/search/health - Health check
 */
router.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        gemini: isGeminiAvailable(),
        chromaDB: false,
        timestamp: new Date().toISOString()
    };

    try {
        const chromaClient = getChromaClient();
        health.chromaDB = chromaClient.hasCollection('ideas_search');
        if (health.chromaDB) {
            const stats = chromaClient.getStats('ideas_search');
            health.indexedIdeas = stats?.documentCount || 0;
        }
    } catch (e) {
        health.chromaDB = false;
    }

    res.json(health);
});

export default router;
```

### 2. backend/routes/proSearchContextRoutes.js

```javascript
/**
 * Context Management for Pro Search
 * Save, load, and clear user search context with filters
 */

import { Router } from 'express';
const contextsRouter = Router();

// In-memory storage for user contexts (should be replaced with DB in production)
const userContexts = new Map();

/**
 * GET /api/search/context/:userId
 * Get saved context for user
 */
contextsRouter.get('/context/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const context = userContexts.get(userId) || null;

        res.json({
            success: true,
            context: context || {
                filters: {},
                savedAt: null
            }
        });
    } catch (error) {
        console.error('[Pro Search Context] Get error:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to get context'
        });
    }
});

/**
 * POST /api/search/context/save
 * Save current search context
 */
contextsRouter.post('/context/save', async (req, res) => {
    try {
        const { userId, filters, query, minSimilarity, pagination } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: true,
                message: 'userId is required'
            });
        }

        const context = {
            filters: filters || {},
            query: query || '',
            minSimilarity: minSimilarity || 30,
            pagination: pagination || { page: 1, limit: 20 },
            savedAt: new Date().toISOString()
        };

        userContexts.set(userId, context);

        console.log(`[Pro Search Context] Saved for user ${userId}:`, {
            filtersCount: Object.keys(context.filters).length,
            query: context.query,
            minSimilarity: context.minSimilarity
        });

        res.json({
            success: true,
            context,
            message: 'Context saved successfully'
        });
    } catch (error) {
        console.error('[Pro Search Context] Save error:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to save context'
        });
    }
});

/**
 * DELETE /api/search/context/:userId
 * Clear saved context for user
 */
contextsRouter.delete('/context/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const hadContext = userContexts.has(userId);
        userContexts.delete(userId);

        console.log(`[Pro Search Context] Cleared for user ${userId}`);

        res.json({
            success: true,
            message: hadContext ? 'Context cleared successfully' : 'No context to clear'
        });
    } catch (error) {
        console.error('[Pro Search Context] Clear error:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to clear context'
        });
    }
});

export { contextsRouter };
```

### 3. backend/routes/chatHistoryRoutes.js

```javascript
/**
 * Chat History Routes for Pro Search
 * Stores and retrieves chat sessions and messages
 */

import express from 'express';

const router = express.Router();

// Get pool from app
const getPool = (req) => req.app.get('db');

/**
 * GET /api/chat/sessions - Get all chat sessions for a user
 */
router.get('/sessions', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not connected' });

    try {
        const userId = req.session?.userId || req.headers['x-user-id'] || 'anonymous';
        
        const result = await pool.query(`
            SELECT 
                cs.id,
                cs.title,
                cs.created_at,
                cs.updated_at,
                COUNT(cm.id) as message_count
            FROM chat_sessions cs
            LEFT JOIN chat_messages cm ON cs.id = cm.session_id
            WHERE cs.user_id = $1
            GROUP BY cs.id
            ORDER BY cs.updated_at DESC
            LIMIT 50
        `, [userId]);

        // Group sessions by date
        const grouped = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);

        result.rows.forEach(session => {
            const date = new Date(session.created_at);
            date.setHours(0, 0, 0, 0);

            let dateKey;
            if (date.getTime() === today.getTime()) {
                dateKey = 'Today';
            } else if (date.getTime() === yesterday.getTime()) {
                dateKey = 'Yesterday';
            } else if (date > lastWeek) {
                dateKey = 'Last 7 Days';
            } else {
                dateKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            }

            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push({
                id: session.id,
                title: session.title,
                messageCount: parseInt(session.message_count),
                createdAt: session.created_at,
                updatedAt: session.updated_at
            });
        });

        res.json({ sessions: grouped });
    } catch (err) {
        console.error('[ChatHistory] Error fetching sessions:', err);
        res.status(500).json({ error: 'Failed to fetch chat sessions' });
    }
});

/**
 * POST /api/chat/sessions - Create a new chat session
 */
router.post('/sessions', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not connected' });

    try {
        const userId = req.session?.userId || req.headers['x-user-id'] || 'anonymous';
        const { title } = req.body;

        const result = await pool.query(`
            INSERT INTO chat_sessions (user_id, title)
            VALUES ($1, $2)
            RETURNING id, title, created_at, updated_at
        `, [userId, title || 'New Chat']);

        res.json({ session: result.rows[0] });
    } catch (err) {
        console.error('[ChatHistory] Error creating session:', err);
        res.status(500).json({ error: 'Failed to create chat session' });
    }
});
```#
## 3. backend/routes/chatHistoryRoutes.js (continued)

```javascript
/**
 * GET /api/chat/sessions/:sessionId/messages - Get messages for a session
 */
router.get('/sessions/:sessionId/messages', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not connected' });

    try {
        const { sessionId } = req.params;
        
        const result = await pool.query(`
            SELECT id, role, content, metadata, created_at
            FROM chat_messages
            WHERE session_id = $1
            ORDER BY created_at ASC
        `, [sessionId]);

        const messages = result.rows.map(msg => {
            // Ensure metadata is parsed if it's a string
            let parsedMetadata = msg.metadata;
            if (typeof msg.metadata === 'string') {
                try {
                    parsedMetadata = JSON.parse(msg.metadata);
                } catch (e) {
                    console.warn('[ChatHistory] Failed to parse metadata:', e);
                    parsedMetadata = null;
                }
            }
            
            return {
                id: msg.id,
                role: msg.role,
                content: msg.content,
                metadata: parsedMetadata,
                timestamp: msg.created_at
            };
        });

        // Log for debugging
        const msgWithResults = messages.filter(m => m.metadata?.results?.length > 0);
        console.log(`[ChatHistory] Loaded ${messages.length} messages, ${msgWithResults.length} with results`);

        res.json({ messages });
    } catch (err) {
        console.error('[ChatHistory] Error fetching messages:', err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

/**
 * POST /api/chat/sessions/:sessionId/messages - Add a message to a session
 */
router.post('/sessions/:sessionId/messages', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not connected' });

    try {
        const { sessionId } = req.params;
        const { role, content, metadata } = req.body;

        // Store more results for better session restoration (top 50)
        let processedMetadata = metadata;
        if (metadata?.results && Array.isArray(metadata.results)) {
            console.log(`[ChatHistory] Saving message with ${metadata.results.length} results`);
            processedMetadata = {
                ...metadata,
                results: metadata.results.slice(0, 50).map((r) => ({
                    id: r.id,
                    dbId: r.dbId,
                    title: r.title,
                    description: r.description?.substring(0, 300),
                    domain: r.domain,
                    businessGroup: r.businessGroup,
                    technologies: r.technologies,
                    buildPhase: r.buildPhase,
                    scalability: r.scalability,
                    novelty: r.novelty,
                    score: r.score,
                    submissionDate: r.submissionDate,
                    matchScore: r.matchScore
                })),
                resultsCount: metadata.results.length
            };
            console.log(`[ChatHistory] Processed ${processedMetadata.results.length} results for storage`);
        }

        // Insert message - PostgreSQL JSONB accepts objects directly
        const msgResult = await pool.query(`
            INSERT INTO chat_messages (session_id, role, content, metadata)
            VALUES ($1, $2, $3, $4::jsonb)
            RETURNING id, role, content, metadata, created_at
        `, [sessionId, role, content, processedMetadata ? JSON.stringify(processedMetadata) : null]);

        // Update session title if first user message
        if (role === 'user') {
            const countResult = await pool.query(
                'SELECT COUNT(*) FROM chat_messages WHERE session_id = $1 AND role = $2',
                [sessionId, 'user']
            );
            
            if (parseInt(countResult.rows[0].count) === 1) {
                const title = content.length > 50 ? content.substring(0, 47) + '...' : content;
                await pool.query(
                    'UPDATE chat_sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [title, sessionId]
                );
            } else {
                await pool.query(
                    'UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [sessionId]
                );
            }
        }

        res.json({ 
            message: {
                id: msgResult.rows[0].id,
                role: msgResult.rows[0].role,
                content: msgResult.rows[0].content,
                metadata: msgResult.rows[0].metadata,
                timestamp: msgResult.rows[0].created_at
            }
        });
    } catch (err) {
        console.error('[ChatHistory] Error adding message:', err);
        res.status(500).json({ error: 'Failed to add message' });
    }
});

/**
 * DELETE /api/chat/sessions/:sessionId - Delete a chat session
 */
router.delete('/sessions/:sessionId', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not connected' });

    try {
        const { sessionId } = req.params;
        const userId = req.session?.userId || req.headers['x-user-id'] || 'anonymous';

        await pool.query('DELETE FROM chat_messages WHERE session_id = $1', [sessionId]);
        await pool.query(
            'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2',
            [sessionId, userId]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('[ChatHistory] Error deleting session:', err);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

/**
 * PATCH /api/chat/sessions/:sessionId - Rename a chat session
 */
router.patch('/sessions/:sessionId', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ error: 'Database not connected' });

    try {
        const { sessionId } = req.params;
        const { title } = req.body;
        const userId = req.session?.userId || req.headers['x-user-id'] || 'anonymous';

        const result = await pool.query(`
            UPDATE chat_sessions 
            SET title = $1, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $2 AND user_id = $3
            RETURNING id, title, updated_at
        `, [title, sessionId, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json({ session: result.rows[0] });
    } catch (err) {
        console.error('[ChatHistory] Error renaming session:', err);
        res.status(500).json({ error: 'Failed to rename session' });
    }
});

export default router;
```

---

## Backend Services

### 1. backend/services/semanticSearch.js

```javascript
import { getEmbeddingVector } from './embeddingProvider.js';

/**
 * Perform semantic search on idea submissions
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Object} db - PostgreSQL database instance
 * @param {string} query - Search query
 * @param {string} embeddingProvider - 'gemini', 'grok' or 'llama'
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Array of similar ideas with metadata
 */
export async function searchSimilarIdeas(chromaClient, db, query, embeddingProvider = 'gemini', limit = 10) {
    try {
        console.log(`[SemanticSearch] Searching for ideas similar to: "${query}"`);

        // Generate embedding for the query
        const queryEmbedding = await getEmbeddingVector(query, embeddingProvider);
        console.log(`[SemanticSearch] Generated query embedding (${queryEmbedding.length} dimensions)`);

        // Get or create ideas collection
        const collection = await chromaClient.getOrCreateCollection({
            name: 'ideas_collection',
            metadata: { description: 'Innovation idea submissions' }
        });

        // Perform vector similarity search
        const results = await collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: limit
        });

        console.log(`[SemanticSearch] Found ${results.ids[0]?.length || 0} similar ideas`);

        if (!results.ids[0] || results.ids[0].length === 0) {
            return [];
        }

        // Extract idea IDs and distances
        const ideaIds = results.ids[0];
        const distances = results.distances[0];
        const metadatas = results.metadatas[0];

        // Fetch full idea details from PostgreSQL
        const ideasWithScores = [];

        for (let i = 0; i < ideaIds.length; i++) {
            const ideaId = ideaIds[i];
            const distance = distances[i];
            const metadata = metadatas[i];

            // Convert distance to similarity score (0-1, higher is better)
            // ChromaDB uses L2 distance, so smaller distance = more similar
            // Typical L2 distance range: 0 (identical) to 2+ (very different)
            // Use exponential decay for better score distribution
            let similarity;
            if (distance === 0) {
                similarity = 1.0;
            } else if (distance < 0.5) {
                similarity = 0.95 - (distance * 0.2);  // 0.95-0.85 for very similar
            } else if (distance < 1.0) {
                similarity = 0.85 - ((distance - 0.5) * 0.4);  // 0.85-0.65 for similar
            } else if (distance < 1.5) {
                similarity = 0.65 - ((distance - 1.0) * 0.3);  // 0.65-0.50 for somewhat similar
            } else {
                similarity = Math.max(0.1, 0.50 - ((distance - 1.5) * 0.2));  // 0.50-0.10 for less similar
            }

            // Ensure similarity is in 0-1 range
            similarity = Math.max(0, Math.min(1, similarity));

            try {
                // Fetch idea from database using correct schema
                // ChromaDB stores idea_id as string, PostgreSQL expects integer
                const numericId = ideaId.toString().replace('IDEA-', '');

                const ideaResult = await db.query(
                    `SELECT 
                        i.idea_id,
                        i.title,
                        i.summary as description,
                        i.challenge_opportunity as category,
                        i.build_phase as status,
                        i.business_group as team,
                        i.code_preference as tags,
                        i.created_at
                    FROM ideas i
                    WHERE i.idea_id = $1`,
                    [numericId]
                );

                if (ideaResult.rows.length > 0) {
                    const idea = ideaResult.rows[0];

                    // Parse tags from comma-separated string to array
                    let tagsArray = [];
                    if (idea.tags && typeof idea.tags === 'string') {
                        tagsArray = idea.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
                    }

                    ideasWithScores.push({
                        id: `IDEA-${idea.idea_id}`,
                        title: idea.title || 'Untitled',
                        description: idea.description || '',
                        team: idea.team || 'Unknown',
                        tags: tagsArray,
                        similarity: parseFloat(similarity.toFixed(3)),
                        createdAt: idea.created_at,
                        category: idea.category || metadata?.category,
                        status: idea.status || metadata?.status || 'Submitted'
                    });
                }
            } catch (dbError) {
                console.error(`[SemanticSearch] Error fetching idea ${ideaId}:`, dbError.message);
            }
        }

        // Sort by similarity score (highest first)
        ideasWithScores.sort((a, b) => b.similarity - a.similarity);

        console.log(`[SemanticSearch] Returning ${ideasWithScores.length} ideas with details`);
        return ideasWithScores;

    } catch (error) {
        console.error('[SemanticSearch] Error performing semantic search:', error.message);
        throw error;
    }
}

/**
 * Index an idea in the vector database with retry logic
 * @param {Object} chromaClient - ChromaDB client instance
 * @param {Object} idea - Idea object with id, title, description
 * @param {string} embeddingProvider - 'gemini', 'grok' or 'llama'
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function indexIdea(chromaClient, idea, embeddingProvider = 'gemini', maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[SemanticSearch] Indexing idea: ${idea.id} (attempt ${attempt}/${maxRetries})`);

            // Create text for embedding (title + description)
            const text = `${idea.title}\n${idea.description}`;

            // Generate embedding with retry
            const embedding = await getEmbeddingVector(text, embeddingProvider);

            // Get or create collection
            const collection = await chromaClient.getOrCreateCollection({
                name: 'ideas_collection',
                metadata: { description: 'Innovation idea submissions' }
            });

            // Add to collection
            await collection.add({
                ids: [idea.id.toString()],
                embeddings: [embedding],
                metadatas: [{
                    title: idea.title,
                    team: idea.team || '',
                    category: idea.category || '',
                    status: idea.status || 'submitted'
                }],
                documents: [text]
            });

            console.log(`[SemanticSearch] Successfully indexed idea: ${idea.id}`);
            return true;

        } catch (error) {
            lastError = error;
            console.error(`[SemanticSearch] Error indexing idea ${idea.id} (attempt ${attempt}/${maxRetries}):`, error.message);

            // Exponential backoff before retry
            if (attempt < maxRetries) {
                const waitTime = Math.pow(2, attempt) * 1000;
                console.log(`[SemanticSearch] Retrying in ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    // Graceful degradation - log error but don't throw
    console.error(`[SemanticSearch] Failed to index idea ${idea.id} after ${maxRetries} attempts. Continuing without indexing.`);
    return false;
}
```### 
2. backend/services/researchService.js

```javascript
/**
 * Research Service
 * Handles research mode, tagging, and context-aware follow-up queries
 */

/**
 * Tag an idea with user-defined label
 */
export async function tagIdea(pool, userId, ideaId, tag, notes = null, contextSnapshot = null) {
    try {
        const result = await pool.query(`
            INSERT INTO search_result_tags (user_id, idea_id, tag, notes, context_snapshot)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, idea_id, tag)
            DO UPDATE SET notes = $4, context_snapshot = $5
            RETURNING *
        `, [userId, ideaId, tag, notes, contextSnapshot ? JSON.stringify(contextSnapshot) : null]);

        return result.rows[0];
    } catch (error) {
        console.error('[Research] Failed to tag idea:', error);
        throw error;
    }
}

/**
 * Remove tag from idea
 */
export async function untagIdea(pool, userId, ideaId, tag) {
    try {
        await pool.query(`
            DELETE FROM search_result_tags
            WHERE user_id = $1 AND idea_id = $2 AND tag = $3
        `, [userId, ideaId, tag]);
        return true;
    } catch (error) {
        console.error('[Research] Failed to untag idea:', error);
        return false;
    }
}

/**
 * Get all tags for a user
 */
export async function getUserTags(pool, userId) {
    try {
        const result = await pool.query(`
            SELECT DISTINCT tag, COUNT(*) as count
            FROM search_result_tags
            WHERE user_id = $1
            GROUP BY tag
            ORDER BY count DESC
        `, [userId]);
        return result.rows;
    } catch (error) {
        console.error('[Research] Failed to get user tags:', error);
        return [];
    }
}

/**
 * Get ideas by tag
 */
export async function getIdeasByTag(pool, userId, tag) {
    try {
        const result = await pool.query(`
            SELECT 
                i.idea_id,
                i.title,
                i.summary,
                i.challenge_opportunity as domain,
                i.business_group as "businessGroup",
                i.code_preference as technologies,
                i.score,
                i.created_at,
                t.notes,
                t.created_at as tagged_at
            FROM search_result_tags t
            JOIN ideas i ON t.idea_id = i.idea_id
            WHERE t.user_id = $1 AND t.tag = $2
            ORDER BY t.created_at DESC
        `, [userId, tag]);

        return result.rows.map(row => ({
            id: `IDEA-${row.idea_id}`,
            dbId: row.idea_id,
            title: row.title,
            description: row.summary,
            domain: row.domain,
            businessGroup: row.businessGroup,
            technologies: row.technologies,
            score: row.score,
            submissionDate: row.created_at,
            notes: row.notes,
            taggedAt: row.tagged_at
        }));
    } catch (error) {
        console.error('[Research] Failed to get ideas by tag:', error);
        return [];
    }
}

/**
 * Enable research mode for a session
 */
export async function enableResearchMode(pool, userId, sessionId, baseContext) {
    try {
        await pool.query(`
            UPDATE user_search_contexts
            SET research_mode = TRUE, research_context = $3, updated_at = NOW()
            WHERE user_id = $1 AND session_id = $2
        `, [userId, sessionId, JSON.stringify(baseContext)]);
        return true;
    } catch (error) {
        console.error('[Research] Failed to enable research mode:', error);
        return false;
    }
}

/**
 * Find similar ideas to a given idea
 */
export async function findSimilarIdeas(pool, ideaId, limit = 10) {
    try {
        // Get the source idea
        const sourceResult = await pool.query(`
            SELECT title, summary, challenge_opportunity, code_preference, business_group
            FROM ideas WHERE idea_id = $1
        `, [ideaId]);

        if (sourceResult.rows.length === 0) {
            return [];
        }

        const source = sourceResult.rows[0];

        // Find similar ideas based on domain and technologies
        const result = await pool.query(`
            SELECT 
                idea_id,
                title,
                summary,
                challenge_opportunity as domain,
                business_group as "businessGroup",
                code_preference as technologies,
                score,
                created_at
            FROM ideas
            WHERE idea_id != $1
            AND (
                challenge_opportunity = $2
                OR business_group = $3
                OR code_preference ILIKE $4
            )
            ORDER BY 
                CASE WHEN challenge_opportunity = $2 THEN 1 ELSE 0 END +
                CASE WHEN business_group = $3 THEN 1 ELSE 0 END +
                CASE WHEN code_preference ILIKE $4 THEN 1 ELSE 0 END DESC,
                score DESC
            LIMIT $5
        `, [
            ideaId,
            source.challenge_opportunity,
            source.business_group,
            `%${source.code_preference || ''}%`,
            limit
        ]);

        return result.rows.map(row => ({
            id: `IDEA-${row.idea_id}`,
            dbId: row.idea_id,
            title: row.title,
            description: row.summary,
            domain: row.domain,
            businessGroup: row.businessGroup,
            technologies: row.technologies,
            score: row.score,
            submissionDate: row.created_at,
            matchScore: 75 // Similarity score
        }));
    } catch (error) {
        console.error('[Research] Failed to find similar ideas:', error);
        return [];
    }
}

/**
 * Add context/refinement to existing search
 */
export function refineSearchContext(existingContext, refinement) {
    const refined = { ...existingContext };

    // Parse refinement for additional filters
    const lowerRefinement = refinement.toLowerCase();

    // Add technology refinements
    const techPatterns = {
        'cybersecurity': ['security', 'cybersecurity', 'encryption'],
        'ai': ['ai', 'machine learning', 'ml', 'deep learning'],
        'cloud': ['cloud', 'aws', 'azure', 'gcp'],
        'blockchain': ['blockchain', 'web3', 'crypto'],
        'mobile': ['mobile', 'ios', 'android', 'flutter']
    };

    for (const [tech, keywords] of Object.entries(techPatterns)) {
        if (keywords.some(k => lowerRefinement.includes(k))) {
            if (!refined.technologies) refined.technologies = [];
            if (!refined.technologies.includes(tech)) {
                refined.technologies.push(tech);
            }
        }
    }

    // Add domain refinements
    const domainPatterns = {
        'healthcare': ['healthcare', 'medical', 'health'],
        'finance': ['finance', 'banking', 'fintech'],
        'retail': ['retail', 'ecommerce', 'shopping']
    };

    for (const [domain, keywords] of Object.entries(domainPatterns)) {
        if (keywords.some(k => lowerRefinement.includes(k))) {
            if (!refined.domains) refined.domains = [];
            if (!refined.domains.includes(domain)) {
                refined.domains.push(domain);
            }
        }
    }

    // Add keywords
    const words = refinement.split(/\s+/).filter(w => w.length > 3);
    if (!refined.keywords) refined.keywords = [];
    refined.keywords = [...new Set([...refined.keywords, ...words])].slice(0, 20);

    return refined;
}

/**
 * Parse research commands from user input
 */
export function parseResearchCommand(input) {
    const lowerInput = input.toLowerCase().trim();

    // Similar ideas command
    if (lowerInput.startsWith('similar to') || lowerInput.includes('show similar')) {
        const match = input.match(/idea[- ]?(\d+)/i);
        if (match) {
            return { command: 'similar', ideaId: parseInt(match[1]) };
        }
    }

    // Tag command
    if (lowerInput.startsWith('tag ') || lowerInput.startsWith('bookmark ')) {
        const match = input.match(/(?:tag|bookmark)\s+idea[- ]?(\d+)\s+(?:as|with)?\s*(.+)/i);
        if (match) {
            return { command: 'tag', ideaId: parseInt(match[1]), tag: match[2].trim() };
        }
    }

    // Show tagged
    if (lowerInput.includes('show tagged') || lowerInput.includes('my tags')) {
        const tagMatch = input.match(/tagged\s+(?:as|with)?\s*(.+)/i);
        return { command: 'showTagged', tag: tagMatch ? tagMatch[1].trim() : null };
    }

    // Refine/focus command
    if (lowerInput.startsWith('focus on') || lowerInput.startsWith('refine to') || lowerInput.startsWith('add context')) {
        const context = input.replace(/^(focus on|refine to|add context)\s*/i, '').trim();
        return { command: 'refine', context };
    }

    return { command: 'search', query: input };
}

export default {
    tagIdea,
    untagIdea,
    getUserTags,
    getIdeasByTag,
    enableResearchMode,
    findSimilarIdeas,
    refineSearchContext,
    parseResearchCommand
};
```

### 3. backend/services/optimizedIndexer.js

```javascript
/**
 * Optimized Indexer Service v2.0
 * High-performance indexing for ChromaDB with:
 * - Parallel batch processing
 * - Efficient embedding caching
 * - Dynamic field indexing from ideas table
 */

import { getChromaClient } from '../config/chroma.js';

// Pre-computed embeddings cache (in-memory for speed)
const embeddingCache = new Map();
const CACHE_MAX_SIZE = 10000;

// All searchable fields from ideas table
const IDEA_TEXT_FIELDS = [
    'title', 'summary', 'challenge_opportunity', 'scalability', 'novelty',
    'benefits', 'risks', 'responsible_ai', 'additional_info', 'timeline',
    'success_metrics', 'expected_outcomes', 'scalability_potential',
    'business_model', 'competitive_analysis', 'risk_mitigation',
    'build_phase', 'build_preference', 'code_preference', 'business_group'
];

// Filterable metadata fields
const IDEA_METADATA_FIELDS = [
    'idea_id', 'title', 'summary', 'challenge_opportunity', 'business_group',
    'code_preference', 'build_phase', 'build_preference', 'scalability',
    'novelty', 'timeline', 'participation_week', 'score', 'created_at',
    'benefits', 'risks', 'responsible_ai'
];

/**
 * Ultra-fast local embedding generator with caching
 * Optimized for speed while maintaining semantic quality
 */
function generateFastEmbedding(text) {
    const EMBEDDING_DIM = 768;
    
    if (!text || text.length === 0) {
        return new Array(EMBEDDING_DIM).fill(0);
    }

    // Check cache first (use first 300 chars as key for better cache hits)
    const cacheKey = text.toLowerCase().substring(0, 300);
    if (embeddingCache.has(cacheKey)) {
        return embeddingCache.get(cacheKey);
    }

    const embedding = new Float32Array(EMBEDDING_DIM);
    const lowerText = text.toLowerCase();

    // Extract bigrams (2-word phrases) for compound term matching
    const words = lowerText
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);

    if (words.length === 0) {
        return Array.from(embedding);
    }

    // Create bigrams for compound terms
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
        bigrams.push(`${words[i]}_${words[i + 1]}`);
    }

    // Word frequency with fast Map
    const termFreq = new Map();
    
    // Add individual words
    for (const word of words) {
        termFreq.set(word, (termFreq.get(word) || 0) + 1);
    }
    
    // Add bigrams with higher weight for compound term matching
    for (const bigram of bigrams) {
        termFreq.set(bigram, (termFreq.get(bigram) || 0) + 1.5);
    }

    // Generate embedding using multiple hash functions
    const totalTerms = words.length + bigrams.length;
    for (const [term, freq] of termFreq) {
        // FNV-1a hash for better distribution
        let hash = 2166136261;
        for (let i = 0; i < term.length; i++) {
            hash ^= term.charCodeAt(i);
            hash = (hash * 16777619) >>> 0;
        }
        
        // Distribute across multiple dimensions for richer representation
        const idx1 = hash % EMBEDDING_DIM;
        const idx2 = (hash * 31) % EMBEDDING_DIM;
        const idx3 = (hash * 127) % EMBEDDING_DIM;
        const idx4 = (hash * 257) % EMBEDDING_DIM;
        
        // TF-IDF style weighting - bigrams get extra weight
        const isBigram = term.includes('_');
        const tf = freq / totalTerms;
        const idf = Math.log(1 + totalTerms / (freq + 1));
        const weight = tf * idf * (isBigram ? 1.5 : 1.0);
        
        embedding[idx1] += weight;
        embedding[idx2] += weight * 0.6;
        embedding[idx3] += weight * 0.4;
        embedding[idx4] += weight * 0.2;
    }

    // Fast L2 normalization
    let magnitude = 0;
    for (let i = 0; i < EMBEDDING_DIM; i++) {
        magnitude += embedding[i] * embedding[i];
    }
    magnitude = Math.sqrt(magnitude);
    
    if (magnitude > 0) {
        for (let i = 0; i < EMBEDDING_DIM; i++) {
            embedding[i] /= magnitude;
        }
    }

    const result = Array.from(embedding);
    
    // LRU-style cache management
    if (embeddingCache.size >= CACHE_MAX_SIZE) {
        const keysToDelete = Array.from(embeddingCache.keys()).slice(0, 2000);
        keysToDelete.forEach(k => embeddingCache.delete(k));
    }
    embeddingCache.set(cacheKey, result);

    return result;
}

/**
 * Prepare comprehensive searchable text from idea
 */
function prepareIdeaText(idea) {
    const parts = IDEA_TEXT_FIELDS
        .map(field => idea[field])
        .filter(Boolean);
    
    // Join and limit to 3000 chars for comprehensive but efficient indexing
    return parts.join(' ').substring(0, 3000);
}

/**
 * Prepare metadata for filtering and display
 */
function prepareMetadata(idea) {
    return {
        idea_id: idea.idea_id,
        title: idea.title || '',
        summary: (idea.summary || '').substring(0, 500),
        domain: (idea.challenge_opportunity || '').toLowerCase(),
        businessGroup: (idea.business_group || '').toLowerCase(),
        technologies: (idea.code_preference || '').toLowerCase(),
        buildPhase: (idea.build_phase || '').toLowerCase(),
        buildPreference: (idea.build_preference || '').toLowerCase(),
        scalability: (idea.scalability || '').toLowerCase(),
        novelty: (idea.novelty || '').toLowerCase(),
        timeline: idea.timeline || '',
        participationWeek: idea.participation_week || '',
        score: idea.score || 0,
        created_at: idea.created_at?.toISOString() || '',
        benefits: (idea.benefits || '').substring(0, 300),
        risks: (idea.risks || '').substring(0, 300),
        responsibleAI: idea.responsible_ai || ''
    };
}

/**
 * Index ideas with optimized parallel processing
 * @param {object} pool - Database pool
 * @param {object} options - Indexing options
 */
export async function indexIdeasOptimized(pool, options = {}) {
    const {
        batchSize = 200,  // Increased batch size for faster processing
        forceReindex = false
    } = options;

    const startTime = Date.now();
    const chromaClient = getChromaClient();

    // Check existing index
    if (!forceReindex) {
        const hasCollection = chromaClient.hasCollection('ideas_search');
        const stats = hasCollection ? chromaClient.getStats('ideas_search') : null;
        
        if (hasCollection && stats && stats.documentCount > 0) {
            console.log(`[Indexer] ✅ Using existing index (${stats.documentCount} docs)`);
            return { indexed: stats.documentCount, cached: true, time: 0 };
        }
    }

    console.log('[Indexer] Starting optimized indexing...');

    // Fetch ALL ideas with all fields
    const result = await pool.query(`
        SELECT 
            idea_id, title, summary, challenge_opportunity,
            scalability, novelty, benefits, risks,
            responsible_ai, additional_info, timeline,
            success_metrics, expected_outcomes, scalability_potential,
            business_model, competitive_analysis, risk_mitigation,
            participation_week, build_phase, build_preference,
            code_preference, business_group, score, created_at
        FROM ideas
        ORDER BY created_at DESC
    `);

    if (result.rows.length === 0) {
        console.log('[Indexer] No ideas to index');
        return { indexed: 0, cached: false, time: 0 };
    }

    let indexed = 0;
    const totalIdeas = result.rows.length;

    // Process in larger batches for speed
    for (let i = 0; i < totalIdeas; i += batchSize) {
        const batch = result.rows.slice(i, i + batchSize);
        
        // Process batch in parallel
        const processedBatch = batch.map(idea => {
            const text = prepareIdeaText(idea);
            if (!text || text.length < 10) return null;
            
            const embedding = generateFastEmbedding(text);
            const metadata = prepareMetadata(idea);
            
            return { document: text, embedding, metadata };
        }).filter(Boolean);

        if (processedBatch.length > 0) {
            chromaClient.addDocuments(
                'ideas_search',
                processedBatch.map(i => i.document),
                processedBatch.map(i => i.embedding),
                processedBatch.map(i => i.metadata)
            );
            indexed += processedBatch.length;
        }

        // Progress logging every 500 items
        if ((i + batchSize) % 500 === 0 || i + batchSize >= totalIdeas) {
            const progress = Math.min(100, Math.round(((i + batchSize) / totalIdeas) * 100));
            console.log(`[Indexer] Progress: ${progress}% (${indexed}/${totalIdeas})`);
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ [Indexer] Indexed ${indexed} ideas in ${duration}s`);

    return { indexed, cached: false, time: parseFloat(duration) };
}

/**
 * Optimized search with dynamic filtering
 * @param {string} query - Search query
 * @param {object} filters - Dynamic filters
 * @param {number} limit - Max results (default 200)
 */
export async function optimizedSearch(query, filters = {}, limit = 200) {
    try {
        const chromaClient = getChromaClient();
        
        if (!chromaClient.hasCollection('ideas_search')) {
            console.log('[OptimizedSearch] No collection found');
            return { results: [], source: 'none' };
        }

        // Generate query embedding (case-insensitive via lowercase)
        const queryEmbedding = generateFastEmbedding(query.toLowerCase());
        
        if (!queryEmbedding || queryEmbedding.length === 0) {
            return { results: [], source: 'none' };
        }

        console.log(`[OptimizedSearch] Searching for: "${query}" (limit: ${limit})`);
        
        // Query ChromaDB with higher limit for post-filtering
        const rawResults = chromaClient.query('ideas_search', queryEmbedding, Math.min(limit * 2, 500));
        
        if (!rawResults || !rawResults.documents || rawResults.documents.length === 0) {
            console.log('[OptimizedSearch] No results from ChromaDB');
            return { results: [], source: 'chromadb' };
        }

        console.log(`[OptimizedSearch] ChromaDB returned ${rawResults.documents.length} raw results`);

        // Map results with similarity scores
        let results = [];
        
        for (let idx = 0; idx < rawResults.documents.length; idx++) {
            const doc = rawResults.documents[idx];
            const metadata = rawResults.metadatas[idx] || {};
            const distance = rawResults.distances[idx] || 1;
            const similarity = Math.max(0, Math.round((1 - distance) * 100));

            // Skip very low similarity results
            if (similarity < 3) continue;

            results.push({
                id: `IDEA-${metadata.idea_id}`,
                dbId: metadata.idea_id,
                title: metadata.title || 'Untitled',
                description: metadata.summary || (doc ? doc.substring(0, 200) : ''),
                domain: metadata.domain || '',
                businessGroup: metadata.businessGroup || '',
                technologies: metadata.technologies || '',
                buildPhase: metadata.buildPhase || '',
                scalability: metadata.scalability || '',
                novelty: metadata.novelty || '',
                score: metadata.score || 0,
                submissionDate: metadata.created_at || '',
                matchScore: similarity
            });
        }

        // Apply dynamic filters (case-insensitive)
        results = applyDynamicFilters(results, filters);

        // Sort by match score and limit
        results = results
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, limit);

        console.log(`[OptimizedSearch] Final results: ${results.length}`);
        return { results, source: 'semantic' };
        
    } catch (error) {
        console.error('[OptimizedSearch] Error:', error.message);
        return { results: [], source: 'error' };
    }
}

/**
 * Apply dynamic filters to results with STRICT AND logic
 * When multiple filters are applied, ALL must match
 * Domain filter searches: challenge_opportunity, title, summary, description
 */
function applyDynamicFilters(results, filters) {
    // Count how many filters are active
    const activeFilters = [];
    if (filters.domain?.length > 0) activeFilters.push('domain');
    if (filters.businessGroup?.length > 0) activeFilters.push('businessGroup');
    if (filters.techStack?.length > 0) activeFilters.push('techStack');
    if (filters.buildPhase?.length > 0) activeFilters.push('buildPhase');
    if (filters.scalability?.length > 0) activeFilters.push('scalability');
    if (filters.year) activeFilters.push('year');

    if (activeFilters.length === 0) {
        return results;
    }

    console.log(`[OptimizedSearch] Applying STRICT AND for ${activeFilters.length} filters: ${activeFilters.join(', ')}`);

    // Apply strict AND filtering - ALL filters must match
    const filtered = results.filter(r => {
        // Domain filter - searches across multiple fields
        if (filters.domain?.length > 0) {
            const domains = (Array.isArray(filters.domain) ? filters.domain : [filters.domain])
                .map(d => d.toLowerCase());
            const searchableText = [
                r.domain || '',
                r.title || '',
                r.description || ''
            ].join(' ').toLowerCase();
            
            if (!domains.some(d => searchableText.includes(d))) {
                return false; // Domain filter not matched
            }
        }

        // Business group filter
        if (filters.businessGroup?.length > 0) {
            const groups = (Array.isArray(filters.businessGroup) ? filters.businessGroup : [filters.businessGroup])
                .map(g => g.toLowerCase());
            if (!groups.some(g => (r.businessGroup || '').toLowerCase().includes(g))) {
                return false; // Business group filter not matched
            }
        }

        // Technology filter - check in technologies field AND in description/title
        if (filters.techStack?.length > 0) {
            const techs = (Array.isArray(filters.techStack) ? filters.techStack : [filters.techStack])
                .map(t => t.toLowerCase());
            const techSearchText = [
                r.technologies || '',
                r.title || '',
                r.description || ''
            ].join(' ').toLowerCase();
            
            if (!techs.some(t => techSearchText.includes(t))) {
                return false; // Tech filter not matched
            }
        }

        // Build phase filter
        if (filters.buildPhase?.length > 0) {
            const phases = (Array.isArray(filters.buildPhase) ? filters.buildPhase : [filters.buildPhase])
                .map(p => p.toLowerCase());
            if (!phases.some(p => (r.buildPhase || '').toLowerCase().includes(p))) {
                return false; // Build phase filter not matched
            }
        }

        // Scalability filter
        if (filters.scalability?.length > 0) {
            const scales = (Array.isArray(filters.scalability) ? filters.scalability : [filters.scalability])
                .map(s => s.toLowerCase());
            if (!scales.some(s => (r.scalability || '').toLowerCase().includes(s))) {
                return false; // Scalability filter not matched
            }
        }

        // Year filter - strict match
        if (filters.year) {
            if (!r.submissionDate) {
                return false; // No date, can't match year
            }
            const year = new Date(r.submissionDate).getFullYear();
            if (year !== filters.year) {
                return false; // Year filter not matched
            }
        }

        return true; // All filters matched
    });
    
    console.log(`[OptimizedSearch] Strict AND filter: ${filtered.length} results match ALL ${activeFilters.length} filters`);

    return filtered;
}

/**
 * Clear embedding cache
 */
export function clearEmbeddingCache() {
    embeddingCache.clear();
    console.log('[Indexer] Embedding cache cleared');
}

/**
 * Get cache stats
 */
export function getCacheStats() {
    return {
        size: embeddingCache.size,
        maxSize: CACHE_MAX_SIZE
    };
}

export default {
    indexIdeasOptimized,
    optimizedSearch,
    generateFastEmbedding,
    clearEmbeddingCache,
    getCacheStats
};
```### 4. 
backend/services/advancedSearchService.js

```javascript
/**
 * Advanced Search Service
 * Integrates BM25+, Vector Similarity, RRF, NLP, and Spell Correction
 * for enterprise-grade semantic search
 */

import {
  calculateBM25Scores,
  reciprocalRankFusion,
  normalizeScores,
  cosineSimilarity
} from '../search-engine.js';
import { enhanceQuery } from './nlpQueryProcessor.js';

/**
 * Advanced Hybrid Search with NLP and Spell Correction
 * Uses a cascading approach to minimize API usage:
 * 1. NLP Enhancement
 * 2. BM25+ Scoring (All Docs) -> Top Candidates
 * 3. Vector Scoring (Top Candidates Only)
 * 4. RRF & Re-ranking
 * 
 * @param {Object} config - Search configuration
 * @param {string} config.rawQuery - User's original query
 * @param {Array<Object>} config.documents - Documents to search
 * @param {Function} config.getDocText - Extract text from document
 * @param {Function} config.getEmbedding - Get document embedding
 * @param {Function} config.getQueryEmbedding - Get query embedding
 * @param {Object} config.weights - Scoring weights
 * @param {string} config.apiKey - Google GenAI API key for NLP
 * @param {boolean} config.useAI - Whether to use AI for query enhancement
 * @returns {Promise<Object>} Search results with metadata
 */
export async function advancedHybridSearch({
  rawQuery,
  documents,
  getDocText,
  getEmbedding,
  getQueryEmbedding,
  weights = { bm25: 0.30, vector: 0.50, rrf: 0.20 },
  apiKey = null,
  useAI = true
}) {
  const startTime = Date.now();

  console.log(`\n[AdvancedSearch] 🔍 Starting search for: "${rawQuery}"`);
  console.log(`[AdvancedSearch] 📊 Corpus size: ${documents.length} documents`);
  console.log(`[AdvancedSearch] ⚖️  Weights: BM25=${weights.bm25}, Vector=${weights.vector}, RRF=${weights.rrf}`);

  // STEP 1: NLP Query Enhancement (Spell Correction + Expansion)
  console.log(`[AdvancedSearch] 🧠 Applying NLP processing...`);
  // Use Gemini 1.5 Flash (assuming user meant 1.5 when they said 2.5, or latest stable)
  const nlpResult = await enhanceQuery(rawQuery, { useAI, apiKey, model: "gemini-2.5-flash" });

  console.log(`[AdvancedSearch] ✅ NLP Results:`);
  console.log(`  - Original: "${nlpResult.original}"`);
  console.log(`  - Corrected: "${nlpResult.corrected}"`);
  console.log(`  - Expanded terms: ${nlpResult.expanded.length}`);

  // STEP 2: Calculate BM25+ Scores (Cheap, run on all docs)
  console.log(`[AdvancedSearch] 📈 Calculating BM25+ scores for all ${documents.length} documents...`);
  const bm25Scores = calculateBM25Scores(
    nlpResult.expanded, // Use expanded terms for better recall
    documents,
    getDocText
  );

  // STEP 3: Select Top Candidates for Vector Re-ranking
  // We only want to generate embeddings for the most promising candidates to save API quota
  const CANDIDATE_LIMIT = 50; // Adjust based on needs

  const allRankedByBM25 = documents
    .map(doc => ({ id: doc.idea_id, score: bm25Scores.get(doc.idea_id) || 0, doc }))
    .sort((a, b) => b.score - a.score);

  // Keep top N candidates + any that have non-zero BM25 score (up to a limit)
  // If BM25 yields 0 results (pure semantic query), we might need a fallback or take random sample?
  // For now, take top N.
  let candidates = allRankedByBM25.slice(0, CANDIDATE_LIMIT);

  // If we have very few results with BM25 > 0, we might miss semantic matches.
  // However, without pre-computed embeddings, scanning 1200 docs is too expensive.
  // We rely on NLP expansion to bridge the gap for BM25.

  console.log(`[AdvancedSearch] 📉 Selected top ${candidates.length} candidates for vector re-ranking`);

  // STEP 4: Generate Query Embedding
  console.log(`[AdvancedSearch] 🔢 Generating query embedding...`);
  let queryEmbedding = [];
  try {
    queryEmbedding = await getQueryEmbedding(nlpResult.corrected);
  } catch (err) {
    console.warn(`[AdvancedSearch] ⚠️ Query embedding failed: ${err.message}`);
  }

  // STEP 5: Calculate Vector Similarity Scores (Only for candidates)
  const vectorScores = new Map();

  if (queryEmbedding && queryEmbedding.length > 0) {
    console.log(`[AdvancedSearch] 🎯 Calculating vector similarity for ${candidates.length} candidates...`);

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (item) => {
        try {
          const docEmbedding = await getEmbedding(item.doc);
          if (docEmbedding && docEmbedding.length > 0) {
            const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
            vectorScores.set(item.id, similarity);
          }
        } catch (e) {
          console.warn(`[AdvancedSearch] ⚠️ Embedding failed for doc ${item.id}: ${e.message}`);
        }
      }));
    }
  } else {
    console.log(`[AdvancedSearch] ⏭️ Skipping vector scoring (no query embedding)`);
  }

  // STEP 6: Create Ranked Lists for RRF (Only for candidates)
  console.log(`[AdvancedSearch] 🔀 Applying Reciprocal Rank Fusion...`);

  // Re-rank candidates by BM25 (already sorted, but filtered)
  const bm25Ranked = candidates;

  // Rank candidates by Vector Similarity
  const vectorRanked = candidates
    .map(item => ({
      id: item.id,
      score: vectorScores.get(item.id) || 0,
      doc: item.doc
    }))
    .sort((a, b) => b.score - a.score);

  // Apply RRF
  const rrfScores = reciprocalRankFusion([bm25Ranked, vectorRanked], 60);

  // STEP 7: Normalize & Combine
  console.log(`[AdvancedSearch] ⚖️  Computing final weighted scores...`);

  const normalizedBM25 = normalizeScores(bm25Scores); // Note: this normalizes across ALL docs, which is fine
  const normalizedVector = normalizeScores(vectorScores); // Normalizes across candidates
  const normalizedRRF = normalizeScores(rrfScores); // Normalizes across candidates

  const scoredResults = candidates.map(item => {
    const doc = item.doc;
    const bm25 = normalizedBM25.get(doc.idea_id) || 0;
    const vector = normalizedVector.get(doc.idea_id) || 0;
    const rrf = normalizedRRF.get(doc.idea_id) || 0;

    // Weighted combination
    const compositeScore = (bm25 * weights.bm25) + (vector * weights.vector) + (rrf * weights.rrf);

    // Convert to 0-100 scale
    const matchScore = Math.min(Math.round(compositeScore * 100), 100);

    return {
      ...doc,
      matchScore: Math.max(matchScore, 0),
      bm25Score: Math.round(bm25 * 100),
      vectorScore: Math.round(vector * 100),
      rrfScore: Math.round(rrf * 100),
      _scoring: {
        bm25Raw: bm25Scores.get(doc.idea_id) || 0,
        vectorRaw: vectorScores.get(doc.idea_id) || 0,
        rrfRaw: rrfScores.get(doc.idea_id) || 0,
        compositeScore
      }
    };
  });

  // Sort by Final Score
  const finalResults = scoredResults
    .sort((a, b) => b.matchScore - a.matchScore)
    .filter(doc => doc.matchScore > 0);

  const processingTime = Date.now() - startTime;

  console.log(`[AdvancedSearch] ✅ Search complete!`);
  console.log(`[AdvancedSearch] 📊 Results: ${finalResults.length} (from ${documents.length} docs)`);
  console.log(`[AdvancedSearch] ⏱️  Processing time: ${processingTime}ms`);

  return {
    results: finalResults,
    metadata: {
      query: {
        original: nlpResult.original,
        corrected: nlpResult.corrected,
        expanded: nlpResult.expanded
      },
      performance: {
        processingTime
      }
    }
  };
}

/**
 * Optimized search for large datasets
 * Uses early termination and candidate filtering
 */
export async function optimizedHybridSearch(config) {
  // Pass through to the now-optimized advancedHybridSearch
  return advancedHybridSearch(config);
}

/**
 * Search with custom weight profiles
 */
export const WEIGHT_PROFILES = {
  // Balanced (default)
  balanced: { bm25: 0.30, vector: 0.50, rrf: 0.20 },

  // Keyword-focused (for exact matches)
  keyword: { bm25: 0.60, vector: 0.25, rrf: 0.15 },

  // Semantic-focused (for conceptual matches)
  semantic: { bm25: 0.15, vector: 0.70, rrf: 0.15 },

  // Consensus-focused (for diverse ranking)
  consensus: { bm25: 0.25, vector: 0.25, rrf: 0.50 }
};

/**
 * Search with automatic weight selection based on query type
 */
export async function adaptiveHybridSearch(config) {
  const { rawQuery } = config;

  // Detect query type
  let profile = 'balanced';

  // Short queries (1-2 words) -> keyword-focused
  if (rawQuery.split(/\s+/).length <= 2) {
    profile = 'keyword';
  }
  // Long queries (>10 words) -> semantic-focused
  else if (rawQuery.split(/\s+/).length > 10) {
    profile = 'semantic';
  }

  return advancedHybridSearch({
    ...config,
    weights: WEIGHT_PROFILES[profile]
  });
}

export default {
  advancedHybridSearch,
  optimizedHybridSearch,
  adaptiveHybridSearch,
  WEIGHT_PROFILES
};
```

### 5. backend/services/dynamicSearchService.js

```javascript
/**
 * Dynamic Search Service
 * Handles dynamic query generation, filter management, and hybrid search
 */

/**
 * Execute dynamic database search with filters
 * @param {object} pool - Database pool
 * @param {string} searchText - Search text
 * @param {object} filters - Filter object
 * @param {object} options - Search options
 */
export async function executeDynamicSearch(pool, searchText, filters = {}, options = {}) {
    const { limit = 100, offset = 0, sortBy = 'score', sortOrder = 'DESC' } = options;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Add text search condition - search across ALL text fields
    if (searchText && searchText.trim().length > 0) {
        const searchTerms = searchText.trim().split(/\s+/).filter(t => t.length > 2);
        
        if (searchTerms.length > 0) {
            const textConditions = searchTerms.map(term => {
                params.push(`%${term}%`);
                const idx = paramIndex++;
                return `(
                    title ILIKE $${idx} OR 
                    summary ILIKE $${idx} OR 
                    challenge_opportunity ILIKE $${idx} OR 
                    code_preference ILIKE $${idx} OR
                    business_group ILIKE $${idx} OR
                    COALESCE(benefits, '') ILIKE $${idx} OR
                    COALESCE(additional_info, '') ILIKE $${idx} OR
                    COALESCE(build_phase, '') ILIKE $${idx} OR
                    COALESCE(scalability, '') ILIKE $${idx} OR
                    COALESCE(novelty, '') ILIKE $${idx}
                )`;
            });
            conditions.push(`(${textConditions.join(' OR ')})`);
        }
    }

    // Add filter conditions
    if (filters.domain?.length > 0) {
        const domains = Array.isArray(filters.domain) ? filters.domain : [filters.domain];
        const domainConds = domains.map(d => {
            params.push(`%${d}%`);
            return `challenge_opportunity ILIKE $${paramIndex++}`;
        });
        conditions.push(`(${domainConds.join(' OR ')})`);
    }

    if (filters.businessGroup?.length > 0) {
        const groups = Array.isArray(filters.businessGroup) ? filters.businessGroup : [filters.businessGroup];
        const bgConds = groups.map(g => {
            params.push(`%${g}%`);
            return `business_group ILIKE $${paramIndex++}`;
        });
        conditions.push(`(${bgConds.join(' OR ')})`);
    }

    if (filters.techStack?.length > 0) {
        const techs = Array.isArray(filters.techStack) ? filters.techStack : [filters.techStack];
        const techConds = techs.map(t => {
            params.push(`%${t}%`);
            return `code_preference ILIKE $${paramIndex++}`;
        });
        conditions.push(`(${techConds.join(' OR ')})`);
    }

    if (filters.year) {
        params.push(filters.year);
        conditions.push(`EXTRACT(YEAR FROM created_at) = $${paramIndex++}`);
    }

    // Build query
    let query = `
        SELECT 
            idea_id,
            title,
            summary as description,
            challenge_opportunity as domain,
            business_group as "businessGroup",
            COALESCE(code_preference, '') as technologies,
            build_phase as "buildPhase",
            scalability,
            novelty,
            score,
            created_at as "submissionDate"
        FROM ideas
    `;

    // Add WHERE clause
    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Add sorting
    const validSortColumns = ['score', 'created_at', 'title'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'score';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortColumn} ${order}, created_at DESC`;

    // Add pagination
    params.push(limit);
    query += ` LIMIT $${paramIndex++}`;
    params.push(offset);
    query += ` OFFSET $${paramIndex++}`;

    try {
        console.log(`[DynamicSearch] Executing query with ${params.length} params`);
        console.log(`[DynamicSearch] Search text: "${searchText}"`);
        const result = await pool.query(query, params);
        
        console.log(`[DynamicSearch] Found ${result.rows.length} results`);
        
        return {
            results: result.rows.map(row => ({
                id: `IDEA-${row.idea_id}`,
                dbId: row.idea_id,
                title: row.title,
                description: row.description,
                domain: row.domain || 'General',
                businessGroup: row.businessGroup || 'Unknown',
                technologies: row.technologies,
                buildPhase: row.buildPhase || '',
                scalability: row.scalability || '',
                novelty: row.novelty || '',
                score: row.score || 0,
                submissionDate: row.submissionDate,
                matchScore: 70
            })),
            total: result.rowCount,
            source: 'database'
        };
    } catch (error) {
        console.error('[DynamicSearch] Query error:', error.message);
        console.error('[DynamicSearch] Query:', query);
        console.error('[DynamicSearch] Params:', params);
        throw error;
    }
}

/**
 * Hybrid search - combines semantic and database search
 */
export async function hybridSearch(pool, chromaResults, searchText, filters, options = {}) {
    const { limit = 100 } = options;

    // If ChromaDB has good results, use them
    if (chromaResults && chromaResults.length >= 5) {
        return {
            results: chromaResults.slice(0, limit),
            source: 'semantic'
        };
    }

    // Fallback to database search
    const dbResults = await executeDynamicSearch(pool, searchText, filters, { limit });

    // If we have some ChromaDB results, merge them
    if (chromaResults && chromaResults.length > 0) {
        const chromaIds = new Set(chromaResults.map(r => r.dbId));
        const uniqueDbResults = dbResults.results.filter(r => !chromaIds.has(r.dbId));
        
        return {
            results: [...chromaResults, ...uniqueDbResults].slice(0, limit),
            source: 'hybrid'
        };
    }

    return dbResults;
}

/**
 * Save search to history (optional - may fail if table doesn't exist)
 */
export async function saveSearchHistory(pool, userId, sessionId, query, filters, resultIds, processingTime, searchType) {
    try {
        await pool.query(`
            INSERT INTO search_history (user_id, session_id, query, filters, result_count, result_ids, processing_time_ms, search_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            userId,
            sessionId,
            query,
            JSON.stringify(filters),
            resultIds.length,
            resultIds,
            processingTime,
            searchType
        ]);
    } catch (error) {
        // Silently fail - table might not exist
        console.warn('[DynamicSearch] Could not save search history:', error.message);
    }
}

/**
 * Get user's recent searches
 */
export async function getRecentSearches(pool, userId, limit = 10) {
    try {
        const result = await pool.query(`
            SELECT query, filters, result_count, created_at
            FROM search_history
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        `, [userId, limit]);
        
        return result.rows;
    } catch (error) {
        console.warn('[DynamicSearch] Could not get recent searches:', error.message);
        return [];
    }
}

export default {
    executeDynamicSearch,
    hybridSearch,
    saveSearchHistory,
    getRecentSearches
};
```### 6. backe
nd/services/contextManager.js

```javascript
/**
 * Context Manager Service
 * Handles user search context persistence, filter management, and session state
 */

import pool from '../config/database.js';

/**
 * Save or update user's search context
 * @param {string} userId - User identifier
 * @param {number} sessionId - Chat session ID
 * @param {object} contextData - Filter and state data
 * @returns {Promise<object>} Saved context
 */
export async function saveUserContext(userId, sessionId, contextData) {
    try {
        const result = await pool.query(`
            INSERT INTO user_search_contexts (user_id, session_id, context_data, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (user_id, session_id)
            DO UPDATE SET 
                context_data = $3,
                updated_at = NOW()
            RETURNING *
        `, [userId, sessionId, JSON.stringify(contextData)]);

        return result.rows[0];
    } catch (error) {
        // Table might not exist yet - return the context anyway
        console.warn('[ContextManager] Could not save context (table may not exist):', error.message);
        return { context_data: contextData };
    }
}

/**
 * Get user's most recent search context
 * @param {string} userId - User identifier
 * @param {number} sessionId - Optional session ID
 * @returns {Promise<object|null>} Context data or null
 */
export async function getUserContext(userId, sessionId = null) {
    try {
        let query, params;

        if (sessionId) {
            query = `
                SELECT context_data, updated_at
                FROM user_search_contexts
                WHERE user_id = $1 AND session_id = $2
                ORDER BY updated_at DESC
                LIMIT 1
            `;
            params = [userId, sessionId];
        } else {
            query = `
                SELECT context_data, updated_at
                FROM user_search_contexts
                WHERE user_id = $1
                ORDER BY updated_at DESC
                LIMIT 1
            `;
            params = [userId];
        }

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0].context_data;
    } catch (error) {
        // Table might not exist - return null
        console.warn('[ContextManager] Could not get context:', error.message);
        return null;
    }
}

/**
 * Delete user's search context
 * @param {string} userId - User identifier
 * @param {number} sessionId - Optional session ID to delete specific context
 * @returns {Promise<boolean>} Success status
 */
export async function deleteUserContext(userId, sessionId = null) {
    try {
        let query, params;

        if (sessionId) {
            query = 'DELETE FROM user_search_contexts WHERE user_id = $1 AND session_id = $2';
            params = [userId, sessionId];
        } else {
            query = 'DELETE FROM user_search_contexts WHERE user_id = $1';
            params = [userId];
        }

        await pool.query(query, params);
        return true;
    } catch (error) {
        console.error('[ContextManager] Error deleting context:', error);
        return false;
    }
}

/**
 * Validate and sanitize filter data
 * @param {object} filters - Filter object to validate
 * @returns {object} Sanitized filters
 */
export function validateFilters(filters) {
    const sanitized = {
        technologies: [],
        domains: [],
        businessGroups: [],
        years: [],
        keywords: []
    };

    // Validate technologies (array of strings)
    if (Array.isArray(filters.technologies)) {
        sanitized.technologies = filters.technologies
            .filter(t => typeof t === 'string' && t.length > 0 && t.length <= 100)
            .slice(0, 10); // Max 10 technologies
    }

    // Validate domains
    if (Array.isArray(filters.domains)) {
        sanitized.domains = filters.domains
            .filter(d => typeof d === 'string' && d.length > 0 && d.length <= 100)
            .slice(0, 10);
    }

    // Validate business groups
    if (Array.isArray(filters.businessGroups)) {
        sanitized.businessGroups = filters.businessGroups
            .filter(bg => typeof bg === 'string' && bg.length > 0 && bg.length <= 200)
            .slice(0, 5);
    }

    // Validate years (2020-2030 range)
    if (Array.isArray(filters.years)) {
        sanitized.years = filters.years
            .filter(y => Number.isInteger(y) && y >= 2020 && y <= 2030)
            .slice(0, 5);
    }

    // Validate keywords
    if (Array.isArray(filters.keywords)) {
        sanitized.keywords = filters.keywords
            .filter(k => typeof k === 'string' && k.length > 0 && k.length <= 100)
            .slice(0, 20);
    }

    return sanitized;
}

/**
 * Merge multiple filter objects with priority
 * @param {...object} filterObjects - Filter objects to merge (later args have priority)
 * @returns {object} Merged filters
 */
export function mergeFilters(...filterObjects) {
    const merged = {
        technologies: [],
        domains: [],
        businessGroups: [],
        years: [],
        keywords: []
    };

    for (const filters of filterObjects) {
        if (!filters) continue;

        // Merge arrays, removing duplicates
        if (filters.technologies) {
            merged.technologies = [...new Set([...merged.technologies, ...filters.technologies])];
        }
        if (filters.domains) {
            merged.domains = [...new Set([...merged.domains, ...filters.domains])];
        }
        if (filters.businessGroups) {
            merged.businessGroups = [...new Set([...merged.businessGroups, ...filters.businessGroups])];
        }
        if (filters.years) {
            merged.years = [...new Set([...merged.years, ...filters.years])];
        }
        if (filters.keywords) {
            merged.keywords = [...new Set([...merged.keywords, ...filters.keywords])];
        }
    }

    return validateFilters(merged);
}

/**
 * Get available filter options from database
 * @returns {Promise<object>} Available filter values
 */
export async function getAvailableFilters() {
    try {
        // Get unique business groups
        const bgResult = await pool.query(`
            SELECT DISTINCT business_group 
            FROM ideas 
            WHERE business_group IS NOT NULL 
            ORDER BY business_group
        `);

        // Get unique domains (challenge_opportunity)
        const domainResult = await pool.query(`
            SELECT DISTINCT challenge_opportunity as domain
            FROM ideas 
            WHERE challenge_opportunity IS NOT NULL
            ORDER BY challenge_opportunity
            LIMIT 50
        `);

        // Get available years
        const yearResult = await pool.query(`
            SELECT DISTINCT EXTRACT(YEAR FROM created_at)::INTEGER as year
            FROM ideas 
            WHERE created_at IS NOT NULL
            ORDER BY year DESC
        `);

        // Get common technologies from code_preference
        const techResult = await pool.query(`
            SELECT DISTINCT code_preference as tech
            FROM ideas 
            WHERE code_preference IS NOT NULL AND code_preference != ''
            ORDER BY code_preference
            LIMIT 100
        `);

        return {
            businessGroups: bgResult.rows.map(r => r.business_group),
            domains: domainResult.rows.map(r => r.domain),
            years: yearResult.rows.map(r => r.year),
            technologies: techResult.rows.map(r => r.tech)
        };
    } catch (error) {
        console.error('[ContextManager] Error getting available filters:', error);
        return {
            businessGroups: [],
            domains: [],
            years: [],
            technologies: []
        };
    }
}

export default {
    saveUserContext,
    getUserContext,
    deleteUserContext,
    validateFilters,
    mergeFilters,
    getAvailableFilters
};
```

### 7. backend/services/sessionManager.js

```javascript
// In-memory session manager for long-running agent tasks
// NOTE: This is not suitable for production with multiple server instances.
// For production, replace this with a Redis-backed session store.

const activeSessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * Creates a new agent session.
 * @param {string} sessionId - The unique ID for the session.
 * @param {object} initialState - The initial state of the session.
 * @returns {object} The created session object.
 */
export function createSession(sessionId, initialState = {}) {
  if (activeSessions.has(sessionId)) {
    console.warn(`Session ${sessionId} already exists. Overwriting.`);
  }
  const session = {
    id: sessionId,
    status: 'starting',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...initialState,
  };
  activeSessions.set(sessionId, session);
  console.log(`[SessionManager] Created session: ${sessionId}`);
  return session;
}

/**
 * Retrieves an agent session.
 * @param {string} sessionId - The ID of the session to retrieve.
 * @returns {object | undefined} The session object, or undefined if not found.
 */
export function getSession(sessionId) {
  return activeSessions.get(sessionId);
}

/**
 * Updates an agent session.
 * @param {string} sessionId - The ID of the session to update.
 * @param {object} updates - The partial data to update the session with.
 * @returns {object | undefined} The updated session object.
 */
export function updateSession(sessionId, updates) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    console.warn(`[SessionManager] Attempted to update non-existent session: ${sessionId}`);
    return undefined;
  }

  const updatedSession = {
    ...session,
    ...updates,
    updatedAt: Date.now(),
  };
  activeSessions.set(sessionId, updatedSession);
  return updatedSession;
}

/**
 * Deletes an agent session.
 * @param {string} sessionId - The ID of the session to delete.
 */
export function deleteSession(sessionId) {
  if (activeSessions.has(sessionId)) {
    activeSessions.delete(sessionId);
    console.log(`[SessionManager] Deleted session: ${sessionId}`);
  }
}

/**
 * Cleans up old, stale sessions.
 */
function cleanupStaleSessions() {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [sessionId, session] of activeSessions.entries()) {
        if (now - session.createdAt > SESSION_TTL_MS) {
            activeSessions.delete(sessionId);
            cleanedCount++;
        }
    }
    if (cleanedCount > 0) {
        console.log(`[SessionManager] Cleaned up ${cleanedCount} stale sessions.`);
    }
}

// Run cleanup periodically
setInterval(cleanupStaleSessions, 1000 * 60 * 10); // Every 10 minutes

console.log('[SessionManager] In-memory session manager initialized.');

export default {
  createSession,
  getSession,
  updateSession,
  deleteSession,
};
```

---

## Supporting Files

### 1. services.ts (ProSearch Related Functions)

The `services.ts` file contains several functions that support ProSearch functionality:

```typescript
// Chat History API Functions
export interface ChatSession {
  id: number;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupedChatSessions {
  [dateGroup: string]: ChatSession[];
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    results?: any[];
    filters?: any;
    [key: string]: any;
  };
  timestamp: string;
}

// Get all chat sessions for the current user
export const getChatSessions = async (): Promise<{ sessions: GroupedChatSessions }> => {
  return fetchWithAuth(`${API_URL}/chat/sessions`);
};

// Create a new chat session
export const createChatSession = async (title?: string): Promise<{ session: ChatSession }> => {
  return fetchWithAuth(`${API_URL}/chat/sessions`, {
    method: 'POST',
    body: JSON.stringify({ title })
  });
};

// Get messages for a specific session
export const getChatMessages = async (sessionId: number): Promise<{ messages: ChatMessage[] }> => {
  return fetchWithAuth(`${API_URL}/chat/sessions/${sessionId}/messages`);
};

// Add a message to a session
export const addChatMessage = async (
  sessionId: number,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: any
): Promise<{ message: ChatMessage }> => {
  return fetchWithAuth(`${API_URL}/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ role, content, metadata })
  });
};

// Delete a chat session
export const deleteChatSession = async (sessionId: number): Promise<{ success: boolean }> => {
  return fetchWithAuth(`${API_URL}/chat/sessions/${sessionId}`, {
    method: 'DELETE'
  });
};

// Rename a chat session
export const renameChatSession = async (sessionId: number, title: string): Promise<{ session: ChatSession }> => {
  return fetchWithAuth(`${API_URL}/chat/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title })
  });
};
```

### 2. types.ts (ProSearch Related Types)

The `types.ts` file contains type definitions used by ProSearch:

```typescript
export interface Idea {
  id: string;
  title: string;
  description: string;
  domain?: string;
  businessGroup?: string;
  technologies?: string | string[];
  buildPhase?: string;
  scalability?: string;
  novelty?: string;
  score?: number;
  submissionDate?: string;
  matchScore?: number;
  // Additional fields for ProSearch
  benefits?: string;
  risks?: string;
  buildPreference?: string;
}

export interface ExploreFilters {
  themes: string[];
  businessGroups: string[];
  technologies: string[];
}
```

---

## Summary

This document contains the complete ProSearch codebase including:

**Frontend Components:**
- ProSearchModal.tsx - Main modal wrapper
- ProSearchChat.tsx - Core chat interface with search functionality
- Header.tsx - Navigation with ProSearch button
- App.tsx - Integration and state management

**Backend Routes:**
- proSearchRoutes.js - Main search API endpoints
- proSearchContextRoutes.js - Context management
- chatHistoryRoutes.js - Chat session persistence

**Backend Services:**
- semanticSearch.js - Vector similarity search
- researchService.js - Research mode and tagging
- optimizedIndexer.js - High-performance indexing
- advancedSearchService.js - Hybrid search algorithms
- dynamicSearchService.js - Dynamic filtering
- contextManager.js - Context persistence
- sessionManager.js - Session management

**Key Features:**
- Conversational AI search interface
- Semantic search with ChromaDB
- Chat history persistence
- Context management
- Dynamic filtering
- Resizable panels
- Real-time search suggestions
- Session restoration
- Advanced NLP processing

The ProSearch component provides a comprehensive search experience with AI-powered responses, semantic search capabilities, and persistent chat history.