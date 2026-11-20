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
      <div className="flex flex-col h-full justify-between bg-[#0b0c11] text-slate-100">
        {/* Sidebar Header */}
        <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-2">
          {!isMini && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/40 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-[#d4af37]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  Rudraatma Music
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  Admin Workspace
                </p>
              </div>
            </div>
          )}

          {isDrawer ? (
            <button
              onClick={onCloseMobile}
              className="p-2 rounded-xl bg-[#13151d] border border-white/[0.08] text-slate-300 hover:text-white transition-colors"
              aria-label="Close navigation drawer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded-xl bg-[#13151d] border border-white/[0.08] hover:border-[#d4af37]/50 text-[#f0cf65] mx-auto transition-colors"
              title={isMini ? 'Expand Navigation' : 'Collapse Navigation'}
              aria-label={isMini ? 'Expand Navigation' : 'Collapse Navigation'}
            >
              {isMini ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Navigation Modules */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {ADMIN_NAV_CATEGORIES.map(cat => {
            const isTabActive = activeTab === cat.id;
            const isExpanded = Boolean(expandedGroups[cat.id] || isTabActive);

            return (
              <div key={cat.id} className="space-y-0.5">
                <button
                  onClick={() => toggleGroup(cat.id, cat.submenus[0].id)}
                  title={cat.label}
                  className={`w-full min-h-[40px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors duration-150 ${
                    isTabActive
                      ? 'bg-[#d4af37]/15 text-[#f0cf65] border border-[#d4af37]/35'
                      : 'text-slate-300 hover:text-white hover:bg-white/[0.04] border border-transparent'
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
                  <div className="pl-7 pr-1 py-1 space-y-0.5">
                    {cat.submenus.map(sub => {
                      const isSubActive = isTabActive && activeSubmenu === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => {
                            onSelect(cat.id, sub.id);
                            if (isDrawer) onCloseMobile();
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors duration-150 flex items-center justify-between ${
                            isSubActive
                              ? 'bg-[#d4af37]/10 text-[#f0cf65] font-semibold'
                              : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.03]'
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

        {/* Session Footer */}
        <div className="p-3 border-t border-white/[0.08] space-y-2.5 bg-[#090a0e]">
          {!isMini ? (
            <>
              <button
                onClick={() => {
                  onOpenSessionPanel();
                  if (isDrawer) onCloseMobile();
                }}
                className="w-full text-left p-3 rounded-xl bg-[#111319] border border-white/[0.08] hover:border-[#d4af37]/40 transition-colors space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#d4af37]">
                    <UserCheck className="w-3.5 h-3.5" /> Executive Session
                  </span>
                  <span className="text-[11px] font-medium text-emerald-400">Verified</span>
                </div>
                <p className="text-xs font-medium text-white truncate">
                  {sessionInfo?.email || userEmail || 'Super Admin'}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  Super Admin · Account & Security
                </p>
              </button>
              <button
                onClick={onSignOut}
                className="w-full h-10 px-3 rounded-xl bg-[#13151d] hover:bg-red-950/60 border border-white/[0.08] hover:border-red-500/40 text-xs font-medium text-slate-300 hover:text-red-200 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
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
                className="p-2.5 rounded-xl bg-[#111319] border border-white/[0.08] text-[#d4af37]"
              >
                <UserCheck className="w-4 h-4" />
              </button>
              <button
                onClick={onSignOut}
                title="Sign Out"
                className="p-2.5 rounded-xl bg-[#13151d] border border-white/[0.08] text-slate-400 hover:text-red-300"
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
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-l border-white/[0.08] sticky top-0 h-screen transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-72'
        }`}
      >
        {renderSidebarBody(false)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex justify-end bg-black/75 backdrop-blur-xs">
          <div className="w-80 max-w-[85vw] h-full border-l border-white/[0.1] shadow-2xl">
            {renderSidebarBody(true)}
          </div>
        </div>
      )}
    </>
  );
};
