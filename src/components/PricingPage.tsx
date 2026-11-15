import React, { useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Crown,
  Loader2,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { mergeBillingIntoUser, startFreeTrial, type BillingProfileState } from '../lib/billingApi';
import { formatNaira, getUserEntitlements, PLANS, PRICING_CARD_ORDER } from '../lib/plans';
import type { PlanId, User } from '../types/database';
import type { PaidPlanId } from './UpgradePrompt';

interface PricingPageProps {
  currentUser: User | null;
  onSelectPaidPlan: (plan: PaidPlanId) => void;
  onTrialActivated: (updatedUser: User, billing: BillingProfileState) => void;
  onRequireAuth: () => void;
}

const COMPARISON_ROWS: Array<{
  feature: string;
  free: string;
  paid: string;
}> = [
  { feature: 'Past questions per subject', free: '5 questions', paid: 'Unlimited' },
  { feature: 'Full worked explanations', free: 'Locked', paid: 'Included for every question' },
  { feature: 'Timed JAMB/WAEC CBT tests', free: '1 test per day', paid: 'Unlimited daily tests' },
  { feature: 'Exam Master AI Tutor', free: '5 messages / day', paid: '50 messages / day' },
  { feature: 'Weak-subject performance tracking', free: 'Basic scores', paid: 'Full subject & topic breakdown' },
  { feature: 'Offline saved question packs', free: 'Online only', paid: 'Full IndexedDB offline cache' },
  { feature: 'Advertisements', free: 'Shown', paid: '100% Ad-free' },
];

export const PricingPage: React.FC<PricingPageProps> = ({
  currentUser,
  onSelectPaidPlan,
  onTrialActivated,
  onRequireAuth,
}) => {
  const [startingTrial, setStartingTrial] = useState(false);
  const [trialFeedback, setTrialFeedback] = useState('');
  const [trialError, setTrialError] = useState('');

  const entitlements = getUserEntitlements(currentUser);
  const canStartTrial = !currentUser || (!currentUser.trialUsed && entitlements.effectivePlan === 'free');

  const handleTrialClick = async () => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setTrialError('');
    setTrialFeedback('');
    setStartingTrial(true);
    try {
      const res = await startFreeTrial();
      const updated = mergeBillingIntoUser(currentUser, res.billing);
      onTrialActivated(updated, res.billing);
      setTrialFeedback('Your 3-day free Premium trial is now active!');
    } catch (err) {
      setTrialError(err instanceof Error ? err.message : 'Unable to start trial.');
    } finally {
      setStartingTrial(false);
    }
  };

  return (
    <div className="space-y-10 pb-12">
      {/* Header & 3-Day Free Trial Banner */}
      <section className="space-y-5 border-b border-slate-200 pb-8 dark:border-slate-800">
        <div className="max-w-3xl space-y-2">
          <div className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            SUBSCRIPTION PLANS · PAYSTACK NIGERIA
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Invest in a Higher JAMB, WAEC &amp; NECO Score
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
            Pay with a Live Debit/Credit Card via Paystack or by Manual Bank Transfer (Opay). Card
            payments are verified server-side, and bank transfer receipts are verified by our team.
          </p>
        </div>

        {/* Active Plan Summary OR 3-Day Free Trial CTA */}
        {currentUser && entitlements.isPaidOrTrial ? (
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 sm:flex-row sm:items-center dark:border-emerald-800 dark:bg-emerald-950/50">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                <Crown className="h-4 w-4" aria-hidden="true" />
                ACTIVE PLAN: {PLANS[entitlements.effectivePlan].name.toUpperCase()}
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {currentUser.planExpiry
                  ? `Active for ${entitlements.daysLeft} more day(s) — renews/expires on ${new Date(
                      currentUser.planExpiry
                    ).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}.`
                  : 'Full Premium entitlements active.'}
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              AI used today: {entitlements.aiUsedToday}/{entitlements.aiDailyLimit}
            </span>
          </div>
        ) : canStartTrial ? (
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 via-white to-emerald-50 p-5 sm:flex-row sm:items-center dark:border-amber-800 dark:from-amber-950/40 dark:via-slate-900 dark:to-emerald-950/40">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                NEW STUDENT OFFER · NO CARD REQUIRED
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Try Premium Free for 3 Full Days
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                Unlock unlimited CBT tests, full explanations, offline downloads, and 50 AI messages/day before you pay ₦1.
              </p>
            </div>
            <button
              type="button"
              disabled={startingTrial}
              onClick={() => void handleTrialClick()}
              className="inline-flex min-h-[46px] shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60 whitespace-nowrap"
            >
              {startingTrial && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {currentUser ? 'Activate 3-Day Free Trial' : 'Sign Up for 3-Day Free Trial'}
            </button>
          </div>
        ) : null}

        {trialFeedback && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
            {trialFeedback}
          </div>
        )}
        {trialError && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
            {trialError}
          </div>
        )}
      </section>

      {/* 4 Plan Cards */}
      <section aria-label="Subscription plans" className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PRICING_CARD_ORDER.map((planId: PlanId) => {
          const plan = PLANS[planId];
          const isBestValue = planId === 'season_pass';
          const isCurrentPlan = currentUser && entitlements.effectivePlan === planId;
          const isPaidCard = planId === 'weekly' || planId === 'premium' || planId === 'season_pass';

          return (
            <article
              key={plan.id}
              className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-shadow ${
                isBestValue
                  ? 'border-amber-400 bg-gradient-to-b from-emerald-950 to-slate-950 text-white shadow-xl ring-2 ring-amber-400/70'
                  : 'border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white'
              }`}
            >
              {isBestValue && (
                <div className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-amber-400 px-3 py-0.5 text-xs font-extrabold text-slate-950 shadow">
                  <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                  Best Value
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  {isCurrentPlan && (
                    <span
                      className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                        isBestValue
                          ? 'bg-emerald-500/25 text-emerald-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      Current
                    </span>
                  )}
                </div>

                <p
                  className={`mt-1 text-xs ${
                    isBestValue ? 'text-emerald-100/80' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {plan.audience}
                </p>

                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl font-extrabold tabular-nums">
                    {formatNaira(plan.priceNaira)}
                  </span>
                  <span
                    className={`text-xs ${
                      isBestValue ? 'text-emerald-200' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {plan.cadenceLabel}
                  </span>
                </div>

                <ul className="mt-6 space-y-2.5 text-xs sm:text-sm">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <CheckCircle2
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          isBestValue ? 'text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                        aria-hidden="true"
                      />
                      <span className={isBestValue ? 'text-slate-100' : 'text-slate-700 dark:text-slate-300'}>
                        {feat}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-7 pt-2">
                {isPaidCard ? (
                  <button
                    type="button"
                    onClick={() => onSelectPaidPlan(planId as PaidPlanId)}
                    className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
                      isBestValue
                        ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                    {isCurrentPlan ? `Extend ${plan.name}` : `Choose ${plan.name}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={!currentUser ? onRequireAuth : undefined}
                    disabled={Boolean(currentUser)}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-65 dark:border-slate-700 dark:text-slate-300"
                  >
                    {currentUser
                      ? isCurrentPlan
                        ? 'Active Free Plan'
                        : 'Included Free Baseline'
                      : 'Start Free Account'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {/* Feature Comparison Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Free vs. Paid &amp; Trial Entitlements
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Weekly (₦500), Premium (₦1,500), Exam Season Pass (₦3,500), and 3-Day Free Trial all share full Premium privileges.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Live Card (Paystack) · Opay Bank Transfer
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-3 pr-4 font-semibold">Feature</th>
                <th className="py-3 px-4 font-semibold">Free Plan (₦0)</th>
                <th className="py-3 pl-4 font-semibold text-emerald-700 dark:text-emerald-400">
                  Weekly / Premium / Season Pass / Trial
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.feature}>
                  <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white">
                    {row.feature}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                    {row.free === 'Locked' ? (
                      <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Locked
                      </span>
                    ) : (
                      row.free
                    )}
                  </td>
                  <td className="py-3 pl-4 font-semibold text-emerald-700 dark:text-emerald-400">
                    {row.paid}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
