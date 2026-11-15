import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  adminGrantOrRevokeUserPlan,
  applyReferralCodeToUser,
  checkAndConsumeAiAllowance,
  checkAndConsumeCbtAllowance,
  getAdminBillingOverview,
  getAdminPendingPayments,
  getOrNormalizeUserBilling,
  handlePaystackWebhookEvent,
  initializeManualBankTransfer,
  initializePaystackTx,
  markUserNotificationRead,
  recordAiUsageIncrement,
  reviewPendingBankTransfer,
  startThreeDayTrial,
  submitManualBankTransferProof,
  toClientBillingState,
  verifyPaystackTransaction,
  type VerifiedFirebaseUser,
} from './server/billingService';
import type { PlanId } from './src/types/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8')) as {
  apiKey: string;
  projectId: string;
  firestoreDatabaseId?: string;
};

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('Warning: GEMINI_API_KEY is not set. Exam Master AI Tutor will require it at runtime.');
}

const ai = new GoogleGenAI({
  apiKey: apiKey || 'missing-key',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (!idToken || !firebaseConfig.apiKey) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{
        localId: string;
        email?: string;
        displayName?: string;
        emailVerified?: boolean;
      }>;
    };
    const u = data.users?.[0];
    if (!u || !u.localId) return null;
    return {
      uid: u.localId,
      email: u.email || '',
      displayName: u.displayName || 'Student',
      emailVerified: Boolean(u.emailVerified),
    };
  } catch {
    return null;
  }
}

async function authenticateRequest(req: express.Request): Promise<VerifiedFirebaseUser | null> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  return verifyFirebaseIdToken(token);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ==================== SUBSCRIPTIONS, QUOTAS & REFERRALS ====================
  app.get('/api/billing/me', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Please sign in to access your subscription.' });
    }
    try {
      const pendingRef = typeof req.query.ref === 'string' ? req.query.ref : undefined;
      const { record, subscriptions, notifications } = await getOrNormalizeUserBilling(verifiedUser, pendingRef);
      return res.json(toClientBillingState(record, subscriptions, notifications));
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to load subscription.' });
    }
  });

  app.post('/api/billing/start-trial', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Please sign in to start your 3-day free trial.' });
    }
    try {
      const result = await startThreeDayTrial(verifiedUser);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to start trial.' });
    }
  });

  // Live Paystack Card Payment Only
  app.post('/api/billing/paystack/initialize', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Please sign in before checking out.' });
    }
    const { plan, channel = 'card', referralCode } = req.body || {};
    if (!['weekly', 'premium', 'season_pass'].includes(String(plan))) {
      return res.status(400).json({ error: 'Please choose Weekly, Premium, or Exam Season Pass.' });
    }
    if (channel !== 'card') {
      return res.status(400).json({ error: 'Paystack checkout accepts live card payments only. Use Manual Bank Transfer for bank transfers.' });
    }

    try {
      const initResult = await initializePaystackTx({
        verifiedUser,
        plan: plan as Exclude<PlanId, 'free' | 'trial'>,
        referralCode: typeof referralCode === 'string' ? referralCode : undefined,
      });
      return res.json(initResult);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Paystack live card initialization failed.',
      });
    }
  });

  app.post('/api/billing/paystack/verify', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Please sign in to verify your payment.' });
    }
    const { reference } = req.body || {};
    if (!reference || typeof reference !== 'string') {
      return res.status(400).json({ error: 'Payment reference is required.' });
    }

    try {
      const verification = await verifyPaystackTransaction({
        verifiedUser,
        reference,
      });
      return res.json(verification);
    } catch (err) {
      return res.status(402).json({
        error: err instanceof Error ? err.message : 'Live payment verification failed.',
        code: 'PAYMENT_VERIFICATION_FAILED',
      });
    }
  });

  app.post('/api/billing/paystack/webhook', async (req, res) => {
    const signature = req.headers['x-paystack-signature'];
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      return res.status(400).json({ error: 'Missing raw webhook payload.' });
    }
    try {
      await handlePaystackWebhookEvent(
        rawBody,
        typeof signature === 'string' ? signature : undefined
      );
      return res.status(200).json({ received: true });
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Invalid Paystack webhook.',
      });
    }
  });

  // Manual Bank Transfer (Opay)
  app.post('/api/billing/bank-transfer/initialize', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Please sign in before generating a bank transfer reference.' });
    }
    const { plan, referralCode } = req.body || {};
    if (!['weekly', 'premium', 'season_pass'].includes(String(plan))) {
      return res.status(400).json({ error: 'Please choose Weekly, Premium, or Exam Season Pass.' });
    }

    try {
      const intent = await initializeManualBankTransfer({
        verifiedUser,
        plan: plan as Exclude<PlanId, 'free' | 'trial'>,
        referralCode: typeof referralCode === 'string' ? referralCode : undefined,
      });
      return res.json(intent);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to generate bank transfer details.',
      });
    }
  });

  app.post('/api/billing/bank-transfer/submit', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Please sign in to submit your transfer receipt.' });
    }
    const { reference, receiptUrl, receiptPath } = req.body || {};
    if (!reference || !receiptUrl || !receiptPath) {
      return res.status(400).json({ error: 'Transfer reference and uploaded receipt screenshot are required.' });
    }

    try {
      const result = await submitManualBankTransferProof({
        verifiedUser,
        reference: String(reference),
        receiptUrl: String(receiptUrl),
        receiptPath: String(receiptPath),
      });
      return res.json(result);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to submit transfer receipt.',
      });
    }
  });

  app.post('/api/billing/notifications/read', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Please sign in to manage notifications.' });
    }
    const { notificationId = 'all' } = req.body || {};
    try {
      const notifications = await markUserNotificationRead(verifiedUser, String(notificationId));
      return res.json({ notifications });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update notification.' });
    }
  });

  app.post('/api/billing/cbt/consume', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Please sign in to start a timed CBT session.' });
    }
    try {
      const check = await checkAndConsumeCbtAllowance(verifiedUser);
      if (!check.allowed) {
        return res.status(429).json({
          error: `You have reached today's Free plan limit (${check.limit} CBT test per day). Upgrade to Premium or start your 3-day free trial for unlimited CBT tests.`,
          code: 'CBT_LIMIT_REACHED',
          limit: check.limit,
          usedToday: check.usedToday,
        });
      }
      return res.json({ billing: check.billing });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to start CBT.' });
    }
  });

  app.post('/api/billing/referral/apply', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Please sign in to apply a referral code.' });
    }
    const { referralCode } = req.body || {};
    try {
      const result = await applyReferralCodeToUser(verifiedUser, String(referralCode || ''));
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid referral code.' });
    }
  });

  app.get('/api/admin/billing-overview', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    try {
      const overview = await getAdminBillingOverview(verifiedUser);
      return res.json(overview);
    } catch (err) {
      return res.status(403).json({ error: err instanceof Error ? err.message : 'Admin access denied.' });
    }
  });

  app.get('/api/admin/pending-payments', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    try {
      const data = await getAdminPendingPayments(verifiedUser);
      return res.json(data);
    } catch (err) {
      return res.status(403).json({ error: err instanceof Error ? err.message : 'Admin access denied.' });
    }
  });

  app.post('/api/admin/pending-payments/review', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const { subscriptionId, action, rejectionReason } = req.body || {};
    if (!subscriptionId || (action !== 'approve' && action !== 'reject')) {
      return res.status(400).json({ error: 'Valid subscriptionId and action ("approve" or "reject") are required.' });
    }
    try {
      const result = await reviewPendingBankTransfer({
        verifiedAdmin: verifiedUser,
        subscriptionId: String(subscriptionId),
        action,
        rejectionReason: typeof rejectionReason === 'string' ? rejectionReason : undefined,
      });
      return res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to review payment.';
      return res.status(msg.includes('Admin privileges') ? 403 : 400).json({ error: msg });
    }
  });

  app.post('/api/admin/grant-plan', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const { targetUid, plan, durationDays } = req.body || {};
    if (!targetUid || !['free', 'trial', 'weekly', 'premium', 'season_pass'].includes(String(plan))) {
      return res.status(400).json({ error: 'Valid targetUid and plan are required.' });
    }
    try {
      const result = await adminGrantOrRevokeUserPlan({
        verifiedAdmin: verifiedUser,
        targetUid: String(targetUid),
        plan: plan as PlanId,
        durationDays: typeof durationDays === 'number' ? durationDays : undefined,
      });
      return res.json(result);
    } catch (err) {
      return res.status(403).json({ error: err instanceof Error ? err.message : 'Unable to update plan.' });
    }
  });

  // ==================== EXAM MASTER AI STREAMING ENDPOINT ====================
  app.post('/api/ai/stream', async (req, res) => {
    const verifiedUser = await authenticateRequest(req);
    if (!verifiedUser) {
      return res.status(401).json({ error: 'Please sign in with Firebase to use Exam Master AI.' });
    }

    const {
      message,
      history = [],
      subjectName = 'General Nigerian Studies',
      examLevel = 'JAMB',
      classLevel = 'UTME Candidate',
      studentName,
    } = req.body || {};

    const cleanMsg = String(message || '').trim();
    if (!cleanMsg) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    const quota = await checkAndConsumeAiAllowance(verifiedUser);
    if (!quota.allowed) {
      return res.status(429).json({
        error:
          quota.plan === 'free'
            ? `Daily AI Tutor limit reached (${quota.limit}/${quota.limit} free messages today). Upgrade to Weekly, Premium, or Exam Season Pass for 50 messages/day.`
            : `Daily AI Tutor limit reached (${quota.limit}/${quota.limit} messages today). Your allowance resets automatically tomorrow.`,
        code: 'DAILY_LIMIT_REACHED',
        usedToday: quota.usedToday,
        dailyLimit: quota.limit,
      });
    }

    const systemInstruction = `You are "Exam Master AI", an encouraging, knowledgeable Nigerian academic tutor aligned with the NERDC, JSS, SSS, WAEC WASSCE, NECO SSCE, JAMB UTME, and Post-UTME curricula.

Current context:
- Student Name: ${String(studentName || verifiedUser.displayName || 'Student')}
- Class Level: ${String(classLevel)}
- Selected Subject: ${String(subjectName)}
- Target Exam Level: ${String(examLevel)}

Guidelines:
1. Explain concepts in friendly, simple, clear classroom English.
2. When solving Mathematics, Physics, Chemistry, or Financial Accounting problems, always show clear step-by-step workings and state the final answer clearly.
3. When explaining past questions, explain both why the right option is correct and why common distractors are wrong.
4. When asked to create practice questions, generate Nigerian exam-style multiple-choice questions (Options A–D) with answers and brief explanations at the end.
5. **Strict Academic Guardrail**: If the student asks about non-school or non-academic topics (e.g., celebrity gossip, dating/romance, sports betting, gaming cheats, hacking, personal errands, or off-topic chat), politely decline and invite them to ask a school, subject, or exam-preparation question instead.
6. Keep responses well-structured with short paragraphs, bullet points, or numbered steps so they read effortlessly on Android phones.`;

    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (h): h is { role: string; content: string } =>
              Boolean(h && typeof h.content === 'string' && h.content.trim())
          )
          .slice(-12)
      : [];

    const contents = [
      ...safeHistory.map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
      { role: 'user', parts: [{ text: cleanMsg }] },
    ];

    const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
    let streamResult: Awaited<ReturnType<typeof ai.models.generateContentStream>> | null = null;
    let lastError: unknown = null;

    for (const modelName of modelsToTry) {
      try {
        streamResult = await ai.models.generateContentStream({
          model: modelName,
          contents,
          config: { systemInstruction },
        });
        break;
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 350));
      }
    }

    if (!streamResult) {
      console.error('Exam Master AI stream init failed:', lastError);
      return res.status(502).json({
        error: 'Exam Master AI is temporarily busy. Please try sending your question again in a moment.',
      });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let fullText = '';
    try {
      for await (const chunk of streamResult) {
        const piece = chunk.text || '';
        if (piece) {
          fullText += piece;
          res.write(`data: ${JSON.stringify({ chunk: piece })}\n\n`);
        }
      }

      if (!fullText.trim()) {
        const fallback = 'I could not generate an explanation right now. Please try rephrasing your school question.';
        fullText = fallback;
        res.write(`data: ${JSON.stringify({ chunk: fallback })}\n\n`);
      }

      const nextCount = await recordAiUsageIncrement(verifiedUser);

      res.write(
        `data: ${JSON.stringify({
          done: true,
          usedToday: nextCount,
          dailyLimit: quota.limit,
        })}\n\n`
      );
      res.end();
    } catch (streamErr) {
      console.error('Exam Master AI stream error:', streamErr);
      res.write(
        `data: ${JSON.stringify({
          error: 'Streaming interrupted. Please try asking again.',
        })}\n\n`
      );
      res.end();
    }
  });

  // ==================== VITE DEV / STATIC SERVE ====================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Exam Master Nigeria running on http://localhost:${PORT}`);
  });
}

void startServer();
