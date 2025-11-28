import React from 'react';
import { Lightbulb, UserCircle, LogOut, Bot } from 'lucide-react';
import { NavLink, Link } from 'react-router-dom';

interface HeaderProps {
  user?: { name: string; role: string } | null;
  onLogout?: () => void;
  onOpenWishlist?: () => void;
  onOpenProfile?: () => void;
  likedCount?: number;
  ideaCount?: number;
}

const Header: React.FC<HeaderProps> = ({ user, onLogout, onOpenWishlist, onOpenProfile, likedCount = 0, ideaCount = 0 }) => {
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 text-sm font-medium rounded-lg transition-all ${isActive
      ? 'bg-indigo-50 text-indigo-600'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
    }`;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-6">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <Lightbulb className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">IdeaFlow</h1>
              </div>
            </Link>

            {/* Primary Navigation */}
            <nav className="hidden md:flex items-center gap-2">
              <NavLink to="/" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/ideas" className={navLinkClass}>
                Ideas
                {ideaCount > 0 && <span className="ml-1.5 bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full border border-slate-200">{ideaCount}</span>}
              </NavLink>
              <NavLink to="/agent" className={navLinkClass}>
                <span className="flex items-center gap-1.5">
                  <Bot className="h-4 w-4" />
                  AI Agent
                </span>
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {/* Action Buttons */}
            {onOpenWishlist && (
              <button
                onClick={onOpenWishlist}
                className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 rounded-lg transition-all"
                title="My Like List"
              >
                My Likes {likedCount > 0 && `(${likedCount})`}
              </button>
            )}

            <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block"></div>

            {/* User Menu */}
            <div className="flex items-center gap-3 pl-2">
              <button
                onClick={onOpenProfile}
                className="flex items-center gap-2 hover:bg-slate-50 p-1.5 rounded-lg transition-colors group text-left"
                title="View Profile"
              >
                <UserCircle className="h-8 w-8 text-slate-400 group-hover:text-indigo-600" />
                <div className="hidden md:block text-sm">
                  <p className="font-medium text-slate-700 group-hover:text-indigo-700">{user?.name || 'Guest User'}</p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role || 'Viewer'}</p>
                </div>
              </button>

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