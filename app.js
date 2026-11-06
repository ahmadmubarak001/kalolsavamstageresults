const sb = supabase.createClient(KALO.url, KALO.key);
const S = {events:[],venues:[],links:[],parts:[],ann:[],res:[]};
let view = "venues", isAdmin = false, user = null, firstRender = true;
const sigs = new Map(), resSigs = new Map(), prevStats = {};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LABEL = {upcoming:"Upcoming", live:"Live", done:"Done", skipped:"Skipped"};
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const nowIso = () => new Date().toISOString();

function toast(m, err){ const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 3200); }
async function run(p, ok){ const r = await p; if (r.error){ toast(r.error.message, true); return false; } if (ok) toast(ok); return true; }
function confetti(){
  if (reduce) return;
  const box = document.createElement("div"); box.className = "confetti";
  for (let i = 0; i < 40; i++){ const s = document.createElement("i");
    s.style.cssText = `left:${Math.random()*100}%;background:${["#e8a317","#c8321e","#2f7d4f","#14524a"][i%4]};animation-delay:${Math.random()*.5}s;--x:${(Math.random()-.5)*220}px`; box.append(s); }
  document.body.append(box); setTimeout(() => box.remove(), 3000);
}
function countUp(el, to){
  const from = prevStats[el.dataset.k] ?? 0; prevStats[el.dataset.k] = to;
  if (reduce || from === to){ el.textContent = to; return; }
  const t0 = performance.now(); (function step(t){ const p = Math.min(1, (t - t0) / 600); el.textContent = Math.round(from + (to - from) * p); if (p < 1) requestAnimationFrame(step); })(t0);
}

// ---------- data ----------
async function load(){
  const ann = sb.from("announcements").select("*").order("created_at", {ascending:false});
  const [e,v,l,p,a,r] = await Promise.all([
    sb.from("events").select("*").order("sort_order"),
    sb.from("venues").select("*").order("sort_order"),
    sb.from("event_participants").select("event_id,participant_id,position"),
    sb.from("participants").select("id,name").order("name"),
    isAdmin ? ann : ann.eq("active", true),
    sb.from("event_results").select("*").order("rank"),
  ]);
  const err = [e,v,l,p,a,r].find(x => x.error);
  if (err){ $("view").innerHTML = `<p class="empty">Could not load data: ${esc(err.error.message)}</p>`; return; }
  Object.assign(S, {events:e.data, venues:v.data, links:l.data, parts:p.data, ann:a.data, res:r.data});
  render();
}
const pname = id => (S.parts.find(p => p.id === id) || {}).name;
const vname = id => (S.venues.find(v => v.id === id) || {}).name || id;
function namesFor(ev){
  const n = S.links.filter(x => x.event_id === ev.id).sort((a,b) => a.position - b.position).map(x => pname(x.participant_id)).filter(Boolean);
  return n.length ? n : (ev.participants ? ev.participants.split(",").map(s => s.trim()).filter(Boolean) : []);
}
const resFor = id => S.res.filter(r => r.event_id === id).sort((a,b) => a.rank - b.rank);
async function syncText(eventId){
  const n = S.links.filter(x => x.event_id === eventId).sort((a,b) => a.position - b.position).map(x => pname(x.participant_id)).filter(Boolean);
  await sb.from("events").update({participants:n.join(", "), updated_at:nowIso()}).eq("id", eventId);
}
async function reload(){ await load(); }

// ---------- render ----------
function resHtml(ev){
  const rows = resFor(ev.id); if (!rows.length) return "";
  return `<div class="res"><h4>Results · ഫലം</h4>${rows.map((r,i) => `<div class="medal r${r.rank}" style="--d:${i*130}ms"><span class="m">${r.rank}</span><span>${esc(r.participant_name)}</span>${r.grade ? `<em class="grade">${r.grade}</em>` : ""}</div>`).join("")}</div>`;
}
function adminBtns(ev){
  if (!isAdmin) return "";
  const id = esc(ev.id);
  return `<div class="actions"><button class="warn" data-st="live" data-id="${id}">Start</button><button class="pri" data-st="done" data-id="${id}">Done</button><button data-st="skipped" data-id="${id}">Skip</button><button data-st="upcoming" data-id="${id}">Reset</button><button data-res="${id}">Results</button><button data-edit="${id}">Edit</button><button data-del="${id}">Delete</button></div>`;
}
function evHtml(ev, i){
  const flash = sigs.has(ev.id) && sigs.get(ev.id) !== evSig(ev);
  return `<div class="ev ${ev.status}${flash ? " flash" : ""}${firstRender ? " enter" : ""}" style="--i:${i}"><div class="row"><b>${esc(ev.event_name)}</b><span class="badge b-${ev.status}">${LABEL[ev.status]}</span></div><small>${esc(namesFor(ev).join(", ")) || "—"}</small>${resHtml(ev)}${adminBtns(ev)}</div>`;
}
const evSig = ev => ev.status + "|" + ev.event_name + "|" + ev.updated_at + "|" + resFor(ev.id).map(r => r.rank + r.participant_name + r.grade).join(",");

function render(){
  const q = $("q").value.trim().toLowerCase();
  const match = ev => !q || ev.event_name.toLowerCase().includes(q) || namesFor(ev).some(n => n.toLowerCase().includes(q)) || resFor(ev.id).some(r => r.participant_name.toLowerCase().includes(q));
  const act = S.ann.filter(a => a.active);
  $("ticker").hidden = !act.length; if (act.length) $("ticker").firstElementChild.textContent = act.map(a => a.message).join("   •   ");
  const total = S.events.length, count = s => S.events.filter(e => e.status === s).length, done = count("done") + count("skipped");
  $("prog").style.width = total ? (done / total * 100) + "%" : "0";
  const stats = [["programs", total], ["live", count("live")], ["done", count("done")], ["upcoming", count("upcoming")], ["participants", S.parts.length]];
  $("stats").innerHTML = stats.map(([k]) => `<span><b data-k="${k}">0</b> ${k}</span>`).join("");
  stats.forEach(([k,n]) => countUp($("stats").querySelector(`[data-k="${k}"]`), n));
  const live = S.events.filter(e => e.status === "live");
  $("nowlive").innerHTML = live.length ? `<div class="nowlive"><h2><span class="dot"></span>Now on stage</h2>${live.map(e => `<div><b>${esc(e.event_name)}</b> · ${esc(vname(e.venue_id))}<br><small>${esc(namesFor(e).join(", "))}</small></div>`).join("")}</div>` : "";
  $("manageTab").hidden = !isAdmin;
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === view));
  ({venues:vVenues, results:vResults, people:vPeople, manage:vManage})[view](match);
  // detect newly published results -> confetti
  let celebrate = false;
  S.events.forEach(e => { const rs = resFor(e.id).map(r => r.rank + r.participant_name).join(); if (!firstRender && rs && resSigs.get(e.id) !== rs) celebrate = true; resSigs.set(e.id, rs); });
  S.events.forEach(e => sigs.set(e.id, evSig(e)));
  if (celebrate) confetti();
  firstRender = false;
  bindActions();
}
function vVenues(match){
  let i = 0;
  $("view").innerHTML = (isAdmin ? `<div class="tools"><button class="pri" id="addEv">+ Add program</button></div>` : "") +
    `<div class="grid">${S.venues.map((v, vi) => {
      const evs = S.events.filter(e => e.venue_id === v.id && match(e));
      return `<section class="venue ${firstRender ? "enter" : ""}" style="--i:${vi}"><h3><span>${esc(v.name)}</span><span>${evs.length}</span></h3>${evs.map(e => evHtml(e, i++)).join("") || '<div class="empty">No programs</div>'}</section>`;
    }).join("")}</div>`;
}
function vResults(match){
  const evs = S.events.filter(e => resFor(e.id).length && match(e));
  $("view").innerHTML = evs.length ? `<div class="plist">${evs.map((e,i) => `<div class="pcard enter" style="--i:${i}"><b>${esc(e.event_name)}</b><div><small>${esc(vname(e.venue_id))}</small></div>${resHtml(e)}</div>`).join("")}</div>` : '<p class="empty">No results published yet. They appear here the moment a program is judged.</p>';
}
function vPeople(match){
  const q = $("q").value.trim().toLowerCase();
  const rows = S.parts.map(p => ({p, evs:S.links.filter(l => l.participant_id === p.id).map(l => S.events.find(e => e.id === l.event_id)).filter(Boolean)}))
    .filter(r => !q || r.p.name.toLowerCase().includes(q) || r.evs.some(match)).sort((a,b) => a.p.name.localeCompare(b.p.name, "ml"));
  $("view").innerHTML = rows.length ? `<div class="plist">${rows.map((r,i) => `<div class="pcard enter" style="--i:${Math.min(i,12)}"><b>${esc(r.p.name)}</b>${r.evs.map(e => { const w = resFor(e.id).find(x => x.participant_name === r.p.name); return `<div><small>${esc(e.event_name)} · ${esc(vname(e.venue_id))} · ${LABEL[e.status]}${w ? ` · result: ${w.rank}${w.grade ? " (" + w.grade + ")" : ""}` : ""}</small></div>`; }).join("")}</div>`).join("")}</div>` : '<p class="empty">No matching participants</p>';
}
function vManage(){
  $("view").innerHTML = `
  <h3 class="sub">Participants</h3>
  <div class="tools"><input id="np" placeholder="New participant name"><button class="pri" id="addp">Add participant</button></div>
  <div class="plist">${S.parts.map(p => `<div class="pcard"><b>${esc(p.name)}</b><div><small>${esc(S.links.filter(l => l.participant_id === p.id).map(l => (S.events.find(e => e.id === l.event_id) || {}).event_name).filter(Boolean).join(" · ") || "No programs")}</small></div><div class="actions"><button data-rn="${p.id}">Rename</button><button data-dp="${p.id}">Delete</button></div></div>`).join("")}</div>
  <h3 class="sub">Venues</h3>
  <div class="panel">${S.venues.map(v => `<div class="tools"><b style="min-width:36px">${v.id}</b><input data-vn="${v.id}" value="${esc(v.name)}" aria-label="Venue name"><button data-vs="${v.id}">Save name</button></div>`).join("")}</div>
  <h3 class="sub">Announcements</h3>
  <div class="tools"><input id="na" placeholder="Message for the public ticker"><button class="pri" id="adda">Publish</button></div>
  ${S.ann.map(a => `<div class="panel"><div class="row"><span>${esc(a.message)}</span><span class="badge b-${a.active ? "live" : "skipped"}">${a.active ? "Showing" : "Hidden"}</span></div><div class="actions"><button data-ta="${a.id}">${a.active ? "Hide" : "Show"}</button><button data-da="${a.id}">Delete</button></div></div>`).join("") || '<p class="empty">No announcements yet</p>'}`;
}

// ---------- events / actions ----------
function bindActions(){
  const on = (sel, fn) => document.querySelectorAll(sel).forEach(b => b.onclick = () => fn(b));
  if (!isAdmin) return;
  if ($("addEv")) $("addEv").onclick = () => editProgram();
  on("[data-st]", b => setStatus(b.dataset.id, b.dataset.st));
  on("[data-edit]", b => editProgram(b.dataset.edit));
  on("[data-res]", b => editResults(b.dataset.res));
  on("[data-del]", async b => { const e = S.events.find(x => x.id === b.dataset.del); if (confirm(`Delete "${e.event_name}"?`) && await run(sb.from("events").delete().eq("id", e.id), "Deleted")) reload(); });
  if ($("addp")) $("addp").onclick = async () => { const n = $("np").value.trim(); if (n && await run(sb.from("participants").insert({name:n}), "Added")) reload(); };
  on("[data-rn]", async b => { const p = S.parts.find(x => x.id === b.dataset.rn), n = prompt("Rename participant", p.name); if (!n || !n.trim() || n === p.name) return;
    if (await run(sb.from("participants").update({name:n.trim()}).eq("id", p.id), "Renamed")){ await load(); for (const l of S.links.filter(l => l.participant_id === p.id)) await syncText(l.event_id); reload(); } });
  on("[data-dp]", async b => { const p = S.parts.find(x => x.id === b.dataset.dp); if (!confirm(`Delete ${p.name}? They will be removed from all programs.`)) return;
    const evs = S.links.filter(l => l.participant_id === p.id).map(l => l.event_id);
    if (await run(sb.from("participants").delete().eq("id", p.id), "Deleted")){ await load(); for (const id of evs) await syncText(id); reload(); } });
  on("[data-vs]", async b => { const n = document.querySelector(`[data-vn="${b.dataset.vs}"]`).value.trim(); if (n && await run(sb.from("venues").update({name:n, updated_at:nowIso()}).eq("id", b.dataset.vs), "Saved")) reload(); });
  if ($("adda")) $("adda").onclick = async () => { const m = $("na").value.trim(); if (m && await run(sb.from("announcements").insert({message:m}), "Published")) reload(); };
  on("[data-ta]", async b => { const a = S.ann.find(x => x.id === b.dataset.ta); if (await run(sb.from("announcements").update({active:!a.active}).eq("id", a.id))) reload(); });
  on("[data-da]", async b => { if (confirm("Delete this announcement?") && await run(sb.from("announcements").delete().eq("id", b.dataset.da), "Deleted")) reload(); });
}
async function setStatus(id, status){
  const now = nowIso(), cur = S.events.find(e => e.id === id);
  const patch = {status, updated_at:now, started_at: status === "live" ? now : status === "upcoming" ? null : cur.started_at, completed_at: status === "done" ? now : null};
  if (await run(sb.from("events").update(patch).eq("id", id), LABEL[status])) reload();
}
function editProgram(id){
  const e = id ? S.events.find(x => x.id === id) : {event_name:"", venue_id:S.venues[0]?.id, sort_order:S.events.length + 1};
  const sel = new Set(id ? S.links.filter(l => l.event_id === id).map(l => l.participant_id) : []), d = $("dlg");
  d.innerHTML = `<h3>${id ? "Edit program" : "Add program"}</h3>
    <label>Program name</label><input id="f_n" value="${esc(e.event_name)}">
    <label>Venue</label><select id="f_v">${S.venues.map(v => `<option value="${v.id}" ${v.id === e.venue_id ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select>
    <label>Order at venue</label><input id="f_o" type="number" value="${e.sort_order}">
    <label>Participants</label><div class="chk">${S.parts.map(p => `<label><input type="checkbox" value="${p.id}" ${sel.has(p.id) ? "checked" : ""}>${esc(p.name)}</label>`).join("") || "Add participants in Manage first."}</div>
    <div class="actions"><button class="pri" id="f_s">Save</button><button id="f_c">Cancel</button></div>`;
  d.showModal(); $("f_c").onclick = () => d.close();
  $("f_s").onclick = async () => {
    const name = $("f_n").value.trim(); if (!name) return toast("Enter a program name", true);
    const eid = id || "e" + (Math.max(0, ...S.events.map(x => parseInt(String(x.id).replace(/\D/g, "")) || 0)) + 1);
    if (!await run(sb.from("events").upsert({id:eid, event_name:name, venue_id:$("f_v").value, sort_order:+$("f_o").value || 0, updated_at:nowIso()}))) return;
    const chosen = [...d.querySelectorAll(".chk input:checked")].map(i => i.value);
    if (!await run(sb.from("event_participants").delete().eq("event_id", eid))) return;
    if (chosen.length && !await run(sb.from("event_participants").insert(chosen.map((pid, i) => ({event_id:eid, participant_id:pid, position:i + 1}))))) return;
    d.close(); await load(); await syncText(eid); await load(); toast("Saved");
  };
}
function editResults(id){
  const e = S.events.find(x => x.id === id), cur = resFor(id), d = $("dlg"), names = namesFor(e);
  const row = r => { const c = cur.find(x => x.rank === r) || {}; return `<div class="tools"><b style="min-width:26px">${r}</b><input list="pl" data-rk="${r}" placeholder="Winner name" value="${esc(c.participant_name || "")}" style="flex:1;min-width:140px"><select data-rg="${r}" aria-label="Grade"><option value="">Grade</option>${["A","B","C"].map(g => `<option ${c.grade === g ? "selected" : ""}>${g}</option>`).join("")}</select></div>`; };
  d.innerHTML = `<h3>Results: ${esc(e.event_name)}</h3><datalist id="pl">${names.concat(S.parts.map(p => p.name)).map(n => `<option value="${esc(n)}">`).join("")}</datalist>
    ${[1,2,3].map(row).join("")}
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="r_done" style="width:auto;min-height:0" ${e.status !== "done" ? "checked" : ""}> Mark program as done</label>
    <div class="actions"><button class="pri" id="r_s">Publish results</button><button id="r_x">Clear results</button><button id="r_c">Cancel</button></div>`;
  d.showModal(); $("r_c").onclick = () => d.close();
  $("r_x").onclick = async () => { if (await run(sb.from("event_results").delete().eq("event_id", id), "Results cleared")){ d.close(); reload(); } };
  $("r_s").onclick = async () => {
    const rows = [1,2,3].map(r => ({event_id:id, rank:r, participant_name:d.querySelector(`[data-rk="${r}"]`).value.trim(), grade:d.querySelector(`[data-rg="${r}"]`).value || null}))
      .filter(r => r.participant_name).map(r => ({...r, participant_id:(S.parts.find(p => p.name === r.participant_name) || {}).id || null}));
    if (!rows.length) return toast("Enter at least one winner", true);
    if (!await run(sb.from("event_results").delete().eq("event_id", id))) return;
    if (!await run(sb.from("event_results").insert(rows))) return;
    if ($("r_done").checked) await sb.from("events").update({status:"done", completed_at:nowIso(), updated_at:nowIso()}).eq("id", id);
    d.close(); await load(); toast("Results published"); confetti();
  };
}

// ---------- auth (admin hidden until #admin or footer link) ----------
function loginDialog(msg){
  const d = $("dlg");
  d.innerHTML = `<h3>Admin sign in</h3>${msg ? `<p style="color:var(--live)">${esc(msg)}</p>` : ""}
    <label for="em">Email</label><input id="em" type="email" autocomplete="username">
    <label for="pw">Password</label><div class="pw"><input id="pw" type="password" autocomplete="current-password"><button type="button" id="tg" aria-pressed="false">Show</button></div>
    <div class="actions"><button class="pri" id="go">Sign in</button><button id="lc">Cancel</button></div>`;
  if (!d.open) d.showModal();
  $("lc").onclick = () => { d.close(); history.replaceState(null, "", location.pathname); };
  $("tg").onclick = () => { const h = $("pw").type === "password"; $("pw").type = h ? "text" : "password"; $("tg").textContent = h ? "Hide" : "Show"; $("tg").setAttribute("aria-pressed", h); };
  const go = async () => { const {error} = await sb.auth.signInWithPassword({email:$("em").value.trim(), password:$("pw").value}); if (error) return loginDialog(error.message); d.close(); await checkAdmin(true); };
  $("go").onclick = go; $("pw").onkeydown = e => e.key === "Enter" && go(); $("em").focus();
}
async function checkAdmin(announce){
  const {data:{session}} = await sb.auth.getSession(); user = session ? session.user : null; isAdmin = false;
  if (user){ const {data} = await sb.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle(); isAdmin = !!data; }
  const bar = $("adminbar"); bar.hidden = !user;
  if (user) bar.innerHTML = isAdmin ? `<span>Admin mode · ${esc(user.email)}</span><button id="out">Sign out</button>` : `<span>${esc(user.email)} is not an admin. User id: ${esc(user.id)}</span><button id="out">Sign out</button>`;
  if ($("out")) $("out").onclick = async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); };
  if (!isAdmin && view === "manage") view = "venues";
  if (announce && isAdmin) toast("Signed in as admin");
  await load();
}
function openAdmin(){ if (!isAdmin) loginDialog(); }
$("adminLink").onclick = e => { e.preventDefault(); history.replaceState(null, "", "#admin"); openAdmin(); };

// ---------- wiring ----------
document.querySelectorAll(".tab").forEach(b => b.onclick = () => { view = b.dataset.v; render(); });
$("q").oninput = render;
let timer; const refresh = () => { clearTimeout(timer); timer = setTimeout(() => { if (!$("dlg").open) load(); }, 200); };
let ch = sb.channel("kalolsavam-live");
KALO.tables.forEach(t => ch = ch.on("postgres_changes", {event:"*", schema:"public", table:t}, refresh));
ch.subscribe(status => {
  const c = $("conn"); c.classList.toggle("on", status === "SUBSCRIBED");
  c.lastElementChild.textContent = status === "SUBSCRIBED" ? "Live" : status === "CLOSED" ? "Offline" : "Connecting…";
});
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("dlg").open) load(); });
(async () => { await checkAdmin(false); if (location.hash === "#admin") openAdmin(); })();
