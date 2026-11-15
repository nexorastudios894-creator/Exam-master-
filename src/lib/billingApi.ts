import { auth } from './firebase';
import type { PaymentChannel, PlanId, Subscription, User, UserNotification } from '../types/database';

export interface BillingProfileState {
  plan: PlanId;
  planExpiry: string | null;
  trialUsed: boolean;
  tier: 'free' | 'premium';
  dailyAiCount: number;
  dailyCbtCount: number;
  lastResetDate: string;
  referralCode: string;
  referredBy: string | null;
  referralCount: number;
  referralBonusDays: number;
  subscriptions: Subscription[];
  notifications: UserNotification[];
}

export interface PaystackInitResponse {
  mode: 'paystack_live';
  reference: string;
  amountNaira: number;
  amountKobo: number;
  currency: 'NGN';
  plan: Exclude<PlanId, 'free' | 'trial'>;
  channel: 'card';
  authorizationUrl: string;
  accessCode: string;
  publicKey?: string;
}

export interface PaystackVerifyResponse {
  verified: boolean;
  subscription: Subscription;
  billing: BillingProfileState;
  referralAwardedTo?: string | null;
}

export interface ManualTransferInitResponse {
  reference: string;
  plan: Exclude<PlanId, 'free' | 'trial'>;
  planName: string;
  amountNaira: number;
  createdAt: string;
  expiresAt: string;
  bankDetails: {
    bank: string;
    accountNumber: string;
    accountName: string;
  };
}

export interface AdminBillingOverview {
  totalUsers: number;
  activeSubscribers: number;
  planBreakdown: Record<PlanId, number>;
  totalRevenueNaira: number;
  aiMessagesToday: number;
  aiMessagesTotal: number;
  cbtTestsToday: number;
  pendingPaymentsCount: number;
  pendingPayments: Subscription[];
  recentSubscriptions: Subscription[];
  users: Array<{
    uid: string;
    name: string;
    email: string;
    role: 'student' | 'admin';
    plan: PlanId;
    planExpiry: string | null;
    trialUsed: boolean;
    dailyAiCount: number;
    dailyCbtCount: number;
    lastResetDate: string;
    referralCode: string;
    referralCount: number;
    referralBonusDays: number;
  }>;
}

async function authFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Please sign in to continue.');
  }
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = (await resp.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!resp.ok) {
    const err = new Error(data.error || `Request failed (${resp.status})`) as Error & {
      code?: string;
      status?: number;
      data?: unknown;
    };
    err.code = data.code;
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function mergeBillingIntoUser(user: User, billing: BillingProfileState): User {
  return {
    ...user,
    plan: billing.plan,
    planExpiry: billing.planExpiry,
    trialUsed: billing.trialUsed,
    tier: billing.tier,
    dailyAiCount: billing.dailyAiCount,
    dailyAiDate: billing.lastResetDate,
    dailyCbtCount: billing.dailyCbtCount,
    lastResetDate: billing.lastResetDate,
    referralCode: billing.referralCode,
    referredBy: billing.referredBy,
    referralCount: billing.referralCount,
    referralBonusDays: billing.referralBonusDays,
  };
}

export async function fetchServerBillingMe(pendingReferralCode?: string): Promise<BillingProfileState> {
  const query = pendingReferralCode ? `?ref=${encodeURIComponent(pendingReferralCode)}` : '';
  return authFetch<BillingProfileState>(`/api/billing/me${query}`);
}

export async function startFreeTrial(): Promise<{ billing: BillingProfileState; subscription: Subscription }> {
  return authFetch<{ billing: BillingProfileState; subscription: Subscription }>('/api/billing/start-trial', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function initializePaystackPayment(params: {
  plan: Exclude<PlanId, 'free' | 'trial'>;
  referralCode?: string;
}): Promise<PaystackInitResponse> {
  return authFetch<PaystackInitResponse>('/api/billing/paystack/initialize', {
    method: 'POST',
    body: JSON.stringify({
      ...params,
      channel: 'card',
    }),
  });
}

export async function verifyPaystackPayment(params: {
  reference: string;
}): Promise<PaystackVerifyResponse> {
  return authFetch<PaystackVerifyResponse>('/api/billing/paystack/verify', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function initializeManualBankTransfer(params: {
  plan: Exclude<PlanId, 'free' | 'trial'>;
  referralCode?: string;
}): Promise<ManualTransferInitResponse> {
  return authFetch<ManualTransferInitResponse>('/api/billing/bank-transfer/initialize', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function submitManualBankTransferProof(params: {
  reference: string;
  receiptUrl: string;
  receiptPath: string;
}): Promise<{ subscription: Subscription; billing: BillingProfileState }> {
  return authFetch<{ subscription: Subscription; billing: BillingProfileState }>(
    '/api/billing/bank-transfer/submit',
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );
}

export async function markNotificationRead(
  notificationId: string
): Promise<{ notifications: UserNotification[] }> {
  return authFetch<{ notifications: UserNotification[] }>('/api/billing/notifications/read', {
    method: 'POST',
    body: JSON.stringify({ notificationId }),
  });
}

export async function consumeCbtAllowance(): Promise<{ billing: BillingProfileState }> {
  return authFetch<{ billing: BillingProfileState }>('/api/billing/cbt/consume', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function applyReferralCode(
  referralCode: string
): Promise<{ billing: BillingProfileState; message: string }> {
  return authFetch<{ billing: BillingProfileState; message: string }>('/api/billing/referral/apply', {
    method: 'POST',
    body: JSON.stringify({ referralCode }),
  });
}

export async function fetchAdminBillingOverview(): Promise<AdminBillingOverview> {
  return authFetch<AdminBillingOverview>('/api/admin/billing-overview');
}

export async function fetchAdminPendingPayments(): Promise<{
  pending: Subscription[];
  reviewed: Subscription[];
}> {
  return authFetch<{ pending: Subscription[]; reviewed: Subscription[] }>('/api/admin/pending-payments');
}

export async function reviewPendingPayment(params: {
  subscriptionId: string;
  action: 'approve' | 'reject';
  rejectionReason?: string;
}): Promise<{ subscription: Subscription; notification: UserNotification; message: string }> {
  return authFetch<{ subscription: Subscription; notification: UserNotification; message: string }>(
    '/api/admin/pending-payments/review',
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );
}

export async function adminGrantOrRevokePlan(params: {
  targetUid: string;
  plan: PlanId;
  durationDays?: number;
  channel?: PaymentChannel;
}): Promise<{ targetUid: string; billing: BillingProfileState; message: string }> {
  return authFetch<{ targetUid: string; billing: BillingProfileState; message: string }>('/api/admin/grant-plan', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
