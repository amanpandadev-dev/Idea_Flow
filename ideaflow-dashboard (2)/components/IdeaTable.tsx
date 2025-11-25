
import React, { useState, useMemo, useEffect } from 'react';
import { Idea, Status } from '../types';
import { DOMAIN_COLORS } from '../constants';
import { ChevronDown, ChevronUp, Calendar, User, ExternalLink, Filter, Compass, Search, ChevronLeft, ChevronRight, Heart, Trophy } from 'lucide-react';
import { toggleLikeIdea } from '../services';

interface IdeaTableProps {
  data: Idea[];
  onViewDetails: (idea: Idea) => void;
  onOpenExplore: () => void;
  isGlobalFilterActive: boolean;
  onRefreshData?: () => void; // Callback to refresh data after liking
}

type SortField = 'date' | 'status' | 'domain' | 'score' | 'likes';
type SortOrder = 'asc' | 'desc';

const ITEMS_PER_PAGE = 15;

const IdeaTable: React.FC<IdeaTableProps> = ({ 
  data, 
  onViewDetails,
  onOpenExplore,
  isGlobalFilterActive,
  onRefreshData
}) => {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [likingId, setLikingId] = useState<string | null>(null);

  // Reset page when data or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [data, searchQuery]);

  // Determine if we are in the "Latest 100" restricted view
  // Active when NO global filters are applied AND NO local search is active
  const isRestrictedView = !isGlobalFilterActive && !searchQuery.trim();

  // 1. Filter Logic (Local Search)
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;

    const query = searchQuery.toLowerCase();
    return data.filter(idea => 
      idea.title.toLowerCase().includes(query) ||
      idea.id.toLowerCase().includes(query) ||
      idea.associateAccount.toLowerCase().includes(query) ||
      idea.domain.toLowerCase().includes(query) ||
      idea.status.toLowerCase().includes(query)
    );
  }, [data, searchQuery]);

  // 2. Sort Logic
  const sortedData = useMemo(() => {
    let result = [...filteredData];

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date':
          comparison = new Date(a.submissionDate).getTime() - new Date(b.submissionDate).getTime();
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'domain':
          comparison = a.domain.localeCompare(b.domain);
          break;
        case 'score':
          comparison = (a.score || 0) - (b.score || 0); 
          break;
        case 'likes':
          comparison = a.likesCount - b.likesCount;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [filteredData, sortField, sortOrder]);

  // 3. Display Logic (Restricted vs Paginated)
  const displayData = useMemo(() => {
    if (isRestrictedView) {
      // Show only top 100 items if no filters are active
      return sortedData.slice(0, 100);
    }
    // Otherwise show paginated view of ALL matching items
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedData.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedData, currentPage, isRestrictedView]);

  const totalPages = Math.ceil(sortedData.length / ITEMS_PER_PAGE);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleLike = async (e: React.MouseEvent, idea: Idea) => {
    e.stopPropagation();
    if (likingId) return;
    
    setLikingId(idea.id);
    try {
      await toggleLikeIdea(idea.id);
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error("Failed to toggle like", err);
    } finally {
      setLikingId(null);
    }
  };

  const getStatusColor = (status: Status) => {
    switch(status) {
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
                 {isRestrictedView ? 'Latest Submissions' : 'Filtered Results'}
               </h3>
               <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                 {isRestrictedView 
                   ? `${Math.min(100, sortedData.length)} visible` 
                   : `${sortedData.length} total`}
               </span>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search in list..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <button 
                 onClick={onOpenExplore}
                 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border shadow-sm shrink-0 ${
                    isGlobalFilterActive 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' 
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700'
                 }`}
              >
                 <Compass className="h-4 w-4" />
                 Explore & Filter
                 {isGlobalFilterActive && <span className="flex h-2 w-2 rounded-full bg-emerald-500 ml-1"></span>}
              </button>
            </div>
         </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto z-10 flex-1">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-1/3">
                 <div className="flex items-center gap-2">
                   Idea Title & Likes
                   <span 
                      onClick={() => handleSort('likes')}
                      className="cursor-pointer hover:text-indigo-600 ml-2 flex items-center gap-1"
                      title="Sort by Likes"
                   >
                     {sortField === 'likes' && (sortOrder === 'asc' ? <ChevronUp className="h-3 w-3"/> : <ChevronDown className="h-3 w-3"/>)}
                   </span>
                 </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700"
                onClick={() => handleSort('domain')}
              >
                <div className="flex items-center gap-1">Theme {sortField === 'domain' && (sortOrder === 'asc' ? <ChevronUp className="h-3 w-3"/> : <ChevronDown className="h-3 w-3"/>)}</div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700"
                onClick={() => handleSort('status')}
              >
                 <div className="flex items-center gap-1">Status {sortField === 'status' && (sortOrder === 'asc' ? <ChevronUp className="h-3 w-3"/> : <ChevronDown className="h-3 w-3"/>)}</div>
              </th>
              <th 
                className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 w-24"
                onClick={() => handleSort('score')}
              >
                <div className="flex items-center justify-center gap-1">
                   <Trophy className="h-3 w-3" /> Score 
                   {sortField === 'score' && (sortOrder === 'asc' ? <ChevronUp className="h-3 w-3"/> : <ChevronDown className="h-3 w-3"/>)}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {displayData.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <div className="p-3 bg-slate-50 rounded-full mb-3">
                      <Filter className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-medium text-slate-600">No ideas match your filters</p>
                    <p className="text-xs mt-1">Try adjusting your search or global explore filters</p>
                  </div>
                </td>
              </tr>
            ) : (
              displayData.map((idea) => (
                <tr key={idea.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                         {/* Like Button */}
                         <button 
                            onClick={(e) => handleLike(e, idea)}
                            disabled={likingId === idea.id}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium transition-all ${
                               idea.isLiked 
                                ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                            }`}
                         >
                            <Heart className={`h-3 w-3 ${idea.isLiked ? 'fill-red-600' : ''}`} />
                            {idea.likesCount}
                         </button>
                         <span 
                           className="text-sm font-medium text-indigo-600 cursor-pointer hover:underline truncate"
                           onClick={() => onViewDetails(idea)}
                         >
                           {idea.title}
                         </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 pl-14">
                        <User className="h-3 w-3" /> {idea.associateAccount}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span 
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-white text-slate-800 max-w-[220px]" 
                      style={{ borderColor: DOMAIN_COLORS[idea.domain] || '#ccc' }} 
                      title={idea.domain}
                    >
                      <span className="h-2 w-2 rounded-full mr-1.5 flex-shrink-0" style={{ backgroundColor: DOMAIN_COLORS[idea.domain] || '#ccc' }}></span>
                      <span className="truncate">{idea.domain}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(idea.status)}`}>
                       {idea.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`text-lg ${getScoreColor(idea.score || 0)}`}>
                       {idea.score || 0}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Footer - Only shown when NOT in restricted view */}
      {!isRestrictedView && sortedData.length > 0 && (
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            Showing <span className="font-medium">{Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, sortedData.length)}</span> to <span className="font-medium">{Math.min(currentPage * ITEMS_PER_PAGE, sortedData.length)}</span> of <span className="font-medium">{sortedData.length}</span> results
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-2 border border-slate-300 rounded-md bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            
            <div className="flex items-center gap-1">
               <span className="text-sm font-medium px-2">
                 Page {currentPage} of {totalPages}
               </span>
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-2 border border-slate-300 rounded-md bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Footer for Restricted View */}
      {isRestrictedView && (
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 text-center text-sm text-slate-400">
           Showing latest 100 submissions. Use search or explore filters to find more.
        </div>
      )}
    </div>
  );
};

export default IdeaTable;
