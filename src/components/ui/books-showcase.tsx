'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { cn } from '@/lib/utils';
import { useBookmarks } from '@/components/bookmarks-context';
import { BookReviews } from '@/components/book-reviews';
import { createPortal } from 'react-dom';
import { getPurchases, downloadOrderUrl, freeBookUrl } from '@/lib/api';
import { getStoredUser } from '@/lib/auth-client';
import { PdfReader } from '@/components/pdf-reader';

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
  isFree?: boolean;
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
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

const OPEN_BTN_OFF = ['opacity-0', 'scale-[0.94]'];
const OPEN_BTN_ON = ['opacity-100', 'scale-100'];

export function BooksShowcase({
  books = [],
  heroTitle = 'Books',
  navTitle = 'Bestsellers',
  showNav = true,
  showDetailPanel = true,
  showCarousel = true,
  themeColors,
  className,
  onBookSelect,
  onNearEnd,
}: BooksShowcaseProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const openBtnRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const dpRef = useRef<HTMLDivElement | null>(null);
  const shiftCarouselRef = useRef<(dir: 1 | -1) => void>(() => {});

  const booksRef = useRef(books);
  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  const onBookSelectRef = useRef(onBookSelect);
  useEffect(() => {
    onBookSelectRef.current = onBookSelect;
  }, [onBookSelect]);

  const onNearEndRef = useRef(onNearEnd);
  useEffect(() => {
    onNearEndRef.current = onNearEnd;
  }, [onNearEnd]);

  const [uiMode, setUiMode] = useState<'hero' | 'opening' | 'detail' | 'closing'>('hero');
  const [selectedCfg, setSelectedCfg] = useState<BookCfg | null>(null);
  const [mounted, setMounted] = useState(false);
  const [ownedEbookOrderId, setOwnedEbookOrderId] = useState<number | null>(null);
  const [ownedAudioOrderId, setOwnedAudioOrderId] = useState<number | null>(null);
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyLoading, setBuyLoading] = useState<'ebook' | 'audiobook' | null>(null);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);

  const { isBookmarked, toggleBookmark } = useBookmarks();
  const bookmarked = selectedCfg != null ? isBookmarked(selectedCfg.id) : false;
  const handleSave = () => {
    if (!selectedCfg) return;
    toggleBookmark(selectedCfg);
  };

  const sceneReady = books.length > 0;

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
    const email = (getStoredUser()?.email || sessionStorage.getItem('checkout_email') || '')
      .trim()
      .toLowerCase();
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
    const root = rootRef.current;
    const canvasEl = canvasRef.current;
    if (!root || !canvasEl || !sceneReady) return;

    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const setT = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timeouts.push(id);
      return id;
    };

    const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const IS_PHONE =
      window.matchMedia('(max-width: 760px)').matches ||
      window.matchMedia('(pointer: coarse)').matches;
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
        antialias: !IS_PHONE,
        alpha: true,
        powerPreference: IS_PHONE ? 'low-power' : 'high-performance',
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_PHONE ? 1 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = !IS_PHONE;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const ANISO = IS_PHONE ? 1 : renderer.capabilities.getMaxAnisotropy();

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
    if (!IS_PHONE) {
      const c = mkCanvas(512, 256);
      const x = c.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#5a6ba6');
      g.addColorStop(0.55, '#262e52');
      g.addColorStop(1, '#0a0d1d');
      x.fillStyle = g;
      x.fillRect(0, 0, 512, 256);
      envBlob(x, 140, 66, 95, '255,255,255', 0.95);
      envBlob(x, 405, 84, 55, '255,214,168', 0.55);
      envBlob(x, 256, 150, 120, '255,155,185', 0.28);
      const tx = new THREE.CanvasTexture(c);
      tx.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(tx).texture;
      tx.dispose();
      pmrem.dispose();
    }

    scene.add(new THREE.HemisphereLight(0x8fa0d8, 0x0d1024, 0.32));
    const key = new THREE.DirectionalLight(0xffffff, 0.82);
    key.position.set(3.5, 5, 6);
    key.castShadow = !IS_PHONE;
    if (!IS_PHONE) {
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -4;
      key.shadow.camera.right = 4;
      key.shadow.camera.top = 4;
      key.shadow.camera.bottom = -4;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 20;
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.02;
    }
    scene.add(key);
    const fillLight = new THREE.DirectionalLight(0xa9b6ff, 0.2);
    fillLight.position.set(-4, 1, 4);
    scene.add(fillLight);
    const rim = new THREE.DirectionalLight(0xff9db8, 0.3);
    rim.position.set(-2, 3, -5);
    scene.add(rim);

    const bookRoot = new THREE.Group();
    scene.add(bookRoot);

    function tex(c: HTMLCanvasElement) {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = ANISO;
      return t;
    }

    function loadOrPaint(
      material: THREE.MeshStandardMaterial,
      imageURL: string | null | undefined,
      paintFallback: () => HTMLCanvasElement,
    ) {
      material.map = tex(paintFallback());
      material.needsUpdate = true;
      if (!imageURL) return;
      new THREE.TextureLoader().setCrossOrigin('anonymous').load(
        imageURL,
        (t) => {
          if (cancelled) return;
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = ANISO;
          material.map = t;
          material.needsUpdate = true;
        },
        undefined,
        () => console.warn('Cover image failed to load, kept fallback cover:', imageURL),
      );
    }

    function noiseTexture(base: number, amp: number, scratches: boolean) {
      const s = IS_PHONE ? 64 : 256;
      const c = mkCanvas(s, s);
      const x = c.getContext('2d')!;
      const img = x.createImageData(s, s);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = base + (Math.random() - 0.5) * 2 * amp;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      if (scratches && !IS_PHONE) {
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
    const laminateBump = noiseTexture(128, 10, true);
    const clothBump = (function () {
      const s = IS_PHONE ? 32 : 128;
      const c = mkCanvas(s, s);
      const x = c.getContext('2d')!;
      x.fillStyle = '#808080';
      x.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(c);
    })();

    function striationTexture(vertical: boolean) {
      const s = IS_PHONE ? 128 : 512;
      const c = mkCanvas(s, s);
      const x = c.getContext('2d')!;
      x.fillStyle = '#ece4d2';
      x.fillRect(0, 0, s, s);
      let p = 0;
      while (p < s) {
        const w = 1 + Math.random() * 2.4;
        const tone = Math.random();
        x.fillStyle =
          tone < 0.12 ? 'rgba(140,125,95,.5)' : tone < 0.5 ? 'rgba(255,255,252,.55)' : 'rgba(190,178,150,.45)';
        if (vertical) x.fillRect(p, 0, w, s);
        else x.fillRect(0, p, s, w);
        p += w + 0.6 + Math.random() * 1.6;
      }
      return tex(c);
    }
    const striV = striationTexture(true);
    const striH = striationTexture(false);

    const endpaperTex = (function () {
      const s = IS_PHONE ? 128 : 512;
      const c = mkCanvas(s, s);
      const x = c.getContext('2d')!;
      x.fillStyle = '#f3edde';
      x.fillRect(0, 0, s, s);
      return tex(c);
    })();

    const blobTex = (function () {
      const s = 128;
      const c = mkCanvas(s, s);
      const x = c.getContext('2d')!;
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(0,0,0,.85)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(c);
    })();

    function paintDefaultFront(
      x: CanvasRenderingContext2D,
      w: number,
      h: number,
      o: { title: string; author: string; bg: string },
    ) {
      x.fillStyle = o.bg;
      x.fillRect(0, 0, w, h);
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
      x.font = 'italic 40px Georgia';
      x.fillText(o.author, w / 2, startY + lines.length * 88 + 60);
    }

    function paintBack(x: CanvasRenderingContext2D, w: number, h: number, o: { backBg: string; backInk: string }) {
      x.fillStyle = o.backBg;
      x.fillRect(0, 0, w, h);
      const ink = o.backInk;
      x.fillStyle = 'rgba(' + ink + ',.5)';
      rr(x, 150, 190, w - 460, 28, 14);
      x.fill();
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
      x.restore();
    }

    function trimToWidth(x: CanvasRenderingContext2D, text: string, maxW: number) {
      if (x.measureText(text).width <= maxW) return text;
      let t = text;
      while (t.length > 1 && x.measureText(t + '...').width > maxW) t = t.slice(0, -1);
      return t + '...';
    }

    function makeIndexPageTex(chapters?: string[]) {
      const w = IS_PHONE ? 512 : 1024;
      const h = IS_PHONE ? 768 : 1536;
      const c = mkCanvas(w, h);
      const x = c.getContext('2d')!;
      x.fillStyle = '#f4efdf';
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#2f2a23';
      x.textAlign = 'center';
      x.font = '700 84px Georgia';
      x.fillText('INDEX', w / 2, 190);
      const list =
        chapters && chapters.length
          ? chapters.slice(0, 6)
          : ['Introduction', 'Main Ideas', 'Practical Lessons', 'Case Studies', 'Takeaways', 'Final Notes'];
      x.textAlign = 'left';
      x.font = '500 46px Georgia';
      let y = 318;
      for (let i = 0; i < list.length; i++) {
        x.fillText(String(i + 1).padStart(2, '0') + '. ' + trimToWidth(x, list[i], 650), 150, y);
        y += 112;
      }
      return tex(c);
    }

    const listNow = () => booksRef.current;
    const totalN = () => listNow().length;
    const VISIBLE = 3;
    const COVER_W = IS_PHONE ? 512 : 1024;
    const COVER_H = IS_PHONE ? 768 : 1536;
    const W = 1.42,
      H = 2.14,
      T = 0.34,
      CT = 0.032,
      OV = 0.05;
    const PAGE_N = IS_PHONE ? 3 : 12;
    const PAGE_B = IS_PHONE ? 2 : 6;
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

    const paperFlat = std({ color: 0xf2ecdd, roughness: 0.95, envMapIntensity: 0.2 });
    const striMatV = std({ map: striV, bumpMap: striV, bumpScale: 0.0025, roughness: 0.95, envMapIntensity: 0.2 });
    const striMatH = std({ map: striH, bumpMap: striH, bumpScale: 0.0025, roughness: 0.95, envMapIntensity: 0.2 });
    const endpaperMat = std({ map: endpaperTex, roughness: 0.9, envMapIntensity: 0.25 });
    const pageMats = [0xf4eee0, 0xf1ebdb, 0xf6f0e3].map((c) =>
      std({ color: c, roughness: 0.92, envMapIntensity: 0.22, side: THREE.DoubleSide }),
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

    const bookInstances: (Book | undefined)[] = [];
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
      const edgeColor = cfg.edge ?? '#eee4cf';
      const mEdge = std({
        color: edgeColor,
        bumpMap: laminateBump,
        bumpScale: 0.0035,
        roughness: 0.68,
        envMapIntensity: 0.3,
      });
      const mFront = std({ bumpMap: laminateBump, bumpScale: 0.0035, roughness: 0.54, envMapIntensity: 0.28 });
      const mBack = std({ bumpMap: laminateBump, bumpScale: 0.0035, roughness: 0.58, envMapIntensity: 0.26 });
      const mSpine = std({ bumpMap: clothBump, bumpScale: 0.006, roughness: 0.78, envMapIntensity: 0.22 });

      loadOrPaint(mFront, cfg.images?.front ?? cfg.coverURL ?? null, () => {
        const c = mkCanvas(COVER_W, COVER_H);
        const ctx = c.getContext('2d')!;
        if (cfg.front) cfg.front(ctx, COVER_W, COVER_H);
        else
          paintDefaultFront(ctx, COVER_W, COVER_H, {
            title: cfg.title,
            author: cfg.author,
            bg: cfg.spineBg ?? cfg.backBg ?? '#22252b',
          });
        return c;
      });
      loadOrPaint(mBack, IS_PHONE ? null : cfg.images?.back ?? null, () => {
        const c = mkCanvas(COVER_W, COVER_H);
        const ctx = c.getContext('2d')!;
        if (cfg.back) cfg.back(ctx, COVER_W, COVER_H);
        else paintBack(ctx, COVER_W, COVER_H, { backBg: cfg.backBg ?? '#22252b', backInk: cfg.backInk ?? '255,255,255' });
        return c;
      });
      loadOrPaint(mSpine, IS_PHONE ? null : cfg.images?.spine ?? null, () => {
        const c = mkCanvas(220, COVER_H);
        const ctx = c.getContext('2d')!;
        if (cfg.spine) cfg.spine(ctx, 220, COVER_H);
        else
          paintSpine(ctx, 220, COVER_H, {
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
      backMesh.castShadow = backMesh.receiveShadow = !IS_PHONE;
      backPivot.add(backMesh);
      float.add(backPivot);

      const pivot = new THREE.Group();
      pivot.position.set(-W / 2 - HINGE_OVERLAP, 0, PIVOT_Z);
      const frontMesh = new THREE.Mesh(coverGeo, [mEdge, mEdge, mEdge, mEdge, mFront, endpaperMat]);
      frontMesh.position.x = (W + OV) / 2;
      frontMesh.castShadow = frontMesh.receiveShadow = !IS_PHONE;
      pivot.add(frontMesh);
      float.add(pivot);

      const spine = new THREE.Mesh(spineGeo, mSpine);
      spine.position.set(-W / 2 - 0.013, 0, 0);
      spine.castShadow = !IS_PHONE;
      float.add(spine);

      const block = new THREE.Mesh(blockGeo, [striMatV, paperFlat, striMatH, striMatH, paperFlat, paperFlat]);
      block.position.set(-0.0075, 0, BLOCK_Z);
      block.castShadow = block.receiveShadow = !IS_PHONE;
      float.add(block);

      const pages: THREE.Group[] = [];
      const pageF: number[] = [];
      for (let i = 0; i < PAGE_N; i++) {
        const pp = new THREE.Group();
        pp.position.set(-W / 2 + 0.01, 0, 0.166 - i * 0.0042);
        const pm = new THREE.Mesh(pageGeo, i === 0 ? indexPageMat : pageMats[i % 3]);
        pm.position.x = PW / 2;
        pp.add(pm);
        float.add(pp);
        pages.push(pp);
        pageF.push(0.3 * Math.pow(1 - i / PAGE_N, 2.6));
      }

      const pagesB: THREE.Group[] = [];
      const pageFB: number[] = [];
      for (let i = 0; i < PAGE_B; i++) {
        const pp = new THREE.Group();
        pp.position.set(-W / 2 + 0.01, 0, -0.166 + i * 0.0042);
        const pm = new THREE.Mesh(pageGeo, pageMats[i % 3]);
        pm.position.x = PW / 2;
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

      return {
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
    }

    function ensureBook(index: number): Book | undefined {
      const cfg = listNow()[index];
      if (!cfg) return undefined;
      if (!bookInstances[index]) bookInstances[index] = buildBook(cfg, index);
      return bookInstances[index];
    }

    const bookByHit = (m: THREE.Object3D) => bookInstances.find((b) => b && b.hit === m);

    const leaves = {
      items: [] as any[],
      anchor: null as Book | null,
      activate(book: Book) {
        if (IS_PHONE) return;
        this.anchor = book;
        this.items.forEach((l) => {
          l.s.t = l.size;
          l.mesh.visible = true;
        });
      },
      deactivate() {
        this.items.forEach((l) => {
          l.s.t = 0;
        });
      },
      push() {},
      update(dt: number, t: number) {
        if (IS_PHONE || !this.anchor) return;
        const ap = this.anchor.root.position;
        this.items.forEach((l) => {
          l.mesh.position.set(
            ap.x + l.hx + Math.sin(t * l.sp + l.ph) * 0.4,
            ap.y + l.hy + Math.cos(t * l.sp * 0.83) * 0.3,
            ap.z * 0.4 + l.hz,
          );
          const s = l.s.update(dt);
          l.mesh.scale.setScalar(Math.max(s, 0.0001));
        });
      },
    };
    if (!IS_PHONE) {
      const shape = new THREE.Shape();
      shape.moveTo(0, -0.5);
      shape.bezierCurveTo(0.3, -0.28, 0.3, 0.22, 0, 0.55);
      shape.bezierCurveTo(-0.3, 0.22, -0.3, -0.28, 0, -0.5);
      const geo = new THREE.ShapeGeometry(shape, 6);
      for (let i = 0; i < 8; i++) {
        const mesh = new THREE.Mesh(geo, std({ color: 0x3e7c3f, roughness: 0.55, side: THREE.DoubleSide }));
        mesh.visible = false;
        bookRoot.add(mesh);
        leaves.items.push({
          mesh,
          hx: (Math.random() - 0.5) * 4.6,
          hy: (Math.random() - 0.5) * 3.2,
          hz: -0.5 + Math.random() * 1.5,
          sp: 0.25 + Math.random() * 0.5,
          ph: Math.random() * 6.28,
          size: 0.14 + Math.random() * 0.16,
          s: new Spring(0, 60, 10),
        });
      }
    }

    const state: {
      mode: 'hero' | 'opening' | 'detail' | 'closing';
      selected: Book | null;
      hovered: Book | null;
      pillLock: Book | null;
      kbIndex: number;
    } = { mode: 'hero', selected: null, hovered: null, pillLock: null, kbIndex: -1 };

    type Slot = { p: [number, number, number]; r: [number, number, number]; s: number };
    const SLOTS: { hero: Slot[]; detail: Slot | null; portrait: boolean } = { hero: [], detail: null, portrait: false };

    function computeSlots() {
      const a = dims.w / Math.max(1, dims.h);
      const portrait = a < 0.85;
      const fit = portrait ? clamp(a / 1.08, 0.38, 0.74) : clamp(a / 1.62, 0.52, 1);
      bookRoot.scale.setScalar(fit);
      bookRoot.position.y = -(1 - fit) * 0.28;
      SLOTS.portrait = portrait;
      SLOTS.hero = SLOTS.portrait
        ? [
            { p: [-1.36, -0.58, -0.12], r: [-0.045, 0.4, 0.185], s: 1.25 },
            { p: [0.2, -0.22, 0.6], r: [-0.05, -0.1, -0.035], s: 1.35 },
            { p: [1.62, -0.62, -0.34], r: [-0.045, -0.42, -0.17], s: 1.25 },
          ]
        : [
            { p: [-2.05, -0.58, -0.12], r: [-0.045, 0.4, 0.185], s: 1.22 },
            { p: [0.25, -0.36, 0.6], r: [-0.05, -0.1, -0.035], s: 1.32 },
            { p: [2.35, -0.64, -0.34], r: [-0.045, -0.42, -0.17], s: 1.22 },
          ];
      if (!showDetailPanel) {
        SLOTS.detail = { p: [0, -0.05, 0.75], r: [0.02, -0.34, 0.05], s: SLOTS.portrait ? 0.94 : 1.08 };
        return;
      }
      if (SLOTS.portrait) {
        SLOTS.detail = { p: [0, 0.15, 0.8], r: [-0.02, -0.4, 0.06], s: 0.72 };
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

    const EASE = {
      hold: () => 1,
      outQuad: (t: number) => 1 - (1 - t) * (1 - t),
      outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
      inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
    };
    const LIFT = 0.38,
      CLEAR = 4.2;

    function playY(b: Book, segs: any[]) {
      b.exit = { segs, i: 0, t: 0 };
    }
    function stepY(b: Book, dt: number) {
      const ex = b.exit!;
      const s = b.springs;
      ex.t += dt;
      let seg = ex.segs[ex.i];
      while (seg && ex.t >= seg.d) {
        ex.t -= seg.d;
        s.py.v = seg.to;
        if (seg.end) seg.end();
        seg = ex.segs[++ex.i];
      }
      if (seg) s.py.v = seg.from + (seg.to - seg.from) * seg.ease(ex.t / seg.d);
      else b.exit = null;
      s.py.t = s.py.v;
      s.py.vel = 0;
    }
    function pinInPlace(b: Book) {
      const s = b.springs;
      s.px.t = s.px.v;
      s.pz.t = s.pz.v;
      s.rx.t = s.rx.v;
      s.ry.t = s.ry.v;
      s.rz.t = s.rz.v;
    }
    function sendOut(b: Book, i: number, delay: number) {
      const y0 = SLOTS.hero[i].p[1];
      const here = b.springs.py.v;
      const apex = y0 + LIFT;
      b.root.visible = true;
      pinInPlace(b);
      playY(b, [
        { d: delay, from: here, to: here, ease: EASE.hold },
        { d: 0.28, from: here, to: apex, ease: EASE.outQuad },
        { d: 0.9, from: apex, to: y0 - CLEAR, ease: EASE.inOutSine, end: () => { b.root.visible = false; } },
      ]);
    }
    function bringBack(b: Book, i: number, delay: number) {
      const here = b.springs.py.v;
      b.root.visible = true;
      pinInPlace(b);
      playY(b, [
        { d: delay, from: here, to: here, ease: EASE.hold },
        { d: 1.0, from: here, to: SLOTS.hero[i].p[1], ease: EASE.outQuint },
      ]);
    }

    function windowIndices(start: number, total: number, count: number) {
      const arr: number[] = [];
      const n = Math.max(total, 1);
      const c = Math.min(count, n);
      for (let i = 0; i < c; i++) arr.push((start + i) % n);
      return arr;
    }

    let carouselStart = 0;
    let currentWindow: number[] = windowIndices(0, totalN(), Math.min(VISIBLE, totalN()));
    let carouselBusy = false;

    function rebuildHitMeshes() {
      hitMeshes.length = 0;
      currentWindow.forEach((bi) => {
        const b = ensureBook(bi);
        if (b) hitMeshes.push(b.hit);
      });
    }

    function applyMode() {
      if (state.mode === 'hero' || state.mode === 'closing') {
        currentWindow.forEach((bi, i) => {
          const slot = SLOTS.hero[i];
          const b = ensureBook(bi);
          if (slot && b) setTargets(b, slot);
        });
      } else if (state.selected) {
        setTargets(state.selected, SLOTS.detail!);
      }
    }

    function shiftCarousel(dir: 1 | -1) {
      const N = totalN();
      if (carouselBusy || state.mode !== 'hero' || N <= VISIBLE) return;
      carouselBusy = true;
      const outgoing = currentWindow;
      carouselStart = (((carouselStart + dir) % N) + N) % N;
      const incoming = windowIndices(carouselStart, N, VISIBLE);
      incoming.forEach((bi) => ensureBook(bi));

      const toHide = outgoing.filter((bi) => !incoming.includes(bi));
      toHide.forEach((bi) => {
        const oldIdx = outgoing.indexOf(bi);
        const slot = SLOTS.hero[oldIdx];
        const b = bookInstances[bi];
        if (slot && b) b.springs.px.t = slot.p[0] - dir * 6.5;
      });
      setT(() =>
        toHide.forEach((bi) => {
          const b = bookInstances[bi];
          if (b) b.root.visible = false;
        }),
      650);

      incoming.forEach((bi, i) => {
        const slot = SLOTS.hero[i];
        const b = bookInstances[bi];
        if (!slot || !b) return;
        const alreadyOnScreen = outgoing.includes(bi);
        b.root.visible = true;
        if (!alreadyOnScreen) {
          b.springs.px.set(slot.p[0] + dir * 6.5);
          b.springs.py.set(slot.p[1]);
          b.springs.pz.set(slot.p[2]);
          b.springs.rx.set(slot.r[0]);
          b.springs.ry.set(slot.r[1]);
          b.springs.rz.set(slot.r[2]);
          b.springs.sc.set(slot.s * 0.92);
        }
        setTargets(b, slot);
      });

      currentWindow = incoming;
      rebuildHitMeshes();
      if (N >= 3 && carouselStart + VISIBLE >= N - 1) onNearEndRef.current?.();
      setT(() => {
        carouselBusy = false;
      }, 700);
    }
    shiftCarouselRef.current = shiftCarousel;

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

    const pillX = new Spring(0, 190, 23),
      pillY = new Spring(0, 190, 23);
    let pillOn = false;
    function showPill() {
      const el = openBtnRef.current;
      if (!el) return;
      el.classList.remove(...OPEN_BTN_OFF);
      el.classList.add(...OPEN_BTN_ON);
      pillOn = true;
    }
    function hidePill() {
      const el = openBtnRef.current;
      if (el) {
        el.classList.remove(...OPEN_BTN_ON);
        el.classList.add(...OPEN_BTN_OFF);
      }
      pillOn = false;
    }

    function open(book: Book | null) {
      if (state.mode !== 'hero' || !book) return;
      state.mode = 'opening';
      setUiMode('opening');
      state.selected = book;
      state.pillLock = null;
      state.kbIndex = -1;
      hidePill();
      book.exit = null;
      root!.classList.add('bs-transit');
      setSelectedCfg(book.cfg);
      onBookSelectRef.current?.(book.cfg);
      computeSlots();
      let out = 0;
      currentWindow.forEach((bi, i) => {
        const b = bookInstances[bi];
        if (b && b !== book) sendOut(b, i, out++ * 0.08);
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
      }, 760);
      setT(() => leaves.activate(book), 1000);
      setT(() => {
        if (state.mode === 'opening') {
          currentWindow.forEach((bi) => {
            const sibling = bookInstances[bi];
            if (sibling && sibling !== book) {
              sibling.exit = null;
              sibling.root.visible = false;
            }
          });
          root!.classList.add('bs-detail-open');
          state.mode = 'detail';
          setUiMode('detail');
        }
      }, 1400);
    }

    function close() {
      if (state.mode !== 'detail') return;
      state.mode = 'closing';
      setUiMode('closing');
      root!.classList.remove('bs-detail-open');
      onBookSelectRef.current?.(null);
      leaves.deactivate();
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
        applyMode();
        camTo('hero');
        let back = 0;
        currentWindow.forEach((bi, i) => {
          const bk = bookInstances[bi];
          if (bk && bk !== b) bringBack(bk, i, 0.85 + back++ * 0.1);
        });
      }, 250);
      setT(() => {
        if (state.mode === 'closing') {
          state.mode = 'hero';
          setUiMode('hero');
          state.selected = null;
          setSelectedCfg(null);
        }
      }, 1600);
    }

    const onCloseClick = () => close();
    closeBtnRef.current?.addEventListener('click', onCloseClick);

    const ptr = {
      ndcX: 0,
      ndcY: 0,
      cx: 0,
      cy: 0,
      lastX: 0,
      lastY: 0,
      down: false,
      downX: 0,
      downY: 0,
      moved: 0,
      t0: 0,
      type: 'mouse',
      seen: false,
      id: null as number | null,
    };
    const isTouch = () => ptr.type === 'touch' || ptr.type === 'pen';
    let dragBook: Book | null = null;
    let rayBook: Book | null = null;
    const orbit = { drag: false, dxAcc: 0, dyAcc: 0 };
    const ray = new THREE.Raycaster();
    const tmpV = new THREE.Vector3();
    const canvas = canvasEl;

    const onContextMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', onContextMenu);
    const onPointerLeave = () => {
      rayBook = null;
      state.pillLock = null;
      state.kbIndex = -1;
    };
    canvas.addEventListener('pointerleave', onPointerLeave);
    const localXY = (e: PointerEvent) => {
      const r = root!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (ptr.id !== null && e.pointerId !== ptr.id) return;
      const { x: cx, y: cy } = localXY(e);
      const dxN = (cx - ptr.lastX) / dims.w;
      const dyN = (cy - ptr.lastY) / dims.h;
      ptr.lastX = cx;
      ptr.lastY = cy;
      ptr.cx = cx;
      ptr.cy = cy;
      ptr.ndcX = (cx / dims.w) * 2 - 1;
      ptr.ndcY = -(cy / dims.h) * 2 + 1;
      ptr.type = e.pointerType || 'mouse';
      ptr.seen = true;
      if (ptr.down && dragBook) {
        ptr.moved += Math.abs(dxN * dims.w) + Math.abs(dyN * dims.h);
        dragBook.springs.drag.t = clamp(((ptr.downX - cx) / dims.w) * 3.4, 0, 1.0);
      }
      if (ptr.down && orbit.drag) {
        orbit.dxAcc += dxN;
        orbit.dyAcc += dyN;
        ptr.moved += Math.abs(dxN * dims.w) + Math.abs(dyN * dims.h);
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
      ptr.ndcX = (cx / dims.w) * 2 - 1;
      ptr.ndcY = -(cy / dims.h) * 2 + 1;
      ptr.type = e.pointerType || 'mouse';
      ptr.seen = true;
      castRay();
      if (state.mode === 'hero' && rayBook) {
        ptr.down = true;
        dragBook = rayBook;
        ptr.downX = cx;
        ptr.downY = cy;
        ptr.moved = 0;
        ptr.t0 = performance.now();
        canvas.setPointerCapture(e.pointerId);
      } else if (state.mode === 'detail' && rayBook === state.selected) {
        ptr.down = true;
        orbit.drag = true;
        orbit.dxAcc = 0;
        orbit.dyAcc = 0;
        ptr.moved = 0;
        ptr.t0 = performance.now();
        canvas.setPointerCapture(e.pointerId);
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    const onPointerUp = (e: PointerEvent) => {
      if (ptr.id !== null && e.pointerId !== ptr.id) return;
      ptr.id = null;
      orbit.drag = false;
      if (dragBook) {
        const slop = isTouch() ? 26 : 14;
        const limit = isTouch() ? 650 : 450;
        const wasDrag = ptr.moved > slop;
        dragBook.springs.drag.t = 0;
        if (!wasDrag && state.mode === 'hero' && performance.now() - ptr.t0 < limit) open(dragBook);
        dragBook = null;
      }
      ptr.down = false;
      if (isTouch()) rayBook = null;
    };
    window.addEventListener('pointerup', onPointerUp);
    const cancelPointer = (e?: PointerEvent) => {
      if (e && ptr.id !== null && e.pointerId !== ptr.id) return;
      ptr.id = null;
      ptr.down = false;
      orbit.drag = false;
      if (dragBook) {
        dragBook.springs.drag.t = 0;
        dragBook = null;
      }
      if (isTouch()) rayBook = null;
    };
    window.addEventListener('pointercancel', cancelPointer as any);
    canvas.addEventListener('lostpointercapture', cancelPointer as any);
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (state.mode !== 'hero') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (e.shiftKey) shiftCarousel(e.key === 'ArrowRight' ? 1 : -1);
        e.preventDefault();
      }
      if (e.key === 'Enter' && state.hovered) open(state.hovered);
    };
    root.addEventListener('keydown', onKeydown);

    function castRay() {
      ray.setFromCamera({ x: ptr.ndcX, y: ptr.ndcY } as THREE.Vector2, camera);
      const hits = ray.intersectObjects(hitMeshes, false);
      if (hits.length) {
        rayBook = bookByHit(hits[0].object) || null;
      } else rayBook = null;
    }

    const timer = new THREE.Timer();
    timer.connect(document);
    const idle = RM || IS_PHONE ? 0.35 : 1;
    const DETAIL_OPEN_ANGLE = 0.88;
    const DETAIL_OPEN_SWAY = 0.035;

    function screenPos(b: Book) {
      b.root.getWorldPosition(tmpV).project(camera);
      b.scr.x = (tmpV.x * 0.5 + 0.5) * dims.w;
      b.scr.y = (-tmpV.y * 0.5 + 0.5) * dims.h;
    }

    function tickBook(b: Book, dt: number, t: number) {
      const s = b.springs;
      const isHov = state.hovered === b;
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
      if (isHov && ptr.seen && state.mode === 'hero') {
        s.lift.t = 0.3;
        coverBase = 0;
      } else {
        s.tiltY.t = 0;
        s.tiltX.t = 0;
        s.lift.t = 0;
      }
      s.cover.t = coverBase + fan;
      s.coverB.t = coverBBase + fanB;
      s.sc.t = b.slotScale * (isHov && state.mode === 'hero' ? 1.09 : 1);
      s.px.update(dt);
      if (b.exit) stepY(b, dt);
      else s.py.update(dt);
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
      b.root.position.set(s.px.v, s.py.v, s.pz.v + s.lift.v);
      const sway = inDetail ? Math.sin(t * 0.45 + b.phase) * 0.035 * idle * (1 - activity) : 0;
      b.root.rotation.set(s.rx.v + s.tiltX.v + b.orbXs.v, s.ry.v + s.tiltY.v + b.orbY + sway, s.rz.v);
      b.root.scale.setScalar(Math.max(s.sc.v, 0.001));
      const ang = Math.max(0, s.cover.v + s.drag.v);
      const angB = Math.max(0, s.coverB.v);
      b.pivot.rotation.y = -ang;
      b.backPivot.rotation.y = angB;
      for (let i = 0; i < PAGE_N; i++) b.pages[i].rotation.y = -(ang * b.pageF[i]);
      for (let i = 0; i < PAGE_B; i++) b.pagesB[i].rotation.y = angB * b.pageFB[i];
    }

    function activeBooks(): Book[] {
      const out: Book[] = [];
      currentWindow.forEach((i) => {
        const b = bookInstances[i];
        if (b) out.push(b);
      });
      if (state.selected && !out.includes(state.selected)) out.push(state.selected);
      return out;
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
      let hov: Book | null = null;
      if (state.mode === 'hero') hov = rayBook || state.pillLock || null;
      else if (state.mode === 'detail') hov = rayBook === state.selected ? rayBook : null;
      state.hovered = hov;
      const live = activeBooks();
      live.forEach((b) => screenPos(b));
      live.forEach((b) => tickBook(b, dt, t));
      leaves.update(dt, t);
      parX.t = RM ? 0 : ptr.ndcX * 0.02;
      parY.t = RM ? 0 : -ptr.ndcY * 0.012;
      bookRoot.rotation.y = parX.update(dt);
      bookRoot.rotation.x = parY.update(dt);
      camera.position.set(camX.update(dt), camY.update(dt), camZ.update(dt));
      camera.lookAt(lookX.update(dt), lookY.update(dt), 0);
      if (state.mode === 'hero' && state.hovered && ptr.seen && !isTouch() && !(ptr.down && ptr.moved > 14)) {
        if (!pillOn) {
          pillX.set(ptr.cx);
          pillY.set(ptr.cy + 34);
        }
        pillX.t = ptr.cx;
        pillY.t = ptr.cy + 34;
        if (openBtnRef.current) {
          openBtnRef.current.style.left = pillX.update(dt) + 'px';
          openBtnRef.current.style.top = pillY.update(dt) + 'px';
        }
        if (!pillOn) showPill();
      } else hidePill();
      renderer.render(scene, camera);
    }

    function resumeAnimation() {
      if (!rafId && !cancelled && isInViewport && !document.hidden) animate();
    }

    function relayout() {
      const r = root!.getBoundingClientRect();
      dims.w = Math.max(1, Math.round(r.width));
      dims.h = Math.max(1, Math.round(r.height));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_PHONE || dims.w < 800 ? 1 : 2));
      renderer.setSize(dims.w, dims.h);
      camera.aspect = dims.w / dims.h;
      camera.updateProjectionMatrix();
      computeSlots();
      applyMode();
      camTo(state.mode === 'detail' || state.mode === 'opening' ? 'detail' : 'hero');
    }

    relayout();
    currentWindow.forEach((bi, i) => {
      const b = ensureBook(bi);
      const slot = SLOTS.hero[i];
      if (!b || !slot) return;
      const s = b.springs;
      s.px.set(slot.p[0]);
      s.py.set(slot.p[1] - 3.9);
      s.pz.set(slot.p[2]);
      s.rx.set(slot.r[0]);
      s.ry.set(slot.r[1]);
      s.rz.set(slot.r[2]);
      s.sc.set(slot.s);
      b.slotScale = slot.s;
      setT(() => setTargets(b, slot), 240 + i * 150);
    });
    rebuildHitMeshes();
    const N0 = totalN();
    if (N0 >= 3 && N0 <= VISIBLE + 1) onNearEndRef.current?.();
    camTo('hero');
    animate();

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
    const ro = new ResizeObserver(() => relayout());
    ro.observe(root);

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      timeouts.forEach((id) => clearTimeout(id));
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      timer.dispose();
      ro.disconnect();
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', cancelPointer as any);
      root.removeEventListener('keydown', onKeydown);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('lostpointercapture', cancelPointer as any);
      closeBtnRef.current?.removeEventListener('click', onCloseClick);
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
      renderer.dispose();
    };
  }, [sceneReady, showDetailPanel]);

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
  const heroWordVisible = mounted && uiMode === 'hero';
  const canCarousel = showCarousel && books.length > 3;
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

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      role="region"
      aria-label={`${heroTitle} book showcase`}
      data-state={uiMode}
      className={cn(
        'book-showcase relative isolate h-full min-h-[560px] overflow-hidden font-sans outline-none [container-type:size] [-webkit-tap-highlight-color:transparent]',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--bs-peri)]',
        'transition-colors duration-500 ease-out',
        uiMode === 'hero'
          ? 'bg-[var(--bs-bg-light)] text-[var(--bs-fg-light)] dark:bg-[var(--bs-bg-dark)] dark:text-[var(--bs-fg-dark)]'
          : 'bg-[var(--bs-navy)] text-[var(--bs-cream)]',
        className,
      )}
      style={themeVars}
    >
      <div
        className={`pointer-events-none absolute left-1/2 top-[18%] z-[1] -translate-x-1/2 select-none transition-all duration-500 ease-out ${
          heroWordVisible
            ? 'translate-y-0 opacity-100'
            : uiMode === 'hero'
              ? 'translate-y-[60px] opacity-0'
              : '-translate-y-11 opacity-0'
        }`}
      >
        <span className="block whitespace-nowrap text-current text-[clamp(4.5rem,22.5cqw,18rem)] font-extrabold leading-[0.85] tracking-[-0.015em]">
          {heroTitle}
        </span>
      </div>

      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 z-[2] block h-full w-full touch-none" />

      {books.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-8 text-center text-sm text-current opacity-60">
          Add at least one book to display the showcase.
        </div>
      )}

      {showNav && (
        <nav
          aria-hidden={uiMode !== 'hero'}
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between px-[clamp(20px,4cqw,42px)] py-[clamp(18px,3cqh,26px)] transition-opacity duration-300',
            uiMode === 'hero' ? 'opacity-100' : 'opacity-0',
          )}
        >
          <div className="text-[clamp(20px,2.2cqw,29px)] font-extrabold tracking-[-0.01em] text-current">{navTitle}</div>
        </nav>
      )}

      {canCarousel && (
        <>
          <button
            type="button"
            aria-label="Previous books"
            onClick={() => shiftCarouselRef.current(-1)}
            className={`absolute left-3 top-1/2 z-30 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bs-cream)]/90 text-[var(--bs-navy)] shadow-lg transition-all duration-300 hover:scale-105 hover:bg-[var(--bs-cream)] @min-[768px]:left-6 @min-[768px]:h-12 @min-[768px]:w-12 ${
              uiMode === 'hero' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            aria-label="Next books"
            onClick={() => shiftCarouselRef.current(1)}
            className={`absolute right-3 top-1/2 z-30 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bs-cream)]/90 text-[var(--bs-navy)] shadow-lg transition-all duration-300 hover:scale-105 hover:bg-[var(--bs-cream)] @min-[768px]:right-6 @min-[768px]:h-12 @min-[768px]:w-12 ${
              uiMode === 'hero' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <ChevronRight />
          </button>
        </>
      )}

      <button
        ref={openBtnRef}
        tabIndex={-1}
        aria-hidden="true"
        className={
          'absolute left-0 top-0 z-30 -translate-x-1/2 -translate-y-1/2 rotate-[-1.6deg] px-[38px] pb-[18px] pt-4 ' +
          'text-[15px] font-bold uppercase tracking-[0.1em] text-[var(--bs-navy)] pointer-events-none ' +
          'transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[left,top,opacity,transform] ' +
          OPEN_BTN_OFF.join(' ')
        }
      >
        Open
      </button>

      <button
        ref={closeBtnRef}
        type="button"
        aria-label="Close detail view"
        className={`book-close-btn absolute left-1/2 top-[30px] z-[80] -translate-x-1/2 inline-flex h-[52px] w-[52px] items-center justify-center rounded-full border-[1.5px] border-[var(--bs-cream)]/40 bg-transparent text-[17px] leading-none text-[var(--bs-cream)] transition-[opacity,border-color] duration-300 delay-150 hover:border-[var(--bs-cream)]/90 @max-[760px]:left-auto @max-[760px]:right-[18px] @max-[760px]:top-[88px] @max-[760px]:translate-x-0 ${
          uiMode === 'detail' ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        &#10005;
      </button>

      {showDetailPanel && (
        <div
          ref={dpRef}
          aria-live="polite"
          className={`absolute right-[5%] top-8 bottom-4 z-[15] flex w-[min(520px,40%)] flex-col justify-start pt-0 pointer-events-none
            @max-[760px]:right-auto @max-[760px]:left-1/2 @max-[760px]:top-50 @max-[760px]:bottom-4
            @max-[760px]:w-[min(560px,92cqw)] @max-[760px]:max-h-none @max-[760px]:-translate-x-1/2
            ${panelVisible ? 'visible' : 'invisible delay-[500ms]'}`}
        >
          <h1
            className={`m-0 mb-2 line-clamp-2 max-w-full break-words text-[var(--bs-pink)] text-[clamp(22px,3.2cqw,42px)] font-extrabold leading-[1.12] tracking-[-0.02em] [overflow-wrap:anywhere] @max-[760px]:text-[clamp(20px,6cqw,32px)] ${dpChild(50)}`}
          >
            {selectedCfg?.title}
          </h1>
          <p
            className={`mt-0 line-clamp-4 max-w-[54ch] text-[var(--bs-lav)] text-[clamp(13px,1.1cqw,16px)] leading-[1.45] @max-[760px]:line-clamp-3 @max-[760px]:text-[13px] ${dpChild(130)}`}
          >
            {selectedCfg?.desc}
          </p>
          <div className={`mt-3 flex items-center gap-3 ${dpChild(210)}`}>
            <div className="flex gap-[3px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <svg
                  key={i}
                  viewBox="0 0 24 24"
                  className={`h-4 w-4 fill-[var(--bs-pink)] ${i < (selectedCfg?.stars ?? 0) ? '' : 'opacity-25'}`}
                >
                  <path d="M12 2.6l2.8 6 6.6.6-5 4.4 1.5 6.5L12 16.7 6.1 20.1l1.5-6.5-5-4.4 6.6-.6z" />
                </svg>
              ))}
            </div>
            <div className="h-4 w-px bg-[var(--bs-lav)]/[0.28]" />
            <div className="text-[13px] italic text-[#98a4d6]">{selectedCfg?.year}</div>
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
                        <span className="font-extrabold tabular-nums text-[var(--bs-pink)]">
                          KES {ebookKes.toLocaleString()}
                        </span>
                        <span className="ml-1.5 font-bold tabular-nums text-[var(--bs-cream)]/70">
                          ≈ ${(ebookKes / rate).toFixed(2)}
                        </span>
                      </p>
                    )}
                    {hasAudiobook && audioKes > 0 && (
                      <p className="text-[16px] leading-none">
                        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--bs-lav)]/50">
                          Audio
                        </span>
                        <span className="font-extrabold tabular-nums text-[var(--bs-pink)]">
                          KES {audioKes.toLocaleString()}
                        </span>
                        <span className="ml-1.5 font-bold tabular-nums text-[var(--bs-cream)]/70">
                          ≈ ${(audioKes / rate).toFixed(2)}
                        </span>
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <div
            className={`pointer-events-auto mt-4 inline-flex max-w-full flex-wrap items-center gap-[10px] rounded-full bg-[#1a2140] p-[10px] shadow-[0_24px_60px_rgba(0,0,0,0.45)] @max-[760px]:mt-3 @max-[760px]:rounded-[28px] ${dpChild(330)}`}
          >
            {(() => {
              const isFree = selectedCfg?.isFree === true;
              const hasEbook = selectedCfg?.hasEbook !== false;
              const hasAudio = selectedCfg?.hasAudiobook === true;
              const canReadEbook = hasEbook && (isFree || !!ownedEbookOrderId);
              return (
                <>
                  <button
                    type="button"
                    disabled={!canReadEbook}
                    onClick={() => {
                      if (!selectedCfg || !hasEbook) return;
                      if (isFree || (ownedEbookOrderId && buyerEmail)) setReaderOpen(true);
                    }}
                    className="relative inline-flex h-[54px] items-center gap-[10px] rounded-full bg-[var(--bs-cream)] px-[26px] text-[16.5px] font-semibold text-[var(--bs-navy)] @max-[760px]:h-12 @max-[760px]:px-5 @max-[760px]:text-[15px]"
                  >
                    <span className="relative inline-block">
                      Read
                      {!canReadEbook && (
                        <span className="pointer-events-none absolute left-[-8%] right-[-8%] top-1/2 h-[2.5px] -translate-y-1/2 rotate-[-12deg] rounded-full bg-red-500" />
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={!!buyLoading || !hasEbook}
                    onClick={() => {
                      if (!selectedCfg || buyLoading || !hasEbook) return;
                      if (isFree) {
                        window.location.href = freeBookUrl(selectedCfg.id, 'ebook', false);
                        return;
                      }
                      if (ownedEbookOrderId && buyerEmail) {
                        window.location.href = downloadOrderUrl(ownedEbookOrderId, buyerEmail);
                        return;
                      }
                      setBuyLoading('ebook');
                      const q = new URLSearchParams({
                        bookId: selectedCfg.id,
                        type: 'ebook',
                        title: selectedCfg.title,
                      });
                      window.location.href = `/checkout?${q}`;
                    }}
                    className="relative inline-flex h-[54px] min-w-[120px] items-center justify-center rounded-full bg-[var(--bs-pink)] px-6 text-[16.5px] font-semibold text-[var(--bs-navy)] @max-[760px]:h-12 @max-[760px]:px-5"
                  >
                    {buyLoading === 'ebook' ? '…' : isFree || ownedEbookOrderId ? 'Download' : 'Buy Now'}
                  </button>
                  <button
                    type="button"
                    disabled={!!buyLoading || !hasAudio}
                    onClick={() => {
                      if (!selectedCfg || buyLoading || !hasAudio) return;
                      if (isFree) {
                        window.location.href = freeBookUrl(selectedCfg.id, 'audiobook', false);
                        return;
                      }
                      if (ownedAudioOrderId && buyerEmail) {
                        window.location.href = downloadOrderUrl(ownedAudioOrderId, buyerEmail);
                        return;
                      }
                      setBuyLoading('audiobook');
                      const q = new URLSearchParams({
                        bookId: selectedCfg.id,
                        type: 'audiobook',
                        title: selectedCfg.title,
                      });
                      window.location.href = `/checkout?${q}`;
                    }}
                    className="relative inline-flex h-[54px] min-w-[140px] items-center justify-center rounded-full bg-[#10152c] px-5 text-[16.5px] font-semibold text-white @max-[760px]:h-12"
                  >
                    <span className="relative inline-block">
                      {buyLoading === 'audiobook'
                        ? '…'
                        : isFree || ownedAudioOrderId
                          ? 'Download audio'
                          : 'Buy Audiobook'}
                      {!hasAudio && (
                        <span className="pointer-events-none absolute left-[-6%] right-[-6%] top-1/2 h-[2.5px] -translate-y-1/2 rotate-[-12deg] rounded-full bg-red-500" />
                      )}
                    </span>
                  </button>
                </>
              );
            })()}
            <button
              type="button"
              aria-label={bookmarked ? 'Remove from bookmarks' : 'Save to bookmarks'}
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

          {selectedCfg && (
            <div className={`pointer-events-auto mt-6 ${dpChild(330)}`}>
              <button
                type="button"
                onClick={() => setReviewsOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--bs-lav)]/30 bg-[#1a2140]/80 px-5 py-3 text-[15px] font-semibold text-[var(--bs-cream)]"
              >
                Ratings & comments
                <span aria-hidden>→</span>
              </button>
            </div>
          )}
        </div>
      )}

      {reviewsOpen &&
        selectedCfg &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
            <header className="mt-16 flex h-14 shrink-0 items-center gap-3 border-b border-foreground/10 bg-background px-3">
              <button type="button" onClick={() => setReviewsOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/10">
                ×
              </button>
              <h2 className="truncate text-[17px] font-bold">{selectedCfg.title}</h2>
            </header>
            <BookReviews bookId={selectedCfg.id} onClose={() => setReviewsOpen(false)} />
          </div>,
          document.body,
        )}

      {readerOpen &&
        selectedCfg &&
        typeof document !== 'undefined' &&
        (selectedCfg.isFree ? selectedCfg.hasEbook !== false : !!(ownedEbookOrderId && buyerEmail)) &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0b1020]">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-3">
              <button type="button" onClick={() => setReaderOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-white">
                ×
              </button>
              <h2 className="min-w-0 flex-1 truncate text-[16px] font-bold text-white">{selectedCfg.title}</h2>
            </header>
            <PdfReader
              url={
                selectedCfg.isFree
                  ? freeBookUrl(selectedCfg.id, 'ebook', true)
                  : `${downloadOrderUrl(ownedEbookOrderId!, buyerEmail!)}&inline=1`
              }
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

export default BooksShowcase;