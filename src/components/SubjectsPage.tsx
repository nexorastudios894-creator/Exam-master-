import React, { useMemo, useState } from 'react';
import {
  Activity,
  Atom,
  BookHeart,
  BookMarked,
  BookOpen,
  BookOpenCheck,
  Bot,
  Briefcase,
  Building2,
  Calculator,
  ChefHat,
  CircuitBoard,
  Cog,
  Compass,
  Cpu,
  Database,
  Dna,
  Feather,
  FileSpreadsheet,
  Fish,
  FlaskConical,
  FolderKanban,
  Globe,
  Hammer,
  Handshake,
  HardHat,
  HeartPulse,
  Home,
  Landmark,
  Languages,
  Megaphone,
  MessageSquareQuote,
  Microscope,
  Moon,
  Music,
  Package,
  Palette,
  PawPrint,
  Receipt,
  Ruler,
  Scale,
  Scissors,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  Sparkles,
  Sprout,
  TrendingUp,
  Users,
  Utensils,
  Wrench,
  Zap,
} from 'lucide-react';
import type { ExamCode, Subject, SubjectCategory, SubjectExamTag } from '../types/database';

interface SubjectsPageProps {
  subjects: Subject[];
  questionCountsBySubject: Record<string, number>;
  onBrowseSubject: (subjectId: string) => void;
  onStartCBT: (subjectId: string) => void;
  onAskAITutor: (subject: Subject) => void;
}

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Activity,
  Atom,
  BookHeart,
  BookMarked,
  BookOpen,
  BookOpenCheck,
  Briefcase,
  Building2,
  Calculator,
  ChefHat,
  CircuitBoard,
  Cog,
  Compass,
  Cpu,
  Database,
  Dna,
  Feather,
  FileSpreadsheet,
  Fish,
  FlaskConical,
  FolderKanban,
  Globe,
  Hammer,
  Handshake,
  HardHat,
  HeartPulse,
  Home,
  Landmark,
  Languages,
  Megaphone,
  MessageSquareQuote,
  Microscope,
  Moon,
  Music,
  Package,
  Palette,
  PawPrint,
  Receipt,
  Ruler,
  Scale,
  Scissors,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  Sparkles,
  Sprout,
  TrendingUp,
  Users,
  Utensils,
  Wrench,
  Zap,
};

const CATEGORIES: Array<'ALL' | SubjectCategory> = [
  'ALL',
  'Core',
  'Sciences',
  'Arts',
  'Commercial',
  'Trade/Technical',
  'JAMB',
  'JSS',
];

const EXAM_TAGS: Array<'ALL' | SubjectExamTag> = ['ALL', 'JAMB', 'WAEC', 'NECO', 'SSS', 'JSS'];

export const SubjectsPage: React.FC<SubjectsPageProps> = ({
  subjects,
  questionCountsBySubject,
  onBrowseSubject,
  onStartCBT,
  onAskAITutor,
}) => {
  const [selectedExam, setSelectedExam] = useState<'ALL' | SubjectExamTag>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | SubjectCategory>('ALL');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return subjects.filter((sub) => {
      if (selectedExam !== 'ALL' && !sub.examTypes.includes(selectedExam)) return false;
      if (selectedCategory !== 'ALL') {
        if (selectedCategory === 'JSS') {
          if (sub.category !== 'JSS' && !sub.examTypes.includes('JSS')) return false;
        } else if (selectedCategory === 'JAMB') {
          if (sub.category !== 'JAMB' && !sub.examTypes.includes('JAMB')) return false;
        } else if (sub.category !== selectedCategory) {
          return false;
        }
      }
      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        if (!`${sub.name} ${sub.category} ${sub.description}`.toLowerCase().includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [subjects, selectedExam, selectedCategory, search]);

  return (
    <div className="space-y-6 pb-10">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Nigerian Curriculum Subjects
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Explore all {subjects.length} subjects across JSS, SSS, JAMB UTME, WAEC, and NECO syllabi.
          </p>
        </div>

        <div className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
          Showing {filtered.length} of {subjects.length} subjects
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {EXAM_TAGS.map((exam) => (
              <button
                key={exam}
                type="button"
                onClick={() => setSelectedExam(exam)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  selectedExam === exam
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                {exam === 'ALL' ? 'All Exams' : exam}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Biology, Yoruba, Accounting..."
              className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        </div>

        {/* Category Filter Row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`min-h-[36px] rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
              }`}
            >
              {cat === 'ALL' ? 'All Categories' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Subject Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            No subjects match your filters
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedExam('ALL');
              setSelectedCategory('ALL');
              setSearch('');
            }}
            className="mt-3 min-h-[40px] rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((sub) => {
            const IconComponent = ICON_MAP[sub.icon] || BookOpen;
            const qCount = questionCountsBySubject[sub.id] || 0;
            const effectiveQId = sub.id === 'sub-use-of-english' ? 'sub-english' : sub.id;

            return (
              <div
                key={sub.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-700"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400">
                        <IconComponent className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">
                          {sub.name}
                        </h2>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {sub.category} · {sub.examTypes.join(' / ')}
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {sub.description}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onBrowseSubject(effectiveQId)}
                      className="min-h-[36px] rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      Questions {qCount > 0 ? `(${qCount})` : ''}
                    </button>
                    {qCount > 0 && (
                      <button
                        type="button"
                        onClick={() => onStartCBT(effectiveQId)}
                        className="min-h-[36px] rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                      >
                        CBT
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onAskAITutor(sub)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-200 whitespace-nowrap"
                  >
                    <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                    Ask AI
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
