# Live-квалификация Codex → Cursor → Codex — 2026-11-01

**PASS для передачи одной задачи между реальными harnesses и повторного открытия.**
Задача **#001**, четыре последовательных run, итог **DONE**. Первые три run образуют
запрошенную цепочку Codex → Cursor → Codex. Четвёртый — дополнительное исправление
Codex по подтверждённому независимым контроллером дефекту. Это самостоятельное
использование агентом, не исследование человеческого внимания.

Работа: сделать `docs/implementation/faithful-return-2026-11-01/verify-installed.mjs`
независимым от кеша прошлой квалификации и добавить явный CLI выбора кеша. Все
изменения инженерной задачи сделали harnesses **через установленный 0x2F**.
Контроллер создавал checkout, сохранял notes, собирал evidence, проверял код и
применил в исходный checkout точные полученные файлы без ручной правки реализации.
Версия **0.1.4** сохранена. Публикации, релиза и push не было.

## Пакет, окружение и доступ

- Исполняемый установленный пакет: **0x2f@0.1.4**, вне изменяемого checkout:
  `/Users/bogart/Dev/PROBNAYA/cursor-compatibility-recheck-20261101/installed/bin/2f`.
- [Tarball](evidence/0x2f-0.1.4.tgz), SHA-256
  `f903f7f966efb336f916c386ea457d3ee079e1813e606cfd06b733f8b4796747`.
  Все **74 src-файла** побайтно сверены до работы и повторно хешированы после неё.
  Исполняемый пакет и глобальная установка 2f не менялись.
- Временный отдельный checkout с пробелами в пути:
  `/var/folders/f8/tlxp54cx22ngqflyh25cvvkc0000gn/T/0x2f-cursor-live-cdyYyZ/checkout with spaces`.
  Detached HEAD `29962a4ba808901db9f6a9ad97f4e63680ff2c26`; установка содержит тот же
  production-код, что `803ba49`, последующие изменения были документационными.
- **Codex CLI 0.166.0**, существующий ChatGPT login. Native records подтверждают
  **gpt-6-astra**, approval `never`, sandbox `workspace-write`, shell network disabled.
  Модель и user config не переопределялись. Это отличается от более ранней
  квалификации OpenCode, где была другая настроенная модель.
- **Cursor Agent 2026.10.22-27dcf5f**, настоящий executable через абсолютный путь
  `/Users/bogart/.local/bin/agent`, transport **ACP**, policy по умолчанию interactive.
  После выполненного пользователем login фактические `status` и `session/new`
  прошли. ACP сообщает режим agent / модель **Auto (`default[]`)**. Конкретная
  выбранная сервером модель независимо не наблюдалась; другой harness не подставлялся.
- macOS arm64; контроллер/полная независимая проверка Node **26.11.1**, shell
  инженерных harnesses сообщает Node **24.14.0**. Точная npm CLI найдена динамически.
- Новых логинов, API keys, извлечения credential-файлов или keychain в этой фазе
  не было. Использованы существующие аккаунты и обычные настройки моделей.
  Денежный итог биллинга Cursor независимо не наблюдался и не объявляется нулевым.

[Установка и точные команды](evidence/installation.json),
[native Codex metadata](evidence/codex-native-evidence.json),
[успешный ACP preflight без inference](evidence/post-bootstrap-acp-preflight.json).
Предшествующие missing-executable/bootstrap/auth-blocked наблюдения сохранены в
[раннем отчёте](../cursor-recheck/REPORT.md); они не подменяют текущий результат.

## Фактическая последовательность

| Run | Harness / native session | UTC | Наблюдаемый результат |
| --- | --- | --- | --- |
| 1 | Codex / `01a1997a-b3ca-7ba0-95fa-785fb246ea89` | 23:38:37–23:41:20 | Убрал implicit receipt fallback, потребовал явный populated cache; READY |
| 2 | Cursor / `46de7e83-f0e3-409d-96a1-ed4ce5ff7736` | 23:41:26–23:43:57 | Прочёл предыдущую реализацию и результат, добавил cache/help CLI; READY |
| 3 | Codex / `01a1997f-bce8-7613-b6c3-d42097a67d1b` | 23:44:07–23:46:45 | Независимо нашёл и исправил два дефекта CLI-валидации; READY |
| 4 | Codex / `01a19982-af74-7890-834a-3a032b04a9b0` | 23:47:20–23:49:56 | Исправил найденный контроллером stdin-import дефект; READY |

В **23:38:52 UTC**, пока run 1 был WORKING, отдельная установленная команда
`2f note 1 ...` сохранила [CURSOR_CACHE_CONTRACT_01](evidence/user-constraint.txt).
CLI буквально подтвердил: «it will be included in the next run's context».
Task ID/slug, статус WORKING и число runs = 1 сохранились. Точный input run 1
**не содержит** note; input Cursor run 2 содержит note **и полный результат run 1**.
Попытка запустить Cursor параллельно отклонена: current run is still executing.

Перед run 3 реальный foreground `2f serve --port 0` был запущен, закрыт SIGTERM и
создан новым процессом. Состояние READY, оба run и файлы сохранились; новые
`2f open 1 --run 1/2` прочитали результаты. Input run 3 содержит оба предыдущих
результата и исходное ограничение. После финального ACCEPT через `2f close 1`
новые CLI/TUI-процессы и повторно запущенный runtime восстановили **DONE**, четыре
run, все results/inputs и три сохранённых notes. Старые snapshots не переписывались.

Установленный TUI открыт на настоящем PTY, без fixture-provider: проверены reader,
исходный запрос, provider-reported Verification, сохранённый input, выбор старого
Cursor-run и чтение после DONE, включая 80×24. Все собственные клиенты закрыты.
Существующий отдельный Web-preview не менялся.

[CLI-команды](evidence/commands.jsonl), [checkpoints](evidence/checkpoints.jsonl),
[реальные перезапуски](evidence/runtime-restarts.jsonl),
[TUI Cursor reader](evidence/tui-cursor-history-reader.txt),
[сохранённый input](evidence/tui-cursor-history-input.txt),
[TUI после DONE](evidence/tui-done-reader.txt), [финальный аудит](evidence/final-audit.json).

## Код и независимые проверки

Итог поддерживает `--cache PATH`, `--cache=PATH`, прежний positional path и `--help`.
Не обращается к receipt прошлой квалификации и не выводит cache из HOME/npmrc.
Ошибочные комбинации аргументов отвергаются до создания verification/evidence/temp
деревьев. Публичный cache проверяется явно; из него копируется только `_cacache`.
Исходные проверки installed package, offline-установка, allowlisted env без
унаследованных credentials, cleanup и версия 0.1.4 сохранены.

Независимый Codex run 3 исправил ошибки результата Cursor:

- `--help --unknown` ошибочно возвращал exit 0;
- `--cache -h` начинал verification и создавал receipt вместо раннего отказа.

Контроллер отдельно воспроизвёл оба случая на сохранённом коде Cursor и проверил
исправленный код: exit 1, пустой stdout и отсутствие созданного evidence.
[Before/after evidence](evidence/independent-before-after-defects.json).

Контроллер также сам обнаружил падение импорта через `node --input-type=module -`:
`realpath('-')` давал ENOENT. Note **CURSOR_IMPORT_DEFECT_01** была сохранена во
время run 3 и не появилась задним числом в его input. Поэтому исправление было
поручено следующему run 4, а не доставлено обходным путём текущему worker.
[Исходная ошибка](evidence/independent-stdin-import-defect.json),
[note](evidence/import-defect-note.txt). Финальные stdin/eval/file/symlink импорты
и direct CLI проверены контроллером; **30 дополнительных проб прошли** без
побочных verification-действий. [Результат](evidence/independent-cli-verification.json).

Сохранённые результаты harnesses не приняты за доказательство сами по себе:
контроллер заново запустил сохранённые suites после run 1 (**12 pass**), Cursor
(**18 pass**) и review (**21 pass**), затем фактически исполнил полный финальный
verifier через `--cache` из checkout с пробелами:

- `npm run check` — passed;
- isolated regression — **771 pass, 0 fail, 10 skip** из 781 tests. Пропущены
  native Codex/Gemini → local mock API проверки: изолированный PATH намеренно
  не содержит этих binaries. Это ограничение явно сохранено в final-audit;
- offline pack/install и установленный `2f version` — passed, **0.1.4**;
- все **74 src-файла установленного пакета** совпали с checkout;
- реальный installed-TUI PTY regression — **1 pass, 0 skip**.

[Полный independent receipt](evidence/independent-installed/installed-verification.json),
[лог](evidence/full-verifier.log). Отдельный полный regression с обычной доступностью
CLI дал **781 passed, 0 failed, 0 skipped** —
[final-regression.txt](evidence/final-regression.txt); это regression
с локальными fixtures/mock API, не дополнительные Cursor live-сценарии.

Готовился новый чистый публичный npm cache: старому не хватало закреплённого
`ws@8.21.3` (ENOTCACHED). Предварительное скачивание только существующих публичных
зависимостей выполнялось отдельно от verifier с пустыми npm configs/HOME,
без credentials и scripts. Сам verifier отработал **offline**.
[Provision](evidence/public-cache-provision.json), [offline probe](evidence/cache-pack-probe.json).

Linux в этой фазе **не выполнен**: Docker CLI есть, daemon socket отсутствует.
Linux-layout unit fixtures не объявляются реальным Linux-прогоном. macOS-прогон
и его пределы отделены от старых Linux-observations.

## Что помогло и пределы интерфейса

- Note-подтверждение ясно обещало следующий run; immutable input позволил это
  проверить. Явный provider в `rerun`, последовательная admission-проверка,
  per-run results и reader помогли проверить реальную передачу контекста.
- Для фактической модели Codex пришлось читать только native records конкретных
  session IDs: интерфейс показывает Model — при наследуемой настройке. Для Cursor
  доступна настройка Auto, но нет независимого подтверждения выбранного backend.
- Нормализованный trace Cursor содержит общие `Read File` / `Edit File` / `Terminal`
  без конкретного пути/команды; progress приходит короткими фрагментами. Его report
  включает narration перед Markdown-результатом. Поэтому командные подробности
  и качество кода проверялись по файлам и независимым исполнениям. Причина потери
  детализации между provider и adapter в этой квалификации отдельно не установлена.
- Контроллер один раз ожидал отсутствующий README при snapshot и получил ENOENT;
  исправлена только evidence-обвязка, note сохранена в уже работающей задаче.
  Ни второго Task, ни ручной правки task.json/code не было.
  [Разбор исключения](evidence/controller-exceptions.json).
- Первые диагностические process samples искали PGID в run records, где этого
  поля нет, и не доказывают process-level отсутствие overlap. Admission и порядок
  timestamps проверены отдельно. Финальный аудит взял реальные PGID из четырёх
  стартовых snapshots и подтвердил отсутствие процессов всех четырёх групп;
  helper исправлен для будущих запусков.

**Permissions: NOT RUN** — фактических запросов/решений 0. **Native resume: NOT RUN** —
`loadSession` рекламируется, но `session/load` не вызывался; четыре native session
ID различны, attempts = 1. Прошедшая передача task context не выдаётся за native
resume. Финансовый биллинг, физический mobile и Linux-runtime здесь не проверялись.
