import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  Bell,
  RefreshCw,
  UserCheck,
  Settings,
  LogOut,
  Menu,
  X,
  ArrowRight,
  Users,
  Disc3,
  CreditCard,
  MessageSquare,
  Compass
} from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { apiUrl } from '../../utils/api';
import type { AdminTab, ExecutiveSessionInfo } from './adminTypes';

interface SearchResults {
  users: Array<{ id: string; fullName: string; email: string; accountStatus: string; kycStatus: string }>;
  releases: Array<{ id: string; title: string; artist: string; status: string; upc: string }>;
  orders: Array<{ orderId: string; paymentId: string; userEmail: string; planName: string; amount: number; status: string }>;
  tickets: Array<{ id: string; subject: string; userEmail: string; status: string; sourceType: string }>;
  actions: Array<{ id: string; label: string; tab: string; submenu: string }>;
}

interface AdminNotificationItem {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  title: string;
  detail: string;
  tab: string;
  submenu?: string;
  timestamp: string;
}

interface AdminTopNavProps {
  token: string | null;
  includeTest: boolean;
  loading: boolean;
  categoryLabel: string;
  submenuLabel: string;
  sessionInfo: ExecutiveSessionInfo | null;
  userEmail?: string;
  onRefreshAll: () => void;
  onNavigateTab: (tab: AdminTab, submenuId: string) => void;
  onInspectUserById: (userId: string) => void;
  onInspectReleaseById: (releaseId: string) => void;
  onOpenSessionModal: () => void;
  onOpenMobileDrawer: () => void;
  onSignOut: () => void;
}

export const AdminTopNav: React.FC<AdminTopNavProps> = ({
  token,
  includeTest,
  loading,
  categoryLabel,
  submenuLabel,
  sessionInfo,
  userEmail,
  onRefreshAll,
  onNavigateTab,
  onInspectUserById,
  onInspectReleaseById,
  onOpenSessionModal,
  onOpenMobileDrawer,
  onSignOut
}) => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);

  const searchRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const fetchNotifications = async () => {
    if (!token) return;
    setNotifLoading(true);
    try {
      const res = await fetch(apiUrl('/api/super-admin/notifications'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.items || []);
      }
    } catch {
      // Ignore transient network errors
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [token]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!token || trimmed.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          apiUrl(`/api/super-admin/search?q=${encodeURIComponent(trimmed)}&includeTest=${includeTest}`),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setSearchOpen(true);
        }
      } catch {
        // Ignore transient search error
      } finally {
        setSearching(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query, token, includeTest]);

  const totalMatches = results
    ? results.users.length +
      results.releases.length +
      results.orders.length +
      results.tickets.length +
      results.actions.length
    : 0;

  return (
    <header className="sticky top-0 z-30 bg-[#0b0c11]/95 backdrop-blur-md border-b border-white/[0.08] px-4 sm:px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Brand Identity & Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogo size="sm" showSubtitle={false} />
          <div className="min-w-0 hidden sm:block border-l border-white/[0.08] pl-3">
            <p className="text-[11px] font-medium text-[#d4af37] truncate">
              Super Admin Console
            </p>
            <p className="text-xs text-slate-400 truncate">
              {categoryLabel} <span className="text-slate-600 mx-1">/</span>
              <span className="text-white font-medium">{submenuLabel}</span>
            </p>
          </div>
        </div>

        {/* Global Search */}
        <div ref={searchRef} className="relative flex-1 min-w-[200px] max-w-md order-3 lg:order-2 w-full lg:w-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onFocus={() => {
              if (query.trim().length >= 2 && results) setSearchOpen(true);
            }}
            onChange={e => {
              setQuery(e.target.value);
              if (e.target.value.trim().length >= 2) setSearchOpen(true);
            }}
            placeholder="Search users, releases, orders, tickets..."
            className="w-full h-10 pl-10 pr-9 rounded-xl bg-[#13151d] border border-white/[0.08] focus:border-[#d4af37]/60 focus:outline-none text-sm text-white placeholder:text-slate-500 transition-colors"
            aria-label="Global Super Admin Search"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setResults(null);
                setSearchOpen(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {searchOpen && query.trim().length >= 2 && (
            <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-[#13151d] border border-white/[0.1] shadow-2xl max-h-96 overflow-y-auto z-50 divide-y divide-white/[0.06] text-xs">
              {searching && (
                <div className="p-4 text-center text-slate-400">
                  Searching records...
                </div>
              )}

              {!searching && results && totalMatches === 0 && (
                <div className="p-4 text-center text-slate-500">
                  No matching records found for &ldquo;{query}&rdquo;.
                </div>
              )}

              {!searching && results && results.actions.length > 0 && (
                <div className="p-2">
                  <p className="px-2.5 py-1 text-[11px] font-semibold text-[#d4af37]">
                    Modules
                  </p>
                  {results.actions.map(act => (
                    <button
                      key={act.id}
                      onClick={() => {
                        onNavigateTab(act.tab as AdminTab, act.submenu);
                        setSearchOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/[0.05] flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2 text-slate-200 truncate">
                        <Compass className="w-3.5 h-3.5 text-[#d4af37] shrink-0" />
                        <span className="truncate">{act.label}</span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {!searching && results && results.users.length > 0 && (
                <div className="p-2">
                  <p className="px-2.5 py-1 text-[11px] font-semibold text-[#d4af37]">
                    Users ({results.users.length})
                  </p>
                  {results.users.map(u => (
                    <button
                      key={u.id}
                      onClick={() => {
                        onInspectUserById(u.id);
                        setSearchOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/[0.05] flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate text-white font-medium">{u.fullName}</span>
                        <span className="truncate text-slate-400">{u.email}</span>
                      </span>
                      <span className="text-[11px] font-medium text-[#f0cf65] shrink-0">{u.kycStatus}</span>
                    </button>
                  ))}
                </div>
              )}

              {!searching && results && results.releases.length > 0 && (
                <div className="p-2">
                  <p className="px-2.5 py-1 text-[11px] font-semibold text-[#d4af37]">
                    Releases ({results.releases.length})
                  </p>
                  {results.releases.map(r => (
                    <button
                      key={r.id}
                      onClick={() => {
                        onInspectReleaseById(r.id);
                        setSearchOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/[0.05] flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Disc3 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate text-white font-medium">{r.title}</span>
                        <span className="truncate text-slate-400">{r.artist}</span>
                      </span>
                      <span className="text-[11px] font-medium text-[#f0cf65] shrink-0">{r.status}</span>
                    </button>
                  ))}
                </div>
              )}

              {!searching && results && results.orders.length > 0 && (
                <div className="p-2">
                  <p className="px-2.5 py-1 text-[11px] font-semibold text-[#d4af37]">
                    Transactions ({results.orders.length})
                  </p>
                  {results.orders.map(o => (
                    <button
                      key={o.orderId}
                      onClick={() => {
                        onNavigateTab('finance', 'transactions');
                        setSearchOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/[0.05] flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate text-white font-medium tabular-nums">{o.orderId}</span>
                        <span className="truncate text-slate-400">{o.userEmail}</span>
                      </span>
                      <span className="text-[11px] font-medium text-[#f0cf65] tabular-nums shrink-0">
                        ₹{o.amount} · {o.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {!searching && results && results.tickets.length > 0 && (
                <div className="p-2">
                  <p className="px-2.5 py-1 text-[11px] font-semibold text-[#d4af37]">
                    Support Tickets ({results.tickets.length})
                  </p>
                  {results.tickets.map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        onNavigateTab('support', 'open-tickets');
                        setSearchOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/[0.05] flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate text-white">{t.subject}</span>
                        <span className="truncate text-slate-400">{t.userEmail}</span>
                      </span>
                      <span className="text-[11px] font-medium text-[#f0cf65] shrink-0">{t.status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions & Session */}
        <div className="flex items-center gap-2 shrink-0 order-2 lg:order-3">
          {/* Alerts Popover */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => {
                setNotifOpen(v => !v);
                if (!notifOpen) fetchNotifications();
              }}
              className="h-10 px-3 rounded-xl bg-[#13151d] border border-white/[0.08] hover:border-[#d4af37]/50 text-slate-200 inline-flex items-center gap-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              aria-label="Open Notification Centre"
            >
              <Bell className="w-4 h-4 text-[#d4af37]" />
              <span className="tabular-nums text-xs font-semibold text-[#f0cf65]">
                {notifications.length}
              </span>
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-[#13151d] border border-white/[0.1] shadow-2xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Operational Alerts</p>
                    <p className="text-xs text-slate-400">Live system, compliance & finance queues</p>
                  </div>
                  <button
                    onClick={fetchNotifications}
                    className="p-1.5 rounded-lg bg-[#0b0c11] border border-white/[0.08] text-slate-400 hover:text-white transition-colors"
                    title="Refresh Alerts"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${notifLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.06]">
                  {notifications.length === 0 ? (
                    <p className="p-5 text-center text-xs text-slate-500">
                      No pending alerts in operational queues.
                    </p>
                  ) : (
                    notifications.map(n => (
                      <button
                        key={n.id}
                        onClick={() => {
                          onNavigateTab(n.tab as AdminTab, n.submenu || 'executive-overview');
                          setNotifOpen(false);
                        }}
                        className="w-full text-left p-3.5 hover:bg-white/[0.04] transition-colors space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white truncate">{n.title}</span>
                          <span
                            className={`text-[11px] font-medium capitalize shrink-0 ${
                              n.severity === 'critical'
                                ? 'text-red-400'
                                : n.severity === 'high'
                                  ? 'text-amber-300'
                                  : 'text-[#f0cf65]'
                            }`}
                          >
                            {n.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2">{n.detail}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              onRefreshAll();
              fetchNotifications();
            }}
            className="h-10 px-3.5 rounded-xl bg-[#13151d] border border-white/[0.08] hover:border-[#d4af37]/50 text-xs font-medium text-slate-200 hover:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#d4af37] ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden xl:inline">Refresh</span>
          </button>

          <button
            onClick={onOpenSessionModal}
            className="h-10 px-3.5 rounded-xl bg-[#13151d] border border-white/[0.08] hover:border-[#d4af37]/50 text-xs font-medium text-slate-200 inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            title="Super Admin Identity & Session"
          >
            <UserCheck className="w-4 h-4 text-[#d4af37]" />
            <span className="hidden md:inline max-w-[150px] truncate">
              {sessionInfo?.email || userEmail || 'Super Admin'}
            </span>
          </button>

          <button
            onClick={() => onNavigateTab('settings', 'general-settings')}
            className="hidden sm:inline-flex h-10 w-10 justify-center rounded-xl bg-[#13151d] border border-white/[0.08] hover:border-[#d4af37]/50 text-slate-300 hover:text-white items-center transition-colors shrink-0"
            title="Account & Platform Settings"
            aria-label="Account & Platform Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={onSignOut}
            className="hidden sm:inline-flex h-10 px-3.5 rounded-xl bg-[#13151d] hover:bg-red-950/60 border border-white/[0.08] hover:border-red-500/40 text-xs font-medium text-slate-300 hover:text-red-200 items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Sign Out</span>
          </button>

          <button
            onClick={onOpenMobileDrawer}
            className="lg:hidden h-10 px-3.5 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap shrink-0"
            aria-label="Open Navigation Drawer"
          >
            <Menu className="w-4 h-4" /> Menu
          </button>
        </div>
      </div>
    </header>
  );
};
