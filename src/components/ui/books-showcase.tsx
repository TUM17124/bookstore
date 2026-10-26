'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
// Types only: the three.js code (~130 KB gzipped) is loaded when a book is
// first opened (or the pointer/finger first touches the shelf), not with the page.
import type * as THREE from 'three';
import {
  CH, CT, CW, GAP, bookDims, backPivotZ, blockBox, endPageZ, frontPivotZ, leafHinge, leafProfile, leafSize, spineBox,
  type BookDims,
} from '@/lib/book3d/geometry';
import { PAGE_H, PAGE_W, paintFace, paintPaper, planFaces } from '@/lib/book3d/pages';
import { HINT_H, PHONE_TOP, TOOL_H, fitArea, phoneBookHeight } from '@/lib/book3d/layout';
import { loadPreviewPages } from '@/lib/book3d/preview';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useBookmarks } from '@/components/bookmarks-context';
import { useAsyncAction } from '@/hooks/use-async-action';
import { ActionButton, ActionStatus } from '@/components/ui/action-button';
import { createPortal } from 'react-dom';
import { searchTrack, sendAdEvent, queueSignal, currentPlacement, getRatings, getRelatedBooks, getBookAccess, downloadBook, hideBook, unhideBook, getHideReasons, type ApiBook, type ApiOffer, type BookAccess, type HideReason } from '@/lib/api';
import { PriceTag } from '@/components/offers/price-tag';
import dynamic from 'next/dynamic';

// Loaded only when opened (they used to ship with every page): the full
// reader, the audio player and the reviews panel.
function PanelLoading() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-current/20 border-t-[var(--brand-pink)] motion-reduce:animate-none" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
const PdfReader = dynamic(() => import('@/components/pdf-reader').then((m) => m.PdfReader), { ssr: false, loading: PanelLoading });
const AudioPlayer = dynamic(() => import('@/components/audio-player').then((m) => m.AudioPlayer), { ssr: false, loading: PanelLoading });
const BookReviews = dynamic(() => import('@/components/book-reviews').then((m) => m.BookReviews), { ssr: false, loading: PanelLoading });

const TOOL_BTN_BASE =
  'h-[44px] min-w-[44px] items-center justify-center rounded-full border-[1.5px] border-current/30 bg-[var(--bs-bg-light)]/80 text-current backdrop-blur transition-colors hover:border-current/70 dark:bg-[var(--bs-bg-dark)]/80';
const TOOL_BTN = `inline-flex ${TOOL_BTN_BASE}`;
const iconProps = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const IconReset = () => (
  <svg {...iconProps}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
);
const IconChevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg {...iconProps}><path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} /></svg>
);
const IconBookOpen = () => (
  <svg {...iconProps}><path d="M2 5.5C5 4 8.5 4 12 6c3.5-2 7-2 10-.5V19c-3-1.500-6.500-1.500-10 .5-3.500-2-7-2-10-.5z" /><path d="M12 6v13.500" /></svg>
);
const IconBookClosed = () => (
  <svg {...iconProps}><path d="M5 4h13a1 1 0 0 1 1 1v15H6a1 1 0 0 1-1-1z" /><path d="M5 17h14" /></svg>
);

let threePromise: Promise<typeof import('three')> | null = null;
/** Start (once) downloading three.js; the 3D book view needs it. */
function loadThree() {
  threePromise ??= import('three');
  return threePromise;
}
import { useCurrency, formatMoney } from '@/lib/money';
import { edgeMask, useScrollEdges } from '@/components/category-nav/use-scroll-edges';
import { ExpandableText } from '@/components/expandable-text';
import { useSignalsOn } from '@/lib/site-config';
import { Banners } from '@/components/offers/banners';
import { nativeShare } from '@/lib/share';
import { ShareSheet } from '@/components/share-sheet';

export interface BookCfg {
  id: string;
  /** Part C: live campaign offers from the server. */
  offers?: { ebook: ApiOffer | null; audiobook: ApiOffer | null } | null;
  title: string;
  author: string;
  year: string;
  stars: number;
  desc: string;
  price?: number;
  ebookPrice?: number;
  audiobookPrice?: number;
  hasEbook?: boolean;
  hasAudiobook?: boolean;
  ebookDownloadable?: boolean;
  audiobookDownloadable?: boolean;
  isFree?: boolean;
  isFeatured?: boolean;
  previewPages?: number;
  audioUrl?: string | null;
  pdfUrl?: string | null;
  category?: string;
  front?: (x: CanvasRenderingContext2D, w: number, h: number) => void;
  back?: (x: CanvasRenderingContext2D, w: number, h: number) => void;
  spine?: (x: CanvasRenderingContext2D, w: number, h: number) => void;
  images?: { front?: string; back?: string; spine?: string; frontThumbs?: { w: number; url: string }[] };
  coverURL?: string | null;
  edge?: string;
  backBg?: string;
  backInk?: string;
  spineBg?: string;
  spineInk?: string;
  spineFont?: string;
  chapters?: string[];
  /** Part B: rating sent with the section payload, so the card doesn't
   * fetch it separately (one request per card). */
  ratingAvg?: number;
  ratingCount?: number;
  /** Part E: a paid slot ("Sponsored" label, view and click events). */
  sponsored?: { token: string; label: string } | null;
  /** Part 6: PDF page count, used to derive spine thickness. */
  pageCount?: number | null;
  /** Public share page (/b/<slug>/), see lib/share.ts. */
  slug?: string;
  shareUrl?: string;
}

/** Where a card sits, for the interaction signals (Part E, PR 3). */
export type CardSlot = { placement?: string; sectionId?: number | null; position?: number };

/** Part E: a card counts as seen once at least half of it has been on
 * screen for one continuous second, sent once per card. A sponsored card
 * reports to the ad server (its signed token); any other card queues an
 * impression signal. */
function useCardViewability(bookId: string, token: string | undefined, slot: CardSlot | undefined, signals: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const placement = slot?.placement;
  const sectionId = slot?.sectionId ?? null;
  const position = slot?.position ?? null;
  useEffect(() => {
    const el = ref.current;
    // Organic cards report only while Activity signals are on (admin switch).
    if (!el || typeof IntersectionObserver === 'undefined' || (!token && !signals)) return;
    const report = () =>
      token
        ? sendAdEvent('seen', token)
        : queueSignal({ kind: 'impression', book_id: bookId, placement: placement || currentPlacement(), section_id: sectionId, position });
    let timer: ReturnType<typeof setTimeout> | null = null;
    let sent = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (sent) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!timer) {
            timer = setTimeout(() => {
              sent = true;
              report();
              io.disconnect();
            }, 1000);
          }
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      io.disconnect();
    };
  }, [bookId, token, placement, sectionId, position, signals]);
  return ref;
}

/** Part B: one personalised/category section row. */
export interface ShowcaseSection {
  id: number;
  title: string;
  description: string;
  personal: boolean;
  why: string;
  /** ML-ranked sections: why each book is here, keyed by book id. */
  reasons?: Record<string, string>;
  books: BookCfg[];
}

export interface BooksShowcaseProps {
  books: BookCfg[];
  heroTitle?: string;
  navTitle?: string;
  showNav?: boolean;
  showDetailPanel?: boolean;
  showCarousel?: boolean;
  themeColors?: {
    navy?: string;
    pink?: string;
    cream?: string;
    lav?: string;
    peri?: string;
    bg?: string;
    bgLight?: string;
    bgDark?: string;
    foregroundLight?: string;
    foregroundDark?: string;
  };
  className?: string;
  /** Part B: rows above the grid (home: personalised sections; category
   * page: that category's sections). */
  sections?: ShowcaseSection[];
  /** Part B: opened from a section — the page makes sure the book is in
   * `books` and selects it (?book=id), which opens the 3D view. */
  onSectionBookOpen?: (book: BookCfg) => void;
  /** Part C: an offer's countdown hit zero - re-ask the server for this book. */
  onOfferExpired?: (bookId: string) => void;
  /** Sections are still loading: show this many same-size skeletons. */
  sectionsLoading?: boolean;
  sectionSkeletons?: number;
  /** Part B: shown at the top of the grid view (category header, chips). */
  topSlot?: React.ReactNode;
  onBookSelect?: (book: BookCfg | null) => void;
  onNearEnd?: () => void;
  openBookId?: string;
  openView?: string;
}

const OPEN_SLIP_CLASS =
  'pointer-events-none absolute left-1/2 top-[62%] z-10 -translate-x-1/2 -translate-y-1/2 ' +
  'rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--on-brand)] ' +
  'bg-white shadow-[0_6px_16px_rgba(0,0,0,0.28)] ' +
  'opacity-0 scale-[0.94] transition-[opacity,transform] duration-200 ease-out ' +
  'group-hover:opacity-100 group-hover:scale-100 group-focus-visible:opacity-100 group-focus-visible:scale-100';

function coverSrc(book: BookCfg) {
  return book.images?.front || book.coverURL || '';
}

/** Perf Step 2: WebP thumbnails of the front ("url 300w, url 600w"), or ''. */
function coverSrcSet(book: BookCfg) {
  const thumbs = book.images?.front ? book.images.frontThumbs : undefined;
  return thumbs?.length ? thumbs.map((t) => `${t.url} ${t.w}w`).join(', ') : '';
}

// The card's cover face: ~84% of a card that is 44% of the row on phones
// and 200px from 768px up.
const CARD_COVER_SIZES = '(min-width: 768px) 170px, 36vw';

function StarsRow({ value, className }: { value: number; className?: string }) {
  const rounded = Math.round(value);
  return (
    <span className={cn('flex gap-[3px]', className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 fill-[var(--bs-pink)] ${i < rounded ? '' : 'opacity-25'}`}
        >
          <path d="M12 2.6l2.8 6 6.6.6-5 4.4 1.5 6.5L12 16.7 6.1 20.1l1.5-6.5-5-4.4 6.6-.6z" />
        </svg>
      ))}
    </span>
  );
}

export function GridBookCard({
  book,
  onOpen,
  spinning,
  eager = false,
  slot,
  onHide,
}: {
  book: BookCfg;
  /** Where the card is (section, position) for the interaction signals. */
  slot?: CardSlot;
  onOpen: () => void;
  spinning?: boolean;
  /** Perf Step 2: covers in the first row load at once; the rest when near the screen. */
  eager?: boolean;
  /** Called when the user hides this book. The parent removes it from its list. */
  onHide?: (bookId: string, title: string) => void;
}) {
  const src = coverSrc(book);
  const srcSet = coverSrcSet(book);
  const [broken, setBroken] = useState(false);
  const hasPayloadRating = book.ratingCount != null;
  const [avg, setAvg] = useState(hasPayloadRating && book.ratingCount ? Number(book.ratingAvg) || 0 : book.stars || 0);
  const [count, setCount] = useState(book.ratingCount || 0);
  const spineColor = book.spineBg || book.backBg || '#1c1f26';
  const pageColor = book.edge || '#eee4cf';
  const adToken = book.sponsored?.token;
  const signalsOn = useSignalsOn();
  const adRef = useCardViewability(book.id, adToken, slot, signalsOn);

  useEffect(() => {
    if (hasPayloadRating) return; // came with the section payload
    let cancelled = false;
    getRatings(book.id)
      .then((r) => {
        if (cancelled) return;
        const n = Number(r.count) || 0;
        setCount(n);
        setAvg(n > 0 ? Number(r.average) || 0 : book.stars || 0);
      })
      .catch(() => {
        if (cancelled) return;
        setAvg(book.stars || 0);
        setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [book.id, book.stars, hasPayloadRating]);

  function handleHide(e: React.MouseEvent) {
    e.stopPropagation();
    if (onHide) onHide(book.id, book.title);
  }

  return (
    <div
      ref={adRef}
      className="group relative flex w-full flex-col"
      data-sponsored={adToken ? 'true' : undefined}
    >
    <button
      type="button"
      onClick={() => {
        // A sponsored click goes to the ad server (charging, fraud checks);
        // it logs the signal itself, marked sponsored.
        if (adToken) sendAdEvent('click', adToken);
        else if (signalsOn)
          queueSignal({
            kind: 'click',
            book_id: book.id,
            placement: slot?.placement || currentPlacement(),
            section_id: slot?.sectionId ?? null,
            position: slot?.position ?? null,
          });
        onOpen();
      }}
      disabled={spinning}
      className="flex w-full flex-col text-left outline-none"
    >
      <div
        className={cn(
          'relative aspect-[2/2.85] w-full',
          spinning ? 'z-20' : '',
        )}
      >
        <div className="bs-book-stage absolute inset-[6%_10%_4%_6%]">
          <div className={cn('bs-book', spinning && 'bs-book-loading')}>
            <div className="bs-book-front" style={{ background: spineColor }}>
              {src && !broken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <picture className="block h-full w-full">
                  {srcSet && <source type="image/webp" srcSet={srcSet} sizes={CARD_COVER_SIZES} />}
                  <img src={src} alt={book.title} loading={eager ? 'eager' : 'lazy'} decoding="async" className="block h-full w-full object-cover" onError={() => setBroken(true)} />
                </picture>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center px-3 text-center">
                  <span className="line-clamp-4 text-[13px] font-bold leading-snug text-white">{book.title}</span>
                  <span className="mt-2 line-clamp-2 text-[11px] italic text-white/70">{book.author}</span>
                </div>
              )}
            </div>
            <div className="bs-book-spine" style={{ background: spineColor }}>
              <span className="bs-book-spine-title">{book.title}</span>
            </div>
            <div
              className="bs-book-pages"
              style={{
                background: `linear-gradient(90deg, #cfc3a8 0%, ${pageColor} 12%, #f7f1e2 46%, ${pageColor} 100%)`,
              }}
            />
            <div className="bs-book-top" style={{ background: pageColor }} />
          </div>
        </div>

        {spinning && (
          <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center rounded-xl bg-black/35 backdrop-blur-[1px]">
            <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/25 border-t-[var(--bs-pink)]" />
            <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white">Loading view</span>
          </div>
        )}

        {!spinning && <span className={OPEN_SLIP_CLASS}>Open</span>}
      </div>

      <div className="mt-2.5 min-h-[var(--bs-card-meta,0px)] min-w-0">
        {book.sponsored && (
          <span className="mb-1 inline-block rounded border border-current/25 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.12em] text-current/70">
            {book.sponsored.label || 'Sponsored'}
          </span>
        )}
        <div className="line-clamp-2 text-[13px] font-semibold leading-snug text-current">{book.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <StarsRow value={avg} />
          {count > 0 ? (
            <span className="text-[11px] text-current/55">
              {avg.toFixed(1)} · {count}
            </span>
          ) : (
            <span className="text-[11px] text-current/45">{(book.stars || 0).toFixed(1)}</span>
          )}
        </div>
        <div className="mt-1 flex items-baseline gap-2 text-[12px] leading-tight">
  {book.isFree ? (
    <span className="font-bold text-[var(--brand-pink-text)] uppercase text-[10px] tracking-wider">Free</span>
  ) : (
    <>
      {(book.hasEbook !== false) && Number(book.ebookPrice ?? book.price ?? 0) > 0 && (
        <PriceTag
          label="eBook"
          listPrice={Number(book.ebookPrice ?? book.price ?? 0)}
          offer={book.offers?.ebook}
          className="font-bold text-[var(--brand-pink-text)]"
        />
      )}
      {book.hasAudiobook && Number(book.audiobookPrice ?? book.price ?? 0) > 0 && (
        <PriceTag
          label="Audio"
          listPrice={Number(book.audiobookPrice ?? book.price ?? 0)}
          offer={book.offers?.audiobook}
          className="font-bold text-[var(--brand-pink-text)]"
        />
      )}
    </>
  )}
</div>
      </div>
    </button>
    {/* ✕ "Not interested" button — always visible, frosted glass, top-right of cover */}
    {onHide && !spinning && (
      <button
        type="button"
        aria-label={`Not interested in ${book.title}`}
        onClick={handleHide}
        className="absolute right-1 top-1 z-10 rounded-full p-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--bs-pink)]"
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex h-[22px] w-[22px] items-center justify-center rounded-full md:h-[26px] md:w-[26px]',
            'bg-white/15 backdrop-blur-md ring-1 ring-white/30 shadow-sm',
            'text-[var(--bs-pink)] opacity-85',
            'dark:bg-white/10 dark:ring-white/20',
            'supports-[not_(backdrop-filter:blur(1px))]:bg-white/40',
            'dark:supports-[not_(backdrop-filter:blur(1px))]:bg-black/40',
          )}
        >
          <svg
            viewBox="0 0 20 20"
            className="h-[10px] w-[10px] md:h-[11px] md:w-[11px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </span>
      </button>
    )}
    </div>
  );
}

/** Part B: a section row — header, optional "Why am I seeing this?", and a
 * horizontally scrolling, snap-aligned list of the same book cards. */
function SectionRow({
  section,
  onOpen,
  spinningId,
  first = false,
  onHide,
  hiddenIds,
}: {
  section: ShowcaseSection;
  first?: boolean;
  onOpen: (book: BookCfg) => void;
  spinningId?: string | null;
  onHide?: (bookId: string, title: string) => void;
  hiddenIds?: Set<string>;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const headingId = `bs-section-${section.id}`;
  // No visible scrollbar; a soft fade on the edge that has more books.
  const rowRef = useRef<HTMLUListElement | null>(null);
  const edges = useScrollEdges(rowRef);
  return (
    <section aria-labelledby={headingId} className="mb-8">
      <div className="mb-3 flex min-h-[var(--bs-section-head)] items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[clamp(17px,1.8cqw,22px)] font-extrabold tracking-[-0.01em] text-current">
            {section.title}
          </h2>
          {section.description ? (
            <p className="mt-0.5 text-[13px] text-current/60">{section.description}</p>
          ) : null}
        </div>
        {section.personal && section.why ? (
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            aria-expanded={whyOpen}
            aria-controls={`${headingId}-why`}
            className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold text-current/65 underline-offset-2 hover:underline"
          >
            Why am I seeing this?
          </button>
        ) : null}
      </div>
      {section.personal && whyOpen ? (
        <p id={`${headingId}-why`} className="mb-3 rounded-xl bg-current/[0.06] px-3 py-2 text-[13px] text-current/75">
          {section.why}{' '}
          <a href="/settings/?section=personalisation" className="font-semibold underline">
            Turn off personalisation
          </a>
          {section.reasons && Object.keys(section.reasons).length ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {section.books
                .filter((b) => section.reasons?.[b.id])
                .slice(0, 6)
                .map((b) => (
                  <li key={b.id}>
                    <span className="font-semibold">{b.title}</span> — {section.reasons?.[b.id]}
                  </li>
                ))}
            </ul>
          ) : null}
        </p>
      ) : null}
      <ul
        ref={rowRef}
        style={{ ...edgeMask(edges.start, edges.end), ['--bs-card-meta' as string]: 'var(--bs-section-meta)' }}
        className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {section.books.filter((book) => !hiddenIds?.has(book.id)).map((book, i) => (
          <li key={book.id} className="w-[44%] shrink-0 snap-start @min-[520px]:w-[30%] @min-[768px]:w-[200px]">
            <GridBookCard book={book} eager={first && i < 6} spinning={spinningId === book.id} onOpen={() => onOpen(book)}
              slot={{ sectionId: section.id, position: i }} onHide={onHide} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Part C follow-up: a placeholder the exact size of a SectionRow, shown
 * while the sections load, so they fill this space instead of pushing the
 * book grid down. */
function SectionSkeleton() {
  return (
    <section aria-hidden className="mb-8">
      <div className="mb-3 flex min-h-[var(--bs-section-head)] flex-col justify-end gap-1.5">
        <span className="h-[18px] w-44 rounded-md bg-current/10 motion-safe:animate-pulse" />
        <span className="h-[12px] w-64 max-w-[70%] rounded-md bg-current/[0.07] motion-safe:animate-pulse" />
      </div>
      <ul className="-mx-1 flex gap-4 overflow-hidden px-1 pb-2">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="w-[44%] shrink-0 @min-[520px]:w-[30%] @min-[768px]:w-[200px]">
            <div className="relative aspect-[2/2.85] w-full">
              <div className="absolute inset-[6%_10%_4%_6%] rounded-md bg-current/[0.08] motion-safe:animate-pulse" />
            </div>
            <div className="mt-2.5 min-h-[var(--bs-section-meta)] space-y-1.5">
              <span className="block h-[13px] w-4/5 rounded bg-current/[0.08]" />
              <span className="block h-[11px] w-1/2 rounded bg-current/[0.06]" />
              <span className="block h-[12px] w-2/5 rounded bg-current/[0.06]" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sections, or skeletons of the same size while they load. If fewer
 * sections arrive than were reserved, the space stays until the reader's
 * next tap/key press (a shift right after input isn't a jump), then goes. */
function SectionsBlock({
  sections,
  loading,
  skeletons,
  spinningId,
  onOpen,
  onHide,
  hiddenIds,
}: {
  sections: ShowcaseSection[];
  loading: boolean;
  skeletons: number;
  spinningId: string | null;
  onOpen: (book: BookCfg) => void;
  onHide?: (bookId: string, title: string) => void;
  hiddenIds?: Set<string>;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [reserve, setReserve] = useState(0);
  const wasLoading = useRef(loading);

  useLayoutEffect(() => {
    const el = ref.current;
    if (wasLoading.current && !loading && el) {
      // Keep the skeletons' height until the next input.
      const h = el.dataset.skeletonHeight ? Number(el.dataset.skeletonHeight) : 0;
      if (h > el.scrollHeight) setReserve(h);
    }
    if (loading && el) el.dataset.skeletonHeight = String(el.scrollHeight);
    wasLoading.current = loading;
  }, [loading]);

  useEffect(() => {
    if (!reserve) return;
    const release = () => setReserve(0);
    window.addEventListener('pointerdown', release, { once: true });
    window.addEventListener('keydown', release, { once: true });
    return () => {
      window.removeEventListener('pointerdown', release);
      window.removeEventListener('keydown', release);
    };
  }, [reserve]);

  return (
    <div ref={ref} style={reserve ? { minHeight: reserve } : undefined} aria-busy={loading || undefined}>
      {loading
        ? Array.from({ length: skeletons }, (_, i) => <SectionSkeleton key={i} />)
        : sections.map((section, i) => (
            <SectionRow key={section.id} section={section} first={i === 0} spinningId={spinningId} onOpen={onOpen} onHide={onHide} hiddenIds={hiddenIds} />
          ))}
    </div>
  );
}

function apiBookToMiniCfg(b: ApiBook): BookCfg {
  return {
    id: String(b.id),
    title: b.title,
    author: b.author || 'Unknown',
    year: b.year || '',
    stars: b.stars ?? 5,
    desc: b.desc || '',
    images: {
      front: b.images?.front || undefined,
      frontThumbs: b.images?.frontThumbs,
      spine: b.images?.spine || undefined,
      back: b.images?.back || undefined,
    },
    price: b.price != null ? Number(b.price) : undefined,
    ebookPrice: b.ebook_price != null ? Number(b.ebook_price) : undefined,
    audiobookPrice: b.audiobook_price != null ? Number(b.audiobook_price) : undefined,
    hasEbook: b.hasEbook !== false,
    hasAudiobook: !!b.hasAudiobook,
    isFree: !!b.isFree,
  };
}

function RecommendedBooks({ book }: { book: BookCfg }) {
  const router = useRouter();
  const [items, setItems] = useState<BookCfg[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Backend already returns a fully ranked list (item similarity +
        // "people who bought/rated/bookmarked this also ..." + personal
        // affinity when logged in) — no client-side re-sort here, that
        // would undo the scoring.
        const data: ApiBook[] = await getRelatedBooks(book.id, 8);
        const list = data
          .filter((b) => String(b.id) !== String(book.id))
          .map(apiBookToMiniCfg);
        if (!cancelled) setItems(list.slice(0, 8));
      } catch {
        if (!cancelled) setItems([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  useEffect(() => {
    setOpeningId(null);
  }, [book.id]);

  if (items.length === 0) return null;

  const skip = (dir: 1 | -1) => {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <div className="w-full border-t border-current/10 bg-[var(--bs-bg-light)] text-[var(--bs-fg-light)] dark:bg-[var(--bs-bg-dark)] dark:text-[var(--bs-fg-dark)]">
      <div className="flex items-center justify-between px-4 pt-5 sm:px-8">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-current/60">Recommendations</h3>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Scroll recommendations left"
            onClick={() => skip(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-current/10 hover:bg-current/20"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Scroll recommendations right"
            onClick={() => skip(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-current/10 hover:bg-current/20"
          >
            ›
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto px-4 py-5 sm:px-8 [scrollbar-width:thin]"
      >
        {items.map((b, i) => (
          <div key={b.id} className="w-[132px] shrink-0 @min-[768px]:w-[240px]">
            <GridBookCard
              book={b}
              slot={{ placement: 'related', position: i }}
              spinning={openingId === b.id}
              onOpen={() => {
                setOpeningId(b.id);
                const params = new URLSearchParams(window.location.search);
                params.set('book', b.id);
                router.push(`/?${params.toString()}`);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Part C: a price in the open-book panel - the offer (with countdown) and,
 * when the admin set an approximate USD rate, "≈ $x" of what you pay. */
function DetailPrice({
  label,
  listPrice,
  offer,
  onExpire,
}: {
  label: string;
  listPrice: number;
  offer?: ApiOffer | null;
  onExpire?: () => void;
}) {
  const cfg = useCurrency();
  const pay = offer ? Number(offer.price) : listPrice;
  const usdRate = Number(cfg.approx_usd_rate || 0);
  return (
    <div className="text-[16px] leading-tight">
      <PriceTag
        label={label}
        listPrice={listPrice}
        offer={offer}
        size="detail"
        onExpire={onExpire}
        className="text-[var(--brand-pink-text)] [&>span:first-child>span:first-child]:text-current/55"
      />
      {usdRate > 0 && cfg.code !== "USD" && (
        <span className="ml-1.5 font-bold tabular-nums text-current/60">
          ≈ {formatMoney(pay / usdRate, { ...cfg, symbol: "$", space: false, decimals: 2, position: "before" })}
        </span>
      )}
    </div>
  );
}

export function BooksShowcase({
  books = [],
  heroTitle = 'Books',
  navTitle = 'Bestsellers',
  showNav = true,
  showDetailPanel = true,
  themeColors,
  className,
  sections = [],
  onSectionBookOpen,
  onOfferExpired,
  sectionsLoading,
  sectionSkeletons,
  topSlot,
  onBookSelect,
  onNearEnd,
  openBookId,
  openView,
}: BooksShowcaseProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const dpRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const sceneApiRef = useRef<{ openById: (id: string) => void; closeCurrent: () => void; toggleLook: () => void; turnPage: (d: number) => void; resetView: () => void } | null>(null);
  const [lookInside, setLookInside] = useState(false);
  // True once the book has been turned away from the front view (shows "Reset view").
  const [viewRotated, setViewRotated] = useState(false);
  // Where the book's area, its toolbar and (on phones) the detail panel go, in px of the showcase.
  const [layout, setLayout] = useState<{ phone: boolean; toolTop: number; toolX: number; panelTop: number; wrapMin: number } | null>(null);
  const [pageInfo, setPageInfo] = useState({ turned: 0, leaves: 4 });
  const pendingOpenIdRef = useRef<string | null>(null);
  // The 3D scene (and three.js) is set up the first time a book is opened.
  const [sceneWanted, setSceneWanted] = useState(false);

  const onBookSelectRef = useRef(onBookSelect);
  useEffect(() => {
    onBookSelectRef.current = onBookSelect;
  }, [onBookSelect]);

  const onNearEndRef = useRef(onNearEnd);
  const booksRef = useRef(books);
  useEffect(() => {
    booksRef.current = books;
  }, [books]);
  useEffect(() => {
    onNearEndRef.current = onNearEnd;
  }, [onNearEnd]);

  const [uiMode, setUiMode] = useState<'hero' | 'opening' | 'detail' | 'closing'>('hero');
  const [linkOpen, setLinkOpen] = useState(() => !!openBookId);
  const [selectedCfg, setSelectedCfg] = useState<BookCfg | null>(null);

  // What the SERVER says this user may do with the selected book. Display
  // only — every reader page, stream and download is re-checked server-side.
  const [access, setAccess] = useState<BookAccess | null>(null);
  const [contentMsg, setContentMsg] = useState('');
  const [buyLoading, setBuyLoading] = useState<'ebook' | 'audiobook' | null>(null);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [myRating, setMyRating] = useState<number | null>(null);
  const bookmarked = selectedCfg != null ? isBookmarked(selectedCfg.id) : false;
  const bookmarkAction = useAsyncAction(
    (_ctx, cfg: NonNullable<typeof selectedCfg>) => toggleBookmark(cfg),
    { successMs: 0, errorFallback: "Couldn't update your wishlist. Please try again." },
  );
  const handleSave = () => {
    if (!selectedCfg) return;
    void bookmarkAction.run(selectedCfg);
  };
  const [downloadMenu, setDownloadMenu] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // --- Not interested ---
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [hideReasons, setHideReasons] = useState<HideReason[]>([]);
  const [otherReasonText, setOtherReasonText] = useState('');
  const [showOtherInput, setShowOtherInput] = useState(false);
  type HideToast = {
    id: string
    title: string
    phase: 'pick-reason' | 'hidden' | 'error'
    error?: string
    errorAction?: 'hide' | 'unhide'
  }
  const [hideToast, setHideToast] = useState<HideToast | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { void getHideReasons().then(setHideReasons) }, []);

  function _scheduleToastDismiss(ms = 6000) {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHideToast(null), ms);
  }

  function handleHideBook(bookId: string, title: string) {
    setHiddenIds((prev) => new Set([...prev, bookId]));
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setHideToast({ id: bookId, title, phase: 'pick-reason' });
    hideBook(Number(bookId)).catch(() => {
      setHiddenIds((prev) => { const n = new Set(prev); n.delete(bookId); return n; });
      setHideToast({ id: bookId, title, phase: 'error', error: "Couldn't hide this book.", errorAction: 'hide' });
      _scheduleToastDismiss(9000);
    });
  }

  function handlePickReason(reason: string, otherReason = '') {
    const toast = hideToast;
    if (!toast) return;
    setHideToast({ id: toast.id, title: toast.title, phase: 'hidden' });
    setShowOtherInput(false);
    setOtherReasonText('');
    _scheduleToastDismiss();
    hideBook(Number(toast.id), reason, otherReason).catch(() => { /* reason update failure is non-critical */ });
  }

  function handleSkipReason() {
    const toast = hideToast;
    if (!toast) return;
    setHideToast({ id: toast.id, title: toast.title, phase: 'hidden' });
    setShowOtherInput(false);
    setOtherReasonText('');
    _scheduleToastDismiss();
  }

  function handleUndoHide() {
    const toast = hideToast;
    if (!toast) return;
    setHideToast(null);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setHiddenIds((prev) => { const n = new Set(prev); n.delete(toast.id); return n; });
    unhideBook(Number(toast.id)).catch(() => {
      setHiddenIds((prev) => new Set([...prev, toast.id]));
      setHideToast({ id: toast.id, title: toast.title, phase: 'error', error: "Couldn't undo. Try again.", errorAction: 'unhide' });
      _scheduleToastDismiss(9000);
    });
  }

  function handleRetryHide() {
    const toast = hideToast;
    if (!toast) return;
    setHideToast(null);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (toast.errorAction === 'hide') {
      handleHideBook(toast.id, toast.title);
    } else {
      // Retry unhide: book is still hidden, attempt unhide again
      setHiddenIds((prev) => { const n = new Set(prev); n.delete(toast.id); return n; });
      unhideBook(Number(toast.id)).catch(() => {
        setHiddenIds((prev) => new Set([...prev, toast.id]));
        setHideToast({ id: toast.id, title: toast.title, phase: 'error', error: "Couldn't undo. Try again.", errorAction: 'unhide' });
        _scheduleToastDismiss(9000);
      });
    }
  }

  const shelfActive = uiMode !== 'hero' && !!selectedCfg;
  // Perf Step 2: a book opened from a link (?book=) skips the grid while
  // opening, so the book view is in its final place from the first frame
  // (the grid used to show first, then vanish and pull the view up a screen).
  const showGrid = uiMode === 'hero' || (uiMode === 'opening' && !linkOpen);

  useEffect(() => {
    // Opening a book (including from Recommendations, while scrolled down
    // to view them) should show the book itself, not stay scrolled to
    // wherever the previous book's view was left.
    if (!selectedCfg?.id) return;
    rootRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedCfg?.id]);

  useEffect(() => {
    if (uiMode !== 'detail' || !selectedCfg?.id) return;
    // Part E: a book opened from a paid slot is not organic interest, so it
    // never feeds the trending counts (the ad server records that click).
    if (selectedCfg.sponsored) return;
    void searchTrack({
      event_type: 'click',
      book_id: selectedCfg.id,
      book_slug: String(selectedCfg.id),
      query: selectedCfg.title,
      source: 'shelf',
    });
  }, [uiMode, selectedCfg?.id]);

  const [shareOpen, setShareOpen] = useState(false);

  // Web Share API with the public /b/<slug>/ link; without it the share panel
  // (copy link, WhatsApp, Facebook, X, Telegram, LinkedIn, email).
  async function shareBook() {
    if (!selectedCfg) return;
    const result = await nativeShare(selectedCfg);
    if (result === 'unsupported') setShareOpen(true);
  }

  useEffect(() => {
    const open = uiMode === 'detail' || uiMode === 'opening';
    document.body.classList.toggle('book-detail-open', open);
    return () => document.body.classList.remove('book-detail-open');
  }, [uiMode]);

  useEffect(() => {
    setAccess(null);
    setContentMsg('');
    if (!selectedCfg) return;
    let cancelled = false;
    getBookAccess(selectedCfg.id)
      .then((a) => {
        if (!cancelled) setAccess(a);
      })
      .catch(() => {
        if (!cancelled) setAccess(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCfg]);

  // Never auto-retried: each completed download counts toward the limit.
  const downloadAction = useAsyncAction(
    async (_ctx, id: string, kind: 'ebook' | 'audiobook', title: string) => {
      await downloadBook(id, kind, `${title || 'book'}.${kind === 'ebook' ? 'pdf' : 'mp3'}`);
      return id;
    },
    {
      errorFallback: 'Download failed. Please try again.',
      onSuccess: (id) => {
        // Refresh "downloads left"; the download itself already succeeded.
        if (id) getBookAccess(id).then(setAccess).catch(() => {});
      },
    },
  );

  function startDownload(kind: 'ebook' | 'audiobook') {
    if (!selectedCfg) return;
    setContentMsg('');
    void downloadAction.run(selectedCfg.id, kind, selectedCfg.title || '');
  }

  useEffect(() => {
    if (!selectedCfg?.id) {
      setRatingAvg(0);
      setRatingCount(0);
      setMyRating(null);
      return;
    }
    let cancelled = false;
    getRatings(selectedCfg.id)
      .then((r) => {
        if (cancelled) return;
        setRatingAvg(Number(r.average) || 0);
        setRatingCount(Number(r.count) || 0);
        setMyRating(r.myRating == null ? null : Number(r.myRating));
      })
      .catch(() => {
        if (cancelled) return;
        setRatingAvg(0);
        setRatingCount(0);
        setMyRating(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCfg?.id]);

  function openFromGrid(book: BookCfg) {
    setLinkOpen(false);
    pendingOpenIdRef.current = String(book.id);
    setSceneWanted(true);
    if (sceneApiRef.current) {
      sceneApiRef.current.openById(String(book.id));
    } else {
      setSelectedCfg(book);
      setUiMode('opening');
    }
    onBookSelectRef.current?.(book);
  }

  useEffect(() => {
    if (!openBookId) return;
    const book = books.find((b) => String(b.id) === String(openBookId));
    if (!book) return;
    const fromLink = pendingOpenIdRef.current !== String(book.id);
    pendingOpenIdRef.current = String(book.id);
    setSceneWanted(true);
    if (fromLink) setLinkOpen(true);
    if (sceneApiRef.current) {
      sceneApiRef.current.openById(String(book.id));
    } else {
      setSelectedCfg(book);
      setUiMode((m) => (m === 'hero' ? 'opening' : m));
    }
    if (openView === 'reviews') setReviewsOpen(true);
    if (openView === 'read') setReaderOpen(true);
    if (openView === 'listen') setPlayerOpen(true);
  }, [openBookId, openView, books]);

  useEffect(() => {
    const root = rootRef.current;
    const canvasEl = canvasRef.current;
    if (!root || !canvasEl || books.length === 0 || !sceneWanted) return;

    let disposed = false;
    let cleanup: void | (() => void);
    const setupScene = (THREE: typeof import('three')) => {
    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const setT = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timeouts.push(id);
      return id;
    };

    const listNow = () => booksRef.current;
    const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const IS_PHONE =
      window.matchMedia('(max-width: 760px)').matches || window.matchMedia('(pointer: coarse)').matches;
    const COVER_W = 1024;
    const COVER_H = 1536;
    const MAX_TEX = 1024;
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

    class Spring {
      v: number;
      t: number;
      vel: number;
      k: number;
      d: number;
      constructor(v: number, k?: number, d?: number) {
        this.v = v;
        this.t = v;
        this.vel = 0;
        this.k = k || 120;
        this.d = d || 14;
      }
      set(v: number) {
        this.v = v;
        this.t = v;
        this.vel = 0;
        return this;
      }
      update(dt: number) {
        const a = this.k * (this.t - this.v) - this.d * this.vel;
        this.vel += a * dt;
        this.v += this.vel * dt;
        return this.v;
      }
    }

    function mkCanvas(w: number, h: number) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    function drawSpaced(x: CanvasRenderingContext2D, text: string, cx: number, y: number, ls: number) {
      const prev = x.textAlign;
      x.textAlign = 'left';
      const chars = [...text];
      let tot = 0;
      const ws = chars.map((ch) => {
        const w = x.measureText(ch).width;
        tot += w;
        return w;
      });
      tot += ls * (chars.length - 1);
      let px = cx - tot / 2;
      chars.forEach((ch, i) => {
        x.fillText(ch, px, y);
        px += ws[i] + ls;
      });
      x.textAlign = prev;
    }
    function rr(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number) {
      x.beginPath();
      x.moveTo(px + r, py);
      x.arcTo(px + w, py, px + w, py + h, r);
      x.arcTo(px + w, py + h, px, py + h, r);
      x.arcTo(px, py + h, px, py, r);
      x.arcTo(px, py, px + w, py, r);
      x.closePath();
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch (err) {
      console.warn('BooksShowcase: WebGL renderer creation failed', err);
      const fail = document.createElement('div');
      fail.className =
        'absolute inset-0 z-50 flex items-center justify-center p-10 text-center text-lg leading-relaxed text-current/70';
      fail.textContent = 'This experience needs WebGL, which your browser blocked or does not support.';
      root.appendChild(fail);
      return () => fail.remove();
    }

    const dims = { w: 0, h: 0 };
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const ANISO = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    camera.position.set(0, 0.1, 9.6);

    function envBlob(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, rgb: string, a: number) {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, cy, r, 0, 6.2832);
      x.fill();
    }
    (function buildEnv() {
      const ew = 512,
        eh = 256;
      const c = mkCanvas(ew, eh),
        x = c.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, 0, eh);
      g.addColorStop(0, '#dfe3ea');
      g.addColorStop(0.55, '#8b93a3');
      g.addColorStop(1, '#1c1f26');
      x.fillStyle = g;
      x.fillRect(0, 0, ew, eh);
      envBlob(x, ew * 0.27, eh * 0.26, eh * 0.37, '255,255,255', 0.9);
      envBlob(x, ew * 0.79, eh * 0.33, eh * 0.21, '255,255,255', 0.35);
      envBlob(x, ew * 0.5, eh * 0.59, eh * 0.47, '210,215,225', 0.2);
      const tx = new THREE.CanvasTexture(c);
      tx.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(tx).texture;
      tx.dispose();
      pmrem.dispose();
    })();

    const hemi = new THREE.HemisphereLight(0xdfe3ea, 0x14161c, 0.35);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 0.82);
    key.position.set(3.5, 5, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const fillLight = new THREE.DirectionalLight(0xd7dbe4, 0.22);
    fillLight.position.set(-4, 1, 4);
    scene.add(fillLight);
    const rim = new THREE.DirectionalLight(0xf5f6f8, 0.24);
    rim.position.set(-2, 3, -5);
    scene.add(rim);
    const bookRoot = new THREE.Group();
    scene.add(bookRoot);

    function tex(c: HTMLCanvasElement) {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = ANISO;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    }
    function fitTexture(t: THREE.Texture, maxDim: number, targetAR?: number) {
      const img = t.image as { width?: number; height?: number } | undefined;
      if (!img || !img.width || !img.height) return t;
      const iw = img.width;
      const ih = img.height;
      const scale = maxDim / Math.max(iw, ih);
      const sw = Math.max(1, Math.round(iw * scale));
      const sh = Math.max(1, Math.round(ih * scale));

      if (targetAR && Math.abs(iw / ih - targetAR) > 0.04) {
        // Letterbox/pillarbox to target aspect ratio (object-fit: contain)
        const tw = Math.round(Math.min(maxDim, maxDim * targetAR));
        const th = Math.round(Math.min(maxDim, maxDim / targetAR));
        const c = mkCanvas(tw, th);
        const ctx = c.getContext('2d')!;
        const fitScale = Math.min(tw / iw, th / ih);
        const dw = Math.round(iw * fitScale), dh = Math.round(ih * fitScale);
        ctx.drawImage(img as CanvasImageSource, (tw - dw) / 2, (th - dh) / 2, dw, dh);
        t.image = c;
        t.needsUpdate = true;
        t.anisotropy = ANISO;
        return t;
      }

      if (Math.max(iw, ih) <= maxDim) {
        t.anisotropy = ANISO;
        return t;
      }
      const c = mkCanvas(sw, sh);
      c.getContext('2d')!.drawImage(img as CanvasImageSource, 0, 0, sw, sh);
      t.image = c;
      t.needsUpdate = true;
      t.anisotropy = ANISO;
      return t;
    }
    function loadOrPaint(material: THREE.MeshStandardMaterial, imageURL: string | null | undefined, paintFallback: () => HTMLCanvasElement, aspectRatio?: number) {
      if (imageURL) {
        const c = mkCanvas(4, 6);
        const x = c.getContext('2d')!;
        x.fillStyle = '#2a2d36';
        x.fillRect(0, 0, 4, 6);
        material.map = tex(c);
      } else {
        material.map = tex(paintFallback());
      }
      material.needsUpdate = true;
      if (!imageURL) return;
      new THREE.TextureLoader().setCrossOrigin('anonymous').load(
        imageURL,
        (t) => {
          if (cancelled) return;
          t.colorSpace = THREE.SRGBColorSpace;
          fitTexture(t, MAX_TEX, aspectRatio);
          material.map = t;
          material.needsUpdate = true;
        },
        undefined,
        () => {
          if (cancelled) return;
          material.map = tex(paintFallback());
          material.needsUpdate = true;
        },
      );
    }
    function noiseTexture(base: number, amp: number, scratches: boolean) {
      const s = 256,
        c = mkCanvas(s, s),
        x = c.getContext('2d')!;
      const img = x.createImageData(s, s),
        d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = base + (Math.random() - 0.5) * 2 * amp;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      if (scratches) {
        x.strokeStyle = 'rgba(200,200,200,.25)';
        x.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          x.beginPath();
          const y = Math.random() * s;
          x.moveTo(0, y);
          x.lineTo(s, y + (Math.random() - 0.5) * 22);
          x.stroke();
        }
      }
      return new THREE.CanvasTexture(c);
    }
    const laminateBump = noiseTexture(128, 4, false);
    const clothBump = (function () {
      const s = 128,
        c = mkCanvas(s, s),
        x = c.getContext('2d')!;
      x.fillStyle = '#808080';
      x.fillRect(0, 0, s, s);
      for (let i = 0; i < s; i += 2) {
        x.fillStyle = i % 4 === 0 ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.22)';
        x.fillRect(i, 0, 1, s);
        x.fillRect(0, i, s, 1);
      }
      return new THREE.CanvasTexture(c);
    })();
    function striationTexture(vertical: boolean) {
      const s = 512,
        c = mkCanvas(s, s),
        x = c.getContext('2d')!;
      x.fillStyle = '#f3f4f6';
      x.fillRect(0, 0, s, s);
      let p = 0;
      while (p < s) {
        const w = 1 + Math.random() * 2.4,
          tone = Math.random();
        x.fillStyle = tone < 0.12 ? 'rgba(170,174,182,.35)' : tone < 0.5 ? 'rgba(255,255,255,.5)' : 'rgba(205,209,216,.3)';
        if (vertical) x.fillRect(p, 0, w, s);
        else x.fillRect(0, p, s, w);
        p += w + 0.6 + Math.random() * 1.6;
      }
      for (let i = 0; i < 900; i++) {
        x.fillStyle = 'rgba(150,154,162,' + (Math.random() * 0.06).toFixed(3) + ')';
        x.fillRect(Math.random() * s, Math.random() * s, 1.2, 1.2);
      }
      return tex(c);
    }
    const striV = striationTexture(true);
    const striH = striationTexture(false);
    const endpaperTex = (function () {
      const s = 512,
        c = mkCanvas(s, s),
        x = c.getContext('2d')!;
      x.fillStyle = '#f5f6f8';
      x.fillRect(0, 0, s, s);
      for (let i = 0; i < 500; i++) {
        x.fillStyle = 'rgba(150,154,162,' + (0.03 + Math.random() * 0.05).toFixed(3) + ')';
        x.fillRect(Math.random() * s, Math.random() * s, 1.4, 1.4);
      }
      const g = x.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, 'rgba(0,0,0,.07)');
      g.addColorStop(0.12, 'rgba(0,0,0,0)');
      g.addColorStop(0.88, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.07)');
      x.fillStyle = g;
      x.fillRect(0, 0, s, s);
      return tex(c);
    })();
    // Soft shadow behind each book: strong on the dark theme, faint on the
    // light one (where a 45% blob looks like a smudge). Follows theme changes.
    const blobMats: THREE.MeshBasicMaterial[] = [];
    const blobOpacity = () => (document.documentElement.classList.contains('dark') ? 0.45 : 0.16);
    const themeObserver = new MutationObserver(() => {
      const o = blobOpacity();
      blobMats.forEach((m) => (m.opacity = o));
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const blobTex = (function () {
      const s = 256,
        c = mkCanvas(s, s),
        x = c.getContext('2d')!;
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(0,0,0,.85)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(c);
    })();

    function paintDefaultFront(x: CanvasRenderingContext2D, w: number, h: number, o: { title: string; author: string; bg: string }) {
      x.fillStyle = o.bg;
      x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 40; i++) x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      x.fillStyle = '#ffffff';
      x.textAlign = 'center';
      x.font = '700 76px Georgia';
      const words = o.title.split(' ');
      let line = '';
      const lines: string[] = [];
      words.forEach((word) => {
        const test = line ? line + ' ' + word : word;
        if (x.measureText(test).width > w * 0.8 && line) {
          lines.push(line);
          line = word;
        } else line = test;
      });
      if (line) lines.push(line);
      const startY = h * 0.42 - ((lines.length - 1) * 88) / 2;
      lines.forEach((l, i) => x.fillText(l, w / 2, startY + i * 88));
      x.globalAlpha = 0.85;
      x.font = 'italic 40px Georgia';
      x.fillText(o.author, w / 2, startY + lines.length * 88 + 60);
      x.globalAlpha = 1;
      x.strokeStyle = 'rgba(255,255,255,0.4)';
      x.lineWidth = 3;
      x.strokeRect(60, 60, w - 120, h - 120);
    }
    function paintBack(x: CanvasRenderingContext2D, w: number, h: number, o: { backBg: string; backInk: string }) {
      x.fillStyle = o.backBg;
      x.fillRect(0, 0, w, h);
      const ink = o.backInk;
      x.fillStyle = 'rgba(' + ink + ',.5)';
      rr(x, 150, 190, w - 460, 28, 14);
      x.fill();
      for (let i = 0; i < 9; i++) {
        const lw = i === 8 ? w - 560 : w - 300 - Math.random() * 180;
        x.fillStyle = 'rgba(' + ink + ',.2)';
        rr(x, 150, 300 + i * 56, lw, 15, 7);
        x.fill();
      }
      x.fillStyle = 'rgba(' + ink + ',.45)';
      x.beginPath();
      x.arc(178, h - 186, 26, 0, 6.2832);
      x.fill();
      x.fillStyle = '#fff';
      rr(x, w - 330, h - 262, 236, 152, 8);
      x.fill();
      x.fillStyle = '#111';
      let bx = w - 310;
      while (bx < w - 118) {
        const bw = 2 + Math.random() * 6;
        if (Math.random() > 0.42) x.fillRect(bx, h - 242, bw, 96);
        bx += bw + 2 + Math.random() * 4;
      }
      x.font = '500 21px Arial';
      x.textAlign = 'center';
      x.fillText('9 781234 567890', w - 212, h - 124);
      x.textAlign = 'left';
    }
    function paintSpine(
      x: CanvasRenderingContext2D,
      w: number,
      h: number,
      o: { spineBg: string; spineInk: string; spineFont: string; title: string; author: string },
    ) {
      x.fillStyle = o.spineBg;
      x.fillRect(0, 0, w, h);
      x.save();
      x.translate(w / 2, h / 2);
      x.rotate(Math.PI / 2);
      x.fillStyle = o.spineInk;
      x.font = o.spineFont;
      drawSpaced(x, o.title.toUpperCase(), -h * 0.1, 15, 6);
      x.globalAlpha = 0.85;
      x.font = '600 25px Arial';
      drawSpaced(x, o.author.toUpperCase(), h * 0.325, 9, 4);
      x.globalAlpha = 1;
      x.restore();
      x.fillStyle = o.spineInk;
      x.globalAlpha = 0.6;
      x.fillRect(w / 2 - 26, 92, 52, 3);
      x.fillRect(w / 2 - 26, h - 95, 52, 3);
      x.globalAlpha = 1;
    }
    const LEAVES = 4;
    const SEGS = 14;
    /** Cover angle when the book is held open (radians). */
    const OPEN_ANGLE = 2.35;
    // The cover/spine/pages geometry lives in lib/book3d/geometry.ts and is unit-tested.
    const coverGeo = new THREE.BoxGeometry(CW, CH, CT);
    coverGeo.translate(CW / 2, 0, 0); // hinge line at x = 0
    const hitGeo = new THREE.BoxGeometry(1.8, 2.5, 1.15);
    // Cover face aspect ratio for texture letterboxing
    const COVER_AR = CW / CH;
    const blobGeo = new THREE.PlaneGeometry(1, 1);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    function std(o: THREE.MeshStandardMaterialParameters) {
      return new THREE.MeshStandardMaterial(Object.assign({ metalness: 0.02 }, o));
    }
    const paperFlat = std({ color: 0xf1ecde, roughness: 0.85, envMapIntensity: 0.2 });
    const striMatV = std({ map: striV, bumpMap: striV, bumpScale: 0.0012, roughness: 0.85, envMapIntensity: 0.2 });
    const striMatH = std({ map: striH, bumpMap: striH, bumpScale: 0.0012, roughness: 0.85, envMapIntensity: 0.2 });
    const endpaperMat = std({ map: endpaperTex, roughness: 0.8, envMapIntensity: 0.25 });
    const unseenMat = new THREE.MeshBasicMaterial({ visible: false });

    type Leaf = {
      mesh: THREE.Mesh;
      geo: THREE.BufferGeometry;
      pos: Float32Array;
      /** 0 = resting on the block, 1 = turned onto the open front board. */
      f: Spring;
      /** Seconds to wait before this leaf starts moving (riffle stagger). */
      wait: number;
      frontTex: THREE.CanvasTexture;
      backTex: THREE.CanvasTexture;
      lastF: number;
      pendingT?: number;
    };
    type Book = {
      cfg: BookCfg;
      index: number;
      dims: BookDims;
      pivotZ: number;
      backPivotZ: number;
      root: THREE.Group;
      float: THREE.Group;
      shell: THREE.Group;
      pivot: THREE.Group;
      backPivot: THREE.Group;
      frontMesh: THREE.Mesh;
      spine: THREE.Mesh;
      block: THREE.Mesh;
      leaves: Leaf[];
      /** How many leaves are turned (0..LEAVES). */
      turned: number;
      lastAng: number;
      dirty: boolean;
      /** The reader asked for the book to be open (cover held at OPEN_ANGLE). */
      wantOpen: boolean;
      previewRequested: boolean;
      hit: THREE.Mesh;
      springs: Record<string, Spring>;
      phase: number;
      slotScale: number;
      hitEdge: number | null;
      scr: { x: number; y: number };
      orbY: number;
      orbYv: number;
      orbPhase: string;
      orbTarget: number;
      orbXs: Spring;
      orbRs: Spring;
      orbR: number;
      restT: number;
      blob: THREE.Mesh;
      coverDrag: boolean;
      dragAng: number;
      exit: { segs: any[]; i: number; t: number } | null;
    };
    const bookInstances: Book[] = [];
    const hitMeshes: THREE.Mesh[] = [];

    function makeLeaf(d: BookDims): Leaf {
      const { w, h } = leafSize(d);
      const n = SEGS + 1;
      const pos = new Float32Array(n * 4 * 3);
      const uv = new Float32Array(n * 4 * 2);
      const idx: number[] = [];
      for (let i = 0; i < n; i++) {
        const u = i / SEGS;
        uv.set([u, 1, u, 0], i * 4);
        uv.set([1 - u, 1, 1 - u, 0], (n + i) * 4);
      }
      const base = n * 2;
      for (let i = 0; i < SEGS; i++) {
        const a = 2 * i, b = 2 * i + 1, c = 2 * i + 2, e = 2 * i + 3;
        idx.push(a, b, c, b, e, c);
      }
      for (let i = 0; i < SEGS; i++) {
        const a = base + 2 * i, b = base + 2 * i + 1, c = base + 2 * i + 2, e = base + 2 * i + 3;
        idx.push(a, c, b, b, c, e);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.addGroup(0, SEGS * 6, 0);
      geo.addGroup(SEGS * 6, SEGS * 6, 1);
      const mk = () => {
        const c = mkCanvas(PAGE_W, PAGE_H);
        const x = c.getContext('2d')!;
        paintPaper(x);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        return t;
      };
      const frontTex = mk();
      const backTex = mk();
      const mesh = new THREE.Mesh(geo, [
        // The emissive map is the page itself, so paper stays bright and ink stays dark in any lighting.
        std({ map: frontTex, emissive: 0xffffff, emissiveMap: frontTex, emissiveIntensity: 0.3, roughness: 0.9, envMapIntensity: 0.2 }),
        std({ map: backTex, emissive: 0xffffff, emissiveMap: backTex, emissiveIntensity: 0.3, roughness: 0.9, envMapIntensity: 0.2 }),
      ]);
      mesh.frustumCulled = false;
      void w; void h;
      return { mesh, geo, pos, f: new Spring(0, 70, 11), wait: 0, frontTex, backTex, lastF: -1 };
    }
    /** Bend and place a leaf: turned by f of the cover angle, curled by how fast it moves. */
    function layoutLeaf(b: Book, k: number, ang: number, curl: number) {
      const L = b.leaves[k];
      const d = b.dims;
      const { w, h } = leafSize(d);
      const f = L.f.v;
      const [hx, zh] = leafHinge(d, k, f, ang);
      const psi = f * ang;
      const prof = leafProfile(w, SEGS, psi, curl);
      const n = prof.length;
      for (let i = 0; i < n; i++) {
        const x = hx + prof[i][0];
        const z = zh + prof[i][1];
        const o = i * 6;
        L.pos.set([x, h / 2, z, x, -h / 2, z], o);
        L.pos.set([x, h / 2, z, x, -h / 2, z], n * 6 + o);
      }
      L.geo.attributes.position.needsUpdate = true;
      L.geo.computeVertexNormals();
      // Leaves are only drawn once the book is open (or being opened).
      L.mesh.visible = ang > 0.002;
    }
    function repaintLeaves(b: Book, preview: string[] | null) {
      const plan = planFaces(LEAVES * 2, preview);
      const meta = { title: b.cfg.title, author: b.cfg.author };
      b.leaves.forEach((leaf, k) => {
        for (const [tex, face] of [[leaf.frontTex, plan[2 * k]], [leaf.backTex, plan[2 * k + 1]]] as const) {
          const cv = tex.image as HTMLCanvasElement;
          paintFace(cv.getContext('2d')!, face, meta);
          tex.needsUpdate = true;
        }
      });
    }

    function buildBook(cfg: BookCfg, index: number): Book {
      const root = new THREE.Group();
      const float = new THREE.Group();
      root.add(float);
      bookRoot.add(root);
      // Everything is built in book space (spine/board meeting plane at x = 0);
      // the shell centres the closed book on the slot.
      const shell = new THREE.Group();
      shell.position.x = -CW / 2;
      float.add(shell);

      const d = bookDims(cfg.pageCount, LEAVES);
      const T = d.T;
      const PIVOT_Z = frontPivotZ(d);
      const BPIVOT_Z = backPivotZ(d);

      const indexless = null;
      void indexless;
      const edgeColor = cfg.spineBg ?? cfg.backBg ?? cfg.edge ?? '#2a2d36';
      const mEdge = std({ color: edgeColor, bumpMap: laminateBump, bumpScale: 0.0015, roughness: 0.5, envMapIntensity: 0.32 });
      const mFront = std({ bumpMap: laminateBump, bumpScale: 0.0012, roughness: 0.4, envMapIntensity: 0.3 });
      const mBack = std({ bumpMap: laminateBump, bumpScale: 0.0012, roughness: 0.42, envMapIntensity: 0.28 });
      const mSpine = std({ bumpMap: clothBump, bumpScale: 0.0025, roughness: 0.55, envMapIntensity: 0.26 });
      loadOrPaint(mFront, cfg.images?.front ?? cfg.coverURL ?? null, () => {
        const c = mkCanvas(COVER_W, COVER_H);
        const ctx = c.getContext('2d')!;
        if (cfg.front) cfg.front(ctx, COVER_W, COVER_H);
        else paintDefaultFront(ctx, COVER_W, COVER_H, { title: cfg.title, author: cfg.author, bg: cfg.spineBg ?? cfg.backBg ?? '#22252b' });
        return c;
      }, COVER_AR);
      loadOrPaint(mBack, cfg.images?.back ?? null, () => {
        const c = mkCanvas(COVER_W, COVER_H);
        const ctx = c.getContext('2d')!;
        if (cfg.back) cfg.back(ctx, COVER_W, COVER_H);
        else paintBack(ctx, COVER_W, COVER_H, { backBg: cfg.backBg ?? '#22252b', backInk: cfg.backInk ?? '255,255,255' });
        return c;
      }, COVER_AR);
      // The spine's outer face is (T + 2 boards) deep and CH high; the canvas keeps that aspect ratio.
      const spineCanvasW = Math.max(64, Math.round((COVER_H * (T + CT * 2)) / CH));
      loadOrPaint(mSpine, cfg.images?.spine ?? null, () => {
        const sw = spineCanvasW;
        const c = mkCanvas(sw, COVER_H);
        const ctx = c.getContext('2d')!;
        if (cfg.spine) cfg.spine(ctx, sw, COVER_H);
        else
          paintSpine(ctx, sw, COVER_H, {
            spineBg: cfg.spineBg ?? cfg.backBg ?? '#22252b',
            spineInk: cfg.spineInk ?? '#ffffff',
            spineFont: cfg.spineFont ?? '700 42px Georgia',
            title: cfg.title,
            author: cfg.author,
          });
        return c;
      });

      const backPivot = new THREE.Group();
      backPivot.position.set(0, 0, BPIVOT_Z);
      const backMesh = new THREE.Mesh(coverGeo, [mEdge, mEdge, mEdge, mEdge, endpaperMat, mBack]);
      backMesh.castShadow = backMesh.receiveShadow = true;
      backPivot.add(backMesh);
      shell.add(backPivot);
      const pivot = new THREE.Group();
      pivot.position.set(0, 0, PIVOT_Z);
      const frontMesh = new THREE.Mesh(coverGeo, [mEdge, mEdge, mEdge, mEdge, mFront, endpaperMat]);
      frontMesh.castShadow = frontMesh.receiveShadow = true;
      pivot.add(frontMesh);
      shell.add(pivot);

      const sb = spineBox(d);
      const spineGeo = new THREE.BoxGeometry(sb.max[0] - sb.min[0], sb.max[1] - sb.min[1], sb.max[2] - sb.min[2]);
      // Only the outer (-x) face carries the spine artwork; the rest is cover colour.
      const spine = new THREE.Mesh(spineGeo, [mEdge, mSpine, mEdge, mEdge, mEdge, mEdge]);
      spine.position.set((sb.min[0] + sb.max[0]) / 2, 0, (sb.min[2] + sb.max[2]) / 2);
      spine.castShadow = true;
      shell.add(spine);

      // Page block: inset from the boards; its front face is not drawn (the leaves
      // cover it), an end page sits under the last leaf.
      const bb = blockBox(d);
      const blockGeo = new THREE.BoxGeometry(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
      const block = new THREE.Mesh(blockGeo, [striMatV, paperFlat, striMatH, striMatH, unseenMat, paperFlat]);
      block.position.set((bb.min[0] + bb.max[0]) / 2, 0, (bb.min[2] + bb.max[2]) / 2);
      block.castShadow = block.receiveShadow = true;
      shell.add(block);
      const { w: lw, h: lh } = leafSize(d);
      const endPage = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), std({ color: 0xf1ecde, roughness: 0.9, envMapIntensity: 0.2 }));
      endPage.position.set(GAP + lw / 2, 0, endPageZ(d));
      shell.add(endPage);

      const leaves: Leaf[] = [];
      for (let k = 0; k < LEAVES; k++) {
        const leaf = makeLeaf(d);
        shell.add(leaf.mesh);
        leaves.push(leaf);
      }

      const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: blobOpacity(), depthWrite: false });
      blobMats.push(blobMat);
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.scale.set(3.1, 3.9, 1);
      blob.position.set(0.1, -0.3, -0.85);
      blob.renderOrder = -5;
      root.add(blob);
      const hit = new THREE.Mesh(hitGeo, hitMat);
      float.add(hit);
      const springs: Record<string, Spring> = {
        px: new Spring(0, 17, 6.8),
        py: new Spring(0, 17, 6.8),
        pz: new Spring(0, 17, 6.8),
        rx: new Spring(0, 17, 6.8),
        ry: new Spring(0, 17, 6.8),
        rz: new Spring(0, 17, 6.8),
        sc: new Spring(1, 17, 6.8),
        tiltX: new Spring(0, 120, 13),
        tiltY: new Spring(0, 120, 13),
        lift: new Spring(0, 120, 13),
        cover: new Spring(0, 90, 12),
        coverB: new Spring(0, 90, 12),
        drag: new Spring(0, 160, 16),
        visY: new Spring(0, 150, 17),
        visX: new Spring(0, 150, 17),
        visR: new Spring(0, 150, 17),
      };
      const b: Book = {
        cfg,
        index,
        dims: d,
        pivotZ: PIVOT_Z,
        backPivotZ: BPIVOT_Z,
        root,
        float,
        shell,
        pivot,
        backPivot,
        frontMesh,
        spine,
        block,
        leaves,
        turned: 0,
        lastAng: -1,
        dirty: true,
        wantOpen: false,
        previewRequested: false,
        hit,
        springs,
        phase: Math.random() * 6.28,
        slotScale: 1,
        hitEdge: null,
        scr: { x: 0, y: 0 },
        orbY: 0,
        orbYv: 0,
        orbPhase: 'idle',
        orbTarget: 0,
        orbXs: new Spring(0, 60, 12),
        orbRs: new Spring(0, 16, 8),
        orbR: 0,
        restT: 0,
        blob,
        coverDrag: false,
        dragAng: 0,
        exit: null,
      };
      repaintLeaves(b, null);
      bookInstances[index] = b;
      return b;
    }
    function ensureBook(index: number) {
      if (index < 0) return undefined;
      if (bookInstances[index]) return bookInstances[index];
      const cfg = listNow()[index];
      if (!cfg) return undefined;
      const b = buildBook(cfg, index);
      b.root.visible = false;
      return b;
    }
    const bookByHit = (m: THREE.Object3D) => bookInstances.find((b) => b && b.hit === m)!;

    const state: {
      mode: 'hero' | 'opening' | 'detail' | 'closing';
      selected: Book | null;
      hovered: Book | null;
    } = { mode: 'hero', selected: null, hovered: null };
    type Slot = { p: [number, number, number]; r: [number, number, number]; s: number };
    const SLOTS: { hero: Slot[]; detail: Slot | null; portrait: boolean; openMul: number } = { hero: [], detail: null, portrait: false, openMul: 0.82 };
    const observedPanel = new Set<Element>();
    let roPanel: ResizeObserver | null = null;
    let lastLayout = '';
    function pushLayout(l: { phone: boolean; toolTop: number; toolX: number; panelTop: number; wrapMin: number }) {
      const key = [l.phone, Math.round(l.toolTop), Math.round(l.toolX), Math.round(l.panelTop), Math.round(l.wrapMin)].join();
      if (key === lastLayout) return;
      lastLayout = key;
      setLayout(l);
    }

    function computeSlots() {
      const a = dims.w / Math.max(1, dims.h);
      // Same breakpoint as the panel's own layout (container width 760px).
      const portrait = dims.w <= 760;
      const fit = portrait ? clamp(a / 1.08, 0.38, 0.74) : clamp(a / 1.62, 0.52, 1);
      bookRoot.scale.setScalar(fit);
      bookRoot.position.y = -(1 - fit) * 0.28;
      SLOTS.portrait = portrait;
      SLOTS.hero = [
        { p: [-2.05, -0.58, -0.12], r: [-0.045, 0.4, 0.185], s: 1.22 },
        { p: [0.25, -0.36, 0.6], r: [-0.05, -0.1, -0.035], s: 1.32 },
        { p: [2.35, -0.64, -0.34], r: [-0.045, -0.42, -0.17], s: 1.22 },
      ];
      if (!showDetailPanel) {
        SLOTS.detail = { p: [0, -0.05, 0.75], r: [0.02, -0.34, 0.05], s: SLOTS.portrait ? 0.94 : 1.08 };
        return;
      }
      // Place the book to fill its own area; the toolbar sits under it, never over it.
      const fitAreaPx = (areaW: number, areaH: number, camZp: number, zw: number) =>
        fitArea({ viewH: dims.h, areaW, areaH, camZ: camZp, zw, phone: SLOTS.portrait });
      const zw = 0.8 * fit;
      const rootY = -(1 - fit) * 0.28;
      if (SLOTS.portrait) {
        const top = PHONE_TOP;
        const el = dpRef.current;
        const inner = el?.firstElementChild as HTMLElement | null;
        if (inner && !observedPanel.has(inner)) {
          observedPanel.add(inner);
          roPanel?.observe(inner);
        }
        // Height the panel's own content needs (not the box it sits in).
        let need = dims.h * 0.45;
        if (inner && inner.firstElementChild && inner.lastElementChild) {
          const h = inner.lastElementChild.getBoundingClientRect().bottom - inner.firstElementChild.getBoundingClientRect().top;
          if (h > 40) need = h + 8;
        }
        const bookH = phoneBookHeight(dims.h, need);
        const areaBottom = top + bookH;
        const camZp = 10.4;
        const { ppu, S, mul } = fitAreaPx(dims.w - 24, bookH, camZp, zw);
        SLOTS.openMul = mul;
        const yPx = (top + areaBottom) / 2;
        const yw = 0.1 + (dims.h / 2 - yPx) / ppu;
        SLOTS.detail = { p: [0, (yw - rootY) / fit, 0.8], r: [-0.02, -0.4, 0.06], s: S / fit };
        const toolTop = areaBottom + 4;
        const panelTop = toolTop + TOOL_H + 4;
        pushLayout({ phone: true, toolTop, toolX: dims.w / 2, panelTop, wrapMin: Math.ceil(panelTop + need + HINT_H) });
      } else {
        const panelLeft = dims.w * 0.95 - Math.min(520, dims.w * 0.4);
        const left = 16;
        const right = Math.max(left + 200, panelLeft - 24);
        const top = 84;
        const areaBottom = Math.max(top + 200, dims.h - 24 - TOOL_H);
        const camZp = 9.6;
        const { ppu, S, mul } = fitAreaPx(right - left, areaBottom - top, camZp, zw);
        SLOTS.openMul = mul;
        const cx = (left + right) / 2;
        const cy = (top + areaBottom) / 2;
        const xw = -0.3 + (cx - dims.w / 2) / ppu;
        const yw = 0.12 + (dims.h / 2 - cy) / ppu;
        SLOTS.detail = { p: [xw / fit, (yw - rootY) / fit, 0.85], r: [0.02, -0.44, 0.08], s: clamp(S / fit, 0.6, 2.2) };
        pushLayout({ phone: false, toolTop: areaBottom + 8, toolX: cx, panelTop: 0, wrapMin: 0 });
      }
    }
    function setTargets(b: Book, slot: Slot) {
      const s = b.springs;
      s.px.t = slot.p[0];
      s.py.t = slot.p[1];
      s.pz.t = slot.p[2];
      s.rx.t = slot.r[0];
      s.ry.t = slot.r[1];
      s.rz.t = slot.r[2];
      b.slotScale = slot.s;
    }
    function applyMode() {
      if (state.selected && SLOTS.detail) setTargets(state.selected, SLOTS.detail);
    }

    const camX = new Spring(0, 13, 6.5),
      camY = new Spring(0.1, 13, 6.5),
      camZ = new Spring(9.6, 13, 6.5);
    const lookX = new Spring(0, 13, 6.5),
      lookY = new Spring(0, 13, 6.5);
    const parX = new Spring(0, 60, 10),
      parY = new Spring(0, 60, 10);
    function camTo(mode: string) {
      if (mode === 'detail') {
        camX.t = SLOTS.portrait ? 0 : -0.25;
        camZ.t = SLOTS.portrait ? 10.4 : 9.6;
        lookX.t = SLOTS.portrait ? 0 : -0.35;
        lookY.t = SLOTS.portrait ? 0 : 0.15;
      } else {
        camX.t = 0;
        camZ.t = 9.6;
        lookX.t = 0;
        lookY.t = 0;
      }
    }

    /** Turn leaves so that `n` of them lie on the open board. `stagger` seconds between leaves. */
    function turnTo(b: Book, n: number, stagger: number) {
      const to = clamp(n, 0, LEAVES);
      const from = b.turned;
      if (to === from) return;
      for (let k = 0; k < LEAVES; k++) {
        const L = b.leaves[k];
        const target = k < to ? 1 : 0;
        if (target === (k < from ? 1 : 0) && L.pendingT === undefined) continue;
        const order = to > from ? k - from : from - 1 - k;
        L.pendingT = target;
        L.wait = RM ? 0 : Math.max(0, order) * stagger;
      }
      b.turned = to;
      setPageInfo({ turned: to, leaves: LEAVES });
    }
    function setBookOpen(b: Book, want: boolean) {
      if (b.wantOpen === want) return;
      b.wantOpen = want;
      setLookInside(want);
      if (want && !b.previewRequested) {
        b.previewRequested = true;
        loadPreviewPages(b.cfg.id).then((pages) => {
          if (cancelled || !pages) return;
          repaintLeaves(b, pages);
          b.dirty = true;
        });
      }
      if (!want) turnTo(b, 0, 0.04);
    }
    function toggleLook() {
      if (state.mode === 'detail' && state.selected) setBookOpen(state.selected, !state.selected.wantOpen);
    }
    function turnPage(delta: number) {
      const b = state.selected;
      if (!b || state.mode !== 'detail') return;
      if (!b.wantOpen) {
        if (delta > 0) setBookOpen(b, true);
        return;
      }
      turnTo(b, b.turned + delta, 0.07);
    }

    function open(book: Book | null) {
      if (!book) return;
      if (state.selected === book && (state.mode === 'opening' || state.mode === 'detail')) return;
      const switching = state.mode === 'detail' || state.mode === 'opening' || state.mode === 'closing';
      if (switching && state.selected && state.selected !== book) {
        const prev = state.selected;
        prev.root.visible = false;
        prev.orbTarget = Math.round(prev.orbY / 6.2832) * 6.2832 + 6.2832;
        prev.orbYv = Math.max(prev.orbYv, 3);
        prev.orbPhase = 'return';
        prev.orbXs.t = Math.round(prev.orbXs.v / 6.2832) * 6.2832;
        prev.orbRs.t = Math.round(prev.orbRs.v / 6.2832) * 6.2832;
      }
      state.mode = 'opening';
      setUiMode('opening');
      book.wantOpen = false;
      book.turned = 0;
      for (const L of book.leaves) { L.f.set(0); L.pendingT = undefined; }
      book.dirty = true;
      setLookInside(false);
      setPageInfo({ turned: 0, leaves: LEAVES });
      state.selected = book;
      book.exit = null;
      root!.classList.add('bs-transit');
      setSelectedCfg(book.cfg);
      onBookSelectRef.current?.(book.cfg);
      computeSlots();
      // The detail panel's real height depends on this book's title/description,
      // which React hasn't painted yet at this point (setSelectedCfg is async).
      // Re-measure once the browser has actually laid out the new text so the
      // book doesn't get stuck at a slot computed from stale panel dimensions.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (state.selected !== book || (state.mode !== 'opening' && state.mode !== 'detail')) return;
          computeSlots();
          applyMode();
        });
      });
      setT(() => {
        if (state.mode !== 'opening' && state.mode !== 'detail') return;
        book.orbY = RM ? 0 : -6.2832;
        book.orbYv = RM ? 0 : 3;
        book.orbPhase = 'return';
        book.orbTarget = 0;
        book.orbXs.set(0);
        book.orbRs.set(0);
        book.orbR = 0;
        applyMode();
        camTo('detail');
      }, switching ? 0 : 200);
      setT(() => {
        if (state.mode === 'opening') {
          root!.classList.add('bs-detail-open');
          state.mode = 'detail';
          setUiMode('detail');
        }
      }, switching ? 350 : 700);
    }
    function close() {
      if (state.mode !== 'detail') return;
      state.mode = 'closing';
      setUiMode('closing');
      root!.classList.remove('bs-detail-open');
      onBookSelectRef.current?.(null);
      orbit.drag = false;
      const b = state.selected;
      if (b) {
        setBookOpen(b, false);
        b.orbTarget = Math.round(b.orbY / 6.2832) * 6.2832 + 6.2832;
        b.orbYv = Math.max(b.orbYv, 3);
        b.orbPhase = 'return';
        b.orbXs.t = Math.round(b.orbXs.v / 6.2832) * 6.2832;
        b.orbRs.t = Math.round(b.orbRs.v / 6.2832) * 6.2832;
      }
      setT(() => {
        root!.classList.remove('bs-transit');
        camTo('hero');
      }, 250);
      setT(() => {
        if (state.mode === 'closing') {
          state.mode = 'hero';
          setUiMode('hero');
          if (b) b.root.visible = false;
          state.selected = null;
          setSelectedCfg(null);
        }
      }, 900);
    }

    const ptr = {
      ndcX: 0,
      ndcY: 0,
      cx: 0,
      cy: 0,
      lastX: 0,
      lastY: 0,
      downX: 0,
      downY: 0,
      down: false,
      type: 'mouse',
      seen: false,
      id: null as number | null,
      pendingTouchRotate: false,
    };
    let rayBook: Book | null = null;
    const orbit = { drag: false, dxAcc: 0, dyAcc: 0, rAcc: 0, roll: false };
    const ray = new THREE.Raycaster();
    const tmpV = new THREE.Vector3();
    const canvas = canvasEl;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    const localXY = (e: PointerEvent) => {
      const r = root!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    // What the pointer grabbed: the cover's fore-edge, or a page (turn it by dragging).
    type Grab = { kind: 'cover'; startAng: number } | { kind: 'page'; dir: 1 | -1 };
    let grab: Grab | null = null;
    const samples: { t: number; x: number }[] = [];
    let lastTap = { t: 0, x: 0, y: 0 };
    const two = { id: null as number | null, x: 0, y: 0, ang: 0 };
    const frontLocal = new THREE.Vector3();

    function pickGrab(b: Book): Grab | null {
      ray.setFromCamera({ x: ptr.ndcX, y: ptr.ndcY } as THREE.Vector2, camera);
      const objs: THREE.Object3D[] = [b.frontMesh, ...b.leaves.filter((l) => l.mesh.visible).map((l) => l.mesh)];
      const hits = ray.intersectObjects(objs, false);
      if (!hits.length) return null;
      const h = hits[0];
      if (h.object === b.frontMesh) {
        frontLocal.copy(h.point);
        b.frontMesh.worldToLocal(frontLocal);
        return frontLocal.x > CW * 0.62 ? { kind: 'cover', startAng: b.springs.cover.v } : null;
      }
      const k = b.leaves.findIndex((l) => l.mesh === h.object);
      if (k < 0 || !b.wantOpen) return null;
      return { kind: 'page', dir: k < b.turned ? -1 : 1 };
    }
    function pointerSpeed() {
      // Screen widths per second over the last ~120 ms, positive = moving right.
      const n = samples.length;
      if (n < 2) return 0;
      const a0 = samples[0];
      const a1 = samples[n - 1];
      const dtS = Math.max(0.016, (a1.t - a0.t) / 1000);
      return (a1.x - a0.x) / dtS / Math.max(1, dims.w);
    }
    function pushSample(x: number) {
      const now = performance.now();
      samples.push({ t: now, x });
      while (samples.length > 2 && now - samples[0].t > 120) samples.shift();
    }
    function updateGrab(cx: number) {
      const b = state.selected;
      if (!b || !grab) return;
      const dxN = (cx - ptr.downX) / Math.max(1, dims.w);
      if (grab.kind === 'cover') {
        b.dragAng = clamp(grab.startAng - dxN * 6, 0, OPEN_ANGLE + 0.25);
      } else {
        const idx = grab.dir > 0 ? b.turned : b.turned - 1;
        const L = b.leaves[idx];
        if (!L) return;
        const pr = clamp(-grab.dir * dxN * 5, 0, 1);
        L.pendingT = undefined;
        L.f.t = grab.dir > 0 ? pr : 1 - pr;
      }
    }
    function endGrab() {
      const b = state.selected;
      const g = grab;
      grab = null;
      if (!b || !g) return;
      if (g.kind === 'cover') {
        b.coverDrag = false;
        // Past the threshold it opens; released early it springs back shut.
        setBookOpen(b, b.dragAng > OPEN_ANGLE * 0.4);
        b.dirty = true;
        return;
      }
      const idx = g.dir > 0 ? b.turned : b.turned - 1;
      const L = b.leaves[idx];
      if (!L) return;
      const pr = g.dir > 0 ? L.f.t : 1 - L.f.t;
      const flick = (-g.dir * pointerSpeed()); // > 0 = moving the way the page turns
      if (pr > 0.35 || flick > 1.2) {
        const avail = g.dir > 0 ? LEAVES - b.turned : b.turned;
        const n = !RM && flick > 2.6 ? clamp(2 + Math.floor(flick - 2.6), 2, avail) : 1; // a hard flick riffles several
        turnTo(b, b.turned + g.dir * n, n > 1 ? 0.06 : 0);
      } else {
        L.f.t = g.dir > 0 ? 0 : 1; // spring back
      }
    }
    function resetView(b: Book) {
      b.orbTarget = Math.round(b.orbY / TAU_) * TAU_;
      b.orbXs.t = Math.round(b.orbXs.v / TAU_) * TAU_;
      b.orbRs.t = Math.round(b.orbRs.v / TAU_) * TAU_;
      b.orbPhase = 'return';
      b.orbYv = Math.max(-6, Math.min(6, b.orbYv));
    }

    const onPointerMove = (e: PointerEvent) => {
      if (two.id === e.pointerId) {
        two.x = e.clientX;
        two.y = e.clientY;
        const rect = root!.getBoundingClientRect();
        const ang = Math.atan2(two.y - (ptr.cy + rect.top), two.x - (ptr.cx + rect.left));
        let dA = ang - two.ang;
        if (dA > Math.PI) dA -= TAU_;
        if (dA < -Math.PI) dA += TAU_;
        two.ang = ang;
        orbit.drag = true;
        orbit.rAcc += dA;
        e.preventDefault();
        return;
      }
      if (ptr.id !== null && e.pointerId !== ptr.id) return;
      const { x: cx, y: cy } = localXY(e);
      ptr.type = e.pointerType || 'mouse';
      ptr.seen = true;
      if (ptr.pendingTouchRotate) {
        // Touch-and-hold on the book: don't commit to rotate vs. scroll
        // until the gesture clearly leans one way, so a scroll-down drag
        // that starts on the book isn't hijacked into a spin.
        const totalDx = cx - ptr.downX;
        const totalDy = cy - ptr.downY;
        if (Math.abs(totalDx) + Math.abs(totalDy) > 6) {
          ptr.pendingTouchRotate = false;
          if (Math.abs(totalDx) > Math.abs(totalDy) * 1.15) {
            ptr.lastX = cx;
            ptr.lastY = cy;
            ptr.down = true;
            orbit.drag = true;
            orbit.roll = false;
            orbit.dxAcc = 0;
            orbit.dyAcc = 0;
            canvas.setPointerCapture(e.pointerId);
            // We've committed to a rotate gesture — stop the browser's
            // native pan-y from also claiming this touch, or the spin
            // intermittently loses the drag to a page scroll.
            e.preventDefault();
          } else {
            // Vertical drag over the book — let it scroll the page instead.
            ptr.id = null;
          }
        }
        ptr.cx = cx;
        ptr.cy = cy;
        ptr.ndcX = (cx / dims.w) * 2 - 1;
        ptr.ndcY = -(cy / dims.h) * 2 + 1;
        return;
      }
      const dxN = (cx - ptr.lastX) / dims.w;
      const dyN = (cy - ptr.lastY) / dims.h;
      ptr.lastX = cx;
      ptr.lastY = cy;
      ptr.cx = cx;
      ptr.cy = cy;
      ptr.ndcX = (cx / dims.w) * 2 - 1;
      ptr.ndcY = -(cy / dims.h) * 2 + 1;
      if (ptr.down && grab) {
        pushSample(cx);
        updateGrab(cx);
        if (ptr.type === 'touch') e.preventDefault();
        return;
      }
      if (ptr.down && orbit.drag) {
        orbit.dxAcc += dxN;
        orbit.dyAcc += dyN;
        pushSample(cx);
        if (ptr.type === 'touch') e.preventDefault();
      }
    };
    canvas.addEventListener('pointermove', onPointerMove);
    const onPointerDown = (e: PointerEvent) => {
      if (ptr.id !== null) {
        // Second finger on the book: twist to roll it.
        if (e.pointerType === 'touch' && two.id === null && (ptr.down || ptr.pendingTouchRotate) && state.mode === 'detail') {
          two.id = e.pointerId;
          two.x = e.clientX;
          two.y = e.clientY;
          const rect = root!.getBoundingClientRect();
          two.ang = Math.atan2(two.y - (ptr.cy + rect.top), two.x - (ptr.cx + rect.left));
          ptr.pendingTouchRotate = false;
          ptr.down = true;
          orbit.drag = true;
          orbit.roll = false;
          try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        }
        return;
      }
      root.focus({ preventScroll: true });
      ptr.id = e.pointerId;
      const { x: cx, y: cy } = localXY(e);
      ptr.cx = cx;
      ptr.cy = cy;
      ptr.lastX = cx;
      ptr.lastY = cy;
      ptr.downX = cx;
      ptr.downY = cy;
      ptr.ndcX = (cx / dims.w) * 2 - 1;
      ptr.ndcY = -(cy / dims.h) * 2 + 1;
      ptr.type = e.pointerType || 'mouse';
      ptr.seen = true;
      ptr.pendingTouchRotate = false;
      samples.length = 0;
      pushSample(cx);
      castRay();
      if (state.mode === 'detail' && rayBook === state.selected) {
        const b = state.selected!;
        const g = pickGrab(b);
        if (g) {
          grab = g;
          ptr.down = true;
          canvas.setPointerCapture(e.pointerId);
          if (g.kind === 'cover') {
            b.coverDrag = true;
            b.dragAng = g.startAng;
          }
        } else if (ptr.type === 'touch') {
          ptr.pendingTouchRotate = true;
        } else {
          ptr.down = true;
          orbit.drag = true;
          orbit.roll = e.altKey || e.shiftKey || e.ctrlKey || e.metaKey;
          orbit.dxAcc = 0;
          orbit.dyAcc = 0;
          canvas.setPointerCapture(e.pointerId);
        }
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    const onPointerUp = (e: PointerEvent) => {
      if (two.id === e.pointerId) {
        two.id = null;
        return;
      }
      if (ptr.id !== null && e.pointerId !== ptr.id) return;
      const wasDown = ptr.down || ptr.pendingTouchRotate;
      const moved = Math.hypot(ptr.cx - ptr.downX, ptr.cy - ptr.downY);
      const b = state.selected;
      if (grab) endGrab();
      else if (b && state.mode === 'detail' && orbit.drag && !RM && b.wantOpen && Math.abs(b.orbYv) > 8 && moved > 30) {
        // A hard flick of the open book riffles the pages the way it was thrown.
        turnTo(b, b.turned + (b.orbYv < 0 ? 1 : -1) * 3, 0.06);
      }
      if (wasDown && b && state.mode === 'detail' && moved < 8) {
        const now = performance.now();
        if (now - lastTap.t < 330 && Math.hypot(ptr.cx - lastTap.x, ptr.cy - lastTap.y) < 30) {
          resetView(b); // double-tap / double-click: back to the front view
          lastTap = { t: 0, x: 0, y: 0 };
        } else {
          lastTap = { t: now, x: ptr.cx, y: ptr.cy };
        }
      }
      ptr.id = null;
      ptr.pendingTouchRotate = false;
      orbit.drag = false;
      orbit.roll = false;
      ptr.down = false;
    };
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      const b = state.selected;
      const onRoot = e.target === root;
      if (!b || state.mode !== 'detail') return;
      if (e.key === 'Enter' && onRoot) { e.preventDefault(); toggleLook(); }
      else if (e.key === 'PageDown') { e.preventDefault(); turnPage(1); }
      else if (e.key === 'PageUp') { e.preventDefault(); turnPage(-1); }
      else if (onRoot && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); resetView(b); }
      else if (onRoot && e.key.startsWith('Arrow')) {
        // Arrow keys spin the book (a push with inertia).
        e.preventDefault();
        b.orbPhase = 'spin';
        b.orbXs.k = 0;
        b.orbXs.d = 2.6;
        if (e.key === 'ArrowLeft') b.orbYv -= 3.2;
        else if (e.key === 'ArrowRight') b.orbYv += 3.2;
        else if (e.key === 'ArrowUp') b.orbXs.vel -= 2.2;
        else b.orbXs.vel += 2.2;
      }
    };
    root.addEventListener('keydown', onKeydown);
    function castRay() {
      ray.setFromCamera({ x: ptr.ndcX, y: ptr.ndcY } as THREE.Vector2, camera);
      const hits = ray.intersectObjects(hitMeshes, false);
      rayBook = hits.length ? bookByHit(hits[0].object) : null;
    }

    const timer = new THREE.Timer();
    timer.connect(document);
    const idle = RM ? 0 : 1;
    const DETAIL_OPEN_SWAY = 0.035;
    function screenPos(b: Book) {
      b.root.getWorldPosition(tmpV).project(camera);
      b.scr.x = (tmpV.x * 0.5 + 0.5) * dims.w;
      b.scr.y = (-tmpV.y * 0.5 + 0.5) * dims.h;
    }
    const TAU_ = Math.PI * 2;
    let rotatedFlag = false;
    const dbg = { hold: false, x: 0, r: 0 };
    function tickBook(b: Book, dt: number, t: number) {
      const s = b.springs;
      const inDetail = state.mode === 'detail' && state.selected === b;
      const orbitActive = state.selected === b && state.mode !== 'hero';
      let activity = 0;
      if (orbitActive) {
        const xs = b.orbXs;
        const rs = b.orbRs;
        if (orbit.drag && inDetail) {
          // Free spin about both axes while dragging (Alt/Shift/Ctrl-drag or a two-finger twist rolls).
          if (orbit.roll) {
            b.orbR += orbit.dxAcc * 5;
            rs.v = b.orbR;
          } else {
            const stepY = orbit.dxAcc * 6.5;
            const stepX = orbit.dyAcc * 5;
            b.orbY += stepY;
            xs.v += stepX;
            b.orbYv = clamp(b.orbYv * 0.5 + (stepY / Math.max(dt, 0.001)) * 0.5, -16, 16);
            xs.vel = clamp(xs.vel * 0.5 + (stepX / Math.max(dt, 0.001)) * 0.5, -12, 12);
          }
          b.orbR += orbit.rAcc;
          orbit.dxAcc = orbit.dyAcc = orbit.rAcc = 0;
          xs.k = 0;
          xs.d = 2.6;
          xs.t = xs.v;
          rs.t = b.orbR;
          b.orbPhase = 'drag';
          b.restT = 0;
        } else if (b.orbPhase === 'return') {
          // Back to the front view (intro, closing, reset): the nearest upright, front-facing pose.
          const acc = 16 * (b.orbTarget - b.orbY) - 8 * b.orbYv;
          b.orbYv += acc * dt;
          b.orbY += b.orbYv * dt;
          xs.k = 16;
          xs.d = 8;
          rs.k = 16;
          rs.d = 8;
          xs.update(dt);
          rs.update(dt);
          b.orbR = rs.v;
          if (Math.abs(b.orbTarget - b.orbY) < 0.002 && Math.abs(b.orbYv) < 0.01 && Math.abs(xs.t - xs.v) < 0.003 && Math.abs(rs.t - rs.v) < 0.003) {
            b.orbY = b.orbTarget;
            b.orbYv = 0;
            xs.set(xs.t);
            rs.set(rs.t);
            b.orbR = rs.v;
            b.orbPhase = 'idle';
          }
        } else {
          if (b.orbPhase === 'drag') {
            b.orbPhase = Math.abs(b.orbYv) > 0.15 || Math.abs(xs.vel) > 0.15 ? 'spin' : 'rest';
            if (b.orbPhase === 'rest') b.restT = 0;
            if (xs.k !== 0) { xs.k = 0; xs.d = 2.6; }
          }
          if (b.orbPhase === 'spin') {
            // Weighty inertia: the spin coasts and slows; pitch settles faster than yaw.
            b.orbYv *= Math.exp(-1.7 * dt);
            b.orbY += b.orbYv * dt;
            xs.update(dt);
            xs.d = 2.6;
            rs.t = rs.v;
            if (Math.abs(b.orbYv) < 0.15 && Math.abs(xs.vel) < 0.15) {
              b.orbYv = 0;
              xs.vel = 0;
              b.orbPhase = 'rest';
              b.restT = 0;
            }
          } else if (b.orbPhase === 'rest' || b.orbPhase === 'settle') {
            b.restT += dt;
            if (b.orbPhase === 'rest' && b.restT > 0.9) {
              // Never stay upside down: if the book came to rest tipped past the horizontal, ease it upright.
              const upside = Math.cos(xs.v) < 0;
              xs.k = 16;
              xs.d = 8;
              xs.t = upside ? Math.round(xs.v / TAU_) * TAU_ : xs.v;
              rs.k = 16;
              rs.d = 8;
              rs.t = Math.round(rs.v / TAU_) * TAU_;
              b.orbPhase = 'settle';
            }
            if (b.orbPhase === 'settle') {
              xs.update(dt);
              rs.update(dt);
              b.orbR = rs.v;
              if (Math.abs(xs.t - xs.v) < 0.003 && Math.abs(rs.t - rs.v) < 0.003 && Math.abs(xs.vel) < 0.02) b.orbPhase = 'idle';
            }
          }
        }
        const distRest = Math.abs(b.orbY - Math.round(b.orbY / TAU_) * TAU_) + Math.abs(xs.v - Math.round(xs.v / TAU_) * TAU_) + Math.abs(b.orbR - Math.round(b.orbR / TAU_) * TAU_);
        const rotatedNow = distRest > 0.06;
        if (rotatedNow !== rotatedFlag) {
          rotatedFlag = rotatedNow;
          setViewRotated(rotatedNow);
        }
        activity = clamp(Math.abs(b.orbYv) * 1.5 + (orbit.drag ? 1 : 0) + distRest * 2, 0, 1);
      }
      if (dbg.hold) {
        b.orbXs.k = 0;
        b.orbXs.d = 0;
        b.orbXs.set(dbg.x);
        b.orbRs.set(dbg.r);
        b.orbR = dbg.r;
      }
      // The book rests CLOSED; it is only open while the reader has opened it.
      const coverBase = inDetail && b.wantOpen ? OPEN_ANGLE + Math.sin(t * 0.8 + b.phase) * DETAIL_OPEN_SWAY * idle : 0;
      s.tiltY.t = 0;
      s.tiltX.t = 0;
      s.lift.t = 0;
      s.cover.t = b.coverDrag ? b.dragAng : coverBase;
      s.coverB.t = 0;
      s.sc.t = b.slotScale;
      s.px.update(dt);
      s.py.update(dt);
      s.pz.update(dt);
      s.rx.update(dt);
      s.ry.update(dt);
      s.rz.update(dt);
      s.sc.update(dt);
      s.tiltX.update(dt);
      s.tiltY.update(dt);
      s.lift.update(dt);
      s.cover.update(dt);
      s.coverB.update(dt);
      s.drag.update(dt);
      b.float.position.y = dbg.hold ? 0 : Math.sin(t * 0.7 + b.phase) * 0.035 * idle;
      b.float.rotation.z = Math.sin(t * 0.9 + b.phase * 1.7) * 0.006 * idle;
      b.root.position.set(s.px.v, s.py.v, s.pz.v + s.lift.v);
      const sway = inDetail ? Math.sin(t * 0.45 + b.phase) * 0.035 * idle * (1 - activity) : 0;
      // The picture follows the physics through a small spring: a little weight and lag.
      const physics = b.orbPhase === 'drag' || b.orbPhase === 'spin' || b.orbPhase === 'rest' || b.orbPhase === 'settle';
      if (physics && !RM && !dbg.hold) {
        s.visY.t = b.orbY;
        s.visX.t = b.orbXs.v;
        s.visR.t = b.orbR;
        s.visY.update(dt);
        s.visX.update(dt);
        s.visR.update(dt);
      } else {
        s.visY.set(b.orbY);
        s.visX.set(b.orbXs.v);
        s.visR.set(b.orbR);
      }
      b.root.rotation.set(s.rx.v + s.tiltX.v + s.visX.v, s.ry.v + s.tiltY.v + s.visY.v + sway, s.rz.v + s.visR.v);
      // Soft shadow stays under/behind the book and slides a little as it turns.
      b.blob.rotation.y = -b.root.rotation.y;
      b.blob.position.x = 0.1 - Math.sin(s.visY.v) * 0.18;
      b.blob.scale.set(3.1 * (0.92 + 0.08 * Math.abs(Math.cos(s.visY.v))), 3.9, 1);
      b.root.scale.setScalar(Math.max(s.sc.v, 0.001));
      const ang = clamp(s.cover.v + s.drag.v, 0, Math.PI - 0.1);
      // Boards turn exactly about the spine edge; nothing else moves with them.
      b.pivot.rotation.y = -ang;
      b.backPivot.rotation.y = 0;
      // Keep the open spread centred, and a little smaller so it fits.
      const openFrac = clamp(ang / OPEN_ANGLE, 0, 1);
      b.shell.position.x = -(CW + Math.min(0, CW * Math.cos(ang))) / 2;
      b.root.scale.setScalar(Math.max(s.sc.v * (1 - (1 - SLOTS.openMul) * openFrac), 0.001));
      let moving = Math.abs(ang - b.lastAng) > 1e-4;
      b.lastAng = ang;
      for (let k = 0; k < b.leaves.length; k++) {
        const L = b.leaves[k];
        if (L.pendingT !== undefined) {
          L.wait -= dt;
          if (L.wait <= 0) {
            if (RM) L.f.set(L.pendingT);
            else L.f.t = L.pendingT;
            L.pendingT = undefined;
          }
        }
        L.f.update(dt);
        if (Math.abs(L.f.v - L.lastF) > 1e-5 || Math.abs(L.f.vel) > 1e-4) moving = true;
        L.lastF = L.f.v;
      }
      if (moving || b.dirty) {
        b.dirty = false;
        for (let k = 0; k < b.leaves.length; k++) {
          const L = b.leaves[k];
          // Trailing edge lags the hinge while the page is moving; it settles as it stops.
          const curl = RM ? 0 : -clamp(L.f.vel * 0.2, -1.1, 1.1);
          layoutLeaf(b, k, ang, curl);
        }
      }
    }

    let rafId = 0;
    let isInViewport = true;
    function animate(timestamp?: number) {
      if (cancelled || !isInViewport || document.hidden) {
        rafId = 0;
        return;
      }
      rafId = requestAnimationFrame(animate);
      timer.update(timestamp);
      const dt = Math.min(timer.getDelta(), 0.05);
      const t = timer.getElapsed();
      if (ptr.seen && (ptr.type === 'mouse' || ptr.down)) castRay();
      canvas.style.cursor = state.mode === 'detail' && state.selected ? (orbit.drag ? 'grabbing' : rayBook === state.selected ? 'grab' : 'default') : 'default';
      for (let i = 0; i < bookInstances.length; i++) {
        const b = bookInstances[i];
        if (!b || !b.root.visible) continue;
        screenPos(b);
        tickBook(b, dt, t);
      }
      parX.t = RM ? 0 : ptr.ndcX * 0.02;
      parY.t = RM ? 0 : -ptr.ndcY * 0.012;
      bookRoot.rotation.y = parX.update(dt);
      bookRoot.rotation.x = parY.update(dt);
      camera.position.set(camX.update(dt), camY.update(dt), camZ.update(dt));
      camera.lookAt(lookX.update(dt), lookY.update(dt), 0);
      renderer.render(scene, camera);
    }
    function resumeAnimation() {
      if (!rafId && !cancelled && isInViewport && !document.hidden) animate();
    }
    function relayout() {
      const r = root!.getBoundingClientRect();
      dims.w = Math.max(1, Math.round(r.width));
      dims.h = Math.max(1, Math.round(r.height));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(dims.w, dims.h);
      camera.aspect = dims.w / dims.h;
      camera.updateProjectionMatrix();
      computeSlots();
      applyMode();
      camTo(state.mode === 'detail' || state.mode === 'opening' ? 'detail' : 'hero');
    }
    relayout();

    function openById(id: string) {
      const idx = listNow().findIndex((b) => String(b.id) === id);
      if (idx < 0) return; // not in the list yet — wait for it to arrive rather than opening the wrong book
      const wasNew = !bookInstances[idx];
      const target = ensureBook(idx);
      if (!target) return;
      target.root.visible = true;
      hitMeshes.length = 0;
      hitMeshes.push(target.hit);
      if (wasNew) {
        const slot = SLOTS.detail || SLOTS.hero[1];
        if (slot) {
          target.springs.px.set(slot.p[0]);
          target.springs.py.set(slot.p[1] - 2.4);
          target.springs.pz.set(slot.p[2]);
          target.springs.rx.set(slot.r[0]);
          target.springs.ry.set(slot.r[1]);
          target.springs.rz.set(slot.r[2]);
          target.springs.sc.set(slot.s);
          target.slotScale = slot.s;
        }
      }
      camTo('hero');
      open(target);
    }

    animate();
    sceneApiRef.current = {
      openById,
      closeCurrent: () => close(),
      toggleLook,
      turnPage,
      resetView: () => state.selected && resetView(state.selected),
    };
    if (process.env.NODE_ENV !== 'production') {
      // Test hook for the visual checks (never in production builds).
      (window as unknown as { __book3d: unknown }).__book3d = {
        view: (y: number, x: number, r = 0) => {
          const b = state.selected;
          if (!b) return;
          dbg.hold = true;
          dbg.x = x;
          dbg.r = r;
          b.orbY = y;
          b.orbYv = 0;
          b.orbPhase = 'idle';
        },
        open: (v: boolean) => state.selected && setBookOpen(state.selected, v),
        turn: (n: number) => state.selected && turnTo(state.selected, n, 0.07),
      };
    }
    if (pendingOpenIdRef.current) {
      setT(() => openById(pendingOpenIdRef.current!), 80);
    }

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isInViewport = entry.isIntersecting;
        if (isInViewport) resumeAnimation();
        else if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      },
      { rootMargin: '160px' },
    );
    visibilityObserver.observe(root);
    const onVisibilityChange = () => {
      if (document.hidden && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      } else resumeAnimation();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const onWindowResize = () => relayout();
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', onWindowResize);
    let visualViewportHandler: (() => void) | null = null;
    if (window.visualViewport) {
      visualViewportHandler = () => relayout();
      window.visualViewport.addEventListener('resize', visualViewportHandler);
    }
    const ro = new ResizeObserver(() => relayout());
    ro.observe(root);
    roPanel = new ResizeObserver(() => relayout());

    return () => {
      cancelled = true;
      if (sceneApiRef.current) sceneApiRef.current = null;
      if (rafId) cancelAnimationFrame(rafId);
      timeouts.forEach((id) => clearTimeout(id));
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      timer.dispose();
      themeObserver.disconnect();
      ro.disconnect();
      roPanel?.disconnect();
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('orientationchange', onWindowResize);
      if (visualViewportHandler && window.visualViewport) window.visualViewport.removeEventListener('resize', visualViewportHandler);
      window.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('keydown', onKeydown);
      window.removeEventListener('pointercancel', onPointerUp);
      scene.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m: any) => {
            Object.values(m).forEach((v: any) => {
              if (v && v.isTexture) v.dispose();
            });
            m.dispose();
          });
        }
      });
      scene.environment?.dispose();
      scene.environment = null;
      renderer.dispose();
    };
    };
    loadThree()
      .then((mod) => {
        if (!disposed) cleanup = setupScene(mod);
      })
      .catch(() => {
        // offline: the book stays in its "opening" state; reopening retries
        threePromise = null;
      });
    return () => {
      disposed = true;
      if (cleanup) cleanup();
    };
  }, [books.length > 0, showDetailPanel, sceneWanted]);

  const themeVars = {
    '--bs-navy': themeColors?.navy ?? '#141a32',
    '--bs-pink': themeColors?.pink ?? '#f591ac',
    '--bs-cream': themeColors?.cream ?? '#fdfbf4',
    '--bs-lav': themeColors?.lav ?? '#c9d0ee',
    '--bs-peri': themeColors?.peri ?? '#96a2de',
    '--bs-bg-light': themeColors?.bgLight ?? themeColors?.bg ?? 'var(--background)',
    '--bs-bg-dark': themeColors?.bgDark ?? themeColors?.bg ?? 'var(--background)',
    '--bs-fg-light': themeColors?.foregroundLight ?? 'var(--foreground)',
    '--bs-fg-dark': themeColors?.foregroundDark ?? 'var(--foreground)',
    // Section rows have fixed heading and card-text heights, so a
    // skeleton row is exactly the size of the real one.
    '--bs-section-head': '46px',
    '--bs-section-meta': '104px',
  } as React.CSSProperties;

  const panelVisible = uiMode === 'detail';
  const delayMap: Record<number, string> = {
    50: 'delay-[50ms]',
    130: 'delay-[130ms]',
    210: 'delay-[210ms]',
    270: 'delay-[270ms]',
    330: 'delay-[330ms]',
  };
  const dpChild = (delayMs: number) =>
    panelVisible
      ? `opacity-100 translate-y-0 transition-[opacity,transform] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${delayMap[delayMs] || ''}`
      : 'opacity-0 translate-y-[28px] transition-[opacity,transform] duration-[280ms] ease-out';

  function onGridScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 280) onNearEndRef.current?.();
  }

  return (
    <div className="contents" style={themeVars}>
    <div
      ref={rootRef}
      tabIndex={0}
      role="region"
      aria-label={`${heroTitle} book showcase`}
      data-state={uiMode}
      className={cn(
        'book-showcase relative isolate h-full min-h-[560px] font-sans outline-none [container-type:size] [-webkit-tap-highlight-color:transparent]',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current/40',
        'transition-colors duration-500 ease-out',
        uiMode === 'closing' ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden',
        uiMode === 'hero' || uiMode === 'opening'
          ? 'bg-[var(--bs-bg-light)] text-[var(--bs-fg-light)] dark:bg-[var(--bs-bg-dark)] dark:text-[var(--bs-fg-dark)]'
          : 'bg-[var(--bs-bg-light)] text-[var(--bs-fg-light)] dark:bg-[var(--bs-bg-dark)] dark:text-[var(--bs-fg-dark)]',
        className,
      )}
      onScroll={uiMode === 'hero' ? onGridScroll : undefined}
      onPointerDown={() => void loadThree()}
      onPointerOver={(e) => {
        if (e.pointerType === 'mouse') void loadThree();
      }}
    >
      <style>{`
        .bs-book-stage {
          perspective: 980px;
          perspective-origin: 50% 42%;
        }
        /* No vertical tilt (rotateX): it exposed the book's bottom face as a
           1-2px cream sliver under the cover - on phone-sized cards it read
           as a thin white line, worst in dark mode / 3x screens (Part B,
           bug 1). The sideways turn (rotateY) keeps the 3D spine + pages. */
        .bs-book {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transform: rotateY(-26deg);
          transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform;
        }
        .group:hover .bs-book,
        .group:focus-visible .bs-book {
          transform: rotateY(-16deg) translateZ(10px);
        }
        .bs-book-loading {
          transform: rotateY(-26deg) !important;
        }
        .bs-book-front,
        .bs-book-spine,
        .bs-book-pages,
        .bs-book-top,
        .bs-book-bottom {
          position: absolute;
          backface-visibility: hidden;
        }
        .bs-book-front {
          inset: 0;
          overflow: hidden;
          border-radius: 3px 7px 7px 3px;
          box-shadow:
            0 14px 28px rgba(0,0,0,0.22),
            6px 10px 18px rgba(0,0,0,0.12),
            inset -10px 0 16px rgba(0,0,0,0.18),
            inset 0 0 0 1px rgba(0,0,0,0.12);
        }
        .bs-book-spine {
          top: 0;
          bottom: 0;
          left: 0;
          width: 18px;
          transform-origin: left center;
          transform: rotateY(-90deg);
          border-radius: 3px 0 0 3px;
          box-shadow:
            inset -6px 0 10px rgba(0,0,0,0.28),
            inset 4px 0 6px rgba(255,255,255,0.08);
        }
        .bs-book-spine-title {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 210%;
          color: rgba(255,255,255,0.82);
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transform: translate(-50%, -50%) rotate(90deg);
        }
        .bs-book-pages {
          top: 2%;
          bottom: 2%;
          right: 0;
          width: 16px;
          transform-origin: right center;
          transform: rotateY(90deg) translateZ(1px);
          background-image: repeating-linear-gradient(
            to right,
            rgba(90,74,40,0.18) 0px,
            rgba(90,74,40,0.18) 1px,
            transparent 1px,
            transparent 3px
          ) !important;
          box-shadow: inset 0 0 8px rgba(80,64,40,0.18);
        }
        .bs-book-top,
        .bs-book-bottom {
          left: 1%;
          right: 2%;
          height: 14px;
        }
        .bs-book-top {
          top: 0;
          transform-origin: top center;
          transform: rotateX(90deg);
          background-image: repeating-linear-gradient(
            to bottom,
            rgba(90,74,40,0.16) 0px,
            rgba(90,74,40,0.16) 1px,
            transparent 1px,
            transparent 3px
          );
        }
        .bs-book-bottom {
          bottom: 0;
          transform-origin: bottom center;
          transform: rotateX(-90deg);
        }
        @media (prefers-reduced-motion: reduce) {
          .bs-book,
          .group:hover .bs-book,
          .group:focus-visible .bs-book {
            transition: none;
            transform: rotateY(-26deg);
          }
        }
      `}</style>

      {showGrid && (
        <div
          ref={gridRef}
          className={cn(
            'relative z-10 px-[clamp(16px,4cqw,36px)] pb-10 pt-4',
            uiMode === 'opening' && 'pointer-events-none',
          )}
        >
          {topSlot}
          <SectionsBlock
            sections={sections}
            loading={!!sectionsLoading}
            skeletons={sectionSkeletons ?? 0}
            spinningId={uiMode === 'opening' ? selectedCfg?.id ?? null : null}
            onOpen={(book) => (onSectionBookOpen ? onSectionBookOpen(book) : openFromGrid(book))}
            onHide={handleHideBook}
            hiddenIds={hiddenIds}
          />
          {showNav && (
            <nav className="mb-5 flex items-center justify-between">
              <div className="text-[clamp(20px,2.2cqw,29px)] font-extrabold tracking-[-0.01em] text-current">{navTitle}</div>
            </nav>
          )}
          {books.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-center text-sm text-current opacity-60">
              Add at least one book to display the showcase.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 @min-[768px]:grid-cols-4 @min-[768px]:gap-x-5 @min-[768px]:gap-y-8">
              {books.filter((book) => !hiddenIds.has(book.id)).map((book, i) => (
                <GridBookCard
                  key={book.id}
                  book={book}
                  slot={{ position: i }}
                  spinning={uiMode === 'opening' && selectedCfg?.id === book.id}
                  onOpen={() => openFromGrid(book)}
                  onHide={handleHideBook}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Occupies exactly one screenful in normal flow (unlike its
          absolutely-positioned children) so Recommendations, appended
          after it, sits below the fold instead of overlapping the book. */}
      <div
        className={cn('relative w-full shrink-0', shelfActive ? 'h-full' : 'h-0 overflow-hidden')}
        style={shelfActive && layout?.phone ? ({ minHeight: layout.wrapMin, '--bs-panel-top': `${layout.panelTop}px`, '--bs-hint-h': `${HINT_H}px` } as React.CSSProperties) : undefined}
      >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn('absolute inset-0 z-[2] block h-full w-full touch-pan-y', !shelfActive && 'pointer-events-none opacity-0')}
      />

      {shelfActive && (
        <div
          role="toolbar"
          aria-label="Book view controls"
          style={layout ? { top: layout.toolTop, left: layout.toolX } : undefined}
          className={`absolute z-[80] flex h-[48px] -translate-x-1/2 items-center justify-center gap-2 ${layout ? '' : 'bottom-6 left-1/2'} transition-opacity duration-300 ${
            uiMode === 'detail' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <button
            type="button"
            aria-pressed={lookInside}
            aria-label={lookInside ? 'Close book' : 'Look inside'}
            title={lookInside ? 'Close book' : 'Look inside'}
            onClick={() => sceneApiRef.current?.toggleLook()}
            className={`${TOOL_BTN} shrink-0 gap-2 whitespace-nowrap px-4 text-[13px] font-semibold`}
          >
            {lookInside ? <IconBookClosed /> : <IconBookOpen />}
            <span>{lookInside ? 'Close book' : 'Look inside'}</span>
          </button>
          {lookInside && (
            <>
              <button
                type="button"
                aria-label="Previous page"
                title="Previous page"
                disabled={pageInfo.turned <= 0}
                onClick={() => sceneApiRef.current?.turnPage(-1)}
                className={`${TOOL_BTN} disabled:opacity-40`}
              >
                <IconChevron dir="left" />
              </button>
              <button
                type="button"
                aria-label="Next page"
                title="Next page"
                disabled={pageInfo.turned >= pageInfo.leaves}
                onClick={() => sceneApiRef.current?.turnPage(1)}
                className={`${TOOL_BTN} disabled:opacity-40`}
              >
                <IconChevron dir="right" />
              </button>
            </>
          )}
          {viewRotated && (
            <button
              type="button"
              aria-label="Reset view"
              title="Reset view"
              onClick={() => sceneApiRef.current?.resetView()}
              className={TOOL_BTN}
            >
              <IconReset />
            </button>
          )}
          <span className="sr-only" role="status" aria-live="polite">
            {lookInside ? `Book open, showing pages ${pageInfo.turned * 2 + 1} of the preview. Use Next page and Previous page to turn.` : 'Book closed.'}
          </span>
        </div>
      )}

      {shelfActive && (
        <button
          ref={closeBtnRef}
          type="button"
          aria-label="Close detail view"
          onClick={() => sceneApiRef.current?.closeCurrent()}
          className={`book-close-btn absolute left-[18px] top-[30px] z-[80] inline-flex h-[52px] w-[52px] items-center justify-center rounded-full border-[1.5px] border-current/30 bg-transparent text-[17px] leading-none text-current transition-[opacity,border-color] duration-300 delay-150 hover:border-current/70 @max-[760px]:left-[14px] @max-[760px]:top-[80px] ${
            uiMode === 'detail' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          &#10005;
        </button>
      )}

      {shelfActive && (
        <button
          type="button"
          aria-label="Scroll down for recommendations"
          onClick={() => {
            const root = rootRef.current;
            if (!root) return;
            root.scrollTo({ top: root.scrollHeight, behavior: 'smooth' });
          }}
          className={`pointer-events-auto absolute bottom-2 left-1/2 z-[20] flex -translate-x-1/2 flex-col items-center gap-0.5 text-current/65 transition-opacity duration-300 @max-[760px]:bottom-1 ${
            uiMode === 'detail' ? 'opacity-100 delay-500' : 'pointer-events-none opacity-0'
          }`}
        >
          <span className="text-[10px] tracking-wide">More below</span>
          <svg className="h-4 w-4 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {shelfActive && showDetailPanel && (
        <div
          ref={dpRef}
          aria-live="polite"
          className={`absolute right-[5%] top-8 bottom-4 z-[15] flex w-[min(520px,40%)] flex-col justify-start pt-0 pointer-events-none
            @max-[760px]:right-auto @max-[760px]:left-1/2 @max-[760px]:top-[var(--bs-panel-top,200px)] @max-[760px]:bottom-[var(--bs-hint-h,16px)]
            @max-[760px]:w-[min(560px,92cqw)] @max-[760px]:max-h-none @max-[760px]:-translate-x-1/2
            ${panelVisible ? 'visible' : 'invisible delay-[500ms]'}`}
        >
        <div className="pointer-events-auto min-h-0 flex-1 pr-1">
          <h1 className={`m-0 mb-2 line-clamp-2 text-[var(--brand-pink-text)] text-[clamp(22px,3.2cqw,42px)] font-extrabold leading-[1.12] tracking-[-0.02em] @max-[760px]:text-[clamp(20px,6cqw,32px)] ${dpChild(50)}`}>
            {selectedCfg?.title}
          </h1>
          <div className={`max-w-[54ch] text-current/75 text-[clamp(13px,1.1cqw,16px)] leading-[1.45] @max-[760px]:text-[13px] ${dpChild(130)}`}>
            <ExpandableText text={selectedCfg?.desc ?? ''} lines={4} desktopLines={6} />
          </div>
          <div className={`mt-3 flex flex-col gap-1.5 ${dpChild(210)}`}>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setReviewsOpen(true)} className="pointer-events-auto inline-flex items-center gap-2 rounded-full" aria-label="Rate and comment">
                <StarsRow value={ratingCount > 0 ? ratingAvg : selectedCfg?.stars ?? 0} className="gap-[3px] [&>svg]:h-4 [&>svg]:w-4" />
                {ratingCount > 0 ? (
                  <span className="text-[13px] text-current/60">
                    {ratingAvg.toFixed(1)} · {ratingCount} {ratingCount === 1 ? 'rating' : 'ratings'}
                  </span>
                ) : (
                  <span className="text-[12px] text-current/55">Catalog rating</span>
                )}
              </button>
              <div className="h-4 w-px bg-current/20" />
              <div className="text-[13px] italic text-current/60">{selectedCfg?.year}</div>
            </div>
            {ratingCount === 0 ? (
              <p className="text-[12px] text-current/65">
                Stars shown are set by PlugYard. No reader ratings yet.{' '}
                <button type="button" onClick={() => setReviewsOpen(true)} className="pointer-events-auto font-semibold text-[var(--brand-pink-text)] underline">
                  Click to rate and comment
                </button>
              </p>
            ) : myRating == null ? (
              <button type="button" onClick={() => setReviewsOpen(true)} className="pointer-events-auto w-fit text-left text-[12px] font-semibold text-[var(--brand-pink-text)] underline">
                Click to rate and comment
              </button>
            ) : (
              <p className="text-[12px] text-current/65">
                You rated this {myRating}/5.{' '}
                <button type="button" onClick={() => setReviewsOpen(true)} className="pointer-events-auto font-semibold text-[var(--brand-pink-text)] underline">
                  Change or comment
                </button>
              </p>
            )}
          </div>
          <div className={`mt-[26px] border-t border-current/15 @max-[760px]:mt-4 ${dpChild(270)}`} />
          {selectedCfg && (
            <div className={`pointer-events-none mt-5 mb-1 ${dpChild(300)}`}>
              {(() => {
                const ebookPrice = Number(selectedCfg.ebookPrice ?? selectedCfg.price ?? 0);
                const audioPrice = Number(selectedCfg.audiobookPrice ?? selectedCfg.price ?? 0);
                const hasEbook = selectedCfg.hasEbook !== false;
                const hasAudiobook = selectedCfg.hasAudiobook === true;
                return (
                  <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                    {hasEbook && ebookPrice > 0 && (
                      <DetailPrice label="eBook" listPrice={ebookPrice} offer={selectedCfg.offers?.ebook} onExpire={() => onOfferExpired?.(selectedCfg.id)} />
                    )}
                    {hasAudiobook && audioPrice > 0 && (
                      <DetailPrice label="Audiobook" listPrice={audioPrice} offer={selectedCfg.offers?.audiobook} onExpire={() => onOfferExpired?.(selectedCfg.id)} />
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          <div className={`pointer-events-auto mt-4 flex max-w-full flex-wrap items-center gap-[10px] rounded-[28px] bg-current/[0.05] p-[10px] ring-1 ring-current/10 ${dpChild(330)}`}>
            {(() => {
              const isFree = selectedCfg?.isFree === true;
              const hasEbook = selectedCfg?.hasEbook !== false;
              const hasAudio = selectedCfg?.hasAudiobook === true;
              const eb = access?.ebook;
              const au = access?.audiobook;
              const canReadEbook = hasEbook && eb?.read === 'full';
              const canListen = hasAudio && au?.read === 'full';
              const ebookDownloadsOff = selectedCfg?.ebookDownloadable === false && !eb?.privileged;
              const audioDownloadsOff = selectedCfg?.audiobookDownloadable === false && !au?.privileged;
              const canDlEbook = hasEbook && !!eb?.can_download;
              const canDlAudio = hasAudio && !!au?.can_download;
              const ownsEbook = !!(eb?.purchased || eb?.privileged);
              const ownsAudio = !!(au?.purchased || au?.privileged);
              return (
                <>
                  <button
                    type="button"
                    disabled={!canReadEbook}
                    onClick={() => {
                      if (!selectedCfg || !canReadEbook) return;
                      setReaderOpen(true);
                    }}
                    className="relative inline-flex h-[54px] shrink-0 items-center gap-[10px] rounded-full bg-[var(--bs-fg-light)] px-[22px] text-[16.5px] font-semibold text-[var(--bs-bg-light)] dark:bg-[var(--bs-fg-dark)] dark:text-[var(--bs-bg-dark)] hover:scale-[1.04] disabled:opacity-60 @max-[760px]:h-12 @max-[760px]:px-4"
                  >
                    Read
                    {!canReadEbook && <span className="pointer-events-none absolute left-[-6%] right-[-6%] top-1/2 h-[2.5px] -translate-y-1/2 rotate-[-12deg] rounded-full bg-red-500" />}
                  </button>
                  <div className="relative shrink-0">
                    <ActionButton
                      action={downloadAction}
                      disabled={!!buyLoading || (!hasEbook && !hasAudio)}
                      onClick={() => setDownloadMenu((v) => !v)}
                      // compact: the label is swapped for a spinner/tick while
                      // busy, so the button is only as wide as "Download".
                      compact
                      loadingLabel="Downloading…"
                      successLabel="Downloaded"
                      errorPlacement="none"
                      retryPlacement="none"
                      aria-haspopup="menu"
                      aria-expanded={downloadMenu}
                      className="inline-flex h-[54px] w-auto shrink-0 items-center justify-center rounded-full bg-[var(--bs-pink)] px-[22px] text-[16.5px] font-semibold text-[var(--on-brand)] hover:scale-[1.04] disabled:opacity-60 @max-[760px]:h-12 @max-[760px]:px-4"
                    >
                      {buyLoading ? '…' : 'Download'}
                    </ActionButton>
                    {downloadMenu && (
                      <div className="absolute bottom-[110%] left-0 z-30 min-w-[200px] rounded-2xl bg-[var(--bs-bg-light)] p-2 text-left text-sm text-[var(--bs-fg-light)] shadow-xl ring-1 ring-black/10 dark:bg-[var(--bs-bg-dark)] dark:text-[var(--bs-fg-dark)] dark:ring-white/10">
                        <p className="px-2 pb-1 text-[11px] uppercase tracking-wider text-current/50">Choose a file</p>
                        <button
                          type="button"
                          disabled={!hasEbook || ebookDownloadsOff}
                          className="block w-full rounded-xl px-3 py-2 text-left hover:bg-current/[0.07] disabled:opacity-40"
                          onClick={() => {
                            setDownloadMenu(false);
                            if (!selectedCfg || !hasEbook || ebookDownloadsOff) return;
                            if (canDlEbook) {
                              void startDownload('ebook');
                              return;
                            }
                            if (isFree || ownsEbook) return;
                            setBuyLoading('ebook');
                            const q = new URLSearchParams({ bookId: selectedCfg.id, type: 'ebook', title: selectedCfg.title });
                            window.location.href = `/checkout?${q}`;
                          }}
                        >
                          {ebookDownloadsOff ? 'Downloads off for this book' : canDlEbook ? 'Download ebook (PDF)' : hasEbook ? 'Buy ebook to download' : 'Ebook unavailable'}
                        </button>
                        <button
                          type="button"
                          disabled={!hasAudio || audioDownloadsOff}
                          className="block w-full rounded-xl px-3 py-2 text-left hover:bg-current/[0.07] disabled:opacity-40"
                          onClick={() => {
                            setDownloadMenu(false);
                            if (!selectedCfg || !hasAudio || audioDownloadsOff) return;
                            if (canDlAudio) {
                              void startDownload('audiobook');
                              return;
                            }
                            if (isFree || ownsAudio) return;
                            setBuyLoading('audiobook');
                            const q = new URLSearchParams({ bookId: selectedCfg.id, type: 'audiobook', title: selectedCfg.title });
                            window.location.href = `/checkout?${q}`;
                          }}
                        >
                          {audioDownloadsOff ? 'Downloads off for this book' : canDlAudio ? 'Download audiobook' : hasAudio ? 'Buy audio to download' : 'Audio unavailable'}
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!!buyLoading || !hasAudio}
                    onClick={() => {
                      if (!selectedCfg || !hasAudio) return;
                      if (canListen) {
                        setPlayerOpen(true);
                        return;
                      }
                      setBuyLoading('audiobook');
                      const q = new URLSearchParams({ bookId: selectedCfg.id, type: 'audiobook', title: selectedCfg.title });
                      window.location.href = `/checkout?${q}`;
                    }}
                    className="relative inline-flex h-[54px] shrink-0 items-center justify-center rounded-full bg-current/[0.08] px-[22px] text-[16.5px] font-semibold ring-1 ring-current/15 disabled:opacity-60 @max-[760px]:h-12 @max-[760px]:px-4"
                  >
                    {!hasAudio ? 'No audio' : canListen ? 'Listen' : 'Buy to listen'}
                    {!hasAudio && <span className="pointer-events-none absolute left-[-6%] right-[-6%] top-1/2 h-[2.5px] -translate-y-1/2 rotate-[-12deg] rounded-full bg-red-500" />}
                  </button>
                  <button type="button" onClick={() => void shareBook()} aria-label="Share this book" className="inline-flex h-[54px] shrink-0 w-[54px] items-center justify-center rounded-full bg-current/[0.08] hover:scale-[1.04]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                    </svg>
                  </button>
                  {selectedCfg ? <ShareSheet book={selectedCfg} open={shareOpen} onClose={() => setShareOpen(false)} /> : null}
                  {selectedCfg && selectedCfg.hasEbook !== false && !canReadEbook && eb?.read === 'preview' && (
                    <button
                      type="button"
                      aria-label="Preview pages"
                      onClick={() => {
                        void searchTrack({
                          event_type: 'preview',
                          book_id: selectedCfg.id,
                          book_slug: String(selectedCfg.id),
                          query: selectedCfg.title,
                          source: 'eye',
                        });
                        setPreviewOpen(true);
                      }}
                      className="inline-flex h-[54px] shrink-0 w-[54px] items-center justify-center rounded-full bg-current/[0.08] transition hover:scale-[1.04] @max-[760px]:h-12 @max-[760px]:w-12"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7}>
                        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  )}
                  {contentMsg && (
                    <p className="basis-full px-2 text-[13px] font-semibold text-[var(--brand-pink-text)]" role="status">{contentMsg}</p>
                  )}
                  <ActionStatus action={bookmarkAction.state === 'retrying' ? bookmarkAction : downloadAction} className="basis-full px-2 text-[13px] font-semibold text-current/70" />
                  {downloadAction.errorText && (
                    <p className="basis-full px-2 text-[13px] font-semibold text-[var(--brand-pink-text)]" role="alert">
                      {downloadAction.errorText}{' '}
                      <button type="button" className="underline" onClick={() => setDownloadMenu(true)}>
                        Try again
                      </button>
                    </p>
                  )}
                  {bookmarkAction.errorText && (
                    <p className="basis-full px-2 text-[13px] font-semibold text-[var(--brand-pink-text)]" role="alert">
                      {bookmarkAction.errorText}
                    </p>
                  )}
                </>
              );
            })()}
            <ActionButton
              compact
              action={bookmarkAction}
              aria-label={bookmarked ? 'Remove from wishlist' : 'Save to wishlist'}
              aria-pressed={bookmarked}
              onClick={handleSave}
              errorPlacement="none"
              loadingLabel={bookmarked ? 'Removing from wishlist…' : 'Saving to wishlist…'}
              className={`inline-flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full ${
                bookmarked ? 'bg-[var(--bs-pink)] text-[var(--on-brand)]' : 'bg-current/[0.08]'
              }`}
            >
              <svg viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.7} className="h-5 w-5">
                <path d="M12 21s-7-4.35-9.33-8.43C.56 8.88 2.3 4.5 6.5 4.5A5.18 5.18 0 0 1 12 7.77 5.18 5.18 0 0 1 17.5 4.5c4.2 0 5.94 4.38 3.83 8.07C19 16.65 12 21 12 21Z" />
              </svg>
            </ActionButton>
            {selectedCfg && !hiddenIds.has(String(selectedCfg.id)) && (
              <button
                type="button"
                aria-label="Not interested"
                title="Not interested"
                onClick={() => {
                  if (!selectedCfg) return;
                  handleHideBook(String(selectedCfg.id), selectedCfg.title);
                  sceneApiRef.current?.closeCurrent();
                }}
                className="inline-flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-current/[0.08] transition hover:scale-[1.04] @max-[760px]:h-12 @max-[760px]:w-12"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
        </div>
      )}
      </div>

      {reviewsOpen && selectedCfg && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-foreground/10 bg-background px-3 pt-[env(safe-area-inset-top)] mt-16">
            <button type="button" onClick={() => setReviewsOpen(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/10">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[17px] font-bold">{selectedCfg.title}</h2>
              <p className="text-[13px] text-muted-foreground">Ratings & comments</p>
            </div>
          </header>
          <div className="min-h-0 flex-1 flex flex-col">
            <BookReviews bookId={selectedCfg.id} onClose={() => setReviewsOpen(false)} />
          </div>
        </div>,
        document.body,
      )}

      {readerOpen && selectedCfg && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-background text-foreground [color-scheme:only_light] dark:[color-scheme:dark]">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-foreground/10 px-3">
            <button type="button" onClick={() => setReaderOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-foreground/10">×</button>
            <h2 className="min-w-0 flex-1 truncate text-[16px] font-bold">{selectedCfg.title}</h2>
          </header>
          <PdfReader bookId={selectedCfg.id} />
        </div>,
        document.body,
      )}

      {previewOpen && selectedCfg && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-background text-foreground [color-scheme:only_light] dark:[color-scheme:dark]">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-foreground/10 px-3">
            <button type="button" onClick={() => setPreviewOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-foreground/10">×</button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[16px] font-bold">Preview · {selectedCfg.title}</h2>
              <p className="text-[12px] text-muted-foreground">First pages only. Buy to read the full book.</p>
            </div>
          </header>
          <PdfReader bookId={selectedCfg.id} />
        </div>,
        document.body,
      )}

      {playerOpen && selectedCfg && typeof document !== 'undefined' && selectedCfg.hasAudiobook === true && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-background text-foreground">
          <AudioPlayer
            title={selectedCfg.title}
            bookId={selectedCfg.id}
            onClose={() => setPlayerOpen(false)}
            downloadable={!!access?.audiobook.can_download}
          />
        </div>,
        document.body,
      )}

      {shelfActive && selectedCfg && (
        <div className="w-full bg-[var(--bs-bg-light)] px-4 pt-6 dark:bg-[var(--bs-bg-dark)] sm:px-8">
          <Banners placement="book" className="" />
        </div>
      )}
      {shelfActive && selectedCfg && <RecommendedBooks book={selectedCfg} />}

      {/* Not interested toast: reason picker → confirmed → error */}
      {hideToast && typeof document !== 'undefined' && createPortal(
        <div
          role={hideToast.phase === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 z-[9999] flex -translate-x-1/2 flex-col items-stretch gap-2 rounded-2xl bg-background px-4 py-3 text-sm text-foreground shadow-lg ring-1 ring-foreground/10 ${
            hideToast.phase === 'pick-reason' ? 'w-[min(340px,90vw)]' : 'min-w-[220px] max-w-[90vw]'
          }`}
        >
          {hideToast.phase === 'pick-reason' && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Why not interested?</span>
                <button type="button" onClick={handleSkipReason} className="text-xs text-muted-foreground hover:text-foreground underline shrink-0">Skip</button>
              </div>
              {showOtherInput ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    autoFocus
                    maxLength={200}
                    rows={2}
                    value={otherReasonText}
                    onChange={(e) => setOtherReasonText(e.target.value)}
                    placeholder="Tell us why (optional)"
                    className="w-full resize-none rounded-lg border border-foreground/20 bg-transparent px-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/40"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePickReason('other', otherReasonText.trim())}
                      className="flex-1 rounded-lg bg-foreground/10 px-2 py-1.5 text-xs font-semibold hover:bg-foreground/20"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowOtherInput(false); setOtherReasonText(''); }}
                      className="rounded-lg border border-foreground/20 px-2 py-1.5 text-xs hover:bg-foreground/10"
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {(hideReasons.length > 0 ? hideReasons : [
                    { key: 'not_my_genre', label: 'Not my genre' },
                    { key: 'already_read', label: 'Already read it' },
                    { key: 'dislike_author', label: "Don't like author" },
                    { key: 'other', label: 'Other' },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        if (key === 'other') { setShowOtherInput(true); return; }
                        handlePickReason(key);
                      }}
                      className="rounded-lg border border-foreground/20 px-2 py-1.5 text-xs font-medium hover:bg-foreground/10 active:bg-foreground/20 text-left"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {hideToast.phase === 'hidden' && (
            <div className="flex items-center gap-3">
              <span className="max-w-[160px] truncate flex-1">Hidden: {hideToast.title}</span>
              <button
                type="button"
                onClick={handleUndoHide}
                className="shrink-0 rounded-full border border-foreground/30 px-2.5 py-0.5 text-xs font-semibold hover:bg-foreground/10"
              >
                Undo
              </button>
              <button type="button" onClick={() => setHideToast(null)} aria-label="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground">✕</button>
            </div>
          )}
          {hideToast.phase === 'error' && (
            <div className="flex items-center gap-3">
              <span className="flex-1 text-xs">{hideToast.error}</span>
              <button
                type="button"
                onClick={handleRetryHide}
                className="shrink-0 rounded-full border border-foreground/30 px-2.5 py-0.5 text-xs font-semibold hover:bg-foreground/10"
              >
                Try again
              </button>
              <button type="button" onClick={() => setHideToast(null)} aria-label="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground">✕</button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
    </div>
  );
}

export default BooksShowcase;
