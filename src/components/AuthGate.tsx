import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { CheckCircle2, KeyRound, Lock, Mail } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import { loadOrCreateUserProfile, updateUserProfile } from '../lib/firestoreService';
import type { ExamCode, User } from '../types/database';

interface AuthGateProps {
  title?: string;
  subtitle?: string;
  onAuthenticated: (user: User) => void;
}

const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
];

function formatFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Incorrect email or password. Please check your details and try again.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Switch to Login instead.';
  }
  if (code === 'auth/weak-password') {
    return 'Password must be at least 6 characters long.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Email/Password sign-in is not enabled yet in Firebase Console > Authentication > Sign-in method. You can use Continue with Google or enable Email/Password there.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in popup was closed before completing.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup was blocked by your browser. Please allow popups for this site and try again.';
  }
  return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
}

export const AuthGate: React.FC<AuthGateProps> = ({
  title = 'Sign in to continue',
  subtitle = 'Your Study Dashboard, CBT history, Exam Master AI chats, and Profile are protected and synced to Firebase.',
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [classLevel, setClassLevel] = useState('UTME Candidate');
  const [targetExam, setTargetExam] = useState<ExamCode>('JAMB');
  const [state, setState] = useState('Lagos');
  const [referralCodeInput, setReferralCodeInput] = useState(() => {
    try {
      return localStorage.getItem('emn_pending_ref') || '';
    } catch {
      return '';
    }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const profile = await loadOrCreateUserProfile(cred.user);
      onAuthenticated(profile);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const cleanRef = referralCodeInput.trim().toUpperCase();
      if (cleanRef) {
        try {
          localStorage.setItem('emn_pending_ref', cleanRef);
        } catch {
          // ignore
        }
      }
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }
      void sendEmailVerification(cred.user).catch(() => {
        // Ignore rate limit / network error on initial verification dispatch
      });
      const profile = await loadOrCreateUserProfile(cred.user, {
        name: name.trim(),
        phone: phone.trim(),
        classLevel,
        targetExam,
        state,
        provider: 'email',
        referredBy: cleanRef || null,
      });
      onAuthenticated(profile);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const cleanRef = referralCodeInput.trim().toUpperCase();
      const cred = await signInWithPopup(auth, googleProvider);
      const profile = await loadOrCreateUserProfile(cred.user, {
        name: cred.user.displayName || 'Nigerian Candidate',
        provider: 'google',
        referredBy: cleanRef || null,
      });
      onAuthenticated(profile);
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice(`Password reset link sent to ${email.trim()}. Check your inbox (and spam folder), then sign in with your new password.`);
      setMode('login');
    } catch (err) {
      setError(formatFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg py-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <Lock className="h-4 w-4" aria-hidden="true" />
          FIREBASE PROTECTED STUDENT ACCESS
        </div>
        <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>

        {/* Mode Switch Tabs */}
        <div className="mt-5 flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
              setNotice('');
            }}
            className={`min-h-[38px] flex-1 rounded-lg text-xs font-semibold transition-colors ${
              mode === 'login'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError('');
              setNotice('');
            }}
            className={`min-h-[38px] flex-1 rounded-lg text-xs font-semibold transition-colors ${
              mode === 'signup'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('forgot');
              setError('');
              setNotice('');
            }}
            className={`min-h-[38px] flex-1 rounded-lg text-xs font-semibold transition-colors ${
              mode === 'forgot'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Reset Password
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
            {error}
          </div>
        )}

        {notice && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
            {notice}
          </div>
        )}

        {/* LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div>
              <label htmlFor="ag-email" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Email Address
              </label>
              <input
                id="ag-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@student.ng"
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="ag-pass" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Password
              </label>
              <input
                id="ag-pass"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In with Email'}
            </button>
          </form>
        )}

        {/* SIGNUP FORM */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="mt-5 space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Adebayo Tunde"
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+234 803 000 0000"
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@student.ng"
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Password (min 6 characters)
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Class Level
                </label>
                <select
                  value={classLevel}
                  onChange={(e) => setClassLevel(e.target.value)}
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
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
                  value={targetExam}
                  onChange={(e) => setTargetExam(e.target.value as ExamCode)}
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="JAMB">JAMB UTME</option>
                  <option value="WAEC">WAEC WASSCE</option>
                  <option value="NECO">NECO SSCE</option>
                  <option value="POST-UTME">Post-UTME</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  State
                </label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {NIGERIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Friend&apos;s Referral Code (optional)
              </label>
              <input
                type="text"
                value={referralCodeInput}
                onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. EMN-AB12CD"
                className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Creating Profile...' : 'Create Student Account'}
            </button>
          </form>
        )}

        {/* FORGOT / RESET PASSWORD FORM */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotRequest} className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Registered Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@student.ng"
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {loading ? 'Sending Link...' : 'Send Password Reset Email'}
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <Mail className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Firebase will send a secure password reset link directly to your inbox.
            </p>
          </form>
        )}

        {/* Google Sign-In */}
        {mode !== 'forgot' && (
          <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
            <button
              type="button"
              onClick={() => void handleGoogle()}
              disabled={loading}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-800"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.5c-.2 1.2-1.4 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.3-.2-2H12z"
                />
              </svg>
              Continue with Google
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface OnboardingCardProps {
  user: User;
  onComplete: (updated: User) => void;
}

export const OnboardingBanner: React.FC<OnboardingCardProps> = ({ user, onComplete }) => {
  const [phone, setPhone] = useState(user.phone || '');
  const [classLevel, setClassLevel] = useState(user.classLevel || 'UTME Candidate');
  const [targetExam, setTargetExam] = useState<ExamCode>(user.targetExam || 'JAMB');
  const [targetSchool, setTargetSchool] = useState(user.targetSchool || 'University of Lagos (UNILAG)');
  const [state, setState] = useState(user.state || 'Lagos');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateUserProfile(user.uid, {
        phone,
        classLevel,
        targetExam,
        targetSchool,
        state,
        onboarded: true,
      });
      onComplete(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 sm:p-6 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        WELCOME TO EXAM MASTER NIGERIA · QUICK STUDY SETUP
      </div>
      <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
        Personalize your exam prep, {user.name.split(' ')[0]}
      </h2>
      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
        Confirm your class level, state, and target exam so past questions and AI Tutor explanations fit your syllabus.
      </p>

      <form onSubmit={handleSave} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (+234...)"
          className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <select
          value={classLevel}
          onChange={(e) => setClassLevel(e.target.value)}
          className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <option value="JSS 1">JSS 1</option>
          <option value="JSS 2">JSS 2</option>
          <option value="JSS 3">JSS 3</option>
          <option value="SSS 1">SSS 1</option>
          <option value="SSS 2">SSS 2</option>
          <option value="SSS 3">SSS 3</option>
          <option value="UTME Candidate">UTME Candidate</option>
        </select>
        <select
          value={targetExam}
          onChange={(e) => setTargetExam(e.target.value as ExamCode)}
          className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <option value="JAMB">JAMB UTME</option>
          <option value="WAEC">WAEC WASSCE</option>
          <option value="NECO">NECO SSCE</option>
          <option value="POST-UTME">Post-UTME</option>
        </select>
        <input
          type="text"
          value={targetSchool}
          onChange={(e) => setTargetSchool(e.target.value)}
          placeholder="Target School"
          className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <div className="flex gap-2">
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="min-h-[40px] flex-1 rounded-xl border border-slate-200 bg-white px-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {NIGERIAN_STATES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[40px] rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
          >
            {saving ? 'Saving...' : 'Finish'}
          </button>
        </div>
      </form>
    </div>
  );
};
