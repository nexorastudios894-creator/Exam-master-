import { createInitialDatabase } from '../data/seedData';
import type { ExamMasterDatabase } from '../types/database';

const STORAGE_KEY = 'exam_master_nigeria_db_v2';
const THEME_KEY = 'exam_master_theme_v1';
const IDB_NAME = 'ExamMasterNigeriaIDB';
const IDB_STORE = 'state';
const IDB_KEY = 'database_v2';

function openIDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function loadDatabaseSync(): ExamMasterDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ExamMasterDatabase;
      if (parsed && Array.isArray(parsed.questions) && Array.isArray(parsed.subjects)) {
        return parsed;
      }
    }
  } catch {
    // Fallback to initial seed data if localStorage is unavailable or corrupt
  }
  const initial = createInitialDatabase();
  saveDatabaseSync(initial);
  return initial;
}

export function saveDatabaseSync(db: ExamMasterDatabase): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Quota exceeded or restricted storage
  }
  // Mirror to IndexedDB asynchronously for resilient offline caching
  void openIDB().then((idb) => {
    if (!idb) return;
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(db, IDB_KEY);
    } catch {
      // Ignore IDB write error
    }
  });
}

export async function hydrateFromIDB(): Promise<ExamMasterDatabase | null> {
  const idb = await openIDB();
  if (!idb) return null;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const val = req.result as ExamMasterDatabase | undefined;
        resolve(val && Array.isArray(val.questions) ? val : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function loadThemePreference(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore
  }
  return 'light';
}

export function saveThemePreference(theme: 'light' | 'dark'): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}

export function estimateCacheSizeKB(db: ExamMasterDatabase): number {
  const cachedQuestions = db.questions.filter((q) => db.cachedSubjectIds.includes(q.subjectId));
  const payload = JSON.stringify({
    questions: cachedQuestions,
    subjects: db.subjects,
    schools: db.schools,
    news: db.news_posts,
  });
  return Math.max(12, Math.round(payload.length / 1024));
}
