import type { PlanId, User } from '../types/database';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  audience: string;
  priceNaira: number;
  cadenceLabel: string;
  durationDays: number;
  badge?: string;
  aiDailyLimit: number;
  cbtDailyLimit: number | null; // null = unlimited
  questionsPerSubjectLimit: number | null; // null = unlimited
  fullExplanations: boolean;
  offlineAccess: boolean;
  adsEnabled: boolean;
  features: string[];
}

export const FREE_QUESTIONS_PER_SUBJECT = 5;
export const FREE_DAILY_CBT_LIMIT = 1;
export const FREE_DAILY_AI_LIMIT = 5;
export const PAID_DAILY_AI_LIMIT = 50;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    audience: 'Getting started with exam prep',
    priceNaira: 0,
    cadenceLabel: 'Forever free',
    durationDays: 0,
    aiDailyLimit: FREE_DAILY_AI_LIMIT,
    cbtDailyLimit: FREE_DAILY_CBT_LIMIT,
    questionsPerSubjectLimit: FREE_QUESTIONS_PER_SUBJECT,
    fullExplanations: false,
    offlineAccess: false,
    adsEnabled: true,
    features: [
      `${FREE_QUESTIONS_PER_SUBJECT} past questions per subject`,
      `${FREE_DAILY_CBT_LIMIT} timed CBT test per day`,
      `${FREE_DAILY_AI_LIMIT} AI Tutor messages per day`,
      'School News, Directory & Scholarships access',
      'Ad-supported experience',
    ],
  },
  trial: {
    id: 'trial',
    name: 'Premium Trial',
    audience: '3-day full access for new students',
    priceNaira: 0,
    cadenceLabel: '3 days free',
    durationDays: 3,
    aiDailyLimit: PAID_DAILY_AI_LIMIT,
    cbtDailyLimit: null,
    questionsPerSubjectLimit: null,
    fullExplanations: true,
    offlineAccess: true,
    adsEnabled: false,
    features: [
      'Unlimited past questions + full explanations',
      'Unlimited daily CBT practice tests',
      'Detailed subject & weak-area tracking',
      `${PAID_DAILY_AI_LIMIT} AI Tutor messages per day`,
      'No ads + offline saved question packs',
    ],
  },
  weekly: {
    id: 'weekly',
    name: 'Weekly Pass',
    audience: 'For quick revision sprints & mock weeks',
    priceNaira: 500,
    cadenceLabel: '/ week (7 days)',
    durationDays: 7,
    aiDailyLimit: PAID_DAILY_AI_LIMIT,
    cbtDailyLimit: null,
    questionsPerSubjectLimit: null,
    fullExplanations: true,
    offlineAccess: true,
    adsEnabled: false,
    features: [
      'Unlimited past questions with full explanations',
      'Unlimited daily CBT tests',
      'Detailed performance & weak-subject analytics',
      `${PAID_DAILY_AI_LIMIT} AI Tutor messages per day`,
      'Ad-free + offline saved questions',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    audience: 'For steady monthly JAMB, WAEC & NECO prep',
    priceNaira: 1500,
    cadenceLabel: '/ month (30 days)',
    durationDays: 30,
    aiDailyLimit: PAID_DAILY_AI_LIMIT,
    cbtDailyLimit: null,
    questionsPerSubjectLimit: null,
    fullExplanations: true,
    offlineAccess: true,
    adsEnabled: false,
    features: [
      'Unlimited past questions with full explanations',
      'Unlimited daily CBT tests',
      'Detailed performance tracking & breakdowns',
      `${PAID_DAILY_AI_LIMIT} AI Tutor messages per day`,
      'Ad-free + offline saved questions',
    ],
  },
  season_pass: {
    id: 'season_pass',
    name: 'Exam Season Pass',
    audience: 'Full 3-month JAMB & WAEC season coverage',
    priceNaira: 3500,
    cadenceLabel: '/ 3 months (90 days)',
    durationDays: 90,
    badge: 'Best Value',
    aiDailyLimit: PAID_DAILY_AI_LIMIT,
    cbtDailyLimit: null,
    questionsPerSubjectLimit: null,
    fullExplanations: true,
    offlineAccess: true,
    adsEnabled: false,
    features: [
      'Everything in Premium for 90 full days',
      'Save ₦1,000 compared to 3 monthly renewals',
      'Unlimited past questions, CBT & full explanations',
      `${PAID_DAILY_AI_LIMIT} AI Tutor messages per day`,
      'Ad-free + offline saved questions',
    ],
  },
};

export const PRICING_CARD_ORDER: PlanId[] = ['free', 'weekly', 'premium', 'season_pass'];

export function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isPlanActive(plan: PlanId | undefined, planExpiry: string | null | undefined): boolean {
  if (!plan || plan === 'free') return false;
  if (!planExpiry) return false;
  return new Date(planExpiry).getTime() > Date.now();
}

export interface UserEntitlements {
  effectivePlan: PlanId;
  isPaidOrTrial: boolean;
  isExpired: boolean;
  aiDailyLimit: number;
  cbtDailyLimit: number | null;
  questionsPerSubjectLimit: number | null;
  fullExplanations: boolean;
  offlineAccess: boolean;
  adsEnabled: boolean;
  aiUsedToday: number;
  aiRemainingToday: number;
  cbtUsedToday: number;
  cbtRemainingToday: number | null;
  daysLeft: number;
}

export function getUserEntitlements(user: User | null): UserEntitlements {
  const today = getTodayDateKey();

  if (!user) {
    return {
      effectivePlan: 'free',
      isPaidOrTrial: false,
      isExpired: false,
      aiDailyLimit: FREE_DAILY_AI_LIMIT,
      cbtDailyLimit: FREE_DAILY_CBT_LIMIT,
      questionsPerSubjectLimit: FREE_QUESTIONS_PER_SUBJECT,
      fullExplanations: false,
      offlineAccess: false,
      adsEnabled: true,
      aiUsedToday: 0,
      aiRemainingToday: FREE_DAILY_AI_LIMIT,
      cbtUsedToday: 0,
      cbtRemainingToday: FREE_DAILY_CBT_LIMIT,
      daysLeft: 0,
    };
  }

  const sameDay = (user.lastResetDate || user.dailyAiDate) === today;
  const aiUsedToday = sameDay ? user.dailyAiCount || 0 : 0;
  const cbtUsedToday = sameDay ? user.dailyCbtCount || 0 : 0;

  if (user.role === 'admin') {
    return {
      effectivePlan: 'season_pass',
      isPaidOrTrial: true,
      isExpired: false,
      aiDailyLimit: 500,
      cbtDailyLimit: null,
      questionsPerSubjectLimit: null,
      fullExplanations: true,
      offlineAccess: true,
      adsEnabled: false,
      aiUsedToday,
      aiRemainingToday: Math.max(0, 500 - aiUsedToday),
      cbtUsedToday,
      cbtRemainingToday: null,
      daysLeft: 365,
    };
  }

  const active = isPlanActive(user.plan, user.planExpiry);
  const expired = Boolean(user.plan && user.plan !== 'free' && !active);
  const effectivePlan: PlanId = active ? user.plan : 'free';
  const def = PLANS[effectivePlan];

  const daysLeft =
    active && user.planExpiry
      ? Math.max(1, Math.ceil((new Date(user.planExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0;

  return {
    effectivePlan,
    isPaidOrTrial: active,
    isExpired: expired,
    aiDailyLimit: def.aiDailyLimit,
    cbtDailyLimit: def.cbtDailyLimit,
    questionsPerSubjectLimit: def.questionsPerSubjectLimit,
    fullExplanations: def.fullExplanations,
    offlineAccess: def.offlineAccess,
    adsEnabled: def.adsEnabled,
    aiUsedToday,
    aiRemainingToday: Math.max(0, def.aiDailyLimit - aiUsedToday),
    cbtUsedToday,
    cbtRemainingToday: def.cbtDailyLimit === null ? null : Math.max(0, def.cbtDailyLimit - cbtUsedToday),
    daysLeft,
  };
}

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}
