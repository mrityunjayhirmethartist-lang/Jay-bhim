import {
  MonthlyRoyalty,
  ForecastModelType,
  ForecastScenario,
  ForecastMonthData,
  CombinedChartPoint,
  QuarterlyForecastResult
} from '../types';

/**
 * Fits Ordinary Least Squares (OLS) Linear Regression: y = m*x + c
 */
function fitLinearRegression(yValues: number[]): {
  slope: number;
  intercept: number;
  rSquared: number;
  rmse: number;
  predict: (x: number) => number;
} {
  const n = yValues.length;
  if (n < 2) {
    return {
      slope: 0,
      intercept: yValues[0] || 0,
      rSquared: 1,
      rmse: 0,
      predict: () => yValues[0] || 0
    };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += yValues[i];
    sumXY += i * yValues[i];
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const intercept = (sumY - slope * sumX) / n;

  const yMean = sumY / n;
  let ssTot = 0;
  let ssRes = 0;

  for (let i = 0; i < n; i++) {
    const yHat = slope * i + intercept;
    ssTot += Math.pow(yValues[i] - yMean, 2);
    ssRes += Math.pow(yValues[i] - yHat, 2);
  }

  const rSquared = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;
  const rmse = Math.sqrt(ssRes / n);

  return {
    slope,
    intercept,
    rSquared,
    rmse,
    predict: (x: number) => Math.max(0, slope * x + intercept)
  };
}

/**
 * Fits Quadratic Polynomial Regression: y = a*x^2 + b*x + c
 */
function fitPolynomialRegression(yValues: number[]): {
  predict: (x: number) => number;
  rSquared: number;
} {
  const n = yValues.length;
  if (n < 3) {
    const lin = fitLinearRegression(yValues);
    return { predict: lin.predict, rSquared: lin.rSquared };
  }

  // Gaussian elimination for 3x3 normal equations
  let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  let t0 = 0, t1 = 0, t2 = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = yValues[i];
    const x2 = x * x;
    s1 += x;
    s2 += x2;
    s3 += x2 * x;
    s4 += x2 * x2;
    t0 += y;
    t1 += x * y;
    t2 += x2 * y;
  }

  const A = [
    [s4, s3, s2, t2],
    [s3, s2, s1, t1],
    [s2, s1, s0, t0]
  ];

  // Elimination
  for (let i = 0; i < 3; i++) {
    let maxRow = i;
    for (let k = i + 1; k < 3; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    const temp = A[i];
    A[i] = A[maxRow];
    A[maxRow] = temp;

    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-12) continue;

    for (let j = i; j <= 3; j++) A[i][j] /= pivot;

    for (let k = 0; k < 3; k++) {
      if (k !== i) {
        const factor = A[k][i];
        for (let j = i; j <= 3; j++) {
          A[k][j] -= factor * A[i][j];
        }
      }
    }
  }

  const a = A[0][3] || 0;
  const b = A[1][3] || 0;
  const c = A[2][3] || 0;

  const yMean = t0 / n;
  let ssTot = 0;
  let ssRes = 0;

  for (let i = 0; i < n; i++) {
    const yHat = a * i * i + b * i + c;
    ssTot += Math.pow(yValues[i] - yMean, 2);
    ssRes += Math.pow(yValues[i] - yHat, 2);
  }

  const rSquared = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;

  return {
    predict: (x: number) => {
      const pred = a * x * x + b * x + c;
      // Safeguard against negative quadratic divergence
      return Math.max(0, pred);
    },
    rSquared
  };
}

/**
 * Holt's Linear Exponential Smoothing with Grid Search for alpha & beta
 */
function fitHoltWinters(yValues: number[]): {
  predict: (horizon: number) => number;
  alpha: number;
  beta: number;
  rSquared: number;
  rmse: number;
} {
  const n = yValues.length;
  if (n < 2) {
    return {
      predict: () => yValues[0] || 0,
      alpha: 0.5,
      beta: 0.2,
      rSquared: 1,
      rmse: 0
    };
  }

  // Grid search to optimize alpha and beta
  let bestAlpha = 0.5;
  let bestBeta = 0.2;
  let bestMse = Infinity;

  const alphaGrid = [0.2, 0.4, 0.6, 0.8];
  const betaGrid = [0.05, 0.1, 0.2, 0.3];

  for (const a of alphaGrid) {
    for (const b of betaGrid) {
      let level = yValues[0];
      let trend = yValues[1] - yValues[0];
      let mse = 0;

      for (let t = 1; t < n; t++) {
        const yPred = level + trend;
        const err = yValues[t] - yPred;
        mse += err * err;

        const nextLevel = a * yValues[t] + (1 - a) * (level + trend);
        trend = b * (nextLevel - level) + (1 - b) * trend;
        level = nextLevel;
      }

      if (mse < bestMse) {
        bestMse = mse;
        bestAlpha = a;
        bestBeta = b;
      }
    }
  }

  // Run with best parameters to get final level and trend
  let level = yValues[0];
  let trend = yValues[1] - yValues[0];
  const inSamplePreds: number[] = [yValues[0]];

  for (let t = 1; t < n; t++) {
    inSamplePreds.push(level + trend);
    const nextLevel = bestAlpha * yValues[t] + (1 - bestAlpha) * (level + trend);
    trend = bestBeta * (nextLevel - level) + (1 - bestBeta) * trend;
    level = nextLevel;
  }

  const yMean = yValues.reduce((a, b) => a + b, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += Math.pow(yValues[i] - yMean, 2);
    ssRes += Math.pow(yValues[i] - inSamplePreds[i], 2);
  }
  const rSquared = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 1;
  const rmse = Math.sqrt(ssRes / n);

  return {
    alpha: bestAlpha,
    beta: bestBeta,
    rSquared,
    rmse,
    predict: (horizon: number) => Math.max(0, level + horizon * trend)
  };
}

/**
 * Calculates next 3 consecutive months starting after the last provided month string (e.g. '2026-04' -> ['2026-05', '2026-06', '2026-07'])
 */
function getNextQuarterMonths(lastMonthStr: string): Array<{ month: string; monthLabel: string }> {
  let year: number;
  let monthIndex: number; // 0-based

  if (lastMonthStr && lastMonthStr.includes('-')) {
    const parts = lastMonthStr.split('-');
    year = parseInt(parts[0], 10);
    monthIndex = parseInt(parts[1], 10) - 1;
  } else {
    const now = new Date();
    year = now.getFullYear();
    monthIndex = now.getMonth();
  }

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const results: Array<{ month: string; monthLabel: string }> = [];

  for (let i = 1; i <= 3; i++) {
    monthIndex++;
    if (monthIndex > 11) {
      monthIndex = 0;
      year++;
    }
    const mm = String(monthIndex + 1).padStart(2, '0');
    results.push({
      month: `${year}-${mm}`,
      monthLabel: `${monthNames[monthIndex]} ${year}`
    });
  }

  return results;
}

/**
 * Core Machine Learning Forecasting Function
 * Generates next quarter royalty earnings projections using selected ML model and parameters.
 */
export function generateRoyaltyForecast(
  history: MonthlyRoyalty[],
  options: {
    modelType?: ForecastModelType;
    scenario?: ForecastScenario;
    confidenceLevel?: 80 | 90 | 95;
    plannedReleases?: number; // 0 to 4 releases planned
    playlistTraction?: boolean; // Algorithmic / editorial playlist pickup
  } = {}
): QuarterlyForecastResult {
  const modelType = options.modelType || 'ensemble';
  const scenario = options.scenario || 'baseline';
  const confidenceLevel = options.confidenceLevel || 90;
  const plannedReleases = options.plannedReleases || 0;
  const playlistTraction = Boolean(options.playlistTraction);

  // If insufficient history, create fallback mock history
  const safeHistory = history.length >= 2 ? history : [
    {
      month: '2025-11',
      monthLabel: 'Nov 2025',
      grossRoyalty: 5450,
      netRoyalty: 5450,
      streams: 68400,
      spotify: 1950,
      appleMusic: 1520,
      youtubeMusic: 980,
      jioSaavn: 520,
      amazonMusic: 310,
      otherDSPs: 170,
      status: 'Cleared' as const,
      statementId: 'STMT-01'
    },
    {
      month: '2025-12',
      monthLabel: 'Dec 2025',
      grossRoyalty: 9820,
      netRoyalty: 9820,
      streams: 112800,
      spotify: 3450,
      appleMusic: 2700,
      youtubeMusic: 1820,
      jioSaavn: 980,
      amazonMusic: 540,
      otherDSPs: 330,
      status: 'Cleared' as const,
      statementId: 'STMT-02'
    }
  ];

  const n = safeHistory.length;
  const netRoyalties = safeHistory.map(m => m.netRoyalty);
  const streamCounts = safeHistory.map(m => m.streams);

  // Fit Models
  const linNet = fitLinearRegression(netRoyalties);
  const polyNet = fitPolynomialRegression(netRoyalties);
  const hwNet = fitHoltWinters(netRoyalties);

  const linStreams = fitLinearRegression(streamCounts);
  const hwStreams = fitHoltWinters(streamCounts);

  // Standard Error of Residuals for Net Royalties
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = linNet.predict(i);
    ssRes += Math.pow(netRoyalties[i] - pred, 2);
  }
  const stdError = Math.sqrt(ssRes / Math.max(1, n - 2));

  // Confidence Multiplier (z-score)
  const zScore = confidenceLevel === 95 ? 1.96 : confidenceLevel === 80 ? 1.28 : 1.645;

  // Scenario Multiplier
  const scenarioMultiplier =
    scenario === 'conservative' ? 0.88 :
    scenario === 'optimistic' ? 1.18 : 1.0;

  // Catalyst multiplier: +8% velocity per planned release, +12% for playlist traction
  const catalystMultiplier = 1 + (plannedReleases * 0.08) + (playlistTraction ? 0.12 : 0);

  // Calculate Average DSP Ratios from Historical Data
  const totalNet = safeHistory.reduce((acc, m) => acc + m.netRoyalty, 0);
  const dspRatios = {
    spotify: safeHistory.reduce((acc, m) => acc + (m.spotify || 0), 0) / (totalNet || 1),
    appleMusic: safeHistory.reduce((acc, m) => acc + (m.appleMusic || 0), 0) / (totalNet || 1),
    youtubeMusic: safeHistory.reduce((acc, m) => acc + (m.youtubeMusic || 0), 0) / (totalNet || 1),
    jioSaavn: safeHistory.reduce((acc, m) => acc + (m.jioSaavn || 0), 0) / (totalNet || 1),
    amazonMusic: safeHistory.reduce((acc, m) => acc + (m.amazonMusic || 0), 0) / (totalNet || 1),
    otherDSPs: safeHistory.reduce((acc, m) => acc + (m.otherDSPs || 0), 0) / (totalNet || 1)
  };

  // Ensure reasonable baseline proportions if history DSP numbers were zero
  if (dspRatios.spotify === 0) {
    dspRatios.spotify = 0.35;
    dspRatios.appleMusic = 0.28;
    dspRatios.youtubeMusic = 0.18;
    dspRatios.jioSaavn = 0.10;
    dspRatios.amazonMusic = 0.05;
    dspRatios.otherDSPs = 0.04;
  }

  // Get Next 3 Months
  const lastMonth = safeHistory[safeHistory.length - 1].month;
  const nextMonths = getNextQuarterMonths(lastMonth);

  // Generate 3 Forecasted Months
  const forecastMonths: ForecastMonthData[] = nextMonths.map((mInfo, index) => {
    const horizon = index + 1;
    const xIndex = n - 1 + horizon;

    // Model Prediction (Raw Baseline)
    let rawNet = 0;
    if (modelType === 'linear_regression') {
      rawNet = linNet.predict(xIndex);
    } else if (modelType === 'polynomial') {
      rawNet = polyNet.predict(xIndex);
    } else if (modelType === 'holt_winters') {
      rawNet = hwNet.predict(horizon);
    } else {
      // Ensemble (45% Holt-Winters, 35% Linear, 20% Polynomial)
      rawNet =
        0.45 * hwNet.predict(horizon) +
        0.35 * linNet.predict(xIndex) +
        0.20 * polyNet.predict(xIndex);
    }

    // Apply scenario and catalyst multipliers
    const adjustedNet = Math.round(rawNet * scenarioMultiplier * catalystMultiplier * 100) / 100;
    const grossRoyalty = Math.round(adjustedNet * 1.05 * 100) / 100;

    // Confidence Interval Spread
    const margin = zScore * stdError * Math.sqrt(1 + horizon / n);
    const lowerBound = Math.max(0, Math.round((adjustedNet - margin) * 100) / 100);
    const upperBound = Math.round((adjustedNet + margin) * 100) / 100;

    // Projected Streams
    const rawStreams = modelType === 'holt_winters'
      ? hwStreams.predict(horizon)
      : (linStreams.predict(xIndex) + hwStreams.predict(horizon)) / 2;
    const projectedStreams = Math.round(rawStreams * scenarioMultiplier * catalystMultiplier);

    // Confidence Score (decaying slightly with horizon)
    const confidenceScore = Math.max(72, Math.round(96 - horizon * 4.5));

    // DSP Allocations
    const spotify = Math.round(adjustedNet * dspRatios.spotify * 100) / 100;
    const appleMusic = Math.round(adjustedNet * dspRatios.appleMusic * 100) / 100;
    const youtubeMusic = Math.round(adjustedNet * dspRatios.youtubeMusic * 100) / 100;
    const jioSaavn = Math.round(adjustedNet * dspRatios.jioSaavn * 100) / 100;
    const amazonMusic = Math.round(adjustedNet * dspRatios.amazonMusic * 100) / 100;
    const otherDSPs = Math.round(adjustedNet * dspRatios.otherDSPs * 100) / 100;

    // Projected Payout Settlement Date (approximately 45-60 days after month close)
    const [y, mm] = mInfo.month.split('-');
    const payoutMonth = (parseInt(mm, 10) + 1) > 12 ? '01' : String(parseInt(mm, 10) + 2).padStart(2, '0');
    const payoutYear = (parseInt(mm, 10) + 1) > 12 ? parseInt(y, 10) + 1 : y;
    const projectedPayoutDate = `${payoutYear}-${payoutMonth}-20`;

    return {
      month: mInfo.month,
      monthLabel: mInfo.monthLabel,
      isForecast: true,
      projectedNetRoyalty: adjustedNet,
      projectedGrossRoyalty: grossRoyalty,
      lowerBound,
      upperBound,
      projectedStreams,
      confidenceScore,
      spotify,
      appleMusic,
      youtubeMusic,
      jioSaavn,
      amazonMusic,
      otherDSPs,
      projectedPayoutDate
    };
  });

  // Calculate Quarter Summary
  const projectedQuarterNetTotal = forecastMonths.reduce((sum, m) => sum + m.projectedNetRoyalty, 0);
  const projectedQuarterGrossTotal = forecastMonths.reduce((sum, m) => sum + m.projectedGrossRoyalty, 0);
  const projectedQuarterStreams = forecastMonths.reduce((sum, m) => sum + m.projectedStreams, 0);

  // Previous Quarter actual total (last 3 historical months)
  const previous3Months = safeHistory.slice(-3);
  const previousQuarterNetTotal = previous3Months.reduce((sum, m) => sum + m.netRoyalty, 0);

  const projectedQoQGrowth = previousQuarterNetTotal > 0
    ? Math.round(((projectedQuarterNetTotal - previousQuarterNetTotal) / previousQuarterNetTotal) * 1000) / 10
    : 0;

  const projectedAvgRPM = projectedQuarterStreams > 0
    ? Math.round((projectedQuarterNetTotal / projectedQuarterStreams) * 1000 * 100) / 100
    : 0;

  // Compute Model Quality Metric (R-squared and MAPE)
  let sumApe = 0;
  for (let i = 0; i < n; i++) {
    const actual = netRoyalties[i];
    const pred = linNet.predict(i);
    if (actual > 0) {
      sumApe += Math.abs((actual - pred) / actual);
    }
  }
  const mape = Math.round((sumApe / Math.max(1, n)) * 1000) / 10; // e.g. 4.2%

  const rSquared = modelType === 'polynomial'
    ? Math.round(polyNet.rSquared * 1000) / 1000
    : modelType === 'holt_winters'
    ? Math.round(hwNet.rSquared * 1000) / 1000
    : Math.round(linNet.rSquared * 1000) / 1000;

  const rmse = Math.round(linNet.rmse * 100) / 100;

  // Build Unified Chart Points: Historical (Actuals) + Transition + Forecast
  const combinedChartData: CombinedChartPoint[] = [];

  safeHistory.forEach((m) => {
    combinedChartData.push({
      month: m.month,
      monthLabel: m.monthLabel,
      isForecast: false,
      actualNet: m.netRoyalty,
      actualGross: m.grossRoyalty,
      actualStreams: m.streams,
      status: m.status,
      spotify: m.spotify,
      appleMusic: m.appleMusic,
      youtubeMusic: m.youtubeMusic,
      jioSaavn: m.jioSaavn,
      amazonMusic: m.amazonMusic,
      otherDSPs: m.otherDSPs
    });
  });

  // Include last actual month as anchor point for smooth continuous forecast line
  const lastActual = safeHistory[safeHistory.length - 1];
  if (lastActual && combinedChartData.length > 0) {
    const anchor = combinedChartData[combinedChartData.length - 1];
    anchor.forecastNet = anchor.actualNet;
    anchor.lowerBound = anchor.actualNet;
    anchor.upperBound = anchor.actualNet;
    anchor.rangeSpan = [anchor.actualNet || 0, anchor.actualNet || 0];
  }

  // Append Forecast Months
  forecastMonths.forEach((fm) => {
    combinedChartData.push({
      month: fm.month,
      monthLabel: fm.monthLabel + ' (Proj)',
      isForecast: true,
      forecastNet: fm.projectedNetRoyalty,
      forecastGross: fm.projectedGrossRoyalty,
      forecastStreams: fm.projectedStreams,
      lowerBound: fm.lowerBound,
      upperBound: fm.upperBound,
      rangeSpan: [fm.lowerBound, fm.upperBound],
      spotify: fm.spotify,
      appleMusic: fm.appleMusic,
      youtubeMusic: fm.youtubeMusic,
      jioSaavn: fm.jioSaavn,
      amazonMusic: fm.amazonMusic,
      otherDSPs: fm.otherDSPs,
      status: 'Projected'
    });
  });

  // Formulate Quarter Label
  const startM = forecastMonths[0]?.monthLabel.split(' ')[0] || '';
  const endM = forecastMonths[2]?.monthLabel || '';
  const quarterLabel = `Next Quarter (${startM} – ${endM})`;

  return {
    quarterLabel,
    projectedQuarterNetTotal,
    projectedQuarterGrossTotal,
    projectedQuarterStreams,
    previousQuarterNetTotal,
    projectedQoQGrowth,
    projectedAvgRPM,
    rSquared,
    mape,
    rmse,
    modelType,
    scenario,
    forecastMonths,
    combinedChartData
  };
}
