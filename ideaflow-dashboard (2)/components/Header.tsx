
import React from 'react';
import { Lightbulb, Bell, UserCircle, LogOut } from 'lucide-react';

interface HeaderProps {
  user?: { name: string; role: string } | null;
  onLogout?: () => void;
  onExplore?: () => void; // Keeping prop definition optional to prevent breakage if passed, but ignored in render
}

const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Lightbulb className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">IdeaFlow</h1>
              <p className="text-xs text-slate-500 hidden sm:block">Associate Idea Repository</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            
           

            <div className="flex items-center gap-3 pl-2">
              <div className="flex items-center gap-2">
                <UserCircle className="h-8 w-8 text-slate-400" />
                <div className="hidden md:block text-sm text-right">
                  <p className="font-medium text-slate-700">{user?.name || 'Guest User'}</p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role || 'Viewer'}</p>
                </div>
              </div>
              
              {onLogout && (
                <button 
                  onClick={onLogout}
                  className="ml-2 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                  title="Sign Out"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
