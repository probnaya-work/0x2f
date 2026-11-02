# Независимый review и квалификация — 2 ноября 2026

Focused follow-up: [FINALIZATION.md](FINALIZATION.md). The latest Linux retry is
BLOCKED on external free quota after Thinkbox network access returned; Mobile software preview is now removed and
new signed physical normal-path checks passed. Remaining Mobile fault gates
are explicit in its updated report. The original package qualification below
remains historical evidence for the same unchanged canonical bytes.

## Решение о merge

| PR | Verdict | Основание / точное условие |
| --- | --- | --- |
| [0x2F #5](https://github.com/probnaya-work/0x2f/pull/5) | **CONDITIONAL GO — merge пока удержать** | Исправления и окончательные package contracts прошли. Final Mac/Linux install и contracts прошли. Первый реальный Linux OpenCode run/check прошёл; второй run отказал с `Free usage limit reached`. Условие: успешный полный Linux AI continuation → checks → restore тем же hash. |
| [057 #1](https://github.com/probnaya-work/057/pull/1) | **GO в заявленную engineering base** | Исправлены persistence/time-window defects; проверены реальные process-generation links, SQLite reopen и отдельный новый Core: source failure/reconnect сохраняет историю. Reader остаётся opt-in. |
| [Display Mobile #1](https://github.com/probnaya-work/057-display-mobile/pull/1) | **CONDITIONAL GO — physical fault gates открыты** | Diagnostic preview удалён в 217403c; новая signed Dev17 прошла owner-observed normal scanning/rotation/reconnect/permission recovery. Остались interruption/runtime-error, expiry и selective revocation observations; см. follow-up. |
| [Site #2](https://github.com/probnaya-work/0x2f-site/pull/2) | **GO** | Registry 0.2.0 отделён от unreleased source; ограничения, ссылки и desktop/narrow navigation проверены. Deployment не выполнялся. |

Это четыре отдельных решения. GO на documentation/opt-in observer не является разрешением на
npm release, production cutover или promotion диагностического scanner.

## Что исправлено

[Findings, severity, воспроизведения и исправления](FINDINGS.md) содержат 11 основных категорий дефектов
и два связанных дефекта 057. Наиболее существенные:

- stale CANCEL мог отменить следующую попытку; теперь Web/TUI/API/encrypted relay передают и
  проверяют показанный execution nonce под lock; старые PID не дают права сигналить;
- restore через symbolic control path менял исходный task state; служебные symlink теперь
  отказываются до записи/repair, обычные data symlink сохраняются без обхода targets;
- legacy задачи обходили shared admission; native resume наследовал старую generation и receipts;
- Git smudge/EOL filters при restore меняли сохранённые unfinished bytes; теперь материализация
  идёт из raw blobs в no-checkout worktree, index начинается с сохранённого HEAD;
- non-UTF-8 patch терял байты, staged deletion исчезал из evidence, executable/staged ignored
  изменения учитывались неверно; raw patch/index preservation покрыты регрессиями;
- native-resume input мог выглядеть как прежний fresh input, включая отказ до запуска;
  tool receipts могли получить команду другой попытки; attempt/input/receipt binding исправлен;
- SSH pin проверялся на diagnostic connection, но не на execution connection; теперь actual
  invocation повторяет pin check до загрузки CLI;
- cleanup удалял отдельную staged-версию и force-tracked `.work`; теперь оба unsupported состояния
  отказываются до удаления; минимальные дофиксные repro дали два ожидаемых failures;
- 057 терял расширенные active claim windows при SQLite dedupe и преждевременно закрывал claim
  живого permission worker. Исправление не меняет source-neutral schema, Core или FIELD.

Риски были записаны [до принятия отчёта и результатов regression](RISKS.md). Новые минимальные
тесты отдельно запускались против исходного `e2355a3`: **8 ожидаемых failures / 3 pass**.
Отдельный synthetic legacy-backup repro действительно изменил исходный synthetic task JSON
через `.work/tasks` symlink. Пользовательские workspace/state в этих воспроизведениях не использовались.

## Точный окончательный пакет

Implementation checkpoint:

```
839e980dd20db3ea058ef4abc707ceeb322a0e93
```

Canonical `0x2f-0.2.0.tgz`, SHA-256:

```
4aa0dd547bf3245a78acca09133ecf070a48fc74e3cc5d5afff74e5270250626
```

Этот exact tarball установлен offline в новые Mac/Linux prefixes; hashes на обоих хостах совпали.
Предыдущие prefixes сохранены только как historical evidence. Production prefixes не
заменялись. Версия 0.2.0 оставлена как candidate identity convention; registry/tag не менялись.
Последующие изменения — тест/отчёты; product `src`, package manifest, README и LICENSE совпадают
с checkpoint. Повторный pack после doc-only commit дал тот же hash.

Фактически установленные dependencies на final Mac/Linux prefixes: ws **8.22.1**, @noble/ciphers **1.3.0**,
@noble/hashes **1.8.0**. Это проверенные установки; caret ranges не являются обещанием, что
любая будущая установка разрешит те же dependency versions.

Предыдущие package hashes `af182ec…` (авторский отчёт), `f9ddebb0…`, `387a9b23…`, `2594240e…`, `b94aecc7…`
сохранены только как исторические checkpoints. Их успешные live результаты не перенесены на
пакет выше. В частности, ранний успешный Linux OpenCode не закрывает final Linux AI gate.

## Финальная проверка exact installed package

| Проверка | Результат |
| --- | --- |
| Mac syntax + полный source gate | **821 pass / 0 fail**, Node 26.11.1 |
| Linux syntax + полный source gate | **811 pass / 10 explicit skips / 0 fail**, Node 26.13.0 |
| Installed critical contracts: cancel/recovery/isolation/context/checks/backup/ownership | **69/69 на Mac; 69/69 на Linux** |
| Installed encrypted relay/crypto/replay/scope/permissions/offline/teardown | **83/83 на Mac; 83/83 на Linux**, включая stale/missing CANCEL nonce |
| Actual HTTP cancellation boundary | stale/missing nonce 409; duplicate idempotent; old attempt cannot retarget next attempt; numeric PID signals отсутствуют |
| Pinned SSH boundary | actual final execution connection: correct pin status exit 0; wrong pin refused before CLI import |
| Installed TUI, реальный PTY | full result/checks, exact saved input, immutable changes; обе темы; 120×40 и 80×24 |
| Installed Web/mobile | desktop CSS width 1163 и narrow width 354; обе темы; check receipt/provider claim раздельно; draft сохраняется при dirty refusal; SAVE ONLY не добавляет run |
| CLI dispositions | explicit ACCEPT и DROP записаны раздельно; отдельный cancelled task остался FAILED; CLOSE/worker ownership проверены реальными subprocess fixtures |

### Mac: реальный harness loop

На окончательном пакете Task 1 прошла **Cursor Agent 2026.10.22-27dcf5f → Codex CLI 0.166.0**.
Note сохранён при работающем первом worker; второй fresh run получил его, исходные правила и
новую project revision. Оба independent configured checks завершились exit 0: 11 исходных и
ещё 7 continuation assertions. Авторские node:test assertions не подменяют эти проверки.

Input SHA run 1: `b1a41e0ec795d5beea01dad8a20a40c4c026a52b3522d795a29bfcccc7cc94d8`.
Input SHA run 2: `93be2fb32a33d0e413b62ea4351124011dd620e8d36368daf1f4262b95a5ef7d`.
Project revision: `f0fd2104bb001922299176aacc0ccb533528f912056efba9c097d05d229549dc`.
Saved patch SHA run 1: `49612b7783bc7ac667c6117444ada386fced514fdf49883f0b29ae1612c50f5f`.
Saved patch SHA run 2: `3d1119ff4b3495a70188aa1e6c68872791fc543582d2634a9930613ae37d8ba5`.

Исторический patch не изменился после следующего run. Apply перенёс результат в original
workspace; independent assertions и node:test снова реально прошли там. Original HEAD/index
не изменились. Последующая UI correction сохранилась без третьего run и без перезаписи delivered-input artifact.
ACCEPT был вызван отдельно после проверки, а не автоматически по configured-check success.

Отдельный **реальный Codex CANCEL** выполнен после появления `partial.txt` во время foreground
sleep. Run сохранил FAILED/cancelled, причину и immutable partial patch
`01f0c300085cdc9a1651dd09723f5027cf39b4fa68cbc8d613115b64981b1046`.
Configured checks не запускались; worker завершился. TERM-resistant descendants и pending ACP
permission дополнительно проверены subprocess fixtures именно установленного пакета.

Input receipts фиксируют точный сохранённый запрос на provider boundary. Они не являются
подтверждением того, что модель осмыслила текст; живое steering acknowledgement не заявляется.
Native resume хранит своё сообщение, не приписывает старой session новые notes/rules;
отказ до запуска показывает unknown input. Positive native argv fidelity проверена fixture,
а новая живая parity по каждому harness не заявляется.

### Lenovo: final runtime проверен; AI continuation gate открыт

OpenCode **2.2.5** реально запущен final installed package. Управляющий SSH launcher был
отключён; отдельный runtime MainPID сменился, worker сохранился. Первый реальный run достиг
READY, создал utility files и прошёл independent configured check (11 assertions, exit 0).
Первый input SHA: `b1a41e0ec795d5beea01dad8a20a40c4c026a52b3522d795a29bfcccc7cc94d8`;
patch SHA: `c76cac2adf751e1c4cc2d54742df3fc413482f7b8216f5f6c79e105f0b7e8234`.
Note был сохранён во время работы. **Второй run** отказал с **Free usage limit reached**;
он остался FAILED, continuation/check-success не выдуманы. Других установленных
авторизованных harnesses ранее не найдено; `opencode auth list` сообщил No authenticated
integrations. Платный provider, новый login или перенос credential не инициировались.

Полный end-to-end runtime путь отдельно выполнен тем же final package с **deterministic
real-process fixture** без LLM: два run одной Task, note, смена current rules, disconnected
launcher, runtime restart, реальные utility files, independent configured checks exit 0,
quiescent backup и restore в новый каталог. Два исторических run/check output сохранены;
restored execution authority и hosts отключены; ни одного автоматического исполнения;
source task JSON byte-identical. Independent assertions из восстановленного checkout
реально прошли. Production `0x2f-host.service` active, qualification units inactive.
Этот результат квалифицирует runtime/restore, но **не заменяет успешный внешний AI harness gate**.

Перед final доставкой были SSH timeout и два automatic approval refusals. После явного
ответа пользователя «Разрешаю передачу и Linux-проверку» хост вернулся в сеть, approved
payload был передан, и final gates выше выполнены. Первый controller отказал до AI launch
из-за сохранённого имени старого transient unit; отдельный controller с уникальным review
unit name завершил реальный сценарий до provider-quota failure. Эти setup failures сохранены.

Условие для merge #5: повторить `installed-live.mjs <installed-package> <new-private-root> linux`
на том же hash после восстановления доступной квоты/существующего разрешённого harness.
Использовать свободное qualification unit name. Два успешных AI run, checks, quiescent backup,
restore и independent restored assertions должны завершиться целиком. Старый успешный tarball
или deterministic fixture условие не закрывают. Переход на платный provider требует разрешения.

## Compatibility и rollback

- Published layout `.work/tasks/<slug>/{task.json,events.jsonl}` и atomic temp/rename сохранены.
  Старые задачи читаются без destructive migration; legacy run materializes только при продолжении.
- Старый worker без attempt nonce не получает нового права CANCEL. До upgrade quiesce legacy
  writers: они не соблюдают новые locks/ownership contracts.
- Legacy задачи без checkout считаются shared. Dirty/untracked исходного checkout не исчезают:
  auto отказывает, explicit isolated исключает их, shared сериализует исполнение.
- Snapshot не stage-ит original index. Binary/link/raw text сохранены; clean filters не меняют
  capture. Cleanup отказывает staged index state, reserved .work, ignored bytes, normalized CRLF и gitlinks вместо удаления данных.
  Raw restore сохраняет saved HEAD/task commits и unfinished bytes; index начинается с saved HEAD.
- Apply — проверенный cumulative saved result. Изменившаяся база/conflict отказывает; это не
  универсальный incremental rebase уже частично применённого результата.
- Backup — private directory + integrity receipt, не подпись. Требуется owning self-contained Git
  checkout и quiescence. External Git dependencies/special files/unsafe control symlinks не поддерживаются.
- Restore только в новый каталог: relay credentials/replay cache/hosts/current PID/process/nonce
  authority отключаются. Исторические receipts остаются историческими. Trust настраивается явно.
- Rollback одного executable недостаточен: 0.2.0 не знает ownership новых isolated Tasks и может
  rerun против original checkout. Сохранить matching candidate для inspect/export/apply; для полного
  rollback использовать согласованный whole-state backup + prefix. Новый state не удалять.
- Native provider session IDs — исторические ссылки, не перенос provider session DB. Native resume
  в новом restore root не квалифицирован; восстановленная история сама не запускает execution.
- 057 schema не меняется; старые claims не переписываются и не повышаются задним числом. Reader
  отключается удалением opt-in config environment и restart, retained history не удаляется.

## Связанные PR и ограничения

057: source checkpoint `afda81c1e1408a8dc878422bade3a005108455df`; typecheck/build passed,
**523 deterministic pass / 26 explicit skips**. Финальные SSH metadata и independent MACHINE PULSE
с final 0x2F package дали **182 OS processes / 3 generation links**; **400 envelopes**,
zero duplicate inserts, три связи и Landscape mass пережили SQLite reopen. Добавленный
identity worker — явный OS-process fixture без модели; один AI success не выдаётся за полный loop.
Отдельный candidate Core/private store прошёл observing → failed → observing: **107 remote events**
сохранились во время отказа, **109** после reconnect; completion/idle не выводились из потери source.
Подробности: [отдельный 057 review](https://github.com/probnaya-work/057/blob/integration/execution-observation-20261102/docs/INDEPENDENT-REVIEW-20261102.md).

Mobile: implementation `ff5e011d4aaeb87c79f91cca4f1e5608ad938943`; **30 Swift tests / 5 suites**,
unsigned generic physical-iOS build passed. Renderer pin `c5a883a084dd2fd34d86f88e7c619f4688d49fbc`
и tracked dependency не менялись. Software CIContext preview не доказал устранение camera input
restriction и не должен попасть в promoted Release. Точный remove/retain list и physical gates:
[scanner NO-GO](https://github.com/probnaya-work/057-display-mobile/blob/fix/scanner-recovery-20261102/Docs/INDEPENDENT-REVIEW-20261102.md).
Нового signed physical acceptance в этом review не было; прежнее owner observation сохранено
как историческое. Device Hub не запускался; production app не заменялась.

Site: implementation `61ed1f4d088db5ed79aea75296d74de828090064`; relative assets/links,
UNRELEASED boundary и section navigation проверены на local preview в desktop/narrow viewport.
[Отдельный site verdict](https://github.com/probnaya-work/0x2f-site/blob/integration/engineering-notes-20261102/INDEPENDENT-REVIEW-20261102.md).

Не квалифицированы и не расширялись: escaped-group OS containment, acknowledged live steering,
полная живая permission/resume/cancel parity всех harnesses, independent phone registrations,
closed-client push, новый Internet TLS deployment, cold reboot/production rollback,
длительные RSS/storage/pixel/battery/thermal gates. Эти границы не маскируют точные два merge blockers
выше: final Linux AI continuation gate для #5 и scanner production-preview/physical gates для Mobile #1.

## Evidence и состояние доставки

Полные input/output/task state, package tarballs, before/after proofs, PTY frames, browser captures,
SSH observations и SQLite files сохранены в отдельном owner-private evidence directory вне Git.
Публикуются source/tests/docs, не credentials, QR grants или raw telemetry. Test-only hosted-relay
re-export использовал installed `src/relay/server.mjs`; private infrastructure implementation не
подкладывалась из source checkout. Первые ошибки test-controller setup сохранены отдельно от
окончательных зелёных gates и не выдаются за product defects.

Final branch SHAs, exact base SHAs и artifact hashes дополнительно записаны в private
`FINAL-STATE.json` после report commits. Product bytes проверяются против checkpoint выше.
Исправления доставляются normal push без force; PR не мержатся, npm release/tag и production
installations/site не меняются. Удаляются только qualification runtimes; вся evidence сохраняется.
