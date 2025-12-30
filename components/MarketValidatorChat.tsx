import React, { useState, useEffect, useRef } from 'react';
import {
    ArrowLeft, Send, Bot, User, Lightbulb, TrendingUp,
    Shield, AlertTriangle, Loader2, X, MessageCircle, Download, ExternalLink, Maximize2, Minimize2
} from 'lucide-react';
import { Idea } from '../types';

interface MarketValidatorChatProps {
    ideas: Idea[];
    ideaId: string;
    onBack?: () => void;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
}

interface QuickQuestion {
    text: string;
    icon: React.ReactNode;
    color: string;
}

/**
 * Parse markdown-like content and render as React elements
 */
const MarkdownRenderer: React.FC<{ content: string; isUserMessage?: boolean }> = ({ content, isUserMessage = false }) => {
    // Convert markdown to HTML-like structure
    const parseContent = (text: string) => {
        const lines = text.split('\n');
        const elements: JSX.Element[] = [];
        let listItems: string[] = [];
        let listType: 'ul' | 'ol' | null = null;

        const flushList = () => {
            if (listItems.length > 0 && listType) {
                const ListTag = listType === 'ul' ? 'ul' : 'ol';
                elements.push(
                    <ListTag key={`list-${elements.length}`} className={`${listType === 'ul' ? 'list-disc' : 'list-decimal'} ml-4 my-2 space-y-1`}>
                        {listItems.map((item, i) => (
                            <li key={i} className="text-sm">{parseInline(item)}</li>
                        ))}
                    </ListTag>
                );
                listItems = [];
                listType = null;
            }
        };

        lines.forEach((line, idx) => {
            // Headers
            if (line.startsWith('## ')) {
                flushList();
                elements.push(
                    <h2 key={idx} className="text-lg font-bold mt-4 mb-2 text-slate-900">
                        {parseInline(line.slice(3))}
                    </h2>
                );
                return;
            }
            if (line.startsWith('# ')) {
                flushList();
                elements.push(
                    <h1 key={idx} className="text-xl font-bold mt-4 mb-2 text-slate-900">
                        {parseInline(line.slice(2))}
                    </h1>
                );
                return;
            }

            // Bullet points
            if (line.match(/^[\*\-•]\s/)) {
                if (listType !== 'ul') {
                    flushList();
                    listType = 'ul';
                }
                listItems.push(line.slice(2).trim());
                return;
            }

            // Numbered lists
            if (line.match(/^\d+\.\s/)) {
                if (listType !== 'ol') {
                    flushList();
                    listType = 'ol';
                }
                listItems.push(line.replace(/^\d+\.\s/, '').trim());
                return;
            }

            // Horizontal rule
            if (line.match(/^---+$/)) {
                flushList();
                elements.push(<hr key={idx} className="my-3 border-slate-300" />);
                return;
            }

            // Empty line
            if (line.trim() === '') {
                flushList();
                return;
            }

            // Regular paragraph
            flushList();
            elements.push(
                <p key={idx} className="text-sm my-1">
                    {parseInline(line)}
                </p>
            );
        });

        flushList();
        return elements;
    };

    // Parse inline elements (bold, italic, links)
    const parseInline = (text: string): React.ReactNode => {
        const parts: React.ReactNode[] = [];
        let remaining = text;
        let key = 0;

        // Pattern for markdown links [text](url)
        const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
        // Pattern for bold **text**
        const boldPattern = /\*\*([^*]+)\*\*/g;
        // Pattern for URL-only (not in markdown format)
        const urlPattern = /(https?:\/\/[^\s]+)/g;

        // Combined regex to find all patterns
        const combinedPattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|🔗\s*\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s]+))/g;

        let match;
        let lastIndex = 0;

        while ((match = combinedPattern.exec(text)) !== null) {
            // Add text before match
            if (match.index > lastIndex) {
                parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
            }

            // Markdown link [text](url)
            if (match[2] && match[3]) {
                parts.push(
                    <a
                        key={key++}
                        href={match[3]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 underline inline-flex items-center gap-1"
                    >
                        {match[2]}
                        <ExternalLink className="h-3 w-3" />
                    </a>
                );
            }
            // Bold **text**
            else if (match[4]) {
                parts.push(<strong key={key++} className="font-semibold">{match[4]}</strong>);
            }
            // Link with emoji 🔗 [text](url)
            else if (match[5] && match[6]) {
                parts.push(
                    <a
                        key={key++}
                        href={match[6]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 underline inline-flex items-center gap-1"
                    >
                        🔗 {match[5]}
                        <ExternalLink className="h-3 w-3" />
                    </a>
                );
            }
            // Plain URL
            else if (match[7]) {
                parts.push(
                    <a
                        key={key++}
                        href={match[7]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-800 underline inline-flex items-center gap-1"
                    >
                        {match[7].length > 50 ? match[7].slice(0, 50) + '...' : match[7]}
                        <ExternalLink className="h-3 w-3" />
                    </a>
                );
            }
            else {
                parts.push(<span key={key++}>{match[0]}</span>);
            }

            lastIndex = match.index + match[0].length;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
        }

        return parts.length > 0 ? parts : text;
    };

    if (isUserMessage) {
        return <p className="text-sm whitespace-pre-wrap">{content}</p>;
    }

    return (
        <div className="prose prose-sm max-w-none">
            {parseContent(content)}
        </div>
    );
};

const MarketValidatorChat: React.FC<MarketValidatorChatProps> = ({ ideas, ideaId, onBack }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const idea = ideas.find(i => i.id === ideaId);

    const quickQuestions: QuickQuestion[] = [
        { text: "What are the main competitors?", icon: <TrendingUp className="h-4 w-4" />, color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
        { text: "What are the market trends?", icon: <Lightbulb className="h-4 w-4" />, color: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" },
        { text: "Are there any patent risks?", icon: <Shield className="h-4 w-4" />, color: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100" },
        { text: "What's the market size?", icon: <AlertTriangle className="h-4 w-4" />, color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" }
    ];

    useEffect(() => {
        if (idea) {
            initializeChat();
        }
    }, [ideaId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const initializeChat = async () => {
        setIsInitializing(true);
        try {
            const response = await fetch(`/api/ideas/${ideaId}/market-chat/initialize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to initialize chat');
            }

            const data = await response.json();

            setMessages([{
                id: Date.now().toString(),
                role: 'assistant',
                content: data.initialMessage || `Hi! I'm your Market Validation Assistant. I can help you understand the market landscape for "${idea?.title}". What would you like to know?`,
                timestamp: new Date()
            }]);
        } catch (error) {
            console.error('Error initializing chat:', error);
            setMessages([{
                id: Date.now().toString(),
                role: 'assistant',
                content: `Hi! I'm your Market Validation Assistant for "${idea?.title}". Ask me anything about market trends, competitors, or validation insights!`,
                timestamp: new Date()
            }]);
        } finally {
            setIsInitializing(false);
        }
    };

    const handleSendMessage = async (messageText: string = inputValue) => {
        if (!messageText.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: messageText,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await fetch(`/api/ideas/${ideaId}/market-chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    message: messageText,
                    conversationHistory: messages
                })
            });

            if (!response.ok) {
                throw new Error('Failed to get response');
            }

            const data = await response.json();

            const assistantMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage: ChatMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Sorry, I encountered an error processing your request. Please try again.',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuickQuestion = (question: string) => {
        handleSendMessage(question);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleDownloadReport = async (message: ChatMessage) => {
        try {
            const response = await fetch(`/api/ideas/${ideaId}/market-chat/download`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    messages: messages
                })
            });

            if (!response.ok) {
                throw new Error('Failed to generate PDF');
            }

            // Create blob and trigger download
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Market_Chat_${idea?.id || 'report'}_${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading PDF:', error);
            alert('Failed to download PDF report. Please try again.');
        }
    };

    const toggleExpand = (messageId: string) => {
        setExpandedMessageId(prev => prev === messageId ? null : messageId);
    };

    if (!idea) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center">
                <div className="text-center">
                    <AlertTriangle className="h-12 w-12 text-red-600 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-slate-700">Idea not found</h2>
                    <button
                        onClick={onBack}
                        className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={onBack}
                                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <ArrowLeft className="h-5 w-5 text-slate-600" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                                    <MessageCircle className="h-6 w-6 text-indigo-600" />
                                    Market Validation Chat
                                </h1>
                                <p className="text-sm text-slate-500 mt-1">{idea.title}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">
                                Interactive Mode
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chat Container */}
            <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-6 flex flex-col">
                {/* Messages Area */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 mb-4 overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {isInitializing ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
                            </div>
                        ) : (
                            <>
                                {messages.map((message) => {
                                    const isExpanded = expandedMessageId === message.id;
                                    const isLongMessage = message.content.length > 500;

                                    return (
                                        <div
                                            key={message.id}
                                            className={`flex items-start gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                                        >
                                            <div
                                                className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${message.role === 'user'
                                                    ? 'bg-indigo-100 text-indigo-600'
                                                    : 'bg-purple-100 text-purple-600'
                                                    }`}
                                            >
                                                {message.role === 'user' ? (
                                                    <User className="h-5 w-5" />
                                                ) : (
                                                    <Bot className="h-5 w-5" />
                                                )}
                                            </div>
                                            <div className={`flex-1 ${message.role === 'user' ? 'max-w-[70%]' : 'max-w-[85%]'} ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                                                <div
                                                    className={`inline-block px-4 py-3 rounded-2xl text-left ${message.role === 'user'
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-slate-100 text-slate-800'
                                                        } ${isExpanded ? 'w-full' : ''}`}
                                                >
                                                    <div className={`${!isExpanded && isLongMessage && message.role === 'assistant' ? 'max-h-[400px] overflow-hidden' : ''}`}>
                                                        <MarkdownRenderer
                                                            content={message.content}
                                                            isUserMessage={message.role === 'user'}
                                                        />
                                                    </div>

                                                    {/* Action buttons for assistant messages */}
                                                    {message.role === 'assistant' && message.content.length > 100 && (
                                                        <div className="mt-3 pt-2 border-t border-slate-200 flex items-center gap-2">
                                                            {isLongMessage && (
                                                                <button
                                                                    onClick={() => toggleExpand(message.id)}
                                                                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                                                >
                                                                    {isExpanded ? (
                                                                        <>
                                                                            <Minimize2 className="h-3 w-3" />
                                                                            Show Less
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Maximize2 className="h-3 w-3" />
                                                                            Show Full Report
                                                                        </>
                                                                    )}
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleDownloadReport(message)}
                                                                className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                                                            >
                                                                <Download className="h-3 w-3" />
                                                                Download Report
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400 mt-1 px-2">
                                                    {message.timestamp.toLocaleTimeString()}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                                {isLoading && (
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-purple-100 text-purple-600">
                                            <Bot className="h-5 w-5" />
                                        </div>
                                        <div className="bg-slate-100 px-4 py-3 rounded-2xl">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </>
                        )}
                    </div>

                    {/* Quick Questions */}
                    {messages.length === 1 && !isLoading && (
                        <div className="border-t border-slate-200 p-4 bg-slate-50">
                            <p className="text-sm font-medium text-slate-700 mb-3">Quick Questions:</p>
                            <div className="grid grid-cols-2 gap-2">
                                {quickQuestions.map((q, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleQuickQuestion(q.text)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${q.color}`}
                                    >
                                        {q.icon}
                                        {q.text}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Input Area */}
                    <div className="border-t border-slate-200 p-4 bg-white">
                        <div className="flex items-end gap-3">
                            <div className="flex-1">
                                <textarea
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    placeholder="Ask me anything about market validation..."
                                    className="w-full px-4 py-3 border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    rows={2}
                                    disabled={isLoading}
                                />
                            </div>
                            <button
                                onClick={() => handleSendMessage()}
                                disabled={!inputValue.trim() || isLoading}
                                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 h-[52px]"
                            >
                                {isLoading ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Send className="h-5 w-5" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Info Footer */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                    <p className="text-sm text-blue-800">
                        <strong>💡 Tip:</strong> Ask specific questions about competitors, market trends, risks, or opportunities for better insights.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default MarketValidatorChat;
