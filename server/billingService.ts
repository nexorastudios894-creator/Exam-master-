import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  FREE_DAILY_AI_LIMIT,
  FREE_DAILY_CBT_LIMIT,
  getTodayDateKey,
  PAID_DAILY_AI_LIMIT,
  PLANS,
} from '../src/lib/plans';
import type { PaymentChannel, PlanId, Subscription, UserNotification } from '../src/types/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.resolve(rootDir, '.data');
const stateFilePath = path.resolve(dataDir, 'billing_state.json');

export const MANUAL_BANK_DETAILS = {
  bank: 'Opay',
  accountNumber: '9134992916',
  accountName: 'Ayomide Omojola Emmanuel',
} as const;

export const MANUAL_TRANSFER_TTL_MS = 24 * 60 * 60 * 1000;

const firebaseConfigPath = path.resolve(rootDir, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8')) as {
  apiKey: string;
  projectId: string;
  firestoreDatabaseId?: string;
};

let adminDb: Firestore | null = null;
try {
  const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (saEnv && saEnv.trim()) {
    const parsed = saEnv.trim().startsWith('{')
      ? JSON.parse(saEnv)
      : JSON.parse(fs.readFileSync(path.resolve(rootDir, saEnv.trim()), 'utf-8'));
    const adminApp = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(parsed) });
    adminDb = firebaseConfig.firestoreDatabaseId
      ? getFirestore(adminApp, firebaseConfig.firestoreDatabaseId)
      : getFirestore(adminApp);
    console.log('Firebase Admin Firestore connected for server billing enforcement.');
  }
} catch (err) {
  console.warn('Firebase Admin SDK not initialized (using local durable billing store):', err);
}

export interface ServerUserBillingRecord {
  uid: string;
  name: string;
  email: string;
  role: 'student' | 'admin';
  plan: PlanId;
  planExpiry: string | null;
  trialUsed: boolean;
  tier: 'free' | 'premium';
  dailyAiCount: number;
  dailyCbtCount: number;
  totalAiMessages: number;
  lastResetDate: string;
  referralCode: string;
  referredBy: string | null;
  referralRewarded: boolean;
  referralCount: number;
  referralBonusDays: number;
  updatedAt: string;
}

export interface PendingCardTransaction {
  reference: string;
  userId: string;
  userEmail: string;
  userName: string;
  plan: Exclude<PlanId, 'free' | 'trial'>;
  amountNaira: number;
  amountKobo: number;
  channel: 'card';
  createdAt: string;
  status: 'pending' | 'success' | 'failed';
  clientVerified?: boolean;
  webhookVerified?: boolean;
}

export interface ManualTransferIntent {
  reference: string;
  userId: string;
  userEmail: string;
  userName: string;
  plan: Exclude<PlanId, 'free' | 'trial'>;
  amountNaira: number;
  createdAt: string;
  expiresAt: string;
  status: 'awaiting_proof' | 'submitted' | 'expired';
}

interface BillingStore {
  users: Record<string, ServerUserBillingRecord>;
  subscriptions: Subscription[];
  pendingTransactions: Record<string, PendingCardTransaction>;
  manualTransfers: Record<string, ManualTransferIntent>;
  notifications: UserNotification[];
}

function loadStore(): BillingStore {
  try {
    if (fs.existsSync(stateFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8')) as Partial<BillingStore>;
      return {
        users: parsed.users || {},
        subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
        pendingTransactions: parsed.pendingTransactions || {},
        manualTransfers: parsed.manualTransfers || {},
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      };
    }
  } catch {
    // start fresh on corrupt read
  }
  return {
    users: {},
    subscriptions: [],
    pendingTransactions: {},
    manualTransfers: {},
    notifications: [],
  };
}

function saveStore(store: BillingStore): void {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(stateFilePath, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist billing store:', err);
  }
}

export function generateReferralCode(uid: string): string {
  const cleaned = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `EMN-${cleaned.slice(0, 6).padEnd(6, 'X')}`;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export function isAdminVerifiedUser(u: VerifiedFirebaseUser): boolean {
  return u.email.toLowerCase() === 'nexorastudios894@gmail.com' && u.emailVerified;
}

async function assertAdminAccess(verifiedUser: VerifiedFirebaseUser): Promise<void> {
  if (isAdminVerifiedUser(verifiedUser)) return;
  if (adminDb) {
    const snap = await adminDb.collection('admins').doc(verifiedUser.uid).get().catch(() => null);
    if (snap?.exists) return;
  }
  throw new Error('Admin privileges required.');
}

async function syncUserToFirestore(rec: ServerUserBillingRecord): Promise<void> {
  if (!adminDb) return;
  try {
    await adminDb.collection('users').doc(rec.uid).set(
      {
        uid: rec.uid,
        name: rec.name,
        email: rec.email,
        role: rec.role,
        plan: rec.plan,
        planExpiry: rec.planExpiry,
        trialUsed: rec.trialUsed,
        tier: rec.tier,
        dailyAiCount: rec.dailyAiCount,
        dailyAiDate: rec.lastResetDate,
        dailyCbtCount: rec.dailyCbtCount,
        lastResetDate: rec.lastResetDate,
        referralCode: rec.referralCode,
        referredBy: rec.referredBy,
        referralCount: rec.referralCount,
        referralBonusDays: rec.referralBonusDays,
        updatedAt: rec.updatedAt,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Firestore user sync skipped:', err);
  }
}

async function syncSubscriptionToFirestore(sub: Subscription): Promise<void> {
  if (!adminDb) return;
  try {
    await adminDb.collection('subscriptions').doc(sub.id).set(sub, { merge: true });
  } catch (err) {
    console.warn('Firestore subscription sync skipped:', err);
  }
}

async function syncNotificationToFirestore(notif: UserNotification): Promise<void> {
  if (!adminDb) return;
  try {
    await adminDb.collection('notifications').doc(notif.id).set(notif, { merge: true });
  } catch (err) {
    console.warn('Firestore notification sync skipped:', err);
  }
}

function addDaysFrom(baseIso: string | null, days: number): string {
  const nowMs = Date.now();
  const baseMs = baseIso ? new Date(baseIso).getTime() : 0;
  const startMs = baseMs > nowMs ? baseMs : nowMs;
  return new Date(startMs + days * 24 * 60 * 60 * 1000).toISOString();
}

function expireStaleManualTransfers(store: BillingStore): boolean {
  const nowMs = Date.now();
  let changed = false;
  for (const intent of Object.values(store.manualTransfers)) {
    if (intent.status === 'awaiting_proof' && new Date(intent.expiresAt).getTime() <= nowMs) {
      intent.status = 'expired';
      changed = true;
    }
  }
  return changed;
}

function getLivePaystackKeys(): { secretKey: string; publicKey: string } {
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || '';
  const publicKey = process.env.VITE_PAYSTACK_PUBLIC_KEY?.trim() || '';

  if (!secretKey) {
    throw new Error(
      'Live Paystack card payments are not configured yet (PAYSTACK_SECRET_KEY starting with sk_live_ is required). You can use Bank Transfer (Opay) in the meantime.'
    );
  }
  if (!secretKey.startsWith('sk_live_')) {
    throw new Error(
      'Paystack test keys and test mode are disabled. Only a live Paystack secret key (sk_live_...) is permitted.'
    );
  }
  if (publicKey && !publicKey.startsWith('pk_live_')) {
    throw new Error(
      'Paystack test public keys are disabled. VITE_PAYSTACK_PUBLIC_KEY must start with pk_live_.'
    );
  }

  return { secretKey, publicKey };
}

export async function getOrNormalizeUserBilling(
  verifiedUser: VerifiedFirebaseUser,
  pendingRef?: string
): Promise<{
  record: ServerUserBillingRecord;
  subscriptions: Subscription[];
  notifications: UserNotification[];
}> {
  const store = loadStore();
  const today = getTodayDateKey();
  const isAdmin = isAdminVerifiedUser(verifiedUser);
  let storeDirty = expireStaleManualTransfers(store);

  if (!store.users[verifiedUser.uid] && adminDb) {
    try {
      const snap = await adminDb.collection('users').doc(verifiedUser.uid).get();
      if (snap.exists) {
        const d = snap.data() as Partial<ServerUserBillingRecord>;
        store.users[verifiedUser.uid] = {
          uid: verifiedUser.uid,
          name: d.name || verifiedUser.displayName || 'Student',
          email: d.email || verifiedUser.email || '',
          role: isAdmin ? 'admin' : d.role || 'student',
          plan: isAdmin ? 'season_pass' : d.plan || 'free',
          planExpiry: d.planExpiry ?? null,
          trialUsed: Boolean(d.trialUsed),
          tier: d.tier || 'free',
          dailyAiCount: Number(d.dailyAiCount || 0),
          dailyCbtCount: Number(d.dailyCbtCount || 0),
          totalAiMessages: Number(d.totalAiMessages || 0),
          lastResetDate: d.lastResetDate || today,
          referralCode: d.referralCode || generateReferralCode(verifiedUser.uid),
          referredBy: d.referredBy ?? null,
          referralRewarded: Boolean(d.referralRewarded),
          referralCount: Number(d.referralCount || 0),
          referralBonusDays: Number(d.referralBonusDays || 0),
          updatedAt: new Date().toISOString(),
        };
        storeDirty = true;
      }
    } catch {
      // ignore
    }
  }

  let rec = store.users[verifiedUser.uid];
  let userChanged = false;

  if (!rec) {
    rec = {
      uid: verifiedUser.uid,
      name: verifiedUser.displayName || 'Nigerian Candidate',
      email: verifiedUser.email || '',
      role: isAdmin ? 'admin' : 'student',
      plan: isAdmin ? 'season_pass' : 'free',
      planExpiry: isAdmin ? addDaysFrom(null, 365) : null,
      trialUsed: false,
      tier: isAdmin ? 'premium' : 'free',
      dailyAiCount: 0,
      dailyCbtCount: 0,
      totalAiMessages: 0,
      lastResetDate: today,
      referralCode: generateReferralCode(verifiedUser.uid),
      referredBy: null,
      referralRewarded: false,
      referralCount: 0,
      referralBonusDays: 0,
      updatedAt: new Date().toISOString(),
    };
    store.users[verifiedUser.uid] = rec;
    userChanged = true;
  }

  if (isAdmin && rec.role !== 'admin') {
    rec.role = 'admin';
    rec.tier = 'premium';
    rec.plan = 'season_pass';
    rec.planExpiry = addDaysFrom(null, 365);
    userChanged = true;
  }
  if (verifiedUser.email && rec.email !== verifiedUser.email) {
    rec.email = verifiedUser.email;
    userChanged = true;
  }
  if (verifiedUser.displayName && rec.name === 'Student') {
    rec.name = verifiedUser.displayName;
    userChanged = true;
  }

  if (pendingRef && !rec.referredBy) {
    const cleanRef = pendingRef.trim().toUpperCase();
    if (cleanRef && cleanRef !== rec.referralCode) {
      rec.referredBy = cleanRef;
      userChanged = true;
    }
  }

  if (rec.lastResetDate !== today) {
    rec.dailyAiCount = 0;
    rec.dailyCbtCount = 0;
    rec.lastResetDate = today;
    userChanged = true;
  }

  if (rec.role !== 'admin' && rec.plan !== 'free') {
    const expiryMs = rec.planExpiry ? new Date(rec.planExpiry).getTime() : 0;
    if (!expiryMs || expiryMs <= Date.now()) {
      rec.plan = 'free';
      rec.planExpiry = null;
      rec.tier = 'free';
      userChanged = true;
    }
  }

  const expectedTier = rec.role === 'admin' || rec.plan !== 'free' ? 'premium' : 'free';
  if (rec.tier !== expectedTier) {
    rec.tier = expectedTier;
    userChanged = true;
  }

  if (userChanged || storeDirty) {
    if (userChanged) {
      rec.updatedAt = new Date().toISOString();
      store.users[rec.uid] = rec;
    }
    saveStore(store);
    if (userChanged) {
      await syncUserToFirestore(rec);
    }
  }

  const userSubs = store.subscriptions
    .filter((s) => s.userId === rec.uid)
    .sort((a, b) => b.date.localeCompare(a.date));
  const userNotifications = store.notifications
    .filter((n) => n.userId === rec.uid)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { record: rec, subscriptions: userSubs, notifications: userNotifications };
}

export function toClientBillingState(
  record: ServerUserBillingRecord,
  subscriptions: Subscription[],
  notifications: UserNotification[] = []
) {
  return {
    plan: record.plan,
    planExpiry: record.planExpiry,
    trialUsed: record.trialUsed,
    tier: record.tier,
    dailyAiCount: record.dailyAiCount,
    dailyCbtCount: record.dailyCbtCount,
    lastResetDate: record.lastResetDate,
    referralCode: record.referralCode,
    referredBy: record.referredBy,
    referralCount: record.referralCount,
    referralBonusDays: record.referralBonusDays,
    subscriptions,
    notifications,
  };
}

export async function startThreeDayTrial(verifiedUser: VerifiedFirebaseUser) {
  const { record } = await getOrNormalizeUserBilling(verifiedUser);
  if (record.trialUsed) {
    throw new Error('Your 3-day free trial has already been used on this account.');
  }
  if (record.plan !== 'free') {
    throw new Error('You already have an active subscription plan.');
  }

  const store = loadStore();
  const target = store.users[record.uid];
  const now = new Date().toISOString();
  const expiresAt = addDaysFrom(null, PLANS.trial.durationDays);

  target.plan = 'trial';
  target.planExpiry = expiresAt;
  target.trialUsed = true;
  target.tier = 'premium';
  target.updatedAt = now;

  const sub: Subscription = {
    id: `sub-trial-${Date.now()}`,
    userId: target.uid,
    userEmail: target.email,
    userName: target.name,
    plan: 'trial',
    amount: 0,
    reference: `TRIAL-${target.uid.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    channel: 'trial',
    status: 'success',
    date: now,
    expiresAt,
  };

  store.subscriptions.unshift(sub);
  saveStore(store);
  await Promise.all([syncUserToFirestore(target), syncSubscriptionToFirestore(sub)]);

  const userSubs = store.subscriptions.filter((s) => s.userId === target.uid);
  const userNotifs = store.notifications.filter((n) => n.userId === target.uid);
  return { billing: toClientBillingState(target, userSubs, userNotifs), subscription: sub };
}

// ==================== 1. PAYSTACK LIVE CARD PAYMENTS ONLY ====================
export async function initializePaystackTx(params: {
  verifiedUser: VerifiedFirebaseUser;
  plan: Exclude<PlanId, 'free' | 'trial'>;
  referralCode?: string;
}) {
  const { verifiedUser, plan, referralCode } = params;
  const planDef = PLANS[plan];
  if (!planDef || planDef.priceNaira <= 0) {
    throw new Error('Invalid subscription plan selected.');
  }

  const { secretKey: paystackSecret, publicKey: paystackPublic } = getLivePaystackKeys();
  const { record } = await getOrNormalizeUserBilling(verifiedUser, referralCode);
  const store = loadStore();

  const reference = `EMN_LIVE_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const amountNaira = planDef.priceNaira;
  const amountKobo = amountNaira * 100;

  const pending: PendingCardTransaction = {
    reference,
    userId: record.uid,
    userEmail: record.email || 'student@exammaster.ng',
    userName: record.name,
    plan,
    amountNaira,
    amountKobo,
    channel: 'card',
    createdAt: new Date().toISOString(),
    status: 'pending',
    clientVerified: false,
    webhookVerified: false,
  };

  store.pendingTransactions[reference] = pending;
  saveStore(store);

  const resp = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: pending.userEmail,
      amount: amountKobo,
      currency: 'NGN',
      reference,
      channels: ['card'],
      metadata: {
        uid: record.uid,
        plan,
        channel: 'card',
      },
    }),
  });

  const json = (await resp.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url: string; access_code: string; reference: string };
  };

  if (!resp.ok || !json.status || !json.data) {
    throw new Error(json.message || 'Live Paystack card initialization failed.');
  }

  return {
    mode: 'paystack_live' as const,
    reference: json.data.reference || reference,
    amountNaira,
    amountKobo,
    currency: 'NGN' as const,
    plan,
    channel: 'card' as const,
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code,
    publicKey: paystackPublic,
  };
}

async function creditReferralBonusIfEligible(
  store: BillingStore,
  user: ServerUserBillingRecord,
  reference: string,
  now: string
): Promise<string | null> {
  if (!user.referredBy || user.referralRewarded) return null;

  const referrerEntry = Object.values(store.users).find(
    (u) =>
      u.uid !== user.uid &&
      (u.referralCode.toUpperCase() === user.referredBy?.toUpperCase() || u.uid === user.referredBy)
  );
  if (!referrerEntry) return null;

  const referrerBase = referrerEntry.plan !== 'free' ? referrerEntry.planExpiry : null;
  const referrerNewExpiry = addDaysFrom(referrerBase, 7);
  if (referrerEntry.plan === 'free' || referrerEntry.plan === 'trial') {
    referrerEntry.plan = 'premium';
  }
  referrerEntry.planExpiry = referrerNewExpiry;
  referrerEntry.tier = 'premium';
  referrerEntry.referralCount += 1;
  referrerEntry.referralBonusDays += 7;
  referrerEntry.updatedAt = now;
  user.referralRewarded = true;

  const bonusSub: Subscription = {
    id: `sub-ref-${Date.now()}`,
    userId: referrerEntry.uid,
    userEmail: referrerEntry.email,
    userName: referrerEntry.name,
    plan: referrerEntry.plan,
    amount: 0,
    reference: `REF-${reference}`,
    channel: 'referral',
    status: 'success',
    date: now,
    expiresAt: referrerNewExpiry,
  };
  store.subscriptions.unshift(bonusSub);
  await Promise.all([syncUserToFirestore(referrerEntry), syncSubscriptionToFirestore(bonusSub)]);
  return referrerEntry.name;
}

async function applyVerifiedCardPlanAndReferral(
  store: BillingStore,
  uid: string,
  plan: Exclude<PlanId, 'free' | 'trial'>,
  amountNaira: number,
  reference: string
): Promise<{ subscription: Subscription; userRecord: ServerUserBillingRecord; referralAwardedTo: string | null }> {
  const existingSuccess = store.subscriptions.find((s) => s.reference === reference && s.status === 'success');
  if (existingSuccess && store.users[uid]) {
    return { subscription: existingSuccess, userRecord: store.users[uid], referralAwardedTo: null };
  }

  const user = store.users[uid];
  if (!user) {
    throw new Error('User billing profile not found.');
  }

  const planDef = PLANS[plan];
  const now = new Date().toISOString();
  const baseExpiry = user.plan !== 'free' && user.planExpiry ? user.planExpiry : null;
  const newExpiry = addDaysFrom(baseExpiry, planDef.durationDays);

  user.plan = plan;
  user.planExpiry = newExpiry;
  user.tier = 'premium';
  user.updatedAt = now;

  const subscription: Subscription = {
    id: `sub-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    userId: user.uid,
    userEmail: user.email,
    userName: user.name,
    plan,
    amount: amountNaira,
    reference,
    channel: 'card',
    status: 'success',
    date: now,
    expiresAt: newExpiry,
  };

  store.subscriptions.unshift(subscription);
  if (store.pendingTransactions[reference]) {
    store.pendingTransactions[reference].status = 'success';
  }

  const referralAwardedTo = await creditReferralBonusIfEligible(store, user, reference, now);

  saveStore(store);
  await Promise.all([syncUserToFirestore(user), syncSubscriptionToFirestore(subscription)]);

  return { subscription, userRecord: user, referralAwardedTo };
}

function recordFailedPaystackAttempt(
  store: BillingStore,
  pending: PendingCardTransaction,
  reason: string
): Subscription {
  pending.status = 'failed';
  const failedSub: Subscription = {
    id: `sub-fail-${Date.now()}`,
    userId: pending.userId,
    userEmail: pending.userEmail,
    userName: pending.userName,
    plan: pending.plan,
    amount: pending.amountNaira,
    reference: pending.reference,
    channel: 'card',
    status: 'failed',
    date: new Date().toISOString(),
    expiresAt: null,
    rejectionReason: reason.slice(0, 480),
  };
  store.subscriptions.unshift(failedSub);
  saveStore(store);
  void syncSubscriptionToFirestore(failedSub);
  return failedSub;
}

export async function verifyPaystackTransaction(params: {
  verifiedUser: VerifiedFirebaseUser;
  reference: string;
}) {
  const { verifiedUser, reference } = params;
  const cleanRef = reference.trim();
  if (!cleanRef) {
    throw new Error('Payment reference is required.');
  }

  const { secretKey: paystackSecret } = getLivePaystackKeys();

  await getOrNormalizeUserBilling(verifiedUser);
  const store = loadStore();

  // Prevent a payment reference from being used twice or across accounts
  const existingSuccess = store.subscriptions.find(
    (s) => s.reference === cleanRef && s.status === 'success'
  );
  if (existingSuccess) {
    if (existingSuccess.userId !== verifiedUser.uid) {
      throw new Error('This payment reference has already been redeemed by another account.');
    }
    const pendingRec = store.pendingTransactions[cleanRef];
    if (pendingRec && pendingRec.webhookVerified && !pendingRec.clientVerified && store.users[verifiedUser.uid]) {
      pendingRec.clientVerified = true;
      saveStore(store);
      const userSubs = store.subscriptions.filter((s) => s.userId === verifiedUser.uid);
      const userNotifs = store.notifications.filter((n) => n.userId === verifiedUser.uid);
      return {
        verified: true,
        subscription: existingSuccess,
        billing: toClientBillingState(store.users[verifiedUser.uid], userSubs, userNotifs),
        referralAwardedTo: null,
      };
    }
    throw new Error('This payment reference has already been used and cannot be reused.');
  }

  const pending = store.pendingTransactions[cleanRef];
  if (!pending || pending.userId !== verifiedUser.uid) {
    throw new Error('Invalid or unrecognized payment reference for your account.');
  }
  if (pending.status === 'failed') {
    throw new Error('This payment reference failed verification and cannot be reused.');
  }

  const resp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(cleanRef)}`, {
    headers: {
      Authorization: `Bearer ${paystackSecret}`,
    },
  });
  const json = (await resp.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: {
      status?: string;
      domain?: string;
      amount?: number;
      currency?: string;
      channel?: string;
      gateway_response?: string;
    };
  };

  const payData = json.data;
  if (!resp.ok || !json.status || !payData) {
    const reason = json.message || 'Unable to verify transaction with Paystack.';
    recordFailedPaystackAttempt(store, pending, reason);
    throw new Error(reason);
  }

  if (payData.domain !== 'live') {
    const reason = 'Test cards and sandbox transactions are rejected. Only real live Paystack payments can activate a plan.';
    recordFailedPaystackAttempt(store, pending, reason);
    throw new Error(reason);
  }

  if (payData.status !== 'success') {
    const reason = payData.gateway_response || `Payment status is "${payData.status || 'unsuccessful'}".`;
    recordFailedPaystackAttempt(store, pending, reason);
    throw new Error(reason);
  }

  if (String(payData.currency || '').toUpperCase() !== 'NGN') {
    const reason = `Currency mismatch: expected NGN, received ${payData.currency || 'unknown'}.`;
    recordFailedPaystackAttempt(store, pending, reason);
    throw new Error(reason);
  }

  if (Number(payData.amount) !== pending.amountKobo) {
    const reason = `Amount mismatch: expected ₦${pending.amountNaira}, Paystack reported ₦${Number(payData.amount || 0) / 100}.`;
    recordFailedPaystackAttempt(store, pending, reason);
    throw new Error(reason);
  }

  if (payData.channel !== 'card') {
    const reason = `Invalid payment channel "${payData.channel}". Paystack checkout accepts live debit/credit cards only.`;
    recordFailedPaystackAttempt(store, pending, reason);
    throw new Error(reason);
  }

  pending.clientVerified = true;
  const result = await applyVerifiedCardPlanAndReferral(
    store,
    verifiedUser.uid,
    pending.plan,
    pending.amountNaira,
    cleanRef
  );

  const userSubs = store.subscriptions.filter((s) => s.userId === verifiedUser.uid);
  const userNotifs = store.notifications.filter((n) => n.userId === verifiedUser.uid);
  return {
    verified: true,
    subscription: result.subscription,
    billing: toClientBillingState(result.userRecord, userSubs, userNotifs),
    referralAwardedTo: result.referralAwardedTo,
  };
}

export async function handlePaystackWebhookEvent(rawBody: Buffer, signature: string | undefined): Promise<void> {
  const { secretKey: paystackSecret } = getLivePaystackKeys();
  const expectedSig = crypto.createHmac('sha512', paystackSecret).update(rawBody).digest('hex');
  if (!signature) {
    throw new Error('Missing Paystack webhook signature.');
  }
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid Paystack webhook signature.');
  }

  const evt = JSON.parse(rawBody.toString('utf-8')) as {
    event?: string;
    data?: {
      reference?: string;
      status?: string;
      domain?: string;
      amount?: number;
      currency?: string;
      channel?: string;
      gateway_response?: string;
    };
  };

  const ref = evt.data?.reference;
  if (!ref) return;

  const store = loadStore();
  const pending = store.pendingTransactions[ref];
  if (!pending) return;

  if (evt.event === 'charge.success') {
    const isLive = evt.data?.domain === 'live';
    const isSuccess = evt.data?.status === 'success';
    const isNgn = String(evt.data?.currency || '').toUpperCase() === 'NGN';
    const isExactAmount = Number(evt.data?.amount) === pending.amountKobo;
    const isCard = evt.data?.channel === 'card';

    if (isLive && isSuccess && isNgn && isExactAmount && isCard) {
      pending.webhookVerified = true;
      await applyVerifiedCardPlanAndReferral(store, pending.userId, pending.plan, pending.amountNaira, ref);
    } else {
      recordFailedPaystackAttempt(
        store,
        pending,
        'Webhook rejected: transaction did not meet live NGN card exact-amount criteria.'
      );
    }
  } else if (evt.event === 'charge.failed') {
    recordFailedPaystackAttempt(
      store,
      pending,
      evt.data?.gateway_response || 'Paystack card charge failed.'
    );
  }
}

// ==================== 2. MANUAL BANK TRANSFER (OPAY) ====================
export async function initializeManualBankTransfer(params: {
  verifiedUser: VerifiedFirebaseUser;
  plan: Exclude<PlanId, 'free' | 'trial'>;
  referralCode?: string;
}) {
  const { verifiedUser, plan, referralCode } = params;
  const planDef = PLANS[plan];
  if (!planDef || planDef.priceNaira <= 0) {
    throw new Error('Invalid subscription plan selected.');
  }

  const { record } = await getOrNormalizeUserBilling(verifiedUser, referralCode);
  const store = loadStore();
  expireStaleManualTransfers(store);

  const nowMs = Date.now();
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + MANUAL_TRANSFER_TTL_MS).toISOString();
  const reference = `EMN-TRF-${nowMs.toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  const intent: ManualTransferIntent = {
    reference,
    userId: record.uid,
    userEmail: record.email,
    userName: record.name,
    plan,
    amountNaira: planDef.priceNaira,
    createdAt,
    expiresAt,
    status: 'awaiting_proof',
  };

  store.manualTransfers[reference] = intent;
  saveStore(store);

  return {
    reference,
    plan,
    planName: planDef.name,
    amountNaira: planDef.priceNaira,
    createdAt,
    expiresAt,
    bankDetails: MANUAL_BANK_DETAILS,
  };
}

export async function submitManualBankTransferProof(params: {
  verifiedUser: VerifiedFirebaseUser;
  reference: string;
  receiptUrl: string;
  receiptPath: string;
}) {
  const { verifiedUser, reference, receiptUrl, receiptPath } = params;
  const cleanRef = reference.trim();
  const cleanUrl = receiptUrl.trim();
  const cleanPath = receiptPath.trim();

  if (!cleanRef) {
    throw new Error('Transfer reference is required.');
  }
  if (!cleanUrl.startsWith('https://') || !cleanPath.startsWith(`receipts/${verifiedUser.uid}/`)) {
    throw new Error('Valid uploaded receipt screenshot is required.');
  }

  const { record } = await getOrNormalizeUserBilling(verifiedUser);
  const store = loadStore();
  const expiredAny = expireStaleManualTransfers(store);

  const alreadySub = store.subscriptions.find((s) => s.reference === cleanRef);
  if (alreadySub) {
    if (expiredAny) saveStore(store);
    throw new Error('A receipt has already been submitted for this transfer reference.');
  }

  const intent = store.manualTransfers[cleanRef];
  if (!intent || intent.userId !== verifiedUser.uid) {
    if (expiredAny) saveStore(store);
    throw new Error('Invalid or unrecognized bank transfer reference.');
  }

  if (intent.status === 'expired' || new Date(intent.expiresAt).getTime() <= Date.now()) {
    intent.status = 'expired';
    saveStore(store);
    throw new Error('This bank transfer reference expired after 24 hours. Please start a new transfer request.');
  }

  if (intent.status !== 'awaiting_proof') {
    throw new Error('Proof has already been submitted for this reference.');
  }

  const now = new Date().toISOString();
  intent.status = 'submitted';

  const sub: Subscription = {
    id: `sub-trf-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    userId: record.uid,
    userEmail: record.email,
    userName: record.name,
    plan: intent.plan,
    amount: intent.amountNaira,
    reference: intent.reference,
    channel: 'bank_transfer',
    status: 'pending',
    date: now,
    expiresAt: null,
    receiptUrl: cleanUrl,
    receiptPath: cleanPath,
    transferExpiresAt: intent.expiresAt,
    submittedAt: now,
  };

  store.subscriptions.unshift(sub);
  saveStore(store);
  await syncSubscriptionToFirestore(sub);

  const userSubs = store.subscriptions.filter((s) => s.userId === record.uid);
  const userNotifs = store.notifications.filter((n) => n.userId === record.uid);
  return {
    subscription: sub,
    billing: toClientBillingState(record, userSubs, userNotifs),
  };
}

export async function getAdminPendingPayments(verifiedAdmin: VerifiedFirebaseUser) {
  await assertAdminAccess(verifiedAdmin);
  const store = loadStore();
  if (expireStaleManualTransfers(store)) {
    saveStore(store);
  }

  const bankTransfers = store.subscriptions
    .filter((s) => s.channel === 'bank_transfer')
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    pending: bankTransfers.filter((s) => s.status === 'pending'),
    reviewed: bankTransfers.filter((s) => s.status !== 'pending').slice(0, 30),
  };
}

export async function reviewPendingBankTransfer(params: {
  verifiedAdmin: VerifiedFirebaseUser;
  subscriptionId: string;
  action: 'approve' | 'reject';
  rejectionReason?: string;
}) {
  const { verifiedAdmin, subscriptionId, action, rejectionReason } = params;
  await assertAdminAccess(verifiedAdmin);

  const store = loadStore();
  if (expireStaleManualTransfers(store)) {
    saveStore(store);
  }

  const sub = store.subscriptions.find((s) => s.id === subscriptionId);
  if (!sub) {
    throw new Error('Pending payment record not found.');
  }
  if (sub.channel !== 'bank_transfer') {
    throw new Error('Only manual bank transfer payments can be manually reviewed.');
  }
  if (sub.status !== 'pending') {
    throw new Error(`This payment has already been ${sub.status}.`);
  }

  let targetUser = store.users[sub.userId];
  if (!targetUser && adminDb) {
    const snap = await adminDb.collection('users').doc(sub.userId).get().catch(() => null);
    if (snap?.exists) {
      const d = snap.data() as Partial<ServerUserBillingRecord>;
      targetUser = {
        uid: sub.userId,
        name: d.name || sub.userName || 'Student',
        email: d.email || sub.userEmail || '',
        role: d.role || 'student',
        plan: d.plan || 'free',
        planExpiry: d.planExpiry ?? null,
        trialUsed: Boolean(d.trialUsed),
        tier: d.tier || 'free',
        dailyAiCount: Number(d.dailyAiCount || 0),
        dailyCbtCount: Number(d.dailyCbtCount || 0),
        totalAiMessages: Number(d.totalAiMessages || 0),
        lastResetDate: d.lastResetDate || getTodayDateKey(),
        referralCode: d.referralCode || generateReferralCode(sub.userId),
        referredBy: d.referredBy ?? null,
        referralRewarded: Boolean(d.referralRewarded),
        referralCount: Number(d.referralCount || 0),
        referralBonusDays: Number(d.referralBonusDays || 0),
        updatedAt: new Date().toISOString(),
      };
      store.users[sub.userId] = targetUser;
    }
  }

  if (!targetUser) {
    throw new Error('Student billing record not found.');
  }

  const now = new Date().toISOString();
  const planName = PLANS[sub.plan]?.name || sub.plan;

  if (action === 'approve') {
    const durationDays = PLANS[sub.plan]?.durationDays || 30;
    const baseExpiry = targetUser.plan !== 'free' && targetUser.planExpiry ? targetUser.planExpiry : null;
    const newExpiry = addDaysFrom(baseExpiry, durationDays);

    targetUser.plan = sub.plan;
    targetUser.planExpiry = newExpiry;
    targetUser.tier = 'premium';
    targetUser.updatedAt = now;

    sub.status = 'success';
    sub.expiresAt = newExpiry;
    sub.reviewedBy = verifiedAdmin.email;
    sub.reviewedAt = now;
    sub.rejectionReason = null;

    await creditReferralBonusIfEligible(store, targetUser, sub.reference, now);

    const notif: UserNotification = {
      id: `notif-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      userId: targetUser.uid,
      type: 'payment_approved',
      title: 'Bank Transfer Approved!',
      message: `Your Opay transfer of ₦${sub.amount.toLocaleString()} (Ref: ${sub.reference}) for ${planName} has been verified and activated.`,
      reference: sub.reference,
      plan: sub.plan,
      read: false,
      createdAt: now,
    };
    store.notifications.unshift(notif);

    saveStore(store);
    await Promise.all([
      syncUserToFirestore(targetUser),
      syncSubscriptionToFirestore(sub),
      syncNotificationToFirestore(notif),
    ]);

    return {
      subscription: sub,
      notification: notif,
      message: `Approved ${planName} for ${targetUser.name} (expires ${new Date(newExpiry).toLocaleDateString('en-NG')}).`,
    };
  }

  const cleanReason = (rejectionReason || '').trim();
  if (!cleanReason) {
    throw new Error('Please enter a rejection reason before rejecting this transfer.');
  }

  sub.status = 'rejected';
  sub.rejectionReason = cleanReason.slice(0, 500);
  sub.reviewedBy = verifiedAdmin.email;
  sub.reviewedAt = now;

  const notif: UserNotification = {
    id: `notif-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    userId: targetUser.uid,
    type: 'payment_rejected',
    title: 'Bank Transfer Rejected',
    message: `Your Opay transfer (Ref: ${sub.reference}) for ${planName} could not be approved. Reason: ${cleanReason}`,
    reference: sub.reference,
    plan: sub.plan,
    reason: cleanReason.slice(0, 500),
    read: false,
    createdAt: now,
  };
  store.notifications.unshift(notif);

  saveStore(store);
  await Promise.all([syncSubscriptionToFirestore(sub), syncNotificationToFirestore(notif)]);

  return {
    subscription: sub,
    notification: notif,
    message: `Rejected transfer ${sub.reference} and notified ${targetUser.name}.`,
  };
}

export async function markUserNotificationRead(
  verifiedUser: VerifiedFirebaseUser,
  notificationId: string
): Promise<UserNotification[]> {
  const store = loadStore();
  let changed = false;
  const updatedNotifs: UserNotification[] = [];

  for (const n of store.notifications) {
    if (n.userId === verifiedUser.uid && (notificationId === 'all' || n.id === notificationId)) {
      if (!n.read) {
        n.read = true;
        changed = true;
        updatedNotifs.push(n);
      }
    }
  }

  if (changed) {
    saveStore(store);
    await Promise.all(updatedNotifs.map((n) => syncNotificationToFirestore(n)));
  }

  return store.notifications
    .filter((n) => n.userId === verifiedUser.uid)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ==================== 3. ALLOWANCES, REFERRALS & ADMIN ANALYTICS ====================
export async function checkAndConsumeAiAllowance(verifiedUser: VerifiedFirebaseUser): Promise<{
  allowed: boolean;
  limit: number;
  usedToday: number;
  plan: PlanId;
}> {
  const { record } = await getOrNormalizeUserBilling(verifiedUser);
  const limit =
    record.role === 'admin'
      ? 500
      : record.plan === 'free'
      ? FREE_DAILY_AI_LIMIT
      : PAID_DAILY_AI_LIMIT;

  if (record.dailyAiCount >= limit) {
    return { allowed: false, limit, usedToday: record.dailyAiCount, plan: record.plan };
  }
  return { allowed: true, limit, usedToday: record.dailyAiCount, plan: record.plan };
}

export async function recordAiUsageIncrement(verifiedUser: VerifiedFirebaseUser): Promise<number> {
  const { record } = await getOrNormalizeUserBilling(verifiedUser);
  const store = loadStore();
  const target = store.users[record.uid];
  target.dailyAiCount += 1;
  target.totalAiMessages += 1;
  target.updatedAt = new Date().toISOString();
  saveStore(store);
  await syncUserToFirestore(target);
  return target.dailyAiCount;
}

export async function checkAndConsumeCbtAllowance(verifiedUser: VerifiedFirebaseUser) {
  const { record } = await getOrNormalizeUserBilling(verifiedUser);
  if (record.role !== 'admin' && record.plan === 'free' && record.dailyCbtCount >= FREE_DAILY_CBT_LIMIT) {
    return { allowed: false as const, limit: FREE_DAILY_CBT_LIMIT, usedToday: record.dailyCbtCount };
  }

  const store = loadStore();
  const target = store.users[record.uid];
  target.dailyCbtCount += 1;
  target.updatedAt = new Date().toISOString();
  saveStore(store);
  await syncUserToFirestore(target);
  const userSubs = store.subscriptions.filter((s) => s.userId === target.uid);
  const userNotifs = store.notifications.filter((n) => n.userId === target.uid);
  return { allowed: true as const, billing: toClientBillingState(target, userSubs, userNotifs) };
}

export async function applyReferralCodeToUser(verifiedUser: VerifiedFirebaseUser, code: string) {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode || cleanCode.length < 4) {
    throw new Error('Please enter a valid referral code.');
  }
  const { record } = await getOrNormalizeUserBilling(verifiedUser);
  if (cleanCode === record.referralCode) {
    throw new Error('You cannot apply your own referral code.');
  }
  if (record.referredBy) {
    throw new Error(`Referral code ${record.referredBy} is already linked to your account.`);
  }

  const store = loadStore();
  const target = store.users[record.uid];
  target.referredBy = cleanCode;
  target.updatedAt = new Date().toISOString();
  saveStore(store);
  await syncUserToFirestore(target);
  const userSubs = store.subscriptions.filter((s) => s.userId === target.uid);
  const userNotifs = store.notifications.filter((n) => n.userId === target.uid);
  return {
    billing: toClientBillingState(target, userSubs, userNotifs),
    message: `Referral code ${cleanCode} linked! Your friend receives 7 free Premium days when you subscribe.`,
  };
}

export async function getAdminBillingOverview(verifiedUser: VerifiedFirebaseUser) {
  await assertAdminAccess(verifiedUser);

  const store = loadStore();
  if (expireStaleManualTransfers(store)) {
    saveStore(store);
  }
  const today = getTodayDateKey();

  if (adminDb) {
    try {
      const snap = await adminDb.collection('users').get();
      snap.docs.forEach((d) => {
        const u = d.data() as Partial<ServerUserBillingRecord>;
        if (!store.users[d.id]) {
          store.users[d.id] = {
            uid: d.id,
            name: u.name || 'Student',
            email: u.email || '',
            role: u.role || 'student',
            plan: u.plan || 'free',
            planExpiry: u.planExpiry ?? null,
            trialUsed: Boolean(u.trialUsed),
            tier: u.tier || 'free',
            dailyAiCount: Number(u.dailyAiCount || 0),
            dailyCbtCount: Number(u.dailyCbtCount || 0),
            totalAiMessages: Number(u.totalAiMessages || 0),
            lastResetDate: u.lastResetDate || today,
            referralCode: u.referralCode || generateReferralCode(d.id),
            referredBy: u.referredBy ?? null,
            referralRewarded: Boolean(u.referralRewarded),
            referralCount: Number(u.referralCount || 0),
            referralBonusDays: Number(u.referralBonusDays || 0),
            updatedAt: u.updatedAt || new Date().toISOString(),
          };
        }
      });
    } catch {
      // ignore
    }
  }

  const usersList = Object.values(store.users).map((u) => {
    const expired = u.role !== 'admin' && u.plan !== 'free' && (!u.planExpiry || new Date(u.planExpiry).getTime() <= Date.now());
    return {
      ...u,
      plan: (expired ? 'free' : u.plan) as PlanId,
      planExpiry: expired ? null : u.planExpiry,
      dailyAiCount: u.lastResetDate === today ? u.dailyAiCount : 0,
      dailyCbtCount: u.lastResetDate === today ? u.dailyCbtCount : 0,
    };
  });

  const planBreakdown: Record<PlanId, number> = {
    free: 0,
    trial: 0,
    weekly: 0,
    premium: 0,
    season_pass: 0,
  };

  let activeSubscribers = 0;
  let aiMessagesToday = 0;
  let aiMessagesTotal = 0;
  let cbtTestsToday = 0;

  usersList.forEach((u) => {
    planBreakdown[u.plan] = (planBreakdown[u.plan] || 0) + 1;
    if (u.plan !== 'free' && u.role !== 'admin') {
      activeSubscribers += 1;
    }
    aiMessagesToday += u.dailyAiCount;
    aiMessagesTotal += Math.max(u.totalAiMessages, u.dailyAiCount);
    cbtTestsToday += u.dailyCbtCount;
  });

  const totalRevenueNaira = store.subscriptions
    .filter((s) => s.status === 'success')
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  const pendingPayments = store.subscriptions
    .filter((s) => s.channel === 'bank_transfer' && s.status === 'pending')
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    totalUsers: usersList.length,
    activeSubscribers,
    planBreakdown,
    totalRevenueNaira,
    aiMessagesToday,
    aiMessagesTotal,
    cbtTestsToday,
    pendingPaymentsCount: pendingPayments.length,
    pendingPayments,
    recentSubscriptions: store.subscriptions.slice(0, 40),
    users: usersList.map((u) => ({
      uid: u.uid,
      name: u.name,
      email: u.email,
      role: u.role,
      plan: u.plan,
      planExpiry: u.planExpiry,
      trialUsed: u.trialUsed,
      dailyAiCount: u.dailyAiCount,
      dailyCbtCount: u.dailyCbtCount,
      lastResetDate: u.lastResetDate,
      referralCode: u.referralCode,
      referralCount: u.referralCount,
      referralBonusDays: u.referralBonusDays,
    })),
  };
}

export async function adminGrantOrRevokeUserPlan(params: {
  verifiedAdmin: VerifiedFirebaseUser;
  targetUid: string;
  plan: PlanId;
  durationDays?: number;
}) {
  const { verifiedAdmin, targetUid, plan, durationDays } = params;
  await assertAdminAccess(verifiedAdmin);

  const store = loadStore();
  const today = getTodayDateKey();
  let target = store.users[targetUid];

  if (!target && adminDb) {
    const snap = await adminDb.collection('users').doc(targetUid).get().catch(() => null);
    if (snap?.exists) {
      const d = snap.data() as Partial<ServerUserBillingRecord>;
      target = {
        uid: targetUid,
        name: d.name || 'Student',
        email: d.email || '',
        role: d.role || 'student',
        plan: d.plan || 'free',
        planExpiry: d.planExpiry ?? null,
        trialUsed: Boolean(d.trialUsed),
        tier: d.tier || 'free',
        dailyAiCount: Number(d.dailyAiCount || 0),
        dailyCbtCount: Number(d.dailyCbtCount || 0),
        totalAiMessages: Number(d.totalAiMessages || 0),
        lastResetDate: d.lastResetDate || today,
        referralCode: d.referralCode || generateReferralCode(targetUid),
        referredBy: d.referredBy ?? null,
        referralRewarded: Boolean(d.referralRewarded),
        referralCount: Number(d.referralCount || 0),
        referralBonusDays: Number(d.referralBonusDays || 0),
        updatedAt: new Date().toISOString(),
      };
      store.users[targetUid] = target;
    }
  }

  if (!target) {
    throw new Error('User not found in billing ledger.');
  }

  const now = new Date().toISOString();
  const days = durationDays && durationDays > 0 ? durationDays : PLANS[plan].durationDays || 30;
  const newExpiry = plan === 'free' ? null : addDaysFrom(null, days);

  target.plan = plan;
  target.planExpiry = newExpiry;
  target.tier = plan === 'free' ? 'free' : 'premium';
  if (plan === 'trial') target.trialUsed = true;
  target.updatedAt = now;

  const sub: Subscription = {
    id: `sub-adm-${Date.now()}`,
    userId: target.uid,
    userEmail: target.email,
    userName: target.name,
    plan,
    amount: 0,
    reference: `ADMIN-${plan.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    channel: 'admin_grant',
    status: 'success',
    date: now,
    expiresAt: newExpiry,
  };

  store.subscriptions.unshift(sub);
  saveStore(store);
  await Promise.all([syncUserToFirestore(target), syncSubscriptionToFirestore(sub)]);

  const userSubs = store.subscriptions.filter((s) => s.userId === target.uid);
  const userNotifs = store.notifications.filter((n) => n.userId === target.uid);
  return {
    targetUid: target.uid,
    billing: toClientBillingState(target, userSubs, userNotifs),
    message:
      plan === 'free'
        ? `Revoked paid access for ${target.name} (set to Free).`
        : `Granted ${PLANS[plan].name} (${days} days) to ${target.name}.`,
  };
}
