export type AppView =
  | 'home'
  | 'subjects'
  | 'questions'
  | 'cbt'
  | 'ai-tutor'
  | 'news'
  | 'schools'
  | 'pricing'
  | 'profile';

export type ExamCode = 'JAMB' | 'WAEC' | 'NECO' | 'POST-UTME';

export type SubjectCategory =
  | 'Core'
  | 'Sciences'
  | 'Arts'
  | 'Commercial'
  | 'Trade/Technical'
  | 'JAMB'
  | 'JSS';

export type SubjectExamTag = 'JSS' | 'SSS' | 'JAMB' | 'WAEC' | 'NECO' | 'POST-UTME';

export type SubscriptionTier = 'free' | 'premium';

export type PlanId = 'free' | 'trial' | 'weekly' | 'premium' | 'season_pass';

export type PaymentChannel =
  | 'card'
  | 'bank_transfer'
  | 'trial'
  | 'referral'
  | 'admin_grant';

export type SubscriptionStatus = 'success' | 'failed' | 'pending' | 'rejected' | 'expired';

export interface User {
  uid: string;
  name: string;
  email: string;
  provider: 'email' | 'google';
  phone: string;
  classLevel: string;
  targetExam: ExamCode;
  targetSchool: string;
  state: string;
  role: 'student' | 'admin';
  tier: SubscriptionTier;
  plan: PlanId;
  planExpiry: string | null;
  trialUsed: boolean;
  emailVerified: boolean;
  onboarded: boolean;
  dailyAiDate?: string;
  dailyAiCount: number;
  dailyCbtCount: number;
  lastResetDate: string;
  referralCode: string;
  referredBy?: string | null;
  referralCount: number;
  referralBonusDays: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Exam {
  id: string;
  code: ExamCode;
  name: string;
  fullName: string;
  description: string;
  maxScore: number;
  defaultDurationMins: number;
}

export interface Subject {
  id: string;
  name: string;
  slug: string;
  category: SubjectCategory;
  examTypes: SubjectExamTag[];
  icon: string;
  description: string;
}

export interface Topic {
  id: string;
  subjectId: string;
  name: string;
  slug: string;
  examCode: string;
}

export interface Option {
  id: string;
  questionId: string;
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  examId: string;
  examCode: ExamCode;
  subjectId: string;
  subjectName: string;
  topicId?: string;
  year: number;
  topic: string;
  passage?: string;
  prompt: string;
  options: Option[];
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  createdAt: string;
}

export interface AttemptAnswer {
  questionId: string;
  selectedOptionId: string | null;
  isCorrect: boolean;
  flagged: boolean;
}

export interface Attempt {
  id: string;
  userId: string;
  examCode: ExamCode;
  subjectIds: string[];
  subjectNames: string[];
  questionIds: string[];
  answers: AttemptAnswer[];
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  timeLimitSeconds: number;
}

export interface SubjectScore {
  subjectId: string;
  subjectName: string;
  correct: number;
  total: number;
  percentage: number;
  jambScaled: number;
}

export interface Result {
  id: string;
  attemptId: string;
  userId: string;
  examCode: ExamCode;
  rawCorrect: number;
  totalQuestions: number;
  percentage: number;
  jambScore: number;
  subjectBreakdown: SubjectScore[];
  createdAt: string;
}

export type NewsCategory = 'JAMB' | 'WAEC' | 'admissions' | 'cut-off marks' | 'scholarships';

export interface NewsPost {
  id: string;
  slug: string;
  title: string;
  category: NewsCategory;
  summary: string;
  content: string[];
  author: string;
  publishedAt: string;
  readTimeMins: number;
  imageUrl: string;
}

export type SchoolType = 'University' | 'Polytechnic' | 'College of Education';

export interface School {
  id: string;
  name: string;
  acronym: string;
  type: SchoolType;
  ownership: 'Federal' | 'State' | 'Private';
  state: string;
  city: string;
  utmeCutOff: number;
  tuitionRange: string;
  courses: string[];
  website: string;
  email: string;
  phone: string;
}

export interface Scholarship {
  id: string;
  title: string;
  sponsor: string;
  amount: string;
  deadline: string;
  eligibility: string;
  level: string;
  link: string;
  status: 'Open' | 'Closing Soon';
}

export interface Subscription {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  plan: PlanId;
  amount: number;
  reference: string;
  channel: PaymentChannel;
  status: SubscriptionStatus;
  date: string;
  expiresAt: string | null;
  receiptUrl?: string | null;
  receiptPath?: string | null;
  transferExpiresAt?: string | null;
  submittedAt?: string | null;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface UserNotification {
  id: string;
  userId: string;
  type: 'payment_approved' | 'payment_rejected';
  title: string;
  message: string;
  reference: string;
  plan: PlanId;
  reason?: string | null;
  read: boolean;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  subjectId?: string;
  subjectName: string;
  examLevel: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ExamMasterDatabase {
  users: User[];
  currentUserId: string | null;
  exams: Exam[];
  subjects: Subject[];
  topics: Topic[];
  questions: Question[];
  attempts: Attempt[];
  results: Result[];
  news_posts: NewsPost[];
  schools: School[];
  scholarships: Scholarship[];
  subscriptions: Subscription[];
  bookmarkedQuestionIds: string[];
  cachedSubjectIds: string[];
  lastSyncedAt: string;
}
