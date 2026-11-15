import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Bot, CheckCircle2, Moon, Sun, WifiOff, XCircle } from 'lucide-react';
import { AITutorPage } from './components/AITutorPage';
import { CBTPractice } from './components/CBTPractice';
import { HomePage } from './components/HomePage';
import { Navbar } from './components/Navbar';
import { NewsAndScholarships } from './components/NewsAndScholarships';
import { PastQuestionsBrowser } from './components/PastQuestionsBrowser';
import { PricingPage } from './components/PricingPage';
import { ProfileAndAdmin } from './components/ProfileAndAdmin';
import { SchoolsDirectory } from './components/SchoolsDirectory';
import { SubjectsPage } from './components/SubjectsPage';
import { PaystackCheckoutModal, type PaidPlanId } from './components/UpgradePrompt';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  consumeCbtAllowance,
  fetchServerBillingMe,
  markNotificationRead,
  mergeBillingIntoUser,
  type BillingProfileState,
} from './lib/billingApi';
import { auth } from './lib/firebase';
import {
  deleteQuestion as deleteFirestoreQuestion,
  fetchPublicCatalog,
  fetchUserActivity,
  loadOrCreateUserProfile,
  resetAndSeedFirestore,
  saveAttemptAndResult,
  upsertNewsPost,
  upsertQuestion,
  upsertSchool,
  upsertSubject,
} from './lib/firestoreService';
import { getUserEntitlements } from './lib/plans';
import {
  hydrateFromIDB,
  loadDatabaseSync,
  loadThemePreference,
  saveDatabaseSync,
  saveThemePreference,
} from './lib/storage';
import type {
  AppView,
  Attempt,
  ExamCode,
  ExamMasterDatabase,
  NewsPost,
  Question,
  Result,
  School,
  Subject,
  User,
  UserNotification,
} from './types/database';

export default function App() {
  const [db, setDb] = useState<ExamMasterDatabase>(() => loadDatabaseSync());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [activeView, setActiveView] = useState<AppView>('home');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadThemePreference());

  // Paystack checkout modal state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlanId>('season_pass');

  // Contextual navigation payloads
  const [pqInitialSubject, setPqInitialSubject] = useState<string | undefined>('sub-english');
  const [cbtConfig, setCbtConfig] = useState<{
    subjectIds?: string[];
    examCode?: ExamCode;
    autoStart?: boolean;
    key: number;
  }>({ key: 0 });
  const [selectedNewsPost, setSelectedNewsPost] = useState<NewsPost | null>(null);
  const [aiContext, setAiContext] = useState<{
    subjectId?: string;
    prompt?: string;
    key: number;
  }>({ key: 0 });

  const catalogFromFirestoreRef = useRef<boolean | null>(null);
  const autoSeededRef = useRef(false);

  const isOnline = useOnlineStatus();
  const pwaInstall = usePWAInstall();

  // Capture ?ref=EMN-XXXXXX referral link param into localStorage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const refCode = params.get('ref')?.trim().toUpperCase();
      if (refCode) {
        localStorage.setItem('emn_pending_ref', refCode);
        params.delete('ref');
        const nextUrl =
          window.location.pathname + (params.toString() ? `?${params.toString()}` : '') + window.location.hash;
        window.history.replaceState({}, '', nextUrl);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    saveThemePreference(theme);
  }, [theme]);

  const updateDb = useCallback((updater: (prev: ExamMasterDatabase) => ExamMasterDatabase) => {
    setDb((prev) => {
      const next = updater(prev);
      saveDatabaseSync(next);
      return next;
    });
  }, []);

  const syncServerBilling = useCallback(
    async (baseUser: User) => {
      try {
        const pendingRef = localStorage.getItem('emn_pending_ref') || undefined;
        const billing = await fetchServerBillingMe(pendingRef);
        if (pendingRef && billing.referredBy) {
          localStorage.removeItem('emn_pending_ref');
        }
        const merged = mergeBillingIntoUser(baseUser, billing);
        setCurrentUser(merged);
        setNotifications(billing.notifications || []);
        updateDb((prev) => ({
          ...prev,
          users: [merged, ...prev.users.filter((u) => u.uid !== merged.uid)],
          subscriptions: billing.subscriptions.length > 0 ? billing.subscriptions : prev.subscriptions,
        }));
      } catch {
        // Keep Firestore/local state if offline
      }
    },
    [updateDb]
  );

  const refreshCatalog = useCallback(async () => {
    try {
      const catalog = await fetchPublicCatalog();
      catalogFromFirestoreRef.current = catalog.fromFirestore;
      updateDb((prev) => ({
        ...prev,
        exams: catalog.exams,
        subjects: catalog.subjects,
        topics: catalog.topics,
        questions: catalog.questions,
        news_posts: catalog.newsPosts,
        schools: catalog.schools,
        scholarships: catalog.scholarships,
        lastSyncedAt: new Date().toISOString(),
      }));
    } catch {
      // Offline fallback remains active from localStorage/IndexedDB
    }
  }, [updateDb]);

  const loadAuthenticatedActivity = useCallback(
    async (uid: string) => {
      try {
        const activity = await fetchUserActivity(uid);
        updateDb((prev) => ({
          ...prev,
          attempts: activity.attempts,
          results: activity.results,
          subscriptions:
            activity.subscriptions.length > 0 ? activity.subscriptions : prev.subscriptions,
        }));
      } catch {
        // Keep local cache when offline
      }
    },
    [updateDb]
  );

  // Boot: hydrate IDB, fetch public Firestore catalog, and listen to Firebase Auth state
  useEffect(() => {
    void hydrateFromIDB().then((idbState) => {
      if (idbState && idbState.subjects.length >= 50) {
        setDb((prev) => ({
          ...prev,
          bookmarkedQuestionIds: idbState.bookmarkedQuestionIds,
          cachedSubjectIds: idbState.cachedSubjectIds,
        }));
      }
    });

    const catalogPromise = refreshCatalog();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const profile = await loadOrCreateUserProfile(fbUser);
          setCurrentUser(profile);
          updateDb((prev) => ({
            ...prev,
            currentUserId: profile.uid,
            users: [profile, ...prev.users.filter((u) => u.uid !== profile.uid)],
          }));
          await Promise.all([loadAuthenticatedActivity(profile.uid), syncServerBilling(profile)]);

          // If admin logs into an empty Firestore catalog, seed Firestore automatically once
          await catalogPromise;
          if (
            profile.role === 'admin' &&
            catalogFromFirestoreRef.current === false &&
            !autoSeededRef.current
          ) {
            autoSeededRef.current = true;
            await resetAndSeedFirestore(profile.uid);
            await refreshCatalog();
          }
        } catch {
          // Handled via handleFirestoreError or offline state
        }
      } else {
        setCurrentUser(null);
        setNotifications([]);
        updateDb((prev) => ({
          ...prev,
          currentUserId: null,
          attempts: [],
          results: [],
          subscriptions: [],
        }));
      }
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, [loadAuthenticatedActivity, refreshCatalog, syncServerBilling, updateDb]);

  // Register PWA service worker when supported
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      import('virtual:pwa-register')
        .then(({ registerSW }) => {
          registerSW({ immediate: true });
        })
        .catch(() => {
          // Ignore SW registration error in restricted environments
        });
    }
  }, []);

  const handleNavigate = (view: AppView) => {
    if (view !== 'news') setSelectedNewsPost(null);
    if (view !== 'cbt') {
      setCbtConfig((c) => ({ ...c, autoStart: false }));
    }
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQuickStartCBT = (subjectIds: string[], examCode: ExamCode = 'JAMB') => {
    setCbtConfig({
      subjectIds,
      examCode,
      autoStart: true,
      key: Date.now(),
    });
    setActiveView('cbt');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBrowseSubject = (subjectId: string) => {
    setPqInitialSubject(subjectId);
    setActiveView('questions');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectNewsFromHome = (post: NewsPost) => {
    setSelectedNewsPost(post);
    setActiveView('news');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAskAITutorSubject = (subject: Subject) => {
    setAiContext({
      subjectId: subject.id,
      prompt: `Explain the key ${subject.examTypes.join('/')} topics in ${subject.name} and give me 3 practice questions.`,
      key: Date.now(),
    });
    setActiveView('ai-tutor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAskAIQuestion = (question: Question) => {
    const optionsText = question.options.map((o) => `${o.label}. ${o.text}`).join('\n');
    setAiContext({
      subjectId: question.subjectId,
      prompt: `Please explain this ${question.examCode} ${question.year} ${question.subjectName} question step by step and why the correct option is right:\n\n${question.prompt}\n${optionsText}`,
      key: Date.now(),
    });
    setActiveView('ai-tutor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuthenticated = (user: User) => {
    setCurrentUser(user);
    updateDb((prev) => ({
      ...prev,
      currentUserId: user.uid,
      users: [user, ...prev.users.filter((u) => u.uid !== user.uid)],
    }));
    void loadAuthenticatedActivity(user.uid);
    void syncServerBilling(user);
  };

  const handleUpdateUser = (updated: User) => {
    setCurrentUser(updated);
    updateDb((prev) => ({
      ...prev,
      users: [updated, ...prev.users.filter((u) => u.uid !== updated.uid)],
    }));
  };

  const handleBillingUpdated = useCallback(
    (updatedUser: User, billing: BillingProfileState) => {
      setCurrentUser(updatedUser);
      if (Array.isArray(billing.notifications)) {
        setNotifications(billing.notifications);
      }
      updateDb((prev) => ({
        ...prev,
        users: [updatedUser, ...prev.users.filter((u) => u.uid !== updatedUser.uid)],
        subscriptions: billing.subscriptions,
      }));
    },
    [updateDb]
  );

  const handleMarkNotificationRead = useCallback(async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        notificationId === 'all' || n.id === notificationId ? { ...n, read: true } : n
      )
    );
    try {
      const res = await markNotificationRead(notificationId);
      setNotifications(res.notifications);
    } catch {
      // keep optimistic read state
    }
  }, []);

  const handleOpenCheckout = (plan: PaidPlanId) => {
    if (!currentUser) {
      handleNavigate('profile');
      return;
    }
    setCheckoutPlan(plan);
    setCheckoutOpen(true);
  };

  const handleBeforeStartCBT = useCallback(async (): Promise<{ allowed: boolean; message?: string }> => {
    if (!currentUser) {
      return {
        allowed: false,
        message: 'Please sign in first to start a timed CBT session.',
      };
    }
    try {
      const res = await consumeCbtAllowance();
      const updated = mergeBillingIntoUser(currentUser, res.billing);
      handleBillingUpdated(updated, res.billing);
      return { allowed: true };
    } catch (err) {
      return {
        allowed: false,
        message:
          err instanceof Error
            ? err.message
            : 'Daily Free CBT limit reached. Upgrade to unlock unlimited CBT tests.',
      };
    }
  }, [currentUser, handleBillingUpdated]);

  const handleLogout = () => {
    void signOut(auth);
  };

  const handleToggleBookmark = (questionId: string) => {
    updateDb((prev) => {
      const exists = prev.bookmarkedQuestionIds.includes(questionId);
      return {
        ...prev,
        bookmarkedQuestionIds: exists
          ? prev.bookmarkedQuestionIds.filter((id) => id !== questionId)
          : [...prev.bookmarkedQuestionIds, questionId],
      };
    });
  };

  const handleToggleCacheSubject = (subjectId: string) => {
    if (!getUserEntitlements(currentUser).offlineAccess) {
      handleNavigate('pricing');
      return;
    }
    updateDb((prev) => {
      const exists = prev.cachedSubjectIds.includes(subjectId);
      return {
        ...prev,
        cachedSubjectIds: exists
          ? prev.cachedSubjectIds.filter((id) => id !== subjectId)
          : [...prev.cachedSubjectIds, subjectId],
        lastSyncedAt: new Date().toISOString(),
      };
    });
  };

  const handleCompleteCBT = (attempt: Attempt, result: Result) => {
    if (!currentUser) return;
    const scopedAttempt: Attempt = { ...attempt, userId: currentUser.uid };
    const scopedResult: Result = { ...result, userId: currentUser.uid };

    updateDb((prev) => ({
      ...prev,
      attempts: [scopedAttempt, ...prev.attempts],
      results: [scopedResult, ...prev.results],
    }));

    void saveAttemptAndResult(currentUser.uid, scopedAttempt, scopedResult).catch(() => {
      // Keep local optimistic record if offline
    });
  };

  const questionCountsBySubject = useMemo(() => {
    const counts: Record<string, number> = {};
    db.questions.forEach((q) => {
      counts[q.subjectId] = (counts[q.subjectId] || 0) + 1;
    });
    if (counts['sub-english']) {
      counts['sub-use-of-english'] = counts['sub-english'];
    }
    return counts;
  }, [db.questions]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Navbar
        activeView={activeView}
        onNavigate={handleNavigate}
        currentUser={currentUser}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-24 sm:px-6 md:pb-14 lg:px-8">
        {/* In-App Bank Transfer Payment Notifications */}
        {currentUser && notifications.some((n) => !n.read) && (
          <div className="mb-5 space-y-2.5">
            {notifications
              .filter((n) => !n.read)
              .slice(0, 3)
              .map((notif) => (
                <div
                  key={notif.id}
                  role="status"
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4 shadow-xs ${
                    notif.type === 'payment_approved'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100'
                      : 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-100'
                  }`}
                >
                  <div className="flex items-start gap-2.5 text-xs sm:text-sm">
                    {notif.type === 'payment_approved' ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
                    )}
                    <div>
                      <div className="font-bold">{notif.title}</div>
                      <p className="mt-0.5 opacity-90">{notif.message}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleMarkNotificationRead(notif.id)}
                    className="rounded-lg border border-current/25 px-3 py-1 text-xs font-bold hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Dismiss
                  </button>
                </div>
              ))}
          </div>
        )}

        {!authReady && (activeView === 'ai-tutor' || activeView === 'profile') ? (
          <div className="flex min-h-[320px] items-center justify-center text-sm font-medium text-slate-500 dark:text-slate-400">
            Restoring your Firebase session...
          </div>
        ) : (
          <>
            {activeView === 'home' && (
              <HomePage
                db={db}
                currentUser={currentUser}
                onNavigate={handleNavigate}
                onQuickStartCBT={(subs) => handleQuickStartCBT(subs)}
                onBrowseSubject={handleBrowseSubject}
                onSelectNews={handleSelectNewsFromHome}
                onUpdateUser={handleUpdateUser}
                pwaInstall={pwaInstall}
              />
            )}

            {activeView === 'subjects' && (
              <SubjectsPage
                subjects={db.subjects}
                questionCountsBySubject={questionCountsBySubject}
                onBrowseSubject={handleBrowseSubject}
                onStartCBT={(subId) => handleQuickStartCBT([subId])}
                onAskAITutor={handleAskAITutorSubject}
              />
            )}

            {activeView === 'questions' && (
              <PastQuestionsBrowser
                key={pqInitialSubject || 'all'}
                db={db}
                currentUser={currentUser}
                initialSubjectId={pqInitialSubject}
                onToggleBookmark={handleToggleBookmark}
                onToggleCacheSubject={handleToggleCacheSubject}
                onLaunchCBT={(subs, exam) => handleQuickStartCBT(subs, exam)}
                onAskAIQuestion={handleAskAIQuestion}
                onNavigatePricing={() => handleNavigate('pricing')}
                onSignInPrompt={() => handleNavigate('profile')}
                onBillingUpdated={handleBillingUpdated}
              />
            )}

            {activeView === 'cbt' && (
              <CBTPractice
                key={cbtConfig.key}
                db={db}
                currentUser={currentUser}
                preselectedSubjectIds={cbtConfig.subjectIds}
                preselectedExamCode={cbtConfig.examCode}
                autoStart={cbtConfig.autoStart}
                onCompleteCBT={handleCompleteCBT}
                onBeforeStartCBT={handleBeforeStartCBT}
                onNavigatePricing={() => handleNavigate('pricing')}
                onRequireAuth={() => handleNavigate('profile')}
                onBillingUpdated={handleBillingUpdated}
              />
            )}

            {activeView === 'ai-tutor' && (
              <AITutorPage
                key={aiContext.key}
                currentUser={currentUser}
                subjects={db.subjects}
                initialSubjectId={aiContext.subjectId}
                initialPrompt={aiContext.prompt}
                onAuthenticated={handleAuthenticated}
                onUpdateUser={handleUpdateUser}
                onBillingUpdated={handleBillingUpdated}
                onGoToUpgrade={() => handleNavigate('pricing')}
              />
            )}

            {activeView === 'news' && (
              <NewsAndScholarships
                db={db}
                selectedPost={selectedNewsPost}
                onSelectPost={setSelectedNewsPost}
              />
            )}

            {activeView === 'schools' && <SchoolsDirectory db={db} />}

            {activeView === 'pricing' && (
              <PricingPage
                currentUser={currentUser}
                onSelectPaidPlan={handleOpenCheckout}
                onTrialActivated={handleBillingUpdated}
                onRequireAuth={() => handleNavigate('profile')}
              />
            )}

            {activeView === 'profile' && (
              <ProfileAndAdmin
                db={db}
                currentUser={currentUser}
                notifications={notifications}
                theme={theme}
                onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
                onAuthenticated={handleAuthenticated}
                onUpdateUser={handleUpdateUser}
                onBillingUpdated={handleBillingUpdated}
                onMarkNotificationRead={(id) => void handleMarkNotificationRead(id)}
                onOpenCheckout={handleOpenCheckout}
                onNavigatePricing={() => handleNavigate('pricing')}
                onLogout={handleLogout}
                onRefreshCatalog={refreshCatalog}
                onToggleCacheSubject={handleToggleCacheSubject}
                onStartSubjectCBT={(subId) => handleQuickStartCBT([subId])}
                onSaveQuestion={async (q: Question) => {
                  await upsertQuestion(q);
                  updateDb((prev) => {
                    const exists = prev.questions.some((item) => item.id === q.id);
                    return {
                      ...prev,
                      questions: exists
                        ? prev.questions.map((item) => (item.id === q.id ? q : item))
                        : [q, ...prev.questions],
                    };
                  });
                }}
                onDeleteQuestion={async (id: string) => {
                  await deleteFirestoreQuestion(id);
                  updateDb((prev) => ({
                    ...prev,
                    questions: prev.questions.filter((q) => q.id !== id),
                  }));
                }}
                onSaveSubject={async (s: Subject) => {
                  await upsertSubject(s);
                  updateDb((prev) => {
                    const exists = prev.subjects.some((item) => item.id === s.id);
                    return {
                      ...prev,
                      subjects: exists
                        ? prev.subjects.map((item) => (item.id === s.id ? s : item))
                        : [...prev.subjects, s],
                    };
                  });
                }}
                onSaveNewsPost={async (p: NewsPost) => {
                  await upsertNewsPost(p);
                  updateDb((prev) => {
                    const exists = prev.news_posts.some((item) => item.id === p.id);
                    return {
                      ...prev,
                      news_posts: exists
                        ? prev.news_posts.map((item) => (item.id === p.id ? p : item))
                        : [p, ...prev.news_posts],
                    };
                  });
                }}
                onSaveSchool={async (s: School) => {
                  await upsertSchool(s);
                  updateDb((prev) => {
                    const exists = prev.schools.some((item) => item.id === s.id);
                    return {
                      ...prev,
                      schools: exists
                        ? prev.schools.map((item) => (item.id === s.id ? s : item))
                        : [s, ...prev.schools],
                    };
                  });
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Clean Quiet Footer */}
      <footer className="hidden md:block border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-slate-500 dark:text-slate-400 lg:px-8">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-slate-900 dark:text-white">
              Exam Master Nigeria
            </span>
            <span>·</span>
            <span>JSS, SSS, JAMB, WAEC &amp; NECO Study Hub</span>
          </div>

          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => handleNavigate('subjects')}
              className="hover:text-slate-900 dark:hover:text-white"
            >
              Subjects
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('questions')}
              className="hover:text-slate-900 dark:hover:text-white"
            >
              Past Questions
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('cbt')}
              className="hover:text-slate-900 dark:hover:text-white"
            >
              CBT Practice
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('ai-tutor')}
              className="hover:text-slate-900 dark:hover:text-white"
            >
              AI Tutor
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('pricing')}
              className="hover:text-slate-900 dark:hover:text-white"
            >
              Pricing
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('schools')}
              className="hover:text-slate-900 dark:hover:text-white"
            >
              Schools
            </button>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              {theme === 'light' ? (
                <>
                  <Moon className="h-3.5 w-3.5" aria-hidden="true" /> Dark Mode
                </>
              ) : (
                <>
                  <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" /> Light Mode
                </>
              )}
            </button>
          </div>
        </div>
      </footer>

      {/* Floating Exam Master AI Chat Button (accessible across all pages) */}
      <button
        type="button"
        onClick={() => handleNavigate('ai-tutor')}
        aria-label="Open Exam Master AI Tutor"
        className={`fixed bottom-[70px] right-4 z-30 inline-flex min-h-[46px] items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs sm:text-sm font-semibold shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 lg:bottom-6 lg:right-6 ${
          activeView === 'ai-tutor'
            ? 'border-amber-400 bg-amber-400 text-slate-950'
            : 'border-emerald-500/30 bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
        }`}
      >
        <Bot className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Exam Master AI</span>
      </button>

      {/* Non-intrusive Offline Indicator Banner (only visible when offline) */}
      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-16 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg md:bottom-4"
        >
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
          Offline Mode — Cached questions ready
        </div>
      )}

      {/* Server-Verified Paystack Checkout Modal */}
      <PaystackCheckoutModal
        isOpen={checkoutOpen}
        initialPlan={checkoutPlan}
        currentUser={currentUser}
        onClose={() => setCheckoutOpen(false)}
        onPaymentComplete={handleBillingUpdated}
        onNeedAuth={() => handleNavigate('profile')}
      />
    </div>
  );
}
