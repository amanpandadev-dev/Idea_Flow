
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
import { fetchIdeas, updateIdeaStatus, fetchAssociateDetails, fetchBusinessGroups } from './services';
import { Idea, Status, Associate } from './types';
import { Search, X, LayoutDashboard, FolderKanban, Sparkles, ArrowLeft, PieChart, Loader2, AlertCircle, Filter } from 'lucide-react';

type TabType = 'dashboard' | 'projects' | string;
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
  const [detailTabs, setDetailTabs] = useState<Idea[]>([]);
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

  // Fetch Data only after successful login
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [ideasData, bgData] = await Promise.all([
          fetchIdeas(),
          fetchBusinessGroups()
        ]);
        
        if (ideasData.length === 0) {
           console.log("Database is empty or error, using mock data for demonstration.");
           setIdeas(INITIAL_DATA);
           // Calculate BGs from mock data since API might return empty
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
        // Calculate BGs from mock data
        const mockBGs = new Set<string>();
        INITIAL_DATA.forEach(i => mockBGs.add(i.businessGroup));
        setAllBusinessGroups(Array.from(mockBGs).sort());
        setUsingMockData(true);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isAuthenticated]);

  // Derived filtered data based on Global Filters
  const filteredIdeas = useMemo(() => {
    return ideas.filter(idea => {
      // Status filter removed from global filters as per requirement
      const matchTheme = globalFilters.themes.length === 0 || globalFilters.themes.includes(idea.domain);
      const matchBG = globalFilters.businessGroups.length === 0 || 
        globalFilters.businessGroups.includes(idea.businessGroup) || 
        globalFilters.businessGroups.includes(idea.associateBusinessGroup);
      
      // Technology match (if any selected tech is present in idea's tech stack)
      const matchTech = globalFilters.technologies.length === 0 || 
        idea.technologies.some(t => globalFilters.technologies.includes(t));
      
      return matchTheme && matchBG && matchTech;
    });
  }, [ideas, globalFilters]);

  // Extract all unique technologies for the filter
  const allTechnologies = useMemo(() => {
    const techSet = new Set<string>();
    ideas.forEach(idea => idea.technologies.forEach(t => techSet.add(t)));
    return Array.from(techSet).sort();
  }, [ideas]);

  // Extract unique Themes (Domains) dynamically from data
  const allThemes = useMemo(() => {
    const themeSet = new Set<string>();
    ideas.forEach(idea => {
      if (idea.domain) themeSet.add(idea.domain);
    });
    return Array.from(themeSet).sort();
  }, [ideas]);

  const handleUpdateStatus = useCallback(async (id: string, newStatus: Status) => {
    // Optimistic Update
    setIdeas(prev => prev.map(idea => 
      idea.id === id ? { ...idea, status: newStatus } : idea
    ));
    setDetailTabs(prev => prev.map(idea => 
      idea.id === id ? { ...idea, status: newStatus } : idea
    ));

    if (!usingMockData) {
      try {
        await updateIdeaStatus(id, newStatus);
      } catch (err) {
        console.error("Failed to persist status update", err);
      }
    }
  }, [usingMockData]);

  const handleOpenDetails = (idea: Idea) => {
    if (!detailTabs.find(t => t.id === idea.id)) {
      setDetailTabs([...detailTabs, idea]);
    }
    setActiveTab(idea.id);
  };

  const handleViewAssociate = async (associateId: number) => {
     setIsAssociateModalOpen(true);
     setAssociateLoading(true);
     try {
       if (usingMockData) {
          // Mock associate for demo mode
          setSelectedAssociate({
             associate_id: associateId,
             account: "MOCK_ACCOUNT",
             location: "New York, USA",
             parent_ou: "Global Technology",
             business_group: "Digital Operations"
          });
       } else {
          const details = await fetchAssociateDetails(associateId);
          setSelectedAssociate(details);
       }
     } catch (err) {
       console.error("Failed to fetch associate", err);
       setSelectedAssociate(null);
     } finally {
       setAssociateLoading(false);
     }
  };

  const handleOpenChart = (chartId: string) => {
    setActiveTab(`chart:${chartId}`);
  };

  const handleCloseTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newTabs = detailTabs.filter(t => t.id !== id);
    setDetailTabs(newTabs);
    if (activeTab === id) {
      setActiveTab(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : 'projects');
    }
  };

  const handleApplyGlobalFilters = (filters: ExploreFilters) => {
    setGlobalFilters(filters);
    setIsExploreOpen(false);
    // Switch to projects tab immediately to show the list without stats
    setActiveTab('projects');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
    setIdeas([]);
    setActiveTab('dashboard');
    setAuthView('login');
  };

  // Callback after successful login from LoginPage
  const handleLoginSuccess = () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
       setUser(JSON.parse(storedUser));
    }
    setIsAuthenticated(true);
  };

  // Helper to determine if current tab is a chart tab
  const isChartTab = activeTab.startsWith('chart:');
  const currentChartId = isChartTab ? activeTab.split(':')[1] : '';
  const getChartTabName = (id: string) => {
      switch(id) {
          case 'theme': return 'Themes';
          case 'status': return 'Status';
          case 'build': return 'Build Type';
          case 'businessGroup': return 'Business Group';
          default: return 'Chart';
      }
  }

  // --- Auth Render ---
  if (!isAuthenticated) {
    if (authView === 'register') {
      return <RegisterPage onNavigateToLogin={() => setAuthView('login')} />;
    }
    if (authView === 'forgot-password') {
      return <ForgotPasswordPage onNavigateToLogin={() => setAuthView('login')} />;
    }
    return (
      <LoginPage 
        onLogin={handleLoginSuccess} 
        onForgotPassword={() => setAuthView('forgot-password')}
      />
    );
  }

  // --- Loading State ---
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-500">Loading Repository Data...</p>
        </div>
      </div>
    );
  }

  const activeFiltersCount = globalFilters.themes.length + globalFilters.businessGroups.length + globalFilters.technologies.length;

  // --- Main App Render ---
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Header 
        user={user} 
        onLogout={handleLogout} 
        // Explore button removed from header
      />
      
      {/* Backend Status Indicator */}
      {usingMockData && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center justify-center gap-2">
          <AlertCircle className="h-3 w-3" />
          <span>Backend unconnected or empty. Running in Demo Mode.</span>
        </div>
      )}

      {/* Global Filter Indicator (If active) */}
      {activeFiltersCount > 0 && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-3 flex items-center justify-center gap-4 animate-in slide-in-from-top-2">
           <div className="flex items-center gap-2 text-sm text-emerald-800">
             <Filter className="h-4 w-4" />
             <span className="font-medium">Active Explore Filters:</span> 
             {activeFiltersCount} applied. Showing {filteredIdeas.length} of {ideas.length} results.
           </div>
           <button 
             onClick={() => setGlobalFilters({ themes: [], businessGroups: [], technologies: [] })}
             className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 underline"
           >
             Clear All
           </button>
        </div>
      )}

      {/* Tab Navigation Bar */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 sticky top-16 z-20">
        <div className="max-w-7xl mx-auto flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'dashboard' 
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </button>
          
          <button
            onClick={() => setActiveTab('projects')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'projects' 
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <FolderKanban className="h-4 w-4" />
            Ideas Submissions
          </button>

          {/* Dynamic Chart Tab */}
          {isChartTab && (
             <button
             onClick={() => {}}
             className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap border-indigo-600 text-indigo-600 bg-indigo-50/50`}
           >
             <PieChart className="h-4 w-4" />
             Analytics: {getChartTabName(currentChartId)}
             <span 
                onClick={(e) => { e.stopPropagation(); setActiveTab('dashboard'); }}
                className="ml-2 p-0.5 rounded-full hover:bg-indigo-100 text-indigo-400 hover:text-indigo-600"
             >
               <X className="h-3 w-3" />
             </span>
           </button>
          )}

          {/* Idea Detail Tabs */}
          {detailTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap relative pr-8 ${
                activeTab === tab.id 
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span className="max-w-[100px] truncate">{tab.title}</span>
              <span 
                onClick={(e) => handleCloseTab(e, tab.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative min-h-[80vh]">
            
            {/* Charts & Stats Layer */}
            <section className="animate-in fade-in duration-500">
              
              <StatsSection data={filteredIdeas} onOpenChart={handleOpenChart} />
            </section>
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Ideas Submissions</h2>
                  <p className="text-slate-500">Manage and review all associate idea submissions.</p>
                </div>
             </div>
             {/* IdeaTable now includes search and local filtering logic */}
             <IdeaTable 
               data={filteredIdeas} 
               onUpdateStatus={handleUpdateStatus} 
               onViewDetails={handleOpenDetails}
               onOpenExplore={() => setIsExploreOpen(true)}
             />
          </div>
        )}

        {isChartTab && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <ChartDetail 
                    chartId={currentChartId} 
                    data={filteredIdeas} // Pass filtered data to charts too
                    onBack={() => setActiveTab('dashboard')} 
                />
            </div>
        )}

        {detailTabs.map(idea => (
          activeTab === idea.id && (
            <div key={idea.id}>
              <IdeaDetails 
                idea={idea} 
                onUpdateStatus={handleUpdateStatus}
                onBack={() => setActiveTab('projects')}
                onViewAssociate={handleViewAssociate}
                onNavigateToIdea={handleOpenDetails}
              />
            </div>
          )
        ))}

      </main>

      {/* Associate Details Modal */}
      {isAssociateModalOpen && (
         <AssociateModal 
            associate={selectedAssociate} 
            loading={associateLoading} 
            onClose={() => setIsAssociateModalOpen(false)} 
         />
      )}

      {/* Global Explore Modal */}
      <ExploreModal 
        isOpen={isExploreOpen} 
        onClose={() => setIsExploreOpen(false)} 
        onApplyFilters={handleApplyGlobalFilters}
        initialFilters={globalFilters}
        availableTechnologies={allTechnologies}
        availableThemes={allThemes}
        availableBusinessGroups={allBusinessGroups}
      />
    </div>
  );
};

export default App;
