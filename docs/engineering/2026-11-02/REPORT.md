# Инженерный проход 0x2F / ThinkCentre / 057 — 2 ноября 2026

## Результат и граница выпуска

Подготовлена интеграция поверх опубликованной **0x2F 0.2.0**, а не новый npm-релиз.
Версия пакета и тег v0.2.0 сохранены. Новые команды требуют source candidate.
Основной Linux-сервис, его production prefix и существующая авторизация не заменялись.
Новых публичных сервисов или платных ресурсов не создано. Сайт подготовлен в review-ветке,
без production deployment. Частные task snapshots, native transcripts, QR grants, сертификаты
и account state остаются вне Git.

Полный реестр с последствиями, происхождением, зависимостями и критериями завершения:
[LIMITATIONS.md](LIMITATIONS.md). Baseline: [BASELINE.md](BASELINE.md).
Контракты: [FOUNDATIONS.md](FOUNDATIONS.md). Команды, полномочия и rollback:
[OPERATIONS.md](OPERATIONS.md).

## Карта изменений

| Направление | Реализованный пользовательский сценарий | Проверка / оставшаяся граница |
| --- | --- | --- |
| CANCEL | Отдельная отмена из CLI/API/TUI/Web/phone. Запрос привязан к nonce текущей попытки и исполняется её worker. Частичный результат, причина и immutable evidence сохраняются | Реальные процессы, pending ACP permission, TERM-resistant descendants и retry в регрессиях. Чужой/stale PID не даёт права kill. Намеренно ушедшие process groups требуют OS containment |
| CLOSE / ACCEPT / DROP | Закрытие, принятие READY и отказ сохраняют разные dispositions. CLOSE не отменяет harness | Общие core actions и тесты клиентов; клавиатурный X после CANCEL закрывает задачу, сохраняя cancelled run и partial output |
| Recovery | Стартовый и непересекающийся периодический sweep замечают смерть worker; результат внешнего действия остаётся неопределённым, повтор не запускается | Worker crash и generation/PID-reuse регрессии. Реальный Linux restart отдельного runtime сохранил живой worker. Cold reboot не квалифицирован |
| Изоляция | Чистый committed Git root → отдельный task worktree. Dirty source требует явного isolated/shared решения. Shared execution сериализуется | Две независимые задачи, dirty/untracked/binary/symlink fixtures; реальные Mac Cursor и Linux OpenCode задачи изолированы. Worktree не является security sandbox |
| Изменения run | Content snapshots, SHA256 receipts, immutable patch каждого run/attempt; review/apply с конфликтами, cleanup/archive/restore с unfinished bytes и task-created commits | Архив восстанавливает исходный HEAD, а не только содержимое. Git filters/CRLF/ignored data и gitlinks не должны молча теряться. Другие приложения не заблокированы от записи в общий checkout |
| Контекст | Бюджет символов, исходное намерение и обязательные notes/answers/corrections/decisions, current project rules/knowledge revision; ссылки на полные результаты и exact delivered input | Переполнение защищённого ввода отказывается целиком. Native resume продолжает provider session и не выдаётся за свежую доставку input. Acknowledged live steering не реализован |
| Harness evidence | Partial ACP updates объединяются по toolCallId. Сохраняются raw input, все locations, command output и реальные exit codes, когда они присутствуют | Cursor ALLOW/REJECT и session/load проверены живьём отдельно от 0x2F rerun. Unknown exit остаётся null. Requested model не доказывает actual model |
| REFINE | Claude text-only path дополнительно запрещает built-in tools и неявные MCP/config expansions; исходник сохраняется при ошибке | Живая Claude-авторизация отсутствует. Для других harness нет выдуманного safe/tool-free режима |
| Hosts | `hosts`, `host-identity`, `on <host>` запускают установленный CLI выбранного Linux host через strict SSH и pin machine-id hash | Реальные `on thinkcentre status/providers` успешны. Host-owned explicit PATH wrapper, без переноса client PATH/login. Phone управляет тем runtime, с которым связан; fleet UI/migration отсутствуют |
| Linux operations | Private backup/restore в новый каталог, integrity manifest, quiescence, copied Git worktree repair; remote credentials и current execution authority отключаются при restore | Реальные Linux 2 runs и independent utility tests сохранены, исходный task не изменился. Production unit active. Systemd env name исправлено на WORK_SUPERVISED: имя с ведущей цифрой systemd отвергал |
| Mobile Web | NEW TASK с доступным harness и checkout mode, сохранение draft при отказе, next-run harness, CORRECT/SAVE ONLY, CANCEL, bounded check metadata | Узкий browser fixture проход: create/refusal/draft → cancel → partial result → keyboard close. Обе темы; horizontal overflow отсутствует в измеренном viewport. Новый физический 0x2F phone-bootstrap этой интеграции не проверен |
| Уведомления / доступ | FAILED добавлен в foreground attention policy. Offline mutations не переигрываются после reconnect; freshness/replay/scope сохраняются | Это не closed-client push. Independent phone registrations, operated HTTPS endpoints и live push qualification остаются открыты |
| 057 | Независимый opt-in SSH metadata collector; Task → Run → Session → Process generation → Machine claims через существующий Core/store/Landscape | Настоящие Linux observations дали две process-generation связи; close/reopen отдельного SQLite store сохранил историю. Новый collector не развёрнут в существующей desktop app; renderer/protocol не копируются в 0x2F |
| Физический Display | Камера, новый QR нужного Core, FIELD, уход на Home Screen и возврат CONNECTED без нового QR | Владелец подтвердил эти шаги на настоящем iPhone. Длительный soak, battery/thermal и полная pixel qualification отдельно |
| Документация / сайт | Убрано устаревшее pending-publication notice; published 0.2.0 отделён от unreleased scope, описаны commands/authority/rollback | Review-страница локально проверена на desktop/narrow viewport. LAN HTTP не называется защитой от active client replacement. Production site не выкладывался |

## Что проверено реально

### Версии и пакет

Source implementation checkpoint: **3842993**. Финальный source-only tarball:

```
af182ec1906f5e2f5547dfd0dd3e53e5e27e5379ac8319c40fd03bcd8a93b17c
```

Пакет установлен в отдельные Mac/Linux prefixes. Финальный установленный Mac CLI читает
исторический run 2 и его immutable changes. Финальный Linux prefix установлен отдельно от
production. Реальные engineering tasks ниже запускались на промежуточных установленных
снимках этой же ветки; они не переименовываются задним числом в запуск финального tarball.
Отдельные финальные source gates проверяют последующие исправления.

| Проверка | Реальное окружение | Результат |
| --- | --- | --- |
| 0x2F syntax + full regression | Mac, Node 26.11.1 | **805 pass / 0 fail**, около 50 секунд |
| 0x2F final source regression | ThinkCentre Linux, Node 26.13.0 | **795 pass / 10 explicit skips / 0 fail**, около 41 секунды; production service active |
| Static encrypted client | Mac, `npm run build:client` | Успешная сборка, без deployment |
| 057 typecheck + deterministic gate | Mac, isolated/temp stores | **521 pass / 26 skips**, 48 test files passed |
| 057 actual-host suite | Mac, read-only real native state | **546 pass / 1 skip**; не portable gate |
| 057 production build | Mac | Успешно; runtime dependency boundary сохранена |
| Mobile deterministic Swift | Mac | **30 tests, 5 suites**, pass |
| Signed physical-device builds | iPhone 15 / iOS 27.0.1 target | Debug builds 15, 16, 17 assembled/installed; final Debug-name source also compiles. Release version/build не изменены |
| Site | Existing static source, local preview | Desktop/narrow navigation и UNRELEASED boundary видимы; deployment отсутствует |

Первый финальный Mac прогон обнаружил реальную гонку teardown в relay fixture: удаление
каталога шло до завершения reconnect/write producer. После исправления порядка stop/close/delete
тот же relay suite прошёл 17/17, затем весь gate 805/805. Ошибка не исключена из отчёта и
assertions не ослаблены. Первоначальный Linux continuation controller был отвергнут systemd
до запуска unit из-за `0X2F_SUPERVISED`; после portable env fix сценарий прошёл.

### Live harness matrix

`Discovery` означает найденный executable. Существующий login и реально завершённый run —
отдельные свидетельства. Ни одна строка не обещает parity по всем измерениям.

| Harness / версия | Авторизация и реальное выполнение в этом проходе | Receipts / permission / continuation |
| --- | --- | --- |
| Cursor Agent 2026.10.22-27dcf5f | Существующий account login; isolated duration utility READY | 9 tool invocations, 9 completion receipts, 2 numeric exit receipts; один реальный REJECT. Отдельный прямой adapter probe разрешил ровно whitelisted read-only `find`; session/load продолжил тот же id. Затем исходная 0x2F Task передана Codex |
| Codex CLI 0.166.0 | Существующий ChatGPT login; второй run той же duration Task READY | Поддержка ms, 13 independent assertions exit 0; context receipt 4837 characters, session/process generation/patch сохранены, 5 tool receipts. Это fresh cross-harness continuation |
| OpenCode 2.2.5, Linux | Реальный isolated normalizeTags utility READY и continuation READY | 10 independent assertions, затем ещё 6; оба checks exit 0. Первый run 7 tool receipts, numeric provider exits не наблюдались. Worker PID сохранился через отдельный runtime restart. Наличие public/free model path не устанавливает actual model |
| Claude Code 2.1.296 | Executable найден, `authMethod: none`; live run/REFINE заблокированы авторизацией | Native permission/resume/cancel paths покрыты fixtures; этот проход не объявляет их новой живой квалификацией |
| Gemini CLI 0.60.0 | Реальный isolated utility run финального installed candidate дошёл до session/tool/file activity; через 180 секунд явно отменён контроллером | Session и generation сохранены, 8 tool starts / 7 completions, 0 numeric exits. Cancelled/FAILED, partial files/patch сохранены; automatic configured checks не запускались. Это реальная отмена, не успешный READY run |
| DeepSeek Harness 0.1.1-rc.2 | Реальный isolated parseCount utility финального installed candidate READY; 14 independent assertions, check exit 0 | Process generation сохранена. Native session/tool/command receipts этим transport не наблюдались. Permission requests не поступали; модель не переопределялась |
| Generic ACP / command | Настоящие subprocess/protocol fixtures, без выдуманного внешнего account/model | Partial updates, failures, permissions, resume seams, cancellation/process lifecycle и output receipts. Это qualification transport-контракта, а не произвольного стороннего harness |

Отдельной живой матрицы cancel/resume/permissions для каждого установленного harness пока нет.
После явной отмены Gemini сохранённые файлы отдельно прошли те же 14 независимых assertions
с exit 0. Это ручная проверка partial artifact после CANCEL, а не automatic acceptance receipt
и не изменение статуса run с FAILED на READY. Два последних Mac live probe использовали
shell Node 24.14.0; полный final source gate отдельно выполнен на Node 26.11.1.
Provider capability maps сохраняются как датированные результаты их исходной квалификации;
они не обновлены по одной vendor documentation. Primary references использовались для
контрактов, а не для приписывания локальному binary непроверенных возможностей:
[ACP tool calls](https://agentclientprotocol.com/protocol/v1/tool-calls),
[Cursor ACP](https://cursor.com/docs/cli/acp),
[Claude CLI](https://code.claude.com/docs/en/cli-reference),
[Gemini policy](https://geminicli.com/docs/reference/policy-engine/).

### Linux continuity и восстановление

Отдельный transient user unit квалифицировался с `KillMode=process`, `Restart=always`,
private umask и explicit executable PATH. Его runtime MainPID изменился, работающий worker
сохранился, второй OpenCode run и configured check завершились. Qualification unit остановлен;
production unit остаётся active. Никакого production cutover или cold reboot не было.

Реальный private backup содержит 126 inventory entries. Restore создал новый Git workspace,
перенёс current checkout locator, сохранил оба run и их исторические receipts без изменений,
снял current execution authority, а исходный task остался byte-identical. Независимые тесты
из восстановленного checkout реально завершились с exit 0. Manifest — integrity receipt,
не подпись и не разрешение восстанавливать недоверенные архивы.

### 057: данные отдельно от пикселей

Independent remote metadata и MACHINE PULSE snapshot дали 185 OS processes, три remote
envelopes и две generation-bound связи. Реальные captured observations прошли через
неизменённые Core/SQLite/Landscape: 375 inserts, две сохранённые связи и одна mass после reopen.
Это replay настоящих observations в отдельный store, а не новый collector внутри live app.
Реальный SSH outage в существующей experimental app показан как SOURCE FAILING / UNOBSERVED,
не как idle. Путь нового collector, pins и ограничения:
[057 candidate documentation](https://github.com/probnaya-work/057/blob/integration/execution-observation-20261102/docs/EXECUTION-OBSERVATION-20261102.md).

## Камера и законченный физический сценарий

На самом iPhone камера сканера была чёрной, хотя AVFoundation сообщал running/previewing и
поступали buffers. Системная Camera показывала изображение. В Dev 17 пять замеров BGRA за
четыре секунды дали mean/min/max = 0 при alpha 255; видимая область preview 393×852 points.
Это доказало отсутствие картинки уже во входном потоке, а не успешное отображение по callback.

Device Hub был полностью завершён на Mac. Владелец закрыл/снова открыл scanner непосредственно
на iPhone и подтвердил появление изображения. Затем:

1. В точной experimental Mac app открыт **новый одноразовый Add Display QR**.
2. Владелец отсканировал его телефоном и подтвердил FIELD / соединение.
3. Владелец ушёл на Home Screen примерно на десять секунд, открыл ту же копию приложения и
   подтвердил FIELD и MENU → CONNECTED без нового QR.
4. На стороне Core появился свежий trust record. Идентификаторы, certificates и QR payload
   не публикуются. Debug console завершилась перед финальным ручным проходом, поэтому её
   старые readiness logs не выдаются за trace нового bootstrap.

Таким образом, **камера → свежий QR → нужный Core → FIELD → background/foreground reconnect**
проверены на физическом устройстве с подтверждением владельца. Device Hub остаётся закрытым.
Не надо откладывать весь сценарий из-за невозможности одновременно видеть экран удалённо.

Apple описывает отсутствие camera/microphone в [iPhone Mirroring](https://support.apple.com/en-us/120421).
Это другой продукт: перенос этого ограничения на Device Hub был гипотезой, а результат выше
подтверждён именно на данном устройстве. Software preview в scanner branch был диагностикой,
не причиной восстановления. Перед promotion надо вернуть обычный AVFoundation preview и
повторить rotation/interruption/background gates. Эта ветка не является App Store release.

## Миграция и rollback

- Для candidate — отдельный immutable executable prefix и source SHA; не перезаписывать release.
- Перед update/backup остановить workspace writers и завершить/cancel/recover executions.
- Private backup включает `.work`, Git и возможные секреты. Новый каталог обязателен; symlink
  targets не читаются, external Git common dirs/alternates и special files отказываются.
- Restore запускает **ноль** executions и отключает relay/hosts/current authority. Повторная
  настройка trust нужна явно; исторические paths/receipts остаются исходными.
- Rollback runtime: остановить candidate, вернуть старый unit/prefix, не удалять новый state.
  Старый 0.2.0 не знает isolated task ownership: через него нельзя rerun новую isolated Task.
  Для inspection/export/apply такой задачи сохранить соответствующий candidate.
- 057 reader отключается снятием `O57_WORK_REMOTE_CONFIG` и restart candidate Core; retained
  history не удаляется. Действующая app/store этой интеграцией не заменены.
- Mobile/scanner и site существуют в отдельных review branches. Renderer pin, release build
  и production site сохранены. Параллельная FIELD motion-работа в другом чате не редактировалась.

## Репозитории и checkpoints

| Репозиторий | Ветка / содержимое |
| --- | --- |
| 0x2F | `integration/engineering-expansion-20261102`, база `ecf547c` (published main); `bb28584` foundations, `e35f472` receipts/hosts/backup, `7d65163` archive HEAD/timeout cleanup, `d7e7fd5` mobile controls, `3842993` portable supervision/relay teardown |
| 057 | `integration/execution-observation-20261102`, база `b6b4b4a`; `8ba729f` independent remote collector/process generation, `f40cf49` completed physical pass |
| 057 Display Mobile | `fix/scanner-recovery-20261102`, база `17d2ff0`; `41ca84f` diagnostic/recovery candidate и physical evidence; `ff5e011` сохраняет исходные project UUID, итоговый project diff — 6 строк. Shared renderer pinned `c5a883a`, без tracked изменений dependency |
| 0x2F site | `integration/engineering-notes-20261102`, база `215325e`; `61ed1f4` separate unreleased scope и HTTP bootstrap limitation |

Все четыре ветки запушены штатно, без force. Созданы и прикреплены к чату draft PR:

- [0x2F #5 — execution ownership и reviewable evidence](https://github.com/probnaya-work/0x2f/pull/5).
- [057 #1 — remote execution / process generations](https://github.com/probnaya-work/057/pull/1),
  target — существующая engineering integration branch.
- [Display #1 — physical camera diagnosis](https://github.com/probnaya-work/057-display-mobile/pull/1),
  target — существующая mobile integration branch; diagnostic preview не готов к release promotion.
- [Site #2 — unreleased engineering scope](https://github.com/probnaya-work/0x2f-site/pull/2).

Публикуются только source/test/docs/deploy; внешний private evidence directory не включён.
Предыдущий отказ automatic approval review разрешён после проверки payload и исходной
авторизации пользователя: normal push прошёл. GitHub connector вернул 403 на создание PR;
они созданы штатным gh с существующей авторизацией. Merge, release и deployment не выполнялись.

## Оставшиеся release gates и следующий scope

Рекомендован следующий ограниченный release candidate: owned cancellation/recovery, Git isolation
и immutable patches, bounded context, recorded receipts/configured checks, explicit dispositions,
узкие task controls и documented Linux operations. Продвигать после отдельного review/qualification,
не менять уже выпущенный v0.2.0.

Открыто: escaped process containment; full version-pinned live permission/resume/cancel matrix;
Claude account access и live tool-free REFINE; acknowledged live steering; independent phone
registrations/revocation; safe file/history/credential migration; real operated external HTTPS/TLS
и closed-client push; cold reboot/update/rollback production host; deployed new 057 reader;
long-duration storage/RSS/pixels/battery/thermals и scanner production-preview promotion.
Это явные границы реализации/проверки, а не заявление, что все ограничения устранены.
