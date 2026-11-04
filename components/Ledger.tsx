"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { supabaseClient, type CustomerBalance, type Transaction } from "@/lib/supabaseClient";
import { buildReminderLink, normalizePhone } from "@/lib/whatsapp";

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
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Transaction panel
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

  if (loading) return <p className="px-4 py-3 text-sm text-gray-400">Loading…</p>;
  if (txns.length === 0)
    return <p className="px-4 py-3 text-sm text-gray-400">No transactions yet.</p>;

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
              <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmtDateTime(t.created_at)}</td>
              <td className="px-4 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  t.kind === "sale" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                }`}>
                  {t.kind}
                </span>
              </td>
              <td className="px-4 py-2 text-right text-gray-600">{t.total != null ? fmt(t.total) : "—"}</td>
              <td className="px-4 py-2 text-right text-gray-600">{t.paid != null ? fmt(t.paid) : "—"}</td>
              <td className={`px-4 py-2 text-right font-medium ${t.delta > 0 ? "text-red-600" : "text-green-600"}`}>
                {t.delta > 0 ? "+" : ""}{fmt(t.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhoneCell — inline phone editor
// ---------------------------------------------------------------------------

function PhoneCell({
  row,
  onSaved,
}: {
  row: CustomerBalance;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [phoneInput, setPhoneInput] = useState(row.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = buildReminderLink({ name: row.name, balance: row.balance, phone: row.phone });

  const handleSave = async () => {
    setError(null);
    // Client-side pre-validation
    if (phoneInput.trim() && !normalizePhone(phoneInput)) {
      setError("Enter a 10-digit Indian mobile number.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/customers/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: row.id, phone: phoneInput.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not save.");
      } else {
        setEditing(false);
        onSaved();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (row.balance <= 0) return null; // only show for customers with dues

  if (editing) {
    return (
      <div className="flex flex-col gap-1 py-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1">
          <input
            type="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="9876543210"
            className="w-28 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-400"
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-2 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "…" : "Save"}
          </button>
          <button
            onClick={() => { setEditing(false); setError(null); }}
            className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200"
          >
            ✕
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (link) {
    return (
      <div className="flex flex-col items-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors"
        >
          <span>💬</span> WhatsApp
        </a>
        <span className="text-[10px] text-gray-400 leading-tight text-right max-w-[100px]">
          Opens WhatsApp with a prefilled message. You tap send.
        </span>
      </div>
    );
  }

  // No valid phone
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className="px-2.5 py-1 border border-dashed border-gray-300 text-gray-400 rounded-lg text-xs hover:border-green-400 hover:text-green-600 transition-colors"
    >
      + Add phone
    </button>
  );
}

// ---------------------------------------------------------------------------
// Remind All panel
// ---------------------------------------------------------------------------

function RemindAllPanel({ rows }: { rows: CustomerBalance[] }) {
  const [open, setOpen] = useState(false);
  const debtors = rows.filter((r) => r.balance > 0);
  if (debtors.length === 0) return null;

  return (
    <div className="border-t border-gray-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span>📣 Remind all ({debtors.length})</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {debtors.map((row) => {
            const link = buildReminderLink({ name: row.name, balance: row.balance, phone: row.phone });
            return (
              <div key={row.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="font-medium text-gray-800 text-sm">{row.name}</p>
                  <p className="text-xs text-red-500">{fmt(row.balance)} baaki</p>
                </div>
                {link ? (
                  <div className="flex flex-col items-end gap-0.5">
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors whitespace-nowrap"
                    >
                      💬 WhatsApp
                    </a>
                    <span className="text-[10px] text-gray-400 text-right max-w-[120px]">
                      Opens WhatsApp with a prefilled message. You tap send.
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 italic">No phone</span>
                )}
              </div>
            );
          })}
        </div>
      )}
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
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const prevBalances = useRef<Map<string, number>>(new Map());

  // ── Fetch balances ────────────────────────────────────────────────────
  const fetchBalances = useCallback(async () => {
    const { data, error } = await supabaseClient
      .from("customer_balances")
      .select("id, name, phone, balance, last_activity")
      .order("balance", { ascending: false });

    if (error) { console.error("[Ledger] fetch error:", error.message); return; }

    const next = (data ?? []) as CustomerBalance[];
    const changed = new Set<string>();
    for (const row of next) {
      const prev = prevBalances.current.get(row.id);
      if (prev !== undefined && prev !== row.balance) changed.add(row.id);
    }
    prevBalances.current = new Map(next.map((r) => [r.id, r.balance]));
    setRows(next);
    setLoading(false);
    if (changed.size > 0) {
      setFlashIds(changed);
      setTimeout(() => setFlashIds(new Set()), 1500);
    }
  }, []);

  // ── Initial load + Realtime ───────────────────────────────────────────
  useEffect(() => {
    fetchBalances();
    const channel = supabaseClient
      .channel("ledger-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => fetchBalances())
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => fetchBalances())
      .subscribe();
    return () => { supabaseClient.removeChannel(channel); };
  }, [fetchBalances]);

  const toggleRow = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  // ── Render ────────────────────────────────────────────────────────────

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
        <p className="text-gray-400 text-sm">Speak a transaction above to add your first entry.</p>
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

      {/* Totals strip */}
      {(() => {
        const debtors = rows.filter((r) => r.balance > 0);
        const total   = debtors.reduce((s, r) => s + r.balance, 0);
        return debtors.length > 0 ? (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex items-center gap-3 text-sm">
            <span className="text-red-600 font-semibold">Kul udhaar: {fmt(total)}</span>
            <span className="text-red-400">·</span>
            <span className="text-red-500">{debtors.length} customer{debtors.length !== 1 ? "s" : ""} with dues</span>
          </div>
        ) : (
          <div className="px-4 py-2 bg-green-50 border-b border-green-100 text-sm text-green-600 font-medium">
            ✓ Kisi ka udhaar baaki nahi hai
          </div>
        );
      })()}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100 bg-white">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium text-right">Balance (₹)</th>
              <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Last activity</th>
              <th className="px-4 py-3 font-medium text-right">Remind</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
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
                  <td className={`px-4 py-3 text-right font-semibold ${
                    row.balance > 0 ? "text-red-600" : row.balance < 0 ? "text-green-600" : "text-gray-400"
                  }`}>
                    {row.balance > 0 ? fmt(row.balance) : row.balance === 0 ? "Clear ✓" : fmt(row.balance)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">
                    {fmtDate(row.last_activity)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PhoneCell row={row} onSaved={fetchBalances} />
                  </td>
                </tr>

                {expandedId === row.id && (
                  <tr>
                    <td colSpan={4} className="bg-blue-50 border-b border-gray-200">
                      <TransactionPanel customerId={row.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Remind all panel */}
      <RemindAllPanel rows={rows} />
    </div>
  );
}
