
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
import ExploreModal, { ExploreFilters } from './components/ExploreModal';
import { INITIAL_DATA } from './constants';
import { fetchIdeas, fetchAssociateDetails, fetchBusinessGroups } from './services';
import { Idea, Associate } from './types';
import { X, LayoutDashboard, FolderKanban, Loader2, Filter, BarChart3 } from 'lucide-react';

type TabType = 'dashboard' | 'filtered-analytics' | 'projects' | string;
type AuthView = 'login' | 'register' | 'forgot-password';

interface UserProfile {
  id: number;
  name: string;
  role: string;
}

const App: React.FC = () => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [user, setUser] = useState<UserProfile | null>(null);

  // App Data State
  const [ideas, setIdeas] = useState<Idea[]>([]); 
  const [allBusinessGroups, setAllBusinessGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [usingMockData, setUsingMockData] = useState(false);

  // Global Explore Filter State
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const [globalFilters, setGlobalFilters] = useState<ExploreFilters>({
    themes: [],
    businessGroups: [],
    technologies: []
  });

  // Associate Modal State
  const [selectedAssociate, setSelectedAssociate] = useState<Associate | null>(null);
  const [associateLoading, setAssociateLoading] = useState(false);
  const [isAssociateModalOpen, setIsAssociateModalOpen] = useState(false);

  // Check Hash for Hidden Register Route
  useEffect(() => {
    if (window.location.hash === '#register') {
      setAuthView('register');
    }
  }, []);

  // Check for existing token and user data
  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (token) {
      setIsAuthenticated(true);
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error("Failed to parse stored user", e);
        }
      }
    } else {
      setLoading(false); // Stop loading if no token, show login
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [ideasData, bgData] = await Promise.all([
        fetchIdeas(),
        fetchBusinessGroups()
      ]);
      
      if (ideasData.length === 0) {
         console.log("Database is empty or error, using mock data for demonstration.");
         setIdeas(INITIAL_DATA);
         const mockBGs = new Set<string>();
         INITIAL_DATA.forEach(i => mockBGs.add(i.businessGroup));
         setAllBusinessGroups(Array.from(mockBGs).sort());
         setUsingMockData(true);
      } else {
         setIdeas(ideasData);
         setAllBusinessGroups(bgData);
         setError(null);
         setUsingMockData(false);
      }
    } catch (err) {
      console.warn("Backend connection failed or DB error, falling back to mock data:", err);
      setIdeas(INITIAL_DATA);
      const mockBGs = new Set<string>();
      INITIAL_DATA.forEach(i => mockBGs.add(i.businessGroup));
      setAllBusinessGroups(Array.from(mockBGs).sort());
      setUsingMockData(true);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Data only after successful login
  useEffect(() => {
    if (isAuthenticated) {
        loadData();
    }
  }, [isAuthenticated, loadData]);

  // Derived State: Filtered Ideas based on Global Filters
  const filteredIdeas = useMemo(() => {
    return ideas.filter(idea => {
      const matchesTheme = globalFilters.themes.length === 0 || globalFilters.themes.includes(idea.domain);
      const matchesBG = globalFilters.businessGroups.length === 0 || globalFilters.businessGroups.includes(idea.businessGroup);
      const matchesTech = globalFilters.technologies.length === 0 || 
        idea.technologies.some(t => globalFilters.technologies.includes(t));
      
      return matchesTheme && matchesBG && matchesTech;
    });
  }, [ideas, globalFilters]);

  // Calculate Available Filter Options from Actual Data
  const allThemes = useMemo(() => {
    const themeSet = new Set<string>();
    ideas.forEach(idea => {
      if (idea.domain) themeSet.add(idea.domain);
    });
    return Array.from(themeSet).sort();
  }, [ideas]);

  const allTechnologies = useMemo(() => {
    const techSet = new Set<string>();
    ideas.forEach(idea => {
      idea.technologies.forEach(tech => techSet.add(tech));
    });
    return Array.from(techSet).sort();
  }, [ideas]);

  // Handlers
  const handleLogin = () => {
    setIsAuthenticated(true);
    const storedUser = localStorage.getItem('user');
    if (storedUser) setUser(JSON.parse(storedUser));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
    setAuthView('login');
  };

  const handleApplyGlobalFilters = (filters: ExploreFilters) => {
    setGlobalFilters(filters);
    setActiveTab('projects');
  };

  const handleOpenChart = useCallback((chartId: string, context: 'global' | 'filtered' = 'global') => {
    setActiveTab(`chart:${chartId}:${context}`);
  }, []);

  const handleViewDetails = useCallback((idea: Idea) => {
    setActiveTab(`detail:${idea.id}`);
  }, []);

  const handleViewAssociate = useCallback(async (associateId: number) => {
    setIsAssociateModalOpen(true);
    setAssociateLoading(true);
    try {
      const details = await fetchAssociateDetails(associateId);
      setSelectedAssociate(details);
    } catch (err) {
      console.error("Failed to fetch associate details", err);
      setSelectedAssociate(null);
    } finally {
      setAssociateLoading(false);
    }
  }, []);

  // Auth Views
  if (!isAuthenticated) {
    if (authView === 'register') return <RegisterPage onNavigateToLogin={() => setAuthView('login')} />;
    if (authView === 'forgot-password') return <ForgotPasswordPage onNavigateToLogin={() => setAuthView('login')} />;
    return <LoginPage onLogin={handleLogin} onForgotPassword={() => setAuthView('forgot-password')} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 className="h-10 w-10 animate-spin mb-4 text-indigo-600" />
        <p className="font-medium">Loading Dashboard...</p>
      </div>
    );
  }

  const activeFiltersCount = globalFilters.themes.length + globalFilters.businessGroups.length + globalFilters.technologies.length;

  // Render Logic
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Header 
        user={user} 
        onLogout={handleLogout}
        onExplore={() => setIsExploreOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Navigation Tabs */}
        {!activeTab.startsWith('detail') && !activeTab.startsWith('chart') && (
           <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
                <button 
                  onClick={() => setActiveTab('dashboard')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'dashboard' 
                      ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200' 
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </button>
                
                {activeFiltersCount > 0 && (
                   <button 
                    onClick={() => setActiveTab('filtered-analytics')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      activeTab === 'filtered-analytics' 
                        ? 'bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200' 
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <BarChart3 className="h-4 w-4" />
                    Filtered Analytics
                    <span className="bg-emerald-100 text-emerald-700 text-xs px-1.5 py-0.5 rounded-full">
                       {activeFiltersCount}
                    </span>
                  </button>
                )}

                <button 
                  onClick={() => setActiveTab('projects')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'projects' 
                      ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200' 
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <FolderKanban className="h-4 w-4" />
                  Ideas Submissions
                  <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full border border-slate-200">
                    {filteredIdeas.length}
                  </span>
                </button>
              </div>

              {activeFiltersCount > 0 && (
                 <div className="flex items-center gap-2 text-sm text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <Filter className="h-3 w-3" />
                    <span>Active Filters: {activeFiltersCount}</span>
                    <button 
                      onClick={() => {
                        setGlobalFilters({ themes: [], businessGroups: [], technologies: [] });
                        // Optional: Redirect back to dashboard on clear
                        // setActiveTab('dashboard'); 
                      }}
                      className="ml-2 hover:bg-slate-100 p-1 rounded-full text-slate-400 hover:text-red-500 transition-colors"
                      title="Clear Filters"
                    >
                      <X className="h-3 w-3" />
                    </button>
                 </div>
              )}
           </div>
        )}

        {/* Content Area */}
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          
          {/* 1. Global Dashboard View */}
          {activeTab === 'dashboard' && (
            <StatsSection 
              data={ideas} // Pass FULL dataset
              onOpenChart={(id) => handleOpenChart(id, 'global')} 
            />
          )}

          {/* 2. Filtered Analytics View */}
          {activeTab === 'filtered-analytics' && (
            <div className="space-y-4">
               <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-center gap-3 text-emerald-800">
                  <Filter className="h-5 w-5" />
                  <div>
                    <h3 className="font-semibold">Filtered Analytics View</h3>
                    <p className="text-xs opacity-80">Showing statistics for {filteredIdeas.length} ideas matching your filters.</p>
                  </div>
               </div>
               <StatsSection 
                 data={filteredIdeas} // Pass FILTERED dataset
                 onOpenChart={(id) => handleOpenChart(id, 'filtered')} 
               />
            </div>
          )}

          {/* 3. Ideas List View */}
          {activeTab === 'projects' && (
            <IdeaTable 
              data={filteredIdeas} 
              onViewDetails={handleViewDetails}
              onOpenExplore={() => setIsExploreOpen(true)}
              isGlobalFilterActive={activeFiltersCount > 0}
              onRefreshData={loadData}
            />
          )}

          {/* 4. Details View */}
          {activeTab.startsWith('detail:') && (
            (() => {
              const ideaId = activeTab.split(':')[1];
              const idea = ideas.find(i => i.id === ideaId);
              return idea ? (
                <IdeaDetails 
                  idea={idea} 
                  onBack={() => setActiveTab('projects')} 
                  onViewAssociate={handleViewAssociate}
                  onNavigateToIdea={handleViewDetails}
                  onRefreshData={loadData}
                />
              ) : <div>Idea not found</div>;
            })()
          )}

          {/* 5. Chart Detail View */}
          {activeTab.startsWith('chart:') && (
            (() => {
              const [, chartId, context] = activeTab.split(':');
              // Determine which dataset to use based on context
              const chartData = context === 'filtered' ? filteredIdeas : ideas;
              
              return (
                <ChartDetail 
                  chartId={chartId} 
                  data={chartData} 
                  onBack={() => setActiveTab(context === 'filtered' ? 'filtered-analytics' : 'dashboard')} 
                />
              );
            })()
          )}
        </div>
      </main>

      {/* Global Modals */}
      <ExploreModal 
        isOpen={isExploreOpen} 
        onClose={() => setIsExploreOpen(false)}
        onApplyFilters={handleApplyGlobalFilters}
        initialFilters={globalFilters}
        availableTechnologies={allTechnologies}
        availableThemes={allThemes}
        availableBusinessGroups={allBusinessGroups}
      />

      {isAssociateModalOpen && (
        <AssociateModal 
          associate={selectedAssociate}
          loading={associateLoading}
          onClose={() => setIsAssociateModalOpen(false)}
        />
      )}

    </div>
  );
};

export default App;
