
import React, { useState, useRef } from 'react';
import { Demand, InputMode } from '../types';
import { Trash2, Plus, FileSpreadsheet, Eraser, Clipboard, Zap, Database } from 'lucide-react';
import * as XLSX from 'xlsx';

interface DemandInputProps {
  demands: Demand[];
  setDemands: React.Dispatch<React.SetStateAction<Demand[]>>;
  inputMode: InputMode;
  setInputMode: (mode: InputMode) => void;
}

export const DemandInput: React.FC<DemandInputProps> = ({ demands, setDemands, inputMode, setInputMode }) => {
  const [newWidth, setNewWidth] = useState('');
  const [newTons, setNewTons] = useState('');
  const tableRef = useRef<HTMLDivElement>(null);

  const RAPID_COIL_CODE = "BOBINA-RAPIDA";

  // Filter demands for display based on mode
  const displayedDemands = demands.filter(d => 
    inputMode === 'simple' 
        ? d.coilCode === RAPID_COIL_CODE 
        : d.coilCode !== RAPID_COIL_CODE
  );

  const addDemand = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newWidth || !newTons) return;
    
    const newItem: Demand = {
      id: Date.now().toString(),
      width: parseFloat(newWidth),
      targetTons: parseFloat(newTons),
      date: new Date().toISOString().split('T')[0],
      coilCode: inputMode === 'multi-coil' ? 'MANUAL' : RAPID_COIL_CODE,
      coilDescription: inputMode === 'multi-coil' ? 'Entrada Manual' : 'Bobina Única'
    };
    
    setDemands([...demands, newItem]);
    setNewWidth('');
    setNewTons('');
  };

  const removeDemand = (id: string) => {
    setDemands(demands.filter(d => d.id !== id));
  };

  const clearCurrentTab = () => {
    const label = inputMode === 'simple' ? 'Rápida' : 'Multi-Bobina';
    if (window.confirm(`¿Estás seguro de que quieres borrar los datos de la pestaña ${label}?`)) {
        // Keep only demands that DO NOT belong to the current mode
        const toKeep = demands.filter(d => 
            inputMode === 'simple' 
                ? d.coilCode !== RAPID_COIL_CODE 
                : d.coilCode === RAPID_COIL_CODE
        );
        setDemands(toKeep);
    }
  };

  const updateDemand = (id: string, field: keyof Demand, value: string | number) => {
    setDemands(demands.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const excelDateToJSDate = (serial: number): string => {
     const utc_days  = Math.floor(serial - 25569);
     const utc_value = utc_days * 86400;                                        
     const date_info = new Date(utc_value * 1000);
     const year = date_info.getFullYear();
     const month = String(date_info.getMonth() + 1).padStart(2, '0');
     const day = String(date_info.getDate() + 1).padStart(2, '0');
     return `${year}-${month}-${day}`;
  }

  // Improved parser favoring DD/MM/YYYY
  const parseTextDate = (dateStr: string): string => {
      dateStr = String(dateStr).trim();
      if (!dateStr) return new Date().toISOString().split('T')[0];

      // Handle Excel Serial Number as string
      if (/^\d{5}$/.test(dateStr)) {
          return excelDateToJSDate(parseInt(dateStr));
      }

      // Handle DD/MM/YYYY or D/M/YYYY
      if (dateStr.includes('/')) {
         const parts = dateStr.split('/');
         if (parts.length === 3) {
             const day = parts[0].padStart(2, '0');
             const month = parts[1].padStart(2, '0');
             const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
             return `${year}-${month}-${day}`;
         }
      }
      
      // Fallback
      const dateObj = new Date(dateStr);
      if (!isNaN(dateObj.getTime())) {
          return dateObj.toISOString().split('T')[0];
      }
      
      return new Date().toISOString().split('T')[0];
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      if (!data) return;

      try {
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, { header: 1 });
        
        const parsedDemands: Demand[] = [];
        
        jsonData.forEach((row, index) => {
           if (row.length < 2) return;

           // Multi-Coil Import (Format: Code | Desc | Date | Width | Demand)
           if (inputMode === 'multi-coil') {
               const code = String(row[0] || '').trim();
               const desc = String(row[1] || '').trim();
               const dateRaw = row[2];
               const width = parseFloat(String(row[3]));
               const demand = parseFloat(String(row[4]));

               if (code && !isNaN(width) && !isNaN(demand)) {
                   let date = new Date().toISOString().split('T')[0];
                   if (typeof dateRaw === 'number') date = excelDateToJSDate(dateRaw);
                   else date = parseTextDate(String(dateRaw));

                   parsedDemands.push({
                       id: `xlsx-mc-${Date.now()}-${index}`,
                       width,
                       targetTons: demand,
                       date,
                       coilCode: code,
                       coilDescription: desc
                   });
               }
           } else {
               // Standard Import (Col A: Width, Col B: Tons)
                const w = parseFloat(String(row[0]));
                const t = parseFloat(String(row[1]));
                // Default date
                const d = new Date().toISOString().split('T')[0];
                
                if (!isNaN(w) && !isNaN(t) && typeof row[0] === 'number') {
                    parsedDemands.push({
                        id: `xlsx-${Date.now()}-${index}`,
                        width: w,
                        targetTons: t,
                        date: d,
                        coilCode: RAPID_COIL_CODE,
                        coilDescription: 'Bobina Única'
                    });
                }
           }
        });

        if (parsedDemands.length > 0) {
          setDemands(prev => [...prev, ...parsedDemands]);
        } else {
          alert("No se encontraron datos válidos.");
        }

      } catch (error) {
        console.error(error);
        alert("Error leyendo archivo Excel.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboardData = e.clipboardData.getData('text');
    if (!clipboardData) return;

    const rows = clipboardData.split(/\r\n|\n|\r/).filter(row => row.trim() !== '');
    const isTabular = rows.length > 1 || rows[0].includes('\t');

    if (!isTabular) return;

    e.preventDefault();

    const newDemands: Demand[] = [];

    rows.forEach((row, idx) => {
      let cols = row.split('\t');
      if (cols.length < 2) cols = row.split(',');

      // MULTI-COIL PASTE: Code | Desc | Date | Width | Demand (5 columns)
      if (inputMode === 'multi-coil') {
          if (cols.length >= 5) {
              const code = cols[0].trim();
              const desc = cols[1].trim();
              const d = parseTextDate(cols[2]);
              const w = parseFloat(cols[3].trim());
              const t = parseFloat(cols[4].trim());

              if (code && !isNaN(w) && !isNaN(t)) {
                  newDemands.push({
                      id: `paste-mc-${Date.now()}-${idx}`,
                      width: w,
                      targetTons: t,
                      date: d,
                      coilCode: code,
                      coilDescription: desc
                  });
              }
          }
      } else {
        // STANDARD PASTE
        if (cols.length >= 2) {
            const w = parseFloat(cols[0].trim());
            const t = parseFloat(cols[1].trim());
            const d = new Date().toISOString().split('T')[0];
            
            if (!isNaN(w) && !isNaN(t)) {
            newDemands.push({
                id: `paste-${Date.now()}-${idx}`,
                width: w,
                targetTons: t,
                date: d,
                coilCode: RAPID_COIL_CODE,
                coilDescription: 'Bobina Única'
            });
            }
        }
      }
    });

    if (newDemands.length > 0) {
      setDemands(prev => [...prev, ...newDemands]);
    }
  };

  return (
    <div 
      ref={tableRef}
      className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full outline-none focus:ring-2 focus:ring-blue-500/50 transition-shadow"
      tabIndex={0}
      onPaste={handlePaste}
    >
      {/* Header & Tabs */}
      <div className="bg-slate-50 border-b border-slate-200">
        <div className="flex">
          <button
            onClick={() => setInputMode('multi-coil')}
            className={`flex-1 py-3 text-xs md:text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              inputMode === 'multi-coil' 
                ? 'bg-white text-orange-600 border-r border-slate-200 shadow-[inset_0_-2px_0_0_#ea580c]' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Database className="w-4 h-4" />
            Multi-Bobina
          </button>
          <button
            onClick={() => setInputMode('simple')}
            className={`flex-1 py-3 text-xs md:text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              inputMode === 'simple' 
                ? 'bg-white text-blue-600 border-l border-slate-200 shadow-[inset_0_-2px_0_0_#2563eb]' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span className="inline">Rápida (Bobina Única)</span>
          </button>
        </div>

        <div className="p-4 flex justify-between items-center flex-wrap gap-2">
            <div className="flex flex-col">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                Tabla de Demanda {inputMode === 'simple' ? '(Bobina Única)' : '(Múltiple)'}
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-normal hidden sm:inline-block">
                    Pegar Activado (Ctrl+V)
                </span>
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                    {inputMode === 'multi-coil' 
                        ? 'Código | Desc | Fecha | Ancho | Ton'
                        : 'Ancho (mm) | Demanda (Ton)'}
                </p>
            </div>
            
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={clearCurrentTab}
                    className="text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded transition-colors flex items-center gap-1 cursor-pointer"
                    title="Borrar datos de la pestaña actual"
                >
                    <Eraser className="w-3 h-3" /> Borrar
                </button>
                <label className="cursor-pointer flex items-center gap-2 text-xs font-medium text-emerald-700 hover:text-emerald-800 transition-colors bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded border border-emerald-200">
                <FileSpreadsheet className="w-4 h-4" />
                Importar
                <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                </label>
            </div>
        </div>
      </div>

      {/* Manual Input Row (Only for simple) */}
      {inputMode === 'simple' && (
      <div className="p-3 bg-white border-b border-slate-200 shadow-[inset_0_2px_4px_rgb(0_0_0/0.05)]">
        <form onSubmit={addDemand} className="flex gap-2 items-center">
          <input
            type="number"
            placeholder="Ancho (mm)"
            className="w-32 border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={newWidth}
            onChange={(e) => setNewWidth(e.target.value)}
          />
          <input
            type="number"
            placeholder="Toneladas"
            className="w-32 border border-slate-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={newTons}
            onChange={(e) => setNewTons(e.target.value)}
          />
          
          <button 
            type="submit"
            className="text-white rounded px-4 py-1.5 flex items-center justify-center shadow-sm bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>
      </div>
      )}

      {/* Spreadsheet-like Grid */}
      <div className="overflow-y-auto flex-1 bg-white relative">
        {displayedDemands.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none p-4 text-center">
                <Clipboard className="w-12 h-12 mb-2 opacity-20" />
                <p className="text-sm font-medium">Pega datos de Excel aquí</p>
                <p className="text-xs opacity-70 mt-1 max-w-xs">
                    {inputMode === 'multi-coil' 
                        ? 'Formato: CODIGO | DESCRIPCION | FECHA | ANCHO | DEMANDA'
                        : 'Formato: ANCHO | DEMANDA'
                    }
                </p>
            </div>
        )}
        
        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              {inputMode === 'multi-coil' && (
                  <>
                    <th className="px-4 py-2 border-b border-r border-slate-200 font-semibold">Código</th>
                    <th className="px-4 py-2 border-b border-r border-slate-200 font-semibold w-64">Descripción</th>
                    <th className="px-4 py-2 border-b border-r border-slate-200 font-semibold">Fecha</th>
                  </>
              )}
              <th className="px-4 py-2 border-b border-r border-slate-200 font-semibold">Ancho (mm)</th>
              <th className="px-4 py-2 border-b border-slate-200 font-semibold">Demanda (Ton)</th>
              <th className="px-2 py-2 border-b border-slate-200 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {displayedDemands.map((demand) => (
              <tr key={demand.id} className="group hover:bg-blue-50/50">
                 {inputMode === 'multi-coil' && (
                    <>
                        <td className="px-4 py-2 border-b border-r border-slate-100 text-xs font-mono">{demand.coilCode}</td>
                        <td className="px-4 py-2 border-b border-r border-slate-100 text-xs truncate max-w-[200px]" title={demand.coilDescription}>{demand.coilDescription}</td>
                        <td className="px-4 py-2 border-b border-r border-slate-100 text-xs">{demand.date}</td>
                    </>
                 )}

                <td className="p-0 border-b border-r border-slate-100 relative">
                  <input 
                    type="number" 
                    className="w-full h-full px-4 py-2 bg-transparent outline-none focus:bg-blue-50 focus:inner-border focus:ring-2 focus:ring-inset focus:ring-blue-500/50 font-mono text-slate-700"
                    value={demand.width}
                    onChange={(e) => updateDemand(demand.id, 'width', parseFloat(e.target.value))}
                  />
                </td>
                <td className="p-0 border-b border-slate-100 relative">
                  <input 
                    type="number" 
                    className="w-full h-full px-4 py-2 bg-transparent outline-none focus:bg-blue-50 focus:inner-border focus:ring-2 focus:ring-inset focus:ring-blue-500/50 font-mono text-slate-700"
                    value={demand.targetTons}
                    onChange={(e) => updateDemand(demand.id, 'targetTons', parseFloat(e.target.value))}
                  />
                </td>
                <td className="p-0 border-b border-slate-100 text-center">
                  <button 
                    onClick={() => removeDemand(demand.id)}
                    type="button"
                    className="text-slate-300 hover:text-red-500 transition-colors p-2 opacity-0 group-hover:opacity-100 focus:opacity-100"
                    tabIndex={-1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
