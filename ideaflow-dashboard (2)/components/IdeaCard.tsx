import React from 'react';
import { Idea, Status } from '../types';
import { DOMAIN_COLORS } from '../constants';
import { User, Heart, Trophy } from 'lucide-react';

interface IdeaCardProps {
    idea: Idea;
    similarity?: number; // 0-100
    onClick?: () => void;
    compact?: boolean;
    onLike?: (e: React.MouseEvent, idea: Idea) => void;
}

const IdeaCard: React.FC<IdeaCardProps> = ({ idea, similarity, onClick, onLike, compact = false }) => {

    const getStatusColor = (status: Status) => {
        switch (status) {
            case Status.IN_PRODUCTION: return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case Status.IN_DEVELOPMENT: return 'bg-blue-100 text-blue-700 border-blue-200';
            case Status.SUBMITTED: return 'bg-slate-100 text-slate-700 border-slate-200';
            case Status.REJECTED: return 'bg-red-50 text-red-600 border-red-100';
            default: return 'bg-amber-100 text-amber-700 border-amber-200';
        }
    };

    const getScoreColor = (score: number = 0) => {
        if (score >= 90) return 'text-emerald-600 font-bold';
        if (score >= 70) return 'text-emerald-500 font-semibold';
        if (score >= 50) return 'text-amber-500 font-medium';
        return 'text-slate-400 font-medium';
    };

    return (
        <div
            className="bg-white rounded-lg border border-slate-200 p-4 hover:border-indigo-300 transition-colors cursor-pointer group shadow-sm hover:shadow-md"
            onClick={onClick}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-slate-900 truncate">{idea.title}</h4>
                        {similarity !== undefined && (
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded border border-green-100">
                                {similarity.toFixed(0)}% Match
                            </span>
                        )}
                    </div>

                    <p className="text-sm text-slate-600 line-clamp-2 mb-3">{idea.description}</p>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                        <div className="flex items-center gap-1 text-slate-500">
                            <User className="h-3 w-3" /> {idea.associateAccount}
                        </div>

                        <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-white text-slate-800"
                            style={{ borderColor: DOMAIN_COLORS[idea.domain] || '#ccc' }}
                        >
                            <span className="h-1.5 w-1.5 rounded-full mr-1.5 flex-shrink-0" style={{ backgroundColor: DOMAIN_COLORS[idea.domain] || '#ccc' }}></span>
                            {idea.domain}
                        </span>

                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(idea.status)}`}>
                            {idea.status}
                        </span>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className={`flex items-center gap-1 text-sm ${getScoreColor(idea.score)}`}>
                        <Trophy className="h-3.5 w-3.5" />
                        {idea.score || 0}
                    </div>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onLike) onLike(e, idea);
                        }}
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${idea.isLiked
                            ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                            : 'text-slate-500 border-transparent hover:bg-slate-100'
                            }`}
                    >
                        <Heart className={`h-3.5 w-3.5 ${idea.isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                        {idea.likesCount}
                    </button>

                    <span className="text-xs text-slate-400 mt-1">
                        {new Date(idea.submissionDate).toLocaleDateString()}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default IdeaCard;
