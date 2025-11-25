
import React, { useState, useMemo } from 'react';
import { Idea, Status } from '../types';
import { DOMAIN_COLORS } from '../constants';
import { ChevronDown, ChevronUp, Calendar, User, ExternalLink, Filter, Compass, Search } from 'lucide-react';

interface IdeaTableProps {
  data: Idea[];
  onViewDetails: (idea: Idea) => void;
  onOpenExplore: () => void;
}

type SortField = 'date' | 'status' | 'domain' | 'votes';
type SortOrder = 'asc' | 'desc';

const IdeaTable: React.FC<IdeaTableProps> = ({ 
  data, 
  onViewDetails,
  onOpenExplore
}) => {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');

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

  // 2. Sort Logic (Applied on filtered data)
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
        case 'votes':
          comparison = a.votes - b.votes;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [filteredData, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible flex flex-col">
      
      {/* Toolbar */}
      <div className="p-5 border-b border-slate-200 bg-slate-50/50">
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
               <h3 className="text-lg font-semibold text-slate-800">Submissions List</h3>
               <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                 Latest {Math.min(sortedData.length, 100)} items
               </span>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search ideas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <button 
                 onClick={onOpenExplore}
                 className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border bg-white border-slate-200 text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 shadow-sm shrink-0"
              >
                 <Compass className="h-4 w-4" />
                 Explore & Filter
              </button>
            </div>
         </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto z-10">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-1/3">Idea Title</th>
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
                className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center gap-1">Date {sortField === 'date' && (sortOrder === 'asc' ? <ChevronUp className="h-3 w-3"/> : <ChevronDown className="h-3 w-3"/>)}</div>
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {sortedData.length === 0 ? (
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
              // RESTRICT TO TOP 100 SUBMISSIONS
              sortedData.slice(0, 100).map((idea) => (
                <tr key={idea.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span 
                        className="text-sm font-medium text-indigo-600 cursor-pointer hover:underline"
                        onClick={() => onViewDetails(idea)}
                      >
                        {idea.title}
                      </span>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(idea.submissionDate).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                     <button 
                       onClick={() => onViewDetails(idea)}
                       className="text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1 ml-auto"
                     >
                       Details <ExternalLink className="h-3 w-3" />
                     </button>
                  </td>
                </tr>
              ))
            )}
            {sortedData.length > 100 && (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-xs text-slate-400 bg-slate-50/50">
                   End of latest 100 submissions view. Use 'Explore & Filter' to find specific items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Footer removed as per requirement (Pagination removed) */}
      <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-400 text-center">
        Displaying latest submissions only
      </div>
    </div>
  );
};

export default IdeaTable;
