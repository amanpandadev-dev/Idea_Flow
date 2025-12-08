import React from 'react';
import { X } from 'lucide-react';
import ProSearchChat from './ProSearchChat';
import { Idea } from '../types';

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
  // User ID for chat history
  userId?: string;
}

const ProSearchModal: React.FC<ProSearchModalProps> = ({
  isOpen,
  onClose,
  onViewDetails,
  availableTechnologies,
  availableThemes,
  availableBusinessGroups,
  userId = 'anonymous'
}) => {
  // if (!isOpen) return null; // Keep mounted to preserve state

  return (
    <div className={`fixed inset-0 z-50 bg-white ${isOpen ? '' : 'hidden'}`}>
      {/* Fullscreen Modal */}
      <div className="w-full h-full flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-purple-600">
          <h2 className="text-xl font-bold text-white">Pro Search - Conversational AI</h2>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-white" />
            <span className="text-white text-sm font-medium">Close</span>
          </button>
        </div>

        {/* Chat Interface - Full Height */}
        <div className="flex-1 overflow-hidden">
          <ProSearchChat
            onNavigateToIdea={onViewDetails}
            availableTechnologies={availableTechnologies}
            availableThemes={availableThemes}
            availableBusinessGroups={availableBusinessGroups}
            userId={userId}
            isVisible={isOpen}
          />
        </div>
      </div>
    </div>
  );
};

export default ProSearchModal;