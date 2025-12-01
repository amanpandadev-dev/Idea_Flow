
import React, { useState, useEffect } from 'react';
import { X, Search, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import IdeaTable from './IdeaTable';
import ExploreModal from './ExploreModal';
import { Idea, ExploreFilters } from '../types';
import { searchIdeas } from '../services';

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
}

const SUGGESTIONS = [
   "Cloud-native solutions for finance",
   "React apps with real-time features",
   "AI for improving accessibility",
   "Sustainable energy monitoring"
];

const ProSearchModal: React.FC<ProSearchModalProps> = ({
   isOpen,
   onClose,
   onViewDetails,
   onRefreshData,
   initialQuery = '',
   initialResults = [],
   onSearchComplete,
   availableTechnologies,
   availableThemes,
   availableBusinessGroups
}) => {
   const [query, setQuery] = useState(initialQuery);
   const [results, setResults] = useState<Idea[]>(initialResults);
   const [isSearching, setIsSearching] = useState(false);
   const [hasSearched, setHasSearched] = useState(initialResults.length > 0 || initialQuery.length > 0);

   // Filter State
   const [filters, setFilters] = useState<ExploreFilters>({ themes: [], businessGroups: [], technologies: [] });
   const [isExploreOpen, setIsExploreOpen] = useState(false);

   // Sync internal state if props change (re-opening modal)
   useEffect(() => {
      if (isOpen) {
         setQuery(initialQuery);
         setResults(initialResults);
         setHasSearched(initialResults.length > 0 || initialQuery.length > 0);
      }
   }, [isOpen, initialQuery, initialResults]);

   if (!isOpen) return null;

   const handleSearch = async (searchQuery: string, searchFilters: ExploreFilters = filters) => {
      if (!searchQuery.trim()) return;

      setQuery(searchQuery);
      setIsSearching(true);
      setHasSearched(true);

      try {
         const { results: searchResults } = await searchIdeas(searchQuery, searchFilters);
         setResults(searchResults);
         // Persist up to parent
         if (onSearchComplete) {
            onSearchComplete(searchQuery, searchResults);
         }
      } catch (err) {
         console.error("Pro Search failed", err);
      } finally {
         setIsSearching(false);
      }
   };

   const handleApplyFilters = (newFilters: ExploreFilters) => {
      setFilters(newFilters);
      if (query.trim()) {
         handleSearch(query, newFilters);
      }
   };

   const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
         handleSearch(query);
      }
   };

   const activeFilterCount = filters.themes.length + filters.businessGroups.length + filters.technologies.length;

   return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
         <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300"
            onClick={onClose}
         />

         <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col h-[85vh] overflow-hidden border border-slate-200">

            {/* Search Header */}
            <div className="p-8 pb-6 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
               <div className="flex justify-between items-start mb-6">
                  <div>
                     <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Sparkles className="h-6 w-6 text-violet-600" />
                        Pro Search
                     </h2>
                     <p className="text-slate-500 mt-1">Find concepts using natural language descriptions</p>
                  </div>
                  <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100">
                     <X className="h-6 w-6" />
                  </button>
               </div>

               <div className="relative max-w-3xl mx-auto">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                     {isSearching ? <Loader2 className="h-6 w-6 text-violet-500 animate-spin" /> : <Search className="h-6 w-6 text-slate-400" />}
                  </div>
                  <input
                     type="text"
                     className="w-full pl-12 pr-24 py-4 text-lg border border-slate-200 rounded-xl shadow-sm focus:ring-4 focus:ring-violet-100 focus:border-violet-500 outline-none transition-all placeholder:text-slate-300"
                     placeholder="Describe what you are looking for..."
                     value={query}
                     onChange={(e) => setQuery(e.target.value)}
                     onKeyDown={handleKeyDown}
                     autoFocus
                  />
                  {query && (
                     <button
                        onClick={() => {
                           setQuery('');
                           setFilters({ themes: [], businessGroups: [], technologies: [] });
                           setHasSearched(false);
                           setResults([]);
                        }}
                        className="absolute right-32 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                        title="Clear search"
                     >
                        <X className="h-5 w-5" />
                     </button>
                  )}
                  <button
                     onClick={() => handleSearch(query)}
                     className="absolute right-2 top-2 bottom-2 px-4 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors flex items-center gap-2"
                  >
                     Search <ArrowRight className="h-4 w-4" />
                  </button>
               </div>

               {/* Suggestions */}
               {!hasSearched && (
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                     <span className="text-sm text-slate-400 mr-2">Try:</span>
                     {SUGGESTIONS.map(s => (
                        <button
                           key={s}
                           onClick={() => handleSearch(s)}
                           className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-full text-sm hover:border-violet-300 hover:text-violet-600 transition-colors"
                        >
                           {s}
                        </button>
                     ))}
                  </div>
               )}
            </div>

            {/* Results Area */}
            <div className="flex-1 bg-slate-50/50 p-6 overflow-hidden flex flex-col">
               {isSearching ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                     <Loader2 className="h-10 w-10 animate-spin mb-4 text-violet-500" />
                     <p>Analyzing semantic relevance...</p>
                  </div>
               ) : hasSearched ? (
                  results.length > 0 ? (
                     <div className="flex-1 overflow-y-auto custom-scrollbar bg-white rounded-xl border border-slate-200 shadow-sm">
                        <div className="p-4 border-b border-slate-100 text-sm text-slate-500 bg-slate-50/50 flex justify-between items-center">
                           <span>Found {results.length} relevant ideas</span>
                           <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">AI Ranked</span>
                        </div>
                        {/* Reuse IdeaTable but customized for this view */}
                        <IdeaTable
                           data={results}
                           onViewDetails={(idea) => {
                              // Call parent handler which will update App state (close modal, switch tab)
                              onViewDetails(idea);
                           }}
                           isGlobalFilterActive={activeFilterCount > 0}
                           showExplore={true} // Enable explore button
                           onOpenExplore={() => setIsExploreOpen(true)}
                           onRefreshData={onRefreshData}
                           onSearch={() => { }}
                        />
                     </div>
                  ) : (
                     <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <div className="bg-slate-100 p-4 rounded-full mb-4">
                           <Search className="h-8 w-8 text-slate-300" />
                        </div>
                        <p className="text-lg font-medium text-slate-600">No matching ideas found</p>
                        <p>Try different keywords or a broader description.</p>
                        {activeFilterCount > 0 && (
                           <button
                              onClick={() => {
                                 setFilters({ themes: [], businessGroups: [], technologies: [] });
                                 handleSearch(query, { themes: [], businessGroups: [], technologies: [] });
                              }}
                              className="mt-4 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-colors text-sm font-medium shadow-sm"
                           >
                              Clear Filters ({activeFilterCount})
                           </button>
                        )}
                     </div>
                  )
               ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                     <Sparkles className="h-16 w-16 mb-4 text-slate-200" />
                     <p>Enter a description to start semantic search</p>
                  </div>
               )}
            </div>

         </div>

         {/* Local Explore Modal for Pro Search */}
         <ExploreModal
            isOpen={isExploreOpen}
            onClose={() => setIsExploreOpen(false)}
            onApplyFilters={handleApplyFilters}
            initialFilters={filters}
            availableTechnologies={availableTechnologies}
            availableThemes={availableThemes}
            availableBusinessGroups={availableBusinessGroups}
         />
      </div>
   );
};

export default ProSearchModal;
