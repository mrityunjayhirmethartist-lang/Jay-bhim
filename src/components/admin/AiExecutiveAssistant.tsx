import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Minimize2,
  Maximize2,
  Send,
  Trash2,
  ShieldAlert,
  Sparkles,
  ChevronUp,
  ArrowRight
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import type { AdminTab, OwnerApprovalProposalInput } from './adminTypes';

const RUDRA_DISPLAY_NAME = 'Rudra AI';
const RUDRA_SUBTITLE = 'Intelligent Music Distribution Assistant';
const RUDRA_LOGO_SRC = '/assets/aistudio/file_00000000ae888210a9a69884425ffe03_0a3d75a3.png';

const RUDRA_WELCOME_MESSAGE =
  'Namaste! Main Rudra hoon. Aapka Intelligent Music Distribution Assistant. Main aapko music distribution, releases, royalties, analytics aur platform management mein help karunga.';

const LEGACY_GREETING_PREFIX = 'Namaste! Welcome back to Rudraatma Command Center.';

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
  aiStatus?: string;
  model?: string;
  suggestedActions?: Array<{
    title: string;
    actionType?: string;
    targetId?: string;
    severity?: string;
    explanation?: string;
  }>;
}

interface Props {
  token: string | null;
  activeTab: AdminTab;
  activeSubmenu: string;
  onTriggerApproval: (proposal: OwnerApprovalProposalInput) => void;
  onNavigateTab: (tab: AdminTab, submenuId: string) => void;
}

const RudraLogoAvatar: React.FC<{
  sizeClass?: string;
  shapeClass?: string;
  logoFailed: boolean;
  onError: () => void;
}> = ({ sizeClass = 'w-9 h-9', shapeClass = 'rounded-full', logoFailed, onError }) => {
  if (logoFailed) {
    return (
      <div
        className={`${sizeClass} ${shapeClass} bg-gradient-to-br from-[#1b160a] to-[#0b0c10] border border-[#d4af37]/60 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(212,175,55,0.22)]`}
        aria-label="Rudra AI"
      >
        <Sparkles className="w-4 h-4 text-[#f0cf65]" />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} ${shapeClass} relative overflow-hidden border border-[#d4af37]/60 bg-[#0b0c10] shrink-0 shadow-[0_0_14px_rgba(212,175,55,0.22)]`}
    >
      <img
        src={RUDRA_LOGO_SRC}
        alt="Rudra AI Logo"
        referrerPolicy="no-referrer"
        onError={onError}
        className="w-full h-full object-cover object-[50%_24%]"
      />
    </div>
  );
};

export const AiExecutiveAssistant: React.FC<Props> = ({
  token,
  activeTab,
  activeSubmenu,
  onTriggerApproval,
  onNavigateTab
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [hasUnreadWelcome, setHasUnreadWelcome] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Initialize once per authenticated session
  useEffect(() => {
    if (!token) return;
    const sessionKey = `rudraatma_sa_ai_session_${token.slice(0, 14)}`;
    const storedHistoryKey = `rudraatma_sa_ai_msgs_${token.slice(0, 14)}`;
    const alreadyGreeted = sessionStorage.getItem(sessionKey);

    try {
      const saved = sessionStorage.getItem(storedHistoryKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (
            parsed.length === 1 &&
            parsed[0]?.role === 'assistant' &&
            typeof parsed[0]?.content === 'string' &&
            parsed[0].content.startsWith(LEGACY_GREETING_PREFIX)
          ) {
            setMessages([
              {
                ...parsed[0],
                content: RUDRA_WELCOME_MESSAGE
              }
            ]);
            return;
          }
          setMessages(parsed);
          return;
        }
      }
    } catch {
      // Ignore storage parse failure
    }

    if (!alreadyGreeted) {
      sessionStorage.setItem(sessionKey, '1');
      const welcomeMsg: ChatMessage = {
        id: 'welcome_' + Date.now(),
        role: 'assistant',
        content: RUDRA_WELCOME_MESSAGE,
        timestamp: new Date().toISOString()
      };
      setMessages([welcomeMsg]);
      setHasUnreadWelcome(true);
    }
  }, [token]);

  // Persist messages cleanly within the active session across navigation
  useEffect(() => {
    if (!token || messages.length === 0) return;
    try {
      sessionStorage.setItem(
        `rudraatma_sa_ai_msgs_${token.slice(0, 14)}`,
        JSON.stringify(messages.slice(-40))
      );
    } catch {
      // Ignore quota errors
    }
  }, [messages, token]);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const sendMessage = async (textOverride?: string) => {
    const query = (textOverride ?? input).trim();
    if (!query || !token || sending) return;

    const userMsg: ChatMessage = {
      id: 'u_' + Date.now(),
      role: 'user',
      content: query,
      timestamp: new Date().toISOString()
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    if (!textOverride) setInput('');
    setSending(true);

    try {
      const res = await fetch(apiUrl('/api/super-admin/ai-assistant/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: query,
          activeTab,
          activeSubmenu,
          history: nextMessages.slice(-6).map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rudra AI request failed.');

      const botMsg: ChatMessage = {
        id: 'a_' + Date.now(),
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toISOString(),
        aiStatus: data.aiStatus,
        model: data.model,
        suggestedActions: data.suggestedActions || []
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: 'err_' + Date.now(),
          role: 'assistant',
          content: `Unable to reach Rudra AI backend engine: ${err.message}`,
          timestamp: new Date().toISOString(),
          aiStatus: 'UNAVAILABLE'
        }
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome_reset_' + Date.now(),
        role: 'assistant',
        content: RUDRA_WELCOME_MESSAGE,
        timestamp: new Date().toISOString()
      }
    ]);
  };

  const quickPrompts = [
    'Summarize current platform status & blockers',
    'What are my top recommended next steps?',
    'Check Email OTP, Database & Payment gateway health',
    'List pending KYC & Release review priorities'
  ];

  const hasUserMessages = messages.some(m => m.role === 'user');

  // Collapsed Floating Launcher
  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 flex flex-col items-end gap-2">
        {hasUnreadWelcome && (
          <div className="max-w-[290px] sm:max-w-xs p-3 rounded-xl bg-[#0b0c10] border border-[#d4af37]/45 shadow-[0_14px_38px_rgba(0,0,0,0.75)] text-[11px] text-slate-200">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <RudraLogoAvatar
                  sizeClass="w-6 h-6"
                  shapeClass="rounded-full"
                  logoFailed={logoFailed}
                  onError={() => setLogoFailed(true)}
                />
                <span className="font-semibold text-[#f0cf65] truncate">{RUDRA_DISPLAY_NAME}</span>
              </div>
              <button
                onClick={() => setHasUnreadWelcome(false)}
                className="text-slate-500 hover:text-white shrink-0 p-0.5"
                aria-label="Dismiss welcome hint"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-slate-300 mt-1.5 line-clamp-2 leading-relaxed">
              {RUDRA_WELCOME_MESSAGE}
            </p>
          </div>
        )}
        <button
          onClick={() => {
            setIsOpen(true);
            setHasUnreadWelcome(false);
          }}
          className="px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-[#17130a] via-[#0e0f14] to-[#0b0c10] border border-[#d4af37]/65 hover:border-[#f0cf65] text-[#f0cf65] shadow-[0_10px_32px_rgba(0,0,0,0.75),0_0_20px_rgba(212,175,55,0.16)] flex items-center gap-2.5 text-xs font-semibold transition"
        >
          <RudraLogoAvatar
            sizeClass="w-8 h-8"
            shapeClass="rounded-full"
            logoFailed={logoFailed}
            onError={() => setLogoFailed(true)}
          />
          <div className="text-left leading-tight">
            <span className="block text-xs font-bold text-[#f0cf65]">{RUDRA_DISPLAY_NAME}</span>
            <span className="hidden sm:block text-[10px] font-normal text-slate-400">
              {RUDRA_SUBTITLE}
            </span>
          </div>
          <ChevronUp className="w-3.5 h-3.5 text-[#d4af37] ml-0.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed z-50 flex flex-col bg-[#08090d] border border-[#d4af37]/50 shadow-[0_20px_60px_rgba(0,0,0,0.85),0_0_32px_rgba(212,175,55,0.14)] overflow-hidden transition-all ${
        isMaximized
          ? 'inset-3 sm:inset-8 rounded-2xl'
          : 'bottom-3 right-3 left-3 sm:left-auto sm:bottom-5 sm:right-5 sm:w-[440px] h-[590px] max-h-[85vh] rounded-2xl'
      }`}
    >
      {/* Header */}
      <div className="relative px-4 py-3 bg-gradient-to-r from-[#110f0a] via-[#0b0c10] to-[#0b0c10] border-b border-[#d4af37]/30 flex items-center justify-between gap-2">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(circle at 12% 50%, rgba(212, 175, 55, 0.2), transparent 55%)'
          }}
        />
        <div className="relative flex items-center gap-3 min-w-0">
          <RudraLogoAvatar
            sizeClass="w-10 h-10"
            shapeClass="rounded-xl"
            logoFailed={logoFailed}
            onError={() => setLogoFailed(true)}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-bold text-[#f0cf65] tracking-tight truncate">
                {RUDRA_DISPLAY_NAME}
              </p>
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300/90 shrink-0">
                · Ready
              </span>
            </div>
            <p className="text-[11px] text-slate-300 truncate">{RUDRA_SUBTITLE}</p>
          </div>
        </div>

        <div className="relative flex items-center gap-1 shrink-0">
          <button
            onClick={handleClear}
            title="Start Fresh Conversation"
            aria-label="Clear Conversation"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsMaximized(v => !v)}
            title={isMaximized ? 'Restore Size' : 'Maximize'}
            aria-label={isMaximized ? 'Restore Size' : 'Maximize'}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            title="Minimize Rudra AI"
            aria-label="Minimize Rudra AI"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Strict Governance Notice */}
      <div className="px-4 py-1.5 bg-[#050507] border-b border-slate-800/80 flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
        <span className="flex items-center gap-1.5 truncate">
          <ShieldAlert className="w-3 h-3 text-[#d4af37] shrink-0" />
          <span className="truncate">Advisory Only · Owner Approval required for mutations</span>
        </span>
        <span className="hidden sm:inline text-slate-500 shrink-0">
          {activeTab}/{activeSubmenu}
        </span>
      </div>

      {/* Messages & Welcome Showcase */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#050507]">
        {/* Welcome Screen Hero Card (prominent when conversation is fresh) */}
        {!hasUserMessages && (
          <div className="rounded-2xl bg-gradient-to-b from-[#110f0a] to-[#0b0c10] border border-[#d4af37]/35 overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.6),0_0_24px_rgba(212,175,55,0.08)]">
            {!logoFailed ? (
              <div className="relative h-32 sm:h-36 w-full bg-[#050507] overflow-hidden border-b border-[#d4af37]/25">
                <img
                  src={RUDRA_LOGO_SRC}
                  alt="Rudra AI — Intelligent Music Distribution Assistant"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoFailed(true)}
                  className="w-full h-full object-cover object-center"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0b0c10] to-transparent" />
              </div>
            ) : (
              <div className="px-4 pt-4 pb-1 flex items-center gap-3">
                <RudraLogoAvatar
                  sizeClass="w-11 h-11"
                  shapeClass="rounded-xl"
                  logoFailed={logoFailed}
                  onError={() => setLogoFailed(true)}
                />
                <div>
                  <p className="text-sm font-bold text-[#f0cf65]">{RUDRA_DISPLAY_NAME}</p>
                  <p className="text-[11px] text-slate-400">{RUDRA_SUBTITLE}</p>
                </div>
              </div>
            )}

            <div className="p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#f0cf65]">{RUDRA_DISPLAY_NAME}</h3>
                  <p className="text-[11px] text-slate-400">{RUDRA_SUBTITLE}</p>
                </div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#d4af37]">
                  Rudraatma 2.0
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-200 border-t border-slate-800/90 pt-2">
                {RUDRA_WELCOME_MESSAGE}
              </p>
            </div>
          </div>
        )}

        {messages
          .filter((msg, idx) => !(idx === 0 && !hasUserMessages && msg.content === RUDRA_WELCOME_MESSAGE))
          .map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`flex items-start gap-2.5 max-w-[94%] ${
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                {msg.role === 'assistant' && (
                  <RudraLogoAvatar
                    sizeClass="w-7 h-7 mt-0.5"
                    shapeClass="rounded-full"
                    logoFailed={logoFailed}
                    onError={() => setLogoFailed(true)}
                  />
                )}
                <div
                  className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f8e7a8]'
                      : 'bg-[#0b0c10] border border-[#d4af37]/20 text-slate-200 shadow-sm'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <span className="block text-[10px] font-semibold text-[#f0cf65] mb-1">
                      Rudra
                    </span>
                  )}
                  {msg.content}
                </div>
              </div>

              {/* Suggested Approval Proposals */}
              {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                <div className="mt-2 ml-9 space-y-1.5 w-[calc(100%-2.25rem)] max-w-[90%]">
                  {msg.suggestedActions.map((act, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-[#0b0c10] border border-[#d4af37]/30 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#f0cf65] truncate">{act.title}</p>
                        <p className="text-slate-400 truncate">{act.explanation}</p>
                      </div>
                      {act.actionType && act.targetId ? (
                        <button
                          onClick={() =>
                            onTriggerApproval({
                              actionType: act.actionType as any,
                              targetType: act.actionType?.startsWith('KYC')
                                ? 'kyc'
                                : act.actionType?.startsWith('RELEASE')
                                  ? 'release'
                                  : 'platform',
                              targetId: act.targetId!,
                              title: act.title,
                              explanation: act.explanation || act.title,
                              consequences:
                                'Executes the recommended administrative update in PostgreSQL and records an immutable audit trail entry.',
                              proposedChanges: { actionType: act.actionType, targetId: act.targetId },
                              payload: {}
                            })
                          }
                          className="px-2.5 py-1.5 rounded bg-[#d4af37] hover:bg-[#f0cf65] text-black font-bold shrink-0 whitespace-nowrap transition"
                        >
                          Review & Approve
                        </button>
                      ) : (
                        <button
                          onClick={() => onNavigateTab('overview', 'executive-overview')}
                          className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0 inline-flex items-center gap-1 whitespace-nowrap transition"
                        >
                          Inspect <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <span
                className={`text-[10px] font-mono text-slate-600 mt-1 ${
                  msg.role === 'assistant' ? 'ml-9' : ''
                }`}
              >
                {new Date(msg.timestamp).toLocaleTimeString()}
                {msg.model ? ` · ${msg.model} (${msg.aiStatus || 'OK'})` : ''}
              </span>
            </div>
          ))}

        {sending && (
          <div className="flex items-center gap-2.5 px-1">
            <RudraLogoAvatar
              sizeClass="w-7 h-7"
              shapeClass="rounded-full"
              logoFailed={logoFailed}
              onError={() => setLogoFailed(true)}
            />
            <span className="text-xs font-mono text-[#f0cf65]/80">
              Rudra is analyzing live platform telemetry...
            </span>
          </div>
        )}
      </div>

      {/* Quick Prompts */}
      <div className="px-3 py-2 bg-[#0b0c10] border-t border-slate-800/90 flex gap-1.5 overflow-x-auto">
        {quickPrompts.map(q => (
          <button
            key={q}
            onClick={() => sendMessage(q)}
            disabled={sending}
            className="px-2.5 py-1.5 rounded-lg bg-[#050507] border border-slate-800 hover:border-[#d4af37]/45 text-[10px] text-slate-300 hover:text-[#f0cf65] whitespace-nowrap shrink-0 transition"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={e => {
          e.preventDefault();
          sendMessage();
        }}
        className="p-3 bg-[#0b0c10] border-t border-[#d4af37]/25 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask Rudra about releases, royalties, analytics, or platform health..."
          className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 focus:border-[#d4af37]/60 focus:outline-none text-xs text-white placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#b8891b] hover:from-[#f0cf65] hover:to-[#d4af37] disabled:opacity-40 text-black font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap transition"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
      </form>
    </div>
  );
};
