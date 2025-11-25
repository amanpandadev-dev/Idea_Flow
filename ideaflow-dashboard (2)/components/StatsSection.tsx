import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Idea, Domain, Status } from '../types';
import { CHART_COLORS, DOMAIN_COLORS } from '../constants';
import { ArrowLeft, Download } from 'lucide-react';

interface ChartDetailProps {
  chartId: string;
  data: Idea[];
  onBack: () => void;
}

const CustomYAxisTick = (props: any) => {
  const { x, y, payload } = props;
  const maxLength = 40;
  const text = payload.value;
  const truncated = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={4} textAnchor="end" fill="#64748b" fontSize={11} fontWeight={500}>
        {truncated}
        <title>{text}</title>
      </text>
    </g>
  );
};

// Custom X Axis Tick for Business Groups to prevent overlap
const CustomXAxisTick = (props: any) => {
  const { x, y, payload } = props;
  const maxLength = 20;
  const text = payload.value;
  const truncated = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

  return (
    <g transform={`translate(${x},${y})`}>
      <text 
        x={0} 
        y={0} 
        dy={16} 
        textAnchor="middle" 
        fill="#64748b" 
        fontSize={11}
        fontWeight={500}
      >
        {truncated}
        <title>{text}</title>
      </text>
    </g>
  );
};

const ChartDetail: React.FC<ChartDetailProps> = ({ chartId, data, onBack }) => {
  
  // --- Data Processing ---

  const domainData = useMemo(() => {
    const counts = data.reduce((acc, curr) => {
      acc[curr.domain] = (acc[curr.domain] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.keys(counts)
      .map(key => ({ name: key, value: counts[key], fill: DOMAIN_COLORS[key] || '#ccc' }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const statusData = useMemo(() => {
     const counts = data.reduce((acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [data]);

  const buildData = useMemo(() => {
    const counts = data.reduce((acc, curr) => {
      acc[curr.buildType] = (acc[curr.buildType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [data]);

  const bgData = useMemo(() => {
    const counts = data.reduce((acc, curr) => {
      acc[curr.businessGroup] = (acc[curr.businessGroup] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.keys(counts).map(key => ({ name: key, value: counts[key], fill: '#6366f1' })).sort((a, b) => b.value - a.value);
  }, [data]);

  // Status by Theme (Stacked Bar) for detailed Status view
  const statusByThemeData = useMemo(() => {
    const map: Record<string, any> = {};
    // Initialize for all domains
    Object.values(Domain).forEach(d => {
        map[d] = { name: d, total: 0 };
        Object.values(Status).forEach(s => map[d][s] = 0);
    });
    
    data.forEach(idea => {
        if(map[idea.domain]) {
            map[idea.domain][idea.status]++;
            map[idea.domain].total++;
        }
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [data]);

  // --- Render Logic ---

  const getChartTitle = () => {
    switch(chartId) {
        case 'theme': return 'Submissions by Theme';
        case 'status': return 'Idea Status Distribution & Theme Breakdown';
        case 'build': return 'Submissions by Build Type';
        case 'businessGroup': return 'Submissions by Business Group';
        default: return 'Chart Details';
    }
  };

  const renderContent = () => {
    switch (chartId) {
      case 'theme':
        return (
            <div className="h-full w-full overflow-y-auto custom-scrollbar pr-4 bg-white rounded-xl border border-slate-200 p-6">
                <div style={{ height: `${Math.max(800, domainData.length * 50)}px` }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={domainData} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={320} tick={<CustomYAxisTick />} interval={0} />
                      <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={28}>
                        {domainData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
            </div>
        );
      case 'status':
        return (
            <div className="flex flex-col lg:flex-row gap-6 h-full">
                {/* Overall Pie */}
                <div className="lg:w-1/3 bg-white rounded-xl border border-slate-200 p-6 flex flex-col">
                    <h3 className="text-lg font-semibold text-slate-700 mb-4 text-center">Global Status</h3>
                    <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie 
                                data={statusData} 
                                cx="50%" 
                                cy="50%" 
                                innerRadius={60}
                                outerRadius={100} 
                                label 
                                paddingAngle={2}
                                dataKey="value"
                            >
                            {statusData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={80} />
                        </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                
                {/* Stacked Bar by Theme */}
                <div className="lg:w-2/3 bg-white rounded-xl border border-slate-200 p-6 flex flex-col overflow-hidden">
                     <h3 className="text-lg font-semibold text-slate-700 mb-4">Status Breakdown by Theme</h3>
                     <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                         <div style={{ height: `${Math.max(800, statusByThemeData.length * 60)}px` }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={statusByThemeData} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" />
                                    <YAxis dataKey="name" type="category" width={280} tick={<CustomYAxisTick />} interval={0} />
                                    <Tooltip />
                                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                    {Object.values(Status).map((s, i) => (
                                        <Bar key={s} dataKey={s} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                         </div>
                     </div>
                </div>
            </div>
        );
      case 'build':
        return (
            <div className="bg-white rounded-xl border border-slate-200 p-6 h-full flex flex-col items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={buildData}
                      cx="50%"
                      cy="50%"
                      label
                      innerRadius={80}
                      outerRadius={160}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {buildData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" />
                  </PieChart>
                </ResponsiveContainer>
            </div>
        );
      case 'businessGroup':
         return (
            <div className="bg-white rounded-xl border border-slate-200 p-6 h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bgData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                       dataKey="name" 
                       angle={-15} 
                       textAnchor="end" 
                       interval={0}
                       tick={<CustomXAxisTick />}
                    />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={60}>
                       {bgData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                       ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
            </div>
         );
      default: return <div className="flex items-center justify-center h-full text-slate-400">Chart not available</div>;
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 h-[calc(100vh-140px)]">
      <div className="flex items-center justify-between">
         <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <h1 className="text-2xl font-bold text-slate-800">{getChartTitle()}</h1>
         </div>
         <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
            <Download className="h-4 w-4" />
            Export Data
         </button>
      </div>

      <div className="h-full pb-10">
        {renderContent()}
      </div>
    </div>
  );
};

export default ChartDetail;