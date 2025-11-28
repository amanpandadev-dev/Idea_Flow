import React from 'react';
import { ExternalLink, FileText } from 'lucide-react';

interface Citation {
    internal: Array<{
        ideaId: string;
        title: string;
        snippet: string;
        domain?: string;
        relevance: number;
    }>;
    external: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
}

interface CitationDisplayProps {
    citations: Citation;
    onNavigateToIdea?: (ideaId: string) => void;
}

const CitationDisplay: React.FC<CitationDisplayProps> = ({ citations, onNavigateToIdea }) => {
    const [activeTab, setActiveTab] = React.useState<'internal' | 'external'>('internal');

    const hasInternal = citations.internal && citations.internal.length > 0;
    const hasExternal = citations.external && citations.external.length > 0;

    if (!hasInternal && !hasExternal) {
        return (
            <div className="text-sm text-slate-500 italic">
                No citations available
            </div>
        );
    }

    return (
        <div className="mt-4">
            <div className="flex gap-2 border-b border-slate-200 mb-3">
                {hasInternal && (
                    <button
                        onClick={() => setActiveTab('internal')}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'internal'
                                ? 'text-indigo-600 border-b-2 border-indigo-600'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <FileText className="inline h-4 w-4 mr-1" />
                        Internal Sources ({citations.internal.length})
                    </button>
                )}
                {hasExternal && (
                    <button
                        onClick={() => setActiveTab('external')}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'external'
                                ? 'text-indigo-600 border-b-2 border-indigo-600'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        <ExternalLink className="inline h-4 w-4 mr-1" />
                        External Sources ({citations.external.length})
                    </button>
                )}
            </div>

            <div className="space-y-2">
                {activeTab === 'internal' && hasInternal && (
                    <>
                        {citations.internal.map((citation, index) => (
                            <div
                                key={index}
                                className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors cursor-pointer"
                                onClick={() => onNavigateToIdea && onNavigateToIdea(citation.ideaId)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="font-medium text-indigo-900">{citation.title}</div>
                                        <div className="text-xs text-indigo-600 mt-1">{citation.ideaId}</div>
                                        {citation.domain && (
                                            <div className="text-xs text-slate-500 mt-1">Domain: {citation.domain}</div>
                                        )}
                                        <div className="text-sm text-slate-700 mt-2">{citation.snippet}</div>
                                    </div>
                                    <div className="ml-3 text-xs font-medium text-indigo-600">
                                        {Math.round(citation.relevance * 100)}% match
                                    </div>
                                </div>
                            </div>
                        ))}
                    </>
                )}

                {activeTab === 'external' && hasExternal && (
                    <>
                        {citations.external.map((citation, index) => (
                            <div
                                key={index}
                                className="p-3 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <a
                                    href={citation.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block"
                                >
                                    <div className="font-medium text-slate-900 hover:text-indigo-600 flex items-center gap-1">
                                        {citation.title}
                                        <ExternalLink className="h-3 w-3" />
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1 truncate">{citation.url}</div>
                                    <div className="text-sm text-slate-700 mt-2">{citation.snippet}</div>
                                </a>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
};

export default CitationDisplay;
