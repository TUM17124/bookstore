'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { BookCfg } from '@/components/ui/books-showcase';
import {
  getToken,
  fetchBookmarks,
  addBookmarkApi,
  removeBookmarkApi,
  type ApiBook,
  type Paginated,
  type BookmarkRow,
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

function asBookmarkList(
  data: Paginated<BookmarkRow> | BookmarkRow[],
): BookmarkRow[] {
  return Array.isArray(data) ? data : data.results ?? [];
}

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
    hasEbook: b.hasEbook !== false,
    hasAudiobook: !!b.hasAudiobook,
    price: b.price != null ? Number(b.price) : undefined,
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

async function mergeLocalIntoServer(): Promise<void> {
  const local = readLocalBookmarks();
  if (!local.length || !getToken()) return;

  for (const book of local) {
    try {
      await addBookmarkApi(book.id);
    } catch (e) {
      console.warn('merge bookmark', book.id, e);
    }
  }
  clearLocalBookmarks();
}

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarks, setBookmarks] = useState<BookCfg[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const busy = useRef(false);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const pumpStop = useRef(false);

  const loadPage = useCallback(async (p: number, replace: boolean) => {
    if (!getToken()) {
      if (replace) setBookmarks(readLocalBookmarks());
      hasMoreRef.current = false;
      return;
    }
    if (busy.current) return;
    busy.current = true;
    try {
      const data = await fetchBookmarks(p);
      const rows = asBookmarkList(data);
      const more = !Array.isArray(data) && !!(data as Paginated<BookmarkRow>).next;
      hasMoreRef.current = more;
      pageRef.current = p;
      const mapped = rows.map((r) => apiBookToCfg(r.book));
      setBookmarks((prev) => {
        if (replace) return mapped;
        const seen = new Set(prev.map((b) => b.id));
        return [...prev, ...mapped.filter((b) => !seen.has(b.id))];
      });
    } catch (e) {
      console.error('Failed to load bookmarks', e);
      if (replace) setBookmarks([]);
      hasMoreRef.current = false;
    } finally {
      busy.current = false;
    }
  }, []);

  const refreshBookmarks = useCallback(async () => {
    pumpStop.current = true;
    pageRef.current = 1;
    hasMoreRef.current = true;

    if (!getToken()) {
      setBookmarks(readLocalBookmarks());
      hasMoreRef.current = false;
      return;
    }

    setLoading(true);
    try {
      await mergeLocalIntoServer();
      await loadPage(1, true);
    } finally {
      setLoading(false);
    }

    pumpStop.current = false;
    while (!pumpStop.current && hasMoreRef.current) {
      await loadPage(pageRef.current + 1, false);
      await new Promise((r) => setTimeout(r, 400));
    }
  }, [loadPage]);

  useEffect(() => {
    void refreshBookmarks().finally(() => setHydrated(true));

    const onAuth = () => {
      void refreshBookmarks();
    };
    window.addEventListener('auth-changed', onAuth);
    window.addEventListener('storage', onAuth);
    return () => {
      pumpStop.current = true;
      window.removeEventListener('auth-changed', onAuth);
      window.removeEventListener('storage', onAuth);
    };
  }, [refreshBookmarks]);

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
        setBookmarks((prev) => {
          if (prev.some((b) => b.id === clean.id)) return prev;
          return [...prev, clean];
        });
      } catch (e) {
        console.error(e);
        alert(e instanceof Error ? e.message : 'Could not save bookmark');
      }
    },
    [],
  );

  const removeBookmark = useCallback(async (id: string) => {
    if (!getToken()) {
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
      return;
    }
    try {
      await removeBookmarkApi(id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const toggleBookmark = useCallback(
    async (book: BookCfg) => {
      if (isBookmarked(book.id)) await removeBookmark(book.id);
      else await addBookmark(book);
    },
    [isBookmarked, addBookmark, removeBookmark],
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