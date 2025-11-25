
import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { Idea, Status } from '../types';
import { CHART_COLORS, DOMAIN_COLORS } from '../constants';
import { Users, Lightbulb, Code2, Maximize2, ArrowUpRight } from 'lucide-react';

interface StatsSectionProps {
  data: Idea[];
  onOpenChart: (chartId: string) => void;
}

// Custom Tick Component for long labels (Truncated for compact view)
const CustomYAxisTick = (props: any) => {
  const { x, y, payload } = props;
  const maxLength = 25;
  const text = payload.value;
  const truncated = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

  return (
    <g transform={`translate(${x},${y})`}>
      <text 
        x={0} 
        y={0} 
        dy={4} 
        textAnchor="end" 
        fill="#64748b" 
        fontSize={11}
        fontWeight={500}
      >
        {truncated}
      </text>
    </g>
  );
};

// Custom X Axis Tick for Business Groups to prevent overlap
const CustomXAxisTick = (props: any) => {
  const { x, y, payload } = props;
  const maxLength = 15;
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

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; subtext?: string }> = ({ title, value, icon, subtext }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between h-full transition-transform hover:-translate-y-1 duration-300">
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">{title}</h3>
        <div className="mt-2 text-4xl font-extrabold text-slate-800">{value}</div>
      </div>
      <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
        {icon}
      </div>
    </div>
    {subtext && <div className="text-sm text-slate-500 border-t border-slate-100 pt-3 mt-2">{subtext}</div>}
  </div>
);

const ChartCard: React.FC<{ 
  title: string; 
  chartId: string; 
  onOpen: () => void; 
  children: React.ReactNode;
  className?: string;
}> = ({ title, chartId, onOpen, children, className = "" }) => (
  <div 
    className={`bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col relative group cursor-pointer transition-all hover:shadow-md hover:border-indigo-200 ${className}`}
    onClick={onOpen}
  >
    <div className="flex items-center justify-between mb-4 shrink-0">
      <h3 className="text-lg font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">{title}</h3>
      <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
         <Maximize2 className="h-5 w-5" />
      </button>
    </div>
    <div className="flex-1 min-h-0 relative">
       {children}
       {/* Click hint overlay */}
       <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
          <div className="bg-white/90 px-4 py-2 rounded-full shadow-lg border border-slate-100 text-xs font-medium text-indigo-600 flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform">
             Click to expand <ArrowUpRight className="h-3 w-3" />
          </div>
       </div>
    </div>
  </div>
);

const StatsSection: React.FC<StatsSectionProps> = ({ data, onOpenChart }) => {
  
  // 1. Submissions by Theme (Domain) - Compact Top 8
  const domainData = useMemo(() => {
    const counts = data.reduce((acc, curr) => {
      acc[curr.domain] = (acc[curr.domain] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.keys(counts)
      .map(key => ({
        name: key,
        value: counts[key],
        fill: DOMAIN_COLORS[key] || CHART_COLORS[0]
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8); // COMPACT VIEW
  }, [data]);

  // 2. Submissions by Status (Restored)
  const statusData = useMemo(() => {
    const counts = data.reduce((acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [data]);

  // 3. Submissions by Build Type
  const buildData = useMemo(() => {
    const counts = data.reduce((acc, curr) => {
      acc[curr.buildType] = (acc[curr.buildType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.keys(counts).map(key => ({
      name: key,
      value: counts[key]
    }));
  }, [data]);

  // 4. Submissions by Business Group (was OU)
  const bgData = useMemo(() => {
    const counts = data.reduce((acc, curr) => {
      acc[curr.businessGroup] = (acc[curr.businessGroup] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.keys(counts).map(key => ({
      name: key,
      value: counts[key],
      fill: '#4f46e5'
    })).sort((a, b) => b.value - a.value);
  }, [data]);

  // 5. Top Technologies
  const techData = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach(item => {
      item.technologies.forEach(tech => {
        counts[tech] = (counts[tech] || 0) + 1;
      });
    });
    return Object.keys(counts)
      .map(key => ({ name: key, value: counts[key] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Just top 5 for compact
  }, [data]);

  const uniqueAssociates = new Set(data.map(i => i.associateAccount)).size;

  return (
    <div className="space-y-6 pb-12">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-slate-800">Quick Stats Dashboard</h2>
        <p className="text-slate-500">Real-time overview. Click any chart to view details.</p>
      </div>

      {/* Top Row: Big Number Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard 
          title="Total Submissions" 
          value={data.length.toLocaleString()} 
          icon={<Lightbulb className="h-8 w-8" />} 
          
        />
        <StatCard 
          title="Total Participants" 
          value={uniqueAssociates.toLocaleString()} 
          icon={<Users className="h-8 w-8" />} 
          
        />
      </div>

      {/* Chart Row 1: Themes & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[400px]">
        {/* Submissions by Theme - Compact */}
        <ChartCard 
           title="Top Themes" 
           chartId="theme" 
           onOpen={() => onOpenChart('theme')} 
           className="lg:col-span-2"
        >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={domainData} 
                layout="vertical" 
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={200} 
                  tick={<CustomYAxisTick />}
                  interval={0}
                />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {domainData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
        </ChartCard>

        {/* Submissions by Status - Restored */}
        <ChartCard 
           title="Status Overview" 
           chartId="status" 
           onOpen={() => onOpenChart('status')}
        >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-10">
               <div className="text-center">
                 <span className="block text-xl font-bold text-slate-800">{data.length}</span>
                 <span className="text-[10px] text-slate-500 uppercase">Ideas</span>
               </div>
            </div>
        </ChartCard>
      </div>

      {/* Chart Row 2: Business Group (Full Width) */}
      <div className="h-[400px]">
         <ChartCard 
            title="Submissions by Business Group" 
            chartId="businessGroup" 
            onOpen={() => onOpenChart('businessGroup')}
            className="h-full"
         >
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={bgData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} />
                 <XAxis 
                    dataKey="name" 
                    tick={<CustomXAxisTick />} 
                    interval={0}
                 />
                 <YAxis hide />
                 <Tooltip cursor={{fill: '#f8fafc'}} />
                 <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={50} />
               </BarChart>
             </ResponsiveContainer>
         </ChartCard>
      </div>

      {/* Chart Row 3: Build Type & Top Technologies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[350px]">
         {/* Build Type */}
        <ChartCard 
           title="Build Type" 
           chartId="build" 
           onOpen={() => onOpenChart('build')}
        >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={buildData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                >
                  {buildData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="middle" align="right" layout="vertical" />
              </PieChart>
            </ResponsiveContainer>
        </ChartCard>

        {/* Top Technologies List */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
            <div className="flex items-center justify-between mb-4 shrink-0">
               <h3 className="text-lg font-semibold text-slate-800">Top Technologies</h3>
               <Code2 className="h-5 w-5 text-slate-400" />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 space-y-4">
              {techData.map((tech, index) => (
                <div key={tech.name} className="relative">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700">{index + 1}. {tech.name}</span>
                    <span className="text-slate-500">{tech.value} ideas</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div 
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-500" 
                      style={{ width: `${(tech.value / techData[0].value) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
      </div>

    </div>
  );
};

export default StatsSection;
