import React, { useEffect, useRef, useState } from 'react';
import { Bot, Crown, Loader2, MessageSquarePlus, Send, Trash2 } from 'lucide-react';
import { streamAITutorResponse } from '../lib/aiStream';
import {
  createChatSession,
  deleteChatSessionAndMessages,
  getChatMessages,
  getTodayKey,
  getUserChatSessions,
  saveChatMessage,
  updateChatSession,
} from '../lib/firestoreService';
import type { BillingProfileState } from '../lib/billingApi';
import { getUserEntitlements, PLANS } from '../lib/plans';
import type { ChatMessage, ChatSession, Subject, User } from '../types/database';
import { AuthGate } from './AuthGate';
import { UpgradePrompt } from './UpgradePrompt';

interface AITutorPageProps {
  currentUser: User | null;
  subjects: Subject[];
  initialSubjectId?: string;
  initialPrompt?: string;
  onAuthenticated: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onBillingUpdated: (user: User, billing: BillingProfileState) => void;
  onGoToUpgrade: () => void;
}

const QUICK_PROMPTS = [
  { label: 'Explain a topic', text: 'Explain the key rules and concepts of ' },
  { label: 'Solve step by step', text: 'Solve this problem step by step: ' },
  { label: 'Summarize for exam', text: 'Summarize the most tested JAMB/WAEC points in ' },
  { label: 'Create 5 practice questions', text: 'Create 5 JAMB-style multiple-choice practice questions with answers and explanations on ' },
];

export const AITutorPage: React.FC<AITutorPageProps> = ({
  currentUser,
  subjects,
  initialSubjectId,
  initialPrompt,
  onAuthenticated,
  onUpdateUser,
  onBillingUpdated,
  onGoToUpgrade,
}) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(initialSubjectId || 'sub-math');
  const [examLevel, setExamLevel] = useState<string>('JAMB');
  const [input, setInput] = useState<string>(initialPrompt || '');
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const skipNextFetchRef = useRef(false);

  useEffect(() => {
    if (initialSubjectId) setSelectedSubjectId(initialSubjectId);
  }, [initialSubjectId]);

  useEffect(() => {
    if (initialPrompt) setInput(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    if (!currentUser) {
      setSessions([]);
      setMessages([]);
      setActiveSessionId(null);
      return;
    }
    setLoadingSessions(true);
    void getUserChatSessions(currentUser.uid)
      .then((list) => {
        setSessions(list);
        if (list.length > 0 && !initialPrompt) {
          setActiveSessionId(list[0].id);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not load chat history.');
      })
      .finally(() => setLoadingSessions(false));
  }, [currentUser, initialPrompt]);

  useEffect(() => {
    if (!currentUser || !activeSessionId) {
      if (!activeSessionId) setMessages([]);
      return;
    }
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    void getChatMessages(currentUser.uid, activeSessionId)
      .then((list) => setMessages(list.filter((m): m is ChatMessage => Boolean(m && m.role))))
      .catch(() => setMessages([]));
  }, [currentUser, activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, sending]);

  if (!currentUser) {
    return (
      <AuthGate
        title="Sign in to use Exam Master AI"
        subtitle="Ask any Nigerian curriculum question, get step-by-step math and science help, and save your tutor chat history in Firestore."
        onAuthenticated={onAuthenticated}
      />
    );
  }

  const today = getTodayKey();
  const entitlements = getUserEntitlements(currentUser);
  const aiDailyLimit = entitlements.aiDailyLimit;
  const usedToday = entitlements.aiUsedToday;
  const remainingToday = entitlements.aiRemainingToday;

  const activeSubject = subjects.find((s) => s.id === selectedSubjectId) || subjects[0];

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setStreamingText('');
    setError('');
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await deleteChatSessionAndMessages(currentUser.uid, id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch {
      // ignore
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    if (remainingToday <= 0) {
      setError(
        entitlements.effectivePlan === 'free'
          ? `You have used all ${aiDailyLimit} free AI Tutor messages for today. Upgrade for 50 messages/day.`
          : `You have reached today's ${aiDailyLimit} AI Tutor message cap. Your counter resets tomorrow.`
      );
      return;
    }

    setError('');
    setSending(true);
    setStreamingText('');
    setInput('');

    const now = new Date().toISOString();
    let sessionId = activeSessionId;
    const userMsgId = `msg-${Date.now()}-u`;
    const optimisticUser: ChatMessage = {
      id: userMsgId,
      sessionId: sessionId || 'pending',
      userId: currentUser.uid,
      role: 'user',
      content: trimmed,
      createdAt: now,
    };

    const priorHistory = messages
      .filter((m): m is ChatMessage => Boolean(m && m.role))
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const streamRes = await streamAITutorResponse({
        message: trimmed,
        history: priorHistory,
        subjectName: activeSubject?.name || 'Mathematics',
        examLevel,
        classLevel: currentUser.classLevel || 'UTME Candidate',
        studentName: currentUser.name,
        onChunk: (partial) => setStreamingText(partial),
      });

      const replyTime = new Date().toISOString();
      if (!sessionId) {
        sessionId = `chat-${Date.now()}`;
        const newSession: ChatSession = {
          id: sessionId,
          userId: currentUser.uid,
          title: trimmed.length > 48 ? `${trimmed.slice(0, 48)}...` : trimmed,
          subjectId: activeSubject?.id || 'sub-math',
          subjectName: activeSubject?.name || 'Mathematics',
          examLevel,
          createdAt: now,
          updatedAt: replyTime,
        };
        await createChatSession(newSession);
        skipNextFetchRef.current = true;
        setActiveSessionId(sessionId);
        setSessions((prev) => [newSession, ...prev]);
      } else {
        await updateChatSession(sessionId, {
          subjectId: activeSubject?.id || 'sub-math',
          subjectName: activeSubject?.name || 'Mathematics',
          examLevel,
          updatedAt: replyTime,
        });
      }

      const persistedUser: ChatMessage = {
        id: userMsgId,
        sessionId,
        userId: currentUser.uid,
        role: 'user',
        content: trimmed,
        createdAt: now,
      };
      const persistedAssistant: ChatMessage = {
        id: `msg-${Date.now()}-a`,
        sessionId,
        userId: currentUser.uid,
        role: 'assistant',
        content: streamRes.fullText,
        createdAt: replyTime,
      };

      await saveChatMessage(persistedUser);
      await saveChatMessage(persistedAssistant);

      setMessages((prev) => [
        ...prev.filter((m): m is ChatMessage => Boolean(m && m.role && m.id !== userMsgId)),
        persistedUser,
        persistedAssistant,
      ]);
      setStreamingText('');

      const nextCount = streamRes.usedToday ?? usedToday + 1;
      onUpdateUser({
        ...currentUser,
        dailyAiDate: today,
        lastResetDate: today,
        dailyAiCount: nextCount,
      });
    } catch (err) {
      setMessages((prev) =>
        prev.filter((m): m is ChatMessage => Boolean(m && m.role && m.id !== userMsgId))
      );
      setStreamingText('');
      setInput(trimmed);
      setError(err instanceof Error ? err.message : 'Unable to reach Exam Master AI.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Exam Master AI Tutor
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Step-by-step explanations aligned with Nigerian JSS, SSS, WAEC, NECO &amp; JAMB curricula.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start sm:self-end">
          <div className="flex items-center gap-2 text-xs">
            {entitlements.isPaidOrTrial && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                {PLANS[entitlements.effectivePlan].name}
              </span>
            )}
            <span className="font-mono font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
              {remainingToday}/{aiDailyLimit} messages left today
            </span>
            {!entitlements.isPaidOrTrial && (
              <button
                type="button"
                onClick={onGoToUpgrade}
                className="font-semibold text-amber-700 underline hover:text-amber-800 dark:text-amber-400"
              >
                Get 50/day
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            New Chat
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Saved Chat History Sidebar */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Saved Chat History
            </h2>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {sessions.length} chats
            </span>
          </div>

          {loadingSessions ? (
            <p className="py-6 text-center text-xs text-slate-500">Loading your chats...</p>
          ) : sessions.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No saved chats yet. Ask a school question to begin!
            </p>
          ) : (
            <div className="mt-3 max-h-[380px] space-y-1.5 overflow-y-auto">
              {sessions.map((sess) => {
                const isActive = sess.id === activeSessionId;
                return (
                  <div
                    key={sess.id}
                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveSessionId(sess.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                        {sess.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {sess.subjectName} · {sess.examLevel}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteSession(sess.id)}
                      aria-label="Delete chat session"
                      className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        {/* Chat Workspace */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
          {/* Context Selectors */}
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
            <div className="flex-1 min-w-[180px]">
              <label htmlFor="ai-subject" className="mb-1 block text-[11px] font-medium text-slate-500">
                Subject Context
              </label>
              <select
                id="ai-subject"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs sm:text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name} ({sub.category})
                  </option>
                ))}
              </select>
            </div>

            <div className="w-36">
              <label htmlFor="ai-exam" className="mb-1 block text-[11px] font-medium text-slate-500">
                Exam Level
              </label>
              <select
                id="ai-exam"
                value={examLevel}
                onChange={(e) => setExamLevel(e.target.value)}
                className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs sm:text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="JAMB">JAMB UTME</option>
                <option value="WAEC">WAEC WASSCE</option>
                <option value="NECO">NECO SSCE</option>
                <option value="SSS">SSS 1–3</option>
                <option value="JSS">JSS 1–3</option>
              </select>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5 min-h-[340px] max-h-[500px]">
            {messages.length === 0 && !streamingText ? (
              <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  <Bot className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">
                  Hello {currentUser.name.split(' ')[0]}! Ready to study {activeSubject?.name}?
                </h3>
                <p className="mt-1 max-w-md text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Ask me to explain a topic, solve a calculation step by step, summarize a chapter, or generate practice questions.
                </p>

                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {QUICK_PROMPTS.map((qp) => (
                    <button
                      key={qp.label}
                      type="button"
                      onClick={() => setInput(`${qp.text}${activeSubject?.name || 'this topic'}`)}
                      className="min-h-[36px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages
                .filter((msg): msg is ChatMessage => Boolean(msg && msg.role))
                .map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? 'bg-emerald-600 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100'
                        }`}
                      >
                        {!isUser && (
                          <div className="mb-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                            Exam Master AI
                          </div>
                        )}
                        {msg.content}
                      </div>
                    </div>
                  );
                })
            )}

            {streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-emerald-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-900 whitespace-pre-wrap dark:border-emerald-900 dark:bg-slate-950 dark:text-slate-100">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Exam Master AI
                  </div>
                  {streamingText}
                </div>
              </div>
            )}

            {sending && !streamingText && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" aria-hidden="true" />
                  Exam Master AI is preparing your step-by-step answer...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {(error || (!entitlements.isPaidOrTrial && remainingToday <= 0)) && (
            <div className="mx-4 mb-2 space-y-2">
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                  {error}
                </div>
              )}
              {!entitlements.isPaidOrTrial && remainingToday <= 0 && (
                <UpgradePrompt
                  compact
                  title="Daily Free AI Tutor Limit Reached (5/5)"
                  description="Start your 3-Day Free Trial or upgrade to Weekly (₦500), Premium (₦1,500), or Exam Season Pass (₦3,500) to unlock 50 AI Tutor messages every day."
                  currentUser={currentUser}
                  onStartTrialSuccess={onBillingUpdated}
                  onViewPlans={onGoToUpgrade}
                />
              )}
            </div>
          )}

          {/* Input Composer */}
          <form
            onSubmit={handleSend}
            className="flex items-end gap-2 border-t border-slate-100 p-3 sm:p-4 dark:border-slate-800"
          >
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={`Ask about ${activeSubject?.name || 'any school subject'} (${examLevel})...`}
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send message"
              className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
