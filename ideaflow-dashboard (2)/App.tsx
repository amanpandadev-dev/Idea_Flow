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
import ExploreModal, { ExploreFilters } from './components/ExploreModal';
import WishlistModal from './components/WishListModal';
import { INITIAL_DATA } from './constants';
import { fetchIdeas, fetchAssociateDetails, fetchBusinessGroups, fetchLikedIdeas, fetchCurrentUser } from './services';
import { Idea, Associate } from './types';
import { Loader2 } from 'lucide-react';
import AgentChat from './components/AgentChat';

type AuthView = 'login' | 'register' | 'forgot-password';

interface UserProfile {
  id: number;
  name: string;
  role: string;
  emp_id?: string;
  email?: string;
}

// Main App component: Handles Authentication
const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (token) {
      setIsAuthenticated(true);
      if (storedUser) setUser(JSON.parse(storedUser));
    }
  }, []);
  
  useEffect(() => {
    if (window.location.hash === '#register') setAuthView('register');
  }, []);

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

  if (!isAuthenticated) {
    if (authView === 'register') return <RegisterPage onNavigateToLogin={() => setAuthView('login')} />;
    if (authView === 'forgot-password') return <ForgotPasswordPage onNavigateToLogin={() => setAuthView('login')} />;
    return <LoginPage onLogin={handleLogin} onForgotPassword={() => setAuthView('forgot-password')} />;
  }

  return <MainApp user={user} onLogout={handleLogout} />;
};

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
        onLogout={onLogout}
        onOpenWishlist={handleOpenWishlist}
        onOpenProfile={handleViewProfile}
        likedCount={likedIdeas.length}
        ideaCount={ideas.length}
      />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
         {loading ? (
            <div className="flex items-center justify-center pt-20"><Loader2 className="h-10 w-10 animate-spin text-indigo-600" /></div>
         ) : (
            <Routes>
                <Route path="/" element={<StatsSection data={ideas} onOpenChart={(id) => navigate(`/chart/${id}`)} />} />
                <Route path="/ideas" element={<IdeaTable data={ideas} onViewDetails={handleViewDetails} onOpenExplore={() => setIsExploreOpen(true)} onRefreshData={loadData} isGlobalFilterActive={false}/>} />
                <Route path="/agent" element={<AgentChat onNavigateToIdea={(ideaId) => navigate(`/idea/${ideaId}`)} />} />
                <Route path="/idea/:ideaId" element={<IdeaDetailsWrapper ideas={ideas.concat(likedIdeas)} onViewAssociate={handleViewAssociate} onNavigateToIdea={(idea) => navigate(`/idea/${idea.id}`)} onRefreshData={loadData} />} />
                <Route path="/chart/:chartId" element={<ChartDetailWrapper ideas={ideas} />} />
            </Routes>
         )}
      </main>

      {/* Global Modals */}
      <ExploreModal isOpen={isExploreOpen} onClose={() => setIsExploreOpen(false)} onApplyFilters={() => {}} initialFilters={{themes: [], businessGroups: [], technologies: []}} availableTechnologies={[]} availableThemes={[]} availableBusinessGroups={allBusinessGroups} />
      {isAssociateModalOpen && <AssociateModal associate={selectedAssociate} loading={associateLoading} onClose={() => setIsAssociateModalOpen(false)} />}
      {isProfileModalOpen && <UserProfileModal user={currentUserProfile} isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />}
      {isWishlistOpen && <WishlistModal isOpen={isWishlistOpen} onClose={() => setIsWishlistOpen(false)} likedIdeas={likedIdeas} onViewDetails={handleViewDetails} onRefreshData={loadData} />}
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