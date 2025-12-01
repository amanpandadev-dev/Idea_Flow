import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams, Outlet, useLocation } from 'react-router-dom';
import Header from './components/Header';
import StatsSection from './components/StatsSection';
import IdeaTable from './components/IdeaTable';
import IdeaDetails from './components/IdeaDetails';
import ChartDetail from './components/ChartDetail';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import ForgotPasswordPage from './components/ForgotPasswordPage';
import AssociateModal from './components/AssociateModal';
import UserProfileModal from './components/UserProfileModal';
import ExploreModal from './components/ExploreModal';
import { ExploreFilters } from './types';
import WishlistModal from './components/WishListModal';
import ProSearchModal from './components/ProSearchModal';
import { INITIAL_DATA } from './constants';
import { fetchIdeas, fetchAssociateDetails, fetchBusinessGroups, fetchLikedIdeas, fetchCurrentUser, searchIdeas } from './services';
import { Idea, Associate } from './types';
import { Loader2 } from 'lucide-react';
import AgentChat from './components/AgentChat';

import { X, LayoutDashboard, FolderKanban, Loader2, Filter, BarChart3, Heart } from 'lucide-react';

type TabType = 'dashboard' | 'filtered-analytics' | 'projects' | 'wishlist' | 'pro-search' | string;
type AuthView = 'login' | 'register' | 'forgot-password';

interface UserProfile {
  id: number;
  name: string;
  role: string;
  emp_id?: string;
  email?: string;
}

// Pro Search State Interface
interface ProSearchState {
  query: string;
  results: Idea[];
  isOpen: boolean;
  hasSearched: boolean;
}

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [likedIdeas, setLikedIdeas] = useState<Idea[]>([]);
  const [allBusinessGroups, setAllBusinessGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Added missing state
  const [usingMockData, setUsingMockData] = useState(false);

  // Search State
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Idea[] | null>(null);

  // Pro Search State
  const [proSearchState, setProSearchState] = useState<ProSearchState>({
    query: '',
    results: [],
    isOpen: false,
    hasSearched: false
  });

  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const [globalFilters, setGlobalFilters] = useState<ExploreFilters>({ themes: [], businessGroups: [], technologies: [] });

  const [selectedAssociate, setSelectedAssociate] = useState<Associate | null>(null);
  const [associateLoading, setAssociateLoading] = useState(false);
  const [isAssociateModalOpen, setIsAssociateModalOpen] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  useEffect(() => {
    if (window.location.hash === '#register') setAuthView('register');
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (token) {
      setIsAuthenticated(true);
      if (storedUser) setUser(JSON.parse(storedUser));
    } else {
      setLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [ideasData, bgData, likedData] = await Promise.all([
        fetchIdeas(),
        fetchBusinessGroups(),
        fetchLikedIdeas()
      ]);

      if (ideasData.length === 0) {
        setIdeas(INITIAL_DATA);
        const mockBGs = new Set<string>();
        INITIAL_DATA.forEach(i => mockBGs.add(i.businessGroup));
        setAllBusinessGroups(Array.from(mockBGs).sort());
        setLikedIdeas([]);
        setUsingMockData(true);
      } else {
        setIdeas(ideasData);
        setAllBusinessGroups(bgData);
        setLikedIdeas(likedData);
        setUsingMockData(false);
      }
    } catch (err) {
      setIdeas(INITIAL_DATA);
      const mockBGs = new Set<string>();
      INITIAL_DATA.forEach(i => mockBGs.add(i.businessGroup));
      setAllBusinessGroups(Array.from(mockBGs).sort());
      setUsingMockData(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadData();
  }, [isAuthenticated, loadData]);

  // Helper to load wishlist
  const loadWishlist = useCallback(async () => {
    try {
      const data = await fetchLikedIdeas();
      setLikedIdeas(data);
    } catch (err) {
      console.error("Failed to load wishlist", err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'wishlist') {
      loadWishlist();
    }
  }, [activeTab, loadWishlist]);

  const handleSearch = async (query: string) => {
    if (!query.trim()) { setSearchResults(null); return; }
    setIsSearching(true);
    try {
      const { results } = await searchIdeas(query);
      setSearchResults(results);
    } catch (err) { console.error("Search failed", err); }
    finally { setIsSearching(false); }
  };

  const displayIdeas = useMemo(() => {
    const sourceData = searchResults || ideas;
    return sourceData.filter(idea => {
      const matchesTheme = globalFilters.themes.length === 0 || globalFilters.themes.includes(idea.domain);
      const matchesBG = globalFilters.businessGroups.length === 0 || globalFilters.businessGroups.includes(idea.businessGroup);
      const matchesTech = globalFilters.technologies.length === 0 || idea.technologies.some(t => globalFilters.technologies.includes(t));
      return matchesTheme && matchesBG && matchesTech;
    });
  }, [ideas, searchResults, globalFilters]);

  const allThemes = useMemo(() => {
    const themeSet = new Set<string>();
    ideas.forEach(idea => idea.domain && themeSet.add(idea.domain));
    return Array.from(themeSet).sort();
  }, [ideas]);

  const allTechnologies = useMemo(() => {
    const techSet = new Set<string>();
    ideas.forEach(idea => idea.technologies.forEach(tech => techSet.add(tech)));
    return Array.from(techSet).sort();
  }, [ideas]);

  const handleLogin = () => {
    setIsAuthenticated(true);
    const storedUser = localStorage.getItem('user');
    if (storedUser) setUser(JSON.parse(storedUser));
    loadData();
  };

  const handleLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    setIsAuthenticated(false); setUser(null); setAuthView('login');
  };

  const handleViewAssociate = useCallback(async (associateId: number) => {
    setIsAssociateModalOpen(true); setAssociateLoading(true);
    try { setSelectedAssociate(await fetchAssociateDetails(associateId)); }
    catch (err) { setSelectedAssociate(null); }
    finally { setAssociateLoading(false); }
  }, []);

  const handleViewProfile = async () => {
    setIsProfileModalOpen(true);
    try { setCurrentUserProfile(await fetchCurrentUser()); } catch (e) { }
  };

  const handleOpenWishlist = () => {
    setIsWishlistOpen(true);
    loadWishlist();
  };

  // Pro Search Handlers
  const handleOpenProSearch = () => {
    setProSearchState(prev => ({ ...prev, isOpen: true }));
  };

  const handleCloseProSearch = () => {
    setProSearchState(prev => ({ ...prev, isOpen: false }));
  };

  const handleProSearchComplete = (query: string, results: Idea[]) => {
    setProSearchState({ query, results, isOpen: true, hasSearched: true });
  };

  const handleViewDetails = (idea: Idea) => {
    if (proSearchState.isOpen) {
      setProSearchState(prev => ({ ...prev, isOpen: false }));
    }
    setActiveTab(`detail:${idea.id}`);
  };

  // Logic to handle "Back" button from IdeaDetails
  const handleBackFromDetails = () => {
    // If we have search results in Pro Search state and it was recently used, re-open it
    if (proSearchState.hasSearched && proSearchState.results.length > 0) {
      setProSearchState(prev => ({ ...prev, isOpen: true }));
      setActiveTab('dashboard'); // Return to background view
    } else if (activeTab.includes('wishlist')) {
      setIsWishlistOpen(true);
      setActiveTab('dashboard');
    } else {
      setActiveTab('projects'); // Default back to list
    }
  };

  const handleRefreshData = () => {
    loadData();
    if (isWishlistOpen || activeTab === 'wishlist') {
      loadWishlist();
    }
  };

  if (!isAuthenticated) {
    if (authView === 'register') return <RegisterPage onNavigateToLogin={() => setAuthView('login')} />;
    if (authView === 'forgot-password') return <ForgotPasswordPage onNavigateToLogin={() => setAuthView('login')} />;
    return <LoginPage onLogin={handleLogin} onForgotPassword={() => setAuthView('forgot-password')} />;
  }

  if (loading && !activeTab.startsWith('detail') && activeTab !== 'wishlist') return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

// Main application structure after login
const MainApp: React.FC<{ user: UserProfile | null, onLogout: () => void }> = ({ user, onLogout }) => {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [likedIdeas, setLikedIdeas] = useState<Idea[]>([]);
  const [allBusinessGroups, setAllBusinessGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  const navigate = useNavigate();

  // Modal states
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const [isAssociateModalOpen, setIsAssociateModalOpen] = useState(false);
  const [selectedAssociate, setSelectedAssociate] = useState<Associate | null>(null);
  const [associateLoading, setAssociateLoading] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ideasData, bgData, likedData] = await Promise.all([fetchIdeas(), fetchBusinessGroups(), fetchLikedIdeas()]);
      setIdeas(ideasData.length > 0 ? ideasData : INITIAL_DATA);
      setAllBusinessGroups(bgData);
      setLikedIdeas(likedData);
    } catch (err) {
      console.warn("Backend connection failed, falling back to mock data:", err);
      setIdeas(INITIAL_DATA);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleViewDetails = (idea: Idea) => navigate(`/idea/${idea.id}`);
  
  const handleViewAssociate = async (associateId: number) => {
    setIsAssociateModalOpen(true);
    setAssociateLoading(true);
    try {
      setSelectedAssociate(await fetchAssociateDetails(associateId));
    } finally {
      setAssociateLoading(false);
    }
  };

  const handleViewProfile = async () => {
    setIsProfileModalOpen(true);
    try {
      setCurrentUserProfile(await fetchCurrentUser());
    } catch (err) { console.error("Failed to fetch user profile", err); }
  };
  
  const handleOpenWishlist = async () => {
    setIsWishlistOpen(true);
    try {
      setLikedIdeas(await fetchLikedIdeas());
    } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Header
        user={user}
        onLogout={handleLogout}
        onExplore={() => setIsExploreOpen(true)}
        onOpenWishlist={handleOpenWishlist}
        onOpenProfile={handleViewProfile}
        onOpenProSearch={handleOpenProSearch}
        likedCount={likedIdeas.length}
        ideaCount={ideas.length}
      />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!activeTab.startsWith('detail') && !activeTab.startsWith('chart') && (
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
              <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><LayoutDashboard className="h-4 w-4" /> Global Dashboard</button>
              <button onClick={() => setActiveTab('projects')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'projects' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><FolderKanban className="h-4 w-4" /> Ideas Submissions <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">{displayIdeas.length}</span></button>
              {activeFiltersCount > 0 && (
                <button onClick={() => setActiveTab('filtered-analytics')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${activeTab === 'filtered-analytics' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}><BarChart3 className="h-4 w-4" /> Filtered Analytics</button>
              )}
            </div>
            {activeFiltersCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg border shadow-sm">
                <Filter className="h-3 w-3" /> <span>Filters: {activeFiltersCount}</span>
                <button onClick={() => { setGlobalFilters({ themes: [], businessGroups: [], technologies: [] }); setActiveTab('projects'); }} className="ml-2 hover:text-red-500"><X className="h-3 w-3" /></button>
              </div>
            )}
          </div>
        )}

        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          {activeTab === 'dashboard' && <StatsSection data={ideas} onOpenChart={(id) => setActiveTab(`chart:${id}:global`)} />}
          {activeTab === 'projects' && (
            <IdeaTable
              data={displayIdeas}
              onViewDetails={(idea) => setActiveTab(`detail:${idea.id}`)}
              onOpenExplore={() => setIsExploreOpen(true)}
              isGlobalFilterActive={activeFiltersCount > 0}
              onRefreshData={loadData}
              onSearch={handleSearch}
              isSearching={isSearching}
            />
          )}
          {activeTab === 'filtered-analytics' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center gap-3 text-emerald-800"><Filter className="h-5 w-5" /><h3 className="font-semibold">Filtered Analytics View</h3></div>
              <StatsSection data={displayIdeas} onOpenChart={(id) => setActiveTab(`chart:${id}:filtered`)} />
            </div>
          )}

          {/* Details View */}
          {activeTab.startsWith('detail:') && (
            (() => {
              const ideaId = activeTab.split(':')[1];
              // Find idea in any available list
              const idea = ideas.find(i => i.id === ideaId)
                || likedIdeas.find(i => i.id === ideaId)
                || (searchResults || []).find(i => i.id === ideaId)
                || proSearchState.results.find(i => i.id === ideaId);

              return idea ? (
                <IdeaDetails
                  idea={idea}
                  onBack={handleBackFromDetails}
                  onViewAssociate={handleViewAssociate}
                  onNavigateToIdea={handleViewDetails}
                  onRefreshData={handleRefreshData}
                />
              ) : <div>Idea not found</div>;
            })()
          )}

          {activeTab.startsWith('chart:') && (
            (() => {
              const [, chartId, context] = activeTab.split(':');
              return <ChartDetail chartId={chartId} data={context === 'filtered' ? displayIdeas : ideas} onBack={() => setActiveTab(context === 'filtered' ? 'filtered-analytics' : 'dashboard')} />;
            })()
          )}
        </div>
      </main>

      <ExploreModal isOpen={isExploreOpen} onClose={() => setIsExploreOpen(false)} onApplyFilters={(f) => { setGlobalFilters(f); setActiveTab('projects'); }} initialFilters={globalFilters} availableTechnologies={allTechnologies} availableThemes={allThemes} availableBusinessGroups={allBusinessGroups} />
      {isAssociateModalOpen && <AssociateModal associate={selectedAssociate} loading={associateLoading} onClose={() => setIsAssociateModalOpen(false)} />}
      {isProfileModalOpen && <UserProfileModal user={currentUserProfile} isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />}

      {isWishlistOpen && (
        <WishlistModal
          isOpen={isWishlistOpen}
          onClose={() => setIsWishlistOpen(false)}
          likedIdeas={likedIdeas}
          onViewDetails={handleViewDetails}
          onRefreshData={handleRefreshData}
        />
      )}

      {proSearchState.isOpen && (
        <ProSearchModal
          isOpen={proSearchState.isOpen}
          onClose={handleCloseProSearch}
          onViewDetails={handleViewDetails}
          onRefreshData={handleRefreshData}
          initialQuery={proSearchState.query}
          initialResults={proSearchState.results}
          onSearchComplete={handleProSearchComplete}
          availableTechnologies={allTechnologies}
          availableThemes={allThemes}
          availableBusinessGroups={allBusinessGroups}
        />
      )}
    </div>
  );
};

// Wrapper components to handle URL params
const IdeaDetailsWrapper = (props: any) => {
  const { ideaId } = useParams<{ ideaId: string }>();
  const navigate = useNavigate();
  const idea = props.ideas.find((i: Idea) => i.id === ideaId);
  return idea ? <IdeaDetails {...props} idea={idea} onBack={() => navigate('/ideas')} /> : <div>Idea not found</div>;
};

const ChartDetailWrapper = (props: any) => {
  const { chartId } = useParams<{ chartId: string }>();
  const navigate = useNavigate();
  return <ChartDetail {...props} chartId={chartId} onBack={() => navigate('/')} />;
};

export default App;