import React, { useEffect, useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import {
  Bell,
  CheckCircle2,
  Clock,
  CloudDownload,
  Copy,
  CreditCard,
  Crown,
  Eye,
  Gift,
  Lock,
  LogOut,
  MailCheck,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Sun,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  adminGrantOrRevokePlan,
  applyReferralCode,
  fetchAdminBillingOverview,
  fetchAdminPendingPayments,
  mergeBillingIntoUser,
  reviewPendingPayment,
  startFreeTrial,
  type AdminBillingOverview,
  type BillingProfileState,
} from '../lib/billingApi';
import { auth } from '../lib/firebase';
import { resetAndSeedFirestore, updateUserProfile } from '../lib/firestoreService';
import { formatNaira, getUserEntitlements, PLANS } from '../lib/plans';
import { estimateCacheSizeKB } from '../lib/storage';
import type {
  ExamCode,
  ExamMasterDatabase,
  NewsCategory,
  NewsPost,
  PlanId,
  Question,
  School,
  SchoolType,
  Subject,
  SubjectCategory,
  Subscription,
  User,
  UserNotification,
} from '../types/database';
import { AuthGate, OnboardingBanner } from './AuthGate';
import { StudyDashboard } from './StudyDashboard';
import type { PaidPlanId } from './UpgradePrompt';

interface ProfileAndAdminProps {
  db: ExamMasterDatabase;
  currentUser: User | null;
  notifications: UserNotification[];
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onAuthenticated: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onBillingUpdated: (user: User, billing: BillingProfileState) => void;
  onMarkNotificationRead: (notificationId: string) => void;
  onOpenCheckout: (plan: PaidPlanId) => void;
  onNavigatePricing: () => void;
  onLogout: () => void;
  onRefreshCatalog: () => Promise<void>;
  onToggleCacheSubject: (subjectId: string) => void;
  onStartSubjectCBT: (subjectId: string) => void;
  onSaveQuestion: (q: Question) => Promise<void>;
  onDeleteQuestion: (id: string) => Promise<void>;
  onSaveSubject: (s: Subject) => Promise<void>;
  onSaveNewsPost: (p: NewsPost) => Promise<void>;
  onSaveSchool: (s: School) => Promise<void>;
}

export const ProfileAndAdmin: React.FC<ProfileAndAdminProps> = ({
  db,
  currentUser,
  notifications,
  theme,
  onToggleTheme,
  onAuthenticated,
  onUpdateUser,
  onBillingUpdated,
  onMarkNotificationRead,
  onOpenCheckout,
  onNavigatePricing,
  onLogout,
  onRefreshCatalog,
  onToggleCacheSubject,
  onStartSubjectCBT,
  onSaveQuestion,
  onDeleteQuestion,
  onSaveSubject,
  onSaveNewsPost,
  onSaveSchool,
}) => {
  const [subTab, setSubTab] = useState<'account' | 'dashboard' | 'admin'>('account');

  // Email verification state
  const [verifyMessage, setVerifyMessage] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [checkingVerify, setCheckingVerify] = useState(false);

  // Profile saving feedback
  const [profileSaved, setProfileSaved] = useState('');

  // Billing, trial & referral state
  const [startingTrial, setStartingTrial] = useState(false);
  const [payNotice, setPayNotice] = useState('');
  const [payError, setPayError] = useState('');
  const [copiedRef, setCopiedRef] = useState(false);
  const [friendRefCode, setFriendRefCode] = useState('');
  const [applyingRef, setApplyingRef] = useState(false);

  // Admin panel sub-tabs
  const [adminSection, setAdminSection] = useState<
    'pending-payments' | 'subscriptions' | 'questions' | 'subjects' | 'news' | 'schools'
  >('pending-payments');
  const [adminFeedback, setAdminFeedback] = useState('');
  const [adminError, setAdminError] = useState('');
  const [resettingDb, setResettingDb] = useState(false);

  // Admin billing & pending bank transfers state
  const [adminBilling, setAdminBilling] = useState<AdminBillingOverview | null>(null);
  const [loadingAdminBilling, setLoadingAdminBilling] = useState(false);
  const [grantBusyUid, setGrantBusyUid] = useState<string | null>(null);
  const [pendingTransfers, setPendingTransfers] = useState<Subscription[]>([]);
  const [reviewedTransfers, setReviewedTransfers] = useState<Subscription[]>([]);
  const [loadingPendingTransfers, setLoadingPendingTransfers] = useState(false);
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

  // Admin: Add / Edit Question form
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [qExam, setQExam] = useState<ExamCode>('JAMB');
  const [qSubjectId, setQSubjectId] = useState<string>('sub-english');
  const [qYear, setQYear] = useState<number>(2025);
  const [qTopic, setQTopic] = useState('');
  const [qPrompt, setQPrompt] = useState('');
  const [qOptA, setQOptA] = useState('');
  const [qOptB, setQOptB] = useState('');
  const [qOptC, setQOptC] = useState('');
  const [qOptD, setQOptD] = useState('');
  const [qCorrect, setQCorrect] = useState<0 | 1 | 2 | 3>(0);
  const [qExplanation, setQExplanation] = useState('');

  // Admin: Add / Edit Subject form
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [subName, setSubName] = useState('');
  const [subCategory, setSubCategory] = useState<SubjectCategory>('Core');
  const [subDesc, setSubDesc] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');

  // Admin: Add / Edit News form
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsCategory, setNewsCategory] = useState<NewsCategory>('JAMB');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsBody, setNewsBody] = useState('');

  // Admin: Add / Edit School form
  const [editingSchoolId, setEditingSchoolId] = useState<string | null>(null);
  const [schName, setSchName] = useState('');
  const [schAcronym, setSchAcronym] = useState('');
  const [schType, setSchType] = useState<SchoolType>('University');
  const [schState, setSchState] = useState('Lagos');
  const [schCutOff, setSchCutOff] = useState(180);
  const [schCourses, setSchCourses] = useState('Computer Science, Accounting, Law');
  const [schEmail, setSchEmail] = useState('');

  const loadAdminBilling = async () => {
    setLoadingAdminBilling(true);
    setAdminError('');
    try {
      const overview = await fetchAdminBillingOverview();
      setAdminBilling(overview);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Unable to fetch subscription analytics.');
    } finally {
      setLoadingAdminBilling(false);
    }
  };

  const loadPendingTransfers = async () => {
    setLoadingPendingTransfers(true);
    setAdminError('');
    try {
      const data = await fetchAdminPendingPayments();
      setPendingTransfers(data.pending);
      setReviewedTransfers(data.reviewed);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Unable to load pending bank transfers.');
    } finally {
      setLoadingPendingTransfers(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === 'admin' && subTab === 'admin') {
      if (adminSection === 'pending-payments') {
        void loadPendingTransfers();
      } else if (adminSection === 'subscriptions' && !adminBilling) {
        void loadAdminBilling();
      }
    }
  }, [currentUser?.role, subTab, adminSection, adminBilling]);

  if (!currentUser) {
    return (
      <AuthGate
        title="Sign in to your Exam Master Profile"
        subtitle="Access your personalized study dashboard, CBT history, offline packs, and account settings."
        onAuthenticated={onAuthenticated}
      />
    );
  }

  const cacheKB = estimateCacheSizeKB(db);
  const userResults = db.results.filter((r) => r.userId === currentUser.uid);
  const userAttempts = db.attempts.filter((a) => a.userId === currentUser.uid);
  const userSubscriptions = db.subscriptions.filter((s) => s.userId === currentUser.uid);
  const entitlements = getUserEntitlements(currentUser);
  const referralShareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${encodeURIComponent(currentUser.referralCode || '')}`
      : `https://exammaster.ng/?ref=${currentUser.referralCode || ''}`;

  const handleSendVerificationLink = async () => {
    setVerifyError('');
    setVerifyMessage('');
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifyMessage(`Verification email sent to ${currentUser.email}. Check your inbox and spam folder.`);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Could not send verification email.');
    }
  };

  const handleCheckVerificationStatus = async () => {
    setVerifyError('');
    setVerifyMessage('');
    if (!auth.currentUser) return;
    setCheckingVerify(true);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        const updated = await updateUserProfile(currentUser.uid, { emailVerified: true });
        onUpdateUser(updated);
      } else {
        setVerifyMessage('Email not verified yet. Open the link in your inbox, then click Check Status again.');
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Unable to refresh verification status.');
    } finally {
      setCheckingVerify(false);
    }
  };

  const handleSaveProfileField = async (patch: Partial<User>) => {
    const optimistic = { ...currentUser, ...patch };
    onUpdateUser(optimistic);
    try {
      const updated = await updateUserProfile(currentUser.uid, patch);
      onUpdateUser(updated);
      setProfileSaved('Profile saved');
      window.setTimeout(() => setProfileSaved(''), 2000);
    } catch {
      // keep optimistic update
    }
  };

  const handleActivateTrial = async () => {
    setPayError('');
    setPayNotice('');
    setStartingTrial(true);
    try {
      const res = await startFreeTrial();
      const updated = mergeBillingIntoUser(currentUser, res.billing);
      onBillingUpdated(updated, res.billing);
      setPayNotice('Your 3-day free Premium trial is active!');
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Could not activate 3-day free trial.');
    } finally {
      setStartingTrial(false);
    }
  };

  const handleCopyReferralLink = () => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(referralShareUrl);
      setCopiedRef(true);
      window.setTimeout(() => setCopiedRef(false), 2200);
    }
  };

  const handleApplyFriendReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendRefCode.trim()) return;
    setApplyingRef(true);
    setPayError('');
    setPayNotice('');
    try {
      const res = await applyReferralCode(friendRefCode.trim());
      const updated = mergeBillingIntoUser(currentUser, res.billing);
      onBillingUpdated(updated, res.billing);
      setFriendRefCode('');
      setPayNotice(res.message);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Could not apply referral code.');
    } finally {
      setApplyingRef(false);
    }
  };

  const handleAdminPlanChange = async (targetUid: string, nextPlan: PlanId) => {
    setGrantBusyUid(targetUid);
    setAdminError('');
    setAdminFeedback('');
    try {
      const res = await adminGrantOrRevokePlan({ targetUid, plan: nextPlan });
      setAdminFeedback(res.message);
      if (targetUid === currentUser.uid) {
        onBillingUpdated(mergeBillingIntoUser(currentUser, res.billing), res.billing);
      }
      await loadAdminBilling();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Failed to update user plan.');
    } finally {
      setGrantBusyUid(null);
    }
  };

  const handleReviewTransfer = async (
    subscriptionId: string,
    action: 'approve' | 'reject',
    reason?: string
  ) => {
    setReviewBusyId(subscriptionId);
    setAdminError('');
    setAdminFeedback('');
    try {
      const res = await reviewPendingPayment({
        subscriptionId,
        action,
        rejectionReason: reason,
      });
      setAdminFeedback(res.message);
      setRejectingId(null);
      setRejectReason('');
      await Promise.all([loadPendingTransfers(), loadAdminBilling()]);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Failed to review transfer.');
    } finally {
      setReviewBusyId(null);
    }
  };

  // ==================== ADMIN: QUESTION ADD / EDIT ====================
  const resetQuestionForm = () => {
    setEditingQuestionId(null);
    setQTopic('');
    setQPrompt('');
    setQOptA('');
    setQOptB('');
    setQOptC('');
    setQOptD('');
    setQCorrect(0);
    setQExplanation('');
  };

  const startEditQuestion = (q: Question) => {
    setEditingQuestionId(q.id);
    setQExam(q.examCode);
    setQSubjectId(q.subjectId);
    setQYear(q.year);
    setQTopic(q.topic);
    setQPrompt(q.prompt);
    setQOptA(q.options[0]?.text || '');
    setQOptB(q.options[1]?.text || '');
    setQOptC(q.options[2]?.text || '');
    setQOptD(q.options[3]?.text || '');
    const correctIdx = q.options.findIndex((o) => o.isCorrect);
    setQCorrect((correctIdx >= 0 && correctIdx <= 3 ? correctIdx : 0) as 0 | 1 | 2 | 3);
    setQExplanation(q.explanation);
    setAdminFeedback('');
    setAdminError('');
  };

  const handleSaveQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    if (!qPrompt.trim() || !qOptA.trim() || !qOptB.trim() || !qOptC.trim() || !qOptD.trim()) return;
    const subjectObj = db.subjects.find((s) => s.id === qSubjectId);
    const id = editingQuestionId || `q-custom-${Date.now()}`;
    const existingQ = editingQuestionId ? db.questions.find((q) => q.id === editingQuestionId) : null;
    const opts = [qOptA, qOptB, qOptC, qOptD];
    const labels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];

    const questionPayload: Question = {
      id,
      examId: `exam-${qExam.toLowerCase()}`,
      examCode: qExam,
      subjectId: qSubjectId,
      subjectName: subjectObj?.name || 'English Language',
      year: qYear,
      topic: qTopic.trim() || 'General',
      prompt: qPrompt.trim(),
      options: opts.map((text, idx) => ({
        id: `${id}-opt-${labels[idx]}`,
        questionId: id,
        label: labels[idx],
        text: text.trim(),
        isCorrect: idx === qCorrect,
      })),
      explanation: qExplanation.trim() || 'Verified answer key updated via Exam Master Admin.',
      difficulty: existingQ?.difficulty || 'medium',
      createdAt: existingQ?.createdAt || new Date().toISOString(),
    };

    try {
      await onSaveQuestion(questionPayload);
      setAdminFeedback(
        editingQuestionId
          ? `Updated ${questionPayload.examCode} ${questionPayload.subjectName} (${questionPayload.year}) question.`
          : `Added question to ${questionPayload.examCode} ${questionPayload.subjectName} (${questionPayload.year}).`
      );
      resetQuestionForm();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Failed to save question.');
    }
  };

  // ==================== ADMIN: SUBJECT ADD / EDIT ====================
  const resetSubjectForm = () => {
    setEditingSubjectId(null);
    setSubName('');
    setSubCategory('Core');
    setSubDesc('');
  };

  const startEditSubject = (sub: Subject) => {
    setEditingSubjectId(sub.id);
    setSubName(sub.name);
    setSubCategory(sub.category);
    setSubDesc(sub.description);
    setAdminFeedback('');
    setAdminError('');
  };

  const handleSaveSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    if (!subName.trim()) return;
    const existingSub = editingSubjectId ? db.subjects.find((s) => s.id === editingSubjectId) : null;
    const slug = existingSub?.slug || subName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const id = editingSubjectId || `sub-${slug}-${Date.now().toString().slice(-4)}`;
    try {
      await onSaveSubject({
        id,
        name: subName.trim(),
        slug,
        category: subCategory,
        examTypes: existingSub?.examTypes || ['JAMB', 'WAEC', 'NECO'],
        icon: existingSub?.icon || 'BookOpen',
        description: subDesc.trim() || `${subName.trim()} syllabus past questions and CBT drills.`,
      });
      setAdminFeedback(editingSubjectId ? `Updated subject "${subName.trim()}".` : `Added subject "${subName.trim()}".`);
      resetSubjectForm();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Failed to save subject.');
    }
  };

  // ==================== ADMIN: NEWS ADD / EDIT ====================
  const resetNewsForm = () => {
    setEditingNewsId(null);
    setNewsTitle('');
    setNewsCategory('JAMB');
    setNewsSummary('');
    setNewsBody('');
  };

  const startEditNews = (post: NewsPost) => {
    setEditingNewsId(post.id);
    setNewsTitle(post.title);
    setNewsCategory(post.category);
    setNewsSummary(post.summary);
    setNewsBody(post.content.join('\n\n'));
    setAdminFeedback('');
    setAdminError('');
  };

  const handleSaveNewsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    if (!newsTitle.trim() || !newsSummary.trim()) return;
    const existingPost = editingNewsId ? db.news_posts.find((p) => p.id === editingNewsId) : null;
    const slug =
      existingPost?.slug || `${newsTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
    const id = editingNewsId || `news-${Date.now()}`;
    try {
      await onSaveNewsPost({
        id,
        slug,
        title: newsTitle.trim(),
        category: newsCategory,
        summary: newsSummary.trim(),
        content: newsBody.trim() ? newsBody.split('\n').map((p) => p.trim()).filter(Boolean) : [newsSummary.trim()],
        author: existingPost?.author || currentUser.name,
        publishedAt: existingPost?.publishedAt || new Date().toISOString().slice(0, 10),
        readTimeMins: existingPost?.readTimeMins || 3,
        imageUrl: existingPost?.imageUrl || '/src/assets/images/news_jamb_utme_1794582028614.jpg',
      });
      setAdminFeedback(editingNewsId ? 'News post updated live.' : 'News update published live.');
      resetNewsForm();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Failed to save news post.');
    }
  };

  // ==================== ADMIN: SCHOOL ADD / EDIT ====================
  const resetSchoolForm = () => {
    setEditingSchoolId(null);
    setSchName('');
    setSchAcronym('');
    setSchType('University');
    setSchState('Lagos');
    setSchCutOff(180);
    setSchCourses('Computer Science, Accounting, Law');
    setSchEmail('');
  };

  const startEditSchool = (sch: School) => {
    setEditingSchoolId(sch.id);
    setSchName(sch.name);
    setSchAcronym(sch.acronym);
    setSchType(sch.type);
    setSchState(sch.state);
    setSchCutOff(sch.utmeCutOff);
    setSchCourses(sch.courses.join(', '));
    setSchEmail(sch.email);
    setAdminFeedback('');
    setAdminError('');
  };

  const handleSaveSchoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    if (!schName.trim() || !schAcronym.trim()) return;
    const existingSchool = editingSchoolId ? db.schools.find((s) => s.id === editingSchoolId) : null;
    const id = editingSchoolId || `sch-${Date.now()}`;
    try {
      await onSaveSchool({
        id,
        name: schName.trim(),
        acronym: schAcronym.trim().toUpperCase(),
        type: schType,
        ownership: existingSchool?.ownership || 'Federal',
        state: schState.trim() || 'Lagos',
        city: existingSchool?.city || schState.trim() || 'Lagos',
        utmeCutOff: schCutOff,
        tuitionRange: existingSchool?.tuitionRange || '₦65,000 – ₦150,000 / session',
        courses: schCourses
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        website: existingSchool?.website || 'https://jamb.gov.ng',
        email: schEmail.trim() || 'admissions@school.edu.ng',
        phone: existingSchool?.phone || '+234 800 000 0000',
      });
      setAdminFeedback(editingSchoolId ? 'Institution updated in directory.' : 'School added to directory.');
      resetSchoolForm();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Failed to save school.');
    }
  };

  const handleResetDatabase = async () => {
    setAdminError('');
    setAdminFeedback('');
    setResettingDb(true);
    try {
      await resetAndSeedFirestore(currentUser.uid);
      await onRefreshCatalog();
      setAdminFeedback('Firestore reset and re-seeded with all 59 Nigerian subjects, questions, news, schools, and scholarships.');
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Database reset failed.');
    } finally {
      setResettingDb(false);
    }
  };

  const filteredAdminSubjects = db.subjects.filter(
    (s) =>
      !subjectSearch.trim() ||
      s.name.toLowerCase().includes(subjectSearch.trim().toLowerCase()) ||
      s.category.toLowerCase().includes(subjectSearch.trim().toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Onboarding Screen after First Signup */}
      {!currentUser.onboarded && (
        <OnboardingBanner user={currentUser} onComplete={onUpdateUser} />
      )}

      {/* Firebase Email Verification Prompt */}
      {!currentUser.emailVerified && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5 dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-300">
                <MailCheck className="h-4 w-4" aria-hidden="true" />
                VERIFY YOUR EMAIL ADDRESS
              </div>
              <p className="mt-1 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
                Click the verification link sent to <strong>{currentUser.email}</strong>, then refresh your status.
              </p>
              {verifyMessage && (
                <p className="mt-1 text-xs font-medium text-emerald-800 dark:text-emerald-300">{verifyMessage}</p>
              )}
              {verifyError && <p className="mt-1 text-xs font-medium text-rose-700">{verifyError}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleCheckVerificationStatus()}
                disabled={checkingVerify}
                className="min-h-[38px] rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {checkingVerify ? 'Checking...' : 'Check Status'}
              </button>
              <button
                type="button"
                onClick={() => void handleSendVerificationLink()}
                className="min-h-[38px] rounded-xl border border-amber-400 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
              >
                Resend Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header & Sub-navigation */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Profile, Study Dashboard &amp; Admin
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Manage your student profile, offline question packs, Paystack Premium, and content controls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 self-start dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSubTab('account')}
            className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              subTab === 'account'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Account &amp; Offline
          </button>
          <button
            type="button"
            onClick={() => setSubTab('dashboard')}
            className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              subTab === 'dashboard'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Study Dashboard
          </button>
          <button
            type="button"
            onClick={() => setSubTab('admin')}
            className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              subTab === 'admin'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Admin Panel
          </button>
        </div>
      </div>

      {payNotice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            {payNotice}
          </span>
          <button type="button" onClick={() => setPayNotice('')} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {payError && (
        <div className="flex items-center justify-between rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
          <span>{payError}</span>
          <button type="button" onClick={() => setPayError('')} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* ==================== ACCOUNT & OFFLINE TAB ==================== */}
      {subTab === 'account' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {PLANS[entitlements.effectivePlan].name.toUpperCase()} · {currentUser.role.toUpperCase()} ·{' '}
                    {currentUser.emailVerified ? 'VERIFIED' : 'PENDING VERIFICATION'}
                  </div>
                  <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                    {currentUser.name}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {currentUser.email} {currentUser.phone ? `· ${currentUser.phone}` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  Sign Out
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 dark:border-slate-800">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Class Level
                  </label>
                  <select
                    value={currentUser.classLevel}
                    onChange={(e) => void handleSaveProfileField({ classLevel: e.target.value })}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="JSS 1">JSS 1</option>
                    <option value="JSS 2">JSS 2</option>
                    <option value="JSS 3">JSS 3</option>
                    <option value="SSS 1">SSS 1</option>
                    <option value="SSS 2">SSS 2</option>
                    <option value="SSS 3">SSS 3</option>
                    <option value="UTME Candidate">UTME Candidate</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Target Exam
                  </label>
                  <select
                    value={currentUser.targetExam}
                    onChange={(e) =>
                      void handleSaveProfileField({ targetExam: e.target.value as ExamCode })
                    }
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="JAMB">JAMB UTME</option>
                    <option value="WAEC">WAEC WASSCE</option>
                    <option value="NECO">NECO SSCE</option>
                    <option value="POST-UTME">Post-UTME</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={currentUser.phone}
                    onChange={(e) => void handleSaveProfileField({ phone: e.target.value })}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Target Institution
                  </label>
                  <input
                    type="text"
                    value={currentUser.targetSchool}
                    onChange={(e) => void handleSaveProfileField({ targetSchool: e.target.value })}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>

              {profileSaved && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {profileSaved}
                </p>
              )}
            </div>

            {/* Offline Question Caching Manager */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Offline Question Packs (Low-Data Mode)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cache subjects in IndexedDB so CBT &amp; Past Questions work without mobile data.
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {entitlements.offlineAccess ? `${cacheKB} KB cached` : 'Paid / Trial Feature'}
                </span>
              </div>

              {!entitlements.offlineAccess && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <span className="flex items-center gap-2 font-medium">
                    <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Offline question packs are unlocked on Trial, Weekly, Premium, and Exam Season Pass.
                  </span>
                  <button
                    type="button"
                    onClick={onNavigatePricing}
                    className="font-bold underline hover:text-amber-700 dark:hover:text-amber-100"
                  >
                    Upgrade Plan
                  </button>
                </div>
              )}

              <div className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto dark:divide-slate-800">
                {db.subjects.slice(0, 12).map((sub) => {
                  const isCached = db.cachedSubjectIds.includes(sub.id);
                  const count = db.questions.filter((q) => q.subjectId === sub.id).length;
                  return (
                    <div key={sub.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {sub.name}
                        </div>
                        <div className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {count} questions ·{' '}
                          {isCached && entitlements.offlineAccess ? 'Available offline' : 'Online only'}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!entitlements.offlineAccess}
                        onClick={() => onToggleCacheSubject(sub.id)}
                        className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold whitespace-nowrap disabled:opacity-50 ${
                          isCached && entitlements.offlineAccess
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {!entitlements.offlineAccess ? (
                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {isCached && entitlements.offlineAccess ? 'Cached' : 'Save Offline'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Payment Notifications & Alerts */}
            {notifications.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                    <Bell className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    Payment Notifications
                  </h3>
                  {notifications.some((n) => !n.read) && (
                    <button
                      type="button"
                      onClick={() => onMarkNotificationRead('all')}
                      className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {notifications.slice(0, 6).map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 text-xs ${
                        n.type === 'payment_approved'
                          ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
                          : 'border-rose-200 bg-rose-50/70 text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-bold">
                          {n.type === 'payment_approved' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" />
                          )}
                          <span>{n.title}</span>
                          {!n.read && (
                            <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-950">
                              NEW
                            </span>
                          )}
                        </div>
                        <p>{n.message}</p>
                        <p className="font-mono text-[10px] opacity-75">
                          {new Date(n.createdAt).toLocaleString('en-NG')}
                        </p>
                      </div>

                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => onMarkNotificationRead(n.id)}
                          className="shrink-0 text-[11px] font-semibold underline"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Billing History Table */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Billing History &amp; Receipts
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    All live card payments, Opay bank transfers, trials, and referral bonuses.
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  {userSubscriptions.length} records
                </span>
              </div>

              {userSubscriptions.length === 0 ? (
                <p className="py-4 text-xs text-slate-500 dark:text-slate-400">
                  No subscription payments yet. Start a 3-day free trial or choose a plan on the Pricing page.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th className="py-2 pr-3 font-semibold">Date</th>
                        <th className="py-2 px-3 font-semibold">Plan</th>
                        <th className="py-2 px-3 font-semibold">Amount</th>
                        <th className="py-2 px-3 font-semibold">Reference</th>
                        <th className="py-2 pl-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {userSubscriptions.map((sub) => (
                        <tr key={sub.id}>
                          <td className="py-2.5 pr-3 font-mono text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                            {new Date(sub.date).toLocaleDateString('en-NG')}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                            {PLANS[sub.plan]?.name || sub.plan}
                            {sub.receiptUrl && (
                              <button
                                type="button"
                                onClick={() => setPreviewReceiptUrl(sub.receiptUrl || null)}
                                className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                              >
                                <Eye className="h-3 w-3" aria-hidden="true" />
                                Receipt
                              </button>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                            {formatNaira(sub.amount)}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400">
                            {sub.reference}
                          </td>
                          <td className="py-2.5 pl-3">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                                sub.status === 'success'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : sub.status === 'failed' || sub.status === 'rejected'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : sub.status === 'expired'
                                  ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              }`}
                            >
                              {sub.status}
                            </span>
                            {sub.rejectionReason && (
                              <div className="mt-1 text-[11px] text-rose-700 dark:text-rose-400">
                                {sub.rejectionReason}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6 lg:col-span-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Display Theme
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Switch between bright daylight mode and battery-saving dark mode.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white whitespace-nowrap"
                >
                  {theme === 'light' ? (
                    <>
                      <Moon className="h-4 w-4" aria-hidden="true" /> Dark Mode
                    </>
                  ) : (
                    <>
                      <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" /> Light Mode
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Active Plan, Expiry & Usage Card */}
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-900 to-emerald-950 p-6 text-white dark:border-emerald-800">
              <div className="flex items-center justify-between gap-2 text-amber-300 text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <Crown className="h-4 w-4" aria-hidden="true" />
                  YOUR SUBSCRIPTION
                </span>
                <span className="font-mono uppercase">{PLANS[entitlements.effectivePlan].name}</span>
              </div>

              <h3 className="mt-2 text-xl font-bold">
                {entitlements.isPaidOrTrial
                  ? `${PLANS[entitlements.effectivePlan].name} Active`
                  : entitlements.isExpired
                  ? 'Plan Expired — Auto-Downgraded to Free'
                  : 'Free Study Tier'}
              </h3>

              {currentUser.planExpiry && entitlements.isPaidOrTrial ? (
                <p className="mt-1 text-xs text-emerald-100">
                  Expires on{' '}
                  <strong className="font-mono">
                    {new Date(currentUser.planExpiry).toLocaleDateString('en-NG', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </strong>{' '}
                  ({entitlements.daysLeft} day{entitlements.daysLeft === 1 ? '' : 's'} remaining)
                </p>
              ) : (
                <p className="mt-1 text-xs text-emerald-100">
                  Free plan: 5 questions/subject, 1 CBT test/day, 5 AI messages/day.
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl bg-black/25 p-3 text-xs">
                <div>
                  <div className="text-emerald-200">AI Messages Today</div>
                  <div className="mt-0.5 font-mono text-sm font-bold tabular-nums">
                    {entitlements.aiUsedToday} / {entitlements.aiDailyLimit}
                  </div>
                </div>
                <div>
                  <div className="text-emerald-200">CBT Tests Today</div>
                  <div className="mt-0.5 font-mono text-sm font-bold tabular-nums">
                    {entitlements.cbtDailyLimit === null
                      ? `${entitlements.cbtUsedToday} / Unlimited`
                      : `${entitlements.cbtUsedToday} / ${entitlements.cbtDailyLimit}`}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                {!currentUser.trialUsed && entitlements.effectivePlan === 'free' && (
                  <button
                    type="button"
                    disabled={startingTrial}
                    onClick={() => void handleActivateTrial()}
                    className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    {startingTrial ? 'Activating Trial...' : 'Start 3-Day Free Trial'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onOpenCheckout('season_pass')}
                  className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-50"
                >
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  {entitlements.isPaidOrTrial ? 'Renew / Upgrade with Paystack' : 'Upgrade with Paystack'}
                </button>

                <button
                  type="button"
                  onClick={onNavigatePricing}
                  className="min-h-[38px] w-full rounded-xl border border-emerald-700 px-4 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-900/60"
                >
                  Compare All 4 Plans (From ₦500/wk)
                </button>
              </div>
            </div>

            {/* Referral Program Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    <Gift className="h-4 w-4" aria-hidden="true" />
                    REFER FRIENDS · EARN +7 FREE DAYS
                  </div>
                  <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                    Invite Classmates &amp; Study Free
                  </h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Share your code. Whenever a friend subscribes to a paid plan, you automatically receive{' '}
                    <strong>+7 free Premium days</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                <div>
                  <div className="text-[11px] text-slate-500">Your Referral Code</div>
                  <div className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                    {currentUser.referralCode}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyReferralLink}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {copiedRef ? 'Link Copied!' : 'Copy Invite Link'}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                <span>
                  Friends subscribed: <strong className="font-mono text-slate-900 dark:text-white">{currentUser.referralCount || 0}</strong>
                </span>
                <span>
                  Bonus days earned: <strong className="font-mono text-emerald-700 dark:text-emerald-400">+{currentUser.referralBonusDays || 0} days</strong>
                </span>
              </div>

              {!currentUser.referredBy ? (
                <form onSubmit={handleApplyFriendReferral} className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={friendRefCode}
                    onChange={(e) => setFriendRefCode(e.target.value.toUpperCase())}
                    placeholder="Have a friend's code? (EMN-...)"
                    className="min-h-[38px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={applyingRef || !friendRefCode.trim()}
                    className="min-h-[38px] rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                  >
                    Apply
                  </button>
                </form>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Referred by code: <strong className="font-mono">{currentUser.referredBy}</strong>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== STUDY DASHBOARD TAB ==================== */}
      {subTab === 'dashboard' && (
        <StudyDashboard
          results={userResults}
          attempts={userAttempts}
          questions={db.questions}
          subjects={db.subjects}
          onStartSubjectCBT={onStartSubjectCBT}
        />
      )}

      {/* ==================== ADMIN PANEL TAB (Firestore Security Rules: Admin Only) ==================== */}
      {subTab === 'admin' && (
        currentUser.role !== 'admin' ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3 dark:border-slate-800 dark:bg-slate-900">
            <Shield className="mx-auto h-10 w-10 text-amber-600" aria-hidden="true" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Admin Role Required
            </h2>
            <p className="mx-auto max-w-md text-sm text-slate-600 dark:text-slate-300">
              Firestore security rules restrict adding or editing questions, subjects, news posts, and
              schools to verified <code className="font-mono font-semibold">admin</code> accounts.
            </p>
            <button
              type="button"
              onClick={onLogout}
              className="mt-2 min-h-[42px] rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Sign Out to Switch Account
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-900 dark:text-white">
                <Shield className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Firestore Admin CMS · Add &amp; Edit Access
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                  {(
                    [
                      {
                        id: 'pending-payments',
                        label: `Pending Payments (${pendingTransfers.length})`,
                      },
                      { id: 'subscriptions', label: 'Subscriptions & Revenue' },
                      { id: 'questions', label: `Questions (${db.questions.length})` },
                      { id: 'subjects', label: `Subjects (${db.subjects.length})` },
                      { id: 'news', label: `News (${db.news_posts.length})` },
                      { id: 'schools', label: `Schools (${db.schools.length})` },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setAdminSection(item.id)}
                      className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                        adminSection === item.id
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={resettingDb}
                  onClick={() => void handleResetDatabase()}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${resettingDb ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {resettingDb ? 'Reseeding Firestore...' : 'Reset & Reseed Firestore'}
                </button>
              </div>
            </div>

            {adminError && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-900">
                {adminError}
              </div>
            )}

            {adminFeedback && (
              <div className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                <span>{adminFeedback}</span>
                <button type="button" onClick={() => setAdminFeedback('')} className="underline">
                  Close
                </button>
              </div>
            )}

            {/* PENDING MANUAL BANK TRANSFERS (OPAY) */}
            {adminSection === 'pending-payments' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Pending Bank Transfers (Opay · 9134992916)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Verify transfer receipts against your Opay statement before approving or rejecting.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadPendingTransfers()}
                    disabled={loadingPendingTransfers}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${loadingPendingTransfers ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    Refresh Pending List
                  </button>
                </div>

                {pendingTransfers.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    <Clock className="mx-auto mb-2 h-7 w-7 text-slate-400" aria-hidden="true" />
                    No pending Opay transfer receipts waiting for review right now.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {pendingTransfers.map((sub) => {
                      const isRejecting = rejectingId === sub.id;
                      const isBusy = reviewBusyId === sub.id;
                      return (
                        <div
                          key={sub.id}
                          className="flex flex-col justify-between gap-4 rounded-2xl border border-amber-200 bg-white p-5 shadow-xs dark:border-amber-900/60 dark:bg-slate-900"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-bold text-slate-900 dark:text-white">
                                  {sub.userName || 'Student'}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {sub.userEmail || sub.userId}
                                </div>
                              </div>
                              <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                Pending
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950">
                              <div>
                                <div className="text-slate-500">Plan</div>
                                <div className="font-bold text-slate-900 dark:text-white">
                                  {PLANS[sub.plan]?.name || sub.plan}
                                </div>
                              </div>
                              <div>
                                <div className="text-slate-500">Amount</div>
                                <div className="font-mono font-extrabold text-emerald-700 dark:text-emerald-400">
                                  {formatNaira(sub.amount)}
                                </div>
                              </div>
                              <div className="col-span-2">
                                <div className="text-slate-500">Narration Reference</div>
                                <div className="font-mono font-bold text-slate-900 dark:text-white">
                                  {sub.reference}
                                </div>
                              </div>
                              <div className="col-span-2">
                                <div className="text-slate-500">Submitted</div>
                                <div className="font-mono text-slate-700 dark:text-slate-300">
                                  {new Date(sub.submittedAt || sub.date).toLocaleString('en-NG')}
                                </div>
                              </div>
                            </div>

                            {sub.receiptUrl && (
                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={() => setPreviewReceiptUrl(sub.receiptUrl || null)}
                                  className="group relative block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950"
                                >
                                  <img
                                    src={sub.receiptUrl}
                                    alt={`Receipt for ${sub.reference}`}
                                    className="h-44 w-full object-contain transition-transform group-hover:scale-[1.02]"
                                  />
                                  <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-white">
                                    <Eye className="h-3 w-3" aria-hidden="true" />
                                    Enlarge Receipt
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>

                          {isRejecting ? (
                            <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                              <input
                                type="text"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Reason for rejection (e.g. Receipt unclear or no credit received)"
                                className="min-h-[38px] w-full rounded-xl border border-rose-300 bg-rose-50/40 px-3 text-xs text-slate-900 dark:border-rose-900 dark:bg-slate-950 dark:text-white"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setRejectingId(null);
                                    setRejectReason('');
                                  }}
                                  className="min-h-[36px] flex-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy || !rejectReason.trim()}
                                  onClick={() =>
                                    void handleReviewTransfer(sub.id, 'reject', rejectReason)
                                  }
                                  className="min-h-[36px] flex-1 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                                >
                                  {isBusy ? 'Rejecting...' : 'Confirm Reject'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleReviewTransfer(sub.id, 'approve')}
                                className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                              >
                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                {isBusy ? 'Approving...' : 'Approve & Activate'}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setRejectingId(sub.id);
                                  setRejectReason('');
                                }}
                                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-rose-300 px-4 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/50"
                              >
                                <XCircle className="h-4 w-4" aria-hidden="true" />
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {reviewedTransfers.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Recently Reviewed Bank Transfers
                    </h4>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800">
                            <th className="py-2 pr-3 font-semibold">Student</th>
                            <th className="py-2 px-3 font-semibold">Plan &amp; Amount</th>
                            <th className="py-2 px-3 font-semibold">Reference</th>
                            <th className="py-2 px-3 font-semibold">Receipt</th>
                            <th className="py-2 pl-3 font-semibold">Decision</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {reviewedTransfers.map((sub) => (
                            <tr key={sub.id}>
                              <td className="py-2.5 pr-3 text-slate-900 dark:text-white">
                                {sub.userEmail || sub.userName}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-semibold">
                                {PLANS[sub.plan]?.name || sub.plan} · {formatNaira(sub.amount)}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-500">
                                {sub.reference}
                              </td>
                              <td className="py-2.5 px-3">
                                {sub.receiptUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewReceiptUrl(sub.receiptUrl || null)}
                                    className="font-semibold text-emerald-700 underline dark:text-emerald-400"
                                  >
                                    View Image
                                  </button>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="py-2.5 pl-3">
                                <span
                                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                    sub.status === 'success'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  }`}
                                >
                                  {sub.status === 'success' ? 'Approved' : sub.status}
                                </span>
                                {sub.rejectionReason && (
                                  <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                                    {sub.rejectionReason}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SUBSCRIPTIONS, REVENUE, AI USAGE & GRANT/REVOKE */}
            {adminSection === 'subscriptions' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Revenue, Subscribers &amp; Daily Usage Overview
                  </h3>
                  <button
                    type="button"
                    onClick={() => void loadAdminBilling()}
                    disabled={loadingAdminBilling}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${loadingAdminBilling ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    Refresh Stats
                  </button>
                </div>

                {adminBilling ? (
                  <>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-medium text-slate-500">Total Users</p>
                        <p className="mt-1.5 font-mono text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                          {adminBilling.totalUsers}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Free: {adminBilling.planBreakdown.free} · Trial: {adminBilling.planBreakdown.trial}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-medium text-slate-500">Active Subscribers</p>
                        <p className="mt-1.5 font-mono text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {adminBilling.activeSubscribers}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Wk: {adminBilling.planBreakdown.weekly} · Mo: {adminBilling.planBreakdown.premium} · 3Mo:{' '}
                          {adminBilling.planBreakdown.season_pass}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-medium text-slate-500">Total Revenue</p>
                        <p className="mt-1.5 font-mono text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {formatNaira(adminBilling.totalRevenueNaira)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Verified Paystack receipts</p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-medium text-slate-500">AI &amp; CBT Usage</p>
                        <p className="mt-1.5 font-mono text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                          {adminBilling.aiMessagesToday} AI today
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {adminBilling.aiMessagesTotal} total AI · {adminBilling.cbtTestsToday} CBT today
                        </p>
                      </div>
                    </div>

                    {/* Grant / Revoke Plans Table */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">
                        Student Plans — Manual Grant &amp; Revoke
                      </h4>
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                              <th className="py-2.5 pr-4 font-semibold">Student</th>
                              <th className="py-2.5 px-3 font-semibold">Plan</th>
                              <th className="py-2.5 px-3 font-semibold">Expiry</th>
                              <th className="py-2.5 px-3 font-semibold">Today (AI / CBT)</th>
                              <th className="py-2.5 pl-3 font-semibold">Admin Override</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {adminBilling.users.map((u) => (
                              <tr key={u.uid}>
                                <td className="py-3 pr-4">
                                  <div className="font-semibold text-slate-900 dark:text-white">{u.name}</div>
                                  <div className="text-[11px] text-slate-500">{u.email}</div>
                                </td>
                                <td className="py-3 px-3 font-semibold text-emerald-700 dark:text-emerald-400">
                                  {PLANS[u.plan]?.name || u.plan}
                                </td>
                                <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                                  {u.planExpiry
                                    ? new Date(u.planExpiry).toLocaleDateString('en-NG')
                                    : '—'}
                                </td>
                                <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                                  {u.dailyAiCount} AI · {u.dailyCbtCount} CBT
                                </td>
                                <td className="py-3 pl-3">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={grantBusyUid === u.uid}
                                      onClick={() => void handleAdminPlanChange(u.uid, 'weekly')}
                                      className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                                    >
                                      +7d Weekly
                                    </button>
                                    <button
                                      type="button"
                                      disabled={grantBusyUid === u.uid}
                                      onClick={() => void handleAdminPlanChange(u.uid, 'premium')}
                                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                    >
                                      +30d Premium
                                    </button>
                                    <button
                                      type="button"
                                      disabled={grantBusyUid === u.uid}
                                      onClick={() => void handleAdminPlanChange(u.uid, 'season_pass')}
                                      className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                    >
                                      +90d Season
                                    </button>
                                    {u.plan !== 'free' && u.role !== 'admin' && (
                                      <button
                                        type="button"
                                        disabled={grantBusyUid === u.uid}
                                        onClick={() => void handleAdminPlanChange(u.uid, 'free')}
                                        className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300"
                                      >
                                        Revoke
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Recent Subscriptions Ledger */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                      <h4 className="text-base font-bold text-slate-900 dark:text-white">
                        Recent Subscription Transactions ({adminBilling.recentSubscriptions.length})
                      </h4>
                      {adminBilling.recentSubscriptions.length === 0 ? (
                        <p className="mt-3 text-xs text-slate-500">No transactions recorded yet.</p>
                      ) : (
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                <th className="py-2 pr-3 font-semibold">Date</th>
                                <th className="py-2 px-3 font-semibold">Student</th>
                                <th className="py-2 px-3 font-semibold">Plan</th>
                                <th className="py-2 px-3 font-semibold">Amount</th>
                                <th className="py-2 px-3 font-semibold">Channel</th>
                                <th className="py-2 px-3 font-semibold">Reference</th>
                                <th className="py-2 pl-3 font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {adminBilling.recentSubscriptions.map((sub) => (
                                <tr key={sub.id}>
                                  <td className="py-2.5 pr-3 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                                    {new Date(sub.date).toLocaleDateString('en-NG')}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-900 dark:text-white">
                                    {sub.userEmail || sub.userName || sub.userId}
                                  </td>
                                  <td className="py-2.5 px-3 font-semibold">
                                    {PLANS[sub.plan]?.name || sub.plan}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono font-semibold tabular-nums">
                                    {formatNaira(sub.amount)}
                                  </td>
                                  <td className="py-2.5 px-3 uppercase text-slate-600 dark:text-slate-300">
                                    {sub.channel.replace('_', ' ')}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-slate-500">{sub.reference}</td>
                                  <td className="py-2.5 pl-3">
                                    <span
                                      className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                                        sub.status === 'success'
                                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                          : sub.status === 'pending'
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                      }`}
                                    >
                                      {sub.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                    {loadingAdminBilling ? 'Loading revenue and subscriber analytics...' : 'Click Refresh Stats to view revenue and subscriber metrics.'}
                  </div>
                )}
              </div>
            )}

            {/* QUESTIONS ADD & EDIT */}
            {adminSection === 'questions' && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleSaveQuestionSubmit}
                  className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {editingQuestionId ? 'Edit Past Question' : 'Add Past Question'}
                    </h3>
                    {editingQuestionId && (
                      <button
                        type="button"
                        onClick={resetQuestionForm}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Exam</label>
                      <select
                        value={qExam}
                        onChange={(e) => setQExam(e.target.value as ExamCode)}
                        className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      >
                        <option value="JAMB">JAMB</option>
                        <option value="WAEC">WAEC</option>
                        <option value="NECO">NECO</option>
                        <option value="POST-UTME">Post-UTME</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Subject</label>
                      <select
                        value={qSubjectId}
                        onChange={(e) => setQSubjectId(e.target.value)}
                        className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      >
                        {db.subjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Year</label>
                      <input
                        type="number"
                        min={1990}
                        max={2027}
                        value={qYear}
                        onChange={(e) => setQYear(Number(e.target.value))}
                        className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>
                  </div>

                  <input
                    type="text"
                    value={qTopic}
                    onChange={(e) => setQTopic(e.target.value)}
                    placeholder="Topic (e.g. Concord, Logarithms, Electrostatics)"
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />

                  <textarea
                    rows={3}
                    required
                    value={qPrompt}
                    onChange={(e) => setQPrompt(e.target.value)}
                    placeholder="Enter the full question text..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <input
                      type="text"
                      required
                      value={qOptA}
                      onChange={(e) => setQOptA(e.target.value)}
                      placeholder="Option A"
                      className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <input
                      type="text"
                      required
                      value={qOptB}
                      onChange={(e) => setQOptB(e.target.value)}
                      placeholder="Option B"
                      className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <input
                      type="text"
                      required
                      value={qOptC}
                      onChange={(e) => setQOptC(e.target.value)}
                      placeholder="Option C"
                      className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <input
                      type="text"
                      required
                      value={qOptD}
                      onChange={(e) => setQOptD(e.target.value)}
                      placeholder="Option D"
                      className="min-h-[40px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>

                  <select
                    value={qCorrect}
                    onChange={(e) => setQCorrect(Number(e.target.value) as 0 | 1 | 2 | 3)}
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value={0}>Correct: Option A</option>
                    <option value={1}>Correct: Option B</option>
                    <option value={2}>Correct: Option C</option>
                    <option value={3}>Correct: Option D</option>
                  </select>

                  <textarea
                    rows={2}
                    value={qExplanation}
                    onChange={(e) => setQExplanation(e.target.value)}
                    placeholder="Worked explanation..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />

                  <button
                    type="submit"
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {editingQuestionId ? (
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    )}
                    {editingQuestionId ? 'Update Question' : 'Save Question to Bank'}
                  </button>
                </form>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Question Bank Entries ({db.questions.length})
                  </h3>
                  <div className="mt-4 max-h-[540px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                    {db.questions.slice(0, 25).map((q) => (
                      <div key={q.id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {q.examCode} · {q.subjectName} · <span className="font-mono">{q.year}</span>
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white line-clamp-2">
                            {q.prompt}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditQuestion(q)}
                            aria-label="Edit question"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteQuestion(q.id)}
                            aria-label="Delete question"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SUBJECTS ADD & EDIT */}
            {adminSection === 'subjects' && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleSaveSubjectSubmit}
                  className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900 self-start"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {editingSubjectId ? 'Edit Subject' : 'Add Subject'}
                    </h3>
                    {editingSubjectId && (
                      <button
                        type="button"
                        onClick={resetSubjectForm}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Cancel Edit
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    placeholder="Subject name"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <select
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value as SubjectCategory)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="Core">Core</option>
                    <option value="Sciences">Sciences</option>
                    <option value="Arts">Arts</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Trade/Technical">Trade/Technical</option>
                    <option value="JAMB">JAMB</option>
                    <option value="JSS">JSS</option>
                  </select>
                  <input
                    type="text"
                    value={subDesc}
                    onChange={(e) => setSubDesc(e.target.value)}
                    placeholder="Syllabus coverage summary"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="min-h-[42px] w-full rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {editingSubjectId ? 'Update Subject' : 'Add Subject'}
                  </button>
                </form>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      All Nigerian Subjects ({db.subjects.length})
                    </h3>
                    <input
                      type="text"
                      value={subjectSearch}
                      onChange={(e) => setSubjectSearch(e.target.value)}
                      placeholder="Filter subjects..."
                      className="min-h-[36px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div className="mt-4 max-h-[420px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                    {filteredAdminSubjects.map((sub) => (
                      <div key={sub.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            {sub.name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {sub.category} · {sub.examTypes.join(', ')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEditSubject(sub)}
                          aria-label={`Edit ${sub.name}`}
                          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* NEWS ADD & EDIT */}
            {adminSection === 'news' && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleSaveNewsSubmit}
                  className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {editingNewsId ? 'Edit School News Post' : 'Publish School News / Admission Update'}
                    </h3>
                    {editingNewsId && (
                      <button
                        type="button"
                        onClick={resetNewsForm}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Cancel Edit
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={newsTitle}
                    onChange={(e) => setNewsTitle(e.target.value)}
                    placeholder="Headline"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <select
                    value={newsCategory}
                    onChange={(e) => setNewsCategory(e.target.value as NewsCategory)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="JAMB">JAMB</option>
                    <option value="WAEC">WAEC</option>
                    <option value="admissions">Admissions</option>
                    <option value="cut-off marks">Cut-off Marks</option>
                    <option value="scholarships">Scholarships</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={newsSummary}
                    onChange={(e) => setNewsSummary(e.target.value)}
                    placeholder="1–2 sentence summary"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <textarea
                    rows={4}
                    value={newsBody}
                    onChange={(e) => setNewsBody(e.target.value)}
                    placeholder="Full article paragraphs..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="min-h-[42px] w-full rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {editingNewsId ? 'Update News Post' : 'Publish Update'}
                  </button>
                </form>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Published News Updates ({db.news_posts.length})
                  </h3>
                  <div className="mt-4 max-h-[440px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                    {db.news_posts.map((post) => (
                      <div key={post.id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {post.category} · {post.publishedAt}
                          </div>
                          <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">
                            {post.title}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEditNews(post)}
                          aria-label={`Edit ${post.title}`}
                          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SCHOOLS ADD & EDIT */}
            {adminSection === 'schools' && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <form
                  onSubmit={handleSaveSchoolSubmit}
                  className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {editingSchoolId ? 'Edit Institution' : 'Add Institution to Directory'}
                    </h3>
                    {editingSchoolId && (
                      <button
                        type="button"
                        onClick={resetSchoolForm}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Cancel Edit
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <input
                      type="text"
                      required
                      value={schName}
                      onChange={(e) => setSchName(e.target.value)}
                      placeholder="Institution Name"
                      className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <input
                      type="text"
                      required
                      value={schAcronym}
                      onChange={(e) => setSchAcronym(e.target.value)}
                      placeholder="Acronym"
                      className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <select
                      value={schType}
                      onChange={(e) => setSchType(e.target.value as SchoolType)}
                      className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    >
                      <option value="University">University</option>
                      <option value="Polytechnic">Polytechnic</option>
                      <option value="College of Education">College of Education</option>
                    </select>
                    <input
                      type="text"
                      value={schState}
                      onChange={(e) => setSchState(e.target.value)}
                      placeholder="State"
                      className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <input
                      type="number"
                      min={100}
                      max={300}
                      value={schCutOff}
                      onChange={(e) => setSchCutOff(Number(e.target.value))}
                      placeholder="UTME Cut-off"
                      className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <input
                    type="text"
                    value={schCourses}
                    onChange={(e) => setSchCourses(e.target.value)}
                    placeholder="Comma-separated courses"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <input
                    type="email"
                    value={schEmail}
                    onChange={(e) => setSchEmail(e.target.value)}
                    placeholder="Admissions email"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="min-h-[42px] w-full rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {editingSchoolId ? 'Update Institution' : 'Save Institution'}
                  </button>
                </form>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Directory Institutions ({db.schools.length})
                  </h3>
                  <div className="mt-4 max-h-[440px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                    {db.schools.map((sch) => (
                      <div key={sch.id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {sch.acronym} · {sch.type} · {sch.state} · Cut-off {sch.utmeCutOff}
                          </div>
                          <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                            {sch.name}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEditSchool(sch)}
                          aria-label={`Edit ${sch.name}`}
                          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Receipt Screenshot Preview Lightbox */}
      {previewReceiptUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Transfer Receipt Screenshot"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={() => setPreviewReceiptUrl(null)}
        >
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between text-white">
              <span className="text-sm font-bold">Uploaded Bank Transfer Receipt</span>
              <button
                type="button"
                onClick={() => setPreviewReceiptUrl(null)}
                aria-label="Close receipt preview"
                className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <img
              src={previewReceiptUrl}
              alt="Bank transfer receipt screenshot"
              className="max-h-[75vh] w-full rounded-xl object-contain bg-slate-900"
            />
          </div>
        </div>
      )}
    </div>
  );
};
