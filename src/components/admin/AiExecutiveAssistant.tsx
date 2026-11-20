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
const RUDRA_SUBTITLE = 'Executive Assistant';
const RUDRA_LOGO_SRC = '/assets/aistudio/file_00000000ae888210a9a69884425ffe03_0a3d75a3.png';

const RUDRA_WELCOME_MESSAGE =
  'Namaste! I am Rudra AI, your Rudraatma Music executive assistant. Ask about system health, pending KYC or releases, revenue, or operational tasks.';

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
        className={`${sizeClass} ${shapeClass} bg-[#18150d] border border-[#d4af37]/50 flex items-center justify-center shrink-0`}
        aria-label="Rudra AI"
      >
        <Sparkles className="w-4 h-4 text-[#f0cf65]" />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} ${shapeClass} relative overflow-hidden border border-[#d4af37]/50 bg-[#0b0c11] shrink-0`}
    >
      <img
        src={RUDRA_LOGO_SRC}
        alt="Rudra AI"
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
  const [logoFailed, setLogoFailed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    }
  }, [token]);

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
          content: `Unable to reach Rudra AI engine: ${err.message}`,
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
    'Summarize system status & next steps',
    'Detect any system errors or failed logins',
    'Check Email OTP, Database & Payment health',
    'Summarize pending KYC & release reviews'
  ];

  const hasUserMessages = messages.some(m => m.role === 'user');

  // Compact Non-Overlapping Floating Launcher
  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-30 pointer-events-none">
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open Rudra AI Assistant"
          className="pointer-events-auto h-11 px-3 sm:px-4 rounded-full bg-[#111319]/95 backdrop-blur-md border border-[#d4af37]/50 hover:border-[#f0cf65] text-[#f0cf65] shadow-[0_8px_28px_rgba(0,0,0,0.65)] flex items-center gap-2 text-xs font-semibold transition-all hover:scale-[1.02]"
        >
          <RudraLogoAvatar
            sizeClass="w-7 h-7"
            shapeClass="rounded-full"
            logoFailed={logoFailed}
            onError={() => setLogoFailed(true)}
          />
          <span className="hidden sm:inline">{RUDRA_DISPLAY_NAME}</span>
          <ChevronUp className="w-3.5 h-3.5 text-[#d4af37] hidden sm:inline" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed z-50 flex flex-col bg-[#0e1015] border border-white/[0.12] shadow-[0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden transition-all ${
        isMaximized
          ? 'inset-3 sm:inset-8 rounded-2xl'
          : 'bottom-0 inset-x-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[420px] h-[78vh] sm:h-[580px] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl'
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-[#13151d] border-b border-white/[0.08] flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <RudraLogoAvatar
            sizeClass="w-9 h-9"
            shapeClass="rounded-xl"
            logoFailed={logoFailed}
            onError={() => setLogoFailed(true)}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {RUDRA_DISPLAY_NAME}
              </p>
              <span className="text-[11px] font-medium text-emerald-400 shrink-0">
                Ready
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">{RUDRA_SUBTITLE}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleClear}
            title="Start Fresh Conversation"
            aria-label="Clear Conversation"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsMaximized(v => !v)}
            title={isMaximized ? 'Restore Size' : 'Maximize'}
            aria-label={isMaximized ? 'Restore Size' : 'Maximize'}
            className="hidden sm:inline-flex p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition"
          >
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            title="Minimize Rudra AI"
            aria-label="Minimize Rudra AI"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Governance Notice */}
      <div className="px-4 py-2 bg-[#0b0c11] border-b border-white/[0.06] flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5 truncate">
          <ShieldAlert className="w-3.5 h-3.5 text-[#d4af37] shrink-0" />
          <span className="truncate">Advisory only · Owner approval required for changes</span>
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#090a0e]">
        {!hasUserMessages && (
          <div className="rounded-2xl bg-[#111319] border border-white/[0.08] overflow-hidden">
            {!logoFailed ? (
              <div className="relative h-28 sm:h-32 w-full bg-[#090a0e] overflow-hidden border-b border-white/[0.06]">
                <img
                  src={RUDRA_LOGO_SRC}
                  alt="Rudra AI Assistant"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoFailed(true)}
                  className="w-full h-full object-cover object-center"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#111319] to-transparent" />
              </div>
            ) : (
              <div className="px-4 pt-4 pb-1 flex items-center gap-3">
                <RudraLogoAvatar
                  sizeClass="w-10 h-10"
                  shapeClass="rounded-xl"
                  logoFailed={logoFailed}
                  onError={() => setLogoFailed(true)}
                />
                <div>
                  <p className="text-sm font-semibold text-white">{RUDRA_DISPLAY_NAME}</p>
                  <p className="text-xs text-slate-400">{RUDRA_SUBTITLE}</p>
                </div>
              </div>
            )}

            <div className="p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#f0cf65]">{RUDRA_DISPLAY_NAME}</h3>
                <span className="text-[11px] font-medium text-slate-400">2.0</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-300 border-t border-white/[0.06] pt-2">
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
                className={`flex items-start gap-2.5 max-w-[92%] ${
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
                  className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#d4af37]/15 border border-[#d4af37]/35 text-[#f8e7a8]'
                      : 'bg-[#111319] border border-white/[0.08] text-slate-200'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <span className="block text-[11px] font-semibold text-[#f0cf65] mb-1">
                      Rudra AI
                    </span>
                  )}
                  {msg.content}
                </div>
              </div>

              {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                <div className="mt-2 ml-9 space-y-1.5 w-[calc(100%-2.25rem)] max-w-[90%]">
                  {msg.suggestedActions.map((act, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-[#111319] border border-[#d4af37]/30 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#f0cf65] truncate">{act.title}</p>
                        <p className="text-slate-400 truncate text-[11px]">{act.explanation}</p>
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
                                'Executes the recommended update in PostgreSQL and records an audit log entry.',
                              proposedChanges: { actionType: act.actionType, targetId: act.targetId },
                              payload: {}
                            })
                          }
                          className="px-3 py-1.5 rounded-lg bg-[#d4af37] hover:bg-[#e5c354] text-black font-semibold shrink-0 whitespace-nowrap transition"
                        >
                          Review
                        </button>
                      ) : (
                        <button
                          onClick={() => onNavigateTab('overview', 'executive-overview')}
                          className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 shrink-0 inline-flex items-center gap-1 whitespace-nowrap transition"
                        >
                          Inspect <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <span
                className={`text-[11px] text-slate-500 mt-1 tabular-nums ${
                  msg.role === 'assistant' ? 'ml-9' : ''
                }`}
              >
                {new Date(msg.timestamp).toLocaleTimeString()}
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
            <span className="text-xs text-[#f0cf65]/90">
              Analyzing platform data...
            </span>
          </div>
        )}
      </div>

      {/* Quick Prompts */}
      <div className="px-3 py-2 bg-[#111319] border-t border-white/[0.06] flex gap-1.5 overflow-x-auto">
        {quickPrompts.map(q => (
          <button
            key={q}
            onClick={() => sendMessage(q)}
            disabled={sending}
            className="px-3 py-1.5 rounded-lg bg-[#090a0e] border border-white/[0.08] hover:border-[#d4af37]/45 text-[11px] text-slate-300 hover:text-[#f0cf65] whitespace-nowrap shrink-0 transition"
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
        className="p-3 bg-[#111319] border-t border-white/[0.08] flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask Rudra AI about releases, analytics, or health..."
          className="flex-1 h-10 px-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 focus:outline-none text-xs text-white placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="h-10 px-4 rounded-xl bg-[#d4af37] hover:bg-[#e5c354] disabled:opacity-40 text-black font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap transition"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
      </form>
    </div>
  );
};
