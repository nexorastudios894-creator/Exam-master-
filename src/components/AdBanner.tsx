import React from 'react';
import { Crown, Sparkles } from 'lucide-react';
import { getUserEntitlements } from '../lib/plans';
import type { User } from '../types/database';

interface AdBannerProps {
  currentUser: User | null;
  onUpgrade: () => void;
  contextLabel?: string;
}

export const AdBanner: React.FC<AdBannerProps> = ({
  currentUser,
  onUpgrade,
  contextLabel = 'Study Tip & Partner Notice',
}) => {
  const entitlements = getUserEntitlements(currentUser);
  if (!entitlements.adsEnabled) return null;

  return (
    <aside
      aria-label="Sponsored study banner"
      className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-3.5 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900/90"
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <span>Sponsored · Free Tier</span>
          <span aria-hidden="true">·</span>
          <span>{contextLabel}</span>
        </div>
        <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200">
          Study faster without ads, save subjects offline for low-data nights, and unlock 50 AI Tutor messages/day.
        </p>
      </div>

      <button
        type="button"
        onClick={onUpgrade}
        className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300 whitespace-nowrap"
      >
        {currentUser && !currentUser.trialUsed ? (
          <>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Try 3 Days Free
          </>
        ) : (
          <>
            <Crown className="h-3.5 w-3.5" aria-hidden="true" />
            Remove Ads · Plans
          </>
        )}
      </button>
    </aside>
  );
};
