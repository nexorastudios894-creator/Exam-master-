import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Bot,
  Crown,
  Download,
  GraduationCap,
  Layers,
  Lock,
  MonitorCheck,
  Newspaper,
  WifiOff,
} from 'lucide-react';
import { getUserEntitlements, PLANS } from '../lib/plans';
import type {
  AppView,
  Attempt,
  ExamMasterDatabase,
  NewsPost,
  Result,
  Scholarship,
  User,
} from '../types/database';
import { AdBanner } from './AdBanner';
import { OnboardingBanner } from './AuthGate';
import { StudyDashboard } from './StudyDashboard';

interface HomePageProps {
  db: ExamMasterDatabase;
  currentUser: User | null;
  onNavigate: (view: AppView) => void;
  onQuickStartCBT: (subjectIds: string[]) => void;
  onBrowseSubject: (subjectId: string) => void;
  onSelectNews: (post: NewsPost) => void;
  onUpdateUser: (user: User) => void;
  pwaInstall: {
    isInstallable: boolean;
    isInstalled: boolean;
    isIOS: boolean;
    install: () => Promise<boolean>;
  };
}

export const HomePage: React.FC<HomePageProps> = ({
  db,
  currentUser,
  onNavigate,
  onQuickStartCBT,
  onBrowseSubject,
  onSelectNews,
  onUpdateUser,
  pwaInstall,
}) => {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const userResults: Result[] = currentUser
    ? db.results.filter((r) => r.userId === currentUser.uid)
    : [];
  const userAttempts: Attempt[] = currentUser
    ? db.attempts.filter((a) => a.userId === currentUser.uid)
    : [];

  const avgScore =
    userResults.length > 0
      ? Math.round(userResults.reduce((acc, r) => acc + r.jambScore, 0) / userResults.length)
      : 0;

  const featuredNews = db.news_posts.slice(0, 3);
  const openScholarships: Scholarship[] = db.scholarships.slice(0, 2);

  return (
    <div className="space-y-12 pb-10">
      {/* First-Signup Onboarding Banner */}
      {currentUser && !currentUser.onboarded && (
        <OnboardingBanner user={currentUser} onComplete={onUpdateUser} />
      )}

      {/* Hero Split Section */}
      <section className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
        <div className="flex flex-col justify-center space-y-6 lg:col-span-7">
          <div className="text-xs font-semibold tracking-wide text-emerald-700 dark:text-emerald-400">
            JSS · SSS · JAMB UTME · WAEC WASSCE · NECO SSCE
          </div>

          <h1
            className="text-balance font-extrabold tracking-tight text-slate-900 dark:text-white"
            style={{ fontSize: 'clamp(2rem, 3.8vw, 3.25rem)', lineHeight: 1.12 }}
          >
            Pass JAMB, WAEC &amp; NECO with calm, timed precision.
          </h1>

          <p className="max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
            Built for Nigerian secondary school students and UTME candidates. Master all{' '}
            <span className="font-semibold text-slate-900 dark:text-white">
              {db.subjects.length} Nigerian curriculum subjects
            </span>
            , take timed JAMB-style CBT mocks, and get step-by-step tutoring from Exam Master AI.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('cbt')}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 whitespace-nowrap"
            >
              <MonitorCheck className="h-4 w-4" aria-hidden="true" />
              Start CBT Practice
            </button>
            <button
              type="button"
              onClick={() => onNavigate('subjects')}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              Browse {db.subjects.length} Subjects
            </button>
            <button
              type="button"
              onClick={() => onNavigate('ai-tutor')}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200 whitespace-nowrap"
            >
              <Bot className="h-4 w-4" aria-hidden="true" />
              Exam Master AI
            </button>
            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-900 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 whitespace-nowrap"
            >
              <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              {currentUser && getUserEntitlements(currentUser).isPaidOrTrial
                ? `${PLANS[getUserEntitlements(currentUser).effectivePlan].name} Active`
                : 'Plans & 3-Day Free Trial'}
            </button>

            {!pwaInstall.isInstalled && pwaInstall.isInstallable && (
              <button
                type="button"
                onClick={() => void pwaInstall.install()}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 whitespace-nowrap"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Install App
              </button>
            )}
            {!pwaInstall.isInstalled && !pwaInstall.isInstallable && pwaInstall.isIOS && (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Install on iPhone
              </button>
            )}
          </div>
        </div>

        {/* Hero Visual */}
        <div className="lg:col-span-5">
          <div className="relative h-64 sm:h-80 lg:h-full min-h-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-emerald-950 dark:border-slate-800">
            {!heroImgFailed ? (
              <img
                src="/src/assets/images/hero_exam_master_1794582028078.jpg"
                alt="Nigerian students preparing for JAMB and WAEC exams together in a bright library"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-emerald-800 via-emerald-900 to-slate-950 p-6 text-center text-white">
                <GraduationCap className="h-12 w-12 text-amber-400" aria-hidden="true" />
                <p className="mt-3 text-lg font-semibold">Exam Master Nigeria</p>
                <p className="mt-1 text-xs text-emerald-100">JAMB · WAEC · NECO Study Hub</p>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
              <p className="text-xs font-medium text-amber-300">
                2026/2027 Examination Readiness
              </p>
              <p className="mt-1 text-sm font-semibold">
                {currentUser
                  ? `${currentUser.classLevel} · Target: ${currentUser.targetSchool}`
                  : 'Aligned with NERDC, WAEC, NECO & JAMB syllabi'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <section aria-label="Platform snapshot" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => onNavigate('subjects')}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900"
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Nigerian Subjects</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {db.subjects.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">JSS, SSS, JAMB &amp; Trade</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('questions')}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900"
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Past Questions</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {db.questions.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">With worked solutions</p>
        </button>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Your Avg UTME</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {currentUser ? `${avgScore}/400` : 'Sign In'}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {currentUser ? `Across ${userResults.length} tests` : 'To track progress'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('schools')}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900"
        >
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">School Directory</p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {db.schools.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Cut-offs &amp; courses</p>
        </button>
      </section>

      <AdBanner
        currentUser={currentUser}
        onUpgrade={() => onNavigate('pricing')}
        contextLabel="JAMB · WAEC · NECO Hub"
      />

      {/* Quick JAMB Practice Launchers */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Quick JAMB Practice Launchers
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Jump straight into a timed CBT session or study subject-by-subject explanations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('questions')}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 whitespace-nowrap"
          >
            Past Questions Browser
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                JAMB UTME · Compulsory
              </div>
              <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                Use of English (2021–2024)
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                Comprehension, lexis &amp; structure, oral stress, antonyms, and idioms with detailed rules.
              </p>
            </div>
            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onQuickStartCBT(['sub-english'])}
                className="min-h-[42px] flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
              >
                Start English CBT
              </button>
              <button
                type="button"
                onClick={() => onBrowseSubject('sub-english')}
                className="min-h-[42px] rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <BookOpen className="inline h-4 w-4 mr-1" aria-hidden="true" />
                Study
              </button>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <div className="text-xs font-medium text-amber-700 dark:text-amber-400">
                JAMB UTME · Core Science &amp; Commercial
              </div>
              <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                Mathematics (2021–2024)
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                Indices, logarithms, quadratic roots, calculus, matrices, trigonometry, and probability.
              </p>
            </div>
            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onQuickStartCBT(['sub-math'])}
                className="min-h-[42px] flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
              >
                Start Math CBT
              </button>
              <button
                type="button"
                onClick={() => onBrowseSubject('sub-math')}
                className="min-h-[42px] rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Study
              </button>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Combined Timed Simulation
              </div>
              <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                English + Mathematics Mock
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                Experience the multi-subject JAMB CBT switcher, built-in calculator, and scaled /400 scoring.
              </p>
            </div>
            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => onQuickStartCBT(['sub-english', 'sub-math'])}
                className="min-h-[42px] w-full rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap"
              >
                Launch Combined Mock
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Protected User Study Dashboard */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Your Study Dashboard
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Track UTME scores, spot weak subjects, and review every completed CBT attempt.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 whitespace-nowrap"
          >
            {currentUser ? 'Full history & account' : 'Sign in to unlock'}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {currentUser ? (
          <StudyDashboard
            results={userResults}
            attempts={userAttempts}
            questions={db.questions}
            subjects={db.subjects}
            onStartSubjectCBT={(subId) => onQuickStartCBT([subId])}
          />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                PROTECTED STUDY ANALYTICS &amp; CBT HISTORY
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Sign in to save your CBT scores and unlock personalized analytics
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Your profile, CBT history, weak-subject insights, and Exam Master AI chats are secured to your account.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="min-h-[44px] shrink-0 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
            >
              Sign In / Sign Up
            </button>
          </div>
        )}
      </section>

      {/* Latest News & Scholarships Preview */}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Latest School News &amp; Cut-Off Updates
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('news')}
              className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 whitespace-nowrap"
            >
              All news
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {featuredNews.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => onSelectNews(post)}
                className="flex w-full flex-col gap-4 p-5 text-left transition-colors hover:bg-slate-50 sm:flex-row sm:items-center dark:hover:bg-slate-800/50"
              >
                <div className="h-24 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:w-36 dark:bg-slate-800">
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {post.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {new Date(post.publishedAt).toLocaleDateString('en-NG', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{post.readTimeMins} min read</span>
                  </div>
                  <h3 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-white line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                    {post.summary}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Active Scholarships
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('schools')}
              className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 whitespace-nowrap"
            >
              Schools Directory
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-3">
            {openScholarships.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-amber-700 dark:text-amber-400">{item.status}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">Due {item.deadline}</span>
                </div>
                <h3 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-1 font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {item.amount}
                </p>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {item.eligibility}
                </p>
              </div>
            ))}

            <div className="rounded-2xl border border-slate-200 bg-emerald-50/70 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                Low-Data Android Ready
              </div>
              <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">
                &ldquo;Practicing Use of English and Mathematics offline on my commute helped lift my
                UTME mock score from 214 to 298.&rdquo;
              </p>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                Chisom Eze · Admitted to UNN Medicine &amp; Surgery (2025 Cohort)
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* iOS Install Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Newspaper className="h-5 w-5" aria-hidden="true" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Install Exam Master on iPhone
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              1. Tap the <strong>Share</strong> icon in your Safari toolbar.
              <br />
              2. Scroll down and tap <strong>Add to Home Screen</strong>.
              <br />
              3. Open Exam Master Nigeria offline anytime.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 min-h-[44px] w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
