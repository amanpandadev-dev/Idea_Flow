import React, { useState, useMemo, useEffect } from 'react';
import { Idea, Status } from '../types';
import { DOMAIN_COLORS } from '../constants';
import { ChevronDown, ChevronUp, User, Filter, Compass, Search, ChevronLeft, ChevronRight, Heart, Trophy, Zap, X } from 'lucide-react';
import { toggleLikeIdea } from '../services';

interface IdeaTableProps {
  data: Idea[];
  onViewDetails: (idea: Idea) => void;
  onOpenExplore?: () => void;
  isGlobalFilterActive: boolean;
  onRefreshData?: () => void;
  showExplore?: boolean;
  showSearch?: boolean; // New Prop
  // External Search Props
  onSearch?: (query: string) => void;
  isSearching?: boolean;
}

type SortField = 'date' | 'status' | 'domain' | 'score' | 'likes' | 'match';
type SortOrder = 'asc' | 'desc';

const ITEMS_PER_PAGE = 15;

const IdeaTable: React.FC<IdeaTableProps> = ({
  data,
  onViewDetails,
  onOpenExplore,
  isGlobalFilterActive,
  onRefreshData,
  showExplore = true,
  showSearch = true, // Default to true
  onSearch,
  isSearching
}) => {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [likingId, setLikingId] = useState<string | null>(null);

  // Reset page when data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [data]);

  // Handle Search Input
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Trigger External Search on Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch(searchQuery);
    }
  };

  // Handle Clear Search
  const handleClearSearch = () => {
    setSearchQuery('');
    if (onSearch) {
      onSearch(''); // Trigger reset in parent
    }
  };

  // Determine restricted view mode
  const hasExternalSearch = !!onSearch && data.length > 0 && data[0].matchScore !== undefined && data[0].matchScore > 0;
  const isRestrictedView = !isGlobalFilterActive && !searchQuery.trim() && !hasExternalSearch;

  // 1. Filter Logic (Local Search Fallback)
  const filteredData = useMemo(() => {
    if (onSearch) return data; // If external search managed by parent
    if (!searchQuery.trim()) return data;
    const query = searchQuery.toLowerCase();
    return data.filter(idea =>
      idea.title.toLowerCase().includes(query) ||
      idea.domain.toLowerCase().includes(query)
    );
  }, [data, searchQuery, onSearch]);

  // 2. Sort Logic
  const sortedData = useMemo(() => {
    let result = [...filteredData];
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date': comparison = new Date(a.submissionDate).getTime() - new Date(b.submissionDate).getTime(); break;
        case 'status': comparison = a.status.localeCompare(b.status); break;
        case 'domain': comparison = a.domain.localeCompare(b.domain); break;
        case 'score': comparison = (a.score || 0) - (b.score || 0); break;
        case 'likes': comparison = (a.likesCount || 0) - (b.likesCount || 0); break;
        case 'match': comparison = (a.matchScore || 0) - (b.matchScore || 0); break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return result;
  }, [filteredData, sortField, sortOrder]);

  // 3. Display Logic
  const displayData = useMemo(() => {
    if (isRestrictedView) return sortedData.slice(0, 100);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedData.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedData, currentPage, isRestrictedView]);

  const totalPages = Math.ceil(sortedData.length / ITEMS_PER_PAGE);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  };

  const handleLike = async (e: React.MouseEvent, idea: Idea) => {
    e.stopPropagation();
    if (likingId) return;
    setLikingId(idea.id);
    try {
      await toggleLikeIdea(idea.id);
      if (onRefreshData) onRefreshData();
    } catch (err) { console.error("Like failed", err); }
    finally { setLikingId(null); }
  };

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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible flex flex-col min-h-[600px]">

      {/* Toolbar */}
      <div className="p-5 border-b border-slate-200 bg-slate-50/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-800">
              {isRestrictedView ? 'Latest Submissions' : 'Results'}
            </h3>
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
              {isRestrictedView ? `${Math.min(100, sortedData.length)} visible` : `${sortedData.length} total`}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">

            {/* Conditional Search Bar */}
            {showSearch && (
              <div className="relative flex-1 md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={onSearch ? "Search concepts (e.g. 'React apps for finance')" : "Filter list..."}
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-9 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />

                {searchQuery && (
                  <button
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                    title="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}

                {isSearching && (
                  <span className="absolute right-10 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  </span>
                )}
              </div>
            )}

            {/* Conditional Explore Button */}
            {showExplore && onOpenExplore && (
              <button
                onClick={onOpenExplore}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border shadow-sm shrink-0 ${isGlobalFilterActive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50'
                  }`}
              >
                <Compass className="h-4 w-4" />
                Explore & Filter
                {isGlobalFilterActive && <span className="flex h-2 w-2 rounded-full bg-emerald-500 ml-1"></span>}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto z-10 flex-1">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-1/3">Idea Title</th>
              {hasExternalSearch && (
                <th
                  className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 w-28"
                  onClick={() => handleSort('match')}
                >
                  <div className="flex items-center justify-center gap-1">
                    <Zap className="h-3 w-3 text-amber-500" /> AI Match
                    {sortField === 'match' && (sortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                  </div>
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('domain')}>Theme</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('status')}>Status</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer w-24" onClick={() => handleSort('likes')}><Heart className="h-3 w-3 inline mr-1" /> Likes</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer w-24" onClick={() => handleSort('score')}><Trophy className="h-3 w-3 inline mr-1" /> Score</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {displayData.length === 0 ? (
              <tr>
                <td colSpan={hasExternalSearch ? 6 : 5} className="px-6 py-16 text-center text-slate-400">
                  <p>No ideas match your filters</p>
                </td>
              </tr>
            ) : (
              displayData.map((idea) => (
                <tr key={idea.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-indigo-600 cursor-pointer hover:underline truncate" onClick={() => onViewDetails(idea)}>{idea.title}</span>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500"><User className="h-3 w-3" /> {idea.associateAccount}</div>
                    </div>
                  </td>
                  {hasExternalSearch && (
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${(idea.matchScore || 0) > 80 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{(idea.matchScore || 0)}%</span>
                    </td>
                  )}
                  <td className="px-6 py-4"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-white text-slate-800" style={{ borderColor: DOMAIN_COLORS[idea.domain] || '#ccc' }}>{idea.domain}</span></td>
                  <td className="px-6 py-4"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(idea.status)}`}>{idea.status}</span></td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={(e) => handleLike(e, idea)} disabled={likingId === idea.id} className={`flex items-center justify-center gap-1 px-2 py-1 rounded-full border text-xs font-medium mx-auto ${idea.isLiked ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}`}>
                      <Heart className={`h-3 w-3 ${idea.isLiked ? 'fill-red-600' : ''}`} /> {idea.likesCount}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-center"><span className={`text-lg ${getScoreColor(idea.score || 0)}`}>{idea.score || 0}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isRestrictedView && sortedData.length > 0 && (
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-sm text-slate-500">Page {currentPage} of {totalPages}</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="p-2 border rounded-md bg-white hover:bg-slate-50 disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="p-2 border rounded-md bg-white hover:bg-slate-50 disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {isRestrictedView && (
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 text-center text-sm text-slate-400">
          Showing latest 100 submissions. Search to find more.
        </div>
      )}
    </div>
  );
};

export default IdeaTable;

