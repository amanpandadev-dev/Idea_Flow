
import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
import ExploreModal, { ExploreFilters } from './components/ExploreModal';
import WishlistModal from './components/WishListModal';
import ProSearchModal from './components/ProSearchModal';
import { INITIAL_DATA } from './constants';
import { fetchIdeas, fetchAssociateDetails, fetchBusinessGroups, fetchLikedIdeas, fetchCurrentUser, searchIdeas } from './services';
import { Idea, Associate } from './types';
import { Loader2, Filter, X } from 'lucide-react';
import AgentChat from './components/AgentChat';

type TabType = 'dashboard' | 'filtered-analytics' | 'projects' | 'wishlist' | 'pro-search' | 'agent' | string;
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

  // Navigation State
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [previousTab, setPreviousTab] = useState<TabType>('dashboard');

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
  const [isProSearchOpen, setIsProSearchOpen] = useState(false);

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

  // Helper to load wishlist
  const loadWishlist = useCallback(async () => {
    try {
      const data = await fetchLikedIdeas();
      setLikedIdeas(data);
    } catch (err) {
      console.error("Failed to load wishlist", err);
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

  // --- Handlers ---

  const handleTabChange = (newTab: TabType) => {
    setPreviousTab(activeTab);
    setActiveTab(newTab);
  };

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
      setPreviousTab('pro-search');
      // Store the idea in proSearchState.results so it can be found when rendering details
      setProSearchState(prev => ({
        ...prev,
        isOpen: false,
        results: prev.results.some(r => r.id === idea.id) 
          ? prev.results 
          : [...prev.results, idea]
      }));
    } else {
      setPreviousTab(activeTab);
    }
    setActiveTab(`detail:${idea.id}`);
  };

  const handleBackFromDetails = () => {
    if (previousTab === 'pro-search') {
      setProSearchState(prev => ({ ...prev, isOpen: true }));
      setActiveTab('dashboard');
    } else if (activeTab.includes('wishlist')) {
      setIsWishlistOpen(true);
      setActiveTab('dashboard');
    } else {
      setActiveTab(previousTab);
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

  const activeFiltersCount = globalFilters.themes.length + globalFilters.businessGroups.length + globalFilters.technologies.length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Header
        user={user}
        onLogout={handleLogout}
        onOpenWishlist={handleOpenWishlist}
        onOpenProfile={handleViewProfile}
        onOpenProSearch={handleOpenProSearch}
        likedCount={likedIdeas.length}
        ideaCount={ideas.length}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Active Filter Bar */}
        {activeFiltersCount > 0 && !activeTab.startsWith('detail') && !activeTab.startsWith('chart') && (
          <div className="mb-6 flex justify-end">
            <div className="flex items-center gap-2 text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg border shadow-sm">
              <Filter className="h-3 w-3" /> <span>Filters Active: {activeFiltersCount}</span>
              <button onClick={() => { setGlobalFilters({ themes: [], businessGroups: [], technologies: [] }); handleTabChange('projects'); }} className="ml-2 hover:text-red-500"><X className="h-3 w-3" /></button>
            </div>
          </div>
        )}

        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">

          {/* DASHBOARD VIEW */}
          {activeTab === 'dashboard' && (
            <StatsSection data={ideas} onOpenChart={(id) => handleTabChange(`chart:${id}:global`)} />
          )}

          {/* IDEAS VIEW */}
          {activeTab === 'projects' && (
            <IdeaTable
              data={displayIdeas}
              onViewDetails={handleViewDetails}
              onOpenExplore={() => setIsExploreOpen(true)}
              isGlobalFilterActive={activeFiltersCount > 0}
              onRefreshData={handleRefreshData}
              onSearch={handleSearch}
              isSearching={isSearching}
            />
          )}

          {/* AI AGENT VIEW */}
          {activeTab === 'agent' && (
            <AgentChat onNavigateToIdea={(ideaId) => handleViewDetails(ideas.find(i => i.id === ideaId) || { id: ideaId } as Idea)} />
          )}

          {/* CHART DETAIL VIEW */}
          {activeTab.startsWith('chart:') && (
            (() => {
              const [, chartId, context] = activeTab.split(':');
              return <ChartDetail chartId={chartId} data={context === 'filtered' ? displayIdeas : ideas} onBack={() => handleTabChange('dashboard')} />;
            })()
          )}

          {/* IDEA DETAILS VIEW */}
          {activeTab.startsWith('detail:') && (
            (() => {
              const ideaId = activeTab.split(':')[1];
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
        </div>
      </main>

      <ExploreModal isOpen={isExploreOpen} onClose={() => setIsExploreOpen(false)} onApplyFilters={(f) => { setGlobalFilters(f); handleTabChange('projects'); }} initialFilters={globalFilters} availableTechnologies={allTechnologies} availableThemes={allThemes} availableBusinessGroups={allBusinessGroups} />
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

export default App;
