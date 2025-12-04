import React, { useState, useEffect } from 'react';
import { MessageSquare, Plus, Trash2, Edit2, Check, X, ChevronRight, History } from 'lucide-react';

interface ChatSession {
    id: number;
    title: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
}

interface GroupedSessions {
    [key: string]: ChatSession[];
}

interface ChatHistorySidebarProps {
    currentSessionId: number | null;
    onSelectSession: (sessionId: number) => void;
    onNewChat: () => void;
    onDeleteSession: (sessionId: number) => void;
    userId: string;
}

const ChatHistorySidebar: React.FC<ChatHistorySidebarProps> = ({
    currentSessionId,
    onSelectSession,
    onNewChat,
    onDeleteSession,
    userId
}) => {
    const [sessions, setSessions] = useState<GroupedSessions>({});
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Today', 'Yesterday']));

    const fetchSessions = async () => {
        try {
            const response = await fetch('/api/chat/sessions', {
                headers: { 'x-user-id': userId }
            });
            if (response.ok) {
                const data = await response.json();
                setSessions(data.sessions || {});
            }
        } catch (err) {
            console.error('Failed to fetch chat sessions:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, [userId]);

    // Refresh sessions when currentSessionId changes (new session created)
    useEffect(() => {
        if (currentSessionId) {
            fetchSessions();
        }
    }, [currentSessionId]);

    const handleRename = async (sessionId: number) => {
        if (!editTitle.trim()) {
            setEditingId(null);
            return;
        }

        try {
            const response = await fetch(`/api/chat/sessions/${sessionId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId
                },
                body: JSON.stringify({ title: editTitle })
            });

            if (response.ok) {
                fetchSessions();
            }
        } catch (err) {
            console.error('Failed to rename session:', err);
        }
        setEditingId(null);
    };

    const handleDelete = async (sessionId: number) => {
        try {
            const response = await fetch(`/api/chat/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: { 'x-user-id': userId }
            });

            if (response.ok) {
                onDeleteSession(sessionId);
                fetchSessions();
            }
        } catch (err) {
            console.error('Failed to delete session:', err);
        }
    };

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) {
                next.delete(group);
            } else {
                next.add(group);
            }
            return next;
        });
    };

    const groupOrder = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days'];

    const sortedGroups = Object.keys(sessions).sort((a, b) => {
        const aIndex = groupOrder.indexOf(a);
        const bIndex = groupOrder.indexOf(b);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return b.localeCompare(a); // Newer months first
    });

    return (
        <div className="w-64 bg-slate-900 text-white flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-slate-700">
                <button
                    onClick={onNewChat}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-medium"
                >
                    <Plus className="w-4 h-4" />
                    New Chat
                </button>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="p-4 text-center text-slate-400">
                        <History className="w-6 h-6 animate-pulse mx-auto mb-2" />
                        Loading...
                    </div>
                ) : sortedGroups.length === 0 ? (
                    <div className="p-4 text-center text-slate-400">
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No chat history yet</p>
                        <p className="text-xs mt-1">Start a new conversation!</p>
                    </div>
                ) : (
                    sortedGroups.map(group => (
                        <div key={group} className="border-b border-slate-800">
                            <button
                                onClick={() => toggleGroup(group)}
                                className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 transition-colors"
                            >
                                <span>{group}</span>
                                <ChevronRight 
                                    className={`w-3 h-3 transition-transform ${expandedGroups.has(group) ? 'rotate-90' : ''}`} 
                                />
                            </button>
                            
                            {expandedGroups.has(group) && (
                                <div className="pb-2">
                                    {sessions[group].map(session => (
                                        <div
                                            key={session.id}
                                            className={`group flex items-center gap-2 px-3 py-2 mx-2 rounded-lg cursor-pointer transition-colors ${
                                                currentSessionId === session.id
                                                    ? 'bg-slate-700'
                                                    : 'hover:bg-slate-800'
                                            }`}
                                            onClick={() => editingId !== session.id && onSelectSession(session.id)}
                                        >
                                            <MessageSquare className="w-4 h-4 flex-shrink-0 text-slate-400" />
                                            
                                            {editingId === session.id ? (
                                                <div className="flex-1 flex items-center gap-1">
                                                    <input
                                                        type="text"
                                                        value={editTitle}
                                                        onChange={(e) => setEditTitle(e.target.value)}
                                                        className="flex-1 bg-slate-600 text-white text-sm px-2 py-1 rounded"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleRename(session.id);
                                                            if (e.key === 'Escape') setEditingId(null);
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => handleRename(session.id)}
                                                        className="p-1 hover:bg-slate-600 rounded"
                                                    >
                                                        <Check className="w-3 h-3 text-green-400" />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingId(null)}
                                                        className="p-1 hover:bg-slate-600 rounded"
                                                    >
                                                        <X className="w-3 h-3 text-red-400" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="flex-1 text-sm truncate">
                                                        {session.title}
                                                    </span>
                                                    <div className="hidden group-hover:flex items-center gap-1">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingId(session.id);
                                                                setEditTitle(session.title);
                                                            }}
                                                            className="p-1 hover:bg-slate-600 rounded"
                                                        >
                                                            <Edit2 className="w-3 h-3 text-slate-400" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDelete(session.id);
                                                            }}
                                                            className="p-1 hover:bg-slate-600 rounded"
                                                        >
                                                            <Trash2 className="w-3 h-3 text-red-400" />
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-700 text-xs text-slate-500 text-center">
                Chat history is saved automatically
            </div>
        </div>
    );
};

export default ChatHistorySidebar;
