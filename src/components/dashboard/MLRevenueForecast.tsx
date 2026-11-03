import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import {
  Sparkles,
  TrendingUp,
  BrainCircuit,
  Sliders,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Download,
  Info,
  Disc3,
  HelpCircle,
  Clock,
  CheckCircle2,
  ChevronDown
} from 'lucide-react';
import {
  MonthlyRoyalty,
  ForecastModelType,
  ForecastScenario,
  QuarterlyForecastResult
} from '../../types';
import { generateRoyaltyForecast } from '../../utils/mlForecasting';

interface MLRevenueForecastProps {
  monthlyRoyalties: MonthlyRoyalty[];
  currencySymbol?: string;
  onExportForecast?: (forecast: QuarterlyForecastResult) => void;
}

// Custom Tooltip for Forecast Recharts Visualization
const ForecastCustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0]?.payload;
    if (!data) return null;

    const isForecast = data.isForecast;

    return (
      <div className="p-4 bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-md text-xs min-w-[240px]">
        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
          <div className="flex items-center gap-1.5 font-semibold text-white font-display">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>{data.monthLabel || label}</span>
          </div>
          <span
            className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${
              isForecast ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {isForecast ? 'ML Projection' : data.status || 'Verified'}
          </span>
        </div>

        <div className="space-y-1.5 font-mono">
          {!isForecast && data.actualNet !== undefined && (
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-400 font-sans">
                <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                Actual Net Royalty:
              </span>
              <span className="font-bold text-white tabular-nums">
                ₹{Number(data.actualNet).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {isForecast && (
            <>
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5 text-slate-400 font-sans">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  Projected Expected:
                </span>
                <span className="font-bold text-amber-300 tabular-nums">
                  ₹{Number(data.forecastNet).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {data.lowerBound !== undefined && data.upperBound !== undefined && (
                <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-slate-800">
                  <span className="font-sans">Confidence Range:</span>
                  <span className="text-slate-300 tabular-nums">
                    ₹{Math.round(data.lowerBound).toLocaleString('en-IN')} – ₹{Math.round(data.upperBound).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-slate-800">
            <span className="font-sans">Streams:</span>
            <span className="text-slate-200 tabular-nums">
              {(isForecast ? data.forecastStreams : data.actualStreams)?.toLocaleString('en-IN')} plays
            </span>
          </div>

          {/* Platform breakdown if available */}
          {data.spotify !== undefined && (
            <div className="pt-2 mt-1 border-t border-slate-800/80 space-y-1 text-[10px] text-slate-400">
              <div className="flex justify-between">
                <span>Spotify:</span>
                <span className="text-white">₹{Math.round(data.spotify).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span>Apple Music:</span>
                <span className="text-white">₹{Math.round(data.appleMusic).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span>YouTube Music:</span>
                <span className="text-white">₹{Math.round(data.youtubeMusic).toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export const MLRevenueForecast: React.FC<MLRevenueForecastProps> = ({
  monthlyRoyalties,
  currencySymbol = '₹'
}) => {
  // ML Model State
  const [modelType, setModelType] = useState<ForecastModelType>('ensemble');
  const [scenario, setScenario] = useState<ForecastScenario>('baseline');
  const [confidenceLevel, setConfidenceLevel] = useState<80 | 90 | 95>(90);
  const [plannedReleases, setPlannedReleases] = useState<number>(1);
  const [playlistTraction, setPlaylistTraction] = useState<boolean>(true);

  // Visualization View Controls
  const [chartView, setChartView] = useState<'area' | 'line'>('area');
  const [metricType, setMetricType] = useState<'royalties' | 'streams'>('royalties');
  const [showConfidenceBand, setShowConfidenceBand] = useState<boolean>(true);

  // Compute Forecast Result using ML Engine
  const forecastResult = useMemo(() => {
    return generateRoyaltyForecast(monthlyRoyalties, {
      modelType,
      scenario,
      confidenceLevel,
      plannedReleases,
      playlistTraction
    });
  }, [monthlyRoyalties, modelType, scenario, confidenceLevel, plannedReleases, playlistTraction]);

  // Quarter-over-Quarter comparison data for Bar Chart
  const qoqComparisonData = useMemo(() => {
    return [
      {
        quarter: 'Preceding Quarter',
        period: 'Past 3 Months',
        netRoyalties: Math.round(forecastResult.previousQuarterNetTotal),
        color: '#64748b'
      },
      {
        quarter: 'Projected Next Quarter',
        period: forecastResult.quarterLabel.replace('Next Quarter ', ''),
        netRoyalties: Math.round(forecastResult.projectedQuarterNetTotal),
        color: '#06b6d4'
      }
    ];
  }, [forecastResult]);

  // Projected Platform Totals for the Next Quarter
  const platformProjections = useMemo(() => {
    const totals = {
      spotify: 0,
      appleMusic: 0,
      youtubeMusic: 0,
      jioSaavn: 0,
      amazonMusic: 0,
      otherDSPs: 0
    };

    forecastResult.forecastMonths.forEach((m) => {
      totals.spotify += m.spotify;
      totals.appleMusic += m.appleMusic;
      totals.youtubeMusic += m.youtubeMusic;
      totals.jioSaavn += m.jioSaavn;
      totals.amazonMusic += m.amazonMusic;
      totals.otherDSPs += m.otherDSPs;
    });

    const net = forecastResult.projectedQuarterNetTotal || 1;

    return [
      { name: 'Spotify', amount: totals.spotify, percentage: Math.round((totals.spotify / net) * 100), color: '#10b981' },
      { name: 'Apple Music', amount: totals.appleMusic, percentage: Math.round((totals.appleMusic / net) * 100), color: '#f43f5e' },
      { name: 'YouTube Music & Content ID', amount: totals.youtubeMusic, percentage: Math.round((totals.youtubeMusic / net) * 100), color: '#ef4444' },
      { name: 'JioSaavn', amount: totals.jioSaavn, percentage: Math.round((totals.jioSaavn / net) * 100), color: '#06b6d4' },
      { name: 'Amazon Music', amount: totals.amazonMusic, percentage: Math.round((totals.amazonMusic / net) * 100), color: '#f59e0b' },
      { name: 'Regional / Other DSPs', amount: totals.otherDSPs, percentage: Math.round((totals.otherDSPs / net) * 100), color: '#8b5cf6' }
    ];
  }, [forecastResult]);

  // Export Forecast CSV
  const handleExportCSV = () => {
    const headers = [
      'Projected Cycle',
      'Cycle Type',
      'Expected Net Royalty (INR)',
      'Lower Bound (90% CI)',
      'Upper Bound (90% CI)',
      'Projected Streams',
      'Spotify (INR)',
      'Apple Music (INR)',
      'YouTube (INR)',
      'JioSaavn (INR)',
      'Amazon Music (INR)',
      'Estimated Settlement Window'
    ];

    const rows = forecastResult.forecastMonths.map((m) => [
      `"${m.monthLabel}"`,
      '"ML Projection"',
      m.projectedNetRoyalty.toFixed(2),
      m.lowerBound.toFixed(2),
      m.upperBound.toFixed(2),
      m.projectedStreams,
      m.spotify.toFixed(2),
      m.appleMusic.toFixed(2),
      m.youtubeMusic.toFixed(2),
      m.jioSaavn.toFixed(2),
      m.amazonMusic.toFixed(2),
      `"${m.projectedPayoutDate}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Rudraatma_ML_Royalty_Forecast_${forecastResult.quarterLabel.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* SECTION HEADER & PROJECTION SUMMARY BANNER */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-950/30 via-[#090e1a] to-[#090e1a] border border-cyan-500/30 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 blur-[100px] pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-cyan-400 font-semibold tracking-wider uppercase">
                Machine Learning Forecast
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400 font-mono">
                {forecastResult.quarterLabel}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                R² = {forecastResult.rSquared} Fit
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white font-display tracking-tight">
              Projected Next Quarter Royalty Earnings
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Trained on your historical stream ingestion cadence, DSP distribution ratios, and catalog momentum to forecast next quarter royalty earnings with calibrated prediction intervals.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-semibold transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export ML Forecast (CSV)</span>
            </button>
          </div>
        </div>

        {/* 4 CORE KPI METRIC CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          {/* KPI 1: Projected Total */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
            <span className="text-xs text-slate-400 font-medium">Next Quarter Expected</span>
            <div className="text-2xl font-bold font-mono text-cyan-400 tabular-nums">
              {currencySymbol}{forecastResult.projectedQuarterNetTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-400">QoQ Growth:</span>
              <span className={`font-mono font-semibold flex items-center gap-0.5 ${forecastResult.projectedQoQGrowth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                <ArrowUpRight className="w-3 h-3" />
                {forecastResult.projectedQoQGrowth > 0 ? `+${forecastResult.projectedQoQGrowth}%` : `${forecastResult.projectedQoQGrowth}%`}
              </span>
            </div>
          </div>

          {/* KPI 2: Projected Streams */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
            <span className="text-xs text-slate-400 font-medium">Projected Stream Volume</span>
            <div className="text-2xl font-bold font-mono text-purple-300 tabular-nums">
              {forecastResult.projectedQuarterStreams >= 1000000
                ? `${(forecastResult.projectedQuarterStreams / 1000000).toFixed(2)}M`
                : `${(forecastResult.projectedQuarterStreams / 1000).toFixed(1)}k`}
            </div>
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-400">Total Plays:</span>
              <span className="font-mono text-slate-300">
                {forecastResult.projectedQuarterStreams.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* KPI 3: Forecasted Effective RPM */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
            <span className="text-xs text-slate-400 font-medium">Projected Effective RPM</span>
            <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
              ₹{forecastResult.projectedAvgRPM.toFixed(2)}
            </div>
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-400">Payout Per 1k Plays:</span>
              <span className="font-mono text-white">Consistent 100% share</span>
            </div>
          </div>

          {/* KPI 4: Model Confidence & Fit */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
            <span className="text-xs text-slate-400 font-medium">Model Confidence & Fit</span>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {(forecastResult.rSquared * 100).toFixed(1)}%
            </div>
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-400">Mean Abs Error (MAPE):</span>
              <span className="font-mono text-cyan-300 font-semibold">{forecastResult.mape}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* INTERACTIVE CONTROLS TOOLBAR */}
      <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold text-white font-display">
              ML Hyperparameters & Scenario Simulation
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 text-[11px]">Visualization Mode:</span>
            <div className="inline-flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl">
              <button
                onClick={() => setMetricType('royalties')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  metricType === 'royalties'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Royalties (INR)
              </button>
              <button
                onClick={() => setMetricType('streams')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  metricType === 'streams'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Streams (Plays)
              </button>
            </div>

            <div className="inline-flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl ml-2">
              <button
                onClick={() => setChartView('area')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  chartView === 'area'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Area Chart
              </button>
              <button
                onClick={() => setChartView('line')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  chartView === 'line'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Line Chart
              </button>
            </div>
          </div>
        </div>

        {/* Control Parameters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Control 1: ML Model Selection */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-medium">Model Architecture</label>
            <select
              value={modelType}
              onChange={(e) => setModelType(e.target.value as ForecastModelType)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="ensemble">Ensemble Hybrid (HW + OLS + Poly)</option>
              <option value="holt_winters">Holt's Linear Exponential Smoothing</option>
              <option value="linear_regression">Ordinary Least Squares Regression</option>
              <option value="polynomial">Quadratic Polynomial Trend</option>
            </select>
          </div>

          {/* Control 2: Scenario Preset */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-medium">Scenario Trajectory</label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
              {(['conservative', 'baseline', 'optimistic'] as ForecastScenario[]).map((sc) => (
                <button
                  key={sc}
                  onClick={() => setScenario(sc)}
                  className={`py-1.5 rounded-lg text-[11px] font-medium capitalize transition-colors ${
                    scenario === sc
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {sc === 'conservative' ? 'Bear' : sc === 'baseline' ? 'Base' : 'Bull'}
                </button>
              ))}
            </div>
          </div>

          {/* Control 3: Planned Release Catalyst */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-300 font-medium">
              <span>Upcoming Releases</span>
              <span className="font-mono text-cyan-400">+{plannedReleases} drops</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              {[0, 1, 2, 3].map((val) => (
                <button
                  key={val}
                  onClick={() => setPlannedReleases(val)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                    plannedReleases === val
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {val === 0 ? 'None' : `${val}`}
                </button>
              ))}
            </div>
          </div>

          {/* Control 4: Playlist Placement Catalyst & Confidence Level */}
          <div className="space-y-1.5">
            <label className="block text-slate-300 font-medium">Confidence Interval</label>
            <div className="flex items-center gap-2">
              <select
                value={confidenceLevel}
                onChange={(e) => setConfidenceLevel(Number(e.target.value) as any)}
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value={80}>80% Confidence Interval</option>
                <option value={90}>90% Confidence Interval (Recommended)</option>
                <option value={95}>95% Confidence Interval</option>
              </select>

              <button
                type="button"
                onClick={() => setPlaylistTraction(!playlistTraction)}
                title="Toggle Algorithmic Playlist Traction Catalyst (+12%)"
                className={`px-3 py-2 rounded-xl border text-[11px] font-semibold whitespace-nowrap transition-colors ${
                  playlistTraction
                    ? 'bg-purple-950/60 border-purple-500 text-purple-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Playlist Boost
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PRIMARY RECHARTS VISUALIZATION: HISTORICAL ACTUALS VS ML NEXT QUARTER */}
      <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase text-cyan-400">Time-Series Forecast Model</span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-400">Continuous Trend Curve</span>
            </div>
            <h3 className="text-lg font-bold text-white font-display mt-0.5">
              Historical Track Performance vs. Next Quarter Horizon
            </h3>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-cyan-400 inline-block" />
              <span>Historical Actuals</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-b border-dashed border-amber-400 inline-block" />
              <span>ML Projected Quarter</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="w-2.5 h-2.5 bg-amber-400/20 border border-amber-400/40 rounded-sm inline-block" />
              <span>{confidenceLevel}% Range</span>
            </div>
          </div>
        </div>

        {/* Recharts Chart Canvas */}
        <div className="h-[380px] w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            {chartView === 'area' ? (
              <AreaChart
                data={forecastResult.combinedChartData}
                margin={{ top: 15, right: 25, left: 10, bottom: 25 }}
              >
                <defs>
                  {/* Historical Gradient */}
                  <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>

                  {/* Forecast Gradient */}
                  <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>

                  {/* Confidence Band Gradient */}
                  <linearGradient id="confidenceBandGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

                <XAxis
                  dataKey="monthLabel"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  tickLine={{ stroke: '#334155' }}
                  axisLine={{ stroke: '#334155' }}
                  dy={10}
                />

                <YAxis
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  tickLine={{ stroke: '#334155' }}
                  axisLine={{ stroke: '#334155' }}
                  tickFormatter={(val) =>
                    metricType === 'royalties'
                      ? `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                      : `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`
                  }
                  dx={-5}
                />

                <Tooltip content={<ForecastCustomTooltip />} />

                {/* Transition Reference Line distinguishing Actuals from Forecast */}
                <ReferenceLine
                  x={forecastResult.forecastMonths[0]?.monthLabel + ' (Proj)'}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Forecast Horizon →',
                    fill: '#f59e0b',
                    fontSize: 11,
                    position: 'top',
                    fontFamily: 'monospace'
                  }}
                />

                {/* Shaded Upper Bound for Confidence Interval */}
                {showConfidenceBand && metricType === 'royalties' && (
                  <Area
                    type="monotone"
                    dataKey="upperBound"
                    stroke="none"
                    fill="url(#confidenceBandGradient)"
                    name="Upper Bound (90% CI)"
                    connectNulls
                  />
                )}

                {/* Historical Actual Net Curve */}
                <Area
                  type="monotone"
                  dataKey={metricType === 'royalties' ? 'actualNet' : 'actualStreams'}
                  name={metricType === 'royalties' ? 'Actual Net Royalty' : 'Verified Streams'}
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  fill="url(#actualGradient)"
                  dot={{ r: 4, fill: '#06b6d4', stroke: '#070b14', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#38bdf8' }}
                />

                {/* Next Quarter ML Forecast Curve (Dashed line) */}
                <Area
                  type="monotone"
                  dataKey={metricType === 'royalties' ? 'forecastNet' : 'forecastStreams'}
                  name={metricType === 'royalties' ? 'Projected Royalty' : 'Projected Streams'}
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  strokeDasharray="5 5"
                  fill="url(#forecastGradient)"
                  dot={{ r: 4, fill: '#f59e0b', stroke: '#070b14', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#fbbf24' }}
                  connectNulls
                />
              </AreaChart>
            ) : (
              <LineChart
                data={forecastResult.combinedChartData}
                margin={{ top: 15, right: 25, left: 10, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  dy={10}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                />
                <Tooltip content={<ForecastCustomTooltip />} />

                <ReferenceLine
                  x={forecastResult.forecastMonths[0]?.monthLabel + ' (Proj)'}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: 'Forecast Horizon →', fill: '#f59e0b', fontSize: 11, position: 'top' }}
                />

                {/* Upper and Lower Confidence Interval Bounds */}
                {showConfidenceBand && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="upperBound"
                      stroke="#f59e0b"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      dot={false}
                      name="Upper Bound"
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="lowerBound"
                      stroke="#f59e0b"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      dot={false}
                      name="Lower Bound"
                      connectNulls
                    />
                  </>
                )}

                <Line
                  type="monotone"
                  dataKey="actualNet"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#06b6d4' }}
                  name="Actual Net Royalty"
                />

                <Line
                  type="monotone"
                  dataKey="forecastNet"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  strokeDasharray="5 5"
                  dot={{ r: 4, fill: '#f59e0b' }}
                  name="Projected Royalty"
                  connectNulls
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECONDARY INSIGHTS GRID: QUARTER-OVER-QUARTER COMPARISON & PROJECTED DSP SHARES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* QoQ Bar Chart */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400">Quarterly Trajectory</span>
              <h4 className="text-base font-bold text-white font-display mt-0.5">
                Past Quarter vs. Projected Quarter
              </h4>
            </div>
            <span className="text-emerald-400 text-xs font-mono font-semibold">
              +{forecastResult.projectedQoQGrowth}% Projected
            </span>
          </div>

          <div className="h-[230px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={qoqComparisonData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="quarter" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8} />
                <YAxis
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Net Royalty Total']}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
                <Bar dataKey="netRoyalties" radius={[8, 8, 0, 0]}>
                  {qoqComparisonData.map((entry, index) => (
                    <Bar key={`bar-${index}`} fill={entry.color} dataKey="netRoyalties" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Preceding Quarter: <strong className="text-white font-mono">₹{Math.round(forecastResult.previousQuarterNetTotal).toLocaleString('en-IN')}</strong></span>
            <span>Next Quarter: <strong className="text-cyan-400 font-mono">₹{Math.round(forecastResult.projectedQuarterNetTotal).toLocaleString('en-IN')}</strong></span>
          </div>
        </div>

        {/* Projected DSP Share Breakdown */}
        <div className="lg:col-span-6 p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400">DSP Platform Projections</span>
              <h4 className="text-base font-bold text-white font-display mt-0.5">
                Next Quarter Channel Breakdown
              </h4>
            </div>
            <span className="text-xs font-mono text-slate-400">Estimated Splits</span>
          </div>

          <div className="space-y-3 pt-1">
            {platformProjections.map((p) => (
              <div key={p.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
                    <span>{p.name}</span>
                  </span>
                  <div className="font-mono text-right">
                    <span className="text-white font-semibold">₹{Math.round(p.amount).toLocaleString('en-IN')}</span>
                    <span className="text-slate-400 text-[11px] ml-2">({p.percentage}%)</span>
                  </div>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${p.percentage}%`, backgroundColor: p.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 text-[11px] text-slate-400 leading-relaxed">
            Platform shares are dynamically projected using your catalog's historical store ingestion weighting and regional streaming trends across Spotify, Apple Music, and YouTube.
          </div>
        </div>
      </div>

      {/* MONTH-BY-MONTH NEXT QUARTER BREAKDOWN TABLE */}
      <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-mono uppercase text-cyan-400">Granular Horizon Schedule</span>
            <h4 className="text-base font-bold text-white font-display mt-0.5">
              Projected Monthly Settlement Breakdown
            </h4>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Accounting for 60-Day DSP Clearance Pipeline
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <th className="pb-3 font-medium">Forecast Period</th>
                <th className="pb-3 font-medium">Expected Net Royalty</th>
                <th className="pb-3 font-medium">90% Confidence Interval</th>
                <th className="pb-3 font-medium">Projected Streams</th>
                <th className="pb-3 font-medium">Spotify Share</th>
                <th className="pb-3 font-medium">Apple Music</th>
                <th className="pb-3 font-medium">YouTube Music</th>
                <th className="pb-3 font-medium">Estimated Payout Cycle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
              {forecastResult.forecastMonths.map((m, idx) => (
                <tr key={m.month} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3.5 font-sans">
                    <div className="font-semibold text-white">{m.monthLabel}</div>
                    <div className="text-[10px] text-cyan-400 font-mono">Month +{idx + 1} Horizon</div>
                  </td>
                  <td className="py-3.5 font-bold text-cyan-400 text-sm tabular-nums">
                    ₹{m.projectedNetRoyalty.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 text-slate-300 tabular-nums text-[11px]">
                    ₹{Math.round(m.lowerBound).toLocaleString('en-IN')} – ₹{Math.round(m.upperBound).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3.5 text-slate-200 tabular-nums">
                    {m.projectedStreams.toLocaleString('en-IN')} plays
                  </td>
                  <td className="py-3.5 text-emerald-400 tabular-nums">
                    ₹{Math.round(m.spotify).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3.5 text-rose-400 tabular-nums">
                    ₹{Math.round(m.appleMusic).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3.5 text-amber-400 tabular-nums">
                    ₹{Math.round(m.youtubeMusic).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3.5 text-slate-400 text-[11px] font-sans">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{m.projectedPayoutDate}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* METHODOLOGY & MACHINE LEARNING MODEL EXPLAINER */}
      <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800/80 text-xs text-slate-400 space-y-3 leading-relaxed">
        <div className="flex items-center gap-2 text-white font-medium">
          <Info className="w-4 h-4 text-cyan-400" />
          <span>How Rudraatma Music Calculates Your Revenue Projections</span>
        </div>
        <p>
          • <strong>Time-Series Architecture:</strong> Projections use a multi-factor ensemble model combining double exponential smoothing (Holt-Winters) with trend slope tracking and quadratic polynomial curvature to model streaming momentum and listener retention.
        </p>
        <p>
          • <strong>Digital Store Clearance Pipeline:</strong> Global streaming platforms (Spotify, Apple Music, YouTube) report verified royalty statements on a standard 60-to-90-day accounting lag. Your forecasted earnings for upcoming months reflect this staggered clearance cycle.
        </p>
        <p>
          • <strong>Confidence Intervals:</strong> The prediction bounds (Lower – Upper Range) represent standard error intervals calculated from historical residual variance. Factors such as new music releases, playlist placements, and marketing initiatives will adjust your trajectory toward the upper bounds.
        </p>
      </div>
    </div>
  );
};
