import React from 'react';
import { X, Heart } from 'lucide-react';
import IdeaTable from './IdeaTable';
import { Idea } from '../types';

interface WishlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  likedIdeas: Idea[];
  onViewDetails: (idea: Idea) => void;
  onRefreshData: () => void;
}

const WishlistModal: React.FC<WishlistModalProps> = ({ isOpen, onClose, likedIdeas, onViewDetails, onRefreshData }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Centered Modal */}
      <div className="relative w-full max-w-6xl bg-white rounded-xl shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col h-[85vh] overflow-hidden">

        {/* Header */}
        <div className="px-8 py-5 border-b border-slate-200 flex items-center justify-between bg-red-50 rounded-t-xl shrink-0 z-20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-100 text-red-600 rounded-lg">
              <Heart className="h-6 w-6 fill-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">My Like List</h2>
              <p className="text-sm text-slate-500">Your curated collection of {likedIdeas.length} ideas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 bg-slate-50 p-6 overflow-y-auto">
          {likedIdeas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Heart className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">Your list is empty</p>
              <p className="text-sm">Like ideas from the dashboard to see them here.</p>
            </div>
          ) : (
            <IdeaTable
              data={likedIdeas}
              onViewDetails={(idea) => {
                onViewDetails(idea);
                onClose(); // Close wishlist when navigating to details
              }}
              // We hide the explore button in wishlist context
              onOpenExplore={() => { }}
              showExplore={false}
              showSearch={false} // Disable search in wishlist
              // In wishlist, we want to see all items paginated, so we treat it as "filtered" (not restricted view)
              isGlobalFilterActive={true}
              onRefreshData={onRefreshData}
            />
          )}
        </div>

      </div>
    </div>
  );
};

export default WishlistModal;