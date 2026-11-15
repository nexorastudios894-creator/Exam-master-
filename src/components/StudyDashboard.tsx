import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Target, TrendingUp } from 'lucide-react';
import type { Attempt, Question, Result, Subject } from '../types/database';

interface StudyDashboardProps {
  results: Result[];
  attempts: Attempt[];
  questions: Question[];
  subjects: Subject[];
  onStartSubjectCBT: (subjectId: string) => void;
  compact?: boolean;
}

export const StudyDashboard: React.FC<StudyDashboardProps> = ({
  results,
  attempts,
  questions,
  subjects,
  onStartSubjectCBT,
  compact = false,
}) => {
  const [inspectAttemptId, setInspectAttemptId] = useState<string | null>(null);

  const metrics = useMemo(() => {
    if (results.length === 0) {
      return {
        testsTaken: 0,
        avgJambScore: 0,
        avgAccuracy: 0,
        bestScore: 0,
        subjectStats: [] as Array<{
          subjectId: string;
          subjectName: string;
          correct: number;
          total: number;
          percentage: number;
        }>,
        weakSubjects: [] as Array<{
          subjectId: string;
          subjectName: string;
          percentage: number;
        }>,
      };
    }

    const totalJamb = results.reduce((sum, r) => sum + r.jambScore, 0);
    const totalAcc = results.reduce((sum, r) => sum + r.percentage, 0);
    const best = Math.max(...results.map((r) => r.jambScore));

    const subjectMap = new Map<string, { subjectName: string; correct: number; total: number }>();
    for (const res of results) {
      for (const sb of res.subjectBreakdown) {
        const prev = subjectMap.get(sb.subjectId) || {
          subjectName: sb.subjectName,
          correct: 0,
          total: 0,
        };
        subjectMap.set(sb.subjectId, {
          subjectName: sb.subjectName,
          correct: prev.correct + sb.correct,
          total: prev.total + sb.total,
        });
      }
    }

    const subjectStats = Array.from(subjectMap.entries())
      .map(([subjectId, data]) => ({
        subjectId,
        subjectName: data.subjectName,
        correct: data.correct,
        total: data.total,
        percentage: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
      }))
      .sort((a, b) => a.percentage - b.percentage);

    const weakSubjects = subjectStats.filter((s) => s.percentage < 70);

    return {
      testsTaken: results.length,
      avgJambScore: Math.round(totalJamb / results.length),
      avgAccuracy: Math.round(totalAcc / results.length),
      bestScore: best,
      subjectStats,
      weakSubjects,
    };
  }, [results]);

  const recentResults = useMemo(() => {
    return [...results]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-8);
  }, [results]);

  const inspectedAttempt = useMemo(
    () => attempts.find((a) => a.id === inspectAttemptId) || null,
    [attempts, inspectAttemptId]
  );

  const inspectedResult = useMemo(
    () => results.find((r) => r.attemptId === inspectAttemptId) || null,
    [results, inspectAttemptId]
  );

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}m ${rem.toString().padStart(2, '0')}s`;
  };

  return (
    <section aria-label="Study Dashboard" className="space-y-6">
      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Average UTME</span>
            <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {metrics.avgJambScore}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">/400</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Best score: <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{metrics.bestScore}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Accuracy Rate</span>
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {metrics.avgAccuracy}%
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Target benchmark: 75%+
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>CBT Completed</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {metrics.testsTaken}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Timed mock sessions
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Needs Focus</span>
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {metrics.weakSubjects.length}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {metrics.weakSubjects.length > 0
              ? metrics.weakSubjects.map((s) => s.subjectName).join(', ')
              : 'All subjects above 70%'}
          </p>
        </div>
      </div>

      {/* Charts Grid: Score Trend + Weak Subjects Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Progress Trend Bar Chart */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                CBT Score Progression
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Scaled UTME score (out of 400) across recent sessions
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Last {recentResults.length} attempts
            </span>
          </div>

          {recentResults.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Complete your first CBT practice test to view your score trend.
            </div>
          ) : (
            <div className="mt-6">
              <div className="flex h-48 items-end gap-2 sm:gap-4 border-b border-slate-200 pb-2 dark:border-slate-800">
                {recentResults.map((res, idx) => {
                  const heightPct = Math.max(12, Math.round((res.jambScore / 400) * 100));
                  const isStrong = res.jambScore >= 250;
                  return (
                    <div key={res.id} className="flex flex-1 flex-col items-center justify-end h-full group">
                      <span className="mb-1.5 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                        {res.jambScore}
                      </span>
                      <div className="relative flex w-full max-w-[44px] flex-1 items-end">
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={`w-full rounded-t-lg transition-all ${
                            isStrong
                              ? 'bg-emerald-600 dark:bg-emerald-500'
                              : 'bg-amber-500 dark:bg-amber-400'
                          }`}
                          title={`Attempt ${idx + 1}: ${res.jambScore}/400 (${res.percentage}%)`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2 sm:gap-4">
                {recentResults.map((res, idx) => (
                  <div
                    key={res.id}
                    className="flex-1 text-center font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums"
                  >
                    #{idx + 1}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Subject Mastery & Weak Subject Detection */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Subject Mastery &amp; Weak Areas
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Subjects below 70% are prioritized for targeted drills
          </p>

          <div className="mt-5 space-y-4">
            {metrics.subjectStats.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No subject history recorded yet.
              </p>
            ) : (
              metrics.subjectStats.map((stat) => {
                const isWeak = stat.percentage < 70;
                return (
                  <div key={stat.subjectId} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {stat.subjectName}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          · {isWeak ? 'Needs Drill' : 'Strong'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                          {stat.percentage}% ({stat.correct}/{stat.total})
                        </span>
                        <button
                          type="button"
                          onClick={() => onStartSubjectCBT(stat.subjectId)}
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:text-emerald-400 dark:hover:bg-emerald-950/50 whitespace-nowrap"
                        >
                          Drill
                          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        style={{ width: `${Math.max(4, stat.percentage)}%` }}
                        className={`h-full rounded-full transition-all ${
                          isWeak
                            ? 'bg-amber-500 dark:bg-amber-400'
                            : 'bg-emerald-600 dark:bg-emerald-500'
                        }`}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {subjects.length > 0 && metrics.weakSubjects.length > 0 && (
            <div className="mt-5 rounded-xl bg-amber-50 p-3.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Recommended next drill: <strong>{metrics.weakSubjects[0].subjectName}</strong> (currently at{' '}
              <span className="font-mono tabular-nums">{metrics.weakSubjects[0].percentage}%</span>).
            </div>
          )}
        </div>
      </div>

      {/* Practice History Table */}
      {!compact && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Practice History
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect past CBT attempts and review missed questions
              </p>
            </div>
          </div>

          {attempts.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No practice history yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Exam &amp; Subjects</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Duration</th>
                    <th className="px-5 py-3">Score</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {[...attempts]
                    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
                    .map((attempt) => {
                      const res = results.find((r) => r.attemptId === attempt.id);
                      const isExpanded = inspectAttemptId === attempt.id;
                      return (
                        <React.Fragment key={attempt.id}>
                          <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            <td className="px-5 py-3.5">
                              <div className="font-medium text-slate-900 dark:text-white">
                                {attempt.examCode} · {attempt.subjectNames.join(', ')}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                {attempt.questionIds.length} questions
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">
                              {new Date(attempt.completedAt).toLocaleDateString('en-NG', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                {formatDuration(attempt.durationSeconds)}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 font-mono font-semibold whitespace-nowrap tabular-nums">
                              {res ? (
                                <span
                                  className={
                                    res.percentage >= 70
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-amber-700 dark:text-amber-400'
                                  }
                                >
                                  {res.jambScore}/400 ({res.percentage}%)
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setInspectAttemptId(isExpanded ? null : attempt.id)}
                                className="min-h-[36px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                {isExpanded ? 'Close Review' : 'Review Answers'}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && inspectedAttempt && (
                            <tr>
                              <td colSpan={5} className="bg-slate-50 px-5 py-4 dark:bg-slate-950/60">
                                <div className="space-y-3">
                                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    Attempt Breakdown ({inspectedResult?.rawCorrect ?? 0}/{inspectedAttempt.questionIds.length} correct)
                                  </div>
                                  {inspectedAttempt.answers.map((ans, qIdx) => {
                                    const question = questions.find((q) => q.id === ans.questionId);
                                    if (!question) return null;
                                    const selectedOpt = question.options.find((o) => o.id === ans.selectedOptionId);
                                    const correctOpt = question.options.find((o) => o.isCorrect);
                                    return (
                                      <div
                                        key={ans.questionId}
                                        className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900"
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <p className="font-medium text-slate-900 dark:text-white">
                                            {qIdx + 1}. {question.prompt}
                                          </p>
                                          <span
                                            className={`shrink-0 font-semibold ${
                                              ans.isCorrect
                                                ? 'text-emerald-700 dark:text-emerald-400'
                                                : 'text-rose-700 dark:text-rose-400'
                                            }`}
                                          >
                                            {ans.isCorrect ? 'Correct' : 'Missed'}
                                          </span>
                                        </div>
                                        <p className="mt-1.5 text-slate-600 dark:text-slate-300">
                                          Your answer: <strong>{selectedOpt ? `${selectedOpt.label}. ${selectedOpt.text}` : 'Unanswered'}</strong>
                                          {' · '}
                                          Correct: <strong className="text-emerald-700 dark:text-emerald-400">{correctOpt?.label}. {correctOpt?.text}</strong>
                                        </p>
                                        <p className="mt-1 text-slate-500 dark:text-slate-400">
                                          {question.explanation}
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
