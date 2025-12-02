
import React from 'react';
import { SolverConfig, SolverStrategy } from '../types';
import { Settings, Box, Scissors, Scale, AlertCircle, Factory, Split } from 'lucide-react';

interface SidebarProps {
  config: SolverConfig;
  setConfig: React.Dispatch<React.SetStateAction<SolverConfig>>;
  isSolving: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ config, setConfig, isSolving }) => {
  const handleChange = (field: keyof SolverConfig, value: string) => {
    setConfig(prev => ({
      ...prev,
      [field]: parseFloat(value) || 0
    }));
  };

  return (
    <div className="w-full md:w-80 bg-slate-900 text-slate-100 flex-shrink-0 flex flex-col h-screen sticky top-0 overflow-y-auto border-r border-slate-700">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-blue-400">
          <Box className="w-8 h-8" />
          OptiCorte
        </h1>
        <p className="text-slate-400 text-xs mt-2 uppercase tracking-wider">Optimización de Corte Industrial</p>
      </div>

      <div className="p-6 space-y-6 flex-1">
        
        {/* Parent Coil Config */}
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300 uppercase tracking-wide">
            <Settings className="w-4 h-4" /> Bobina Madre (Base)
          </h2>
          
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Ancho Real (mm)</label>
            <input 
              type="number" 
              value={config.parentWidth}
              onChange={(e) => handleChange('parentWidth', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400">Refile / Despunte (mm)</label>
            <div className="flex items-center gap-2">
              <Scissors className="w-4 h-4 text-slate-500" />
              <input 
                type="number" 
                value={config.edgeTrim}
                onChange={(e) => handleChange('edgeTrim', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white"
              />
            </div>
            <p className="text-[10px] text-slate-500">Total ambos lados (ej. 5mm + 5mm = 10)</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400">Peso Bobina (Ton)</label>
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-slate-500" />
              <input 
                type="number" 
                value={config.parentWeight}
                onChange={(e) => handleChange('parentWeight', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white"
              />
            </div>
          </div>
        </section>

        <hr className="border-slate-800" />

        {/* Algorithm Constraints */}
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300 uppercase tracking-wide">
            <AlertCircle className="w-4 h-4" /> Restricciones
          </h2>

          <div className="space-y-1">
            <label className="text-xs text-slate-400">Capacidad Planta (Ton/Día)</label>
            <div className="flex items-center gap-2">
              <Factory className="w-4 h-4 text-emerald-500" />
              <input 
                type="number" 
                value={config.dailyCapacity}
                onChange={(e) => handleChange('dailyCapacity', e.target.value)}
                className="w-full bg-slate-800 border border-emerald-900/50 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-white"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400">Máx. Cortes (Cuchillas)</label>
            <div className="flex items-center gap-2">
              <Split className="w-4 h-4 text-slate-500" />
              <input 
                type="number" 
                value={config.maxCuts}
                onChange={(e) => handleChange('maxCuts', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400">Tolerancia Demanda (+/- %)</label>
            <input 
              type="number" 
              value={config.tolerance}
              onChange={(e) => handleChange('tolerance', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white"
            />
          </div>

          <div className="p-3 bg-slate-800/50 rounded border border-slate-700">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Ancho Útil:</span>
              <span className="font-mono text-blue-300">{config.parentWidth - config.edgeTrim} mm</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Factor Peso:</span>
              <span className="font-mono text-emerald-300">
                {(config.parentWidth > 0 ? config.parentWeight / config.parentWidth : 0).toFixed(4)} T/mm
              </span>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};
