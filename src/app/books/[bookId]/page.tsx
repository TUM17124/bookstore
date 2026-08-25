'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BookReviews } from '@/components/book-reviews';

export default function BookReviewsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const bookId = String(params.bookId || '');
  const title = searchParams.get('title') || 'Ratings & comments';

  return (
    <main className="fixed inset-0 z-[60] flex flex-col bg-background">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-foreground/10 bg-background/90 px-3 backdrop-blur-md">
        {/* ONLY close control — no back link */}
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/10"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-bold leading-tight">{title}</h1>
          <p className="text-[13px] text-foreground/50">Ratings & comments</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {bookId ? (
          <BookReviews bookId={bookId} />
        ) : (
          <p className="p-6 text-sm text-foreground/60">Book not found.</p>
        )}
      </div>
    </main>
  );
}