'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { BookCfg } from '@/components/ui/books-showcase';
import {
  getToken,
  fetchBookmarks,
  addBookmarkApi,
  removeBookmarkApi,
  type ApiBook,
} from '@/lib/api';

type BookmarksContextValue = {
  bookmarks: BookCfg[];
  isBookmarked: (id: string) => boolean;
  toggleBookmark: (book: BookCfg) => Promise<void>;
  addBookmark: (book: BookCfg) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  refreshBookmarks: () => Promise<void>;
  loading: boolean;
};

const BookmarksContext = createContext<BookmarksContextValue | null>(null);
const STORAGE_KEY = 'bookstore-bookmarks';

function apiBookToCfg(b: ApiBook): BookCfg {
  return {
    id: String(b.id),
    title: b.title,
    author: b.author || 'Unknown',
    year: b.year || '',
    stars: b.stars ?? 5,
    desc: b.desc || '',
    images: {
      front: b.images?.front || undefined,
      spine: b.images?.spine || undefined,
      back: b.images?.back || undefined,
    },
    edge: b.edge,
    spineBg: b.spineBg,
    spineInk: b.spineInk,
    spineFont: b.spineFont,
    backBg: b.backBg,
    backInk: b.backInk,
    chapters: b.chapters,
    isFree: !!b.isFree,
  };
}

function toSerializable(book: BookCfg): BookCfg {
  const { front, back, spine, ...rest } = book as BookCfg & {
    front?: unknown;
    back?: unknown;
    spine?: unknown;
  };
  return rest as BookCfg;
}

function readLocalBookmarks(): BookCfg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalBookmarks(list: BookCfg[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(list.map(toSerializable)),
    );
  } catch {
    // ignore
  }
}

function clearLocalBookmarks() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Push every local bookmark to the API, then clear local storage */
async function mergeLocalIntoServer(): Promise<void> {
  const local = readLocalBookmarks();
  if (!local.length || !getToken()) return;

  for (const book of local) {
    try {
      await addBookmarkApi(book.id);
    } catch (e) {
      // already exists or invalid id — continue
      console.warn('merge bookmark', book.id, e);
    }
  }
  clearLocalBookmarks();
}

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarks, setBookmarks] = useState<BookCfg[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const refreshBookmarks = useCallback(async () => {
    if (!getToken()) {
      setBookmarks(readLocalBookmarks());
      return;
    }

    setLoading(true);
    try {
      // Merge guest list into account once per login session load
      await mergeLocalIntoServer();
      const rows = await fetchBookmarks();
      setBookmarks(rows.map((r) => apiBookToCfg(r.book)));
    } catch (e) {
      console.error('Failed to load bookmarks', e);
      setBookmarks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBookmarks().finally(() => setHydrated(true));

    const onAuth = () => {
      void refreshBookmarks();
    };
    window.addEventListener('auth-changed', onAuth);
    window.addEventListener('storage', onAuth);
    return () => {
      window.removeEventListener('auth-changed', onAuth);
      window.removeEventListener('storage', onAuth);
    };
  }, [refreshBookmarks]);

  // Guests only: keep localStorage in sync
  useEffect(() => {
    if (!hydrated) return;
    if (getToken()) return;
    writeLocalBookmarks(bookmarks);
  }, [bookmarks, hydrated]);

  const isBookmarked = useCallback(
    (id: string) => bookmarks.some((b) => b.id === id),
    [bookmarks],
  );

  const addBookmark = useCallback(
    async (book: BookCfg) => {
      const clean = toSerializable(book);

      if (!getToken()) {
        setBookmarks((prev) => {
          if (prev.some((b) => b.id === clean.id)) return prev;
          return [...prev, clean];
        });
        return;
      }

      try {
        await addBookmarkApi(book.id);
        await refreshBookmarks();
      } catch (e) {
        console.error(e);
        alert(e instanceof Error ? e.message : 'Could not save bookmark');
      }
    },
    [refreshBookmarks],
  );

  const removeBookmark = useCallback(
    async (id: string) => {
      if (!getToken()) {
        setBookmarks((prev) => prev.filter((b) => b.id !== id));
        return;
      }
      try {
        await removeBookmarkApi(id);
        await refreshBookmarks();
      } catch (e) {
        console.error(e);
      }
    },
    [refreshBookmarks],
  );

  const toggleBookmark = useCallback(
    async (book: BookCfg) => {
      const clean = toSerializable(book);

      if (!getToken()) {
        setBookmarks((prev) => {
          if (prev.some((b) => b.id === clean.id)) {
            return prev.filter((b) => b.id !== clean.id);
          }
          return [...prev, clean];
        });
        return;
      }

      try {
        if (isBookmarked(book.id)) {
          await removeBookmarkApi(book.id);
        } else {
          await addBookmarkApi(book.id);
        }
        await refreshBookmarks();
      } catch (e) {
        console.error(e);
        alert(e instanceof Error ? e.message : 'Could not update bookmark');
      }
    },
    [isBookmarked, refreshBookmarks],
  );

  const value = useMemo(
    () => ({
      bookmarks,
      isBookmarked,
      toggleBookmark,
      addBookmark,
      removeBookmark,
      refreshBookmarks,
      loading,
    }),
    [
      bookmarks,
      isBookmarked,
      toggleBookmark,
      addBookmark,
      removeBookmark,
      refreshBookmarks,
      loading,
    ],
  );

  return (
    <BookmarksContext.Provider value={value}>
      {children}
    </BookmarksContext.Provider>
  );
}

export function useBookmarks() {
  const ctx = useContext(BookmarksContext);
  if (!ctx) {
    throw new Error('useBookmarks must be used within BookmarksProvider');
  }
  return ctx;
}