# Factory Agent Readiness — через открытую копию его скилла

- Сам Factory: https://factory.ai/agent-readiness · платный, тариф Pro $20/мес включает
  «Agent-readiness dashboard» (https://factory.ai/pricing, сверено 2026-09-16), бесплатного
  периода на странице цен нет. Отчёт — `/readiness-report` в их CLI Droid
- Разобрана копия: https://github.com/superduck-ai/agent-readiness · изучен коммит `4baf9e4`
  (2026-06-11) · MIT · 34 звезды · «A vendor-free implementation of the Factory droid skill»
- Разбор 2026-09-16. **Сам Factory не запускали** — нужна подписка. Что копия совпадает с
  оригиналом дословно, не проверено: копия так утверждает, но сверить без доступа нечем

## Что это на самом деле

Не программа, а **задание для модели**: `SKILL.md` (368 строк) ведёт агента через пять фаз, 82
критерия в девяти файлах `criteria/*.md` раздаются параллельным субагентам, те ставят
`passed/failed/skipped` с обоснованием. Код (`bin/agent-readiness.mjs`) только считает уровень
и рисует панель. Вердикт каждого критерия — суждение модели, прочитавшей текст критерия.

## Различает ли близнецов — по тексту критериев

Прогона не было: 82 субагента на пару близнецов — дорого, а ответ читается из критериев прямо.
Ближе всех к нашему вопросу `unit_tests_runnable` (`criteria/testing.md`), дословно:

> Actually run the command you find to see if the tests really are runnable (**do not worry about
> whether they pass, just if they can be run**). Use flags like --listTests (jest) or
> --collect-only (pytest) to verify runnability without running the full suite

То есть проверка **намеренно** не спрашивает, что тесты сообщают: `--collect-only` у
`node --test || true` и у `node --test` одинаковый. Слов `|| true`, `continue-on-error`,
`--exit-zero`, `allow_failure` нет ни в одном из девяти файлов критериев (греп 2026-09-16).
Вывод — **не различает по построению**; подтвердить прогоном на самом Factory.

## Где они знают о беде — и чем держат

В подсказке для починки, которую панель даёт по кнопке `Fix` (`cli/src/dashboard.ts:84-87`):

> - **NO** empty placeholder files (e.g., empty test files, stub configs)
> - **NO** minimal implementations that technically pass but provide no real value
> - **NO** disabling checks or adding skip markers to pass validation
> - **NO** trivial changes that game the metric without improving quality

Беду «проверку выключили, чтобы пройти» они видят и держат **текстом в задании агенту**. Замера,
что починка её не выключила, нет. Ровно та граница, которую наш свод называет: обещание, не
ставшее командой.

## Что брать себе

1. **История оценки в репозитории** — `.agent-readiness/history/*.json` коммитится, `latest/` —
   нет, и вложенный `.gitignore` это разделяет. У нас `.aqk/last-run.md` перезаписывается, тренда
   не видно. Не новая возможность, а форма хранения: решение владельца, заморозка §9а
2. **Числитель/знаменатель у критерия по приложениям** (`3/4`) в монорепозитории — у нас вердикт
   на весь репозиторий. Кандидат только при живом монорепозитории, где это мешало

## Чего не брать

- вердикт модели по тексту критерия — невоспроизводим
- уровни по наличию: `feature_flag_infrastructure`, `deployment_frequency` — не про проверку
- запрет «не выключай проверки» текстом — у нас это `gate-not-weakened` и `protection-not-removed`

## Не проверено

- **сам Factory** — прогон `/readiness-report` на близнецах (`research/competitors/twins.sh`)
  ждёт подписки владельца; это главный недостающий замер всего разбора соседей
- совпадают ли критерии копии с оригиналом
