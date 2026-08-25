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
  };
}

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarks, setBookmarks] = useState<BookCfg[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshBookmarks = useCallback(async () => {
    if (!getToken()) {
      setBookmarks([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchBookmarks();
      setBookmarks(rows.map((r) => apiBookToCfg(r.book)));
    } catch {
      setBookmarks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBookmarks();
    const onStorage = () => refreshBookmarks();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshBookmarks]);

  const isBookmarked = useCallback(
    (id: string) => bookmarks.some((b) => b.id === id),
    [bookmarks],
  );

  const addBookmark = useCallback(
    async (book: BookCfg) => {
      if (!getToken()) {
        window.location.href = '/login';
        return;
      }
      await addBookmarkApi(book.id);
      await refreshBookmarks();
    },
    [refreshBookmarks],
  );

  const removeBookmark = useCallback(
    async (id: string) => {
      if (!getToken()) return;
      await removeBookmarkApi(id);
      await refreshBookmarks();
    },
    [refreshBookmarks],
  );

  const toggleBookmark = useCallback(
    async (book: BookCfg) => {
      if (!getToken()) {
        window.location.href = '/login';
        return;
      }
      if (isBookmarked(book.id)) {
        await removeBookmarkApi(book.id);
      } else {
        await addBookmarkApi(book.id);
      }
      await refreshBookmarks();
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