
import React, { useState, useMemo, useEffect } from 'react';
import { OptimizationResult, Demand, SolverConfig, BatchOptimizationResult } from '../types';
import { 
    generateCSV, 
    downloadCSV, 
    generateGlobalDesignExport, 
    generateGlobalMatrixExport,
    exportScheduleToExcel,
    exportScheduleToPDF
} from '../utils/export';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
  ComposedChart, Line, Area, ReferenceLine
} from 'recharts';
import { Download, AlertTriangle, PieChart, Layers, Trash, Calendar, Table as TableIcon, Factory, TrendingUp, LayoutGrid, ArrowLeft, FileText, Grid, FileSpreadsheet, Printer, Filter, XCircle } from 'lucide-react';

interface ResultsProps {
  batchResult: BatchOptimizationResult;
  allDemands: Demand[];
  config: SolverConfig;
}

// Helper: Formatter
const formatDate = (dateStr: string) => {
    if (dateStr === 'Stock / Sobrante') return dateStr;
    try {
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    } catch (e) {
        return dateStr;
    }
};

// Sub-component: Single Result (Details)
const SingleResultView: React.FC<{
    result: OptimizationResult;
    demands: Demand[];
    config: SolverConfig;
    coilCode: string;
    onBack?: () => void;
}> = ({ result, demands, config, coilCode, onBack }) => {
    
  const aggregatedDemands: Record<number, number> = {};
  demands.forEach(d => aggregatedDemands[d.width] = (aggregatedDemands[d.width] || 0) + d.targetTons);

  const chartData = Object.entries(aggregatedDemands).map(([width, target]) => {
    const w = parseFloat(width);
    const produced = result.fulfillment[w] || 0;
    return {
        width: w,
        Objetivo: target,
        Real: produced,
        Estado: produced >= target * (1 - config.tolerance/100) ? 'Cumplido' : 'Fallo'
    };
  });

  // Calculate unique widths for Matrix View
  const uniqueWidths = Array.from(new Set(demands.map(d => d.width))).sort((a,b) => a-b);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {onBack && (
          <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-2">
              <ArrowLeft className="w-4 h-4" /> Volver al Dashboard General
          </button>
      )}

      <div className="flex justify-between items-end border-b border-slate-200 pb-4">
          <div>
              <h2 className="text-2xl font-bold text-slate-800">{coilCode === 'BOBINA-RAPIDA' ? 'Bobina Única (Rápida)' : coilCode}</h2>
              <p className="text-sm text-slate-500">Detalle de optimización de patrones</p>
          </div>
          <div className="text-right">
              <span className={`text-xl font-bold ${result.globalYield >= 95 ? 'text-emerald-600' : 'text-amber-600'}`}>{result.globalYield.toFixed(2)}%</span>
              <p className="text-xs text-slate-400">Rendimiento</p>
          </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><Layers className="w-6 h-6" /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Bobinas</p>
              <h4 className="text-2xl font-bold text-slate-800">{result.totalCoilsUsed}</h4>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${result.globalYield >= 90 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}><PieChart className="w-6 h-6" /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Rendimiento</p>
              <h4 className="text-2xl font-bold text-slate-800">{result.globalYield.toFixed(2)}%</h4>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-100 text-rose-600 rounded-lg"><Trash className="w-6 h-6" /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Desperdicio</p>
              <h4 className="text-2xl font-bold text-slate-800">{result.globalWaste.toFixed(2)}%</h4>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-80 mb-6">
            <h3 className="font-bold text-slate-700 mb-4">Producción vs Objetivo</h3>
            <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="width" tickFormatter={(val) => `${val}mm`} stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} label={{ value: 'Ton', angle: -90, position: 'insideLeft' }}/>
                <Tooltip />
                <Legend wrapperStyle={{paddingTop: '20px'}} />
                <Bar dataKey="Objetivo" fill="#94a3b8" name="Objetivo" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Real" name="Producido" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.Estado === 'Cumplido' ? '#10b981' : '#f59e0b'} />
                ))}
                </Bar>
            </BarChart>
            </ResponsiveContainer>
        </div>

        {/* MATRIX VIEW */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="p-6 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-lg">Matriz de Producción (Diseños x Anchos)</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold">
                        <tr>
                            <th className="px-4 py-3 border-r border-slate-200">Patrón</th>
                            <th className="px-4 py-3 border-r border-slate-200 text-center">Bobinas</th>
                            {uniqueWidths.map(w => (
                                <th key={w} className="px-4 py-3 text-right bg-blue-50/50 border-r border-slate-200">{w}mm</th>
                            ))}
                            <th className="px-4 py-3 text-right bg-slate-100">Total T</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {result.patterns.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-50">
                                <td className="px-4 py-2 border-r border-slate-100 font-medium">ID-{p.id}</td>
                                <td className="px-4 py-2 border-r border-slate-100 text-center font-bold">{p.assignedCoils}</td>
                                {uniqueWidths.map(w => {
                                    const cut = p.cuts.find(c => c.width === w);
                                    const tons = cut ? (p.assignedCoils * cut.count * cut.weightPerCut).toFixed(2) : '-';
                                    return (
                                        <td key={w} className="px-4 py-2 text-right border-r border-slate-100 text-slate-600">
                                            {tons}
                                        </td>
                                    );
                                })}
                                <td className="px-4 py-2 text-right font-bold bg-slate-50">
                                    {p.totalProductionWeight.toFixed(2)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-lg">Detalle de Patrones</h3>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-medium text-xs border-b border-slate-200">
                <tr>
                    <th className="px-6 py-3">Patrón #</th>
                    <th className="px-6 py-3 text-center">Bobinas</th>
                    <th className="px-6 py-3">Cortes</th>
                    <th className="px-6 py-3 text-right">Rend.</th>
                    <th className="px-6 py-3 text-right">Salida (Ton)</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                {result.patterns.map((pattern) => (
                    <tr key={pattern.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium"><span className="bg-blue-100 text-blue-700 py-1 px-2 rounded">ID-{pattern.id}</span></td>
                    <td className="px-6 py-4 text-center font-bold">{pattern.assignedCoils}</td>
                    <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                        {pattern.cuts.map((cut, idx) => (
                            <div key={idx} className="bg-white border border-slate-200 px-2 py-1 rounded shadow-sm text-xs">
                                <b>{cut.width}mm</b> x{cut.count}
                            </div>
                        ))}
                        </div>
                    </td>
                    <td className="px-6 py-4 text-right">{pattern.yieldPercentage.toFixed(2)}%</td>
                    <td className="px-6 py-4 text-right">{pattern.totalProductionWeight.toFixed(2)}</td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        </div>
    </div>
  );
};

// Main Component
export const Results: React.FC<ResultsProps> = ({ batchResult, allDemands, config }) => {
  const [selectedCoil, setSelectedCoil] = useState<string | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'kpi' | 'schedule' | 'stock'>('kpi');
  
  // Filter States
  const [targetYieldFilter, setTargetYieldFilter] = useState<number>(98.9);
  const [isFilterActive, setIsFilterActive] = useState<boolean>(false);

  // Auto-select if single result (Rapid Mode)
  useEffect(() => {
      if (batchResult.summary.length === 1 && !selectedCoil) {
          setSelectedCoil(batchResult.summary[0].coilCode);
      }
  }, [batchResult, selectedCoil]);

  // Derived filtered summary
  const filteredSummaries = useMemo(() => {
      if (!isFilterActive) return batchResult.summary;
      return batchResult.summary.filter(s => s.yield < targetYieldFilter);
  }, [batchResult.summary, isFilterActive, targetYieldFilter]);

  // Calculate Global Stock
  const globalStockData = useMemo(() => {
    // 1. Get all dates involved
    const dateSet = new Set<string>();
    allDemands.forEach(d => dateSet.add(d.date));
    batchResult.globalCapacitySchedule.forEach(d => dateSet.add(d.date));
    const dates = Array.from(dateSet).sort();

    let cumulativeProduction = 0;
    let cumulativeDemand = 0;

    return dates.map(date => {
        // Demand for this date (across all coils/widths)
        const dailyDemand = allDemands
            .filter(d => d.date === date)
            .reduce((sum, d) => sum + d.targetTons, 0);

        // Production for this date (from global schedule)
        const dayPlan = batchResult.globalCapacitySchedule.find(p => p.date === date);
        const dailyProduction = dayPlan ? dayPlan.totalTons : 0;

        cumulativeDemand += dailyDemand;
        cumulativeProduction += dailyProduction;

        return {
            date,
            formattedDate: formatDate(date),
            produccion: dailyProduction,
            consumo: dailyDemand,
            acumProduccion: cumulativeProduction,
            acumDemanda: cumulativeDemand,
            stock: cumulativeProduction - cumulativeDemand
        };
    });
  }, [allDemands, batchResult.globalCapacitySchedule]);

  const exportGlobalDesigns = () => {
    const csv = generateGlobalDesignExport(batchResult);
    downloadCSV(csv, `Diseños_Globales_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const exportGlobalMatrix = () => {
    const csv = generateGlobalMatrixExport(batchResult, allDemands);
    downloadCSV(csv, `Matriz_Global_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const handleExportScheduleExcel = () => {
      exportScheduleToExcel(batchResult.globalCapacitySchedule);
  };

  const handleExportSchedulePDF = () => {
      exportScheduleToPDF(batchResult.globalCapacitySchedule);
  };

  // Drill Down View (or Single Coil Rapid View)
  if (selectedCoil && batchResult.results[selectedCoil]) {
      const demandsForCoil = allDemands.filter(d => (d.coilCode || 'DEFAULT') === selectedCoil);
      const summary = batchResult.summary.find(s => s.coilCode === selectedCoil);
      const viewConfig = summary ? { ...config, parentWidth: summary.parentWidth } : config;

      return (
          <SingleResultView 
              result={batchResult.results[selectedCoil]} 
              demands={demandsForCoil} 
              config={viewConfig} 
              coilCode={selectedCoil}
              // Only show Back button if there is more than 1 coil
              onBack={batchResult.summary.length > 1 ? () => setSelectedCoil(null) : undefined}
          />
      );
  }

  // Dashboard General
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
             <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <LayoutGrid className="w-6 h-6 text-blue-600" />
                    Dashboard Global
                </h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                    <span>{batchResult.summary.length} grupos de bobinas</span>
                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                    <span className="font-semibold text-emerald-600">{batchResult.totalGlobalYield.toFixed(2)}% Rendimiento Promedio</span>
                </div>
             </div>

             <div className="flex gap-2">
                 <button 
                    onClick={exportGlobalDesigns}
                    className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                 >
                     <FileText className="w-4 h-4 text-blue-500" />
                     Exp. Diseños
                 </button>
                 <button 
                    onClick={exportGlobalMatrix}
                    className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                 >
                     <Grid className="w-4 h-4 text-emerald-500" />
                     Exp. Matriz
                 </button>
             </div>
        </div>

        {/* Dashboard Tabs */}
        <div className="flex border-b border-slate-200">
            <button 
                onClick={() => setDashboardTab('kpi')}
                className={`px-6 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${dashboardTab === 'kpi' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
                <LayoutGrid className="w-4 h-4" /> Resumen & Bobinas
            </button>
            <button 
                onClick={() => setDashboardTab('schedule')}
                className={`px-6 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${dashboardTab === 'schedule' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
                <Calendar className="w-4 h-4" /> Programa de corte de flejes
            </button>
            <button 
                onClick={() => setDashboardTab('stock')}
                className={`px-6 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${dashboardTab === 'stock' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
                <TrendingUp className="w-4 h-4" /> Stock Global
            </button>
        </div>

        <div className="pt-4">
            {/* TAB: KPI & COIL LIST */}
            {dashboardTab === 'kpi' && (
                <>
                {/* FILTER BAR */}
                <div className="flex items-center gap-4 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200 w-fit">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-600">Obj. Rendimiento (%):</span>
                        <input 
                            type="number" 
                            step="0.1"
                            value={targetYieldFilter}
                            onChange={(e) => setTargetYieldFilter(parseFloat(e.target.value) || 0)}
                            className="w-20 border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <button 
                        onClick={() => setIsFilterActive(!isFilterActive)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            isFilterActive 
                                ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                        }`}
                    >
                        {isFilterActive ? (
                            <><XCircle className="w-4 h-4" /> Filtrando Bajos</>
                        ) : (
                            <><Filter className="w-4 h-4" /> Filtrar {"<"} {targetYieldFilter}%</>
                        )}
                    </button>
                    {isFilterActive && (
                        <span className="text-xs text-amber-600 font-medium">
                            Mostrando {filteredSummaries.length} de {batchResult.summary.length}
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredSummaries.map((coil) => (
                        <div key={coil.coilCode} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow animate-in zoom-in-95 duration-300">
                            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800">{coil.coilCode}</h3>
                                    <p className="text-xs text-slate-500 line-clamp-1" title={coil.description}>{coil.description}</p>
                                </div>
                                <span className="text-xs font-mono bg-white border border-slate-200 px-2 py-1 rounded text-slate-600">
                                    {coil.parentWidth} mm
                                </span>
                            </div>
                            <div className="p-4 space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500">Entrada Total</span>
                                    <span className="font-bold text-slate-800">{coil.totalInputTons.toFixed(1)} T</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500">Salida Total</span>
                                    <span className="font-bold text-emerald-700">{coil.totalOutputTons.toFixed(1)} T</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden flex">
                                    <div className={`h-2.5 ${coil.yield < targetYieldFilter ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${coil.yield}%` }}></div>
                                    <div className="bg-rose-400 h-2.5" style={{ width: `${coil.waste}%` }}></div>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className={`font-bold ${coil.yield < targetYieldFilter ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        {coil.yield.toFixed(2)}% Eficiencia
                                    </span>
                                    <span className="text-rose-500">{coil.waste.toFixed(2)}% Merma</span>
                                </div>
                                <button 
                                    onClick={() => setSelectedCoil(coil.coilCode)}
                                    className="w-full mt-2 bg-blue-50 text-blue-600 hover:bg-blue-100 py-2 rounded-lg text-sm font-medium transition-colors"
                                >
                                    Ver Patrones Detallados
                                </button>
                            </div>
                        </div>
                    ))}
                    {filteredSummaries.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                            <p>No se encontraron bobinas bajo el criterio de rendimiento.</p>
                        </div>
                    )}
                </div>
                </>
            )}

            {/* TAB: GLOBAL SCHEDULE */}
            {dashboardTab === 'schedule' && (
                <div className="space-y-6">
                    <div className="flex justify-end gap-2 mb-2">
                        <button 
                            onClick={handleExportScheduleExcel}
                            className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                        >
                            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
                        </button>
                        <button 
                            onClick={handleExportSchedulePDF}
                            className="flex items-center gap-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 px-3 py-1.5 rounded text-sm font-medium transition-colors"
                        >
                            <Printer className="w-4 h-4" /> Exportar PDF
                        </button>
                    </div>

                    {batchResult.globalCapacitySchedule.map((day, idx) => (
                        <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <Calendar className="w-5 h-5 text-indigo-500" />
                                    <h3 className="font-bold text-slate-800 uppercase">{formatDate(day.date)}</h3>
                                </div>
                                <div className="flex items-center gap-4">
                                    {/* Daily Yield Badge */}
                                    <span className={`text-xs font-semibold px-2 py-1 rounded border ${day.dailyYield > 98 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                        Rendimiento Día: {day.dailyYield.toFixed(2)}%
                                    </span>

                                    <span className="text-sm font-medium text-slate-500">
                                        Total: <span className="text-slate-900 font-bold">{day.totalTons.toFixed(1)} Ton</span>
                                    </span>
                                </div>
                            </div>
                            <div className="p-6">
                                <div className="space-y-2">
                                    <div className="grid grid-cols-12 gap-2 mb-2 text-xs font-semibold text-slate-500 uppercase">
                                        <div className="col-span-4 md:col-span-3">Bobina</div>
                                        <div className="col-span-2 md:col-span-1">Cant.</div>
                                        <div className="col-span-4 md:col-span-5">Cortes</div>
                                        <div className="col-span-2 md:col-span-1 text-right">Rend %</div>
                                        <div className="col-span-12 md:col-span-2 text-right">Peso</div>
                                    </div>
                                    
                                    {day.patterns.map((sp, pIdx) => (
                                        <div key={pIdx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                                            <div className="col-span-4 md:col-span-3 flex flex-col justify-center">
                                                <div className="bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded text-xs w-fit mb-1">{sp.coilCode}</div>
                                                <div className="text-[10px] text-slate-500 leading-tight line-clamp-2" title={sp.coilDescription}>
                                                    {sp.coilDescription || '-'}
                                                </div>
                                            </div>
                                            <div className="col-span-2 md:col-span-1 text-sm font-bold text-slate-700">{sp.coils}</div>
                                            <div className="col-span-4 md:col-span-5 flex flex-wrap gap-1">
                                                {sp.pattern.cuts.map((c, i) => (
                                                    <span key={i} className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                                                        {c.width}mm (x{c.count})
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="col-span-2 md:col-span-1 text-right text-sm font-bold">
                                                <span className={`${sp.pattern.yieldPercentage > 98 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                                    {sp.pattern.yieldPercentage.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="col-span-12 md:col-span-2 text-right text-sm text-slate-500 font-mono">
                                                {sp.pattern.totalProductionWeight.toFixed(1)} T
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                    {batchResult.globalCapacitySchedule.length === 0 && (
                        <div className="text-center py-12 text-slate-400">No hay producción programada.</div>
                    )}
                </div>
            )}

            {/* TAB: GLOBAL STOCK CHART */}
            {dashboardTab === 'stock' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-indigo-600" />
                                Evolución de Stock Global (Tonelaje Total)
                            </h3>
                            <p className="text-sm text-slate-500">Balance neto de toda la planta (Producción acumulada vs Demanda acumulada)</p>
                        </div>
                    </div>
                    <div className="h-96 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={globalStockData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="formattedDate" stroke="#64748b" fontSize={12} />
                                <YAxis stroke="#64748b" fontSize={12} label={{ value: 'Ton', angle: -90, position: 'insideLeft' }} />
                                <Tooltip 
                                    labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend />
                                <ReferenceLine y={0} stroke="#000" strokeOpacity={0.2} />
                                <Area type="monotone" dataKey="stock" name="Stock Neto" fill="#818cf8" fillOpacity={0.2} stroke="#4f46e5" strokeWidth={2} />
                                <Line type="step" dataKey="acumProduccion" name="Producción Acumulada" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                                <Line type="step" dataKey="acumDemanda" name="Demanda Acumulada" stroke="#f43f5e" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
