import React, { useMemo, useState } from 'react';
import { ExternalLink, Globe, Mail, MapPin, Phone, Search, X } from 'lucide-react';
import type { ExamMasterDatabase, School, SchoolType } from '../types/database';

interface SchoolsDirectoryProps {
  db: ExamMasterDatabase;
}

export const SchoolsDirectory: React.FC<SchoolsDirectoryProps> = ({ db }) => {
  const [typeFilter, setTypeFilter] = useState<'ALL' | SchoolType>('ALL');
  const [maxCutOff, setMaxCutOff] = useState<number>(220);
  const [search, setSearch] = useState('');
  const [activeSchool, setActiveSchool] = useState<School | null>(null);

  const filteredSchools = useMemo(() => {
    return db.schools
      .filter((s) => {
        if (typeFilter !== 'ALL' && s.type !== typeFilter) return false;
        if (s.utmeCutOff > maxCutOff) return false;
        if (search.trim()) {
          const needle = search.trim().toLowerCase();
          const hay = `${s.name} ${s.acronym} ${s.state} ${s.city} ${s.courses.join(' ')}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => b.utmeCutOff - a.utmeCutOff);
  }, [db.schools, typeFilter, maxCutOff, search]);

  return (
    <div className="space-y-6 pb-10">
      <div className="border-b border-slate-200 pb-5 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Nigerian School Directory
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Compare universities, polytechnics, and colleges of education by UTME cut-off mark, courses, and admissions contact.
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {(['ALL', 'University', 'Polytechnic', 'College of Education'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  typeFilter === t
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {t === 'ALL' ? 'All Institutions' : t}
              </button>
            ))}
          </div>

          <span className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
            {filteredSchools.length} institutions matched
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          <div className="sm:col-span-7">
            <label htmlFor="sch-search" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Search school, state, or course (e.g. Lagos, Medicine, Computer Science)
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="sch-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search UNILAG, Law, Ibadan, Engineering..."
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          <div className="sm:col-span-5">
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
              <label htmlFor="sch-cutoff">Maximum UTME Cut-off</label>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                &le; {maxCutOff} marks
              </span>
            </div>
            <input
              id="sch-cutoff"
              type="range"
              min={120}
              max={240}
              step={5}
              value={maxCutOff}
              onChange={(e) => setMaxCutOff(Number(e.target.value))}
              className="mt-2.5 w-full accent-emerald-600"
            />
          </div>
        </div>
      </div>

      {/* Schools Grid */}
      {filteredSchools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          No institutions match your cut-off or search filter. Try raising the cut-off slider.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredSchools.map((school) => (
            <div
              key={school.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {school.ownership} {school.type}
                      </span>
                      {' · '}
                      <span>
                        {school.city}, {school.state} State
                      </span>
                    </div>
                    <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                      {school.name} ({school.acronym})
                    </h2>
                  </div>

                  <div className="shrink-0 rounded-xl bg-emerald-50 px-3 py-1.5 text-center dark:bg-emerald-950/60">
                    <div className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                      UTME Cut-off
                    </div>
                    <div className="font-mono text-lg font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {school.utmeCutOff}
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Popular Courses:{' '}
                  <span className="text-slate-700 dark:text-slate-200">
                    {school.courses.slice(0, 4).join(', ')}
                    {school.courses.length > 4 ? ` +${school.courses.length - 4} more` : ''}
                  </span>
                </p>

                <p className="mt-1.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                  Estimated Tuition: {school.tuitionRange}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {school.email}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSchool(school)}
                  className="min-h-[38px] rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  Courses &amp; Contact
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* School Detail Modal */}
      {activeSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {activeSchool.ownership} {activeSchool.type}
                </p>
                <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                  {activeSchool.name} ({activeSchool.acronym})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveSchool(null)}
                aria-label="Close school details"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-950">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">UTME Cut-off Mark</div>
                <div className="mt-0.5 font-mono text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {activeSchool.utmeCutOff}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Tuition Range</div>
                <div className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-white">
                  {activeSchool.tuitionRange}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                Accredited Courses Highlight
              </h4>
              <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-sm text-slate-700 dark:text-slate-300">
                {activeSchool.courses.map((course) => (
                  <li key={course} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                    {course}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span>
                  {activeSchool.city}, {activeSchool.state} State
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span>{activeSchool.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span className="font-mono tabular-nums">{activeSchool.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <a
                  href={activeSchool.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {activeSchool.website}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
