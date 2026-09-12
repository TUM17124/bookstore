"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  confirmBoost,
  deleteMyBook,
  deletePayoutAccount,
  getMySales,
  getToken,
  initBoost,
  myBoosts,
  myBooks,
  payoutAccount,
  requestPayout,
  savePayoutAccount,
  updateMyBook,
} from "@/lib/api";

const PAYOUT_EVERY_DAYS = 30;

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

export default function DashboardPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [token, setToken] = useState("");
  const [books, setBooks] = useState<any[]>([]);
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
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(true);

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
  }, [cycles, payout]);

  /*
   * Check login exactly like the Publish page.
   *
   * The token is only read in the browser.
   */
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

    myBooks(token).then((d) =>
      setBooks(
        d.results ||
          d.books ||
          d ||
          []
      )
    );

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
      );
    }
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

  async function onBoost(bookId: number) {
    setMsg("");

    const d = await initBoost(
      token,
      bookId
    );

    if (!d.ok) {
      setMsgOk(false);
      setMsg(
        d.error ||
          "Cannot boost yet"
      );
      return;
    }

    if (d.authorization_url) {
      window.location.href =
        d.authorization_url;
    } else {
      setMsgOk(false);
      setMsg(
        d.error ||
          "Cannot start Paystack checkout"
      );
    }
  }

  async function onSavePayout(
    e: FormEvent
  ) {
    e.preventDefault();

    if (
      form.method === "card" &&
      !form.extra
    ) {
      setMsgOk(false);
      setMsg("Select your bank.");
      return;
    }

    const payload = {
      ...form,
      method:
        form.method === "bank"
          ? "card"
          : form.method,
    };

    const d =
      await savePayoutAccount(
        token,
        payload
      );

    if (d.ok) {
      setPayout((p: any) => ({
        ...p,
        account: d.account,
        needs_account: false,
        banks,
      }));

      setMsgOk(true);

      setMsg(
        hasAccount
          ? "Payout account updated."
          : "Payout account saved. Earnings are sent every 30 days."
      );
    } else {
      setMsgOk(false);
      setMsg(
        d.error ||
          "Could not save account"
      );
    }
  }

  async function onDeletePayout() {
    if (
      !window.confirm(
        "Delete the saved payout account?"
      )
    ) {
      return;
    }

    const d =
      await deletePayoutAccount(
        token
      );

    if (d.ok !== false) {
      setPayout((p: any) => ({
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
      setMsg(
        "Payout account deleted."
      );
    } else {
      setMsgOk(false);
      setMsg(
        d.error ||
          "Could not delete account"
      );
    }
  }

  async function onRequestPayout() {
    if (!hasAccount) {
      setMsgOk(false);
      setMsg(
        "Add a payout account first."
      );
      return;
    }

    if (available < minPayout) {
      setMsgOk(false);
      setMsg(
        `Minimum payout is KES ${minPayout.toLocaleString()}. Available KES ${available.toLocaleString()}.`
      );
      return;
    }

    if (
      !window.confirm(
        `Request payout of KES ${available.toLocaleString()}?`
      )
    ) {
      return;
    }

    setPayoutBusy(true);

    try {
      const d =
        await requestPayout();

      setMsgOk(true);

      setMsg(
        d.message ||
          `Payout of KES ${Number(
            d.amount || available
          ).toLocaleString()} requested.`
      );

      const salesData =
        await getMySales();

      applySales(salesData);

      const acc =
        await payoutAccount(
          token
        );

      setPayout(acc);

      setBanks(
        Array.isArray(acc?.banks)
          ? acc.banks
          : banks
      );
    } catch (err) {
      setMsgOk(false);
      setMsg(
        err instanceof Error
          ? err.message
          : "Could not request payout"
      );
    }

    setPayoutBusy(false);
  }

  const canRequest =
    hasAccount &&
    available >= minPayout &&
    minPayout > 0 &&
    !payoutBusy;

  /*
   * Do not render dashboard content until we know
   * whether a token exists.
   */
  if (!authChecked) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <p className="text-sm text-foreground/60">
          Loading…
        </p>
      </main>
    );
  }

  /*
   * Not logged in:
   * show the same login/signup behavior as Publish.
   */
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
    <div className="max-w-4xl mx-auto p-4 space-y-8">
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

      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="text-xl font-bold">
          Sales and cut
        </h2>

        <p className="text-sm text-neutral-600">
          PlugYard keeps{" "}
          <b>{cutPercent}%</b>. You keep{" "}
          <b>{authorPercent}%</b>. Minimum
          payout is{" "}
          <b>
            KES{" "}
            {minPayout.toLocaleString()}
          </b>
          .
        </p>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border p-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              Gross sales
            </p>
            <p className="text-lg font-semibold">
              KES{" "}
              {computedSalesTotal.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              Your cut
            </p>
            <p className="text-lg font-semibold">
              KES{" "}
              {computedAuthorTotal.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              Available
            </p>
            <p className="text-lg font-semibold">
              KES{" "}
              {available.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              Orders
            </p>
            <p className="text-lg font-semibold">
              {sales.length}
            </p>
          </div>
        </div>

        {sales.length === 0 ? (
          <p className="text-sm text-neutral-600">
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

                    <span className="text-neutral-500">
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
                    Your cut KES{" "}
                    {yourCut.toLocaleString()}
                    {grossAmt
                      ? ` · gross ${grossAmt.toLocaleString()}`
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

        <button
          type="button"
          disabled={!canRequest}
          onClick={onRequestPayout}
          className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {payoutBusy
            ? "Requesting…"
            : `Request payout · KES ${available.toLocaleString()}`}
        </button>

        <p className="text-xs text-neutral-500">
          {!hasAccount
            ? "Save a payout account below before requesting."
            : available < minPayout
              ? `You need at least KES ${minPayout.toLocaleString()} available.`
              : "Paid from Site Settings minimum payout."}
        </p>
      </section>

      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="text-xl font-bold">
          Where should we send your money?
        </h2>

        <p className="text-sm text-neutral-600">
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
                <p className="text-xs text-neutral-500 sm:col-span-2">
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

          <button className="sm:col-span-2 bg-black text-white rounded-lg py-2">
            {hasAccount
              ? "Update payout account"
              : "Save payout account"}
          </button>
        </form>

        {hasAccount && (
          <button
            type="button"
            onClick={
              onDeletePayout
            }
            className="w-full rounded-lg border border-red-600 px-4 py-2 text-sm font-semibold text-red-700"
          >
            Delete payout account
          </button>
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
              <p className="text-sm text-neutral-600">
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

                          <span className="text-neutral-500">
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
                          KES{" "}
                          {Number(
                            c.amount ||
                              0
                          ).toLocaleString()}
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

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          Your books
        </h2>

        {books.length === 0 && (
          <p className="text-sm text-neutral-600">
            No books yet. Publish a title
            to manage it here.
          </p>
        )}

        {books.map((book) => (
          <BookBoostRow
            key={book.id}
            book={book}
            boost={
              byBook[book.id]
            }
            onBoost={onBoost}
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
    </div>
  );
}

function BookBoostRow({
  book,
  boost,
  onBoost,
  onUpdated,
  onRemoved,
  onFlash,
}: {
  book: any;
  boost?: any;
  onBoost: (id: number) => void;
  onUpdated: (book: any) => void;
  onRemoved: (
    id: string | number
  ) => void;
  onFlash: (
    text: string,
    ok: boolean
  ) => void;
}) {
  const { label, left } =
    useCountdown(
      boost?.seconds_left || 0
    );

  const active = Boolean(
    boost?.is_active
  );

  const [editing, setEditing] =
    useState(false);

  const [busy, setBusy] =
    useState(false);

  const [isFree, setIsFree] =
    useState(
      Boolean(
        book.isFree ||
          book.is_free
      )
    );

  useEffect(() => {
    setIsFree(
      Boolean(
        book.isFree ||
          book.is_free
      )
    );
  }, [book]);

  async function onSave(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setBusy(true);

    try {
      const fd =
        new FormData(
          e.currentTarget
        );

      fd.set(
        "is_free",
        isFree
          ? "true"
          : "false"
      );

      if (isFree) {
        fd.set(
          "ebook_price",
          "0"
        );

        fd.set(
          "audiobook_price",
          "0"
        );
      }

      const data =
        await updateMyBook(
          book.id,
          fd
        );

      if (data.book) {
        onUpdated(
          data.book
        );
      }

      setEditing(false);

      onFlash(
        data.message ||
          "Book updated.",
        true
      );
    } catch (err) {
      onFlash(
        err instanceof Error
          ? err.message
          : "Could not update book",
        false
      );
    }

    setBusy(false);
  }

  async function onDelete() {
    if (
      !window.confirm(
        `Delete “${book.title}”? This cannot be undone if it has no sales.`
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      const data =
        await deleteMyBook(
          book.id
        );

      if (data.deleted) {
        onRemoved(book.id);
      } else if (data.book) {
        onUpdated({
          ...book,
          ...data.book,
          is_available:
            false,
        });
      } else {
        onRemoved(book.id);
      }

      onFlash(
        data.message ||
          "Book deleted.",
        true
      );
    } catch (err) {
      onFlash(
        err instanceof Error
          ? err.message
          : "Could not delete book",
        false
      );
    }

    setBusy(false);
  }

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {book.title}
          </p>

          <p className="text-sm text-neutral-600">
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
            <p className="text-sm text-neutral-600">
              Boost ended. You can boost
              again now.
            </p>
          ) : (
            <p className="text-sm text-neutral-600">
              Not boosted. Pay with
              Paystack to feature this
              title.
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

          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50"
          >
            Delete
          </button>

          <button
            disabled={active}
            onClick={() =>
              onBoost(book.id)
            }
            className={`px-4 py-2 rounded-lg text-white ${
              active
                ? "bg-neutral-400 cursor-not-allowed"
                : "bg-indigo-600"
            }`}
          >
            {active
              ? `Boosted · ${label}`
              : "Boost now"}
          </button>
        </div>
      </div>

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
                placeholder="Ebook price (KES)"
                className="border rounded-lg p-2"
              />

              <input
                name="audiobook_price"
                type="number"
                min="0"
                step="1"
                defaultValue={
                  book.audiobook_price ??
                  ""
                }
                placeholder="Audiobook price (KES)"
                className="border rounded-lg p-2"
              />
            </>
          )}

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
            {book.hasEbook
              ? "(current file kept unless you pick a new one)"
              : ""}

            <input
              name="pdf"
              type="file"
              accept="application/pdf"
              className="mt-1 block w-full text-sm"
            />
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

          <button
            type="submit"
            disabled={busy}
            className="sm:col-span-2 bg-black text-white rounded-lg py-2 disabled:opacity-50"
          >
            {busy
              ? "Saving…"
              : "Save changes"}
          </button>
        </form>
      )}
    </div>
  );
}