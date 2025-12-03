
import React, { useState, useEffect } from 'react';
import { X, Filter, Check, Search, Layers, Briefcase, Code2 } from 'lucide-react';
import { ExploreFilters } from '../types';

interface ExploreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyFilters: (filters: ExploreFilters) => void;
  initialFilters: ExploreFilters;
  availableTechnologies: string[];
  availableThemes: string[];
  availableBusinessGroups: string[];
}

const ExploreModal: React.FC<ExploreModalProps> = ({
  isOpen,
  onClose,
  onApplyFilters,
  initialFilters,
  availableTechnologies,
  availableThemes,
  availableBusinessGroups
}) => {
  const [filters, setFilters] = useState<ExploreFilters>(initialFilters);
  const [techSearch, setTechSearch] = useState('');

  // Reset local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFilters(initialFilters);
    }
  }, [isOpen, initialFilters]);

  if (!isOpen) return null;

  const toggleFilter = (category: keyof ExploreFilters, value: string) => {
    setFilters(prev => {
      const current = prev[category];
      const updated = current.includes(value)
        ? current.filter(item => item !== value)
        : [...current, value];
      return { ...prev, [category]: updated };
    });
  };

  const filteredTechnologies = availableTechnologies.filter(t =>
    t.toLowerCase().includes(techSearch.toLowerCase())
  );

  const handleApply = () => {
    onApplyFilters(filters);
    onClose();
  };

  const handleReset = () => {
    setFilters({ themes: [], businessGroups: [], technologies: [] });
  };

  const activeCount = filters.themes.length + filters.businessGroups.length + filters.technologies.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Centered Modal */}
      <div className="relative w-full max-w-[80rem] bg-white rounded-xl shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col h-[85vh] overflow-hidden">

        {/* Header */}
        <div className="px-8 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl shrink-0 z-20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-lg">
              <Filter className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Explore & Filter</h2>
              <p className="text-sm text-slate-500">Refine your view across themes, business groups, and technologies</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* 3-Column Content Layout */}
        <div className="flex-1 min-h-0 relative">
          <div className="grid grid-cols-1 lg:grid-cols-3 h-full divide-y lg:divide-y-0 lg:divide-x divide-slate-200 absolute inset-0">

            {/* Column 1: Themes */}
            <div className="flex flex-col h-full bg-slate-50/30 min-h-0">
              <div className="p-4 border-b border-slate-100 bg-white sticky top-0 z-10">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wider">
                  <Layers className="h-4 w-4 text-indigo-500" /> Themes ({availableThemes.length})
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                {availableThemes.map(theme => (
                  <label
                    key={theme}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${filters.themes.includes(theme)
                      ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    <span className={`text-sm ${filters.themes.includes(theme) ? 'text-indigo-700 font-medium' : 'text-slate-700'}`}>
                      {theme}
                    </span>
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${filters.themes.includes(theme) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
                      }`}>
                      {filters.themes.includes(theme) && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={filters.themes.includes(theme)}
                      onChange={() => toggleFilter('themes', theme)}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Column 2: Business Groups */}
            <div className="flex flex-col h-full bg-slate-50/30 min-h-0">
              <div className="p-4 border-b border-slate-100 bg-white sticky top-0 z-10">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wider">
                  <Briefcase className="h-4 w-4 text-blue-500" /> Business Groups ({availableBusinessGroups.length})
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                {availableBusinessGroups.map(bg => (
                  <label
                    key={bg}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${filters.businessGroups.includes(bg)
                      ? 'bg-blue-50 border-blue-200 shadow-sm'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${filters.businessGroups.includes(bg) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'
                      }`}>
                      {filters.businessGroups.includes(bg) && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <span className={`text-sm ${filters.businessGroups.includes(bg) ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>
                      {bg}
                    </span>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={filters.businessGroups.includes(bg)}
                      onChange={() => toggleFilter('businessGroups', bg)}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Column 3: Technologies */}
            <div className="flex flex-col h-full bg-slate-50/30 min-h-0">
              <div className="p-4 border-b border-slate-100 bg-white sticky top-0 z-10">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
                  <Code2 className="h-4 w-4 text-emerald-500" /> Technologies
                </h3>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search stack..."
                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    value={techSearch}
                    onChange={(e) => setTechSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                <div className="flex flex-wrap gap-2 content-start">
                  {filteredTechnologies.map(tech => (
                    <button
                      key={tech}
                      onClick={() => toggleFilter('technologies', tech)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filters.technologies.includes(tech)
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200'
                        }`}
                    >
                      {tech}
                    </button>
                  ))}
                  {filteredTechnologies.length === 0 && (
                    <div className="w-full text-center py-8 text-slate-400 text-sm italic">
                      No matching technologies found
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-slate-200 bg-white rounded-b-xl flex items-center justify-between gap-4 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 relative">
          <div className="flex items-center gap-4">
            <button
              onClick={handleReset}
              className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors underline decoration-slate-300 hover:decoration-red-300"
            >
              Reset Filters
            </button>
            <span className="text-sm text-slate-400 border-l border-slate-200 pl-4">
              {activeCount} active filters
            </span>
          </div>

          <button
            onClick={handleApply}
            className="px-8 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 hover:shadow-emerald-300 transform hover:-translate-y-0.5"
          >
            Show {activeCount > 0 ? 'Filtered' : 'All'} Results
          </button>
        </div>

      </div>
    </div>
  );
};

export default ExploreModal;
export type { ExploreFilters };
