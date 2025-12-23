import React, { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, Shield, Lightbulb, AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Loader2, Download } from 'lucide-react';
import { Idea } from '../types';

interface MarketValidationProps {
    ideas: Idea[];
    ideaId: string;
    onBack?: () => void;
}

interface ValidationReport {
    success: boolean;
    ideaId: number;
    idea: {
        id: number;
        title: string;
    };
    fullReport: string;
    internalAnalysis: {
        similarIdeas: Array<{
            id: string;
            title: string;
            similarity: number;
            businessGroup: string;
        }>;
        noveltyScore: number;
    };
    externalEvidence: {
        marketTrends: Array<any>;
        competitors: Array<any>;
        totalSources: number;
    };
    patentSignals: {
        riskLevel: 'Low' | 'Medium' | 'High';
        patents: Array<any>;
    };
    verdict: string;
    sources: Array<{
        title: string;
        url: string;
        category: string;
    }>;
    generatedAt: string;
}

const MarketValidation: React.FC<MarketValidationProps> = ({ ideas, ideaId, onBack }) => {

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [report, setReport] = useState<ValidationReport | null>(null);
    const [expandedSources, setExpandedSources] = useState(false);
    const [downloading, setDownloading] = useState(false);

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
                throw new Error('Failed to fetch validation report');
            }

            const data = await response.json();
            setReport(data);
        } catch (err: any) {
            setError(err.message || 'An error occurred');
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

    const parseSection = (fullReport: string, sectionNumber: number, sectionTitle: string) => {
        const regex = new RegExp(`### ${sectionNumber}\\. ${sectionTitle}\\s+([\\s\\S]+?)(?=###|$)`, 'i');
        const match = fullReport.match(regex);
        return match ? match[1].trim() : 'No data available';
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
                        <p className="text-red-700">{error}</p>
                        <button
                            onClick={onBack}
                            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!report) {
        return null;
    }

    return (
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
                            <h1 className="text-3xl font-bold text-slate-900">{report.idea.title}</h1>
                            <p className="text-slate-500 text-sm mt-1">Market Validation Report</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`px-4 py-2 rounded-full text-sm font-medium border-2 ${getRiskColor(report.patentSignals.riskLevel)}`}>
                            {report.patentSignals.riskLevel} IP Risk
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

                {/* Hero Insights */}
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-8 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full -mr-32 -mt-32"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-white opacity-10 rounded-full -ml-24 -mb-24"></div>

                    <div className="relative z-10 grid grid-cols-3 gap-6">
                        <div>
                            <div className="text-indigo-100 text-sm font-medium mb-2">Novelty Score</div>
                            <div className="text-5xl font-bold">{(report.internalAnalysis.noveltyScore * 100).toFixed(0)}%</div>
                            <div className="text-indigo-100 text-sm mt-2">
                                {report.internalAnalysis.noveltyScore > 0.7 ? 'Highly Novel' :
                                    report.internalAnalysis.noveltyScore > 0.4 ? 'Moderately Novel' : 'Low Novelty'}
                            </div>
                        </div>

                        <div>
                            <div className="text-indigo-100 text-sm font-medium mb-2">External Sources</div>
                            <div className="text-5xl font-bold">{report.sources.length}</div>
                            <div className="text-indigo-100 text-sm mt-2">Market signals analyzed</div>
                        </div>

                        <div>
                            <div className="text-indigo-100 text-sm font-medium mb-2">Similar Ideas</div>
                            <div className="text-5xl font-bold">{report.internalAnalysis.similarIdeas.length}</div>
                            <div className="text-indigo-100 text-sm mt-2">Internal matches found</div>
                        </div>
                    </div>
                </div>

                {/* Core Analysis - 2 Column Layout */}
                <div className="grid grid-cols-12 gap-6">

                    {/* Left Column - Main Content */}
                    <div className="col-span-8 space-y-6">

                        {/* Internal Summary */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-blue-100 rounded-lg">
                                    <Shield className="h-5 w-5 text-blue-600" />
                                </div>
                                <h2 className="text-xl font-bold text-slate-900">Internal Idea Position</h2>
                            </div>
                            <div className="prose prose-sm max-w-none text-slate-700">
                                <div className="mb-4">
                                    <strong>Novelty Assessment:</strong> {(report.internalAnalysis.noveltyScore * 100).toFixed(0)}% novel within organization
                                </div>

                                {report.internalAnalysis.similarIdeas.length > 0 && (
                                    <div>
                                        <strong>Similar Internal Ideas:</strong>
                                        <ul className="mt-2 space-y-2">
                                            {report.internalAnalysis.similarIdeas.map((idea, idx) => (
                                                <li key={idx} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                                                    <span>{idea.title}</span>
                                                    <div className="text-right">
                                                        <div className="text-sm font-semibold text-slate-700">{idea.similarityPct || Math.round((idea.similarity || 0) * 100)}% similar</div>
                                                        <div className="text-xs text-slate-500">{idea.band || 'N/A'}</div>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {report.internalAnalysis.similarIdeas.length === 0 && (
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                        <p className="text-green-800">✓ No similar internal ideas found. This appears to be a novel concept within the organization.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* External Market Evidence */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-purple-100 rounded-lg">
                                    <TrendingUp className="h-5 w-5 text-purple-600" />
                                </div>
                                <h2 className="text-xl font-bold text-slate-900">External Market Evidence</h2>
                            </div>
                            <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                                {parseSection(report.fullReport, 3, 'External Market Evidence')}
                            </div>
                        </div>

                        {/* Competitor Landscape */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-orange-100 rounded-lg">
                                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                                </div>
                                <h2 className="text-xl font-bold text-slate-900">Competitor Landscape</h2>
                            </div>
                            <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                                {parseSection(report.fullReport, 4, 'Competitor Landscape')}
                            </div>
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
                        <div className={`rounded-xl p-6 border-2 shadow-sm ${getRiskColor(report.patentSignals.riskLevel)}`}>
                            <h3 className="font-bold mb-2">Patent & IP Risk</h3>
                            <div className="text-3xl font-bold mb-2">{report.patentSignals.riskLevel}</div>
                            <div className="text-sm opacity-80">
                                {report.patentSignals.patents.length} patent signals found
                            </div>
                            {report.patentSignals.patents.length > 0 && (
                                <div className="mt-3 text-xs opacity-75">
                                    ⚠️ This is not legal advice. Consult IP counsel for definitive assessment.
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
                    <div className="bg-white rounded-xl p-6 shadow-sm border-l-4 border-red-400">
                        <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-600" />
                            Risks & Conflicts
                        </h3>
                        <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap text-sm">
                            {parseSection(report.fullReport, 6, 'Risks & Conflicts')}
                        </div>
                    </div>

                    {/* Patent Details */}
                    <div className="bg-white rounded-xl p-6 shadow-sm border-l-4 border-yellow-400">
                        <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <Shield className="h-5 w-5 text-yellow-600" />
                            Patent & IP Signals
                        </h3>
                        <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap text-sm">
                            {parseSection(report.fullReport, 5, 'Patent & IP Risk Signals')}
                        </div>
                    </div>

                    {/* Opportunities */}
                    <div className="bg-white rounded-xl p-6 shadow-sm border-l-4 border-green-400">
                        <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <Lightbulb className="h-5 w-5 text-green-600" />
                            Opportunities & Gaps
                        </h3>
                        <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap text-sm">
                            {parseSection(report.fullReport, 7, 'Opportunities & Gaps')}
                        </div>
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
    );
};

export default MarketValidation;