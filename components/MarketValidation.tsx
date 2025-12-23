import React, { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, Shield, Lightbulb, AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Loader2, Download } from 'lucide-react';
import { Idea } from '../types';
import { 
    normalizeMarketValidationReport, 
    NormalizedMarketValidationReport,
    RawMarketValidationResponse 
} from './marketValidationAdapter';
import ErrorBoundary from './ErrorBoundary';

interface MarketValidationProps {
    ideas: Idea[];
    ideaId: string;
    onBack?: () => void;
}

const MarketValidation: React.FC<MarketValidationProps> = ({ ideas, ideaId, onBack }) => {

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [report, setReport] = useState<NormalizedMarketValidationReport | null>(null);
    const [expandedSources, setExpandedSources] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [expandedInternalPosition, setExpandedInternalPosition] = useState(false);
    const [expandedTrends, setExpandedTrends] = useState(false);
    const [expandedCompetitors, setExpandedCompetitors] = useState(false);
    const [expandedPatents, setExpandedPatents] = useState(false);
    const [expandedRisks, setExpandedRisks] = useState(false);
    const [expandedOpportunities, setExpandedOpportunities] = useState(false);

    const idea = ideas.find(i => i.id === ideaId);

    useEffect(() => {
        if (!ideaId) {
            setError('No idea ID provided');
            setLoading(false);
            return;
        }

        fetchValidationReport();
    }, [ideaId]);

    const fetchValidationReport = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/ideas/${ideaId}/market-validation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const rawData: RawMarketValidationResponse = await response.json();
            
            // Validate response has required structure
            if (!rawData || typeof rawData !== 'object') {
                throw new Error('Invalid response format from server');
            }
            
            // Normalize the API response before setting state
            try {
                const normalizedReport = normalizeMarketValidationReport(rawData);
                setReport(normalizedReport);
            } catch (normalizationError: any) {
                console.error('Error normalizing report:', normalizationError);
                throw new Error('Failed to process report data. Please try again.');
            }
        } catch (err: any) {
            console.error('Validation report error:', err);
            setError(err.message || 'An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadPDF = async () => {
        setDownloading(true);
        try {
            const response = await fetch(`/api/ideas/${ideaId}/market-validation/download`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Download failed');
            }

            // Create blob and trigger download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Market_Validation_${ideaId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err: any) {
            alert(err.message || 'Failed to download PDF');
        } finally {
            setDownloading(false);
        }
    };

    const getRiskColor = (level: string) => {
        switch (level) {
            case 'High': return 'text-red-600 bg-red-50 border-red-200';
            case 'Medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
            case 'Low': return 'text-green-600 bg-green-50 border-green-200';
            default: return 'text-gray-600 bg-gray-50 border-gray-200';
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 text-indigo-600 animate-spin mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-slate-700">Generating Market Validation Report</h2>
                    <p className="text-slate-500 mt-2">Analyzing internal data, market trends, and competitive landscape...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-8">
                <div className="max-w-2xl mx-auto">
                    <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
                        <AlertTriangle className="h-12 w-12 text-red-600 mb-4" />
                        <h2 className="text-xl font-bold text-red-900 mb-2">Validation Failed</h2>
                        <p className="text-red-700 mb-4">{error}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={fetchValidationReport}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Retry
                            </button>
                            {onBack && (
                                <button
                                    onClick={onBack}
                                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
                                >
                                    Go Back
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!report) {
        return null;
    }

    return (
        <ErrorBoundary>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
                <div className="max-w-7xl mx-auto p-6 space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-white rounded-lg transition-colors"
                        >
                            <ArrowLeft className="h-5 w-5 text-slate-600" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">{report.metadata.ideaTitle}</h1>
                            <p className="text-slate-500 text-sm mt-1">
                                Market Validation Report
                                {report.metadata.generatedAt && (
                                    <span className="ml-2">
                                        • Generated {new Date(report.metadata.generatedAt).toLocaleString()}
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`px-4 py-2 rounded-full text-sm font-medium border-2 ${getRiskColor(report.patentRisk.level)}`}>
                            {report.patentRisk.level} IP Risk
                        </span>
                        <button
                            onClick={handleDownloadPDF}
                            disabled={downloading}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                        >
                            {downloading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Download className="h-3.5 w-3.5" />
                            )}
                            Download Report
                        </button>
                        <button
                            onClick={fetchValidationReport}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                            Regenerate
                        </button>
                    </div>
                </div>

                {/* Hero Insights - Compact KPI Strip */}
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-4 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-16 -mt-16"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-white opacity-10 rounded-full -ml-12 -mb-12"></div>

                    <div className="relative z-10 grid grid-cols-3 gap-4">
                        <div>
                            <div className="text-indigo-100 text-xs font-medium mb-1">Novelty Score</div>
                            <div className="text-2xl font-bold">{report.metrics.noveltyScore.toFixed(0)}%</div>
                            <div className="text-indigo-100 text-xs mt-1">{report.metrics.noveltyLabel}</div>
                        </div>

                        <div>
                            <div className="text-indigo-100 text-xs font-medium mb-1">External Sources</div>
                            <div className="text-2xl font-bold">{report.metrics.totalSources}</div>
                            <div className="text-indigo-100 text-xs mt-1">Market signals analyzed</div>
                        </div>

                        <div>
                            <div className="text-indigo-100 text-xs font-medium mb-1">Similar Ideas</div>
                            <div className="text-2xl font-bold">{report.metrics.similarIdeasCount}</div>
                            <div className="text-indigo-100 text-xs mt-1">Internal matches found</div>
                        </div>
                    </div>
                </div>

                {/* Core Analysis - 2 Column Layout */}
                <div className="grid grid-cols-12 gap-6">

                    {/* Left Column - Main Content */}
                    <div className="col-span-8 space-y-6">

                        {/* Internal Summary */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                            <button
                                onClick={() => setExpandedInternalPosition(!expandedInternalPosition)}
                                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 rounded-lg">
                                        <Shield className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div className="text-left">
                                        <h2 className="text-lg font-bold text-slate-900">Internal Idea Position</h2>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {report.metrics.noveltyScore.toFixed(0)}% novelty • {report.similarIdeas.length} similar ideas
                                        </p>
                                    </div>
                                </div>
                                {expandedInternalPosition ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                            </button>
                            
                            {expandedInternalPosition && report.sections.internalPosition.hasData && (
                                <div className="px-6 pb-6 prose prose-sm max-w-none text-slate-700">
                                    {report.sections.internalPosition.summary && (
                                        <p className="whitespace-pre-wrap mb-4 text-sm">{report.sections.internalPosition.summary}</p>
                                    )}

                                    {report.similarIdeas.length > 0 && (
                                        <div className="mt-4">
                                            <h4 className="font-semibold text-slate-900 mb-3 text-sm">Similar Internal Ideas:</h4>
                                            <div className="space-y-2">
                                                {report.similarIdeas.map((idea) => (
                                                    <div key={idea.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <h5 className="font-medium text-slate-900 text-sm truncate">{idea.title}</h5>
                                                                <p className="text-xs text-slate-500 mt-1">{idea.businessGroup}</p>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-16 bg-slate-200 rounded-full h-1.5">
                                                                        <div 
                                                                            className="bg-indigo-600 h-1.5 rounded-full" 
                                                                            style={{ width: `${idea.similarityPct}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className="text-xs font-semibold text-slate-700 w-10 text-right">
                                                                        {idea.similarityPct.toFixed(0)}%
                                                                    </span>
                                                                </div>
                                                                <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded">
                                                                    {idea.band}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {report.similarIdeas.length === 0 && (
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-4">
                                            <p className="text-green-800 text-sm">✓ No similar internal ideas found. This appears to be a novel concept within the organization.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {expandedInternalPosition && !report.sections.internalPosition.hasData && (
                                <div className="px-6 pb-6">
                                    <p className="text-slate-500 text-sm">No data available</p>
                                </div>
                            )}
                        </div>

                        {/* External Market Evidence */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                            <button
                                onClick={() => setExpandedTrends(!expandedTrends)}
                                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-purple-100 rounded-lg">
                                        <TrendingUp className="h-5 w-5 text-purple-600" />
                                    </div>
                                    <div className="text-left">
                                        <h2 className="text-lg font-bold text-slate-900">Market Trends</h2>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {report.sections.marketTrends.evidence.length} trends identified
                                            {report.sections.marketTrends.evidence.length > 0 && (
                                                <span className="ml-2 text-green-600">✓ Evidence-backed</span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                {expandedTrends ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                            </button>
                            
                            {expandedTrends && report.sections.marketTrends.hasData && (
                                <div className="px-6 pb-6">
                                    {report.sections.marketTrends.summary && (
                                        <p className="text-sm text-slate-700 whitespace-pre-wrap mb-4">{report.sections.marketTrends.summary}</p>
                                    )}
                                    
                                    {report.sections.marketTrends.evidence.length > 0 && (
                                        <div className="space-y-2">
                                            {report.sections.marketTrends.evidence.map((trend, idx) => (
                                                <div key={idx} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1">
                                                            <h5 className="font-medium text-slate-900 text-sm">{trend.title}</h5>
                                                            <p className="text-xs text-slate-600 mt-1">{trend.description}</p>
                                                            {trend.source && (
                                                                <a 
                                                                    href={trend.source} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs text-indigo-600 hover:text-indigo-800 mt-1.5 inline-flex items-center gap-1"
                                                                >
                                                                    <ExternalLink className="h-3 w-3" />
                                                                    View Source
                                                                </a>
                                                            )}
                                                        </div>
                                                        {trend.category && (
                                                            <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded whitespace-nowrap">
                                                                {trend.category}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {expandedTrends && !report.sections.marketTrends.hasData && (
                                <div className="px-6 pb-6">
                                    <p className="text-slate-500 text-sm">No market trend data available</p>
                                </div>
                            )}
                        </div>

                        {/* Competitor Landscape */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                            <button
                                onClick={() => setExpandedCompetitors(!expandedCompetitors)}
                                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-orange-100 rounded-lg">
                                        <AlertTriangle className="h-5 w-5 text-orange-600" />
                                    </div>
                                    <div className="text-left">
                                        <h2 className="text-lg font-bold text-slate-900">Competitor Landscape</h2>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {report.sections.competitors.evidence.length} competitors identified
                                            {report.sections.competitors.evidence.length > 0 && (
                                                <span className="ml-2 text-green-600">✓ Evidence-backed</span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                {expandedCompetitors ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                            </button>
                            
                            {expandedCompetitors && report.sections.competitors.hasData && (
                                <div className="px-6 pb-6">
                                    {report.sections.competitors.metadata?.competitiveIntensity && (
                                        <div className="mb-3 inline-block px-2 py-1 bg-orange-50 border border-orange-200 rounded text-xs font-medium text-orange-900">
                                            Competitive Intensity: {report.sections.competitors.metadata.competitiveIntensity}
                                        </div>
                                    )}
                                    
                                    {report.sections.competitors.summary && (
                                        <p className="text-sm text-slate-700 whitespace-pre-wrap mb-4">{report.sections.competitors.summary}</p>
                                    )}
                                    
                                    {report.sections.competitors.evidence.length > 0 && (
                                        <div className="space-y-2">
                                            {report.sections.competitors.evidence.map((competitor, idx) => (
                                                <div key={idx} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                                    <h5 className="font-medium text-slate-900 text-sm">{competitor.title}</h5>
                                                    <p className="text-xs text-slate-600 mt-1">{competitor.description}</p>
                                                    {competitor.source && (
                                                        <a 
                                                            href={competitor.source} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="text-xs text-indigo-600 hover:text-indigo-800 mt-1.5 inline-flex items-center gap-1"
                                                        >
                                                            <ExternalLink className="h-3 w-3" />
                                                            View Source
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {expandedCompetitors && !report.sections.competitors.hasData && (
                                <div className="px-6 pb-6">
                                    <p className="text-slate-500 text-sm">No competitor data available</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column - Highlights */}
                    <div className="col-span-4 space-y-6">

                        {/* Overall Verdict */}
                        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
                            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                                <Lightbulb className="h-5 w-5" />
                                Market Readiness Verdict
                            </h2>
                            <p className="text-indigo-50 leading-relaxed">{report.verdict}</p>
                        </div>

                        {/* Patent Risk */}
                        <div className={`rounded-xl p-6 border-2 shadow-sm ${getRiskColor(report.patentRisk.level)}`}>
                            <h3 className="font-bold mb-2">Patent & IP Risk</h3>
                            <div className="text-3xl font-bold mb-2">{report.patentRisk.level}</div>
                            <div className="text-sm opacity-80 mb-3">
                                Score: {report.patentRisk.score}/100
                            </div>
                            <div className="text-sm opacity-80 mb-3">
                                {report.patentRisk.patentCount} patent{report.patentRisk.patentCount !== 1 ? 's' : ''} found
                            </div>
                            
                            {report.patentRisk.factors && (
                                <div className="mt-3 text-xs opacity-75 space-y-1">
                                    <div>Patent contribution: {report.patentRisk.factors.patentContribution.toFixed(1)}</div>
                                    <div>Similarity contribution: {report.patentRisk.factors.similarityContribution.toFixed(1)}</div>
                                </div>
                            )}
                            
                            {report.patentRisk.disclaimer && (
                                <div className="mt-3 text-xs opacity-75 border-t pt-3">
                                    ⚠️ {report.patentRisk.disclaimer}
                                </div>
                            )}
                        </div>

                        {/* Opportunity Score */}
                        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
                            <h3 className="font-bold text-green-900 mb-2">Opportunity Indicators</h3>
                            <div className="space-y-2 text-sm text-green-800">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                                    <span>Novel internal position</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                                    <span>Market validation analysis</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                                    <span>Competitive landscape mapped</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Deep Insights - 3 Column Grid */}
                <div className="grid grid-cols-3 gap-6">

                    {/* Market Risks */}
                    <div className="bg-white rounded-xl shadow-sm border-l-4 border-red-400">
                        <button
                            onClick={() => setExpandedRisks(!expandedRisks)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                                <h3 className="font-bold text-slate-900 text-sm">Risks & Conflicts</h3>
                            </div>
                            {expandedRisks ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        </button>
                        
                        {expandedRisks && (
                            <div className="px-4 pb-4">
                                {report.sections.risks.hasData ? (
                                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{report.sections.risks.summary}</p>
                                ) : (
                                    <p className="text-slate-500 text-xs">No risk data available</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Patent Details */}
                    <div className="bg-white rounded-xl shadow-sm border-l-4 border-yellow-400">
                        <button
                            onClick={() => setExpandedPatents(!expandedPatents)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-yellow-600" />
                                <h3 className="font-bold text-slate-900 text-sm">Patent & IP Signals</h3>
                            </div>
                            {expandedPatents ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        </button>
                        
                        {expandedPatents && report.sections.patentRisk.hasData && (
                            <div className="px-4 pb-4">
                                {report.sections.patentRisk.summary && (
                                    <p className="text-xs text-slate-700 whitespace-pre-wrap mb-3">{report.sections.patentRisk.summary}</p>
                                )}
                                
                                {report.sections.patentRisk.evidence.length > 0 && (
                                    <div className="space-y-2">
                                        {report.sections.patentRisk.evidence.slice(0, 3).map((patent, idx) => (
                                            <div key={idx} className="bg-yellow-50 p-2 rounded border border-yellow-200">
                                                <h5 className="font-medium text-slate-900 text-xs">{patent.title}</h5>
                                                <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{patent.description}</p>
                                                {patent.source && (
                                                    <a 
                                                        href={patent.source} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-indigo-600 hover:text-indigo-800 mt-1 inline-flex items-center gap-1"
                                                    >
                                                        <ExternalLink className="h-2.5 w-2.5" />
                                                        View
                                                    </a>
                                                )}
                                            </div>
                                        ))}
                                        {report.sections.patentRisk.evidence.length > 3 && (
                                            <p className="text-xs text-slate-500 mt-2">
                                                +{report.sections.patentRisk.evidence.length - 3} more patents
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {expandedPatents && !report.sections.patentRisk.hasData && (
                            <div className="px-4 pb-4">
                                <p className="text-slate-500 text-xs">No patent data available</p>
                            </div>
                        )}
                    </div>

                    {/* Opportunities */}
                    <div className="bg-white rounded-xl shadow-sm border-l-4 border-green-400">
                        <button
                            onClick={() => setExpandedOpportunities(!expandedOpportunities)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <Lightbulb className="h-4 w-4 text-green-600" />
                                <h3 className="font-bold text-slate-900 text-sm">Opportunities & Gaps</h3>
                            </div>
                            {expandedOpportunities ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        </button>
                        
                        {expandedOpportunities && (
                            <div className="px-4 pb-4">
                                {report.sections.opportunities.hasData ? (
                                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{report.sections.opportunities.summary}</p>
                                ) : (
                                    <p className="text-slate-500 text-xs">No opportunity data available</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Evidence Sources - Expandable Footer */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                    <button
                        onClick={() => setExpandedSources(!expandedSources)}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <ExternalLink className="h-5 w-5 text-slate-600" />
                            <span className="font-semibold text-slate-900">Evidence Sources ({report.sources.length})</span>
                        </div>
                        {expandedSources ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                    </button>

                    {expandedSources && (
                        <div className="px-6 pb-6 space-y-2">
                            {report.sources.map((source, idx) => (
                                <a
                                    key={idx}
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <div className="font-medium text-slate-900">{source.title}</div>
                                            <div className="text-xs text-slate-500 mt-1">{source.url}</div>
                                        </div>
                                        <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded">
                                            {source.category}
                                        </span>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </div>

                {/* Disclaimer */}
                <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 text-center">
                    <p className="text-sm text-yellow-800">
                        <strong>Disclaimer:</strong> This report provides AI-assisted market intelligence for informational purposes only.
                        It is not legal advice, financial advice, or a guarantee of market success.
                        Consult appropriate professionals before making strategic decisions.
                    </p>
                </div>
            </div>
        </div>
        </ErrorBoundary>
    );
};

export default MarketValidation;