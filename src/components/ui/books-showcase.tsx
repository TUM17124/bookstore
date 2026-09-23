'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useBookmarks } from '@/components/bookmarks-context';
import { BookReviews } from '@/components/book-reviews';
import { createPortal } from 'react-dom';
import { getPurchases, downloadOrderUrl, freeBookUrl, searchTrack, previewBookUrl, getRatings, getRelatedBooks, type ApiBook } from '@/lib/api';
import { getStoredUser } from '@/lib/auth-client';
import { PdfReader } from '@/components/pdf-reader';
import { AudioPlayer } from '@/components/audio-player';

export interface BookCfg {
  id: string;
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
  images?: { front?: string; back?: string; spine?: string };
  coverURL?: string | null;
  edge?: string;
  backBg?: string;
  backInk?: string;
  spineBg?: string;
  spineInk?: string;
  spineFont?: string;
  chapters?: string[];
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
  onBookSelect?: (book: BookCfg | null) => void;
  onNearEnd?: () => void;
  openBookId?: string;
  openView?: string;
}

const OPEN_SLIP_CLASS =
  'pointer-events-none absolute left-1/2 top-[62%] z-10 -translate-x-1/2 -translate-y-1/2 ' +
  'rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--bs-navy)] ' +
  'bg-[var(--bs-cream)] shadow-[0_6px_16px_rgba(0,0,0,0.28)] ' +
  'opacity-0 scale-[0.94] transition-[opacity,transform] duration-200 ease-out ' +
  'group-hover:opacity-100 group-hover:scale-100 group-focus-visible:opacity-100 group-focus-visible:scale-100';

function coverSrc(book: BookCfg) {
  return book.images?.front || book.coverURL || '';
}

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

function GridBookCard({
  book,
  onOpen,
  spinning,
}: {
  book: BookCfg;
  onOpen: () => void;
  spinning?: boolean;
}) {
  const src = coverSrc(book);
  const [broken, setBroken] = useState(false);
  const [avg, setAvg] = useState(book.stars || 0);
  const [count, setCount] = useState(0);
  const spineColor = book.spineBg || book.backBg || '#1c1f26';
  const pageColor = book.edge || '#eee4cf';

  useEffect(() => {
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
  }, [book.id, book.stars]);

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={spinning}
      className="group flex w-full flex-col text-left outline-none"
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
                <img src={src} alt={book.title} className="h-full w-full object-cover" onError={() => setBroken(true)} />
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
            <div className="bs-book-bottom" style={{ background: '#d8cdb6' }} />
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

      <div className="mt-2.5 min-w-0">
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
    <span className="font-bold text-[var(--bs-pink)] uppercase text-[10px] tracking-wider">Free</span>
  ) : (
    <>
      {(book.hasEbook !== false) && Number(book.ebookPrice ?? book.price ?? 0) > 0 && (
        <span className="font-bold text-[var(--bs-pink)]">
          <span className="mr-0.5 text-[9px] opacity-70 uppercase">eBook</span>
          KES {Number(book.ebookPrice ?? book.price ?? 0).toLocaleString()}
        </span>
      )}
      {book.hasAudiobook && Number(book.audiobookPrice ?? book.price ?? 0) > 0 && (
        <span className="font-bold text-[var(--bs-pink)]">
          <span className="mr-0.5 text-[9px] opacity-70 uppercase">Audio</span>
          KES {Number(book.audiobookPrice ?? book.price ?? 0).toLocaleString()}
        </span>
      )}
    </>
  )}
</div>
      </div>
    </button>
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
    <div className="w-full border-t border-[var(--bs-lav)]/20 bg-[var(--bs-navy)] text-[var(--bs-cream)]">
      <div className="flex items-center justify-between px-4 pt-5 sm:px-8">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-[var(--bs-lav)]/70">Recommendations</h3>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Scroll recommendations left"
            onClick={() => skip(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[var(--bs-cream)] hover:bg-white/20"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Scroll recommendations right"
            onClick={() => skip(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[var(--bs-cream)] hover:bg-white/20"
          >
            ›
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto px-4 py-5 sm:px-8 [scrollbar-width:thin]"
      >
        {items.map((b) => (
          <div key={b.id} className="w-[132px] shrink-0 @min-[768px]:w-[240px]">
            <GridBookCard
              book={b}
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

export function BooksShowcase({
  books = [],
  heroTitle = 'Books',
  navTitle = 'Bestsellers',
  showNav = true,
  showDetailPanel = true,
  themeColors,
  className,
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
  const sceneApiRef = useRef<{ openById: (id: string) => void; closeCurrent: () => void } | null>(null);
  const pendingOpenIdRef = useRef<string | null>(null);

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
  const [selectedCfg, setSelectedCfg] = useState<BookCfg | null>(null);

  const [ownedEbookOrderId, setOwnedEbookOrderId] = useState<number | null>(null);
  const [ownedAudioOrderId, setOwnedAudioOrderId] = useState<number | null>(null);
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyLoading, setBuyLoading] = useState<'ebook' | 'audiobook' | null>(null);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [myRating, setMyRating] = useState<number | null>(null);
  const bookmarked = selectedCfg != null ? isBookmarked(selectedCfg.id) : false;
  const handleSave = () => {
    if (!selectedCfg) return;
    toggleBookmark(selectedCfg);
  };
  const [downloadMenu, setDownloadMenu] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const shelfActive = uiMode !== 'hero' && !!selectedCfg;
  const showGrid = uiMode === 'hero' || uiMode === 'opening';

  useEffect(() => {
    // Opening a book (including from Recommendations, while scrolled down
    // to view them) should show the book itself, not stay scrolled to
    // wherever the previous book's view was left.
    if (!selectedCfg?.id) return;
    rootRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedCfg?.id]);

  useEffect(() => {
    if (uiMode !== 'detail' || !selectedCfg?.id) return;
    void searchTrack({
      event_type: 'click',
      book_id: selectedCfg.id,
      book_slug: String(selectedCfg.id),
      query: selectedCfg.title,
      source: 'shelf',
    });
  }, [uiMode, selectedCfg?.id]);

  async function shareBook() {
    if (!selectedCfg) return;
    const shareUrl = `${window.location.origin}/?book=${encodeURIComponent(selectedCfg.id)}`;
    const data = { title: selectedCfg.title, text: `Read ${selectedCfg.title} on PlugYard`, url: shareUrl };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Link copied');
    } catch {
      window.prompt('Copy this link', shareUrl);
    }
  }

  useEffect(() => {
    const open = uiMode === 'detail' || uiMode === 'opening';
    document.body.classList.toggle('book-detail-open', open);
    return () => document.body.classList.remove('book-detail-open');
  }, [uiMode]);

  useEffect(() => {
    if (!selectedCfg) {
      setOwnedEbookOrderId(null);
      setOwnedAudioOrderId(null);
      return;
    }
    const email = (getStoredUser()?.email || sessionStorage.getItem('checkout_email') || '').trim().toLowerCase();
    setBuyerEmail(email);
    if (!email) {
      setOwnedEbookOrderId(null);
      setOwnedAudioOrderId(null);
      return;
    }
    let cancelled = false;
    getPurchases(email).then((p) => {
      if (cancelled) return;
      const id = String(selectedCfg.id);
      const eb = p.ebooks.find((x) => String(x.book_id) === id);
      const au = p.audiobooks.find((x) => String(x.book_id) === id);
      setOwnedEbookOrderId(eb ? eb.order_id : null);
      setOwnedAudioOrderId(au ? au.order_id : null);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedCfg]);

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
    pendingOpenIdRef.current = String(book.id);
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
    pendingOpenIdRef.current = String(book.id);
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
    if (!root || !canvasEl || books.length === 0) return;

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
    const PAGE_N = 12;
    const PAGE_B = 6;
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
        'absolute inset-0 z-50 flex items-center justify-center p-10 text-center text-lg leading-relaxed text-[var(--bs-lav)]';
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
    function fitTexture(t: THREE.Texture, maxDim: number) {
      const img = t.image as { width?: number; height?: number } | undefined;
      if (!img || !img.width || !img.height) return t;
      const iw = img.width;
      const ih = img.height;
      if (Math.max(iw, ih) <= maxDim) {
        t.anisotropy = ANISO;
        return t;
      }
      const scale = maxDim / Math.max(iw, ih);
      const w = Math.max(1, Math.round(iw * scale));
      const h = Math.max(1, Math.round(ih * scale));
      const c = mkCanvas(w, h);
      c.getContext('2d')!.drawImage(img as CanvasImageSource, 0, 0, w, h);
      t.image = c;
      t.needsUpdate = true;
      t.anisotropy = ANISO;
      return t;
    }
    function loadOrPaint(material: THREE.MeshStandardMaterial, imageURL: string | null | undefined, paintFallback: () => HTMLCanvasElement) {
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
          fitTexture(t, MAX_TEX);
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
    function trimToWidth(x: CanvasRenderingContext2D, text: string, maxW: number) {
      if (x.measureText(text).width <= maxW) return text;
      let t = text;
      while (t.length > 1 && x.measureText(t + '...').width > maxW) t = t.slice(0, -1);
      return t + '...';
    }
    function makeIndexPageTex(chapters?: string[]) {
      const w = COVER_W,
        h = COVER_H,
        c = mkCanvas(w, h),
        x = c.getContext('2d')!;
      x.fillStyle = '#f4efdf';
      x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(130,110,80,0.07)';
      for (let i = 0; i < 1600; i++) x.fillRect(Math.random() * w, Math.random() * h, 1.1, 1.1);
      x.fillStyle = '#2f2a23';
      x.textAlign = 'center';
      x.font = '700 84px Georgia';
      x.fillText('INDEX', w / 2, 190);
      x.globalAlpha = 0.26;
      x.fillRect(220, 225, w - 440, 3);
      x.globalAlpha = 1;
      const list =
        chapters && chapters.length
          ? chapters
          : ['Introduction', 'Main Ideas', 'Practical Lessons', 'Case Studies', 'Takeaways', 'Final Notes'];
      x.textAlign = 'left';
      x.font = '500 46px Georgia';
      let y = 318;
      for (let i = 0; i < list.length; i++) {
        const n = String(i + 1).padStart(2, '0');
        const pageNo = String(7 + i * 14).padStart(3, ' ');
        const left = n + '. ' + trimToWidth(x, list[i], 650);
        x.fillStyle = '#2f2a23';
        x.fillText(left, 150, y);
        x.textAlign = 'right';
        x.fillStyle = '#5d5043';
        x.fillText(pageNo, w - 150, y);
        x.textAlign = 'left';
        x.globalAlpha = 0.22;
        x.fillRect(150, y + 16, w - 300, 2);
        x.globalAlpha = 1;
        y += 112;
      }
      return tex(c);
    }

    const W = 1.42,
      H = 2.14,
      T = 0.34,
      CT = 0.032,
      OV = 0.05;
    const PW = W - 0.02,
      PH = H - 0.02;
    const BLOCK_D = 0.245,
      BLOCK_Z = -0.0205,
      PIVOT_Z = T / 2 + CT / 2,
      BPIVOT_Z = -(T / 2 + CT / 2),
      HINGE_OVERLAP = 0.05;
    const coverGeo = new THREE.BoxGeometry(W + OV, H + OV * 2, CT);
    const blockGeo = new THREE.BoxGeometry(W - 0.015, H, BLOCK_D);
    const pageGeo = new THREE.PlaneGeometry(PW, PH);
    const spineGeo = new THREE.BoxGeometry(0.028, H + OV * 2, T + CT * 2 + 0.006);
    const hitGeo = new THREE.BoxGeometry(1.8, 2.5, 1.15);
    const blobGeo = new THREE.PlaneGeometry(1, 1);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    function std(o: THREE.MeshStandardMaterialParameters) {
      return new THREE.MeshStandardMaterial(Object.assign({ metalness: 0.02 }, o));
    }
    const paperFlat = std({ color: 0xf5f6f8, roughness: 0.85, envMapIntensity: 0.2 });
    const striMatV = std({ map: striV, bumpMap: striV, bumpScale: 0.0012, roughness: 0.85, envMapIntensity: 0.2 });
    const striMatH = std({ map: striH, bumpMap: striH, bumpScale: 0.0012, roughness: 0.85, envMapIntensity: 0.2 });
    const endpaperMat = std({ map: endpaperTex, roughness: 0.8, envMapIntensity: 0.25 });
    const pageMats = [0xf6f7f9, 0xf3f4f6, 0xf8f9fa].map((c) =>
      std({ color: c, roughness: 0.85, envMapIntensity: 0.22, side: THREE.DoubleSide }),
    );

    type Book = {
      cfg: BookCfg;
      index: number;
      root: THREE.Group;
      float: THREE.Group;
      pivot: THREE.Group;
      backPivot: THREE.Group;
      frontMesh: THREE.Mesh;
      spine: THREE.Mesh;
      block: THREE.Mesh;
      pages: THREE.Group[];
      pageF: number[];
      pagesB: THREE.Group[];
      pageFB: number[];
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
      exit: { segs: any[]; i: number; t: number } | null;
    };
    const bookInstances: Book[] = [];
    const hitMeshes: THREE.Mesh[] = [];

    function buildBook(cfg: BookCfg, index: number): Book {
      const root = new THREE.Group();
      const float = new THREE.Group();
      root.add(float);
      bookRoot.add(root);
      const indexPageMat = std({
        map: makeIndexPageTex(cfg.chapters),
        roughness: 0.92,
        envMapIntensity: 0.2,
        side: THREE.DoubleSide,
      });
      const edgeColor = cfg.edge ?? '#eceff2';
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
      });
      loadOrPaint(mBack, cfg.images?.back ?? null, () => {
        const c = mkCanvas(COVER_W, COVER_H);
        const ctx = c.getContext('2d')!;
        if (cfg.back) cfg.back(ctx, COVER_W, COVER_H);
        else paintBack(ctx, COVER_W, COVER_H, { backBg: cfg.backBg ?? '#22252b', backInk: cfg.backInk ?? '255,255,255' });
        return c;
      });
      loadOrPaint(mSpine, cfg.images?.spine ?? null, () => {
        const sw = 220;
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
      backPivot.position.set(-W / 2 - HINGE_OVERLAP, 0, BPIVOT_Z);
      const backMesh = new THREE.Mesh(coverGeo, [mEdge, mEdge, mEdge, mEdge, endpaperMat, mBack]);
      backMesh.position.x = (W + OV) / 2;
      backMesh.castShadow = backMesh.receiveShadow = true;
      backPivot.add(backMesh);
      float.add(backPivot);
      const pivot = new THREE.Group();
      pivot.position.set(-W / 2 - HINGE_OVERLAP, 0, PIVOT_Z);
      const frontMesh = new THREE.Mesh(coverGeo, [mEdge, mEdge, mEdge, mEdge, mFront, endpaperMat]);
      frontMesh.position.x = (W + OV) / 2;
      frontMesh.castShadow = frontMesh.receiveShadow = true;
      pivot.add(frontMesh);
      float.add(pivot);
      const spine = new THREE.Mesh(spineGeo, mSpine);
      spine.position.set(-W / 2 - 0.013, 0, 0);
      spine.castShadow = true;
      float.add(spine);
      const block = new THREE.Mesh(blockGeo, [striMatV, paperFlat, striMatH, striMatH, paperFlat, paperFlat]);
      block.position.set(-0.0075, 0, BLOCK_Z);
      block.castShadow = block.receiveShadow = true;
      float.add(block);
      const pages: THREE.Group[] = [],
        pageF: number[] = [];
      for (let i = 0; i < PAGE_N; i++) {
        const pp = new THREE.Group();
        pp.position.set(-W / 2 + 0.01, (Math.random() - 0.5) * 0.006, 0.166 - i * 0.0042);
        const pm = new THREE.Mesh(pageGeo, i === 0 ? indexPageMat : pageMats[i % 3]);
        pm.position.x = PW / 2;
        pm.rotation.z = (Math.random() - 0.5) * 0.006;
        pp.add(pm);
        float.add(pp);
        pages.push(pp);
        pageF.push(0.3 * Math.pow(1 - i / PAGE_N, 2.6));
      }
      const pagesB: THREE.Group[] = [],
        pageFB: number[] = [];
      for (let i = 0; i < PAGE_B; i++) {
        const pp = new THREE.Group();
        pp.position.set(-W / 2 + 0.01, (Math.random() - 0.5) * 0.006, -0.166 + i * 0.0042);
        const pm = new THREE.Mesh(pageGeo, pageMats[i % 3]);
        pm.position.x = PW / 2;
        pm.rotation.z = (Math.random() - 0.5) * 0.006;
        pp.add(pm);
        float.add(pp);
        pagesB.push(pp);
        pageFB.push(0.3 * Math.pow(1 - i / PAGE_B, 2.6));
      }
      const blob = new THREE.Mesh(
        blobGeo,
        new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.45, depthWrite: false }),
      );
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
      };
      const b: Book = {
        cfg,
        index,
        root,
        float,
        pivot,
        backPivot,
        frontMesh,
        spine,
        block,
        pages,
        pageF,
        pagesB,
        pageFB,
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
        exit: null,
      };
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
    const SLOTS: { hero: Slot[]; detail: Slot | null; portrait: boolean } = { hero: [], detail: null, portrait: false };

    function computeSlots() {
      const a = dims.w / Math.max(1, dims.h);
      const portrait = a < 0.85;
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
      if (SLOTS.portrait) {
        const el = dpRef.current;
        const panelH = el && el.offsetHeight > 40 ? el.offsetHeight : dims.h * 0.44;
        const gap = dims.h * 0.035,
          navB = dims.h * 0.1;
        const freeTop = navB;
        const freeBot = Math.max(dims.h - panelH - gap, freeTop + 140);
        const midPx = (freeTop + freeBot) / 2;
        const T13 = 0.23087,
          camZp = 9.9,
          zw = 0.8 * fit,
          rootY = -(1 - fit) * 0.28;
        const yw = 0.1 + (1 - (2 * midPx) / dims.h) * T13 * (camZp - zw);
        const availW = (((freeBot - freeTop) * 0.92) / dims.h) * 2 * T13 * (camZp - zw);
        const s = clamp(availW / fit / 2.65, 0.42, 0.92);
        SLOTS.detail = { p: [0, (yw - rootY) / fit, 0.8], r: [-0.02, -0.4, 0.06], s };
      } else {
        SLOTS.detail = { p: [-1.68, 0.0, 0.85], r: [0.02, -0.44, 0.08], s: 1.06 };
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
        prev.orbXs.t = 0;
      }
      state.mode = 'opening';
      setUiMode('opening');
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
        b.orbTarget = Math.round(b.orbY / 6.2832) * 6.2832 + 6.2832;
        b.orbYv = Math.max(b.orbYv, 3);
        b.orbPhase = 'return';
        b.orbXs.t = 0;
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
    const orbit = { drag: false, dxAcc: 0, dyAcc: 0 };
    const ray = new THREE.Raycaster();
    const tmpV = new THREE.Vector3();
    const canvas = canvasEl;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    const localXY = (e: PointerEvent) => {
      const r = root!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onPointerMove = (e: PointerEvent) => {
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
      if (ptr.down && orbit.drag) {
        orbit.dxAcc += dxN;
        orbit.dyAcc += dyN;
        if (ptr.type === 'touch') e.preventDefault();
      }
    };
    canvas.addEventListener('pointermove', onPointerMove);
    const onPointerDown = (e: PointerEvent) => {
      if (ptr.id !== null) return;
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
      castRay();
      if (state.mode === 'detail' && rayBook === state.selected) {
        if (ptr.type === 'touch') {
          ptr.pendingTouchRotate = true;
        } else {
          ptr.down = true;
          orbit.drag = true;
          orbit.dxAcc = 0;
          orbit.dyAcc = 0;
          canvas.setPointerCapture(e.pointerId);
        }
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    const onPointerUp = (e: PointerEvent) => {
      if (ptr.id !== null && e.pointerId !== ptr.id) return;
      ptr.id = null;
      ptr.pendingTouchRotate = false;
      orbit.drag = false;
      ptr.down = false;
    };
    window.addEventListener('pointerup', onPointerUp);
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
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
    const DETAIL_OPEN_ANGLE = 0.88;
    const DETAIL_OPEN_SWAY = 0.035;
    function screenPos(b: Book) {
      b.root.getWorldPosition(tmpV).project(camera);
      b.scr.x = (tmpV.x * 0.5 + 0.5) * dims.w;
      b.scr.y = (-tmpV.y * 0.5 + 0.5) * dims.h;
    }
    function tickBook(b: Book, dt: number, t: number) {
      const s = b.springs;
      const inDetail = state.mode === 'detail' && state.selected === b;
      const orbitActive = state.selected === b && state.mode !== 'hero';
      let activity = 0;
      if (orbitActive) {
        if (orbit.drag && inDetail) {
          const step = orbit.dxAcc * 6.5;
          orbit.dxAcc = 0;
          b.orbY += step;
          b.orbYv = clamp(b.orbYv * 0.5 + (step / Math.max(dt, 0.001)) * 0.5, -14, 14);
          b.orbXs.t = clamp(b.orbXs.t + orbit.dyAcc * 3.2, -0.55, 0.55);
          orbit.dyAcc = 0;
          b.orbPhase = 'drag';
        } else {
          b.orbXs.t = 0;
          if (b.orbPhase === 'drag') {
            if (Math.abs(b.orbYv) > 0.6) b.orbPhase = 'spin';
            else {
              b.orbPhase = 'return';
              b.orbTarget = Math.round((b.orbY + b.orbYv * 1.2) / Math.PI) * Math.PI;
            }
          }
          if (b.orbPhase === 'spin') {
            b.orbYv *= Math.exp(-0.9 * dt);
            b.orbY += b.orbYv * dt;
            if (Math.abs(b.orbYv) < 0.5) {
              b.orbPhase = 'return';
              b.orbTarget = Math.round((b.orbY + b.orbYv * 1.2) / Math.PI) * Math.PI;
            }
          } else if (b.orbPhase === 'return') {
            const acc = 16 * (b.orbTarget - b.orbY) - 8 * b.orbYv;
            b.orbYv += acc * dt;
            b.orbY += b.orbYv * dt;
            if (Math.abs(b.orbTarget - b.orbY) < 0.002 && Math.abs(b.orbYv) < 0.01) {
              b.orbY = b.orbTarget;
              b.orbYv = 0;
              b.orbPhase = 'idle';
            }
          }
        }
        const distRest = Math.abs(b.orbY - Math.round(b.orbY / 6.2832) * 6.2832);
        activity = clamp(Math.abs(b.orbYv) * 1.5 + (orbit.drag ? 1 : 0) + distRest * 2, 0, 1);
      }
      b.orbXs.update(dt);
      let coverBase = 0;
      if (inDetail) coverBase = DETAIL_OPEN_ANGLE + Math.sin(t * 0.8 + b.phase) * DETAIL_OPEN_SWAY * idle;
      const fan = orbitActive ? clamp(b.orbYv * 0.16, 0, 0.75) : 0;
      const fanB = orbitActive ? clamp(-b.orbYv * 0.16, 0, 0.75) : 0;
      let coverBBase = 0;
      if (inDetail) coverBBase = 0.2 + Math.sin(t * 0.8 + b.phase + 1.7) * 0.02 * idle;
      s.tiltY.t = 0;
      s.tiltX.t = 0;
      s.lift.t = 0;
      s.cover.t = coverBase + fan;
      s.coverB.t = coverBBase + fanB;
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
      b.float.position.y = Math.sin(t * 0.7 + b.phase) * 0.035 * idle;
      b.float.rotation.z = Math.sin(t * 0.9 + b.phase * 1.7) * 0.006 * idle;
      b.root.position.set(s.px.v, s.py.v, s.pz.v + s.lift.v);
      const sway = inDetail ? Math.sin(t * 0.45 + b.phase) * 0.035 * idle * (1 - activity) : 0;
      b.root.rotation.set(s.rx.v + s.tiltX.v + b.orbXs.v, s.ry.v + s.tiltY.v + b.orbY + sway, s.rz.v);
      b.root.scale.setScalar(Math.max(s.sc.v, 0.001));
      const ang = Math.max(0, s.cover.v + s.drag.v);
      const angB = Math.max(0, s.coverB.v);
      b.pivot.rotation.y = -ang;
      b.pivot.position.z = PIVOT_Z + ang * 0.022;
      b.backPivot.rotation.y = angB;
      b.backPivot.position.z = BPIVOT_Z - angB * 0.022;
      b.spine.rotation.y = -ang * 0.16 + angB * 0.16;
      b.block.scale.z = 1 - (ang + angB) * 0.05;
      b.block.position.z = BLOCK_Z - ang * 0.006 + angB * 0.006;
      for (let i = 0; i < b.pages.length; i++) {
        const fl = idle * Math.sin(t * 1.15 + b.phase + i * 0.6) * 0.006 * (1 - i / b.pages.length);
        b.pages[i].rotation.y = -(ang * b.pageF[i] + Math.max(0, fl));
      }
      for (let i = 0; i < b.pagesB.length; i++) b.pagesB[i].rotation.y = angB * b.pageFB[i];
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
    };
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

    return () => {
      cancelled = true;
      if (sceneApiRef.current) sceneApiRef.current = null;
      if (rafId) cancelAnimationFrame(rafId);
      timeouts.forEach((id) => clearTimeout(id));
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      timer.dispose();
      ro.disconnect();
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('orientationchange', onWindowResize);
      if (visualViewportHandler && window.visualViewport) window.visualViewport.removeEventListener('resize', visualViewportHandler);
      window.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('keydown', onKeydown);
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
  }, [books.length > 0, showDetailPanel]);

  const themeVars = {
    '--bs-navy': themeColors?.navy ?? '#141a32',
    '--bs-pink': themeColors?.pink ?? '#f591ac',
    '--bs-cream': themeColors?.cream ?? '#fdfbf4',
    '--bs-lav': themeColors?.lav ?? '#c9d0ee',
    '--bs-peri': themeColors?.peri ?? '#96a2de',
    '--bs-bg-light': themeColors?.bgLight ?? themeColors?.bg ?? '#fafafa',
    '--bs-bg-dark': themeColors?.bgDark ?? themeColors?.bg ?? '#18181b',
    '--bs-fg-light': themeColors?.foregroundLight ?? '#18181b',
    '--bs-fg-dark': themeColors?.foregroundDark ?? '#fafafa',
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
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--bs-peri)]',
        'transition-colors duration-500 ease-out',
        uiMode === 'closing' ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden',
        uiMode === 'hero' || uiMode === 'opening'
          ? 'bg-[var(--bs-bg-light)] text-[var(--bs-fg-light)] dark:bg-[var(--bs-bg-dark)] dark:text-[var(--bs-fg-dark)]'
          : 'bg-[var(--bs-navy)] text-[var(--bs-cream)]',
        className,
      )}
      onScroll={uiMode === 'hero' ? onGridScroll : undefined}
    >
      <style>{`
        .bs-book-stage {
          perspective: 980px;
          perspective-origin: 50% 42%;
        }
        .bs-book {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transform: rotateX(10deg) rotateY(-26deg);
          transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform;
        }
        .group:hover .bs-book,
        .group:focus-visible .bs-book {
          transform: rotateX(7deg) rotateY(-16deg) translateZ(10px);
        }
        .bs-book-loading {
          transform: rotateX(10deg) rotateY(-26deg) !important;
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
            inset 0 0 0 1px rgba(255,255,255,0.08);
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
            transform: rotateX(10deg) rotateY(-26deg);
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
              {books.map((book) => (
                <GridBookCard
                  key={book.id}
                  book={book}
                  spinning={uiMode === 'opening' && selectedCfg?.id === book.id}
                  onOpen={() => openFromGrid(book)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Occupies exactly one screenful in normal flow (unlike its
          absolutely-positioned children) so Recommendations, appended
          after it, sits below the fold instead of overlapping the book. */}
      <div className={cn('relative w-full shrink-0', shelfActive ? 'h-full' : 'h-0 overflow-hidden')}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn('absolute inset-0 z-[2] block h-full w-full touch-pan-y', !shelfActive && 'pointer-events-none opacity-0')}
      />

      {shelfActive && (
        <button
          ref={closeBtnRef}
          type="button"
          aria-label="Close detail view"
          onClick={() => sceneApiRef.current?.closeCurrent()}
          className={`book-close-btn absolute left-[18px] top-[30px] z-[80] inline-flex h-[52px] w-[52px] items-center justify-center rounded-full border-[1.5px] border-[var(--bs-cream)]/40 bg-transparent text-[17px] leading-none text-[var(--bs-cream)] transition-[opacity,border-color] duration-300 delay-150 hover:border-[var(--bs-cream)]/90 @max-[760px]:top-[88px] ${
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
          className={`pointer-events-auto absolute bottom-2 left-1/2 z-[20] flex -translate-x-1/2 flex-col items-center gap-0.5 text-[var(--bs-cream)]/75 transition-opacity duration-300 ${
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
            @max-[760px]:right-auto @max-[760px]:left-1/2 @max-[760px]:top-50 @max-[760px]:bottom-4
            @max-[760px]:w-[min(560px,92cqw)] @max-[760px]:max-h-none @max-[760px]:-translate-x-1/2
            ${panelVisible ? 'visible' : 'invisible delay-[500ms]'}`}
        >
        <div className="pointer-events-auto min-h-0 flex-1 pr-1">
          <h1 className={`m-0 mb-2 line-clamp-2 text-[var(--bs-pink)] text-[clamp(22px,3.2cqw,42px)] font-extrabold leading-[1.12] tracking-[-0.02em] @max-[760px]:text-[clamp(20px,6cqw,32px)] ${dpChild(50)}`}>
            {selectedCfg?.title}
          </h1>
          <p className={`mt-0 line-clamp-4 max-w-[54ch] text-[var(--bs-lav)] text-[clamp(13px,1.1cqw,16px)] leading-[1.45] @max-[760px]:line-clamp-3 @max-[760px]:text-[13px] ${dpChild(130)}`}>
            {selectedCfg?.desc}
          </p>
          <div className={`mt-3 flex flex-col gap-1.5 ${dpChild(210)}`}>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setReviewsOpen(true)} className="pointer-events-auto inline-flex items-center gap-2 rounded-full" aria-label="Rate and comment">
                <StarsRow value={ratingCount > 0 ? ratingAvg : selectedCfg?.stars ?? 0} className="gap-[3px] [&>svg]:h-4 [&>svg]:w-4" />
                {ratingCount > 0 ? (
                  <span className="text-[13px] text-[#98a4d6]">
                    {ratingAvg.toFixed(1)} · {ratingCount} {ratingCount === 1 ? 'rating' : 'ratings'}
                  </span>
                ) : (
                  <span className="text-[12px] text-[#98a4d6]/80">Catalog rating</span>
                )}
              </button>
              <div className="h-4 w-px bg-[var(--bs-lav)]/[0.28]" />
              <div className="text-[13px] italic text-[#98a4d6]">{selectedCfg?.year}</div>
            </div>
            {ratingCount === 0 ? (
              <p className="text-[12px] text-[var(--bs-lav)]/70">
                Stars shown are set by PlugYard. No reader ratings yet.{' '}
                <button type="button" onClick={() => setReviewsOpen(true)} className="pointer-events-auto font-semibold text-[var(--bs-pink)] underline">
                  Click to rate and comment
                </button>
              </p>
            ) : myRating == null ? (
              <button type="button" onClick={() => setReviewsOpen(true)} className="pointer-events-auto w-fit text-left text-[12px] font-semibold text-[var(--bs-pink)] underline">
                Click to rate and comment
              </button>
            ) : (
              <p className="text-[12px] text-[var(--bs-lav)]/70">
                You rated this {myRating}/5.{' '}
                <button type="button" onClick={() => setReviewsOpen(true)} className="pointer-events-auto font-semibold text-[var(--bs-pink)] underline">
                  Change or comment
                </button>
              </p>
            )}
          </div>
          <div className={`mt-[26px] border-t border-[var(--bs-lav)]/[0.18] @max-[760px]:mt-4 ${dpChild(270)}`} />
          {selectedCfg && (
            <div className={`pointer-events-none mt-5 mb-1 ${dpChild(300)}`}>
              {(() => {
                const ebookKes = Number(selectedCfg.ebookPrice ?? selectedCfg.price ?? 0);
                const audioKes = Number(selectedCfg.audiobookPrice ?? selectedCfg.price ?? 0);
                const rate = 130;
                const hasEbook = selectedCfg.hasEbook !== false;
                const hasAudiobook = selectedCfg.hasAudiobook === true;
                return (
                  <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                    {hasEbook && ebookKes > 0 && (
                      <p className="text-[16px] leading-none">
                        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--bs-lav)]/50">eBook</span>
                        <span className="font-extrabold tabular-nums text-[var(--bs-pink)]">KES {ebookKes.toLocaleString()}</span>
                        <span className="ml-1.5 font-bold tabular-nums text-[var(--bs-cream)]/70">≈ ${(ebookKes / rate).toFixed(2)}</span>
                      </p>
                    )}
                    {hasAudiobook && audioKes > 0 && (
                      <p className="text-[16px] leading-none">
                        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--bs-lav)]/50">Audiobook</span>
                        <span className="font-extrabold tabular-nums text-[var(--bs-pink)]">KES {audioKes.toLocaleString()}</span>
                        <span className="ml-1.5 font-bold tabular-nums text-[var(--bs-cream)]/70">≈ ${(audioKes / rate).toFixed(2)}</span>
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          <div className={`pointer-events-auto mt-4 flex max-w-full flex-wrap items-center gap-[10px] rounded-[28px] bg-[#1a2140] p-[10px] shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${dpChild(330)}`}>
            {(() => {
              const isFree = selectedCfg?.isFree === true;
              const hasEbook = selectedCfg?.hasEbook !== false;
              const hasAudio = selectedCfg?.hasAudiobook === true;
              const canReadEbook = hasEbook && (isFree || !!ownedEbookOrderId);
              const ebookDownloadsOff = selectedCfg?.ebookDownloadable === false;
              const audioDownloadsOff = selectedCfg?.audiobookDownloadable === false;
              const canDlEbook = hasEbook && !ebookDownloadsOff && (isFree || !!ownedEbookOrderId);
              const canDlAudio = hasAudio && !audioDownloadsOff && (isFree || !!ownedAudioOrderId);
              return (
                <>
                  <button
                    type="button"
                    disabled={!canReadEbook}
                    onClick={() => {
                      if (!selectedCfg || !hasEbook) return;
                      if (isFree || (ownedEbookOrderId && buyerEmail)) setReaderOpen(true);
                    }}
                    className="relative inline-flex h-[54px] shrink-0 items-center gap-[10px] rounded-full bg-[var(--bs-cream)] px-[22px] text-[16.5px] font-semibold text-[var(--bs-navy)] hover:scale-[1.04] disabled:opacity-60 @max-[760px]:h-12 @max-[760px]:px-4"
                  >
                    Read
                    {!canReadEbook && <span className="pointer-events-none absolute left-[-6%] right-[-6%] top-1/2 h-[2.5px] -translate-y-1/2 rotate-[-12deg] rounded-full bg-red-500" />}
                  </button>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      disabled={!!buyLoading || (!hasEbook && !hasAudio)}
                      onClick={() => setDownloadMenu((v) => !v)}
                      className="inline-flex h-[54px] items-center justify-center rounded-full bg-[var(--bs-pink)] px-5 text-[16.5px] font-semibold text-[var(--bs-navy)] hover:scale-[1.04] disabled:opacity-60 @max-[760px]:h-12"
                    >
                      {buyLoading ? '…' : 'Download'}
                    </button>
                    {downloadMenu && (
                      <div className="absolute bottom-[110%] left-0 z-30 min-w-[200px] rounded-2xl bg-[#141a32] p-2 text-left text-sm text-white shadow-xl ring-1 ring-white/10">
                        <p className="px-2 pb-1 text-[11px] uppercase tracking-wider text-white/40">Choose a file</p>
                        <button
                          type="button"
                          disabled={!hasEbook || ebookDownloadsOff}
                          className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/10 disabled:opacity-40"
                          onClick={() => {
                            setDownloadMenu(false);
                            if (!selectedCfg || !hasEbook || ebookDownloadsOff) return;
                            if (isFree) {
                              window.location.href = freeBookUrl(selectedCfg.id, 'ebook', false);
                              return;
                            }
                            if (ownedEbookOrderId && buyerEmail) {
                              window.location.href = downloadOrderUrl(ownedEbookOrderId, buyerEmail);
                              return;
                            }
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
                          className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/10 disabled:opacity-40"
                          onClick={() => {
                            setDownloadMenu(false);
                            if (!selectedCfg || !hasAudio || audioDownloadsOff) return;
                            if (isFree) {
                              window.location.href = freeBookUrl(selectedCfg.id, 'audiobook', false);
                              return;
                            }
                            if (ownedAudioOrderId && buyerEmail) {
                              window.location.href = downloadOrderUrl(ownedAudioOrderId, buyerEmail);
                              return;
                            }
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
                      if (isFree || ownedAudioOrderId) {
                        setPlayerOpen(true);
                        return;
                      }
                      setBuyLoading('audiobook');
                      const q = new URLSearchParams({ bookId: selectedCfg.id, type: 'audiobook', title: selectedCfg.title });
                      window.location.href = `/checkout?${q}`;
                    }}
                    className="relative inline-flex h-[54px] shrink-0 items-center justify-center rounded-full bg-[#10152c] px-5 text-[16.5px] font-semibold text-white ring-1 ring-[var(--bs-lav)]/25 disabled:opacity-60 @max-[760px]:h-12"
                  >
                    {!hasAudio ? 'No audio' : isFree || ownedAudioOrderId ? 'Listen' : 'Buy to listen'}
                    {!hasAudio && <span className="pointer-events-none absolute left-[-6%] right-[-6%] top-1/2 h-[2.5px] -translate-y-1/2 rotate-[-12deg] rounded-full bg-red-500" />}
                  </button>
                  <button type="button" onClick={() => void shareBook()} aria-label="Share this book" className="inline-flex h-[54px] shrink-0 w-[54px] items-center justify-center rounded-full bg-[#242c50] text-[var(--bs-cream)] hover:scale-[1.04]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                    </svg>
                  </button>
                  {selectedCfg && selectedCfg.hasEbook !== false && !selectedCfg.isFree && !ownedEbookOrderId && (
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
                      className="inline-flex h-[54px] shrink-0 w-[54px] items-center justify-center rounded-full bg-[#242c50] text-[var(--bs-lav)] transition hover:scale-[1.04] @max-[760px]:h-12 @max-[760px]:w-12"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7}>
                        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  )}
                </>
              );
            })()}
            <button
              type="button"
              aria-label={bookmarked ? 'Remove from bookmarks' : 'Save to bookmarks'}
              aria-pressed={bookmarked}
              onClick={handleSave}
              className={`inline-flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full ${
                bookmarked ? 'bg-[var(--bs-pink)] text-[var(--bs-navy)]' : 'bg-[#242c50] text-[var(--bs-lav)]'
              }`}
            >
              <svg viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.7} className="h-5 w-5">
                <path d="M7 3h10v18l-5-4-5 4z" />
              </svg>
            </button>
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
              <p className="text-[13px] text-foreground/50">Ratings & comments</p>
            </div>
          </header>
          <div className="min-h-0 flex-1 flex flex-col">
            <BookReviews bookId={selectedCfg.id} onClose={() => setReviewsOpen(false)} />
          </div>
        </div>,
        document.body,
      )}

      {readerOpen && selectedCfg && typeof document !== 'undefined' && (selectedCfg.isFree ? selectedCfg.hasEbook !== false : !!(ownedEbookOrderId && buyerEmail)) && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0b1020]">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-3">
            <button type="button" onClick={() => setReaderOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10">×</button>
            <h2 className="min-w-0 flex-1 truncate text-[16px] font-bold text-white">{selectedCfg.title}</h2>
          </header>
          <PdfReader
            bookId={selectedCfg.id}
            url={selectedCfg.isFree ? selectedCfg.pdfUrl || freeBookUrl(selectedCfg.id, 'ebook', true) : `${downloadOrderUrl(ownedEbookOrderId!, buyerEmail!)}&inline=1`}
            watermark={buyerEmail}
          />
        </div>,
        document.body,
      )}

      {previewOpen && selectedCfg && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0b1020]">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-3">
            <button type="button" onClick={() => setPreviewOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10">×</button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[16px] font-bold text-white">Preview · {selectedCfg.title}</h2>
              <p className="text-[12px] text-white/50">First pages only. Buy to read the full book.</p>
            </div>
          </header>
          <PdfReader bookId={selectedCfg.id} url={previewBookUrl(selectedCfg.id)} previewPages={selectedCfg.previewPages} />
        </div>,
        document.body,
      )}

      {playerOpen && selectedCfg && typeof document !== 'undefined' && selectedCfg.hasAudiobook === true && (selectedCfg.isFree || !!(ownedAudioOrderId && buyerEmail)) && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0b1020]">
          <AudioPlayer
            title={selectedCfg.title}
            bookId={selectedCfg.id}
            url={selectedCfg.isFree ? selectedCfg.audioUrl || freeBookUrl(selectedCfg.id, 'audiobook', true) : `${downloadOrderUrl(ownedAudioOrderId!, buyerEmail!)}&inline=1`}
            onClose={() => setPlayerOpen(false)}
            downloadable={selectedCfg.audiobookDownloadable !== false}
            watermark={buyerEmail}
          />
        </div>,
        document.body,
      )}

      {shelfActive && selectedCfg && <RecommendedBooks book={selectedCfg} />}
    </div>
    </div>
  );
}

export default BooksShowcase;