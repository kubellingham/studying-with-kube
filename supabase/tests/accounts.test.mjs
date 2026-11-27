// Runs the migrations on PGlite (Postgres in WebAssembly) with Supabase's auth
// pieces stubbed, then checks every cap, refund, isolation and share-link
// rule. Run with `npm run test:db`; no database or network needed.
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const DIR = new URL("../migrations/", import.meta.url);
const db = new PGlite();
let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

// --- Supabase stand-ins: roles, auth.users, auth.uid(), default grants.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
`);
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(new URL(file, DIR), "utf8"));
}

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${A}', 'a@example.com', '{"full_name":"Student A"}'), ('${B}', 'b@example.com', '{}')`);

/** Runs SQL as a role (and user), like a PostgREST request. Returns rows or the error message. */
async function as(role, uid, sql, params = []) {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [uid ? JSON.stringify({ sub: uid, role }) : ""]);
    await db.exec(`set local role ${role}`);
    const r = await db.query(sql, params);
    await db.exec("commit");
    return r.rows;
  } catch (e) {
    await db.exec("rollback");
    return { error: e.message };
  }
}
const reserve = (uid, mode, cap = null) => as("authenticated", uid, "select public.reserve_generation($1, $2) r", [mode, cap]).then((r) => r[0]?.r ?? r);
const complete = (uid, id) => as("authenticated", uid, "select public.complete_generation($1, 12, 0.008)", [id]);
const fail = (uid, id) => as("authenticated", uid, "select public.fail_generation($1)", [id]);
const status = async (id) => (await db.query("select status from public.generations where id = $1", [id])).rows[0]?.status;

// Profiles from the trigger.
const profiles = (await db.query("select id, name, plan from public.profiles order by id")).rows;
check("trigger creates a free profile per new user, with the Google name", profiles.length === 2 && profiles[0].name === "Student A" && profiles.every((p) => p.plan === "free"));

// Free Middle: 5 per IST day.
let lastOk;
for (let i = 1; i <= 5; i++) {
  lastOk = await reserve(A, "middle");
  await complete(A, lastOk.id);
}
check("free Middle: 5 reservations succeed", lastOk.ok === true && lastOk.used === 5 && lastOk.left === 0, JSON.stringify({ used: lastOk.used, left: lastOk.left }));
const sixth = await reserve(A, "middle");
check("free Middle: the 6th is refused with reason 'limit'", sixth.ok === false && sixth.reason === "limit" && sixth.limit === 5);
const resets = new Date(sixth.resets_at);
check("daily cap resets at midnight IST (18:30 UTC)", resets.getUTCHours() === 18 && resets.getUTCMinutes() === 30 && resets > new Date(), sixth.resets_at);

// Busy, refunds, done-wins, stale reservations.
const p1 = await reserve(B, "middle");
const p2 = await reserve(B, "middle");
check("a second upload while one is running is refused as 'busy'", p1.ok && p2.ok === false && p2.reason === "busy");
await fail(B, p1.id);
const after = await reserve(B, "middle");
check("a failed generation is refunded (doesn't count)", after.ok && after.used === 1, `used=${after.used}`);
await fail(B, after.id);
await complete(B, after.id);
check("complete after fail still counts it (done wins)", (await status(after.id)) === "done");
await db.query(`insert into public.generations (user_id, mode, status, created_at) values ($1, 'middle', 'reserved', now() - interval '20 minutes')`, [B]);
const s = (await as("authenticated", B, "select public.usage_summary() u"))[0].u;
check("a reservation abandoned >15 min ago stops counting", s.middle.used === 1, `used=${s.middle.used}`);

// IST day boundary: a generation just before today's IST midnight doesn't count today.
await db.query(`insert into public.generations (user_id, mode, status, created_at) values
  ($1, 'middle', 'done', (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') - interval '1 minute'),
  ($1, 'middle', 'done', (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') + interval '1 minute')`, [B]);
const s2 = (await as("authenticated", B, "select public.usage_summary() u"))[0].u;
check("IST day window: 23:59 IST yesterday excluded, 00:01 IST today counted", s2.middle.used === 2, `used=${s2.middle.used}`);

// Free Panic: 1 per IST calendar month. Free Comprehensive: none.
const pa = await reserve(A, "panic");
await complete(A, pa.id);
const pb = await reserve(A, "panic");
const presets = new Date(pb.resets_at);
check("free Panic: 1 per month, the 2nd refused", pa.ok && pb.ok === false && pb.reason === "limit" && pb.per === "month");
check("monthly Panic resets on the 1st at midnight IST", presets.getUTCHours() === 18 && presets.getUTCMinutes() === 30 && new Date(presets.getTime() + 6 * 3600e3).getUTCDate() === 1, pb.resets_at);
await db.query(`insert into public.generations (user_id, mode, status, created_at) values
  ($1, 'panic', 'done', (date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') - interval '1 minute')`, [B]);
const bp = await reserve(B, "panic");
check("last month's Panic doesn't count this month", bp.ok === true, JSON.stringify({ used: bp.used }));
await complete(B, bp.id);
const ca = await reserve(A, "comprehensive");
check("free Comprehensive: locked (limit 0)", ca.ok === false && ca.limit === 0 && ca.reason === "limit");

// Paid: 30 / 10 / 10 per day; expired paid_until falls back to free.
await db.query(`update public.profiles set plan = 'paid' where id = $1`, [A]);
const ps = (await as("authenticated", A, "select public.usage_summary() u"))[0].u;
check("paid limits: Middle 30, Panic 10/day, Comprehensive 10/day", ps.middle.limit === 30 && ps.panic.limit === 10 && ps.panic.per === "day" && ps.comprehensive.limit === 10 && ps.middle.plan === "paid");
const cp = await reserve(A, "comprehensive");
check("paid can reserve Comprehensive", cp.ok === true);
await complete(A, cp.id);
await db.query(`update public.profiles set paid_until = now() - interval '1 day' where id = $1`, [A]);
const exp = (await as("authenticated", A, "select public.usage_summary() u"))[0].u;
check("expired paid_until falls back to free limits", exp.middle.plan === "free" && exp.middle.limit === 5);

// Site-wide daily brake.
const brake = await reserve(B, "middle", 1);
check("site-wide daily cap refuses with 'site_limit'", brake.ok === false && brake.reason === "site_limit");

// Isolation between users.
const aRow = (await db.query(`select id from public.generations where user_id = $1 and status = 'done' limit 1`, [A])).rows[0].id;
const bReserve = await reserve(B, "middle");
check("(setup) B holds a fresh reservation", bReserve.ok === true, JSON.stringify(bReserve));
await fail(A, bReserve.id);
check("one user can't fail another's generation", (await status(bReserve.id)) === "reserved");
await fail(B, bReserve.id);
const seen = await as("authenticated", B, "select count(*)::int n from public.generations where user_id = $1", [A]);
const seenProfiles = await as("authenticated", B, "select count(*)::int n from public.profiles");
check("RLS: a user sees none of another user's generations, and only their own profile", seen[0].n === 0 && seenProfiles[0].n === 1);
const selfUpgrade = await as("authenticated", B, "update public.profiles set plan = 'paid' where id = $1 returning id", [B]);
check("a user can't mark themselves paid", Array.isArray(selfUpgrade) && selfUpgrade.length === 0 && (await db.query("select plan from public.profiles where id=$1", [B])).rows[0].plan === "free");
const directInsert = await as("authenticated", B, "insert into public.generations (user_id, mode, status) values ($1, 'middle', 'failed') returning id", [B]);
check("a user can't write generation rows directly", !!directInsert.error, directInsert.error?.slice(0, 60));
check("complete on someone else's row does nothing", (await complete(B, aRow), (await status(aRow)) === "done"));

// Anonymous callers.
const anonReserve = await as("anon", null, "select public.reserve_generation('middle')");
check("anon can't reserve a generation", !!anonReserve.error, anonReserve.error?.slice(0, 60));
const anonUsage = await as("anon", null, "select public.usage_summary()");
check("anon can't read usage", !!anonUsage.error);
const authNoUid = await as("authenticated", null, "select public.reserve_generation('middle')");
check("a request with no user id is refused", !!authNoUid.error, authNoUid.error?.slice(0, 40));

// Share links.
const ID = "AbCdEfGhIjKlMnOpQrSt";
const ins = await as("authenticated", A, "insert into public.shared_sets (id, created_by, study_set) values ($1, $2, $3)", [ID, A, JSON.stringify({ title: "T", version: 1 })]);
check("a signed-in user can share their set", !ins.error, ins.error);
const spoof = await as("authenticated", B, "insert into public.shared_sets (id, created_by, study_set) values ($1, $2, '{}')", ["ZZZZZZZZZZZZZZZZZZZZ", A]);
check("can't share a set as someone else", !!spoof.error);
const anonIns = await as("anon", null, "insert into public.shared_sets (id, created_by, study_set) values ($1, null, '{}')", ["YYYYYYYYYYYYYYYYYYYY"]);
check("anon can't create share links", !!anonIns.error);
const listed = await as("authenticated", A, "select count(*)::int n from public.shared_sets");
check("shared sets can't be listed, not even your own", listed[0].n === 0);
const opened = await as("anon", null, "select public.get_shared_set($1) s", [ID]);
check("anyone can open a share link by id, without signing in", opened[0].s?.title === "T");
const missing = await as("anon", null, "select public.get_shared_set($1) s", ["nopeNopeNopeNopeNope"]);
check("an unknown id returns nothing", missing[0].s === null);
const keep = await as("anon", null, "select public.keepalive() t");
check("keep-alive callable anonymously", !!keep[0]?.t);

console.log(failures ? `${failures} FAILED` : "ALL PASS");
process.exit(failures ? 1 : 0);
