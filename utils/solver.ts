
import { Demand, Pattern, OptimizationResult, SolverConfig, Cut, SolverStrategy, DailyPlan, ScheduledPattern, BatchOptimizationResult, CoilSummary, CoilGroupConfig } from '../types';
// @ts-ignore
import * as SolverLib from "javascript-lp-solver";

// Safe resolution of the Solver object depending on ESM/CJS interop
const Solver = (SolverLib as any).default || SolverLib;

const SCALE = 100;

const toInt = (n: number) => Math.round(n * SCALE);
const toFloat = (n: number) => n / SCALE;

const calculateStripWeight = (stripWidth: number, parentWidth: number, parentWeight: number): number => {
  if (parentWidth === 0) return 0;
  return (stripWidth / parentWidth) * parentWeight;
};

/**
 * PHASE 1: Generate optimal patterns minimizing waste
 */
const solveLinearPhase = (aggregatedDemands: Demand[], config: SolverConfig): { patterns: Pattern[], fulfillment: Record<number, number>, error?: string } => {
    const parentWidthInt = toInt(config.parentWidth);
    const edgeTrimInt = toInt(config.edgeTrim);
    const usableWidthInt = parentWidthInt - edgeTrimInt;
    const maxCuts = config.maxCuts || 16; 

    const uniquePatterns: Record<string, number[]> = {};

    const addPattern = (counts: number[]) => {
        const key = counts.join(',');
        if (!uniquePatterns[key]) {
            uniquePatterns[key] = counts;
        }
    };

    // A. Single Width Patterns
    aggregatedDemands.forEach((d, i) => {
        const wInt = toInt(d.width);
        if (wInt <= usableWidthInt) {
            let count = Math.floor(usableWidthInt / wInt);
            if (count > maxCuts) count = maxCuts;
            if (count > 0) {
                const pat = new Array(aggregatedDemands.length).fill(0);
                pat[i] = count;
                addPattern(pat);
            }
        }
    });

    // B. Smart Mixed Patterns
    const ITERATIONS = 12000;
    for (let i = 0; i < ITERATIONS; i++) {
        const pat = new Array(aggregatedDemands.length).fill(0);
        let currentRemaining = usableWidthInt;
        let currentCuts = 0;
        let indices: number[];
        const strategy = i % 4; 

        if (strategy === 0) {
            indices = Array.from({ length: aggregatedDemands.length }, (_, k) => k)
                .sort((a, b) => aggregatedDemands[b].width - aggregatedDemands[a].width);
        } else if (strategy === 1) {
            indices = Array.from({ length: aggregatedDemands.length }, (_, k) => k)
                .sort((a, b) => aggregatedDemands[b].targetTons - aggregatedDemands[a].targetTons);
        } else {
             indices = Array.from({ length: aggregatedDemands.length }, (_, k) => k)
                             .sort(() => Math.random() - 0.5);
        }

        for (const idx of indices) {
            if (currentCuts >= maxCuts) break;

            const wInt = toInt(aggregatedDemands[idx].width);
            if (wInt <= currentRemaining) {
                let maxByWidth = Math.floor(currentRemaining / wInt);
                const allowedCuts = maxCuts - currentCuts;
                let maxC = Math.min(maxByWidth, allowedCuts);

                if (maxC > 0) {
                    let count = maxC;
                    if (strategy !== 0 && Math.random() > 0.3 && maxC > 1) {
                        count = Math.floor(Math.random() * maxC) + 1;
                    } else if (strategy === 0 && Math.random() > 0.7 && maxC > 1) {
                        count = Math.floor(Math.random() * maxC) + 1;
                    }

                    if (count > 0) {
                        pat[idx] += count;
                        currentRemaining -= count * wInt;
                        currentCuts += count;
                    }
                }
            }
        }
        if (currentRemaining < usableWidthInt) addPattern(pat);
    }

    // LP Formulation
    const patternsList = Object.values(uniquePatterns);
    const lpConstraints: Record<string, { min?: number, max?: number }> = {};
    const lpVariables: Record<string, any> = {};

    aggregatedDemands.forEach(d => {
        const minVal = d.targetTons * (1 - config.tolerance / 100);
        const maxVal = d.targetTons * (1 + config.tolerance / 100);
        lpConstraints[d.id] = { min: minVal, max: maxVal };
    });

    patternsList.forEach((patCounts, idx) => {
        const varName = `pat_${idx}`;
        const variableData: any = { cost: 1 };
        patCounts.forEach((count, dIdx) => {
            if (count > 0) {
                const d = aggregatedDemands[dIdx];
                const weightPerCut = calculateStripWeight(d.width, config.parentWidth, config.parentWeight);
                variableData[d.id] = count * weightPerCut; 
            }
        });
        lpVariables[varName] = variableData;
    });

    const model = {
        optimize: "cost",
        opType: "min",
        constraints: lpConstraints,
        variables: lpVariables
    };

    let solverResult;
    try {
        if (!Solver || typeof Solver.Solve !== 'function') throw new Error("Lib error");
        solverResult = Solver.Solve(model);
    } catch (e) {
        return { patterns: [], fulfillment: {}, error: "Error en solver" };
    }

    if (!solverResult || !solverResult.feasible) {
        return { patterns: [], fulfillment: {}, error: "Infeasible" };
    }

    // Parse Results
    const finalPatterns: Pattern[] = [];
    const fulfillment: Record<number, number> = {};
    aggregatedDemands.forEach(d => fulfillment[d.width] = 0);

    Object.keys(solverResult).forEach(key => {
        if (key.startsWith("pat_")) {
            const patIdx = parseInt(key.replace("pat_", ""));
            const rawCoils = solverResult[key];
            if (rawCoils > 0.001) {
                const counts = patternsList[patIdx];
                const cuts: Cut[] = [];
                let usedWidthInt = 0;
                
                counts.forEach((c, i) => {
                    if (c > 0) {
                        const d = aggregatedDemands[i];
                        const wPerCut = calculateStripWeight(d.width, config.parentWidth, config.parentWeight);
                        cuts.push({ width: d.width, count: c, weightPerCut: wPerCut });
                        usedWidthInt += c * toInt(d.width);
                        // fulfillment accumulation from LP
                        fulfillment[d.width] = (fulfillment[d.width] || 0) + (rawCoils * c * wPerCut);
                    }
                });

                const assignedCoils = Math.ceil(rawCoils);

                finalPatterns.push({
                    id: finalPatterns.length + 1,
                    cuts: cuts.sort((a,b) => b.width - a.width),
                    assignedCoils: assignedCoils,
                    usedWidth: toFloat(usedWidthInt),
                    wasteWidth: toFloat(usableWidthInt - usedWidthInt + edgeTrimInt), 
                    yieldPercentage: (toFloat(usedWidthInt) / config.parentWidth) * 100,
                    totalProductionWeight: assignedCoils * config.parentWeight
                });
            }
        }
    });

    return { patterns: finalPatterns, fulfillment };
};

// --- GLOBAL SEQUENCING ---
// Calculates the urgency of a pattern based on the dates of demands it fulfills
const calculatePatternUrgency = (pattern: Pattern, demands: Demand[]): number => {
    let minDate = Infinity;
    const dateMap: Record<number, number> = {};
    
    // Map width to earliest date
    demands.forEach(d => {
        const ts = new Date(d.date).getTime();
        if (!dateMap[d.width] || ts < dateMap[d.width]) {
            dateMap[d.width] = ts;
        }
    });

    pattern.cuts.forEach(cut => {
        if (dateMap[cut.width] && dateMap[cut.width] < minDate) {
            minDate = dateMap[cut.width];
        }
    });

    return minDate === Infinity ? new Date().getTime() : minDate;
};

const calculateGlobalSchedule = (
    allResults: Record<string, OptimizationResult>, 
    allDemands: Demand[], 
    globalCapacity: number,
    baseConfig: SolverConfig,
    coilGroupConfigs: CoilGroupConfig[]
): DailyPlan[] => {
    
    // Build maps for lookups
    const descriptionMap: Record<string, string> = {};
    
    coilGroupConfigs.forEach(g => {
        descriptionMap[g.coilCode] = g.description;
    });

    // 1. Flatten all patterns into a single queue
    interface QueueItem {
        pattern: Pattern;
        patternId: number;
        coilCode: string;
        weight: number;
        urgency: number;
        coilConfig: SolverConfig;
    }

    const queue: QueueItem[] = [];

    Object.entries(allResults).forEach(([code, res]) => {
        res.patterns.forEach(p => {
            const urgency = calculatePatternUrgency(p, allDemands.filter(d => (d.coilCode || 'DEFAULT') === code));
            
            // Add each individual coil of this pattern as a task
            for (let i = 0; i < p.assignedCoils; i++) {
                queue.push({
                    pattern: p,
                    patternId: p.id,
                    coilCode: code,
                    weight: p.totalProductionWeight / p.assignedCoils,
                    urgency: urgency,
                    coilConfig: baseConfig 
                });
            }
        });
    });

    // 2. Sort Queue by Date
    queue.sort((a, b) => a.urgency - b.urgency);

    if (queue.length === 0) return [];

    // 3. Fill Buckets
    const schedule: DailyPlan[] = [];
    
    // Start from tomorrow
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    let currentDateMs = tomorrow.getTime();
    let currentDateStr = tomorrow.toISOString().split('T')[0];
    
    const nextDay = (d: string) => {
        const date = new Date(d);
        // Correct timezone offset issue by explicitly handling dates
        // Or simpler: just add 24 hours in UTC
        const next = new Date(date);
        next.setDate(date.getDate() + 1);
        return next.toISOString().split('T')[0];
    };

    let queueIndex = 0;

    while (queueIndex < queue.length) {
        const dayPlan: DailyPlan = {
            date: currentDateStr,
            patterns: [],
            totalTons: 0,
            producedItems: {},
            dailyYield: 0
        };

        let dayInputWeight = 0;

        while (queueIndex < queue.length) {
            const item = queue[queueIndex];
            
            // Check capacity
            if (dayPlan.totalTons + item.weight > globalCapacity && dayPlan.totalTons > 0) {
                break; // Day full
            }

            // Add to day
            const existing = dayPlan.patterns.find(p => p.patternId === item.patternId && p.coilCode === item.coilCode);
            if (existing) {
                existing.coils++;
            } else {
                dayPlan.patterns.push({ 
                    patternId: item.patternId, 
                    coils: 1, 
                    pattern: item.pattern,
                    coilCode: item.coilCode,
                    coilDescription: descriptionMap[item.coilCode] || 'Sin descripción'
                });
            }

            dayPlan.totalTons += item.weight;
            
            // Calculate Input Weight for this item: Output / (Yield/100)
            const itemInputWeight = item.weight / (item.pattern.yieldPercentage / 100);
            dayInputWeight += itemInputWeight;

            item.pattern.cuts.forEach(cut => {
                const amt = cut.weightPerCut; // This is per 1 coil
                dayPlan.producedItems[cut.width] = (dayPlan.producedItems[cut.width] || 0) + amt;
            });

            queueIndex++;
        }

        // Calculate Daily Weighted Yield (Output / Input)
        if (dayInputWeight > 0) {
            // Formula: (Total Output / Total Input) * 100
            // dayPlan.totalTons is the output weight? 
            // Wait, previous logic: item.weight = p.totalProductionWeight / coils.
            // p.totalProductionWeight = assignedCoils * parentWeight. 
            // So item.weight IS Input Weight.
            
            // Let's verify 'totalProductionWeight' definition in Phase 1:
            // totalProductionWeight: assignedCoils * config.parentWeight
            // So it IS Input Weight.
            
            // However, previous code comments said "Output based on Pattern Yield".
            // Let's re-read solveBatchCuttingStock correction:
            // const input = result.patterns.reduce((acc, p) => acc + p.totalProductionWeight, 0);
            // const output = result.patterns.reduce((acc, p) => acc + (p.totalProductionWeight * (p.yieldPercentage / 100)), 0);
            
            // So p.totalProductionWeight is INPUT weight (Parent Coil Weight).
            // dayPlan.totalTons is accumulating INPUT weight.
            
            // If dayPlan.totalTons is INPUT weight, then Yield calculation is:
            // DailyOutput = sum(itemInput * yield%)
            // DailyYield = (DailyOutput / DailyInput) * 100
            
            const realOutput = dayPlan.patterns.reduce((acc, p) => {
                const patYield = p.pattern.yieldPercentage / 100;
                const patInput = p.coils * (p.pattern.totalProductionWeight / p.pattern.assignedCoils); // Single coil weight
                return acc + (patInput * patYield);
            }, 0);
            
            dayPlan.dailyYield = (realOutput / dayPlan.totalTons) * 100;

        }

        schedule.push(dayPlan);
        currentDateStr = nextDay(currentDateStr);
    }

    return schedule;
};


// --- CORE SOLVER WRAPPER (Local) ---
export const solveLinearHybrid = (demands: Demand[], config: SolverConfig): OptimizationResult => {
    // 1. Phase 1: Aggregate and Optimize
    const aggregatedMap: Record<number, number> = {};
    demands.forEach(d => {
        aggregatedMap[d.width] = (aggregatedMap[d.width] || 0) + d.targetTons;
    });

    const aggregatedDemands: Demand[] = Object.entries(aggregatedMap).map(([width, tons]) => ({
        id: `agg-${width}`,
        width: parseFloat(width),
        targetTons: tons,
        date: '' 
    }));

    const phase1Result = solveLinearPhase(aggregatedDemands, config);

    if (phase1Result.error || !phase1Result.patterns.length) {
         return {
             patterns: [],
             fulfillment: {},
             totalCoilsUsed: 0,
             globalYield: 0,
             globalWaste: 0,
             unmetDemands: [phase1Result.error || "No solution"],
             schedule: [],
             capacitySchedule: []
        };
    }

    // Re-calculate Stats based on Integer Patterns (Reality) instead of LP Floats
    const totalCoilsUsed = phase1Result.patterns.reduce((acc, p) => acc + p.assignedCoils, 0);
    const totalInput = totalCoilsUsed * config.parentWeight;
    
    // Output based on Pattern Yield
    const totalOutput = phase1Result.patterns.reduce((acc, p) => {
        const patOutput = p.totalProductionWeight * (p.yieldPercentage / 100);
        return acc + patOutput;
    }, 0);

    const globalYield = totalInput > 0 ? (totalOutput / totalInput) * 100 : 0;

    const unmetDemands = aggregatedDemands.filter(d => {
        const produced = phase1Result.fulfillment[d.width] || 0;
        const minReq = d.targetTons * (1 - config.tolerance / 100);
        return produced < minReq - 0.1; 
    }).map(d => `Ancho ${d.width}: ${phase1Result.fulfillment[d.width]?.toFixed(1)} / ${d.targetTons} T`);

    return {
        patterns: phase1Result.patterns,
        fulfillment: phase1Result.fulfillment,
        totalCoilsUsed,
        globalYield,
        globalWaste: 100 - globalYield,
        unmetDemands,
        schedule: [], // Not using local schedule anymore for global logic
        capacitySchedule: [] // Not using local capacity logic
    };
};

// --- BATCH SOLVER TOOLS ---
const extractWidthFromDescription = (desc: string): number | null => {
    if (!desc) return null;
    const descUpper = desc.toUpperCase();
    const regex = /\b(\d{3,4})\s*MM\b/g;
    const matches = [...descUpper.matchAll(regex)];
    
    let width: number | null = null;
    if (matches.length > 0) {
        const widths = matches.map(m => parseInt(m[1])).filter(w => w > 600 && w < 2500);
        if (widths.length > 0) width = Math.max(...widths);
    }

    // Special Business Rule: BLAC + 1200mm -> 1210mm
    if (width === 1200 && descUpper.includes('BLAC')) {
        return 1210;
    }

    return width;
};

export const prepareCoilGroups = (allDemands: Demand[]): CoilGroupConfig[] => {
    const groups: Record<string, CoilGroupConfig> = {};

    allDemands.forEach(d => {
        const code = d.coilCode || 'DEFAULT';
        if (!groups[code]) {
            groups[code] = {
                coilCode: code,
                description: d.coilDescription || 'Bobina Genérica',
                detectedWidth: 1200, // Fallback
                totalDemand: 0
            };
            
            const extracted = extractWidthFromDescription(groups[code].description);
            if (extracted) groups[code].detectedWidth = extracted;
        }
        groups[code].totalDemand += d.targetTons;
    });

    return Object.values(groups).sort((a,b) => b.totalDemand - a.totalDemand);
};

export const solveBatchCuttingStock = (
    allDemands: Demand[], 
    baseConfig: SolverConfig,
    widthOverrides?: Record<string, number>
): BatchOptimizationResult => {
    
    const groups = prepareCoilGroups(allDemands);
    const groupedDemands: Record<string, Demand[]> = {};
    
    allDemands.forEach(d => {
        const code = d.coilCode || 'DEFAULT';
        if (!groupedDemands[code]) groupedDemands[code] = [];
        groupedDemands[code].push(d);
    });

    const results: Record<string, OptimizationResult> = {};
    const summary: CoilSummary[] = [];

    let totalGlobalInput = 0;
    let totalGlobalOutput = 0;

    groups.forEach(group => {
        const code = group.coilCode;
        const demands = groupedDemands[code];
        
        let finalWidth = baseConfig.parentWidth;
        if (widthOverrides && widthOverrides[code]) {
            finalWidth = widthOverrides[code];
        } else if (group.detectedWidth) {
            finalWidth = group.detectedWidth;
        }

        const dynamicConfig = { ...baseConfig, parentWidth: finalWidth };

        // Solve Local Optimization (Get Patterns)
        const result = solveLinearHybrid(demands, dynamicConfig);
        
        // CORRECTION: Re-calculate IO based on Integer Pattern Yields for consistency
        const input = result.patterns.reduce((acc, p) => acc + p.totalProductionWeight, 0);
        const output = result.patterns.reduce((acc, p) => {
            const patternOutput = p.totalProductionWeight * (p.yieldPercentage / 100);
            return acc + patternOutput;
        }, 0);
        
        // Override result stats
        result.globalYield = input > 0 ? (output / input) * 100 : 0;
        result.globalWaste = 100 - result.globalYield;

        results[code] = result;

        totalGlobalInput += input;
        totalGlobalOutput += output;

        summary.push({
            coilCode: code,
            description: group.description,
            totalInputTons: input,
            totalOutputTons: output,
            yield: result.globalYield,
            waste: result.globalWaste,
            parentWidth: dynamicConfig.parentWidth
        });
    });

    // --- GLOBAL SEQUENCING ---
    const globalSchedule = calculateGlobalSchedule(
        results, 
        allDemands, 
        baseConfig.dailyCapacity, 
        baseConfig,
        groups
    );

    const totalGlobalYield = totalGlobalInput > 0 ? (totalGlobalOutput / totalGlobalInput) * 100 : 0;

    return {
        summary: summary.sort((a,b) => b.totalInputTons - a.totalInputTons),
        results,
        isBatch: true,
        totalGlobalYield,
        totalGlobalInput,
        totalGlobalOutput,
        globalCapacitySchedule: globalSchedule
    };
};
