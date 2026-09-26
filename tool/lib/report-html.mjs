// HTML-отчёт для человека: состояние проекта и история прогонов → одна страница.
//
// ЗАЧЕМ. Решение владельца 2026-09-26 (`PROJECT.md` §9а): «пока человек не понимает, как
// пользоваться инструментом, он не может направлять агента». Терминал отвечает агенту; человеку
// нужны три ответа на одном экране — что защищено, ловит ли защита на деле, лучше или хуже.
//
// ЧИСТАЯ ФУНКЦИЯ, И ЭТО НАМЕРЕННО. Данные собирает `gatherState` (context.mjs) — та же, что кормит
// блок для агента: посчитанное дважды разошлось бы, и человек видел бы одно, а агент другое.
// Здесь только раскладка, поэтому проверяется перебором случаев (`units-report-html.mjs`).
//
// ОДИН ФАЙЛ БЕЗ СЕТИ. Ни шрифтов, ни скриптов, ни картинок снаружи: отчёт открывают без интернета,
// в закрытом контуре и из архива конвейера. Графики — встроенный SVG. Зависимостей нет и не будет.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
// Команды в текстах каталога набраны в обратных кавычках — те же строки идут в терминал. Здесь
// они становятся <code>, и только после экранирования: иначе имя из манифеста стало бы разметкой.
const rich = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");

const fullRuns = (history) => history.filter((h) => h && !h.partial);
const count = (h, st) => Object.values(h?.gates || {}).filter((v) => v === st).length;

// Было → стало по ДВУМ ПОСЛЕДНИМ ПОЛНЫМ прогонам. Урезанный в сравнение не идёт: «красных стало
// меньше» после `--only lint` значило бы «меньше проверяли».
function compare(history) {
  const full = fullRuns(history);
  if (full.length < 2) return null;
  const [prev, now] = full.slice(-2);
  const bad = (h, g) => h.gates[g] === "fail" || h.gates[g] === "cannot";
  const names = [...new Set([...Object.keys(prev.gates), ...Object.keys(now.gates)])].sort();
  return {
    delta: (count(now, "fail") + count(now, "cannot")) - (count(prev, "fail") + count(prev, "cannot")),
    broke: names.filter((g) => bad(now, g) && !bad(prev, g)),
    fixed: names.filter((g) => bad(prev, g) && now.gates[g] === "ok"),
  };
}

function trendChart(history, T) {
  const runs = history.slice(-20);
  if (runs.length < 2) return `<p class="muted">${esc(T.chartEmpty)}</p>`;
  const top = Math.max(4, ...runs.map((h) => count(h, "fail") + count(h, "cannot")));
  const W = 640, H = 170, x0 = 40, y0 = 20, y1 = 120, step = (W - x0 - 20) / runs.length, bw = Math.min(40, step * 0.6);
  const y = (v) => y1 - (v / top) * (y1 - y0);
  const grid = [0, Math.round(top / 2), top].map((v) =>
    `<line x1="${x0}" y1="${y(v)}" x2="${W - 20}" y2="${y(v)}" stroke="var(--line)"/><text x="${x0 - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("");
  const bars = runs.map((h, i) => {
    const cx = x0 + step * i + step / 2, f = count(h, "fail"), u = count(h, "cannot");
    const fill = (k) => (h.partial ? `url(#hatch-${k})` : `var(--${k})`);
    const day = esc(String(h.at || "").slice(5, 10).replace("-", "."));
    const parts = f + u === 0
      ? `<rect x="${cx - bw / 2}" y="${y1 - 4}" width="${bw}" height="4" rx="2" fill="${fill("ok")}"/>`
      : `<rect x="${cx - bw / 2}" y="${y(f + u)}" width="${bw}" height="${y1 - y(f)}" rx="3" fill="${fill("fail")}"/>` +
        (u ? `<rect x="${cx - bw / 2}" y="${y(u)}" width="${bw}" height="${y1 - y(u)}" rx="3" fill="${fill("unk")}"/>` : "");
    return `${parts}<text x="${cx}" y="${y1 + 20}" text-anchor="middle">${day}</text>`;
  }).join("");
  const hatch = ["ok", "fail", "unk"].map((k) =>
    `<pattern id="hatch-${k}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--card)"/><rect width="3" height="6" fill="var(--${k})"/></pattern>`).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(T.chartLabel)}"><defs>${hatch}</defs>${grid}${bars}</svg></div>
<div class="legend"><span><i style="background:var(--fail)"></i>${esc(T.legend.fail)}</span><span><i style="background:var(--unk)"></i>${esc(T.legend.cannot)}</span><span><i style="background:var(--ok)"></i>${esc(T.legend.ok)}</span><span>${esc(T.legend.partial)}</span></div>`;
}

function answer(q, big, small, pill, kind) {
  return `<div class="answer"><span class="q">${esc(q)}</span><span class="a">${esc(big)} <small>${esc(small)}</small></span><span class="state s-${kind}">● ${esc(pill)}</span></div>`;
}

// ОДИН РАСЧЁТ НА ДВЕ РАСКЛАДКИ: страница и сводка для GitHub отвечают на одни вопросы, и
// посчитанное дважды разошлось бы — на странице одно, в конвейере другое.
function summarize(state, history, T) {
  const last = history[history.length - 1] || null;
  const full = fullRuns(history);
  const lastFull = full[full.length - 1] || null;
  const gates = Object.entries(last?.gates || {});
  const ok = gates.filter(([, v]) => v === "ok").length;
  const red = gates.filter(([, v]) => v === "fail").length;
  const cannot = gates.filter(([, v]) => v === "cannot").length;
  const secs = Object.values(last?.secs || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const level = lastFull ? lastFull.level : state.level?.reached ?? -1;

  const headline = !last ? T.headline.none
    : [red && T.headline.red(red), cannot && T.headline.cannot(cannot)].filter(Boolean).join(" · ") || T.headline.clean;
  const when = last ? String(last.at).replace("T", " ").slice(0, 16) : "";
  const meta = last ? T.meta(when, String(last.head || "").slice(0, 7), last.version, gates.length, secs.toFixed(0)) : [];

  // Проба: пять состояний, как в блоке для агента, — и перечисление исчерпывающее по той же
  // причине: выключенная или несостоявшаяся проба не должна выглядеть как «чисто».
  const pr = state.probe || { state: "never" };
  const quiet = ["never", "off", "unknown"].includes(pr.state);
  const [pBig, pSmall, pKind] = quiet ? T.probe[pr.state] : pr.blind > 0 ? T.probe.blind(pr.blind) : T.probe.clean;
  const pPill = pr.state === "stale" ? T.probe.stale(pr.behind) : quiet ? T.probe[pr.state][1] : T.probe.fresh;

  const cmp = compare(history);
  const [tBig, tSmall, tPill] = !cmp ? T.trend.none : cmp.delta < 0 ? T.trend.better(-cmp.delta) : cmp.delta > 0 ? T.trend.worse(cmp.delta) : T.trend.same;
  const tKind = !cmp ? "unk" : cmp.delta > 0 ? "fail" : "ok";
  return { last, gates, ok, red, cannot, level, headline, meta, pr, pBig, pSmall, pKind, pPill, cmp, tBig, tSmall, tPill, tKind };
}

function renderReport(state, history, { T, C, self = "aqk", name = "" }) {
  const { last, gates, ok, red, cannot, level, headline, meta, pr, pBig, pSmall, pKind, pPill, cmp, tBig, tSmall, tPill, tKind } = summarize(state, history, T);

  const gateCells = gates.map(([g, v]) =>
    `<div class="gate g-${v}" title="${esc(T.gateState[v] || v)}"><span>${esc(g)}</span><span class="t">${esc(Number(last.secs?.[g] ?? 0).toFixed(1))} с</span></div>`).join("")
    + (last?.skipped || []).map((g) => `<div class="gate g-skipped" title="${esc(T.gateState.skipped)}"><span>${esc(g)}</span><span class="t">~</span></div>`).join("");

  const blindList = (pr.classes || []).length
    ? `<p><b>${esc(T.probeBlindList)}</b> ${(pr.classes || []).map((b) => `<code>${esc(b.slug)}</code> (${esc(b.file)})`).join(", ")}</p>` : "";
  const counts = pr.counts ? `<p class="muted">${esc(T.probe.counts(pr.counts.caught, pr.counts.unknown))}</p>` : "";
  const human = state.rules?.human ? `<p>${esc(T.humanRules(state.rules.human, state.rules.total, state.entry || "AGENTS.md"))}</p>` : "";

  const changes = cmp && (cmp.broke.length || cmp.fixed.length)
    ? `<ul class="plain">${cmp.broke.length ? `<li><span class="state s-fail">${esc(T.trend.broke)}:</span> ${cmp.broke.map((g) => `<code>${esc(g)}</code>`).join(", ")}</li>` : ""}${cmp.fixed.length ? `<li><span class="state s-ok">${esc(T.trend.fixed)}:</span> ${cmp.fixed.map((g) => `<code>${esc(g)}</code>`).join(", ")}</li>` : ""}</ul>` : "";

  const steps = state.next?.steps || [];
  const todo = steps.length
    ? `<ol class="todo">${steps.map((st) => {
      const line = C.nextStep[st.kind](st);
      const cmd = (/`([^`]+)`/.exec(line) || [])[1] || "";
      return `<li><span>${rich(line)}</span>${cmd ? `<button type="button" data-copy="${esc(cmd)}">${esc(T.copy)}</button>` : ""}</li>`;
    }).join("")}</ol>${state.next.rest ? `<p class="muted">${esc(T.nextMore(state.next.rest))}</p>` : ""}<p class="muted">${esc(T.nextHint)}</p>`
    : `<p class="muted">${esc(T.nextNone)}</p>`;

  return `<!doctype html>
<html lang="${esc(T.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(T.title)}${name ? ` · ${esc(name)}` : ""}</title>
<style>${CSS}</style></head><body><div class="wrap">
<header><span class="eyebrow">${esc(T.eyebrow(name))}</span><h1>${esc(headline)}</h1><div class="meta">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div></header>
<div class="answers">
${last ? answer(T.q1, T.ofGreen(ok, gates.length), T.greenWord, T.levelPill(level), red ? "fail" : cannot ? "unk" : "ok")
    : `<div class="answer"><span class="q">${esc(T.q1)}</span><span class="a">— <small>${esc(T.noRun)}</small></span><span class="state s-unk">● ${rich(T.noRunHint(self))}</span></div>`}
${answer(T.q2, pBig, pSmall, pPill, pKind)}
${answer(T.q3, tBig, tSmall, tPill, tKind)}
</div>
<section><h2>1. ${esc(T.s1)}</h2><div class="panel">${gateCells ? `<div class="gates">${gateCells}</div>` : `<p class="muted">${rich(T.noRunHint(self))}</p>`}${human}</div></section>
<section><h2>2. ${esc(T.s2)}</h2><div class="panel"><p class="muted">${esc(T.probeWhat)}</p>${blindList}${counts}<p>${rich(T.probeRepeat(self))}</p></div></section>
<section><h2>3. ${esc(T.s3)}</h2><div class="panel">${changes}${trendChart(history, T)}</div></section>
<section><h2>4. ${esc(T.s4)}</h2>${todo}</section>
<footer>${esc(T.footer(self))}</footer>
</div><script>${copyScript(T)}</script></body></html>
`;
}

// СВОДКА ЗАДАНИЯ GITHUB — Markdown: HTML там не показывается (docs.github.com, «Adding a job
// summary»). Имена — в `коде`, и из них вынуто то, чем чужой манифест мог бы сломать разметку.
const mdName = (s) => "`" + String(s ?? "").replace(/`/g, "'").replace(/[<>|]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "|": "&#124;" })[ch]) + "`";

function renderSummary(state, history, { T, C, self = "aqk", name = "" }) {
  const { last, gates, ok, level, headline, pr, pBig, pSmall, pPill, cmp, tBig, tSmall, tPill } = summarize(state, history, T);
  const out = [`## ${T.title}${name ? ` · ${name}` : ""}`, "", `**${headline}**`, ""];
  out.push(last ? `- **${T.q1}** ${T.ofGreen(ok, gates.length)} ${T.greenWord} · ${T.levelPill(level)}` : `- **${T.q1}** ${T.noRun}`);
  out.push(`- **${T.q2}** ${pBig} ${pSmall} · ${pPill}`);
  out.push(`- **${T.q3}** ${tBig} ${tSmall} · ${tPill}`);
  const by = (st) => gates.filter(([, v]) => v === st).map(([g]) => mdName(g));
  if (by("fail").length) out.push("", `${T.gateState.fail}: ${by("fail").join(", ")}`);
  if (by("cannot").length) out.push("", `${T.gateState.cannot}: ${by("cannot").join(", ")}`);
  if ((pr.classes || []).length) out.push("", `${T.probeBlindList} ${pr.classes.map((b) => `${mdName(b.slug)} (${mdName(b.file)})`).join(", ")}`);
  if (cmp?.broke.length) out.push("", `${T.trend.broke}: ${cmp.broke.map(mdName).join(", ")}`);
  if (cmp?.fixed.length) out.push("", `${T.trend.fixed}: ${cmp.fixed.map(mdName).join(", ")}`);
  const steps = state.next?.steps || [];
  if (steps.length) {
    out.push("", `### ${T.s4}`, "");
    steps.forEach((st, i) => out.push(`${i + 1}. ${C.nextStep[st.kind](st)}`));
    if (state.next.rest) out.push("", T.nextMore(state.next.rest));
  }
  out.push("", `_${T.footer(self)}_`, "");
  return out.join("\n");
}

const copyScript = (T) => `document.querySelectorAll("button[data-copy]").forEach(function(b){b.addEventListener("click",function(){var t=b.getAttribute("data-copy");try{navigator.clipboard.writeText(t).then(function(){b.textContent=${JSON.stringify(T.copied)};setTimeout(function(){b.textContent=${JSON.stringify(T.copy)}},1500)},function(){b.textContent=t})}catch(e){b.textContent=t}})});`;

// Системные шрифты, а не веб-шрифты: страница обязана выглядеть одинаково без сети.
const CSS = `:root{--paper:#f4f6f4;--card:#fff;--ink:#18212b;--muted:#5f6b76;--line:#dde3e0;--accent:#0d6b68;--accent-soft:#e1efed;--ok:#2d7a4b;--ok-soft:#e3f1e8;--fail:#b0362a;--fail-soft:#f8e4e1;--unk:#a86b12;--unk-soft:#f7ecd9;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#11171b;--card:#182127;--ink:#e4eaee;--muted:#93a0aa;--line:#2a353d;--accent:#4fb3ad;--accent-soft:#16312f;--ok:#5fbf84;--ok-soft:#173026;--fail:#ec7a6c;--fail-soft:#3a1e1b;--unk:#e0a64c;--unk-soft:#352812;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding-inline:16px;padding-block:28px 56px}
.wrap{max-width:980px;margin:0 auto;display:grid;gap:28px}h1,h2{margin:0;line-height:1.15;text-wrap:balance}h1{font-size:28px}h2{font-size:20px}p{margin:0;max-width:70ch}
code,.mono,.meta,.eyebrow,.gate{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}code{font-size:12.5px;background:var(--accent-soft);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
.muted{color:var(--muted)}.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}header{display:grid;gap:10px}.meta{display:flex;flex-wrap:wrap;gap:6px 18px;color:var(--muted);font-size:13px}
.answers{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.answer{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;display:grid;gap:8px;align-content:start}
.answer .q{font-weight:600;font-size:13px;color:var(--muted)}.answer .a{font-weight:700;font-size:26px;line-height:1.1;font-variant-numeric:tabular-nums}.answer .a small{font-weight:500;font-size:14px;color:var(--muted)}
.state{display:inline-flex;gap:6px;font-weight:600;font-size:12px;padding:3px 8px;border-radius:999px;width:max-content;max-width:100%}.s-ok{color:var(--ok);background:var(--ok-soft)}.s-fail{color:var(--fail);background:var(--fail-soft)}.s-unk{color:var(--unk);background:var(--unk-soft)}
section{display:grid;gap:14px}.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px;display:grid;gap:12px}
.gates{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px}.gate{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:6px 9px;border-radius:6px;min-width:0}.gate span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gate .t{color:var(--muted);font-variant-numeric:tabular-nums}
.g-ok{background:var(--ok-soft)}.g-fail{background:var(--fail-soft);color:var(--fail)}.g-cannot{background:var(--unk-soft);color:var(--unk)}.g-skipped{background:transparent;border:1px dashed var(--line);color:var(--muted)}
ul.plain{list-style:none;padding:0;margin:0;display:grid;gap:8px}.chart{overflow-x:auto}svg{min-width:420px;max-width:100%}svg text{fill:var(--muted);font:11px ui-monospace,Menlo,monospace}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:var(--muted)}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.todo{padding:0;margin:0;display:grid;gap:10px;counter-reset:n}.todo li{list-style:none;display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px}.todo li::before{counter-increment:n;content:counter(n);font-weight:700;font-size:18px;color:var(--accent)}
button{font:600 12px system-ui,sans-serif;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;padding:6px 10px;cursor:pointer}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}footer{font-size:12.5px;color:var(--muted)}`;

export { renderReport, renderSummary };
