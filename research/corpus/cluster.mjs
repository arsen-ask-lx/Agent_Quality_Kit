// Что повторяется в чужих починках — по ЧИСЛУ РЕПОЗИТОРИЕВ, а не по числу коммитов.
//
// ЗАЧЕМ ИМЕННО ТАК. Один разговорчивый проект с сотней коммитов «fix(ci): …» перевесил бы всю
// выборку, и мы завели бы запись под его личную беду. Класс — это то, что случилось у МНОГИХ.
//
// Заголовки чистятся до сравнения: область в скобках (`fix(ci):`), номер задачи (`SMI-6580`),
// ссылка на pull request (`(#2823)`), знаки препинания. Иначе совпадений не будет вовсе:
// одинаковая беда у двух проектов описана разными словами вокруг одних и тех же двух-трёх.
import { readFileSync } from "node:fs";

const rows = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean)
  .map((l) => l.split("\t")).filter((c) => c.length >= 4)
  .map(([repo, sha, ext, msg]) => ({ repo, sha, ext, msg }));

// Слова, которые есть в каждой второй починке и ничего не различают.
const STOP = new Set(("fix fixes fixed bug bugs issue issues revert reverts hotfix chore feat the a an of for to in on and or with when not is are be use using update updates " +
  "add adds added remove removes removed correct correctly properly proper make makes made should now also from into after before more less new old " +
  "error errors failure failures fail fails failing broken break breaks test tests case cases").split(" "));

const norm = (s) => s
  .replace(/^\w+\([^)]*\):/, "")          // область: fix(ci):
  .replace(/^\w+:/, "")                    // просто fix:
  .replace(/\(#\d+\)/g, "")               // ссылка на PR
  .replace(/\b[A-Z]{2,}-\d+\b/g, "")      // номер задачи
  .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const byRepo = new Map();   // ключ → множество репозиториев
const sample = new Map();   // ключ → пример строки

const bump = (key, r) => {
  if (!byRepo.has(key)) byRepo.set(key, new Set());
  byRepo.get(key).add(r.repo);
  if (!sample.has(key)) sample.set(key, `${r.repo}: ${r.msg.slice(0, 80)}`);
};

for (const r of rows) {
  const words = norm(r.msg).split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  for (const w of words) bump(w, r);
  // Пара соседних слов различает класс куда лучше одного: «hook» встречается везде,
  // «hook timeout» — уже класс.
  for (let i = 0; i + 1 < words.length; i++) bump(`${words[i]} ${words[i + 1]}`, r);
}

const out = [...byRepo.entries()]
  .map(([key, repos]) => ({ key, n: repos.size }))
  .filter((x) => x.n >= Number(process.argv[3] || 3))
  .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));

console.log(`починок прочитано: ${rows.length} · репозиториев: ${new Set(rows.map((r) => r.repo)).size}`);
console.log(`классов, встретившихся в ${process.argv[3] || 3}+ репозиториях: ${out.length}\n`);
// ДВА РАЗДЕЛА, И ВТОРОЙ ВАЖНЕЕ. Одиночное слово встречается у всех и не различает ничего:
// «build», «file», «config» стоят в каждой второй починке. Пара соседних слов уже называет
// класс. Первый раздел оставлен, чтобы было видно, насколько он бесполезен, — это защита от
// соблазна завести запись по частому слову.
const show = (title, list) => {
  console.log(`\n${title}`);
  if (!list.length) { console.log("  — ничего выше порога"); return; }
  for (const { key, n } of list.slice(0, 40)) {
    console.log(`${String(n).padStart(3)}  ${key.padEnd(30)} ${sample.get(key)}`);
  }
};
show("ОДИНОЧНЫЕ СЛОВА — почти всегда шум:", out.filter((x) => !x.key.includes(" ")));
show("ПАРЫ СЛОВ — здесь живут классы:", out.filter((x) => x.key.includes(" ")));
