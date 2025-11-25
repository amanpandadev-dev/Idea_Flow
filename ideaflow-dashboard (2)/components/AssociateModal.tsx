
import React from 'react';
import { X, User, MapPin, Building2, Briefcase } from 'lucide-react';
import { Associate } from '../types';

interface AssociateModalProps {
  associate: Associate | null;
  loading: boolean;
  onClose: () => void;
}

const AssociateModal: React.FC<AssociateModalProps> = ({ associate, loading, onClose }) => {
  if (!associate && !loading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in zoom-in-95 duration-200 border border-slate-200">
        
        {/* Header */}
        <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-100" />
            Associate Profile
          </h3>
          <button 
            onClick={onClose}
            className="text-indigo-100 hover:text-white hover:bg-indigo-500 rounded-full p-1 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
             <div className="flex flex-col items-center justify-center py-8 text-slate-500">
               <div className="h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
               <p>Fetching details...</p>
             </div>
          ) : associate ? (
            <div className="space-y-6">
              
              <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
                <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold text-2xl">
                   {associate.account.charAt(0).toUpperCase()}
                </div>
                <div>
                   <p className="text-sm text-slate-500 font-semibold uppercase tracking-wider">Account ID</p>
                   <h2 className="text-2xl font-bold text-slate-800">{associate.account}</h2>
                   <p className="text-xs text-slate-400">ID: {associate.associate_id}</p>
                </div>
              </div>

              <div className="space-y-4">
                 <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                       <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                       <p className="text-sm font-medium text-slate-500">Location</p>
                       <p className="text-slate-800 font-semibold">{associate.location || 'Not Specified'}</p>
                    </div>
                 </div>

                 {/* Parent OU Removed as per requirement */}

                 <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                       <Briefcase className="h-5 w-5" />
                    </div>
                    <div>
                       <p className="text-sm font-medium text-slate-500">Business Group</p>
                       <p className="text-slate-800 font-semibold">{associate.business_group}</p>
                    </div>
                 </div>
              </div>

            </div>
          ) : (
            <p className="text-center text-red-500">Could not load associate details.</p>
          )}
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 text-center">
            <button 
              onClick={onClose}
              className="w-full py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-100 transition-colors"
            >
              Close
            </button>
        </div>

      </div>
    </div>
  );
};

export default AssociateModal;
