import React from 'react';
import { BookOpen, Bot, Home, MonitorCheck, User as UserIcon } from 'lucide-react';
import type { AppView, User } from '../types/database';

interface NavbarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  currentUser: User | null;
}

const DESKTOP_LINKS: Array<{ view: AppView; label: string }> = [
  { view: 'home', label: 'Home' },
  { view: 'subjects', label: 'Subjects' },
  { view: 'questions', label: 'Past Questions' },
  { view: 'cbt', label: 'CBT' },
  { view: 'ai-tutor', label: 'AI Tutor' },
  { view: 'news', label: 'News' },
  { view: 'schools', label: 'Schools' },
  { view: 'pricing', label: 'Pricing' },
];

const MOBILE_TABS: Array<{ view: AppView; label: string; ariaLabel?: string; icon: React.FC<{ className?: string }> }> = [
  { view: 'home', label: 'Home', icon: Home },
  { view: 'questions', label: 'Questions', ariaLabel: 'Past Questions', icon: BookOpen },
  { view: 'cbt', label: 'CBT', icon: MonitorCheck },
  { view: 'ai-tutor', label: 'AI Tutor', icon: Bot },
  { view: 'profile', label: 'Profile', icon: UserIcon },
];

export const Navbar: React.FC<NavbarProps> = ({ activeView, onNavigate, currentUser }) => {
  return (
    <>
      {/* Desktop & Mobile Top Header — 3-Zone Contract */}
      <header className="sticky top-0 z-40 h-12 md:h-16 border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-md"
          >
            <svg className="h-7 w-7 shrink-0" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect width="40" height="40" rx="9" fill="#059669" />
              <path d="M20 9L8 15L20 21L32 15L20 9Z" fill="#FFFFFF" />
              <path
                d="M12.5 18.2V25.2C12.5 27.6 15.8 29.5 20 29.5C24.2 29.5 27.5 27.6 27.5 25.2V18.2L20 22L12.5 18.2Z"
                fill="#FDE68A"
              />
              <path d="M30 16.5V25" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-base md:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              Exam Master Nigeria
            </span>
          </button>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-5">
            {DESKTOP_LINKS.map((item) => {
              const isActive = activeView === item.view;
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => onNavigate(item.view)}
                  className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded ${
                    isActive
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-emerald-600 dark:bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Profile / Sign In Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className={`inline-flex min-h-[38px] md:min-h-[40px] items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs md:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                activeView === 'profile'
                  ? 'bg-emerald-700 text-white dark:bg-emerald-600'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500'
              }`}
            >
              <UserIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="max-w-[110px] truncate">
                {currentUser ? currentUser.name.split(' ')[0] : 'Sign In'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile & Tablet Fixed Bottom Tab Bar */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe lg:hidden dark:border-slate-800 dark:bg-slate-950/95"
      >
        <div className="grid h-14 grid-cols-5 items-center">
          {MOBILE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeView === tab.view;
            return (
              <button
                key={tab.view}
                type="button"
                aria-label={tab.ariaLabel || tab.label}
                onClick={() => onNavigate(tab.view)}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 ${
                  isActive
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
