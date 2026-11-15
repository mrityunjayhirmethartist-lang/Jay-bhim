import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
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

const REQUIRED_EXECUTIVE_GREETING =
  'Namaste! Welcome back to Rudraatma Command Center. I am your AI Executive Assistant. I have analyzed the current platform status and I am ready to help you manage Rudraatma Music Distribution. I will explain completed work, identify pending tasks, highlight technical problems and recommend your next steps. Remember: You are the Super Admin. No important decision will be executed without your explicit approval.';

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
        content: REQUIRED_EXECUTIVE_GREETING,
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
      if (!res.ok) throw new Error(data.error || 'AI Executive Assistant request failed.');

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
          content: `Unable to reach backend intelligence engine: ${err.message}`,
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
        id: 'cleared_' + Date.now(),
        role: 'assistant',
        content:
          'Conversation cleared. Ask any question about live database totals, pending approvals, technical diagnostics, or next steps.',
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

  // Collapsed Floating Launcher
  if (!isOpen) {
    return (
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
        {hasUnreadWelcome && (
          <div className="max-w-xs p-3 rounded-xl bg-[#0b0c10] border border-[#d4af37]/45 shadow-2xl text-[11px] text-slate-200">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-[#f0cf65]">AI Executive Assistant Ready</span>
              <button
                onClick={() => setHasUnreadWelcome(false)}
                className="text-slate-500 hover:text-white"
                aria-label="Dismiss welcome hint"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-slate-400 mt-1 line-clamp-2">
              Namaste! Welcome back to Rudraatma Command Center. Open to inspect live diagnostics & next steps.
            </p>
          </div>
        )}
        <button
          onClick={() => {
            setIsOpen(true);
            setHasUnreadWelcome(false);
          }}
          className="px-4 py-3 rounded-2xl bg-gradient-to-r from-[#141310] to-[#0b0c10] border border-[#d4af37]/60 hover:border-[#f0cf65] text-[#f0cf65] shadow-2xl flex items-center gap-2.5 text-xs font-semibold transition"
        >
          <Bot className="w-4 h-4 text-[#d4af37]" />
          <span>AI Executive Assistant</span>
          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed z-50 flex flex-col bg-[#08090d] border border-[#d4af37]/45 shadow-2xl overflow-hidden transition-all ${
        isMaximized
          ? 'inset-4 sm:inset-8 rounded-2xl'
          : 'bottom-4 right-4 w-[calc(100vw-2rem)] sm:w-[440px] h-[580px] max-h-[82vh] rounded-2xl'
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-[#0b0c10] border-b border-[#d4af37]/25 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#14120b] border border-[#d4af37]/50 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-[#d4af37]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#f0cf65] truncate">AI Executive Assistant</p>
            <p className="text-[10px] font-mono text-slate-400 truncate">
              Advisory Only · Context: {activeTab}/{activeSubmenu}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleClear}
            title="Clear Conversation"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsMaximized(v => !v)}
            title={isMaximized ? 'Restore Size' : 'Maximize'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            title="Minimize Assistant"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Strict Governance Notice */}
      <div className="px-4 py-1.5 bg-[#050507] border-b border-slate-800/80 flex items-center gap-2 text-[10px] font-mono text-slate-400">
        <ShieldAlert className="w-3 h-3 text-[#d4af37] shrink-0" />
        <span>Zero Auto-Execution · Owner Approval required for all platform mutations</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#050507]">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f8e7a8]'
                  : 'bg-[#0b0c10] border border-slate-800 text-slate-200'
              }`}
            >
              {msg.content}
            </div>

            {/* Suggested Approval Proposals */}
            {msg.suggestedActions && msg.suggestedActions.length > 0 && (
              <div className="mt-2 space-y-1.5 w-full max-w-[90%]">
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
                        className="px-2.5 py-1 rounded bg-[#d4af37] text-black font-bold shrink-0 whitespace-nowrap"
                      >
                        Review & Approve
                      </button>
                    ) : (
                      <button
                        onClick={() => onNavigateTab('overview', 'executive-overview')}
                        className="px-2 py-1 rounded bg-slate-800 text-slate-200 shrink-0 inline-flex items-center gap-1"
                      >
                        Inspect <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <span className="text-[10px] font-mono text-slate-600 mt-1">
              {new Date(msg.timestamp).toLocaleTimeString()}
              {msg.model ? ` · ${msg.model} (${msg.aiStatus || 'OK'})` : ''}
            </span>
          </div>
        ))}

        {sending && (
          <div className="text-xs font-mono text-slate-400 px-2">
            Analyzing live platform telemetry...
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
            className="px-2.5 py-1 rounded-lg bg-[#050507] border border-slate-800 hover:border-[#d4af37]/40 text-[10px] text-slate-300 whitespace-nowrap shrink-0"
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
        className="p-3 bg-[#0b0c10] border-t border-[#d4af37]/20 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about DB totals, errors, KYC, releases, or next steps..."
          className="flex-1 px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 focus:border-[#d4af37]/60 focus:outline-none text-xs text-white"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="px-3 py-2 rounded-xl bg-[#d4af37] hover:bg-[#f0cf65] disabled:opacity-40 text-black font-bold text-xs inline-flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
      </form>
    </div>
  );
};
