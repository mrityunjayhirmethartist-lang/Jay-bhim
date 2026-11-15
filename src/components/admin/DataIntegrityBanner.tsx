import React from 'react';
import { Database, AlertTriangle, ShieldCheck, FlaskConical } from 'lucide-react';
import type { DataIntegrityMeta } from './adminTypes';

interface Props {
  integrity: DataIntegrityMeta | null;
  dataUnavailable: boolean;
  errorMessage?: string | null;
  includeTest: boolean;
  onToggleIncludeTest: () => void;
  pendingApprovalsCount: number;
  onOpenApprovals: () => void;
}

export const DataIntegrityBanner: React.FC<Props> = ({
  integrity,
  dataUnavailable,
  errorMessage,
  includeTest,
  onToggleIncludeTest,
  pendingApprovalsCount,
  onOpenApprovals
}) => {
  const isLivePg = integrity?.dataSource === 'postgresql-live';
  const isError = dataUnavailable || integrity?.connectionStatus === 'error';
  const excluded = integrity?.excludedTestCounts;
  const totalExcluded =
    (excluded?.users || 0) + (excluded?.releases || 0) + (excluded?.orders || 0);

  return (
    <div className="space-y-3">
      <div
        className={`px-4 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
          isError
            ? 'bg-red-950/40 border-red-700/50 text-red-200'
            : isLivePg
              ? 'bg-[#0b0c10] border-[#d4af37]/30 text-slate-200'
              : 'bg-[#0b0c10] border-amber-700/40 text-amber-100'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#f0cf65]">
            <Database className="w-3.5 h-3.5 text-[#d4af37]" />
            {isError
              ? 'Database Connection Error'
              : isLivePg
                ? 'Live PostgreSQL Database'
                : 'In-Memory Dev Fallback'}
          </span>
          <span className="text-slate-600 hidden sm:inline">·</span>
          <span className="font-mono text-[11px] text-slate-300">
            Status: {isError ? 'UNAVAILABLE' : isLivePg ? 'CONNECTED' : 'LOCAL_FALLBACK'}
            {typeof integrity?.latencyMs === 'number' && !isError ? ` (${integrity.latencyMs}ms)` : ''}
          </span>
          <span className="text-slate-600 hidden sm:inline">·</span>
          <span className="font-mono text-[11px] text-slate-400">
            Source: {integrity?.dataSource || 'Checking...'}
          </span>
          <span className="text-slate-600 hidden sm:inline">·</span>
          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
            Last Updated:{' '}
            {integrity?.lastSyncedAt
              ? new Date(integrity.lastSyncedAt).toLocaleTimeString()
              : '—'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pendingApprovalsCount > 0 && (
            <button
              onClick={onOpenApprovals}
              className="px-2.5 py-1 rounded-lg bg-[#d4af37]/20 border border-[#d4af37]/50 text-[#f0cf65] text-[11px] font-semibold inline-flex items-center gap-1.5 hover:bg-[#d4af37]/30 whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {pendingApprovalsCount} Pending Owner Approval{pendingApprovalsCount > 1 ? 's' : ''}
            </button>
          )}

          <button
            onClick={onToggleIncludeTest}
            title="Toggle visibility of demo/sandbox accounts and test orders"
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono inline-flex items-center gap-1.5 whitespace-nowrap transition ${
              includeTest
                ? 'bg-amber-950/60 border-amber-600/60 text-amber-200'
                : 'bg-[#050507] border-slate-800 text-slate-300 hover:border-[#d4af37]/40'
            }`}
          >
            <FlaskConical className="w-3 h-3 text-[#d4af37]" />
            {includeTest
              ? 'Showing Prod + Test/Demo'
              : `Production Only (${totalExcluded} test hidden)`}
          </button>
        </div>
      </div>

      {isError && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-600/50 flex items-start gap-3 text-xs text-red-100">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-200">
              Data Unavailable — Live Database Query Failed
            </p>
            <p className="text-red-300/90 mt-0.5">
              {errorMessage ||
                'Analytics and totals are withheld because the database query failed. Zeroes are never substituted for unreachable database records.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
