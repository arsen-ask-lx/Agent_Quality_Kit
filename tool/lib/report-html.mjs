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
// Время прогона — по часам машины, где собран отчёт, и одним способом везде: в шапке стояло время
// по Гринвичу, а в сетке — местное, и один прогон читался как два разных (найдено глазами 2026-09-26).
const local = (at) => {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return { day: "", hm: "" };
  const p = (n) => String(n).padStart(2, "0");
  return { day: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hm: `${p(d.getHours())}:${p(d.getMinutes())}` };
};
const count = (h, st) => Object.values(h?.gates || {}).filter((v) => v === st).length;

// Было → стало по ДВУМ ПОСЛЕДНИМ ПОЛНЫМ прогонам. Урезанный в сравнение не идёт: «красных стало
// меньше» после `--only lint` значило бы «меньше проверяли».
function compare(history) {
  const full = fullRuns(history);
  if (full.length < 2) return null;
  const [prev, now] = full.slice(-2);
  const bad = (h, g) => h.gates[g] === "fail" || h.gates[g] === "cannot";
  // Считаем только проверки, которые есть В ОБОИХ прогонах. Иначе удалённый красный гейт давал
  // «красных стало меньше» — снятие защиты выглядело улучшением (разбор evalite, 2026-09-26).
  // Пропавшие названы отдельно, и при них вердикт «сравнивать нельзя», а не «лучше».
  const both = Object.keys(now.gates).filter((g) => g in prev.gates).sort();
  const reds = (h) => both.filter((g) => bad(h, g)).length;
  return {
    delta: reds(now) - reds(prev),
    broke: both.filter((g) => bad(now, g) && !bad(prev, g)),
    fixed: both.filter((g) => bad(prev, g) && now.gates[g] === "ok"),
    gone: Object.keys(prev.gates).filter((g) => !(g in now.gates)).sort(),
  };
}

// СЕТКА «ПРОВЕРКИ × ПРОГОНЫ». Одна клетка — одна проверка в одном прогоне: так видно не «сколько
// красных», а ЧТО и КОГДА покраснело. Идея «одна единица = один объект» взята из разбора
// lieflat-charts (2026-09-26); код свой — лицензия того скилла некоммерческая, а отчёт обязан
// открываться без сети. Проблемные строки наверху: их и читают.
function grid(history, T) {
  const runs = history.slice(-20);
  if (!runs.length) return `<p class="muted">${esc(T.grid.empty)}</p>`;
  const names = [...new Set(runs.flatMap((h) => Object.keys(h.gates || {})))];
  const trouble = (g) => runs.some((h) => h.gates?.[g] === "fail" || h.gates?.[g] === "cannot");
  names.sort((a, b) => (trouble(b) - trouble(a)) || a.localeCompare(b));
  const red = runs.reduce((n, h) => n + count(h, "fail") + count(h, "cannot"), 0);
  const C = 14, G = 3, LW = 190, TOP = 34, W = LW + runs.length * (C + G) + 10, H = TOP + names.length * (C + G) + 10;
  const hhmm = (at) => local(at).hm;
  const cols = runs.map((h, j) => `<text x="${LW + j * (C + G) + C / 2}" y="${TOP - 8}" text-anchor="end" transform="rotate(-50 ${LW + j * (C + G) + C / 2} ${TOP - 8})">${esc(hhmm(h.at))}${h.partial ? "*" : ""}</text>`).join("");
  const rows = names.map((g, i) => {
    const y = TOP + i * (C + G);
    const cells = runs.map((h, j) => {
      const v = h.gates?.[g] || "none";
      const x = LW + j * (C + G);
      const shape = v === "ok" ? `<rect x="${x + 3}" y="${y + 3}" width="${C - 6}" height="${C - 6}" rx="2" fill="var(--ok)"/>`
        : v === "fail" ? `<rect x="${x}" y="${y}" width="${C}" height="${C}" rx="3" fill="var(--fail)"/>`
        : v === "cannot" ? `<rect x="${x + 1}" y="${y + 1}" width="${C - 2}" height="${C - 2}" rx="3" fill="none" stroke="var(--unk)" stroke-width="2"/>`
        : `<line x1="${x + 3}" y1="${y + C / 2}" x2="${x + C - 3}" y2="${y + C / 2}" stroke="var(--line)" stroke-width="1.5"/>`;
      return `<g data-cell="${v}"><title>${esc(`${g} · ${hhmm(h.at)} · ${T.grid[v]}`)}</title>${shape}</g>`;
    }).join("");
    const nm = g.length > 26 ? `${g.slice(0, 25)}…` : g;
    return `<text x="${LW - 8}" y="${y + C - 3}" text-anchor="end"${trouble(g) ? ' class="hot"' : ""}>${esc(nm)}</text>${cells}`;
  }).join("");
  return `<h3>${esc(T.grid.title(runs.length, names.length, red))}</h3><p class="muted">${esc(T.grid.sub)}</p>
<div class="chart"><svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="${esc(T.grid.label)}">${cols}${rows}</svg></div>
<div class="legend"><span><i style="background:var(--ok)"></i>${esc(T.grid.ok)}</span><span><i style="background:var(--fail)"></i>${esc(T.grid.fail)}</span><span><i style="border:2px solid var(--unk)"></i>${esc(T.grid.cannot)}</span><span><i style="background:var(--line)"></i>${esc(T.grid.none)}</span></div>`;
}

// ОДИН РАСЧЁТ НА ДВЕ РАСКЛАДКИ: страница и сводка для GitHub отвечают теми же разделами, и
// посчитанное дважды разошлось бы — на странице одно, в конвейере другое. Порядок и смысл
// разделов — решение владельца 2026-09-26: этот шаг, сделано, долг, впереди.
function sections(state, history, { T, C, self, intents = {} }) {
  const last = history[history.length - 1] || null;
  const full = fullRuns(history);
  const lastFull = full[full.length - 1] || null;
  const gates = Object.entries(last?.gates || {});
  const ok = gates.filter(([, v]) => v === "ok").length;
  const red = gates.filter(([, v]) => v === "fail").length;
  const cannot = gates.filter(([, v]) => v === "cannot").length;
  const secs = Object.values(last?.secs || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const level = lastFull ? lastFull.level : state.level?.reached ?? -1;
  const label = (g) => intents[g] || g;
  const when = last ? `${local(last.at).day} ${local(last.at).hm}` : "";
  const headline = !last ? T.headline.none
    : [red && T.headline.red(red), cannot && T.headline.cannot(cannot)].filter(Boolean).join(" · ") || T.headline.clean;
  const meta = last ? T.meta(when, String(last.head || "").slice(0, 7), last.version, gates.length, secs.toFixed(0)) : [];

  const cmp = compare(history);
  const changes = cmp ? [["gone", cmp.gone], ["broke", cmp.broke], ["fixed", cmp.fixed]].filter(([, l]) => l.length) : [];
  const steps = state.next?.steps || [];
  const step = {
    made: last ? T.step.run(when, ok, gates.length) : T.noRunHint(self),
    changes, change: !last ? "" : !cmp ? T.step.first : changes.length ? "" : T.step.same,
    bad: !last ? "" : red || cannot ? T.step.bad1(red, cannot) : T.step.nothingBad,
    next: steps.length ? C.nextStep[steps[0].kind](steps[0]) : T.step.nextNone,
  };

  const done = gates.filter(([, v]) => v === "ok").map(([g]) => label(g));

  // Долг: всё, что уже есть, но работает не до конца. Отсутствие долга говорится словами —
  // молчание здесь прочиталось бы как «проверено и чисто».
  const debt = [];
  for (const [g, v] of gates) {
    if (v === "fail") debt.push({ lead: label(g), text: T.debt.fail });
    if (v === "cannot") debt.push({ lead: label(g), text: T.debt.cannot });
  }
  const pr = state.probe || { state: "never" };
  if (pr.state === "never") debt.push({ text: T.debt.probeNever(self) });
  else if (pr.state === "off") debt.push({ text: T.debt.probeOff });
  else if (pr.state === "unknown") debt.push({ text: T.debt.probeUnknown });
  else {
    if (pr.state === "stale") debt.push({ text: T.debt.probeStale(pr.behind, self) });
    if (pr.blind > 0) debt.push({ text: T.debt.probeBlind(pr.blind), names: (pr.classes || []).map((b) => `${b.slug} (${b.file})`) });
  }
  if (state.rules?.human) debt.push({ text: T.debt.human(state.rules.human, state.rules.total, state.entry || "AGENTS.md") });
  for (const r of state.ratchets || []) debt.push({ text: T.debt.ratchet(r.name, r.count) });

  const ahead = steps.map((st) => C.nextStep[st.kind](st));
  return { last, gates, ok, level, headline, meta, step, done, debt, ahead, rest: state.next?.rest || 0 };
}

function renderReport(state, history, { T, C, self = "aqk", name = "", intents = {} }) {
  const S = sections(state, history, { T, C, self, intents });
  const block = (title, lines, body) => `<section><h2>${esc(title)}</h2>${lines.length ? `<div class="lead">${lines.map(([k, v]) => `<p><b>${esc(k)}</b> ${rich(v)}</p>`).join("")}</div>` : ""}${body}</section>`;
  const names = (l) => l.map((g) => `<code>${esc(g)}</code>`).join(", ");

  const stepLines = [
    [T.step.made, S.step.made + (S.step.change ? ` ${S.step.change}` : "")],
    ...(S.step.bad ? [[T.step.bad, S.step.bad]] : []),
    [T.step.next, S.step.next],
  ];
  const stepBody = S.step.changes.length
    ? `<ul class="plain">${S.step.changes.map(([k, l]) => `<li><span class="state s-${k === "fixed" ? "ok" : k === "broke" ? "fail" : "unk"}">${esc(T.trend[k])}:</span> ${names(l)}</li>`).join("")}</ul>` : "";

  const doneBody = S.done.length ? `<ul class="check">${S.done.map((t) => `<li>✅ ${esc(t)}</li>`).join("")}</ul>` : `<p class="muted">${esc(T.done.none)}</p>`;
  const doneLines = S.last ? [[T.done.short, T.done.shortText(S.ok, S.gates.length, S.level)], [T.done.gives, T.done.givesText]] : [];

  const debtLines = S.debt.length ? [[T.debt.short, T.debt.shortText(S.debt.length)], [T.debt.risk, T.debt.riskText]] : [];
  const debtBody = S.debt.length
    ? `<ul class="check">${S.debt.map((d) => `<li>⚠️ ${d.lead ? `<b>${esc(d.lead)}</b> — ` : ""}${rich(d.text)}${d.names ? ` ${names(d.names)}` : ""}</li>`).join("")}</ul>`
    : `<p><b>${esc(T.debt.none)}</b></p>`;

  const aheadLines = S.ahead.length ? [[T.ahead.short, T.ahead.shortText], [T.ahead.why, T.ahead.whyText]] : [];
  const aheadBody = S.ahead.length
    ? `<ol class="todo">${S.ahead.map((line) => {
      const cmd = (/`([^`]+)`/.exec(line) || [])[1] || "";
      return `<li><span>⬜ ${rich(line)}</span>${cmd ? `<button type="button" data-copy="${esc(cmd)}">${esc(T.copy)}</button>` : ""}</li>`;
    }).join("")}</ol>${S.rest ? `<p class="muted">${esc(T.ahead.more(S.rest))}</p>` : ""}<p class="muted">${esc(T.ahead.hint)}</p>`
    : `<p class="muted">${esc(T.ahead.none)}</p>`;

  return `<!doctype html>
<html lang="${esc(T.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(T.title)}${name ? ` · ${esc(name)}` : ""}</title>
<style>${CSS}</style></head><body><div class="wrap">
<header><span class="eyebrow">${esc(T.eyebrow(name))}</span><h1>${esc(S.headline)}</h1><div class="meta">${S.meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div></header>
${block(T.step.title, stepLines, stepBody)}
${block(T.done.title, doneLines, doneBody)}
${block(T.debt.title, debtLines, debtBody)}
${block(T.ahead.title, aheadLines, aheadBody)}
<section class="panel">${grid(history, T)}</section>
<footer>${esc(T.footer(self))}</footer>
</div><script>${copyScript(T)}</script></body></html>
`;
}

// СВОДКА ЗАДАНИЯ GITHUB — Markdown: HTML там не показывается (docs.github.com, «Adding a job
// summary»). Имена — в `коде`, и из них вынуто то, чем чужой манифест мог бы сломать разметку.
const mdName = (s) => "`" + String(s ?? "").replace(/`/g, "'").replace(/[<>|]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "|": "&#124;" })[ch]) + "`";
const mdText = (s) => String(s ?? "").replace(/[<>|]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "|": "&#124;" })[ch]);

function renderSummary(state, history, { T, C, self = "aqk", name = "", intents = {} }) {
  const S = sections(state, history, { T, C, self, intents });
  const out = [`## ${T.title}${name ? ` · ${name}` : ""}`, "", `**${S.headline}**`, "", `### ${T.step.title}`, ""];
  out.push(`- **${T.step.made}** ${S.step.made}${S.step.change ? ` ${S.step.change}` : ""}`);
  for (const [k, l] of S.step.changes) out.push(`  - ${T.trend[k]}: ${l.map(mdName).join(", ")}`);
  if (S.step.bad) out.push(`- **${T.step.bad}** ${S.step.bad}`);
  out.push(`- **${T.step.next}** ${S.step.next}`, "", `### ${T.done.title}`, "");
  if (S.last) out.push(`**${T.done.short}** ${T.done.shortText(S.ok, S.gates.length, S.level)}`, "");
  out.push(...(S.done.length ? S.done.map((t) => `- ✅ ${mdText(t)}`) : [T.done.none]), "", `### ${T.debt.title}`, "");
  out.push(...(S.debt.length
    ? S.debt.map((d) => `- ⚠️ ${d.lead ? `${mdName(d.lead)} — ` : ""}${mdText(d.text)}${d.names ? ` ${d.names.map(mdName).join(", ")}` : ""}`)
    : [`**${T.debt.none}**`]), "", `### ${T.ahead.title}`, "");
  out.push(...(S.ahead.length ? S.ahead.map((l) => `- ⬜ ${l}`) : [T.ahead.none]));
  if (S.rest) out.push("", T.ahead.more(S.rest));
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
ul.plain,ul.check{list-style:none;padding:0;margin:0;display:grid;gap:6px}ul.check li{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 12px}.lead{display:grid;gap:4px;border-left:3px solid var(--accent);padding-left:12px}h3{margin:0;font-size:17px}svg text.hot{fill:var(--ink);font-weight:700}.chart{overflow-x:auto}svg{max-width:none}svg text{fill:var(--muted);font:11px ui-monospace,Menlo,monospace}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:var(--muted)}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px;box-sizing:border-box}
.todo{padding:0;margin:0;display:grid;gap:10px;counter-reset:n}.todo li{list-style:none;display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px}.todo li::before{counter-increment:n;content:counter(n);font-weight:700;font-size:18px;color:var(--accent)}
button{font:600 12px system-ui,sans-serif;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;padding:6px 10px;cursor:pointer}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}footer{font-size:12.5px;color:var(--muted)}`;

export { renderReport, renderSummary };
