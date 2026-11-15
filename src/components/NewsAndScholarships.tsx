import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calendar, ExternalLink, Search } from 'lucide-react';
import type { ExamMasterDatabase, NewsCategory, NewsPost } from '../types/database';

interface NewsAndScholarshipsProps {
  db: ExamMasterDatabase;
  selectedPost: NewsPost | null;
  onSelectPost: (post: NewsPost | null) => void;
}

const CATEGORIES: Array<'ALL' | NewsCategory> = [
  'ALL',
  'JAMB',
  'WAEC',
  'admissions',
  'cut-off marks',
  'scholarships',
];

export const NewsAndScholarships: React.FC<NewsAndScholarshipsProps> = ({
  db,
  selectedPost,
  onSelectPost,
}) => {
  const [tab, setTab] = useState<'news' | 'scholarships'>('news');
  const [category, setCategory] = useState<'ALL' | NewsCategory>('ALL');
  const [search, setSearch] = useState('');

  // SEO-friendly dynamic document title when reading an article
  useEffect(() => {
    if (selectedPost) {
      document.title = `${selectedPost.title} — Exam Master Nigeria`;
    } else {
      document.title = 'Exam Master Nigeria — JAMB, WAEC, NECO Past Questions & CBT Practice';
    }
    return () => {
      document.title = 'Exam Master Nigeria — JAMB, WAEC, NECO Past Questions & CBT Practice';
    };
  }, [selectedPost]);

  const filteredPosts = useMemo(() => {
    return db.news_posts.filter((post) => {
      if (category !== 'ALL' && post.category !== category) return false;
      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        if (!`${post.title} ${post.summary} ${post.category}`.toLowerCase().includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [db.news_posts, category, search]);

  const filteredScholarships = useMemo(() => {
    return db.scholarships.filter((s) => {
      if (!search.trim()) return true;
      const needle = search.trim().toLowerCase();
      return `${s.title} ${s.sponsor} ${s.eligibility}`.toLowerCase().includes(needle);
    });
  }, [db.scholarships, search]);

  // Article Reader View
  if (selectedPost) {
    return (
      <article className="mx-auto max-w-3xl space-y-6 pb-12">
        <button
          type="button"
          onClick={() => onSelectPost(null)}
          className="inline-flex min-h-[40px] items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to School News
        </button>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {selectedPost.category}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {new Date(selectedPost.publishedAt).toLocaleDateString('en-NG', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <span aria-hidden="true">·</span>
            <span>By {selectedPost.author}</span>
            <span aria-hidden="true">·</span>
            <span>{selectedPost.readTimeMins} min read</span>
          </div>

          <h1 className="text-balance text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
            {selectedPost.title}
          </h1>

          <p className="text-base sm:text-lg leading-relaxed text-slate-600 dark:text-slate-300">
            {selectedPost.summary}
          </p>
        </header>

        <div className="aspect-[16/9] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
          <img
            src={selectedPost.imageUrl}
            alt={selectedPost.title}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        </div>

        <div className="space-y-5 text-base leading-relaxed text-slate-800 dark:text-slate-200 max-w-[68ch]">
          {selectedPost.content.map((para, idx) => (
            <p key={idx}>{para}</p>
          ))}
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            School News &amp; Scholarships
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Official JAMB, WAEC, Post-UTME admission updates, cut-off marks, and active scholarships.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 self-start dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab('news')}
            className={`min-h-[38px] rounded-lg px-4 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
              tab === 'news'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Admission News ({db.news_posts.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('scholarships')}
            className={`min-h-[38px] rounded-lg px-4 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
              tab === 'scholarships'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Scholarships ({db.scholarships.length})
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        {tab === 'news' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`min-h-[36px] rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                  category === cat
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {cat === 'ALL' ? 'All Updates' : cat}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Showing verified undergraduate &amp; school-leaver scholarship awards in Nigeria
          </div>
        )}

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'news' ? 'Search news...' : 'Search scholarships...'}
            className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Tab Content */}
      {tab === 'news' ? (
        filteredPosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            No news posts match your filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredPosts.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => onSelectPost(post)}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition-colors hover:border-emerald-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-600"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-semibold capitalize text-emerald-700 dark:text-emerald-400">
                      {post.category}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {new Date(post.publishedAt).toLocaleDateString('en-NG', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{post.readTimeMins} min</span>
                  </div>

                  <h2 className="mt-2 text-base font-bold text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                    {post.title}
                  </h2>

                  <p className="mt-2 flex-1 text-sm text-slate-600 dark:text-slate-300 line-clamp-3">
                    {post.summary}
                  </p>

                  <div className="mt-4 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Read full update &rarr;
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredScholarships.map((sch) => (
            <div
              key={sch.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {sch.sponsor} · {sch.level}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-mono font-semibold tabular-nums ${
                      sch.status === 'Closing Soon'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    Deadline: {sch.deadline} ({sch.status})
                  </span>
                </div>

                <h2 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                  {sch.title}
                </h2>

                <div className="mt-2 font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
                  {sch.amount}
                </div>

                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {sch.eligibility}
                </p>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                <a
                  href={sch.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Visit Application Portal
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
