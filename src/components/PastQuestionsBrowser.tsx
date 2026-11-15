import React, { useMemo, useState } from 'react';
import { Bookmark, Bot, CheckCircle2, CloudDownload, Eye, EyeOff, Lock, Search, XCircle } from 'lucide-react';
import type { BillingProfileState } from '../lib/billingApi';
import { FREE_QUESTIONS_PER_SUBJECT, getUserEntitlements } from '../lib/plans';
import type { ExamCode, ExamMasterDatabase, Question, User } from '../types/database';
import { AdBanner } from './AdBanner';
import { UpgradePrompt } from './UpgradePrompt';

interface PastQuestionsBrowserProps {
  db: ExamMasterDatabase;
  currentUser: User | null;
  initialSubjectId?: string;
  onToggleBookmark: (questionId: string) => void;
  onToggleCacheSubject: (subjectId: string) => void;
  onLaunchCBT: (subjectIds: string[], examCode: ExamCode) => void;
  onAskAIQuestion: (question: Question) => void;
  onNavigatePricing: () => void;
  onSignInPrompt: () => void;
  onBillingUpdated: (updatedUser: User, billing: BillingProfileState) => void;
}

export const PastQuestionsBrowser: React.FC<PastQuestionsBrowserProps> = ({
  db,
  currentUser,
  initialSubjectId,
  onToggleBookmark,
  onToggleCacheSubject,
  onLaunchCBT,
  onAskAIQuestion,
  onNavigatePricing,
  onSignInPrompt,
  onBillingUpdated,
}) => {
  const [selectedExam, setSelectedExam] = useState<'ALL' | ExamCode>('ALL');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(initialSubjectId || 'sub-english');
  const [selectedYear, setSelectedYear] = useState<'ALL' | number>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [bookmarksOnly, setBookmarksOnly] = useState(false);
  const [offlineGateNotice, setOfflineGateNotice] = useState(false);

  // Track interactive user guesses & revealed explanations per question
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  const entitlements = getUserEntitlements(currentUser);

  const years = useMemo(() => {
    const set = new Set<number>();
    db.questions.forEach((q) => set.add(q.year));
    return Array.from(set).sort((a, b) => b - a);
  }, [db.questions]);

  const filteredQuestions = useMemo(() => {
    return db.questions.filter((q) => {
      if (selectedExam !== 'ALL' && q.examCode !== selectedExam) return false;
      if (selectedSubjectId !== 'ALL' && q.subjectId !== selectedSubjectId) return false;
      if (selectedYear !== 'ALL' && q.year !== selectedYear) return false;
      if (bookmarksOnly && !db.bookmarkedQuestionIds.includes(q.id)) return false;
      if (searchQuery.trim()) {
        const needle = searchQuery.trim().toLowerCase();
        const hay = `${q.prompt} ${q.topic} ${q.subjectName} ${q.explanation}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [db.questions, db.bookmarkedQuestionIds, selectedExam, selectedSubjectId, selectedYear, bookmarksOnly, searchQuery]);

  // Enforce Free limit of 5 questions per subject
  const { visibleQuestions, hiddenCount } = useMemo(() => {
    const limitPerSub = entitlements.questionsPerSubjectLimit;
    if (limitPerSub === null) {
      return { visibleQuestions: filteredQuestions, hiddenCount: 0 };
    }
    const perSubjectCounts = new Map<string, number>();
    const visible: Question[] = [];
    for (const q of filteredQuestions) {
      const seen = perSubjectCounts.get(q.subjectId) || 0;
      if (seen < limitPerSub) {
        perSubjectCounts.set(q.subjectId, seen + 1);
        visible.push(q);
      }
    }
    return {
      visibleQuestions: visible,
      hiddenCount: Math.max(0, filteredQuestions.length - visible.length),
    };
  }, [filteredQuestions, entitlements.questionsPerSubjectLimit]);

  const activeSubject = db.subjects.find((s) => s.id === selectedSubjectId);
  const isSubjectCached = selectedSubjectId !== 'ALL' && db.cachedSubjectIds.includes(selectedSubjectId);

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectOption = (question: Question, optionId: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [question.id]: optionId }));
    setRevealedIds((prev) => ({ ...prev, [question.id]: true }));
  };

  const handleOfflineToggleClick = (subjectId: string) => {
    if (!entitlements.offlineAccess) {
      setOfflineGateNotice(true);
      return;
    }
    setOfflineGateNotice(false);
    onToggleCacheSubject(subjectId);
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Page Header & Offline Pack Control */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Past Questions Browser
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Browse verified JAMB, WAEC, and NECO questions by subject and year with worked solutions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {selectedSubjectId !== 'ALL' && (
            <button
              type="button"
              onClick={() => handleOfflineToggleClick(selectedSubjectId)}
              className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                isSubjectCached && entitlements.offlineAccess
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {!entitlements.offlineAccess ? (
                <Lock className="h-4 w-4 text-amber-600" aria-hidden="true" />
              ) : (
                <CloudDownload className="h-4 w-4" aria-hidden="true" />
              )}
              {isSubjectCached && entitlements.offlineAccess
                ? `Cached Offline (${activeSubject?.name})`
                : `Save ${activeSubject?.name} Offline`}
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              onLaunchCBT(
                selectedSubjectId === 'ALL' ? ['sub-english', 'sub-math'] : [selectedSubjectId],
                selectedExam === 'ALL' ? 'JAMB' : selectedExam
              )
            }
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            Practice Filtered in CBT
          </button>
        </div>
      </div>

      {offlineGateNotice && !entitlements.offlineAccess && (
        <UpgradePrompt
          compact
          title="Offline Saved Questions Require a Paid or Trial Plan"
          description="Save subjects to IndexedDB for low-data & offline Android revision with Weekly, Premium, Exam Season Pass, or your 3-Day Free Trial."
          currentUser={currentUser}
          onStartTrialSuccess={(user, billing) => {
            onBillingUpdated(user, billing);
            setOfflineGateNotice(false);
          }}
          onViewPlans={onNavigatePricing}
          onSignInPrompt={onSignInPrompt}
        />
      )}

      <AdBanner
        currentUser={currentUser}
        onUpgrade={onNavigatePricing}
        contextLabel="Past Questions"
      />

      {/* Filters Toolbar */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        {/* Exam Filter Segmented Control */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {(['ALL', 'JAMB', 'WAEC', 'NECO'] as const).map((exam) => (
              <button
                key={exam}
                type="button"
                onClick={() => setSelectedExam(exam)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  selectedExam === exam
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {exam === 'ALL' ? 'All Exams' : exam}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setBookmarksOnly((v) => !v)}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              bookmarksOnly
                ? 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
            Saved ({db.bookmarkedQuestionIds.length})
          </button>
        </div>

        {/* Subject, Year, and Search Row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <label htmlFor="pq-subject" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Subject
            </label>
            <select
              id="pq-subject"
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="ALL">All Subjects</option>
              {db.subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="pq-year" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Year
            </label>
            <select
              id="pq-year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
              className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="ALL">All Years</option>
              {years.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-5">
            <label htmlFor="pq-search" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Search topic or keyword
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="pq-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. logarithms, concord, trigonometry..."
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        <span className="tabular-nums">
          Showing {visibleQuestions.length} of {filteredQuestions.length}{' '}
          {filteredQuestions.length === 1 ? 'question' : 'questions'}
          {entitlements.questionsPerSubjectLimit !== null &&
            ` (Free tier: ${FREE_QUESTIONS_PER_SUBJECT} per subject)`}
        </span>
        {selectedSubjectId !== 'ALL' && isSubjectCached && entitlements.offlineAccess && (
          <span className="text-emerald-700 dark:text-emerald-400">
            Available offline on this device
          </span>
        )}
      </div>

      {/* Questions List */}
      {filteredQuestions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            No matching questions found
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Try switching to All Years or clearing your search filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedExam('ALL');
              setSelectedSubjectId('ALL');
              setSelectedYear('ALL');
              setSearchQuery('');
              setBookmarksOnly(false);
            }}
            className="mt-4 min-h-[40px] rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {visibleQuestions.map((question, index) => {
            const pickedOptionId = selectedAnswers[question.id];
            const isRevealed = !!revealedIds[question.id];
            const isBookmarked = db.bookmarkedQuestionIds.includes(question.id);
            const correctOption = question.options.find((o) => o.isCorrect);

            return (
              <article
                key={question.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Clean Unboxed Metadata Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      Q{index + 1}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {question.examCode}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{question.year}</span>
                    <span aria-hidden="true">·</span>
                    <span>{question.subjectName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{question.topic}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleBookmark(question.id)}
                    aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark question'}
                    className={`flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border transition-colors ${
                      isBookmarked
                        ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'border-slate-200 text-slate-400 hover:text-slate-700 dark:border-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <Bookmark className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {/* Optional Comprehension Passage */}
                {question.passage && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                    <div className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Reading Passage
                    </div>
                    {question.passage}
                  </div>
                )}

                {/* Question Prompt */}
                <h2 className="mt-3 text-base sm:text-lg font-semibold leading-snug text-slate-900 dark:text-white">
                  {question.prompt}
                </h2>

                {/* Interactive Options */}
                <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {question.options.map((opt) => {
                    const isPicked = pickedOptionId === opt.id;
                    let optionStyle =
                      'border-slate-200 bg-white text-slate-800 hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-emerald-700';

                    if (isRevealed) {
                      if (opt.isCorrect) {
                        optionStyle =
                          'border-emerald-500 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-100';
                      } else if (isPicked && !opt.isCorrect) {
                        optionStyle =
                          'border-rose-400 bg-rose-50 text-rose-950 dark:border-rose-600 dark:bg-rose-950/40 dark:text-rose-100';
                      }
                    }

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectOption(question, opt.id)}
                        className={`flex min-h-[48px] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${optionStyle}`}
                      >
                        <span className="flex items-start gap-2.5">
                          <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                            {opt.label}.
                          </span>
                          <span>{opt.text}</span>
                        </span>
                        {isRevealed && opt.isCorrect && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        )}
                        {isRevealed && isPicked && !opt.isCorrect && (
                          <XCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Toggle Answer & Explanation */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3.5 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => toggleReveal(question.id)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                      {isRevealed ? (
                        <>
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                          Hide Answer
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" aria-hidden="true" />
                          {entitlements.fullExplanations ? 'Show Answer & Explanation' : 'Show Answer Key'}
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onAskAIQuestion(question)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                    >
                      <Bot className="h-4 w-4" aria-hidden="true" />
                      Ask AI
                    </button>
                  </div>
                  {isRevealed && correctOption && (
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Correct Option: {correctOption.label}
                    </span>
                  )}
                </div>

                {isRevealed &&
                  (entitlements.fullExplanations ? (
                    <div className="mt-3 rounded-xl bg-emerald-50/70 p-4 text-sm leading-relaxed text-slate-800 dark:bg-emerald-950/30 dark:text-slate-200">
                      <div className="mb-1 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        Explanation
                      </div>
                      {question.explanation}
                    </div>
                  ) : (
                    <div className="mt-3">
                      <UpgradePrompt
                        compact
                        title="Full Step-by-Step Explanations Locked on Free Plan"
                        description="Upgrade to Weekly (₦500), Premium (₦1,500), Exam Season Pass (₦3,500), or start your 3-Day Free Trial to unlock detailed worked explanations for every past question."
                        currentUser={currentUser}
                        onStartTrialSuccess={onBillingUpdated}
                        onViewPlans={onNavigatePricing}
                        onSignInPrompt={onSignInPrompt}
                      />
                    </div>
                  ))}
              </article>
            );
          })}

          {hiddenCount > 0 && (
            <UpgradePrompt
              title={`${hiddenCount} More Past ${hiddenCount === 1 ? 'Question' : 'Questions'} Ready to Unlock`}
              description={`The Free plan lets you preview ${FREE_QUESTIONS_PER_SUBJECT} past questions per subject. Unlock unlimited questions across all ${db.subjects.length} Nigerian subjects plus full worked explanations.`}
              currentUser={currentUser}
              onStartTrialSuccess={onBillingUpdated}
              onViewPlans={onNavigatePricing}
              onSignInPrompt={onSignInPrompt}
            />
          )}
        </div>
      )}
    </div>
  );
};
