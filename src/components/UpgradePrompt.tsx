import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Crown,
  ExternalLink,
  ImagePlus,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  initializeManualBankTransfer,
  initializePaystackPayment,
  mergeBillingIntoUser,
  startFreeTrial,
  submitManualBankTransferProof,
  verifyPaystackPayment,
  type BillingProfileState,
  type ManualTransferInitResponse,
  type PaystackInitResponse,
} from '../lib/billingApi';
import { uploadTransferReceipt } from '../lib/firebase';
import { formatNaira, PLANS } from '../lib/plans';
import type { PlanId, Subscription, User } from '../types/database';

export type PaidPlanId = 'weekly' | 'premium' | 'season_pass';

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: {
        key: string;
        email: string;
        amount: number;
        currency?: string;
        ref: string;
        channels?: string[];
        callback: (response: { reference: string }) => void;
        onClose: () => void;
      }) => { openIframe: () => void };
    };
  }
}

interface UpgradePromptProps {
  title: string;
  description: string;
  currentUser: User | null;
  onStartTrialSuccess?: (user: User, billing: BillingProfileState) => void;
  onViewPlans: () => void;
  onSignInPrompt?: () => void;
  compact?: boolean;
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  title,
  description,
  currentUser,
  onStartTrialSuccess,
  onViewPlans,
  onSignInPrompt,
  compact = false,
}) => {
  const [startingTrial, setStartingTrial] = useState(false);
  const [trialError, setTrialError] = useState('');

  const canTryFree = Boolean(currentUser && !currentUser.trialUsed && currentUser.plan === 'free');

  const handleStartTrial = async () => {
    if (!currentUser) {
      onSignInPrompt?.();
      return;
    }
    setTrialError('');
    setStartingTrial(true);
    try {
      const res = await startFreeTrial();
      const merged = mergeBillingIntoUser(currentUser, res.billing);
      onStartTrialSuccess?.(merged, res.billing);
    } catch (err) {
      setTrialError(err instanceof Error ? err.message : 'Unable to start free trial.');
    } finally {
      setStartingTrial(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-amber-300 bg-amber-50/90 ${
        compact ? 'p-4' : 'p-5 sm:p-6'
      } dark:border-amber-800 dark:bg-amber-950/35`}
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            <Crown className="h-3.5 w-3.5" aria-hidden="true" />
            Upgrade to Exam Master Premium
          </div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">{description}</p>
          {trialError && <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">{trialError}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canTryFree && (
            <button
              type="button"
              disabled={startingTrial}
              onClick={() => void handleStartTrial()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60 whitespace-nowrap"
            >
              {startingTrial ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Start 3-Day Free Trial
            </button>
          )}

          {!currentUser && onSignInPrompt ? (
            <button
              type="button"
              onClick={onSignInPrompt}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
            >
              Sign In &amp; Upgrade
            </button>
          ) : (
            <button
              type="button"
              onClick={onViewPlans}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
            >
              See Plans (From ₦500)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface PaystackCheckoutModalProps {
  isOpen: boolean;
  initialPlan: PaidPlanId;
  currentUser: User | null;
  onClose: () => void;
  onPaymentComplete: (updatedUser: User, billing: BillingProfileState) => void;
  onNeedAuth: () => void;
}

type PaymentMethodTab = 'card' | 'bank_transfer';
type CheckoutStage =
  | 'configure'
  | 'card_gateway'
  | 'transfer_details'
  | 'transfer_upload'
  | 'transfer_submitted'
  | 'success'
  | 'failure';

export const PaystackCheckoutModal: React.FC<PaystackCheckoutModalProps> = ({
  isOpen,
  initialPlan,
  currentUser,
  onClose,
  onPaymentComplete,
  onNeedAuth,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<PaidPlanId>(initialPlan);
  const [method, setMethod] = useState<PaymentMethodTab>('card');
  const [referralInput, setReferralInput] = useState('');
  const [stage, setStage] = useState<CheckoutStage>('configure');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Paystack live card state
  const [cardInit, setCardInit] = useState<PaystackInitResponse | null>(null);
  const [verifiedSub, setVerifiedSub] = useState<Subscription | null>(null);
  const [referralBonusNote, setReferralBonusNote] = useState<string | null>(null);

  // Manual bank transfer state
  const [transferInit, setTransferInit] = useState<ManualTransferInitResponse | null>(null);
  const [copiedAcct, setCopiedAcct] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submittedSub, setSubmittedSub] = useState<Subscription | null>(null);

  const clientPublicKey = (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '').trim();
  const hasInvalidTestKey = clientPublicKey.startsWith('pk_test_');

  React.useEffect(() => {
    if (isOpen) {
      setSelectedPlan(initialPlan);
      setStage('configure');
      setErrorMsg('');
      setCardInit(null);
      setVerifiedSub(null);
      setReferralBonusNote(null);
      setTransferInit(null);
      setCopiedAcct(false);
      setCopiedRef(false);
      setReceiptFile(null);
      setReceiptPreview(null);
      setSubmittedSub(null);
      setReferralInput(currentUser?.referredBy || '');
    }
  }, [isOpen, initialPlan, currentUser?.referredBy]);

  React.useEffect(() => {
    return () => {
      if (receiptPreview) {
        URL.revokeObjectURL(receiptPreview);
      }
    };
  }, [receiptPreview]);

  if (!isOpen) return null;

  const planDef = PLANS[selectedPlan];

  const handleContinue = async () => {
    if (!currentUser) {
      onClose();
      onNeedAuth();
      return;
    }

    setBusy(true);
    setErrorMsg('');
    const referralCode =
      !currentUser.referredBy && referralInput.trim() ? referralInput.trim() : undefined;

    try {
      if (method === 'card') {
        if (hasInvalidTestKey) {
          throw new Error(
            'Test Paystack keys are disabled. Please configure a live pk_live_... key or pay via Bank Transfer (Opay).'
          );
        }
        const init = await initializePaystackPayment({
          plan: selectedPlan,
          referralCode,
        });
        setCardInit(init);
        setStage('card_gateway');
      } else {
        const init = await initializeManualBankTransfer({
          plan: selectedPlan,
          referralCode,
        });
        setTransferInit(init);
        setStage('transfer_details');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to start checkout.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyLiveCard = async (referenceOverride?: string) => {
    if (!currentUser || !cardInit) return;
    setBusy(true);
    setErrorMsg('');
    try {
      const res = await verifyPaystackPayment({
        reference: referenceOverride || cardInit.reference,
      });
      const updatedUser = mergeBillingIntoUser(currentUser, res.billing);
      setVerifiedSub(res.subscription);
      setReferralBonusNote(res.referralAwardedTo || null);
      onPaymentComplete(updatedUser, res.billing);
      setStage('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Live card payment could not be verified.');
      setStage('failure');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenPaystackInline = () => {
    if (!cardInit || !currentUser) return;
    const liveKey = (cardInit.publicKey || clientPublicKey).trim();
    if (!liveKey.startsWith('pk_live_') || !window.PaystackPop) {
      setErrorMsg(
        'Inline popup requires a configured pk_live_ key. Use "Open Paystack Checkout Page" below and then verify on the server.'
      );
      return;
    }
    const handler = window.PaystackPop.setup({
      key: liveKey,
      email: currentUser.email,
      amount: cardInit.amountKobo,
      currency: 'NGN',
      ref: cardInit.reference,
      channels: ['card'],
      callback: (response) => {
        void handleVerifyLiveCard(response.reference || cardInit.reference);
      },
      onClose: () => {
        setErrorMsg('Card checkout window was closed before completion. If you already paid, click "Verify Payment on Server".');
      },
    });
    handler.openIframe();
  };

  const handleCopyText = (text: string, type: 'acct' | 'ref') => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(text);
    if (type === 'acct') {
      setCopiedAcct(true);
      window.setTimeout(() => setCopiedAcct(false), 2000);
    } else {
      setCopiedRef(true);
      window.setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select an image screenshot (PNG, JPG, or WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Receipt image must be smaller than 5 MB.');
      return;
    }
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !transferInit) return;
    if (!receiptFile) {
      setErrorMsg('Please upload a screenshot of your transfer receipt first.');
      return;
    }

    setBusy(true);
    setErrorMsg('');
    try {
      const { receiptUrl, receiptPath } = await uploadTransferReceipt(
        currentUser.uid,
        transferInit.reference,
        receiptFile
      );
      const res = await submitManualBankTransferProof({
        reference: transferInit.reference,
        receiptUrl,
        receiptPath,
      });
      const updatedUser = mergeBillingIntoUser(currentUser, res.billing);
      setSubmittedSub(res.subscription);
      onPaymentComplete(updatedUser, res.billing);
      setStage('transfer_submitted');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to upload and submit your receipt. Please retry.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Exam Master Secure Checkout"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div className="my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {method === 'card'
                ? 'Paystack Live Card · Server Verified'
                : 'Manual Bank Transfer · Opay'}
            </div>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
              {stage === 'success'
                ? 'Payment Confirmed'
                : stage === 'transfer_submitted'
                ? 'Receipt Submitted for Review'
                : stage === 'failure'
                ? 'Payment Verification Failed'
                : stage === 'transfer_details'
                ? 'Transfer to Opay Account'
                : stage === 'transfer_upload'
                ? 'Upload Transfer Receipt'
                : 'Complete Subscription'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* STAGE 1: CONFIGURE PLAN & PAYMENT METHOD */}
        {stage === 'configure' && (
          <div className="space-y-5 p-6">
            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                1. Choose Plan
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['weekly', 'premium', 'season_pass'] as const).map((pid) => {
                  const p = PLANS[pid];
                  const isActive = selectedPlan === pid;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => setSelectedPlan(pid)}
                      className={`relative rounded-xl border p-3 text-left transition-colors ${
                        isActive
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-white'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      {p.badge && (
                        <span className="mb-1 inline-block rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                          {p.badge}
                        </span>
                      )}
                      <div className="text-xs font-bold leading-tight">{p.name}</div>
                      <div className="mt-1 font-mono text-sm font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatNaira(p.priceNaira)}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {p.durationDays} days
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                2. Payment Method
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMethod('card');
                    setErrorMsg('');
                  }}
                  className={`flex min-h-[54px] flex-col items-start justify-center rounded-xl border px-3.5 py-2 text-left transition-colors ${
                    method === 'card'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <CreditCard className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Card Payment
                  </div>
                  <span
                    className={`mt-0.5 text-[10px] ${
                      method === 'card' ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Instant via Paystack Live
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMethod('bank_transfer');
                    setErrorMsg('');
                  }}
                  className={`flex min-h-[54px] flex-col items-start justify-center rounded-xl border px-3.5 py-2 text-left transition-colors ${
                    method === 'bank_transfer'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Pay by Bank Transfer
                  </div>
                  <span
                    className={`mt-0.5 text-[10px] ${
                      method === 'bank_transfer' ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Opay · Upload receipt proof
                  </span>
                </button>
              </div>
            </div>

            {method === 'card' && hasInvalidTestKey && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  A Paystack test public key was detected. Test mode is disabled — use a live{' '}
                  <code className="font-mono">pk_live_</code> key or choose <strong>Pay by Bank Transfer</strong>.
                </span>
              </div>
            )}

            {currentUser && !currentUser.referredBy && (
              <div>
                <label
                  htmlFor="checkout-ref-code"
                  className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Friend&apos;s Referral Code (optional — gifts referrer +7 free days)
                </label>
                <input
                  id="checkout-ref-code"
                  type="text"
                  value={referralInput}
                  onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                  placeholder="e.g. EMN-AB12CD"
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            )}

            <div className="rounded-xl bg-slate-50 p-4 text-xs dark:bg-slate-950">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Account</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {currentUser?.email || 'Sign in required'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Access Duration</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {planDef.durationDays} days ({planDef.name})
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-800">
                <span className="font-semibold text-slate-900 dark:text-white">Exact Total Due (NGN)</span>
                <span className="font-mono text-base font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatNaira(planDef.priceNaira)}
                </span>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleContinue()}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {method === 'card'
                  ? `Pay ${formatNaira(planDef.priceNaira)} with Card`
                  : `Get Opay Transfer Details`}
              </button>
            </div>
          </div>
        )}

        {/* STAGE 2A: LIVE PAYSTACK CARD CHECKOUT */}
        {stage === 'card_gateway' && cardInit && (
          <div className="space-y-5 p-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>Live Reference</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {cardInit.reference}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>Currency &amp; Exact Amount</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  NGN · {formatNaira(cardInit.amountNaira)}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <p className="text-xs sm:text-sm leading-relaxed">
                Complete your real NGN card payment through Paystack Live below. Only real,
                live-verified card charges can activate your plan; test cards are automatically
                rejected by the server.
              </p>

              {(cardInit.publicKey?.startsWith('pk_live_') || clientPublicKey.startsWith('pk_live_')) &&
                typeof window !== 'undefined' &&
                window.PaystackPop && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleOpenPaystackInline}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                    Pay Now ({formatNaira(cardInit.amountNaira)})
                  </button>
                )}

              <a
                href={cardInit.authorizationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
              >
                Open Paystack Live Checkout Page
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleVerifyLiveCard()}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Verify Payment on Server
              </button>
            </div>

            {errorMsg && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* STAGE 2B: MANUAL BANK TRANSFER DETAILS (OPAY) */}
        {stage === 'transfer_details' && transferInit && (
          <div className="space-y-5 p-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3 dark:border-emerald-900 dark:bg-emerald-950/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Bank</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {transferInit.bankDetails.bank}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Account Number
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-extrabold tracking-wider text-slate-900 dark:text-white">
                    {transferInit.bankDetails.accountNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(transferInit.bankDetails.accountNumber, 'acct')}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                  >
                    {copiedAcct ? (
                      <>
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Account Name
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {transferInit.bankDetails.accountName}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-emerald-200/80 pt-3 dark:border-emerald-900">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Exact Amount to Send
                </span>
                <span className="font-mono text-lg font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatNaira(transferInit.amountNaira)}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 space-y-2 dark:border-amber-800 dark:bg-amber-950/35">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                  Transfer Narration / Reference Code
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyText(transferInit.reference, 'ref')}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-300"
                >
                  {copiedRef ? (
                    <>
                      <Check className="h-3 w-3" aria-hidden="true" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" aria-hidden="true" />
                      Copy Code
                    </>
                  )}
                </button>
              </div>
              <div className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                {transferInit.reference}
              </div>
              <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                Put this exact reference code in your transfer narration/remark so our admin team
                can match your payment quickly.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span>
                Unsubmitted transfer requests expire automatically in 24 hours (
                {new Date(transferInit.expiresAt).toLocaleString('en-NG')}).
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStage('configure')}
                className="min-h-[42px] rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setStage('transfer_upload');
                }}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                I have paid — Upload Receipt
              </button>
            </div>
          </div>
        )}

        {/* STAGE 2C: UPLOAD RECEIPT SCREENSHOT */}
        {stage === 'transfer_upload' && transferInit && (
          <form onSubmit={handleSubmitReceipt} className="space-y-5 p-6">
            <div className="rounded-xl bg-slate-50 p-3.5 text-xs space-y-1 dark:bg-slate-950">
              <div className="flex justify-between">
                <span className="text-slate-500">Plan &amp; Amount</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {transferInit.planName} · {formatNaira(transferInit.amountNaira)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reference Code</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {transferInit.reference}
                </span>
              </div>
            </div>

            <div>
              <label
                htmlFor="transfer-receipt-input"
                className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Upload Receipt Screenshot (PNG, JPG, WEBP — max 5 MB)
              </label>
              <label
                htmlFor="transfer-receipt-input"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition-colors hover:border-emerald-500 hover:bg-emerald-50/40 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-emerald-500"
              >
                {receiptPreview ? (
                  <img
                    src={receiptPreview}
                    alt="Transfer receipt preview"
                    className="max-h-48 rounded-lg object-contain shadow-sm"
                  />
                ) : (
                  <>
                    <ImagePlus className="h-8 w-8 text-emerald-600" aria-hidden="true" />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Tap to choose your Opay or bank transfer screenshot
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Stored securely; readable only by you and Exam Master admins
                    </span>
                  </>
                )}
                <input
                  id="transfer-receipt-input"
                  type="file"
                  accept="image/*"
                  onChange={handleReceiptFileChange}
                  className="sr-only"
                />
              </label>
              {receiptFile && (
                <p className="mt-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  Selected: {receiptFile.name} ({Math.round(receiptFile.size / 1024)} KB)
                </p>
              )}
            </div>

            {errorMsg && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setStage('transfer_details')}
                className="min-h-[42px] rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Back to Bank Details
              </button>
              <button
                type="submit"
                disabled={busy || !receiptFile}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? 'Uploading & Submitting...' : 'Submit Receipt for Approval'}
              </button>
            </div>
          </form>
        )}

        {/* STAGE 2D: TRANSFER RECEIPT SUBMITTED (PENDING ADMIN APPROVAL) */}
        {stage === 'transfer_submitted' && submittedSub && (
          <div className="space-y-5 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <Clock className="h-8 w-8" aria-hidden="true" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Transfer Proof Received (Pending)
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                Your Opay receipt for <strong>{PLANS[submittedSub.plan]?.name}</strong> has been
                submitted. As soon as an admin verifies it, your plan will activate and you will see
                an in-app notification.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs dark:border-slate-800 dark:bg-slate-950">
              <div className="flex justify-between">
                <span className="text-slate-500">Reference</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {submittedSub.reference}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {formatNaira(submittedSub.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {submittedSub.status}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Done
            </button>
          </div>
        )}

        {/* STAGE 3: CARD PAYMENT SUCCESS SCREEN */}
        {stage === 'success' && verifiedSub && (
          <div className="space-y-5 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {PLANS[verifiedSub.plan]?.name || 'Premium'} Activated!
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Your live Paystack card payment was verified on the server. Unlimited CBT, full
                past-question explanations, offline packs, and 50 AI Tutor messages/day are unlocked.
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs dark:border-slate-800 dark:bg-slate-950">
              <div className="flex justify-between">
                <span className="text-slate-500">Reference</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {verifiedSub.reference}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Paid</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {formatNaira(verifiedSub.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Channel</span>
                <span className="uppercase font-medium text-slate-900 dark:text-white">
                  Live Card
                </span>
              </div>
              {verifiedSub.expiresAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Valid Until</span>
                  <span className="font-mono text-slate-900 dark:text-white">
                    {new Date(verifiedSub.expiresAt).toLocaleDateString('en-NG', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              )}
            </div>

            {referralBonusNote && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                Referral bonus credited: {referralBonusNote} received +7 free Premium days!
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Start Studying with Premium
            </button>
          </div>
        )}

        {/* STAGE 4: CARD PAYMENT FAILURE SCREEN */}
        {stage === 'failure' && (
          <div className="space-y-5 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400">
              <XCircle className="h-8 w-8" aria-hidden="true" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Payment Could Not Be Verified
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                {errorMsg || 'Your live card transaction was not confirmed.'}
              </p>
              {cardInit && (
                <p className="mt-2 font-mono text-xs text-slate-500">
                  Ref: {cardInit.reference} · No subscription changes were applied.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setStage('configure');
                }}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Try Card or Bank Transfer
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export function getPlanDisplayName(planId: PlanId | undefined): string {
  if (!planId || !PLANS[planId]) return 'Free';
  return PLANS[planId].name;
}
