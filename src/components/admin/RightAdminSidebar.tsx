import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Disc3,
  IndianRupee,
  Crown,
  Sparkles,
  Globe,
  MessageSquare,
  LayoutTemplate,
  ShieldCheck,
  Activity,
  Settings,
  Shield,
  LogOut,
  ChevronDown,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  X,
  UserCheck,
  Bot
} from 'lucide-react';
import { ADMIN_NAV_CATEGORIES, type AdminTab, type ExecutiveSessionInfo } from './adminTypes';

interface Props {
  activeTab: AdminTab;
  activeSubmenu: string;
  onSelect: (tab: AdminTab, submenuId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  sessionInfo: ExecutiveSessionInfo | null;
  userEmail?: string;
  onOpenSessionPanel: () => void;
  onSignOut: () => void;
}

const ICONS: Record<AdminTab, React.ReactNode> = {
  overview: <LayoutDashboard className="w-4 h-4 shrink-0" />,
  users: <Users className="w-4 h-4 shrink-0" />,
  releases: <Disc3 className="w-4 h-4 shrink-0" />,
  finance: <IndianRupee className="w-4 h-4 shrink-0" />,
  subscriptions: <Crown className="w-4 h-4 shrink-0" />,
  'ai-center': <Sparkles className="w-4 h-4 shrink-0" />,
  'ai-automation': <Bot className="w-4 h-4 shrink-0" />,
  distribution: <Globe className="w-4 h-4 shrink-0" />,
  support: <MessageSquare className="w-4 h-4 shrink-0" />,
  website: <LayoutTemplate className="w-4 h-4 shrink-0" />,
  security: <ShieldCheck className="w-4 h-4 shrink-0" />,
  health: <Activity className="w-4 h-4 shrink-0" />,
  settings: <Settings className="w-4 h-4 shrink-0" />
};

export const RightAdminSidebar: React.FC<Props> = ({
  activeTab,
  activeSubmenu,
  onSelect,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  sessionInfo,
  userEmail,
  onOpenSessionPanel,
  onSignOut
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    overview: true
  });

  const toggleGroup = (tabId: AdminTab, firstSubId: string) => {
    if (collapsed) {
      onSelect(tabId, firstSubId);
      return;
    }
    setExpandedGroups(prev => ({
      ...prev,
      [tabId]: !prev[tabId]
    }));
    if (activeTab !== tabId) {
      onSelect(tabId, firstSubId);
      setExpandedGroups(prev => ({ ...prev, [tabId]: true }));
    }
  };

  const renderSidebarBody = (isDrawer: boolean) => {
    const isMini = collapsed && !isDrawer;
    return (
      <div className="flex flex-col h-full justify-between bg-[#08090d] text-slate-100">
        {/* Header */}
        <div className="p-4 border-b border-[#d4af37]/20 flex items-center justify-between gap-2">
          {!isMini && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#14120b] border border-[#d4af37]/50 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-[#d4af37]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-wider text-[#f0cf65] uppercase truncate">
                  RUDRAATMA Music
                </p>
                <p className="text-[10px] font-mono text-slate-400 truncate">
                  Distribution · Devotion · Beyond
                </p>
              </div>
            </div>
          )}

          {isDrawer ? (
            <button
              onClick={onCloseMobile}
              className="p-2 rounded-lg bg-[#121318] border border-slate-800 text-slate-300 hover:text-white transition-colors"
              aria-label="Close navigation drawer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded-lg bg-[#121318] border border-slate-800 hover:border-[#d4af37]/50 text-[#f0cf65] mx-auto transition-colors"
              title={isMini ? 'Expand Navigation' : 'Collapse Navigation'}
              aria-label={isMini ? 'Expand Navigation' : 'Collapse Navigation'}
            >
              {isMini ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* 12-Module Nav Tree */}
        <nav className="flex-1 overflow-y-auto p-2.5 space-y-1">
          {ADMIN_NAV_CATEGORIES.map(cat => {
            const isTabActive = activeTab === cat.id;
            const isExpanded = Boolean(expandedGroups[cat.id] || isTabActive);

            return (
              <div key={cat.id} className="space-y-0.5">
                <button
                  onClick={() => toggleGroup(cat.id, cat.submenus[0].id)}
                  title={cat.label}
                  className={`w-full min-h-[40px] flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-colors duration-150 ${
                    isTabActive
                      ? 'bg-[#d4af37]/15 text-[#f0cf65] border border-[#d4af37]/40'
                      : 'text-slate-300 hover:text-white hover:bg-[#121318] border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className={isTabActive ? 'text-[#d4af37]' : 'text-slate-400'}>
                      {ICONS[cat.id]}
                    </span>
                    {!isMini && <span className="truncate">{cat.label}</span>}
                  </span>
                  {!isMini &&
                    (isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    ))}
                </button>

                {!isMini && isExpanded && (
                  <div className="pl-6 pr-1 py-1 space-y-0.5">
                    {cat.submenus.map(sub => {
                      const isSubActive = isTabActive && activeSubmenu === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => {
                            onSelect(cat.id, sub.id);
                            if (isDrawer) onCloseMobile();
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-colors duration-150 flex items-center justify-between ${
                            isSubActive
                              ? 'bg-[#d4af37]/10 text-[#f0cf65] font-semibold border border-[#d4af37]/30'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.03] border border-transparent'
                          }`}
                        >
                          <span className="truncate">{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Executive Session Panel Footer */}
        <div className="p-3 border-t border-[#d4af37]/20 space-y-2.5 bg-[#050507]">
          {!isMini ? (
            <>
              <button
                onClick={() => {
                  onOpenSessionPanel();
                  if (isDrawer) onCloseMobile();
                }}
                className="w-full text-left p-2.5 rounded-xl bg-[#0b0c10] border border-slate-800 hover:border-[#d4af37]/40 transition-colors space-y-1"
              >
                <div className="flex items-center justify-between text-[10px] font-mono text-[#d4af37]">
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <UserCheck className="w-3 h-3" /> EXECUTIVE SESSION
                  </span>
                  <span className="text-emerald-400">VERIFIED</span>
                </div>
                <p className="text-[11px] text-white font-mono truncate">
                  {sessionInfo?.email || userEmail || 'SUPER_ADMIN'}
                </p>
                <p className="text-[10px] text-slate-500 font-mono truncate">
                  Role: {sessionInfo?.role || 'SUPER_ADMIN'} · Account & Settings
                </p>
              </button>
              <button
                onClick={onSignOut}
                className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-[#121318] hover:bg-red-950/50 border border-slate-800 hover:border-red-700/50 text-xs text-slate-300 hover:text-red-200 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={onOpenSessionPanel}
                title="Executive Session Panel"
                className="p-2 rounded-lg bg-[#0b0c10] border border-slate-800 text-[#d4af37]"
              >
                <UserCheck className="w-4 h-4" />
              </button>
              <button
                onClick={onSignOut}
                title="Sign Out"
                className="p-2 rounded-lg bg-[#121318] border border-slate-800 text-slate-400 hover:text-red-300"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Right-Side Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-l border-[#d4af37]/20 sticky top-0 h-screen transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-72'
        }`}
      >
        {renderSidebarBody(false)}
      </aside>

      {/* Mobile Right Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end bg-black/80">
          <div className="w-80 max-w-[85vw] h-full border-l border-[#d4af37]/30 shadow-2xl">
            {renderSidebarBody(true)}
          </div>
        </div>
      )}
    </>
  );
};
