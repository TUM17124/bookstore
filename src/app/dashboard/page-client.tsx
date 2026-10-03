"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import {
  confirmBoost,
  deleteMyBook,
  deletePayoutAccount,
  getMySales,
  getToken,
  initBoost,
  getBoostPrice,
  ProductPriceChangedError,
  type PromoQuote,
  myBoosts,
  myBooks,
  payoutAccount,
  requestPayout,
  savePayoutAccount,
  updateMyBook,
} from "@/lib/api";
import { api as editorApi } from "@/lib/pdf-editor/api";
import { useAsyncAction } from "@/hooks/use-async-action";
import { ActionButton, ActionStatus } from "@/components/ui/action-button";
import { errorMessage } from "@/lib/auth-fetch";
import { UserError } from "@/lib/user-error";
import { broadcastAccountChange } from "@/lib/auth-client";
import { useCurrency, useMoney } from "@/lib/money";
import { CampaignsTab } from "./campaigns-tab";
import { Banners } from "@/components/offers/banners";
import { PromoPrice } from "@/components/offers/promo-price";
import { noteServerTime } from "@/components/offers/countdown";
import { useFeature, useLimits, useOffMessage, useText } from "@/lib/site-config";


const SECTIONS = [
  { id: "sales", label: "Sales and cut" },
  { id: "payout", label: "Payout account" },
  { id: "books", label: "Your books" },
  { id: "campaigns", label: "Campaigns" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    setLeft(seconds);

    if (seconds <= 0) return;

    const t = setInterval(() => {
      setLeft((s) => Math.max(0, s - 1));
    }, 1000);

    return () => clearInterval(t);
  }, [seconds]);

  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;

  return {
    left,
    label:
      left > 0
        ? `${d}d ${h}h ${m}m ${s}s`
        : "Ended",
  };
}

function cycleDate(c: any): Date | null {
  const raw =
    String(c?.status || "").toLowerCase() === "paid"
      ? c?.paid_at || c?.period_end
      : c?.paid_at;

  if (!raw) return null;

  const d = new Date(raw);

  return Number.isNaN(d.getTime()) ? null : d;
}

let boostPricePromise: ReturnType<typeof getBoostPrice> | null = null;
/** One boost-price request shared by every book card (fresh = ask again). */
function loadBoostPrice(fresh = false) {
  if (!boostPricePromise || fresh) boostPricePromise = getBoostPrice();
  return boostPricePromise;
}

export default function DashboardPage() {
  // Part C: every amount uses the site currency setting.
  const money = useMoney();
  // Part D: Site: Limits → payout every N days (the server says the same).
  const PAYOUT_EVERY_DAYS = useLimits().payout_every_days;
  const [loggedIn, setLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [active, setActive] = useState<SectionId>("sales");

  const [token, setToken] = useState("");
  const [books, setBooks] = useState<any[]>([]);
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [boosts, setBoosts] = useState<any[]>([]);
  const [payout, setPayout] = useState<any>(null);
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [cutPercent, setCutPercent] = useState<number>(0);
  const [authorPercent, setAuthorPercent] = useState<number>(100);
  const [salesTotal, setSalesTotal] = useState<number>(0);
  const [authorTotal, setAuthorTotal] = useState<number>(0);
  const [available, setAvailable] = useState<number>(0);
  const [minPayout, setMinPayout] = useState<number>(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(true);
  // Deep-link from the editor's Publish/Edit-published-book flow
  // (?edit_book_id=&editor_document_id=): auto-opens that book's edit form
  // with its saved PDF already attached.
  const [deepLinkBookId, setDeepLinkBookId] = useState("");
  const [deepLinkEditorDocId, setDeepLinkEditorDocId] = useState("");

  const [form, setForm] = useState({
    method: "mpesa",
    account_name: "",
    account_number: "",
    extra: "",
  });

  const hasAccount = Boolean(
    payout?.account?.account_number ||
      payout?.account?.method
  );

  const methodLabel =
    form.method === "card"
      ? "bank"
      : form.method;

  const savedBankName =
    banks.find(
      (b) =>
        b.code ===
        (payout?.account?.extra || "")
    )?.name || "";

  const cycles = useMemo(() => {
    const rows =
      payout?.cycles ||
      payout?.payout_cycles ||
      [];

    if (!Array.isArray(rows)) return [];

    return [...rows].sort((a, b) => {
      const da =
        cycleDate(a)?.getTime() || 0;

      const db =
        cycleDate(b)?.getTime() || 0;

      return db - da;
    });
  }, [payout]);

  const nextPayoutDays = useMemo(() => {
    const every =
      Number(
        payout?.payout_every_days ??
          PAYOUT_EVERY_DAYS
      ) || PAYOUT_EVERY_DAYS;

    const latest =
      cycles.find(
        (c) =>
          String(c.status || "").toLowerCase() ===
          "paid"
      ) || cycles[0];

    const when = cycleDate(latest);

    if (when) {
      const nxt = new Date(
        when.getTime() +
          every * 86400000
      );

      return Math.max(
        0,
        Math.ceil(
          (nxt.getTime() - Date.now()) /
            86400000
        )
      );
    }

    if (
      payout?.next_payout_in_days != null &&
      payout.next_payout_in_days !== ""
    ) {
      return Number(
        payout.next_payout_in_days
      );
    }

    return every;
  }, [cycles, payout, PAYOUT_EVERY_DAYS]);

  useEffect(() => {
    const currentToken = getToken() || "";

    setToken(currentToken);
    setLoggedIn(Boolean(currentToken));
    setAuthChecked(true);
  }, []);

  function applySales(d: any) {
    const rows =
      d.sales || d.results || [];

    setSales(
      Array.isArray(rows) ? rows : []
    );

    const cut = Number(
      d.cut_percent ??
        d.platform_cut ??
        d.commission ??
        0
    );

    const author = Number(
      d.author_percent ??
        100 - cut
    );

    setCutPercent(
      Number.isFinite(cut) ? cut : 0
    );

    setAuthorPercent(
      Number.isFinite(author)
        ? author
        : 100
    );

    setSalesTotal(
      Number(
        d.total ??
          d.gross ??
          0
      ) || 0
    );

    setAuthorTotal(
      Number(
        d.author_total ??
          d.net ??
          d.publisher_share ??
          0
      ) || 0
    );

    setAvailable(
      Number(d.available ?? 0) || 0
    );

    setMinPayout(
      Number(
        d.min_payout_kes ?? 0
      ) || 0
    );
  }

  useEffect(() => {
    if (!token) return;

    myBooks(token)
      .then((d) =>
        setBooks(
          d.results ||
            d.books ||
            d ||
            []
        )
      )
      .finally(() => setBooksLoaded(true));

    myBoosts(token).then((d) =>
      setBoosts(
        d.boosts ||
          d.results ||
          []
      )
    );

    payoutAccount(token).then((d) => {
      setPayout(d);

      setBanks(
        Array.isArray(d?.banks)
          ? d.banks
          : []
      );

      const acc = d?.account;

      if (acc) {
        setForm({
          method:
            acc.method === "bank"
              ? "card"
              : acc.method || "mpesa",
          account_name:
            acc.account_name || "",
          account_number:
            acc.account_number || "",
          extra:
            acc.extra || "",
        });
      }
    });

    getMySales()
      .then(applySales)
      .catch(() => setSales([]));

    const params =
      new URLSearchParams(
        window.location.search
      );

    // Part C: notifications link to /dashboard?tab=campaigns
    if (params.get("tab") === "campaigns") setActive("campaigns");

    const editBookId = params.get("edit_book_id");
    if (editBookId) {
      setActive("books");
      setDeepLinkBookId(editBookId);
      setDeepLinkEditorDocId(params.get("editor_document_id") || "");
    }

    const ref =
      params.get("boost_ref") ||
      params.get("reference");

    if (ref) {
      confirmBoost(token, ref).then(
        (d) => {
          if (d.ok && d.paid) {
            setMsgOk(true);
            setMsg(
              "Payment received. Your book is now boosted and featured."
            );
          } else if (!d.paid) {
            setMsgOk(false);
            setMsg(
              "Payment was not completed. No boost was created."
            );
          }

          myBoosts(token).then((x) =>
            setBoosts(
              x.boosts || []
            )
          );
        }
      ).catch((err) => {
        setMsgOk(false);
        setMsg(errorMessage(err, "Couldn't confirm the boost payment. Reload the page to check again."));
      });
    }
  }, [token]);

  // Payout account changed in another tab (or settings): re-read it.
  useEffect(() => {
    if (!token) return;
    const onAccountChanged = () => {
      payoutAccount(token)
        .then((d) => {
          setPayout(d);
          setBanks(Array.isArray(d?.banks) ? d.banks : []);
        })
        .catch(() => {});
    };
    window.addEventListener("auth-changed", onAccountChanged);
    return () => window.removeEventListener("auth-changed", onAccountChanged);
  }, [token]);

  const byBook = useMemo(() => {
    const m: Record<number, any> = {};

    boosts.forEach((b) => {
      if (
        !m[b.book_id] ||
        (b.is_active &&
          !m[b.book_id].is_active)
      ) {
        m[b.book_id] = b;
      }
    });

    return m;
  }, [boosts]);

  const computedAuthorTotal =
    authorTotal ||
    sales.reduce(
      (sum, row) =>
        sum +
        Number(
          row.amount ??
            row.author_amount ??
            row.net ??
            0
        ),
      0
    );

  const computedSalesTotal =
    salesTotal ||
    sales.reduce(
      (sum, row) =>
        sum +
        Number(
          row.gross ??
            row.total ??
            row.amount ??
            0
        ),
      0
    );

  // Payout account save/delete and the payout request: idempotent
  // server-side, so retried with ONE key per attempt (never a second payout).
  const savePayout = useAsyncAction(
    async (ctx, payload: typeof form) => {
      const d = await savePayoutAccount(token, payload, ctx);
      if (!d.ok) throw new UserError(d.error || "Could not save account");
      return d;
    },
    {
      onSuccess: (d) => {
        setPayout((p: typeof payout) => ({
          ...p,
          account: d.account,
          needs_account: false,
          banks,
        }));
        setMsgOk(true);
        setMsg(
          hasAccount
            ? "Payout account updated."
            : `Payout account saved. Earnings are sent every ${payout?.payout_every_days || PAYOUT_EVERY_DAYS} days.`
        );
        broadcastAccountChange();
      },
    }
  );

  function onSavePayout(e: FormEvent) {
    e.preventDefault();
    if (form.method === "card" && !form.extra) {
      setMsgOk(false);
      setMsg("Select your bank.");
      return;
    }
    void savePayout.run({
      ...form,
      method: form.method === "bank" ? "card" : form.method,
    });
  }

  const deletePayout = useAsyncAction(
    async (ctx) => {
      const d = await deletePayoutAccount(token, ctx);
      if (d.ok === false) throw new UserError(d.error || "Could not delete account");
      return d;
    },
    {
      onSuccess: () => {
        setPayout((p: typeof payout) => ({
          ...p,
          account: null,
          needs_account: true,
        }));
        setForm({
          method: "mpesa",
          account_name: "",
          account_number: "",
          extra: "",
        });
        setMsgOk(true);
        setMsg("Payout account deleted.");
        broadcastAccountChange();
      },
    }
  );

  function onDeletePayout() {
    if (!window.confirm("Delete the saved payout account?")) return;
    void deletePayout.run();
  }

  const payoutRequest = useAsyncAction(
    async (ctx) => {
      const d = await requestPayout(ctx);
      // Refresh balances; the payout itself already succeeded.
      try {
        applySales(await getMySales());
        const acc = await payoutAccount(token);
        setPayout(acc);
        setBanks(Array.isArray(acc?.banks) ? acc.banks : banks);
      } catch {
        // balances update on next load
      }
      return d;
    },
    {
      onSuccess: (d) => {
        setMsgOk(true);
        setMsg(
          d?.message ||
            `Payout of ${money(d?.amount || available)} requested.`
        );
      },
    }
  );

  function onRequestPayout() {
    if (!hasAccount) {
      setMsgOk(false);
      setMsg("Add a payout account first.");
      return;
    }
    if (available < minPayout) {
      setMsgOk(false);
      setMsg(
        `Minimum payout is ${money(minPayout)}. Available ${money(available)}.`
      );
      return;
    }
    if (!window.confirm(`Request payout of ${money(available)}?`)) return;
    void payoutRequest.run();
  }

  const canRequest =
    hasAccount &&
    available >= minPayout &&
    minPayout > 0;

  if (!authChecked) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <p className="text-sm text-foreground/60">
          Loading…
        </p>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-bold">
          Dashboard
        </h1>

        <p className="mt-3 text-sm text-foreground/60">
          Sign in to access your dashboard.
        </p>

        <p className="mt-6 text-sm">
          <Link
            href="/login?next=/dashboard"
            className="underline"
          >
            Log in
          </Link>

          {" · "}

          <Link
            href="/signup?next=/dashboard"
            className="underline"
          >
            Sign up
          </Link>
        </p>
      </main>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 space-y-6">
      {msg && (
        <div
          role={
            msgOk
              ? "status"
              : "alert"
          }
          className={
            msgOk
              ? "rounded-xl border-2 border-green-600 bg-green-100 p-3 text-sm font-semibold text-green-800 dark:border-green-400 dark:bg-green-950 dark:text-green-300"
              : "rounded-xl border-2 border-red-600 bg-red-100 p-3 text-sm font-semibold text-red-800 dark:border-red-400 dark:bg-red-950 dark:text-red-300"
          }
        >
          {msg}
        </div>
      )}

      {/* Admin banners for this page (e.g. "Join the campaign" for authors). */}
      <Banners placement="dashboard" className="" />

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {/* Mobile: shrinking horizontal tab strip */}
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:hidden">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active === s.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/15 text-foreground/70"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* Desktop: fixed left nav */}
        <nav className="hidden w-52 shrink-0 sm:block">
          <ul className="space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    active === s.id
                      ? "bg-foreground text-background"
                      : "text-foreground/70 hover:bg-foreground/5"
                  }`}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-8">
          {active === "sales" && booksLoaded && books.length === 0 && <NoBooksYet />}

          {active === "sales" && (
            <section className="rounded-2xl border p-4 space-y-3">
              <h2 className="text-xl font-bold">
                Sales and cut
              </h2>

              <p className="text-sm text-foreground/70">
                PlugYard keeps{" "}
                <b>{cutPercent}%</b>. You keep{" "}
                <b>{authorPercent}%</b>. Minimum
                payout is{" "}
                <b>
                  {money(minPayout)}
                </b>
                .
              </p>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Gross sales
                  </p>
                  <p className="text-lg font-semibold">
                    {money(computedSalesTotal)}
                  </p>
                </div>

                <div className="rounded-xl border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Your cut
                  </p>
                  <p className="text-lg font-semibold">
                    {money(computedAuthorTotal)}
                  </p>
                </div>

                <div className="rounded-xl border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Available
                  </p>
                  <p className="text-lg font-semibold">
                    {money(available)}
                  </p>
                </div>

                <div className="rounded-xl border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Orders
                  </p>
                  <p className="text-lg font-semibold">
                    {sales.length}
                  </p>
                </div>
              </div>

              {sales.length === 0 ? (
                <p className="text-sm text-foreground/70">
                  No sales yet. That is normal for
                  a new title.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sales.map((row, i) => {
                    const title =
                      row.book_title ||
                      row.title ||
                      `Order #${
                        row.order_id ||
                        row.id
                      }`;

                    const yourCut = Number(
                      row.author_amount ??
                        row.net ??
                        row.amount ??
                        0
                    );

                    const grossAmt = Number(
                      row.gross ??
                        row.total ??
                        0
                    );

                    return (
                      <li
                        key={
                          row.id ||
                          row.order_id ||
                          i
                        }
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                      >
                        <span>
                          <b>{title}</b>

                          <span className="text-muted-foreground">
                            {" "}
                            · Order #
                            {row.order_id ||
                              row.id}
                            {row.product_type
                              ? ` · ${row.product_type}`
                              : ""}
                          </span>
                        </span>

                        <span>
                          Your cut {money(yourCut)}
                          {grossAmt
                            ? ` · gross ${money(grossAmt)}`
                            : ""}
                          {row.cut_percent != null
                            ? ` · platform ${row.cut_percent}%`
                            : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <ActionButton
                action={payoutRequest}
                disabled={!canRequest}
                onClick={onRequestPayout}
                loadingLabel="Requesting…"
                successLabel="Requested"
                errorClassName="text-sm text-red-600"
                className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:bg-neutral-400"
              >
                {`Request payout · ${money(available)}`}
              </ActionButton>

              <p className="text-xs text-muted-foreground">
                {!hasAccount
                  ? "Save a payout account below before requesting."
                  : available < minPayout
                    ? `You need at least ${money(minPayout)} available.`
                    : "Paid from Site Settings minimum payout."}
              </p>
            </section>
          )}

          {active === "payout" && (
            <section className="rounded-2xl border p-4 space-y-3">
              <h2 className="text-xl font-bold">
                Where should we send your money?
              </h2>

              <p className="text-sm text-foreground/70">
                Sales are paid every{" "}
                {payout?.payout_every_days ||
                  PAYOUT_EVERY_DAYS}{" "}
                days. Add M-Pesa, Airtel Money,
                or a bank account. Next payout
                window in about{" "}
                <b>
                  {Number.isFinite(
                    nextPayoutDays
                  )
                    ? nextPayoutDays
                    : PAYOUT_EVERY_DAYS}{" "}
                  days
                </b>
                .
              </p>

              {hasAccount && (
                <p className="text-sm">
                  Saved:{" "}
                  <b>
                    {payout.account.method ===
                    "card"
                      ? "bank"
                      : payout.account.method}
                  </b>

                  {savedBankName
                    ? ` · ${savedBankName}`
                    : ""}

                  {" "}·{" "}
                  {payout.account.account_name}
                  {" "}·{" "}
                  {payout.account.account_number}
                </p>
              )}

              <form
                onSubmit={onSavePayout}
                className="grid gap-3 sm:grid-cols-2"
              >
                <label className="text-sm font-medium sm:col-span-2">
                  How should we pay you?

                  <select
                    className="mt-1 w-full border rounded-lg p-2 font-normal"
                    value={methodLabel}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        method:
                          e.target.value ===
                          "bank"
                            ? "card"
                            : e.target.value,
                        extra:
                          e.target.value ===
                          "bank"
                            ? form.extra
                            : "",
                      })
                    }
                  >
                    <option value="mpesa">
                      M-Pesa number
                    </option>

                    <option value="airtel">
                      Airtel Money number
                    </option>

                    <option value="bank">
                      Kenyan bank account
                    </option>
                  </select>
                </label>

                <label className="text-sm font-medium">
                  Account holder name

                  <input
                    className="mt-1 w-full border rounded-lg p-2 font-normal"
                    placeholder="Name on the account"
                    value={
                      form.account_name
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        account_name:
                          e.target.value,
                      })
                    }
                  />
                </label>

                {form.method ===
                  "mpesa" && (
                  <label className="text-sm font-medium">
                    M-Pesa phone number

                    <input
                      className="mt-1 w-full border rounded-lg p-2 font-normal"
                      placeholder="07xxxxxxxx"
                      inputMode="tel"
                      value={
                        form.account_number
                      }
                      onChange={(e) =>
                        setForm({
                          ...form,
                          account_number:
                            e.target.value,
                        })
                      }
                    />
                  </label>
                )}

                {form.method ===
                  "airtel" && (
                  <label className="text-sm font-medium">
                    Airtel Money number

                    <input
                      className="mt-1 w-full border rounded-lg p-2 font-normal"
                      placeholder="07xxxxxxxx"
                      inputMode="tel"
                      value={
                        form.account_number
                      }
                      onChange={(e) =>
                        setForm({
                          ...form,
                          account_number:
                            e.target.value,
                        })
                      }
                    />
                  </label>
                )}

                {form.method ===
                  "card" && (
                  <>
                    <label className="text-sm font-medium">
                      Bank

                      <select
                        className="mt-1 w-full border rounded-lg p-2 font-normal"
                        value={form.extra}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            extra:
                              e.target.value,
                          })
                        }
                        required
                      >
                        <option value="">
                          Select your bank
                        </option>

                        {banks.map((b) => (
                          <option
                            key={b.code}
                            value={b.code}
                          >
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm font-medium sm:col-span-2">
                      Bank account number

                      <input
                        className="mt-1 w-full border rounded-lg p-2 font-normal"
                        placeholder="Bank account number"
                        inputMode="numeric"
                        value={
                          form.account_number
                        }
                        onChange={(e) =>
                          setForm({
                            ...form,
                            account_number:
                              e.target.value,
                          })
                        }
                      />
                    </label>

                    {banks.length === 0 && (
                      <p className="text-xs text-muted-foreground sm:col-span-2">
                        Bank list is empty. Deploy
                        the backend banks list, or
                        use M-Pesa.
                      </p>
                    )}
                  </>
                )}

                {form.method !==
                  "card" && (
                  <label className="text-sm font-medium">
                    Extra note (optional)

                    <input
                      className="mt-1 w-full border rounded-lg p-2 font-normal"
                      placeholder="Branch or note"
                      value={form.extra}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          extra:
                            e.target.value,
                        })
                      }
                    />
                  </label>
                )}

                <div className="sm:col-span-2">
                  <ActionButton
                    type="submit"
                    action={savePayout}
                    loadingLabel="Saving…"
                    successLabel="Saved"
                    errorClassName="mt-2 text-sm text-red-600"
                    className="w-full bg-foreground text-background rounded-lg py-2 aria-busy:opacity-80"
                  >
                    {hasAccount
                      ? "Update payout account"
                      : "Save payout account"}
                  </ActionButton>
                </div>
              </form>

              {hasAccount && (
                <ActionButton
                  action={deletePayout}
                  onClick={onDeletePayout}
                  loadingLabel="Deleting…"
                  successLabel="Deleted"
                  errorClassName="text-sm text-red-600"
                  className="w-full rounded-lg border border-red-600 px-4 py-2 text-sm font-semibold text-red-700"
                >
                  Delete payout account
                </ActionButton>
              )}

              <button
                type="button"
                onClick={() =>
                  setHistoryOpen(
                    (v) => !v
                  )
                }
                className="w-full rounded-lg border px-4 py-2 text-sm font-semibold"
              >
                {historyOpen
                  ? "Hide payment history"
                  : "Payment history"}
              </button>

              {historyOpen && (
                <div className="space-y-2">
                  {cycles.length === 0 ? (
                    <p className="text-sm text-foreground/70">
                      No payout cycles yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {cycles.map(
                        (
                          c: any,
                          i: number
                        ) => {
                          const when =
                            cycleDate(c);

                          return (
                            <li
                              key={
                                c.id || i
                              }
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                            >
                              <span>
                                <b>
                                  {c.period_start ||
                                    "—"}{" "}
                                  –{" "}
                                  {c.period_end ||
                                    "—"}
                                </b>

                                <span className="text-muted-foreground">
                                  {" "}
                                  ·{" "}
                                  {c.status ||
                                    "pending"}

                                  {when
                                    ? ` · ${when.toLocaleString()}`
                                    : ""}
                                </span>
                              </span>

                              <span>
                                {money(c.amount || 0)}
                              </span>
                            </li>
                          );
                        }
                      )}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          {active === "campaigns" && <CampaignsTab />}

          {active === "books" && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold">
                Your books
              </h2>

              {!booksLoaded && (
                <p className="text-sm text-foreground/60" role="status">
                  Loading your books…
                </p>
              )}
              {booksLoaded && books.length === 0 && <NoBooksYet />}

              {books.map((book) => (
                <BookBoostRow
                  key={book.id}
                  book={book}
                  boost={
                    byBook[book.id]
                  }
                  autoOpen={
                    deepLinkBookId !== "" &&
                    String(book.id) === String(deepLinkBookId)
                  }
                  attachEditorDocumentId={
                    String(book.id) === String(deepLinkBookId)
                      ? deepLinkEditorDocId
                      : ""
                  }
                  onUpdated={(next) =>
                    setBooks((list) =>
                      list.map((b) =>
                        String(b.id) ===
                        String(next.id)
                          ? {
                              ...b,
                              ...next,
                            }
                          : b
                      )
                    )
                  }
                  onRemoved={(id) =>
                    setBooks((list) =>
                      list.filter(
                        (b) =>
                          String(b.id) !==
                          String(id)
                      )
                    )
                  }
                  onFlash={(
                    text,
                    ok
                  ) => {
                    setMsgOk(ok);
                    setMsg(text);
                  }}
                />
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function BookBoostRow({
  book,
  boost,
  autoOpen,
  attachEditorDocumentId,
  onUpdated,
  onRemoved,
  onFlash,
}: {
  book: any;
  boost?: any;
  autoOpen?: boolean;
  attachEditorDocumentId?: string;
  onUpdated: (book: any) => void;
  onRemoved: (
    id: string | number
  ) => void;
  onFlash: (
    text: string,
    ok: boolean
  ) => void;
}) {
  const currency = useCurrency();
  const { label, left } =
    useCountdown(
      boost?.seconds_left || 0
    );
  // Part D: Site: Pricing → boost days; Site: Features → boosts.
  const notBoosted = useText("boost.not_boosted");
  const boostsOn = useFeature("boosts");
  const boostsOff = useOffMessage("boosts");
  const [boostDays, setBoostDays] = useState(7);

  const active = Boolean(
    boost?.is_active
  );

  const [editing, setEditing] =
    useState(false);


  // Attached from the PDF editor's "Edit published book" deep link - the
  // PDF is copied server-side from the saved document, browser never
  // downloads/re-uploads it. "Remove" reverts to a normal file upload.
  const [attachedName, setAttachedName] = useState("");
  const [attachRemoved, setAttachRemoved] = useState(false);
  const hasAttachment = Boolean(attachEditorDocumentId) && !attachRemoved;

  useEffect(() => {
    if (autoOpen) setEditing(true);
  }, [autoOpen]);

  useEffect(() => {
    if (!attachEditorDocumentId) return;
    editorApi.getStoredDocument(attachEditorDocumentId).then(
      (doc) => setAttachedName(doc.name || "Untitled.pdf"),
      () => setAttachedName("Untitled.pdf"),
    );
  }, [attachEditorDocumentId]);

  const [isFree, setIsFree] =
    useState(
      Boolean(
        book.isFree ||
          book.is_free
      )
    );

  const [ebookDownloadable, setEbookDownloadable] =
    useState(book.ebookDownloadable !== false);

  const [audiobookDownloadable, setAudiobookDownloadable] =
    useState(book.audiobookDownloadable !== false);

  useEffect(() => {
    setIsFree(
      Boolean(
        book.isFree ||
          book.is_free
      )
    );
    setEbookDownloadable(book.ebookDownloadable !== false);
    setAudiobookDownloadable(book.audiobookDownloadable !== false);
  }, [book]);

  // The boost price this author pays now (a promotion may apply).
  const [boostQuote, setBoostQuote] = useState<PromoQuote | null>(null);
  const [boostNonce, setBoostNonce] = useState(0);
  useEffect(() => {
    let live = true;
    loadBoostPrice(boostNonce > 0)
      .then((p) => {
        if (!live || !p) return;
        noteServerTime(p.server_now);
        setBoostQuote(p.quote);
        if (p.days) setBoostDays(p.days);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [boostNonce]);

  // Boost = Paystack initialisation: retried only with ONE idempotency key.
  // The price shown is sent along; a different price now is refused and
  // shown instead (press Boost again to accept it).
  const boostAction = useAsyncAction(
    async (ctx, bookId: number) => {
      const d = await initBoost("", bookId, boostDays, ctx, boostQuote?.final_amount);
      if (!d.ok) throw new UserError(d.error || "Cannot boost yet");
      if (!d.authorization_url) throw new UserError(d.error || "Cannot start Paystack checkout");
      return d;
    },
    {
      successMs: 60_000, // "Redirecting…" while leaving for Paystack
      onSuccess: (d) => {
        window.location.href = d.authorization_url;
      },
      onError: (err) => {
        if (err instanceof ProductPriceChangedError) setBoostQuote(err.quote);
      },
    }
  );

  const save = useAsyncAction(
    (ctx, fd: FormData) => updateMyBook(book.id, fd, ctx),
    {
      onSuccess: (data) => {
        if (data.book) onUpdated(data.book);
        setEditing(false);
        onFlash(data.message || "Book updated.", true);
      },
    }
  );

  function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("is_free", isFree ? "true" : "false");
    fd.set("ebook_downloadable", ebookDownloadable ? "true" : "false");
    fd.set("audiobook_downloadable", audiobookDownloadable ? "true" : "false");
    if (hasAttachment) {
      fd.delete("pdf");
      fd.set("editor_document_id", attachEditorDocumentId as string);
    }
    if (isFree) {
      fd.set("ebook_price", "0");
      fd.set("audiobook_price", "0");
    }
    void save.run(fd);
  }

  const remove = useAsyncAction(
    (ctx) => deleteMyBook(book.id, ctx),
    {
      onSuccess: (data) => {
        if (data.deleted) {
          onRemoved(book.id);
        } else if (data.book) {
          onUpdated({
            ...book,
            ...data.book,
            is_available: false,
          });
        } else {
          onRemoved(book.id);
        }
        onFlash(data.message || "Book deleted.", true);
      },
    }
  );

  function onDelete() {
    if (!window.confirm(`Delete “${book.title}”? This cannot be undone if it has no sales.`)) return;
    void remove.run();
  }

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {book.title}
          </p>

          <p className="text-sm text-foreground/70">
            {book.year
              ? `${book.year} · `
              : ""}
            {book.status ||
              "draft"}

            {book.is_available ===
            false
              ? " · off the store"
              : ""}
          </p>

          {active ? (
            <p className="text-sm text-emerald-700">
              Boosted · featured until
              countdown ends:{" "}
              <b>{label}</b>
            </p>
          ) : boost?.status ===
              "expired" ||
            (boost?.status ===
              "paid" &&
              left === 0) ? (
            <p className="text-sm text-foreground/70">
              Boost ended. You can boost
              again now.
            </p>
          ) : (
            <p className="text-sm text-foreground/70">
              {boostsOn ? notBoosted : boostsOff}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setEditing(
                (v) => !v
              )
            }
            className="px-4 py-2 rounded-lg border"
          >
            {editing
              ? "Close"
              : "Edit"}
          </button>

          <ActionButton
            action={remove}
            onClick={onDelete}
            disabled={save.busy}
            loadingLabel="Deleting…"
            errorPlacement="none"
            retryPlacement="none"
            className="px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50"
          >
            Delete
          </ActionButton>

          <ActionButton
            action={boostAction}
            disabled={active || !boostsOn}
            onClick={() => void boostAction.run(book.id)}
            loadingLabel="Starting checkout…"
            successLabel="Redirecting…"
            errorPlacement="none"
            retryPlacement="none"
            className={`px-4 py-2 rounded-lg ${
              active || !boostsOn
                ? "bg-neutral-400 text-white cursor-not-allowed"
                : "bg-foreground text-background"
            }`}
          >
            {active
              ? `Boosted · ${label}`
              : boostsOn
                ? "Boost now"
                : "Boosts off"}
          </ActionButton>
        </div>
        {!active && boostsOn && boostQuote ? (
          <div className="flex w-full justify-end">
            <PromoPrice
              quote={boostQuote}
              suffix={` for ${boostDays} days`}
              size="sm"
              onExpire={() => setBoostNonce((n) => n + 1)}
              className="items-end text-right"
            />
          </div>
        ) : null}
      </div>
      <ActionStatus action={remove.state === "retrying" ? remove : boostAction} className="text-sm text-foreground/70" />
      {remove.errorText || boostAction.errorText ? (
        <p role="alert" className="text-sm text-red-600">
          {remove.errorText || boostAction.errorText}
        </p>
      ) : null}

      {editing && (
        <form
          onSubmit={onSave}
          className="grid gap-3 sm:grid-cols-2 border-t pt-3"
        >
          <input
            name="title"
            required
            defaultValue={
              book.title || ""
            }
            placeholder="Title"
            className="border rounded-lg p-2"
          />

          <input
            name="year"
            defaultValue={
              book.year || ""
            }
            placeholder="Year"
            className="border rounded-lg p-2"
          />

          <textarea
            name="description"
            rows={3}
            defaultValue={
              book.desc ||
              book.description ||
              ""
            }
            placeholder="Description"
            className="sm:col-span-2 border rounded-lg p-2"
          />

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={isFree}
              onChange={(e) =>
                setIsFree(
                  e.target.checked
                )
              }
            />
            Free to read
          </label>

          {!isFree && (
            <>
              <label className="text-sm font-medium">
                eBook price ({currency.code})
                <input
                  name="ebook_price"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={
                    book.ebook_price ??
                    book.price ??
                    ""
                  }
                  placeholder="e.g. 300"
                  className="mt-1 block w-full border rounded-lg p-2 font-normal"
                />
              </label>

              <label className="text-sm font-medium">
                Audiobook price ({currency.code})
                <input
                  name="audiobook_price"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={
                    book.audiobook_price ??
                    ""
                  }
                  placeholder="e.g. 500"
                  className="mt-1 block w-full border rounded-lg p-2 font-normal"
                />
              </label>
            </>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ebookDownloadable}
              onChange={(e) =>
                setEbookDownloadable(
                  e.target.checked
                )
              }
            />
            Allow ebook download
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={audiobookDownloadable}
              onChange={(e) =>
                setAudiobookDownloadable(
                  e.target.checked
                )
              }
            />
            Allow audiobook download
          </label>

          <label className="text-sm">
            Front cover

            {book.images?.front ? (
              <img
                src={
                  book.images.front
                }
                alt=""
                className="mt-1 h-16 w-auto rounded border object-cover"
              />
            ) : null}

            <input
              name="image_front"
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm"
            />
          </label>

          <label className="text-sm">
            Spine

            {book.images?.spine ? (
              <img
                src={
                  book.images.spine
                }
                alt=""
                className="mt-1 h-16 w-auto rounded border object-cover"
              />
            ) : null}

            <input
              name="image_spine"
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm"
            />
          </label>

          <label className="text-sm">
            Back cover

            {book.images?.back ? (
              <img
                src={
                  book.images.back
                }
                alt=""
                className="mt-1 h-16 w-auto rounded border object-cover"
              />
            ) : null}

            <input
              name="image_back"
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm"
            />
          </label>

          <label className="text-sm">
            PDF{" "}
            {!hasAttachment && book.hasEbook
              ? "(current file kept unless you pick a new one)"
              : ""}

            {hasAttachment ? (
              <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border p-2 text-sm">
                <span className="min-w-0 truncate">
                  Already attached:{" "}
                  <span className="font-medium">
                    {attachedName || "Loading…"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setAttachRemoved(true)}
                  className="shrink-0 text-xs font-medium text-foreground/70 underline hover:text-foreground"
                >
                  Remove
                </button>
              </div>
            ) : (
              <input
                name="pdf"
                type="file"
                accept="application/pdf"
                className="mt-1 block w-full text-sm"
              />
            )}

            {book.status === "published" && (
              <span className="mt-1 block text-xs text-muted-foreground">
                This book is already published — a new PDF here won&apos;t go
                live immediately. It goes to admin for review, and buyers
                keep getting the current file until it&apos;s approved.
              </span>
            )}
          </label>

          <label className="text-sm sm:col-span-2">
            Audiobook MP3{" "}
            {book.hasAudiobook
              ? "(current file kept unless you pick a new one)"
              : "(optional)"}

            <input
              name="audio"
              type="file"
              accept="audio/*"
              className="mt-1 block w-full text-sm"
            />
          </label>

          <div className="sm:col-span-2">
            <ActionButton
              type="submit"
              action={save}
              disabled={remove.busy}
              loadingLabel="Saving…"
              successLabel="Saved"
              errorClassName="mt-2 text-sm text-red-600"
              className="w-full bg-foreground text-background rounded-lg py-2 disabled:opacity-50 aria-busy:opacity-80"
            >
              Save changes
            </ActionButton>
          </div>
        </form>
      )}
    </div>
  );
}

/** Empty dashboard: an author with no books yet. */
function NoBooksYet() {
  // Django admin → Site: General → Empty pages.
  const title = useText("empty.dashboard_title");
  const body = useText("empty.dashboard_body");
  const cta = useText("empty.dashboard_cta");
  const browse = useText("empty.dashboard_browse");
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-foreground/20 px-6 py-10 text-center">
      <BookOpen className="h-10 w-10 text-foreground/40" aria-hidden />
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="max-w-sm text-sm text-foreground/70">{body}</p>
      <Link
        href="/publish"
        className="inline-flex min-h-[44px] items-center rounded-full bg-foreground px-5 text-sm font-bold text-background outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
      >
        {cta}
      </Link>
      <Link href="/" className="text-sm font-semibold underline underline-offset-2 text-foreground/70 hover:text-foreground">
        {browse}
      </Link>
    </section>
  );
}
