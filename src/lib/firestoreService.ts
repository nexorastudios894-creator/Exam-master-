import type { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ALL_NIGERIAN_SUBJECTS } from '../../server/seedSubjects';
import {
  SEED_EXAMS,
  SEED_NEWS_POSTS,
  SEED_QUESTIONS,
  SEED_SCHOLARSHIPS,
  SEED_SCHOOLS,
  SEED_TOPICS,
} from '../data/seedData';
import {
  Attempt,
  ChatMessage,
  ChatSession,
  Exam,
  ExamCode,
  NewsPost,
  Question,
  Result,
  Scholarship,
  School,
  Subject,
  Subscription,
  Topic,
  User,
} from '../types/database';
import { db, handleFirestoreError, OperationType } from './firebase';
import { FREE_DAILY_AI_LIMIT, getTodayDateKey } from './plans';

const BOOTSTRAP_ADMIN_EMAIL = 'nexorastudios894@gmail.com';
export { FREE_DAILY_AI_LIMIT };

export function getTodayKey(): string {
  return getTodayDateKey();
}

export function generateReferralCode(uid: string): string {
  const cleaned = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `EMN-${cleaned.slice(0, 6).padEnd(6, 'X')}`;
}

export interface CatalogSnapshot {
  exams: Exam[];
  subjects: Subject[];
  topics: Topic[];
  questions: Question[];
  newsPosts: NewsPost[];
  schools: School[];
  scholarships: Scholarship[];
  fromFirestore: boolean;
}

export async function fetchPublicCatalog(): Promise<CatalogSnapshot> {
  try {
    const [examsSnap, subjectsSnap, topicsSnap, questionsSnap, newsSnap, schoolsSnap, scholarshipsSnap] =
      await Promise.all([
        getDocs(collection(db, 'exams')),
        getDocs(collection(db, 'subjects')),
        getDocs(collection(db, 'topics')),
        getDocs(collection(db, 'questions')),
        getDocs(collection(db, 'newsPosts')),
        getDocs(collection(db, 'schools')),
        getDocs(collection(db, 'scholarships')),
      ]);

    const exams = examsSnap.docs.map((d) => d.data() as Exam);
    const subjects = subjectsSnap.docs.map((d) => d.data() as Subject);
    const topics = topicsSnap.docs.map((d) => d.data() as Topic);
    const questions = questionsSnap.docs.map((d) => d.data() as Question);
    const newsPosts = newsSnap.docs
      .map((d) => d.data() as NewsPost)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const schools = schoolsSnap.docs.map((d) => d.data() as School);
    const scholarships = scholarshipsSnap.docs.map((d) => d.data() as Scholarship);

    const hasSeededData = subjects.length > 0 && questions.length > 0;
    return {
      exams: exams.length > 0 ? exams : SEED_EXAMS,
      subjects: subjects.length > 0 ? subjects : (ALL_NIGERIAN_SUBJECTS as Subject[]),
      topics: topics.length > 0 ? topics : SEED_TOPICS,
      questions: questions.length > 0 ? questions : SEED_QUESTIONS,
      newsPosts: newsPosts.length > 0 ? newsPosts : SEED_NEWS_POSTS,
      schools: schools.length > 0 ? schools : SEED_SCHOOLS,
      scholarships: scholarships.length > 0 ? scholarships : SEED_SCHOLARSHIPS,
      fromFirestore: hasSeededData,
    };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.LIST, 'subjects');
    }
    return {
      exams: SEED_EXAMS,
      subjects: ALL_NIGERIAN_SUBJECTS as Subject[],
      topics: SEED_TOPICS,
      questions: SEED_QUESTIONS,
      newsPosts: SEED_NEWS_POSTS,
      schools: SEED_SCHOOLS,
      scholarships: SEED_SCHOLARSHIPS,
      fromFirestore: false,
    };
  }
}

async function clearCollection(collectionName: string) {
  const snap = await getDocs(collection(db, collectionName));
  if (snap.empty) return;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function batchSeedCollection<T extends { id: string }>(collectionName: string, items: T[]) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    items.slice(i, i + 400).forEach((item) => {
      batch.set(doc(db, collectionName, item.id), item);
    });
    await batch.commit();
  }
}

export async function resetAndSeedFirestore(adminUid?: string): Promise<void> {
  const publicCollections = [
    'subjects',
    'exams',
    'topics',
    'questions',
    'newsPosts',
    'schools',
    'scholarships',
  ];

  try {
    for (const col of publicCollections) {
      await clearCollection(col);
    }

    if (adminUid) {
      const userCols = ['attempts', 'results', 'chats', 'messages'];
      for (const col of userCols) {
        const snap = await getDocs(query(collection(db, col), where('userId', '==', adminUid)));
        if (!snap.empty) {
          const batch = writeBatch(db);
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
    }

    await batchSeedCollection('exams', SEED_EXAMS);
    await batchSeedCollection('subjects', ALL_NIGERIAN_SUBJECTS as Subject[]);
    await batchSeedCollection('topics', SEED_TOPICS);
    await batchSeedCollection('questions', SEED_QUESTIONS);
    await batchSeedCollection('newsPosts', SEED_NEWS_POSTS);
    await batchSeedCollection('schools', SEED_SCHOOLS);
    await batchSeedCollection('scholarships', SEED_SCHOLARSHIPS);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'subjects');
  }
}

export async function checkIsAdmin(firebaseUser: FirebaseUser): Promise<boolean> {
  if (
    firebaseUser.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL &&
    firebaseUser.emailVerified
  ) {
    return true;
  }
  try {
    const adminDoc = await getDoc(doc(db, 'admins', firebaseUser.uid));
    return adminDoc.exists();
  } catch {
    return false;
  }
}

export interface SignupMetadata {
  name: string;
  phone?: string;
  classLevel?: string;
  targetExam?: ExamCode;
  state?: string;
  provider?: 'email' | 'google';
  referredBy?: string | null;
}

export async function loadOrCreateUserProfile(
  firebaseUser: FirebaseUser,
  signupMeta?: SignupMetadata
): Promise<User> {
  const path = `users/${firebaseUser.uid}`;
  try {
    const ref = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(ref);
    const isAdminUser = await checkIsAdmin(firebaseUser);
    const today = getTodayKey();

    if (snap.exists()) {
      const existing = snap.data() as Partial<User>;
      const normalized: User = {
        uid: existing.uid || firebaseUser.uid,
        name: existing.name || firebaseUser.displayName || 'Nigerian Candidate',
        email: existing.email || firebaseUser.email || '',
        provider: existing.provider || 'email',
        phone: existing.phone || '',
        classLevel: existing.classLevel || 'UTME Candidate',
        targetExam: existing.targetExam || 'JAMB',
        targetSchool: existing.targetSchool || 'University of Lagos (UNILAG)',
        state: existing.state || 'Lagos',
        role: isAdminUser ? 'admin' : existing.role || 'student',
        tier: isAdminUser ? 'premium' : existing.tier || 'free',
        plan: isAdminUser ? 'season_pass' : existing.plan || 'free',
        planExpiry: existing.planExpiry ?? null,
        trialUsed: existing.trialUsed ?? false,
        emailVerified: firebaseUser.emailVerified,
        onboarded: existing.onboarded ?? false,
        dailyAiDate: existing.dailyAiDate || existing.lastResetDate || today,
        dailyAiCount: existing.dailyAiCount ?? 0,
        dailyCbtCount: existing.dailyCbtCount ?? 0,
        lastResetDate: existing.lastResetDate || existing.dailyAiDate || today,
        referralCode: existing.referralCode || generateReferralCode(firebaseUser.uid),
        referredBy: existing.referredBy ?? null,
        referralCount: existing.referralCount ?? 0,
        referralBonusDays: existing.referralBonusDays ?? 0,
        createdAt: existing.createdAt || new Date().toISOString(),
        updatedAt: existing.updatedAt,
      };

      const needsSync =
        existing.emailVerified !== firebaseUser.emailVerified ||
        (isAdminUser && existing.role !== 'admin');
      if (needsSync) {
        const patch: Partial<User> = {
          emailVerified: firebaseUser.emailVerified,
          updatedAt: new Date().toISOString(),
        };
        if (isAdminUser) {
          patch.role = 'admin';
          patch.tier = 'premium';
          patch.plan = 'season_pass';
        }
        await updateDoc(ref, patch);
        return { ...normalized, ...patch };
      }
      return normalized;
    }

    const now = new Date().toISOString();
    const providerId = firebaseUser.providerData?.[0]?.providerId;
    const provider: 'email' | 'google' =
      signupMeta?.provider || (providerId === 'google.com' ? 'google' : 'email');

    const newProfile: User = {
      uid: firebaseUser.uid,
      name: (signupMeta?.name || firebaseUser.displayName || 'Nigerian Candidate').trim().slice(0, 120),
      email: (firebaseUser.email || '').trim().slice(0, 160),
      provider,
      phone: (signupMeta?.phone || '').trim().slice(0, 40),
      classLevel: signupMeta?.classLevel || 'UTME Candidate',
      targetExam: signupMeta?.targetExam || 'JAMB',
      targetSchool: 'University of Lagos (UNILAG)',
      state: signupMeta?.state || 'Lagos',
      role: isAdminUser ? 'admin' : 'student',
      tier: isAdminUser ? 'premium' : 'free',
      plan: isAdminUser ? 'season_pass' : 'free',
      planExpiry: null,
      trialUsed: false,
      emailVerified: firebaseUser.emailVerified,
      onboarded: false,
      dailyAiDate: today,
      dailyAiCount: 0,
      dailyCbtCount: 0,
      lastResetDate: today,
      referralCode: generateReferralCode(firebaseUser.uid),
      referredBy: signupMeta?.referredBy || null,
      referralCount: 0,
      referralBonusDays: 0,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(ref, newProfile);
    return newProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserProfile(uid: string, patch: Partial<User>): Promise<User> {
  const path = `users/${uid}`;
  try {
    const ref = doc(db, 'users', uid);
    const safePatch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    const allowedKeys: Array<keyof User> = [
      'name',
      'phone',
      'classLevel',
      'targetExam',
      'targetSchool',
      'state',
      'emailVerified',
      'onboarded',
    ];
    for (const key of allowedKeys) {
      if (patch[key] !== undefined) {
        safePatch[key] = patch[key];
      }
    }
    await updateDoc(ref, safePatch);
    const snap = await getDoc(ref);
    return snap.data() as User;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchUserActivity(
  uid: string
): Promise<{ attempts: Attempt[]; results: Result[]; subscriptions: Subscription[] }> {
  try {
    const [attSnap, resSnap, subSnap] = await Promise.all([
      getDocs(query(collection(db, 'attempts'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'results'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'subscriptions'), where('userId', '==', uid))),
    ]);
    const attempts = attSnap.docs
      .map((d) => d.data() as Attempt)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    const results = resSnap.docs
      .map((d) => d.data() as Result)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const subscriptions = subSnap.docs
      .map((d) => d.data() as Subscription)
      .sort((a, b) => b.date.localeCompare(a.date));
    return { attempts, results, subscriptions };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'attempts');
  }
}

export async function fetchAllUsersForAdmin(): Promise<User[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((d) => d.data() as User);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

export async function saveAttemptAndResult(uid: string, attempt: Attempt, result: Result): Promise<void> {
  try {
    const scopedAttempt: Attempt = { ...attempt, userId: uid };
    const scopedResult: Result = { ...result, userId: uid };
    await Promise.all([
      setDoc(doc(db, 'attempts', scopedAttempt.id), scopedAttempt),
      setDoc(doc(db, 'results', scopedResult.id), scopedResult),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `attempts/${attempt.id}`);
  }
}

export async function getUserChatSessions(uid: string): Promise<ChatSession[]> {
  try {
    const snap = await getDocs(query(collection(db, 'chats'), where('userId', '==', uid)));
    return snap.docs
      .map((d) => d.data() as ChatSession)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'chats');
  }
}

export async function getChatMessages(uid: string, sessionId: string): Promise<ChatMessage[]> {
  try {
    const snap = await getDocs(query(collection(db, 'messages'), where('userId', '==', uid)));
    return snap.docs
      .map((d) => d.data() as ChatMessage)
      .filter((m) => m && m.sessionId === sessionId && m.role)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'messages');
  }
}

export async function createChatSession(session: ChatSession): Promise<void> {
  try {
    await setDoc(doc(db, 'chats', session.id), session);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${session.id}`);
  }
}

export async function updateChatSession(
  sessionId: string,
  patch: Partial<Pick<ChatSession, 'title' | 'subjectId' | 'subjectName' | 'examLevel' | 'updatedAt'>>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', sessionId), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${sessionId}`);
  }
}

export async function saveChatMessage(msg: ChatMessage): Promise<void> {
  try {
    await setDoc(doc(db, 'messages', msg.id), msg);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `messages/${msg.id}`);
  }
}

export async function deleteChatSessionAndMessages(uid: string, sessionId: string): Promise<void> {
  try {
    const msgSnap = await getDocs(query(collection(db, 'messages'), where('userId', '==', uid)));
    const batch = writeBatch(db);
    msgSnap.docs.forEach((d) => {
      if ((d.data() as ChatMessage).sessionId === sessionId) {
        batch.delete(d.ref);
      }
    });
    batch.delete(doc(db, 'chats', sessionId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${sessionId}`);
  }
}

// Admin Write Operations (Create & Update)
export async function upsertQuestion(q: Question): Promise<void> {
  try {
    await setDoc(doc(db, 'questions', q.id), q);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `questions/${q.id}`);
  }
}

export async function deleteQuestion(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'questions', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `questions/${id}`);
  }
}

export async function upsertSubject(s: Subject): Promise<void> {
  try {
    await setDoc(doc(db, 'subjects', s.id), s);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `subjects/${s.id}`);
  }
}

export async function upsertNewsPost(p: NewsPost): Promise<void> {
  try {
    await setDoc(doc(db, 'newsPosts', p.id), p);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `newsPosts/${p.id}`);
  }
}

export async function upsertSchool(s: School): Promise<void> {
  try {
    await setDoc(doc(db, 'schools', s.id), s);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `schools/${s.id}`);
  }
}
