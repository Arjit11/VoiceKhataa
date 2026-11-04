"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { supabaseClient, type CustomerBalance, type Transaction } from "@/lib/supabaseClient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Transaction panel (shown when a customer row is tapped)
// ---------------------------------------------------------------------------

function TransactionPanel({ customerId }: { customerId: string }) {
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabaseClient
      .from("transactions")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setTxns(data as Transaction[]);
        setLoading(false);
      });
  }, [customerId]);

  if (loading)
    return <p className="px-4 py-3 text-sm text-gray-400">Loading…</p>;

  if (txns.length === 0)
    return (
      <p className="px-4 py-3 text-sm text-gray-400">No transactions yet.</p>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium text-right">Total</th>
            <th className="px-4 py-2 font-medium text-right">Paid</th>
            <th className="px-4 py-2 font-medium text-right">Δ Balance</th>
          </tr>
        </thead>
        <tbody>
          {txns.map((t) => (
            <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                {fmtDateTime(t.created_at)}
              </td>
              <td className="px-4 py-2">
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    t.kind === "sale"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {t.kind}
                </span>
              </td>
              <td className="px-4 py-2 text-right text-gray-600">
                {t.total != null ? fmt(t.total) : "—"}
              </td>
              <td className="px-4 py-2 text-right text-gray-600">
                {t.paid != null ? fmt(t.paid) : "—"}
              </td>
              <td
                className={`px-4 py-2 text-right font-medium ${
                  t.delta > 0 ? "text-red-600" : "text-green-600"
                }`}
              >
                {t.delta > 0 ? "+" : ""}
                {fmt(t.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger component
// ---------------------------------------------------------------------------

export default function Ledger() {
  const [rows, setRows] = useState<CustomerBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Track IDs whose balance changed for the yellow flash
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const prevBalances = useRef<Map<string, number>>(new Map());

  // ── Fetch balances ──────────────────────────────────────────────────
  const fetchBalances = useCallback(async () => {
    const { data, error } = await supabaseClient
      .from("customer_balances")
      .select("id, name, phone, balance, last_activity")
      .order("balance", { ascending: false });

    if (error) {
      console.error("[Ledger] fetch error:", error.message);
      return;
    }

    const next = (data ?? []) as CustomerBalance[];

    // Detect changed balances for flash animation
    const changed = new Set<string>();
    for (const row of next) {
      const prev = prevBalances.current.get(row.id);
      if (prev !== undefined && prev !== row.balance) {
        changed.add(row.id);
      }
    }

    prevBalances.current = new Map(next.map((r) => [r.id, r.balance]));
    setRows(next);
    setLoading(false);

    if (changed.size > 0) {
      setFlashIds(changed);
      setTimeout(() => setFlashIds(new Set()), 1500);
    }
  }, []);

  // ── Initial load + Realtime subscription ───────────────────────────
  useEffect(() => {
    fetchBalances();

    // Subscribe to any change on customers or transactions
    const channel = supabaseClient
      .channel("ledger-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => fetchBalances()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => fetchBalances()
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [fetchBalances]);

  // ── Toggle row expansion ────────────────────────────────────────────
  const toggleRow = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
        <div className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
        Loading ledger…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
        <p className="text-4xl">📒</p>
        <p className="text-gray-500 font-medium">No customers yet</p>
        <p className="text-gray-400 text-sm">
          Speak a transaction above to add your first entry.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <span className="text-lg">📒</span>
        <h2 className="font-semibold text-gray-700">Khata</h2>
        <span className="ml-auto text-xs text-gray-400">
          {rows.length} customer{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-white">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium text-right">Balance (₹)</th>
              <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">
                Last activity
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                {/* Customer row */}
                <tr
                  onClick={() => toggleRow(row.id)}
                  className={`border-b border-gray-100 cursor-pointer transition-colors duration-300 ${
                    flashIds.has(row.id)
                      ? "bg-yellow-100"
                      : expandedId === row.id
                      ? "bg-blue-50"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <span className="flex items-center gap-1">
                      {expandedId === row.id ? "▾" : "▸"}
                      {row.name}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      row.balance > 0
                        ? "text-red-600"
                        : row.balance < 0
                        ? "text-green-600"
                        : "text-gray-400"
                    }`}
                  >
                    {row.balance > 0 ? fmt(row.balance) : row.balance === 0 ? "Clear ✓" : fmt(row.balance)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">
                    {fmtDate(row.last_activity)}
                  </td>
                </tr>

                {/* Expanded transaction panel */}
                {expandedId === row.id && (
                  <tr key={`${row.id}-panel`}>
                    <td colSpan={3} className="bg-blue-50 border-b border-gray-200">
                      <TransactionPanel customerId={row.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
