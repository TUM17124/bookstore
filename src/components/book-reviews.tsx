'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getToken,
  getRatings,
  postRating,
  getComments,
  postComment,
} from '@/lib/api';

type User = {
  id: string;
  name: string | null;
  email: string | null;
  image?: string | null;
};

type Comment = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  userRating: number | null;
  user: User;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function Stars({
  value,
  interactive,
  onPick,
  disabled,
}: {
  value: number;
  interactive?: boolean;
  onPick?: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!interactive || disabled}
          onClick={() => onPick?.(n)}
          className={`text-2xl leading-none transition ${
            n <= value ? 'text-[#f591ac]' : 'text-foreground/20'
          } ${interactive && !disabled ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
          aria-label={`${n} stars`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function Avatar({
  user,
  size = 'md',
}: {
  user: Partial<User>;
  size?: 'sm' | 'md';
}) {
  const s = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  const label = (user.name || user.email || '?').slice(0, 1).toUpperCase();
  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={user.image} alt="" className={`${s} rounded-full object-cover`} />
    );
  }
  return (
    <div
      className={`${s} flex shrink-0 items-center justify-center rounded-full bg-[#141a32] font-bold text-[#fdfbf4] ring-1 ring-foreground/10 dark:bg-[#1a2140]`}
    >
      {label}
    </div>
  );
}

export function BookReviews({
  bookId,
  onClose,
}: {
  bookId: string;
  onClose?: () => void;
}) {
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [auth, setAuth] = useState(false);

  useEffect(() => {
    setAuth(!!getToken());
  }, []);

  const canComment = auth && myRating != null;

  async function load() {
    try {
      const [r, c] = await Promise.all([
        getRatings(bookId),
        getComments(bookId),
      ]);
      setAverage(r.average ?? 0);
      setCount(r.count ?? 0);
      setMyRating(r.myRating ?? null);
      setComments(
        c.map((item) => ({
          id: String(item.id),
          body: item.body,
          parentId: item.parentId != null ? String(item.parentId) : null,
          createdAt: item.created_at,
          userRating: item.userRating,
          user: {
            id: item.user_email || String(item.id),
            name: item.user_name,
            email: item.user_email,
          },
        })),
      );
    } catch {
      setError('Could not load reviews.');
    }
  }

  useEffect(() => {
    setError('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const tree = useMemo(() => {
    const roots = comments.filter((c) => !c.parentId);
    const byParent = new Map<string, Comment[]>();
    comments.forEach((c) => {
      if (!c.parentId) return;
      const list = byParent.get(c.parentId) || [];
      list.push(c);
      byParent.set(c.parentId, list);
    });
    return { roots, byParent };
  }, [comments]);

  async function rate(value: number) {
    if (!getToken()) {
      window.location.href = '/login';
      return;
    }
    setBusy(true);
    setError('');
    try {
      await postRating(bookId, value);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save rating');
    }
    setBusy(false);
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!canComment || !text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await postComment(bookId, text, replyTo?.id ?? null);
      setText('');
      setReplyTo(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
    }
    setBusy(false);
  }

  function CommentCard({ c, depth = 0 }: { c: Comment; depth?: number }) {
    const name = c.user.name || c.user.email || 'Reader';
    const handle = (c.user.email || c.user.name || 'user')
      .split('@')[0]
      .replace(/\s+/g, '')
      .toLowerCase();
    const kids = tree.byParent.get(c.id) || [];

    return (
      <div
        className={
          depth ? 'ml-4 border-l border-foreground/10 pl-4 sm:ml-6 sm:pl-5' : ''
        }
      >
        <article className="group rounded-2xl px-1 py-3 transition hover:bg-foreground/[0.03] sm:px-2">
          <div className="flex gap-3">
            <Avatar user={c.user} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px]">
                <span className="font-semibold">{name}</span>
                <span className="text-foreground/45">@{handle}</span>
                <span className="text-foreground/35">·</span>
                <time className="text-foreground/45">{timeAgo(c.createdAt)}</time>
              </div>
              {c.userRating != null && (
                <div className="mt-0.5 origin-left scale-90">
                  <Stars value={c.userRating} />
                </div>
              )}
              <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">
                {c.body}
              </p>
              {auth && (
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(c);
                    setError('');
                  }}
                  className="mt-2 text-[13px] font-medium text-[#f591ac] hover:underline"
                >
                  Reply
                </button>
              )}
            </div>
          </div>
        </article>
        {kids.map((r) => (
          <CommentCard key={r.id} c={r} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg px-4 pb-4 pt-2 sm:max-w-xl">
          <section className="mb-6 rounded-3xl border border-foreground/10 bg-[#141a32] p-5 text-[#fdfbf4] shadow-sm dark:bg-[#10152c]">
            <p className="text-center text-[13px] font-medium uppercase tracking-[0.2em] text-[#c9d0ee]/70">
              Community score
            </p>
            <p className="mt-2 text-center text-4xl font-bold tracking-tight text-[#fdfbf4]">
              {count > 0 ? Number(average).toFixed(1) : '—'}
              <span className="text-lg font-medium text-[#c9d0ee]/50"> / 5</span>
            </p>
            <p className="mt-1 text-center text-sm text-[#c9d0ee]/70">
              {count > 0
                ? `${count} rating${count === 1 ? '' : 's'}`
                : 'Be the first to rate'}
            </p>
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-[13px] text-[#c9d0ee]/70">Your rating</p>
              <Stars
                value={myRating ?? 0}
                interactive={auth}
                disabled={busy}
                onPick={rate}
              />
              {!auth && (
                <p className="text-[13px] text-[#c9d0ee]/70">
                  <Link
                    href="/login"
                    className="font-semibold text-[#f591ac] hover:underline"
                  >
                    Log in
                  </Link>{' '}
                  to rate and join the discussion
                </p>
              )}
              {auth && myRating == null && (
                <p className="mt-1 rounded-full bg-[#f591ac]/15 px-3 py-1 text-[12px] font-medium text-[#f591ac]">
                  Rate the book to unlock comments
                </p>
              )}
            </div>
          </section>

          {error && (
            <p className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-[13px] text-red-500">
              {error}
            </p>
          )}

          <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.18em] text-foreground/40">
            Discussion
          </h3>

          {tree.roots.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-foreground/15 px-4 py-12 text-center text-[15px] text-foreground/45">
              No comments yet. Rate the book, then share your thoughts.
            </p>
          ) : (
            <div className="divide-y divide-foreground/10">
              {tree.roots.map((c) => (
                <CommentCard key={c.id} c={c} />
              ))}
            </div>
          )}

          <div className="h-8" />
        </div>
      </div>

      <div className="shrink-0 border-t border-foreground/10 bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto w-full max-w-lg px-3 py-2 sm:max-w-xl">
          {replyTo && (
            <div className="mb-2 flex items-center justify-between rounded-xl bg-[#f591ac]/10 px-3 py-1.5 text-[13px]">
              <span className="truncate text-foreground/80">
                Replying to{' '}
                <strong>{replyTo.user.name || replyTo.user.email || 'user'}</strong>
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="ml-2 text-foreground/50 hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}

          {!auth ? (
            <p className="py-2 text-center text-[14px] text-foreground/55">
              <Link
                href="/login"
                className="font-semibold text-[#f591ac] hover:underline"
              >
                Log in
              </Link>{' '}
              to comment
            </p>
          ) : !canComment ? (
            <p className="py-2 text-center text-[14px] text-[#f591ac]">
              Select a star rating above to comment
            </p>
          ) : (
            <form onSubmit={submitComment} className="flex items-end gap-2">
              <Avatar user={{ name: 'You', email: null }} />
              <div className="min-w-0 flex-1 rounded-2xl border border-foreground/10 bg-foreground/[0.04] px-3 py-2 focus-within:ring-2 focus-within:ring-[#f591ac]/30">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={1}
                  maxLength={2000}
                  placeholder={replyTo ? 'Write a reply…' : 'Share your thoughts…'}
                  className="max-h-28 w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-foreground/40"
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={busy || !text.trim()}
                className="mb-0.5 shrink-0 rounded-full bg-[#141a32] px-4 py-2 text-[14px] font-bold text-[#fdfbf4] shadow-sm hover:brightness-110 disabled:opacity-40 dark:bg-[#f591ac] dark:text-[#141a32]"
              >
                {replyTo ? 'Reply' : 'Post'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}