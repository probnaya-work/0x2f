# Адресная live-квалификация Codex → OpenCode → Codex

**Результат: сценарий прошёл.** Одна задача **#001**, три последовательных
READY-run, финальный **DONE**, сохранённые история и пользовательские ограничения
после настоящего перезапуска runtime. Проверка выполнена 2026-11-01,
18:23–18:33 UTC, на macOS arm64. Это дополнение к прежней квалификации;
исторические результаты не переписаны. Новый общий аудит и публикация не проводились.

## Пакет, версии и доступ

Использован локально собранный и установленный **исправленный** пакет `0x2f@0.1.4`
из checkout `02ff8035e7733c24cbd90f939ca1c586a0890e8a` (последнее изменение
production-кода — `2941c028b00310f941ced0ed7d7ba5aa48f6d016`). Это версия manifest,
а не утверждение о новом опубликованном релизе. Все **70 файлов src/** установленной
копии побайтно совпали с checkout.

- [Архив установленного пакета](evidence/0x2f-0.1.4.tgz), SHA-256
  `2b19cbff7f1e9c65ca3d57fc084c24fb16d9dbded86fd71b6874f6ca9333831f`.
- [Команды pack/install/init и метаданные](evidence/installation.json).
- Временный git-репозиторий:
  `/private/var/folders/f8/tlxp54cx22ngqflyh25cvvkc0000gn/T/0x2f-codex-opencode-kNRBTW/workspace`.
  Сохраняется для повторного открытия; финальные файлы также скопированы в evidence.
- Установленный CLI:
  `/private/var/folders/f8/tlxp54cx22ngqflyh25cvvkc0000gn/T/0x2f-codex-opencode-kNRBTW/installed/node_modules/.bin/2f`.

| Компонент | Фактически использован |
| --- | --- |
| Codex | CLI **0.166.0**, модель **gpt-6.1-sol**, effort high |
| Вход Codex | Существующий **ChatGPT login**, без API key |
| Конфигурация Codex | Обычный HOME и user config, без `--ignore-user-config`; sandbox **workspace-write**, approval policy **never** |
| OpenCode | **2.2.5**, встроенный ACP, текущий default **opencode/big-pickle**, режим build |
| Авторизация OpenCode | `auth list`: **No authenticated integrations**; бесплатная модель доступна без подключения нового аккаунта |
| Node / npm контроллера | **26.11.1 / 11.20.0** |
| Node внутри shell Codex | **24.14.0**, выбран существующим login-shell окружением |
| Node внутри OpenCode и независимых проверок | **26.11.1** |
| Claude Code | **Не проверен: по подтверждению пользователя аккаунта на этом компьютере нет** |

Прежний пробел live-проверки Codex закрыт обычным пользовательским путём.
Отсутствие API key не мешало ChatGPT login: оба реальных Codex-run завершились.
Режим подтверждён `codex login status` до и после, а модель/sandbox — native
session records, а не только настройками. Это согласуется с
[официальным разделением ChatGPT sign-in и API key](https://learn.chatgpt.com/docs/auth).

OpenCode проверен через `debug paths`, `debug config`, `auth list`, `models`,
затем настоящие ACP `initialize` и `session/new` **без inference**. Они вернули
Big Pickle; именно этот provider/model подтверждён в сообщениях исполнявшейся
сессии. В [официальной таблице](https://opencode.ai/v2/docs/console/models/)
Big Pickle указан как Free. Существующие настройки не переключались.
Новых отдельно оплачиваемых API-вызовов не выполнялось: Codex использовал
ChatGPT login, OpenCode записал стоимость **0.0**. Прежний платный бюджет не
расширялся. Учётные данные не копировались в workspace/evidence; команды
login/logout/import/export/switch не выполнялись.

См. [inventory](evidence/inventory.json), [ACP preflight](evidence/opencode-acp-preflight.json),
[native OpenCode](evidence/opencode-native-session.json),
[native Codex 1](evidence/codex-run-1-native.json) и
[native Codex 3](evidence/codex-run-3-native.json).

## Реальная задача и последовательность

Задача — исполняемый `duration.mjs` с экспортом `formatDuration(seconds)` и CLI,
форматирующий безопасное целое число секунд как `H:MM:SS`, с содержательными
`node:test` проверками API, запуска CLI, ошибок, границ и импорта.

| Run | Native session ID | UTC | Факт |
| --- | --- | --- | --- |
| 1 · Codex | `01a1985a-9b5b-7b73-a1ae-d34486b33372` | 18:23:56.996–18:25:06.237 | Создал исполняемый код и 56 тестов; READY |
| 2 · OpenCode | `ses_e67a2d145ffeeLrrep2nYGlFZh` | 18:26:45.420–18:28:00.971 | Прочитал существующие файлы, воспроизвёл и исправил дефект alias, добавил `--sum`; 82 теста; READY |
| 3 · Codex | `01a1985e-afd2-7640-b792-fe014426397e` | 18:28:24.322–18:29:13.913 | После перезапуска 0x2F прочитал оба результата и текущие файлы, проверил и завершил без изменений; READY |

Между run 1 и 2 выполнена **отдельная** установленная CLI-команда
`2f note 1 "USER CONSTRAINT SUM_CONTRACT_01: …"`: добавить `--sum`, сохранять
старый API и CLI, отвергать неправильные операнды и переполнение **до stdout**.
Сохранён [полный текст ограничения](evidence/user-constraint.txt).
Сама note сохранила READY и один run — исполнения не запустила.
Ограничение и полные прежние результаты найдены в точных
[prompt run 2](evidence/11-done-after-runtime-restart/task-state/runs/2/prompt.md) и
[prompt run 3](evidence/11-done-after-runtime-restart/task-state/runs/3/prompt.md).

Перед run 3 foreground `2f serve --port 0` действительно остановлен SIGTERM
и запущен новым процессом. Состояние задачи до/после совпало. После проверки
выполнены `2f close 1`, новые процессы `2f status`, `2f open 1`,
`2f open 1 --run 1/2/3`. Затем снова поднят runtime: **DONE и вся история
остались прежними**. Все собственные foreground-процессы остановлены с exit 0.
См. [перезапуски](evidence/runtime-restarts.jsonl) и
[точные CLI-команды с результатами](evidence/commands.jsonl).

**Это continuity через новые native-сессии с контекстом 0x2F.** Все три ID
сессий различаются, attempts = 1. `codex exec resume` и ACP `session/load`
в этой live-цепочке не использовались. Native session resume здесь не проверен
и не засчитан вместо передачи задачи между harnesses.

## Файлы, дефект и проверка поведения

Первый Codex получил 56/56 в своём наборе. Независимый запуск по абсолютному
пути через `/var/folders/...` обнаружил реальный дефект **созданной утилиты**:
exit 0, пустые stdout/stderr даже для `0`. `import.meta.url` разрешался через
`/private/var`, а `argv[1]` сохранял alias; проверка точки входа не срабатывала.
Сохранены [исходные файлы](evidence/02-codex-ready/program/duration.mjs),
[56 проходивших тестов](evidence/initial-program-tests.tap) и
[9 независимых неудачных CLI-проб](evidence/initial-independent-verification.json).
Точный путь воспроизведения берётся из installation.json: `${workspace}/duration.mjs 0`.

OpenCode самостоятельно воспроизвёл alias/symlink-проблему и сравнил realpath
для определения точки входа. Для суммы добавил точное накопление BigInt и
проверку предела. Исходная `formatDuration` сохранена побайтно; из исходных
тестов не удалена ни одна проверка. Добавлены 26 тестов, включая регрессию
alias и сохранение бесшумного импорта. Diff:
[код](evidence/duration.mjs.diff), [тесты](evidence/duration.test.mjs.diff).
Это исправление внутри временной инженерной задачи; нового дефекта 0x2F в
заданном сценарии не обнаружено, production-код 0x2F не менялся.

Независимые проверки после OpenCode и после финального Codex дали:

- **82 passed, 0 failed, 0 skipped** в созданном наборе тестов.
- **2010** значений API, сравненных с отдельным BigInt-эталоном.
- **18** прямых CLI-запусков, включая обе старые и новые формы, границы,
  неправильные операнды, переполнение и ранее неработавший абсолютный alias.
- Финальный Codex отдельно выполнил **30 000** сравнений API и **50** CLI-проверок;
  успешный вывод сохранён в native tool results, а не только в его резюме.
- Финальный Codex не менял программу: хеши обоих файлов до/после совпадают.

См. [независимая финальная проверка](evidence/final-independent-verification.json),
[её тестовый вывод](evidence/final-program-tests.tap),
[финальный код](evidence/11-done-after-runtime-restart/program/duration.mjs),
[финальные тесты](evidence/11-done-after-runtime-restart/program/duration.test.mjs).

## Последовательность, permissions и границы подтверждения

Каждая из трёх попыток `rerun` во время работающего run получила отказ
`current run is still executing`. Они не добавили run и не создали второе
исполнение. Между этапами проверены завершение прежней POSIX-группы и порядок
terminal/start timestamps. В **194** процессных снимках не наблюдались две
группы исполнения одновременно. В финале все три группы пусты; старые
run prompt/result сохранили исходные хеши.
См. [процессы](evidence/processes.jsonl),
[финальная проверка завершения и отсутствия токенов в evidence](evidence/review-checks.json).

**Реальных запросов permission не возникло:** 0 `needs_user`, 0
`permission.resolved`. Codex работал в workspace-write/never; OpenCode выполнил
локальные read/edit/shell без permission-паузы. Поэтому ALLOW/REJECT, отказ
пользователя и live permission round-trip в этой цепочке **не проверены**.
Никакая mock-проверка не выдана за этот результат.

**Claude Code не запускался и не входит в подтверждённые live harnesses.**
Его проверка заблокирована отсутствием аккаунта на этом компьютере и отложена
на другой компьютер. Подтверждены только Codex и OpenCode в описанной цепочке;
вывод не обобщается на остальные версии, модели или окружения.

## Регрессия и воспроизводимость

Обязательные проверки репозитория: **npm run check — pass**;
**npm test — 715 total / 705 pass / 0 fail / 10 skip**. Эти 10 случаев требуют
бинарей Codex/Gemini для интеграции с локальным mock API; они намеренно
отсутствовали в отдельном credential-free PATH этой regression-проверки.
Реальные harnesses проверены выше, отдельными live-сессиями.
[Команды и окружение](evidence/repository-checks.json),
[полный вывод](evidence/repository-test.log).

Первый regression-запуск имел 5 ошибок `spawnSync npm ENOENT`: я исключил npm
из изолированного PATH вместе с harnesses. Это ошибка runner-окружения,
не продукта. Исходный [лог](evidence/repository-initial-test.log) и
[метаданные](evidence/repository-initial-checks.json) сохранены; после добавления
symlink npm полный набор повторён и прошёл. Условия live-сценария это не меняло.

Процедуры: [pack/install](prepare.mjs), [ACP preflight](probe-acp.mjs),
[пошаговый установленный CLI-сценарий](scenario.mjs),
[независимая проверка программы](verify-program.mjs),
[чтение только native-записей этой задачи](native-evidence.py),
[credential-free regression](run-checks.mjs).
Они не являются автоматическим разрешением будущих платных запусков:
перед новым live-run следует снова проверить фактическую конфигурацию и цену.

Проверить сохранённые результаты **без model-запросов**:

```sh
python3 docs/qualification/2026-11-01/harness-scenario-followup/verify-evidence.py
```

[Машинно проверенная квитанция](evidence/verified-receipt.json) проверяет ID,
статусы, контекст, неизменность старых артефактов, сессии, отказ перекрытия,
реальные тестовые результаты и хеш установленного пакета. Версии, команды,
файлы и исходные ошибки сохранены. Релиз не опубликован.
