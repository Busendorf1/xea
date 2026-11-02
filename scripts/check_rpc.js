#!/usr/bin/env node
/**
 * RLS exposure probe (read-only).
 *
 * Uses ONLY the public anon/publishable key (the same key shipped to every browser)
 * and checks, per table, whether that key can read rows. Uses HEAD + count queries,
 * so no row data is ever downloaded or printed. Keys are never printed.
 *
 * Usage:  node scripts/check_rpc.js            (reads .env.local, then .env)
 * Exit code 1 if any sensitive table is readable by the anon key.
 */
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or anon/publishable key in .env.local / .env");
  process.exit(2);
}

// Tables that must NEVER be readable with the public key.
const SENSITIVE = [
  "users",
  "payments",
  "ledger_entries",
  "notifications",
  "admin_audit_logs",
  "pending_admin_requests",
  "help_tickets",
  "forfeited_balances",
  "system_reconciliation_logs",
  "premium_subscribers",
  "ad_impressions",
  "completed_ads",
  "completed_ads_ratings",
  "ad_reports",
  "blocked_ads",
  "bidded_ads",
  "adds",
  "news",
];
// Tables the browser currently subscribes to via Realtime (public ad content).
const PUBLIC_CONTENT = ["addsactive", "newsactive", "global_announcements"];

const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

async function probe(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return { table, readable: false, detail: error.code || error.message };
  // RLS-on with no matching policy returns count 0 without error; count > 0 means rows are visible.
  return { table, readable: (count ?? 0) > 0, detail: `visible rows: ${count ?? 0}` };
}

(async () => {
  let exposed = 0;
  console.log("== Sensitive tables (must be NOT readable) ==");
  for (const t of SENSITIVE) {
    const r = await probe(t);
    if (r.readable) exposed++;
    console.log(`${r.readable ? "EXPOSED " : "ok      "} ${t.padEnd(28)} ${r.detail}`);
  }
  console.log("\n== Public content tables (readable is expected) ==");
  for (const t of PUBLIC_CONTENT) {
    const r = await probe(t);
    console.log(`${r.readable ? "readable" : "blocked "} ${t.padEnd(28)} ${r.detail}`);
  }
  console.log(exposed ? `\n${exposed} sensitive table(s) readable with the public key.` : "\nNo sensitive tables readable.");
  process.exit(exposed ? 1 : 0);
})();
