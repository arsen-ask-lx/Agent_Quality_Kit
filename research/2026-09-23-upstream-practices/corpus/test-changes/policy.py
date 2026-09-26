#!/usr/bin/env python3
"""Цена политики отбора правил: сколько ловим и сколько обвиняем зря.

ЗАЧЕМ ОТДЕЛЬНО ОТ measure.sh. `measure.sh` мерит гейт как он есть. Этот скрипт берёт СЫРОЙ
разбор checkwash по каждому случаю корпуса и прикладывает к нему разные наборы правил —
чтобы решение «добавить правило в гейт» принималось по числам обеих граф, а не по одному
пойманному случаю. Правило, закрывающее пропуск, почти всегда добавляет ложные обвинения;
вопрос не «закрывает ли», а «сколько стоит».

Запуск: python3 policy.py <каталог-корпуса>
"""
import json, pathlib, subprocess, sys, tempfile, shutil, os, time

# ВРЕМЯ ФАЙЛА СБРАСЫВАЕТСЯ НАМЕРЕННО, и это не мелочь оснастки. `shutil.copytree` копирует
# через `copy2`, то есть СОХРАНЯЕТ mtime источника. Файлы before/ и after/ в корпусе созданы
# в одну секунду, а у половины случаев ещё и совпадает РАЗМЕР (`== 4` против `== 5`). Git
# сравнивает содержимое не всегда: при совпадении размера и mtime с записью индекса он считает
# файл неизменённым и в диф его не кладёт. Замер 2026-09-26: `red-subject-normalized` дал
# «находок 0» и читался как пропуск инструмента, хотя `checkwash` этого дифа просто не видел —
# правка теста в него не попала. Тот же случай, снятый через `cp -R` (mtime не сохраняет),
# давал три находки. То есть оснастка врала в пользу измеряющего второй раз за день.
def _copy(src, dst):
    shutil.copy(src, dst)          # без copy2: mtime не переносится
    os.utime(dst, (time.time(), time.time()))

ALWAYS = {"ASSERT_REMOVED","ASSERT_WEAKENED","ASSERT_SUBSTITUTED","TEST_PATCHES_SUBJECT",
          "SUBJECT_NORMALIZED","CONFTEST_PATCHES_PROD"}
HIGH_ONLY = {"TEST_DISABLED"}

POLICIES = {
    "как сейчас": (ALWAYS, HIGH_ONLY),
    "+EXPECTED_VALUE_CHANGED всегда": (ALWAYS | {"EXPECTED_VALUE_CHANGED"}, HIGH_ONLY),
    "+EXPECTED_VALUE_CHANGED только high": (ALWAYS, HIGH_ONLY | {"EXPECTED_VALUE_CHANGED"}),
}

def repo_for(case_dir):
    t = tempfile.mkdtemp()
    shutil.copytree(case_dir / "before", t, dirs_exist_ok=True, copy_function=_copy)
    env = {**os.environ, "GIT_AUTHOR_NAME":"a","GIT_AUTHOR_EMAIL":"a@b",
           "GIT_COMMITTER_NAME":"a","GIT_COMMITTER_EMAIL":"a@b"}
    for cmd in (["git","init","-q","."],["git","add","-A"],["git","commit","-qm","before"]):
        subprocess.run(cmd, cwd=t, env=env, check=True)
    for e in os.listdir(t):
        if e != ".git": shutil.rmtree(os.path.join(t,e), ignore_errors=True) if os.path.isdir(os.path.join(t,e)) else os.remove(os.path.join(t,e))
    shutil.copytree(case_dir / "after", t, dirs_exist_ok=True, copy_function=_copy)
    for cmd in (["git","add","-A"],["git","commit","-qm","after"]):
        subprocess.run(cmd, cwd=t, env=env, check=True)
    return t

def blocks(findings, always, high_only):
    for f in findings:
        if f.get("allowlisted"): continue
        r, s = f.get("rule"), f.get("severity")
        if r in always: return r
        if r in high_only and s in ("high","critical"): return r
    return None

def collect(root, cases):
    """Сырой разбор checkwash по каждому случаю — один раз на корпус, а не на политику."""
    raw = {}
    for name in sorted(cases):
        raw[name] = findings_for(repo_for(root / name))
    return raw


def findings_for(repo):
    """Разбор одного репозитория. Выделено из обхода: продолжение вызова с длинным списком
    аргументов даёт отступ, который переносимая проверка вложенности читает как седьмой
    уровень, — и она права в том, что такую строку неудобно читать."""
    cmd = ["checkwash", "check", "HEAD~1..HEAD", "--repo", repo, "--format", "json", "--fail-on", "info"]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    shutil.rmtree(repo, ignore_errors=True)
    d = json.loads(out) if out.strip() else {}
    return d.get("findings", []) if isinstance(d, dict) else []


def score(cases, raw, always, high_only):
    """Одна политика на всём корпусе: четыре числа и два поимённых списка."""
    got = {"пойман": 0, "пропущен": 0, "молчит верно": 0, "обвинён зря": 0}
    missed, accused = [], []
    for name, meta in sorted(cases.items()):
        hit = blocks(raw[name], always, high_only)
        if meta["expect"] == "red":
            got["пойман" if hit else "пропущен"] += 1
            if not hit:
                missed.append(name)
        else:
            got["обвинён зря" if hit else "молчит верно"] += 1
            if hit:
                accused.append(f"{name} ({hit})")
    return got, missed, accused


def main():
    root = pathlib.Path(sys.argv[1])
    cases = json.loads((root / "cases.json").read_text(encoding="utf-8"))
    raw = collect(root, cases)
    print(f"{'ПОЛИТИКА':38} {'пойман':>7} {'ПРОПУЩЕН':>9} {'молчит верно':>13} {'ЛОЖНОЕ ОБВИНЕНИЕ':>17}")
    detail = {}
    for pol, (a, h) in POLICIES.items():
        got, missed, accused = score(cases, raw, a, h)
        print(f"{pol:38} {got['пойман']:>7} {got['пропущен']:>9} "
              f"{got['молчит верно']:>13} {got['обвинён зря']:>17}")
        detail[pol] = (missed, accused)
    print()
    for pol, (missed, accused) in detail.items():
        print(f"{pol}:")
        print("  пропущены:   ", ", ".join(missed) or "—")
        print("  обвинены зря:", ", ".join(accused) or "—")
    (root / "raw-findings.json").write_text(
        json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


main()
