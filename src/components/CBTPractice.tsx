import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Grid,
  Play,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import type { BillingProfileState } from '../lib/billingApi';
import { FREE_DAILY_CBT_LIMIT, getUserEntitlements } from '../lib/plans';
import type {
  Attempt,
  AttemptAnswer,
  ExamCode,
  ExamMasterDatabase,
  Question,
  Result,
  SubjectScore,
  User,
} from '../types/database';
import { AdBanner } from './AdBanner';
import { UpgradePrompt } from './UpgradePrompt';

interface CBTPracticeProps {
  db: ExamMasterDatabase;
  currentUser: User | null;
  preselectedSubjectIds?: string[];
  preselectedExamCode?: ExamCode;
  autoStart?: boolean;
  onCompleteCBT: (attempt: Attempt, result: Result) => void;
  onBeforeStartCBT: () => Promise<{ allowed: boolean; message?: string }>;
  onNavigatePricing: () => void;
  onRequireAuth: () => void;
  onBillingUpdated: (updatedUser: User, billing: BillingProfileState) => void;
}

type Stage = 'setup' | 'running' | 'review';

export const CBTPractice: React.FC<CBTPracticeProps> = ({
  db,
  currentUser,
  preselectedSubjectIds,
  preselectedExamCode,
  autoStart = false,
  onCompleteCBT,
  onBeforeStartCBT,
  onNavigatePricing,
  onRequireAuth,
  onBillingUpdated,
}) => {
  const [stage, setStage] = useState<Stage>('setup');
  const [cbtGateError, setCbtGateError] = useState<string>('');
  const [startingExam, setStartingExam] = useState<boolean>(false);

  // Setup state
  const [examCode, setExamCode] = useState<ExamCode>(preselectedExamCode || 'JAMB');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>(
    preselectedSubjectIds && preselectedSubjectIds.length > 0
      ? preselectedSubjectIds
      : ['sub-english', 'sub-math']
  );
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [timeLimitMins, setTimeLimitMins] = useState<number>(10);

  // Active CBT session state
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [activeSubjectTab, setActiveSubjectTab] = useState<string>('ALL');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedMap, setSelectedMap] = useState<Record<string, string>>({});
  const [flaggedMap, setFlaggedMap] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(600);
  const [startedAt, setStartedAt] = useState<string>('');
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [showMobilePalette, setShowMobilePalette] = useState<boolean>(false);

  // Built-in JAMB CBT Calculator state
  const [showCalc, setShowCalc] = useState<boolean>(false);
  const [calcDisplay, setCalcDisplay] = useState<string>('0');

  // Review state
  const [lastResult, setLastResult] = useState<Result | null>(null);
  const [lastAttempt, setLastAttempt] = useState<Attempt | null>(null);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'wrong' | 'flagged'>('all');

  const availableQuestions = useMemo(() => {
    const exactMatch = db.questions.filter(
      (q) => q.examCode === examCode && selectedSubjectIds.includes(q.subjectId)
    );
    if (exactMatch.length >= 4) return exactMatch;
    // Include cross-exam questions for selected subjects if specific exam has fewer questions
    return db.questions.filter((q) => selectedSubjectIds.includes(q.subjectId));
  }, [db.questions, examCode, selectedSubjectIds]);

  const startExam = useCallback(
    async (subIdsOverride?: string[]) => {
      if (!currentUser) {
        setCbtGateError('Please sign in first to start a timed CBT session and track your daily allowance.');
        return;
      }
      setCbtGateError('');
      setStartingExam(true);
      try {
        const gate = await onBeforeStartCBT();
        if (!gate.allowed) {
          setCbtGateError(
            gate.message ||
              `Daily Free CBT limit reached (${FREE_DAILY_CBT_LIMIT}/${FREE_DAILY_CBT_LIMIT} today). Upgrade for unlimited timed CBT tests.`
          );
          return;
        }
      } catch (err) {
        setCbtGateError(err instanceof Error ? err.message : 'Unable to start CBT right now.');
        return;
      } finally {
        setStartingExam(false);
      }

      const subIds = subIdsOverride && subIdsOverride.length > 0 ? subIdsOverride : selectedSubjectIds;
      const pool = db.questions.filter((q) => {
        const matchesSub = subIds.includes(q.subjectId);
        return matchesSub;
      });
      // Prioritize matching examCode first, then fill up to requested count
      const prioritized = [
        ...pool.filter((q) => q.examCode === examCode),
        ...pool.filter((q) => q.examCode !== examCode),
      ];
      const chosen = prioritized.slice(0, Math.min(questionCount, prioritized.length));
      if (chosen.length === 0) return;

      setSessionQuestions(chosen);
      setActiveSubjectTab(subIds.length === 1 ? subIds[0] : 'ALL');
      setCurrentIndex(0);
      setSelectedMap({});
      setFlaggedMap({});
      setSecondsLeft(timeLimitMins * 60);
      setStartedAt(new Date().toISOString());
      setShowSubmitModal(false);
      setShowMobilePalette(false);
      setStage('running');
    },
    [currentUser, db.questions, examCode, onBeforeStartCBT, questionCount, selectedSubjectIds, timeLimitMins]
  );

  // Support 1-click autoStart from Home / Study Dashboard
  useEffect(() => {
    if (autoStart && preselectedSubjectIds && preselectedSubjectIds.length > 0) {
      setSelectedSubjectIds(preselectedSubjectIds);
      void startExam(preselectedSubjectIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const finalizeExam = useCallback(() => {
    if (sessionQuestions.length === 0) return;
    const completedAt = new Date().toISOString();
    const totalLimit = timeLimitMins * 60;
    const elapsed = Math.max(1, totalLimit - secondsLeft);

    const answers: AttemptAnswer[] = sessionQuestions.map((q) => {
      const picked = selectedMap[q.id] || null;
      const correctOpt = q.options.find((o) => o.isCorrect);
      return {
        questionId: q.id,
        selectedOptionId: picked,
        isCorrect: !!picked && picked === correctOpt?.id,
        flagged: !!flaggedMap[q.id],
      };
    });

    const rawCorrect = answers.filter((a) => a.isCorrect).length;
    const percentage = Math.round((rawCorrect / sessionQuestions.length) * 100);
    const jambScore = Math.round((rawCorrect / sessionQuestions.length) * 400);

    const subjectGroups = new Map<string, { name: string; correct: number; total: number }>();
    sessionQuestions.forEach((q, idx) => {
      const prev = subjectGroups.get(q.subjectId) || { name: q.subjectName, correct: 0, total: 0 };
      subjectGroups.set(q.subjectId, {
        name: q.subjectName,
        correct: prev.correct + (answers[idx].isCorrect ? 1 : 0),
        total: prev.total + 1,
      });
    });

    const subjectBreakdown: SubjectScore[] = Array.from(subjectGroups.entries()).map(
      ([subjectId, info]) => {
        const pct = Math.round((info.correct / info.total) * 100);
        return {
          subjectId,
          subjectName: info.name,
          correct: info.correct,
          total: info.total,
          percentage: pct,
          jambScaled: pct,
        };
      }
    );

    const userId = db.currentUserId || 'user-demo-student';
    const attemptId = `att-${Date.now()}`;
    const subjectIdsUsed = Array.from(subjectGroups.keys());
    const subjectNamesUsed = subjectBreakdown.map((s) => s.subjectName);

    const attempt: Attempt = {
      id: attemptId,
      userId,
      examCode,
      subjectIds: subjectIdsUsed,
      subjectNames: subjectNamesUsed,
      questionIds: sessionQuestions.map((q) => q.id),
      answers,
      startedAt: startedAt || completedAt,
      completedAt,
      durationSeconds: elapsed,
      timeLimitSeconds: totalLimit,
    };

    const result: Result = {
      id: `res-${Date.now()}`,
      attemptId,
      userId,
      examCode,
      rawCorrect,
      totalQuestions: sessionQuestions.length,
      percentage,
      jambScore,
      subjectBreakdown,
      createdAt: completedAt,
    };

    onCompleteCBT(attempt, result);
    setLastAttempt(attempt);
    setLastResult(result);
    setShowSubmitModal(false);
    setShowCalc(false);
    setReviewFilter('all');
    setStage('review');
  }, [
    db.currentUserId,
    examCode,
    flaggedMap,
    onCompleteCBT,
    secondsLeft,
    selectedMap,
    sessionQuestions,
    startedAt,
    timeLimitMins,
  ]);

  // Countdown Timer
  useEffect(() => {
    if (stage !== 'running') return;
    if (secondsLeft <= 0) {
      finalizeExam();
      return;
    }
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage, secondsLeft, finalizeExam]);

  const currentQuestion = sessionQuestions[currentIndex];

  // Keyboard shortcuts during running CBT (A/B/C/D, Arrows)
  useEffect(() => {
    if (stage !== 'running' || showSubmitModal || !currentQuestion) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(key)) {
        const opt = currentQuestion.options.find((o) => o.label === key);
        if (opt) setSelectedMap((prev) => ({ ...prev, [currentQuestion.id]: opt.id }));
      } else if (e.key === 'ArrowRight' || key === 'N') {
        setCurrentIndex((idx) => Math.min(sessionQuestions.length - 1, idx + 1));
      } else if (e.key === 'ArrowLeft' || key === 'P') {
        setCurrentIndex((idx) => Math.max(0, idx - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage, showSubmitModal, currentQuestion, sessionQuestions.length]);

  const toggleSubjectSelection = (subjectId: string) => {
    setSelectedSubjectIds((prev) => {
      if (prev.includes(subjectId)) {
        return prev.length > 1 ? prev.filter((id) => id !== subjectId) : prev;
      }
      if (prev.length >= 4) return prev;
      return [...prev, subjectId];
    });
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  const handleCalcButton = (val: string) => {
    if (val === 'C') {
      setCalcDisplay('0');
      return;
    }
    if (val === '⌫') {
      setCalcDisplay((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
      return;
    }
    if (val === '=') {
      try {
        // Safe arithmetic evaluation for basic CBT calculator
        if (/^[0-9+\-*/.() ]+$/.test(calcDisplay)) {
          const result = Function(`"use strict"; return (${calcDisplay})`)();
          setCalcDisplay(Number.isFinite(result) ? String(Number(result.toFixed(6))) : 'Error');
        }
      } catch {
        setCalcDisplay('Error');
      }
      return;
    }
    setCalcDisplay((prev) => (prev === '0' || prev === 'Error' ? val : prev + val));
  };

  // ==================== STAGE 1: SETUP ====================
  const entitlements = getUserEntitlements(currentUser);
  const cbtLimitReached =
    Boolean(currentUser) &&
    entitlements.cbtDailyLimit !== null &&
    entitlements.cbtRemainingToday !== null &&
    entitlements.cbtRemainingToday <= 0;

  if (stage === 'setup') {
    return (
      <div className="mx-auto max-w-4xl space-y-6 pb-10">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end dark:border-slate-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              CBT Practice Simulator
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Configure a timed computer-based test mirroring the official JAMB UTME workstation.
            </p>
          </div>
          <div className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {entitlements.cbtDailyLimit === null
              ? 'Unlimited CBT Tests Active'
              : currentUser
              ? `${entitlements.cbtRemainingToday}/${entitlements.cbtDailyLimit} Free CBT left today`
              : `Free Plan: ${FREE_DAILY_CBT_LIMIT} CBT / day`}
          </div>
        </div>

        {(cbtGateError || cbtLimitReached) && (
          <UpgradePrompt
            title={
              !currentUser
                ? 'Sign In to Start Timed CBT Practice'
                : 'Daily Free CBT Test Limit Reached (1/1)'
            }
            description={
              cbtGateError ||
              'You have completed your 1 Free timed CBT test for today. Upgrade to Weekly (₦500), Premium (₦1,500), Exam Season Pass (₦3,500), or start your 3-Day Free Trial for unlimited daily CBT mocks.'
            }
            currentUser={currentUser}
            onStartTrialSuccess={(user, billing) => {
              onBillingUpdated(user, billing);
              setCbtGateError('');
            }}
            onViewPlans={onNavigatePricing}
            onSignInPrompt={onRequireAuth}
          />
        )}

        <AdBanner
          currentUser={currentUser}
          onUpgrade={onNavigatePricing}
          contextLabel="CBT Simulator"
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 space-y-6 dark:border-slate-800 dark:bg-slate-900">
          {/* Exam Type */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-900 dark:text-white">
              1. Select Examination
            </label>
            <div className="grid grid-cols-3 gap-2.5 sm:max-w-md">
              {(['JAMB', 'WAEC', 'NECO'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setExamCode(code)}
                  className={`min-h-[44px] rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    examCode === code
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          {/* Subjects */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                2. Choose Subjects (1 to 4 subjects)
              </label>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {selectedSubjectIds.length} selected
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {[...db.subjects]
                .map((sub) => ({
                  sub,
                  count: db.questions.filter((q) => q.subjectId === sub.id).length,
                }))
                .filter((item) => item.count > 0 || selectedSubjectIds.includes(item.sub.id))
                .sort((a, b) => b.count - a.count)
                .map(({ sub, count }) => {
                  const isSelected = selectedSubjectIds.includes(sub.id);
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => toggleSubjectSelection(sub.id)}
                      className={`flex min-h-[52px] items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold">{sub.name}</div>
                        <div className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {count} questions
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Question Count & Time Limit */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="cbt-qcount" className="block text-sm font-semibold text-slate-900 dark:text-white">
                3. Number of Questions
              </label>
              <select
                id="cbt-qcount"
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value={5}>5 Questions (Quick Sprint)</option>
                <option value={10}>10 Questions (Standard Practice)</option>
                <option value={20}>20 Questions (Extended Drill)</option>
                <option value={30}>30 Questions (Full Mock)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="cbt-time" className="block text-sm font-semibold text-slate-900 dark:text-white">
                4. Time Limit
              </label>
              <select
                id="cbt-time"
                value={timeLimitMins}
                onChange={(e) => setTimeLimitMins(Number(e.target.value))}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value={5}>5 Minutes</option>
                <option value={10}>10 Minutes</option>
                <option value={20}>20 Minutes</option>
                <option value={30}>30 Minutes</option>
                <option value={60}>60 Minutes</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center dark:border-slate-800">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Pool ready: <strong className="font-mono tabular-nums">{availableQuestions.length}</strong> questions across{' '}
              <strong>{selectedSubjectIds.length}</strong> subject(s). Keyboard shortcuts: A, B, C, D &amp; Arrow keys.
            </div>
            <button
              type="button"
              onClick={() => void startExam()}
              disabled={availableQuestions.length === 0 || startingExam}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {startingExam ? 'Checking Allowance...' : 'Begin Timed CBT'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== STAGE 2: RUNNING EXAM ====================
  if (stage === 'running' && currentQuestion) {
    const answeredCount = Object.keys(selectedMap).length;
    const isLowTime = secondsLeft <= 120;
    const sessionSubjectTabs = Array.from(
      new Map(sessionQuestions.map((q) => [q.subjectId, q.subjectName])).entries()
    );

    return (
      <div className="space-y-4 pb-20 md:pb-8">
        {/* Top CBT Exam Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {examCode} CBT Session
            </span>
            <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              · {answeredCount}/{sessionQuestions.length} answered
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-sm font-bold tabular-nums ${
                isLowTime
                  ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white'
              }`}
              aria-live="polite"
            >
              <Clock className="h-4 w-4" aria-hidden="true" />
              {formatTimer(secondsLeft)}
            </div>

            <button
              type="button"
              onClick={() => setShowCalc((v) => !v)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <Calculator className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Calculator</span>
            </button>

            <button
              type="button"
              onClick={() => setShowMobilePalette((v) => !v)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 lg:hidden dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <Grid className="h-4 w-4" aria-hidden="true" />
              Map
            </button>

            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              className="min-h-[38px] rounded-xl bg-emerald-600 px-4 py-1.5 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
            >
              Submit
            </button>
          </div>
        </div>

        {/* Multi-Subject Switcher Tabs (JAMB Authentic Style) */}
        {sessionSubjectTabs.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            {sessionSubjectTabs.map(([subId, subName]) => {
              const firstIdx = sessionQuestions.findIndex((q) => q.subjectId === subId);
              const isCurrent = currentQuestion.subjectId === subId || activeSubjectTab === subId;
              return (
                <button
                  key={subId}
                  type="button"
                  onClick={() => {
                    setActiveSubjectTab(subId);
                    if (firstIdx >= 0) setCurrentIndex(firstIdx);
                  }}
                  className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    isCurrent
                      ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-800 dark:text-emerald-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                  }`}
                >
                  {subName}
                </button>
              );
            })}
          </div>
        )}

        {/* Main 2-Column CBT Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Question Stage */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                  Question {currentIndex + 1} of {sessionQuestions.length}
                </span>
                {' · '}
                <span>{currentQuestion.subjectName}</span>
                {' · '}
                <span className="font-mono tabular-nums">{currentQuestion.year}</span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setFlaggedMap((prev) => ({
                    ...prev,
                    [currentQuestion.id]: !prev[currentQuestion.id],
                  }))
                }
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  flaggedMap[currentQuestion.id]
                    ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                {flaggedMap[currentQuestion.id] ? 'Flagged' : 'Flag'}
              </button>
            </div>

            {currentQuestion.passage && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                <div className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Comprehension Passage
                </div>
                {currentQuestion.passage}
              </div>
            )}

            <h2 className="mt-5 text-base sm:text-lg font-semibold leading-relaxed text-slate-900 dark:text-white">
              {currentQuestion.prompt}
            </h2>

            <div className="mt-5 space-y-3">
              {currentQuestion.options.map((opt) => {
                const isSelected = selectedMap[currentQuestion.id] === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setSelectedMap((prev) => ({ ...prev, [currentQuestion.id]: opt.id }))
                    }
                    className={`flex min-h-[52px] w-full items-center gap-3.5 rounded-xl border px-4 py-3 text-left text-sm sm:text-base transition-colors ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-medium dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-100'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span>{opt.text}</span>
                  </button>
                );
              })}
            </div>

            {/* Bottom Prev / Next Controls */}
            <div className="mt-7 flex items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </button>

              {currentIndex < sessionQuestions.length - 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex((i) => Math.min(sessionQuestions.length - 1, i + 1))
                  }
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Next Question
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(true)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                >
                  Review &amp; Submit
                </button>
              )}
            </div>
          </div>

          {/* Question Number Palette Sidebar (Desktop always visible, Mobile toggleable) */}
          <aside
            className={`${
              showMobilePalette ? 'block' : 'hidden'
            } rounded-2xl border border-slate-200 bg-white p-5 lg:block lg:col-span-4 dark:border-slate-800 dark:bg-slate-900`}
          >
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Question Palette
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Tap any number to jump directly
            </p>

            <div className="mt-4 grid grid-cols-5 gap-2">
              {sessionQuestions.map((q, idx) => {
                const isAnswered = !!selectedMap[q.id];
                const isFlagged = !!flaggedMap[q.id];
                const isCurrent = idx === currentIndex;

                let btnClass =
                  'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300';
                if (isAnswered) {
                  btnClass =
                    'border-emerald-600 bg-emerald-600 text-white';
                } else if (isFlagged) {
                  btnClass =
                    'border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-600 dark:bg-amber-950/70 dark:text-amber-200';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx);
                      setShowMobilePalette(false);
                    }}
                    className={`min-h-[40px] rounded-lg border font-mono text-xs font-bold tabular-nums transition-transform ${btnClass} ${
                      isCurrent ? 'ring-2 ring-slate-900 ring-offset-1 dark:ring-white' : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-emerald-600" /> Answered ({answeredCount})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-amber-400" /> Flagged
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950" /> Unanswered
              </span>
            </div>
          </aside>
        </div>

        {/* Built-in Floating JAMB Calculator */}
        {showCalc && (
          <div className="fixed bottom-20 right-4 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                CBT Calculator
              </span>
              <button
                type="button"
                onClick={() => setShowCalc(false)}
                aria-label="Close calculator"
                className="rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 rounded-xl bg-slate-100 px-3 py-2.5 text-right font-mono text-lg font-bold text-slate-900 dark:bg-slate-950 dark:text-white tabular-nums truncate">
              {calcDisplay}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', 'C', '+', '(', ')', '⌫', '='].map(
                (key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleCalcButton(key)}
                    className={`min-h-[38px] rounded-lg font-mono text-sm font-semibold transition-colors ${
                      key === '='
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : ['/', '*', '-', '+'].includes(key)
                        ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200'
                        : 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {key}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Submit Confirmation Modal */}
        {showSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2.5 text-slate-900 dark:text-white">
                <AlertCircle className="h-5 w-5 text-amber-500" aria-hidden="true" />
                <h3 className="text-lg font-bold">Submit CBT Session?</h3>
              </div>
              <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-300">
                You have answered <strong className="font-mono tabular-nums">{answeredCount}</strong> out of{' '}
                <strong className="font-mono tabular-nums">{sessionQuestions.length}</strong> questions with{' '}
                <strong className="font-mono tabular-nums">{formatTimer(secondsLeft)}</strong> remaining.
              </p>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="min-h-[42px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  Continue Test
                </button>
                <button
                  type="button"
                  onClick={finalizeExam}
                  className="min-h-[42px] rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Submit &amp; Score
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== STAGE 3: RESULTS & DETAILED REVIEW ====================
  if (stage === 'review' && lastResult && lastAttempt) {
    const filteredReview = sessionQuestions.filter((q, idx) => {
      const ans = lastAttempt.answers[idx];
      if (reviewFilter === 'wrong') return !ans.isCorrect;
      if (reviewFilter === 'flagged') return ans.flagged;
      return true;
    });

    return (
      <div className="space-y-6 pb-10">
        {/* Score Summary Banner */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {lastResult.examCode} CBT RESULT · SAVED TO STUDY DASHBOARD
              </div>
              <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                {lastResult.percentage >= 70
                  ? 'Strong performance!'
                  : lastResult.percentage >= 50
                  ? 'Good effort — keep drilling!'
                  : 'Review the explanations below to boost your score'}
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                Raw Score: <strong>{lastResult.rawCorrect}/{lastResult.totalQuestions}</strong> ({lastResult.percentage}%)
                {' · '}
                Time Used: <strong>{formatTimer(lastAttempt.durationSeconds)}</strong>
              </p>
            </div>

            <div className="flex items-center gap-5">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-4 text-center dark:border-emerald-900 dark:bg-emerald-950/50">
                <div className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  Scaled UTME Score
                </div>
                <div className="mt-1 font-mono text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {lastResult.jambScore}
                  <span className="text-sm font-normal text-emerald-600/80">/400</span>
                </div>
              </div>
            </div>
          </div>

          {/* Subject Breakdown */}
          <div className="mt-6 grid grid-cols-1 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
            {lastResult.subjectBreakdown.map((sub) => (
              <div
                key={sub.subjectId}
                className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-950"
              >
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {sub.subjectName}
                </div>
                <div className="mt-1 flex items-baseline justify-between font-mono tabular-nums">
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {sub.percentage}%
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {sub.correct}/{sub.total} correct
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void startExam()}
              disabled={startingExam}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Retake Test
            </button>
            <button
              type="button"
              onClick={() => setStage('setup')}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Configure New Test
            </button>
          </div>
        </div>

        {cbtGateError && (
          <UpgradePrompt
            title="Daily Free CBT Limit Reached"
            description={cbtGateError}
            currentUser={currentUser}
            onStartTrialSuccess={(user, billing) => {
              onBillingUpdated(user, billing);
              setCbtGateError('');
            }}
            onViewPlans={onNavigatePricing}
            onSignInPrompt={onRequireAuth}
          />
        )}

        <AdBanner
          currentUser={currentUser}
          onUpgrade={onNavigatePricing}
          contextLabel="CBT Results"
        />

        {/* Filter Review Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Answer Key &amp; Step-by-Step Review
          </h2>
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                { id: 'all', label: `All (${sessionQuestions.length})` },
                {
                  id: 'wrong',
                  label: `Missed (${lastAttempt.answers.filter((a) => !a.isCorrect).length})`,
                },
                {
                  id: 'flagged',
                  label: `Flagged (${lastAttempt.answers.filter((a) => a.flagged).length})`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setReviewFilter(tab.id)}
                className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  reviewFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Review Question Cards */}
        <div className="space-y-4">
          {filteredReview.map((question) => {
            const idx = sessionQuestions.findIndex((q) => q.id === question.id);
            const ans = lastAttempt.answers[idx];
            const selectedOpt = question.options.find((o) => o.id === ans.selectedOptionId);
            const correctOpt = question.options.find((o) => o.isCorrect);

            return (
              <div
                key={question.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      Q{idx + 1}
                    </span>
                    {' · '}
                    <span>{question.subjectName}</span>
                    {' · '}
                    <span>{question.topic}</span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      ans.isCorrect
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {ans.isCorrect ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Correct
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" aria-hidden="true" /> Incorrect
                      </>
                    )}
                  </span>
                </div>

                <h3 className="mt-2.5 text-base font-semibold text-slate-900 dark:text-white">
                  {question.prompt}
                </h3>

                <div className="mt-3 space-y-1.5 text-sm">
                  <p className="text-slate-700 dark:text-slate-300">
                    Your answer:{' '}
                    <strong
                      className={
                        ans.isCorrect
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }
                    >
                      {selectedOpt ? `${selectedOpt.label}. ${selectedOpt.text}` : 'Not answered'}
                    </strong>
                  </p>
                  {!ans.isCorrect && correctOpt && (
                    <p className="text-slate-700 dark:text-slate-300">
                      Correct answer:{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        {correctOpt.label}. {correctOpt.text}
                      </strong>
                    </p>
                  )}
                </div>

                <div className="mt-3 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  <strong className="text-xs text-slate-900 dark:text-white">Explanation: </strong>
                  {question.explanation}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
};
