// tool/lib/templates.mjs — тексты, которые программа кладёт в чужой проект.
//
// ЗАЧЕМ ОТДЕЛЬНО. Это не код, а содержимое: правят его чаще и по другим причинам, чем логику.
// Сами тексты живут в tool/i18n/templates-{ru,en}.mjs — здесь только выбор языка. Человек,
// пришедший с англоязычной страницы пакета, получал английский интерфейс и русский AGENTS.md
// у себя в репозитории: файл, который он и его агент читают первым.

import { L } from "../i18n/index.mjs";

const {
  AGENTS_MD, CLAUDE_MD,
  GATE_YML_TEMPLATE, CHECK_SH_TEMPLATE, README_TEMPLATE,
} = L.templates;

// Схема манифеста — ОДНА на все языки, переводятся только комментарии. Пока схема лежала в
// двух языковых файлах, гейт дублей поймал её сам: добавь кто-то ключ в один шаблон и забудь
// про другой — англоязычный пользователь получил бы другой манифест. Ключи машиночитаемы,
// расходиться им нельзя; комментарии человекочитаемы, им положено.
const d = L.manifestDoc;
const MANIFEST_YML = [
  ...d.head,
  "",
  "aqk: 1",
  "",
  d.entry,
  "entry:",
  "  - AGENTS.md",
  "",
  d.rules,
  "rules: .aqk/rules",
  "gates:",
  ...d.gates,
  "",
  ...d.samples,
  'samples: ""',
  'ratchets: ""',
  "",
  d.lessons,
  'lessons: ""',
  "",
].join("\n");

export { AGENTS_MD, CLAUDE_MD, MANIFEST_YML, GATE_YML_TEMPLATE, CHECK_SH_TEMPLATE, README_TEMPLATE };
