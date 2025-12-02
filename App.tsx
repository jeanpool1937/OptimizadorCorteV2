
import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DemandInput } from './components/DemandInput';
import { Results } from './components/Results';
import { BatchConfigModal } from './components/BatchConfigModal';
import { 
  Demand, 
  SolverConfig, 
  BatchOptimizationResult, 
  INITIAL_DEMANDS, 
  INITIAL_CONFIG,
  CoilGroupConfig,
  InputMode
} from './types';
import { solveBatchCuttingStock, prepareCoilGroups } from './utils/solver';
import { Calculator } from 'lucide-react';

const App: React.FC = () => {
  const [config, setConfig] = useState<SolverConfig>(INITIAL_CONFIG);
  const [demands, setDemands] = useState<Demand[]>(INITIAL_DEMANDS);
  
  // Independent Result States
  const [multiCoilResult, setMultiCoilResult] = useState<BatchOptimizationResult | null>(null);
  const [singleCoilResult, setSingleCoilResult] = useState<BatchOptimizationResult | null>(null);

  const [isSolving, setIsSolving] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  // UI State
  const [inputMode, setInputMode] = useState<InputMode>('multi-coil');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [coilGroups, setCoilGroups] = useState<CoilGroupConfig[]>([]);

  // Constants
  const RAPID_COIL_CODE = "BOBINA-RAPIDA";

  // Determine which result to show based on active tab
  const activeResult = inputMode === 'simple' ? singleCoilResult : multiCoilResult;

  const handleInitiateSolve = () => {
    // Filter demands based on active mode
    const activeDemands = demands.filter(d => 
        inputMode === 'simple' 
            ? d.coilCode === RAPID_COIL_CODE 
            : d.coilCode !== RAPID_COIL_CODE
    );

    if (activeDemands.length === 0) {
        alert(`No hay demanda cargada en la pestaña ${inputMode === 'simple' ? 'Rápida' : 'Multi-Bobina'}.`);
        return;
    }

    if (inputMode === 'simple') {
        // RAPID MODE: Skip Modal, Solve Independently
        setIsSolving(true);
        setLoadingMessage("Optimizando bobina única...");
        
        // Force specific code for simple mode demands just in case
        const safeDemands = activeDemands.map(d => ({ ...d, coilCode: RAPID_COIL_CODE }));

        // Create a single group override using Sidebar width
        const widthOverrides = { [RAPID_COIL_CODE]: config.parentWidth };

        setTimeout(() => {
            try {
                const solution = solveBatchCuttingStock(safeDemands, config, widthOverrides);
                setSingleCoilResult(solution);
            } catch (error) {
                console.error("Error en solver:", error);
                alert("Ocurrió un error durante el cálculo.");
            } finally {
                setIsSolving(false);
            }
        }, 100);

    } else {
        // MULTI-COIL MODE: Analyze groups and open modal
        const groups = prepareCoilGroups(activeDemands);
        setCoilGroups(groups);
        setShowBatchModal(true);
    }
  };

  const handleConfirmBatch = (widthOverrides: Record<string, number>) => {
    setShowBatchModal(false);
    setIsSolving(true);
    setLoadingMessage("Optimizando múltiples grupos y generando programa de corte...");

    // Filter demands for multi-coil
    const activeDemands = demands.filter(d => d.coilCode !== RAPID_COIL_CODE);

    setTimeout(() => {
      try {
        const solution = solveBatchCuttingStock(activeDemands, config, widthOverrides);
        setMultiCoilResult(solution);
      } catch (error) {
        console.error("Error en solver:", error);
        alert("Ocurrió un error durante el cálculo.");
      } finally {
        setIsSolving(false);
      }
    }, 100);
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      {/* Sidebar for Configuration */}
      <Sidebar 
        config={config} 
        setConfig={setConfig} 
        isSolving={isSolving} 
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Top Header with Calculate Button */}
        <header className="bg-white border-b border-slate-200 p-4 flex justify-between items-center shadow-sm z-10">
          <h1 className="font-bold text-lg md:text-xl text-slate-800">Planificación de Corte</h1>
          
          <button
            onClick={handleInitiateSolve}
            disabled={isSolving}
            className={`py-2 px-6 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md ${
                inputMode === 'simple' 
                ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-blue-900/10 text-white'
                : 'bg-orange-600 hover:bg-orange-500 active:bg-orange-700 shadow-orange-900/10 text-white'
            }`}
          >
            {isSolving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <Calculator className="w-5 h-5" />
            )}
            {inputMode === 'simple' ? 'Calcular Bobina Única' : 'Calcular Programa'}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
          
          {/* Input Section */}
          <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-4 h-96">
               <DemandInput 
                 demands={demands} 
                 setDemands={setDemands} 
                 inputMode={inputMode}
                 setInputMode={setInputMode}
               />
            </div>
          </section>

          {/* Results Section (Shows result corresponding to active Tab) */}
          <section>
            {isSolving && (
               <div className="w-full h-64 flex flex-col items-center justify-center text-blue-600">
                  <span className="font-medium animate-pulse text-center text-lg mb-2">
                    {loadingMessage}
                  </span>
                  <div className="w-64 h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 animate-progress"></div>
                  </div>
               </div>
            )}

            {!isSolving && activeResult && (
              <Results batchResult={activeResult} allDemands={demands} config={config} />
            )}

            {!isSolving && !activeResult && (
              <div className="flex flex-col items-center justify-center h-64 bg-white border border-dashed border-slate-300 rounded-xl text-slate-400">
                <p>Carga la demanda en <b>{inputMode === 'simple' ? 'Rápida' : 'Multi-Bobina'}</b> y presiona "Calcular" arriba.</p>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Modal - Only triggered for Multi-Coil logic */}
      {showBatchModal && (
        <BatchConfigModal 
            groups={coilGroups} 
            onConfirm={handleConfirmBatch} 
            onCancel={() => setShowBatchModal(false)} 
        />
      )}

    </div>
  );
};

export default App;
