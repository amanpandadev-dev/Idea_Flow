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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
         <div className="w-[95vw] h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-purple-600">
               <h2 className="text-xl font-bold text-white">Pro Search - Conversational AI</h2>
               <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
               >
                  <X className="w-5 h-5 text-white" />
               </button>
            </div>

            {/* Chat Interface */}
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
      </div>
   );
};

export default ProSearchModal;
