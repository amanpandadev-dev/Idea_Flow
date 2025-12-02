
import React from 'react';
import { Lightbulb, Bell, UserCircle, LogOut, Heart, Sparkles, Bot, LayoutDashboard, FolderKanban } from 'lucide-react';

interface HeaderProps {
  user?: { name: string; role: string } | null;
  onLogout?: () => void;
  onOpenWishlist?: () => void;
  onOpenProfile?: () => void;
  onOpenProSearch?: () => void;
  likedCount?: number;
  ideaCount?: number;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const Header: React.FC<HeaderProps> = ({
  user,
  onLogout,
  onOpenWishlist,
  onOpenProfile,
  onOpenProSearch,
  likedCount = 0,
  ideaCount = 0,
  activeTab,
  onTabChange
}) => {

  const getNavClass = (tabName: string) =>
    `flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tabName
      ? 'bg-indigo-50 text-indigo-700'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => onTabChange && onTabChange('dashboard')}
            >
              <div className="bg-indigo-600 p-2 rounded-lg">
                <Lightbulb className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">IdeaFlow</h1>
              </div>
            </div>

            {/* Primary Navigation - Centered if possible or next to logo */}
            {onTabChange && (
              <nav className="hidden md:flex items-center gap-1">
                <button
                  onClick={() => onTabChange('dashboard')}
                  className={getNavClass('dashboard')}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </button>

                <button
                  onClick={() => onTabChange('projects')}
                  className={getNavClass('projects')}
                >
                  <FolderKanban className="h-4 w-4" />
                  Ideas
                  {ideaCount > 0 && (
                    <span className="ml-1.5 bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full border border-slate-200">
                      {ideaCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => onTabChange('agent')}
                  className={getNavClass('agent')}
                >
                  <Bot className="h-4 w-4" />
                  AI Agent
                </button>
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3">

            {/* Pro Search Button */}
            {onOpenProSearch && (
              <button
                onClick={onOpenProSearch}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-full text-xs font-medium hover:shadow-md transition-all hover:-translate-y-0.5 mr-2"
              >
                <Sparkles className="h-3 w-3" />
                Pro Search
              </button>
            )}

            {/* Wishlist / My Likes */}
            {onOpenWishlist && (
              <button
                onClick={onOpenWishlist}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all relative group"
                title="My Like List"
              >
                <Heart className="h-4 w-4 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline">My Likes</span>
                {likedCount > 0 && (
                  <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {likedCount > 99 ? '99+' : likedCount}
                  </span>
                )}
              </button>
            )}

            <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>

            {/* User Profile */}
            <div className="flex items-center gap-2 pl-1">
              <button
                onClick={onOpenProfile}
                className="flex items-center gap-2 hover:bg-slate-50 p-1.5 rounded-lg transition-colors group text-left"
                title="View Profile"
              >
                <UserCircle className="h-8 w-8 text-slate-400 group-hover:text-indigo-600" />
                <div className="hidden lg:block text-sm">
                  <p className="font-medium text-slate-700 group-hover:text-indigo-700 max-w-[100px] truncate">{user?.name || 'Guest'}</p>
                  <p className="text-[10px] text-slate-500 capitalize">{user?.role || 'Viewer'}</p>
                </div>
              </button>

              {onLogout && (
                <button
                  onClick={onLogout}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
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
