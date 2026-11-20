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

  const sourceLabel = isError
    ? 'PostgreSQL Unavailable'
    : isLivePg
      ? 'PostgreSQL Live'
      : integrity?.dataSource === 'in-memory-fallback'
        ? 'In-Memory Store'
        : integrity?.dataSource || 'Checking';

  const statusLabel = isError
    ? 'Disconnected'
    : isLivePg
      ? 'Connected'
      : 'Local Fallback';

  return (
    <div className="space-y-3">
      <div
        className={`px-4 py-3 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm ${
          isError
            ? 'bg-red-950/35 border-red-500/35 text-red-200'
            : 'bg-[#111319] border-white/[0.08] text-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
          <span className="inline-flex items-center gap-2 font-semibold text-white">
            <Database className={`w-4 h-4 shrink-0 ${isError ? 'text-red-400' : 'text-[#d4af37]'}`} />
            <span>
              {isError
                ? 'Database Connection Error'
                : isLivePg
                  ? 'Live PostgreSQL Database'
                  : 'Development Store'}
            </span>
          </span>

          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
              isError
                ? 'bg-red-500/15 text-red-300'
                : isLivePg
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-amber-500/15 text-amber-300'
            }`}
          >
            {statusLabel}
            {typeof integrity?.latencyMs === 'number' && !isError ? ` · ${integrity.latencyMs}ms` : ''}
          </span>

          <span className="text-slate-400 hidden sm:inline">
            Source: <span className="text-slate-200">{sourceLabel}</span>
          </span>

          <span className="text-slate-400 tabular-nums">
            Last updated:{' '}
            <span className="text-slate-200">
              {integrity?.lastSyncedAt
                ? new Date(integrity.lastSyncedAt).toLocaleTimeString()
                : '—'}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pendingApprovalsCount > 0 && (
            <button
              onClick={onOpenApprovals}
              className="h-8 px-3 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#d4af37]/25 transition-colors whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {pendingApprovalsCount} Pending Approval{pendingApprovalsCount > 1 ? 's' : ''}
            </button>
          )}

          <button
            onClick={onToggleIncludeTest}
            title="Toggle visibility of demo/sandbox accounts and test orders"
            className={`h-8 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              includeTest
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                : 'bg-[#0b0c11] border-white/[0.08] text-slate-300 hover:border-[#d4af37]/40 hover:text-white'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5 text-[#d4af37]" />
            {includeTest
              ? 'Showing All Records (incl. Test)'
              : `Production Only (${totalExcluded} test hidden)`}
          </button>
        </div>
      </div>

      {isError && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/40 flex items-start gap-3 text-xs text-red-100">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-200">
              Database Query Unavailable
            </p>
            <p className="text-red-300/90 mt-0.5">
              {errorMessage ||
                'Analytics and totals are withheld because the database query failed. Live records are never fabricated.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
