
import React from 'react';
import { X, User, Mail, Hash, Shield } from 'lucide-react';

interface UserProfileModalProps {
  user: any | null;
  isOpen: boolean;
  onClose: () => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, isOpen, onClose }) => {
  if (!isOpen || !user) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden relative animate-in zoom-in-95 duration-200 border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-indigo-600 px-6 py-6 flex flex-col items-center relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-indigo-200 hover:text-white hover:bg-indigo-500 rounded-full p-1 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          
          <div className="h-20 w-20 bg-indigo-400 rounded-full flex items-center justify-center text-white font-bold text-3xl mb-3 ring-4 ring-indigo-500/50">
             {user.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-xl font-bold text-white">{user.name}</h2>
          <p className="text-indigo-200 text-sm capitalize">{user.role}</p>
        </div>

        <div className="p-6 space-y-5">
           
           <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 text-slate-500 rounded-lg">
                 <Hash className="h-5 w-5" />
              </div>
              <div>
                 <p className="text-xs text-slate-400 font-medium uppercase">Employee ID</p>
                 <p className="text-slate-800 font-medium">{user.emp_id}</p>
              </div>
           </div>

           <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 text-slate-500 rounded-lg">
                 <Mail className="h-5 w-5" />
              </div>
              <div>
                 <p className="text-xs text-slate-400 font-medium uppercase">Email Address</p>
                 <p className="text-slate-800 font-medium">{user.email}</p>
              </div>
           </div>

           <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 text-slate-500 rounded-lg">
                 <Shield className="h-5 w-5" />
              </div>
              <div>
                 <p className="text-xs text-slate-400 font-medium uppercase">Password</p>
                 <p className="text-slate-800 font-medium tracking-widest">••••••••</p>
              </div>
           </div>

        </div>

      </div>
    </div>
  );
};

export default UserProfileModal;
