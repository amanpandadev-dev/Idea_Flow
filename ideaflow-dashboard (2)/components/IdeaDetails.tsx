
import React, { useState, useEffect } from 'react';
import { Idea, Status } from '../types';
import { DOMAIN_COLORS } from '../constants';
import { fetchSimilarIdeas } from '../services';
import { Calendar, User, ArrowLeft, CheckCircle, Clock, AlertCircle, Activity, Cpu, Layers, GitBranch, Building2, Hammer, Code2, Sparkles, Zap, TrendingUp, Target, ShieldCheck, Info, ArrowRight } from 'lucide-react';

interface IdeaDetailsProps {
  idea: Idea;
  onBack?: () => void;
  onViewAssociate?: (associateId: number) => void;
  onNavigateToIdea?: (idea: Idea) => void;
}

const IdeaDetails: React.FC<IdeaDetailsProps> = ({ idea, onBack, onViewAssociate, onNavigateToIdea }) => {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [similarIdeas, setSimilarIdeas] = useState<Idea[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  // Fetch similar ideas on mount or when idea changes
  useEffect(() => {
    const loadSimilar = async () => {
      setLoadingSimilar(true);
      try {
        const similar = await fetchSimilarIdeas(idea.id);
        if (similar) setSimilarIdeas(similar);
      } catch (err) {
        console.error("Failed to load similar ideas", err);
      } finally {
        setLoadingSimilar(false);
      }
    };
    loadSimilar();
    // Reset analysis view when idea changes
    setShowAnalysis(false);
  }, [idea.id]);

  const handleGenerateAnalysis = () => {
    setIsAnalyzing(true);
    // Simulate AI processing delay
    setTimeout(() => {
      setIsAnalyzing(false);
      setShowAnalysis(true);
    }, 1500);
  };
  
  const getStatusColor = (status: Status) => {
    switch(status) {
      case Status.IN_PRODUCTION: return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case Status.IN_DEVELOPMENT: return 'text-blue-600 bg-blue-50 border-blue-200';
      case Status.SUBMITTED: return 'text-slate-600 bg-slate-50 border-slate-200';
      case Status.REJECTED: return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-amber-600 bg-amber-50 border-amber-200';
    }
  };

  const getStatusIcon = (status: Status) => {
    switch(status) {
      case Status.IN_PRODUCTION: return <CheckCircle className="h-5 w-5" />;
      case Status.IN_DEVELOPMENT: return <Activity className="h-5 w-5" />;
      case Status.SUBMITTED: return <Clock className="h-5 w-5" />;
      case Status.REJECTED: return <AlertCircle className="h-5 w-5" />;
      default: return <Clock className="h-5 w-5" />;
    }
  };

  // Helper for Score Color
  const getScoreColor = (score: number = 0) => {
    if (score >= 8) return 'text-emerald-600 bg-emerald-100';
    if (score >= 5) return 'text-amber-600 bg-amber-100';
    return 'text-red-600 bg-red-100';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300 pb-10">
      {onBack && (
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Ideas
        </button>
      )}

      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-4 flex-1">
            <div className="flex items-center gap-3 text-sm text-slate-500">
               <span className="bg-slate-100 px-2 py-1 rounded text-xs font-mono">{idea.id}</span>
               <span>•</span>
               <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(idea.submissionDate).toLocaleDateString()}</span>
            </div>
            
            <h1 className="text-3xl font-bold text-slate-900">{idea.title}</h1>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${getStatusColor(idea.status)}`}>
                {getStatusIcon(idea.status)}
                {idea.status}
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-sm font-medium">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DOMAIN_COLORS[idea.domain] || '#ccc' }}></span>
                {idea.domain}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Analysis Section Button */}
      

      {/* Analysis Results */}
      {showAnalysis && (
        <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl shadow-sm border border-indigo-100 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-indigo-500" />
                Strategic Analysis & Scoring
              </h3>
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full uppercase tracking-wide">AI Generated</span>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Impact Score */}
              <div className="bg-white p-4 rounded-xl border border-indigo-50 shadow-sm flex flex-col items-center text-center">
                 <div className={`h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg mb-2 ${getScoreColor(idea.impactScore)}`}>
                   {idea.impactScore}
                 </div>
                 <div className="text-slate-900 font-semibold flex items-center gap-1">
                    <Zap className="h-4 w-4 text-amber-500" /> Impact
                 </div>
                 <p className="text-xs text-slate-500 mt-1">Potential business value and revenue generation.</p>
              </div>

              {/* Confidence Score */}
              <div className="bg-white p-4 rounded-xl border border-indigo-50 shadow-sm flex flex-col items-center text-center">
                 <div className={`h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg mb-2 ${getScoreColor(idea.confidenceScore)}`}>
                   {idea.confidenceScore}
                 </div>
                 <div className="text-slate-900 font-semibold flex items-center gap-1">
                    <Target className="h-4 w-4 text-blue-500" /> Confidence
                 </div>
                 <p className="text-xs text-slate-500 mt-1">Reliability of estimations and success probability.</p>
              </div>

              {/* Feasibility Score */}
              <div className="bg-white p-4 rounded-xl border border-indigo-50 shadow-sm flex flex-col items-center text-center">
                 <div className={`h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg mb-2 ${getScoreColor(idea.feasibilityScore)}`}>
                   {idea.feasibilityScore}
                 </div>
                 <div className="text-slate-900 font-semibold flex items-center gap-1">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" /> Feasibility
                 </div>
                 <p className="text-xs text-slate-500 mt-1">Technical ease and resource availability.</p>
              </div>
           </div>

           <div className="bg-white/60 p-5 rounded-xl border border-indigo-50">
              <h4 className="font-semibold text-indigo-900 flex items-center gap-2 mb-2">
                 <TrendingUp className="h-5 w-5" />
                 Future Scope & Scalability
              </h4>
              <p className="text-slate-700 leading-relaxed italic">
                "{idea.futureScope || 'Scalability potential includes integration with broader enterprise data lakes and potential for external commercialization as a SaaS offering.'}"
              </p>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Description & Tech */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Description */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-600" />
              Description & Scope
            </h3>
            <div className="prose prose-slate max-w-none">
              <p className="text-slate-600 leading-relaxed">
                {idea.description}
              </p>
              <p className="text-slate-600 leading-relaxed mt-4">
                This initiative aims to leverage <strong>{idea.domain}</strong> to drive significant value for the {idea.businessGroup} organization. 
                By implementing {idea.buildType}, we anticipate improvements in operational efficiency and user satisfaction.
              </p>
            </div>
          </div>

          {/* Technical Stack */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Code2 className="h-5 w-5 text-indigo-600" />
              Technology Stack
            </h3>
            <div className="flex flex-wrap gap-2">
              {idea.technologies.map(tech => (
                <span key={tech} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-md text-sm font-medium border border-slate-200">
                  {tech}
                </span>
              ))}
            </div>
          </div>

          {/* Theme & Build Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-indigo-600" />
                Theme Context
              </h3>
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 h-full">
                <div className="flex items-center gap-3 mb-2">
                  <Cpu className="h-6 w-6 text-slate-400" />
                  <span className="font-medium text-slate-700 line-clamp-1" title={idea.domain}>{idea.domain}</span>
                </div>
                <p className="text-sm text-slate-500 mt-2">
                  Classified under <strong>{idea.domain}</strong>.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Hammer className="h-5 w-5 text-indigo-600" />
                Build Type
              </h3>
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 h-full">
                <div className="flex items-center gap-3 mb-2">
                  <Activity className="h-6 w-6 text-slate-400" />
                  <span className="font-medium text-slate-700">{idea.buildType}</span>
                </div>
                <p className="text-sm text-slate-500 mt-2">
                  Categorized as a <strong>{idea.buildType}</strong> project.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Project Ownership (Combined Org & Submitter) */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-600" />
              Project Ownership
            </h3>
            
            {/* Clickable Associate Card */}
            <div 
              className="flex items-center gap-4 mb-6 p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-slate-200 group"
              onClick={() => onViewAssociate && onViewAssociate(idea.associateId)}
              title="Click to view full associate profile"
            >
              <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg shrink-0 group-hover:bg-indigo-200 transition-colors">
                {idea.associateAccount.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-slate-900 flex items-center gap-2">
                   {idea.associateAccount}
                   <Info className="h-3 w-3 text-slate-400 group-hover:text-indigo-500" />
                </p>
                <p className="text-sm text-slate-500">Associate ID: {idea.associateId}</p>
              </div>
            </div>
            
            <div className="border-t border-slate-100 pt-4 space-y-4">
              <div>
                 <label className="text-xs text-slate-500 uppercase font-semibold">Business Group</label>
                 <p className="text-slate-900 font-medium">{idea.businessGroup}</p>
              </div>
              <div>
                 <label className="text-xs text-slate-500 uppercase font-semibold">Submitted On</label>
                 <p className="text-slate-900 font-medium">{new Date(idea.submissionDate).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Similar Ideas Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
         <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
             <Sparkles className="h-5 w-5 text-amber-500" />
             Similar Ideas & Related Work
         </h3>
         
         {loadingSimilar ? (
             <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                 Loading related ideas...
             </div>
         ) : similarIdeas.length > 0 ? (
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {similarIdeas.map(sim => (
                     <div 
                        key={sim.id} 
                        onClick={() => onNavigateToIdea && onNavigateToIdea(sim)}
                        className="border border-slate-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
                     >
                         <div className="flex justify-between items-start mb-2">
                             <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                                 {sim.id}
                             </span>
                             <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(sim.status)}`}>
                                 {sim.status}
                             </span>
                         </div>
                         <h4 className="font-medium text-slate-800 line-clamp-2 mb-2 group-hover:text-indigo-700 transition-colors">
                             {sim.title}
                         </h4>
                         <div className="flex items-center gap-1 text-xs text-slate-500 mb-2">
                             <Cpu className="h-3 w-3" />
                             <span className="truncate">{sim.domain}</span>
                         </div>
                         <div className="flex items-center text-indigo-600 text-xs font-medium mt-auto">
                             View Idea <ArrowRight className="h-3 w-3 ml-1 group-hover:translate-x-1 transition-transform" />
                         </div>
                     </div>
                 ))}
             </div>
         ) : (
             <div className="text-center py-6 text-slate-400 text-sm italic">
                 No similar ideas found matching this theme or keywords.
             </div>
         )}
      </div>
    </div>
  );
};

export default IdeaDetails;
