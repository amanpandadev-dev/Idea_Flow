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
   onRefreshData,
   initialQuery = '',
   initialResults = [],
   onSearchComplete,
   availableTechnologies,
   availableThemes,
   availableBusinessGroups,
   userId = 'anonymous'
}) => {
   if (!isOpen) return null;

   return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
         {/* Full-screen Header with Close Button */}
         <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg">
            <h2 className="text-xl font-bold text-white">Pro Search - Conversational AI</h2>
            <button
               onClick={onClose}
               className="p-2 hover:bg-white/20 rounded-lg transition-colors group"
               title="Close Pro Search"
            >
               <X className="w-6 h-6 text-white group-hover:rotate-90 transition-transform duration-200" />
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
            />
         </div>
      </div>
   );
};

export default ProSearchModal;
