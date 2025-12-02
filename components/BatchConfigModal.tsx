
import React, { useState, useEffect } from 'react';
import { CoilGroupConfig } from '../types';
import { Check, X, AlertTriangle, Edit2 } from 'lucide-react';

interface BatchConfigModalProps {
  groups: CoilGroupConfig[];
  onConfirm: (widthOverrides: Record<string, number>) => void;
  onCancel: () => void;
}

export const BatchConfigModal: React.FC<BatchConfigModalProps> = ({ groups, onConfirm, onCancel }) => {
  const [widths, setWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    // Initialize state with detected widths
    const initialWidths: Record<string, number> = {};
    groups.forEach(g => {
        initialWidths[g.coilCode] = g.detectedWidth;
    });
    setWidths(initialWidths);
  }, [groups]);

  const handleWidthChange = (code: string, val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num)) {
        setWidths(prev => ({ ...prev, [code]: num }));
    }
  };

  const handleConfirm = () => {
    onConfirm(widths);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Edit2 className="w-5 h-5 text-blue-600" />
                    Confirmar Bobinas
                </h2>
                <p className="text-sm text-slate-500 mt-1">Revisa y ajusta el ancho de bobina madre para cada código antes de optimizar.</p>
            </div>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-6 h-6" />
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
            <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-100 text-slate-600 uppercase text-xs font-semibold">
                    <tr>
                        <th className="px-4 py-3 rounded-tl-lg">Código</th>
                        <th className="px-4 py-3">Descripción</th>
                        <th className="px-4 py-3 text-right">Demanda Total</th>
                        <th className="px-4 py-3 rounded-tr-lg w-48">Ancho Madre (mm)</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {groups.map((group) => (
                        <tr key={group.coilCode} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono font-medium text-slate-700">{group.coilCode}</td>
                            <td className="px-4 py-3 text-slate-600 text-xs">{group.description}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-700">{group.totalDemand.toFixed(1)} T</td>
                            <td className="px-4 py-3">
                                <div className="relative">
                                    <input 
                                        type="number"
                                        className="w-full border border-slate-300 rounded px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-800 text-right"
                                        value={widths[group.coilCode] || ''}
                                        onChange={(e) => handleWidthChange(group.coilCode, e.target.value)}
                                    />
                                    <span className="absolute right-8 top-1.5 text-slate-400 text-xs pointer-events-none">mm</span>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="mt-6 bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                    <p className="font-medium">¿Por qué confirmar anchos?</p>
                    <p className="opacity-80 mt-1">
                        El sistema intenta detectar el ancho automáticamente desde la descripción (ej: "1.75MM X 1200MM" → 1200). 
                        Si la detección falla o la bobina tiene un ancho especial, corrígelo aquí para asegurar una optimización válida.
                    </p>
                </div>
            </div>
        </div>

        <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
            <button 
                onClick={onCancel}
                className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 transition-colors"
            >
                Cancelar
            </button>
            <button 
                onClick={handleConfirm}
                className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 shadow-lg shadow-blue-500/30 flex items-center gap-2 transition-all"
            >
                <Check className="w-4 h-4" /> Confirmar y Calcular
            </button>
        </div>

      </div>
    </div>
  );
};
