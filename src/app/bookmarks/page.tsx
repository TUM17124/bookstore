'use client';

import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { useBookmarks } from '@/components/bookmarks-context';
import BooksShowcase from '@/components/ui/books-showcase'; // your path

export default function BookmarksPage() {
  const { bookmarks } = useBookmarks();

  if (bookmarks.length === 0) {
    return (
      <main className="mx-auto flex max-w-lg flex-col items-center px-4 pt-24 text-center">
        <Bookmark className="mb-4 h-10 w-10 text-foreground/40" />
        <h1 className="text-2xl font-bold tracking-tight">Bookmarks</h1>
        <p className="mt-3 text-foreground/60">
          No bookmarks yet. Open a book in the showcase and tap the bookmark icon.
        </p>
        <Link
          href="/"
          className="mt-8 text-sm font-medium text-foreground/70 hover:text-foreground"
        >
          ← Back home
        </Link>
      </main>
    );
  }

  return (
    // Exactly the space under the fixed h-16 navbar — no min-h-screen
    <main className="fixed inset-x-0 top-16 bottom-0 overflow-hidden">
      <BooksShowcase
        key={bookmarks.map((b) => b.id).join('-')}
        books={bookmarks}
        heroTitle="Bookmarks"
        navTitle="Your library"
        showNav
        showDetailPanel
        showCarousel
        className="h-full min-h-0" // override default min-h-[560px] if needed
      />
    </main>
  );
}