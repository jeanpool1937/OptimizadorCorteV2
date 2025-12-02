
import { OptimizationResult, Demand, BatchOptimizationResult, DailyPlan } from "../types";
import * as XLSX from 'xlsx';
// @ts-ignore
import { jsPDF } from "jspdf";
// @ts-ignore
import autoTable from "jspdf-autotable";

export const generateCSV = (result: OptimizationResult, demands: Demand[]): string => {
  // 1. Header Row
  const uniqueWidths = Array.from(new Set(demands.map(d => d.width))).sort((a, b) => a - b);
  
  const header = [
    "ID Patrón",
    "Cant. Bobinas",
    "Rendimiento (%)",
    "Merma (%)",
    ...uniqueWidths.map(w => `Ancho ${w}mm (Ton)`),
    "Total Ton Salida"
  ];

  const rows = result.patterns.map(pattern => {
    const widthTonnages = uniqueWidths.map(w => {
      const cut = pattern.cuts.find(c => c.width === w);
      if (!cut) return "0.00";
      return (pattern.assignedCoils * cut.count * cut.weightPerCut).toFixed(2);
    });

    const totalPatternOutput = pattern.cuts.reduce((sum, cut) => 
      sum + (pattern.assignedCoils * cut.count * cut.weightPerCut), 0
    );

    return [
      pattern.id,
      pattern.assignedCoils,
      pattern.yieldPercentage.toFixed(2),
      (100 - pattern.yieldPercentage).toFixed(2),
      ...widthTonnages,
      totalPatternOutput.toFixed(2)
    ];
  });

  const csvContent = [
    header.join(","),
    ...rows.map(r => r.join(","))
  ].join("\n");

  return csvContent;
};

export const downloadCSV = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

/**
 * Generate a flat list of all designs/patterns across all coils
 */
export const generateGlobalDesignExport = (batchResult: BatchOptimizationResult): string => {
    const header = [
        "Codigo Bobina",
        "Descripcion",
        "Ancho Madre",
        "ID Patron",
        "Cant. Bobinas",
        "Configuracion Cortes",
        "Rendimiento %",
        "Merma %",
        "Total Toneladas"
    ];

    const rows: string[] = [];

    batchResult.summary.forEach(summary => {
        const result = batchResult.results[summary.coilCode];
        if(!result) return;

        result.patterns.forEach(pat => {
            const cutsDesc = pat.cuts.map(c => `${c.count}x${c.width}`).join(" + ");
            
            rows.push([
                summary.coilCode,
                `"${summary.description}"`, // Quote description to handle commas
                summary.parentWidth,
                pat.id,
                pat.assignedCoils,
                `"${cutsDesc}"`,
                pat.yieldPercentage.toFixed(2),
                (100 - pat.yieldPercentage).toFixed(2),
                pat.totalProductionWeight.toFixed(2)
            ].join(","));
        });
    });

    return [header.join(","), ...rows].join("\n");
};

/**
 * Generate a Matrix (Pivot Table style): Rows = (Coil + Pattern), Cols = All Unique Widths
 */
export const generateGlobalMatrixExport = (batchResult: BatchOptimizationResult, allDemands: Demand[]): string => {
    // 1. Find all unique widths requested globally
    const uniqueWidths = Array.from(new Set(allDemands.map(d => d.width))).sort((a, b) => a - b);

    // 2. Build Header
    const header = [
        "Codigo Bobina",
        "ID Patron",
        "Cant. Bobinas",
        "Rendimiento %",
        ...uniqueWidths.map(w => `Ancho ${w}mm`),
        "Total Ton Salida"
    ];

    const rows: string[] = [];

    batchResult.summary.forEach(summary => {
        const result = batchResult.results[summary.coilCode];
        if(!result) return;

        result.patterns.forEach(pat => {
            // Map tonnage per width
            const widthCols = uniqueWidths.map(w => {
                const cut = pat.cuts.find(c => c.width === w);
                if (!cut) return "0.00";
                return (pat.assignedCoils * cut.count * cut.weightPerCut).toFixed(2);
            });

            rows.push([
                summary.coilCode,
                pat.id,
                pat.assignedCoils,
                pat.yieldPercentage.toFixed(2),
                ...widthCols,
                pat.totalProductionWeight.toFixed(2)
            ].join(","));
        });
    });

    return [header.join(","), ...rows].join("\n");
};

/**
 * Exports the Global Schedule to a real .xlsx file
 */
export const exportScheduleToExcel = (schedule: DailyPlan[]) => {
    const rows: any[] = [];

    schedule.forEach(day => {
        day.patterns.forEach(sp => {
            const cutsDesc = sp.pattern.cuts.map(c => `${c.count}x${c.width}mm`).join(" + ");
            rows.push({
                "Fecha": day.date,
                "Código Bobina": sp.coilCode,
                "Descripción Bobina": sp.coilDescription || '',
                "Cant. Bobinas": sp.coils,
                "Patrón Cortes": cutsDesc,
                "Rendimiento Programado %": sp.pattern.yieldPercentage.toFixed(2),
                "Tonelaje (T)": sp.pattern.totalProductionWeight.toFixed(2)
            });
        });
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    
    // Auto-width columns roughly
    const wscols = [
        {wch: 12}, // Date
        {wch: 15}, // Code
        {wch: 30}, // Description
        {wch: 12}, // Coils
        {wch: 40}, // Cuts
        {wch: 25}, // Yield
        {wch: 15}  // Tons
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Programa_Corte_Flejes");
    XLSX.writeFile(workbook, `Programa_Corte_Flejes_${new Date().toISOString().slice(0,10)}.xlsx`);
};

/**
 * Exports the Global Schedule to PDF using jsPDF
 */
export const exportScheduleToPDF = (schedule: DailyPlan[]) => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Programa de corte de flejes", 14, 20);
    doc.setFontSize(11);
    doc.text(`Generado: ${new Date().toLocaleDateString()}`, 14, 28);

    let startY = 35;

    // We aggregate rows day by day
    const tableRows: any[] = [];
    
    schedule.forEach(day => {
        // Day Header Row
        tableRows.push([{
            content: `Fecha: ${day.date} - Total: ${day.totalTons.toFixed(1)} Ton - Rendimiento Día: ${day.dailyYield.toFixed(2)}%`, 
            colSpan: 6, 
            styles: { fillColor: [240, 240, 240], fontStyle: 'bold', halign: 'left' } 
        }]);

        day.patterns.forEach(sp => {
            const cutsDesc = sp.pattern.cuts.map(c => `${c.count}x${c.width}`).join(" + ");
            tableRows.push([
                sp.coilCode,
                sp.coilDescription || '',
                sp.coils,
                cutsDesc,
                `${sp.pattern.yieldPercentage.toFixed(2)}%`,
                sp.pattern.totalProductionWeight.toFixed(2)
            ]);
        });
    });

    autoTable(doc, {
        head: [['Bobina', 'Desc.', 'Cant.', 'Patrón de Corte', 'Rend. %', 'Ton.']],
        body: tableRows,
        startY: startY,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 20 }, // Code
            1: { cellWidth: 40 }, // Description
            2: { cellWidth: 10, halign: 'center' }, // Count
            3: { cellWidth: 'auto' }, // Pattern
            4: { cellWidth: 15, halign: 'right' }, // Yield
            5: { cellWidth: 15, halign: 'right' } // Tons
        }
    });

    doc.save(`Programa_Corte_Flejes_${new Date().toISOString().slice(0,10)}.pdf`);
};
