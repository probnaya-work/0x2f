# Foreground Engineering Loop и local delivery

Реализация завершена в изолированной development branch. Проверенный code commit:
`23b96e158cc311f78ed4d95e966e67698d175a0d`. Production activation не выполнялась.

## Commits

- `5dc2e222a5c3da468c380edd7a4625cf5a068270` — безопасная постоянная копия evidence принятого offline candidate.
- `462c4f872fe39712f2bd1d57b1dcca3d1ca87925` — native LaunchAgent fixtures только по явному opt-in; restart через kickstart.
- `d8c7dbe608a91cdd56c2c89dac4d158448399f7f` — foreground model resolution через installed CLI default.
- `8f3a64b338d5f43f66c5c56ab1bed2f84280d6c6` — sanitized evidence успешного второго smoke.
- `7d775e4917b38a57b3b5f3b63ec3609aa4953067` — исправлены два подтверждённых P2 независимого review.
- `23b96e158cc311f78ed4d95e966e67698d175a0d` — exact local commit permission и durable receipt.

Отдельный финальный documentation commit сохраняет этот отчёт и итоговые summary.
Amend, push, PR, merge, deploy, release и publication не выполнялись.

## Второй foreground smoke — PASS

Installed Codex CLI 0.149.1 получил purpose-specific handoff, изменил только
fixture `src/id.mjs`, вернул управление той же Task; реальный Node check завершился
exit 0, sourceUnchanged=true. Task сохранила два runs: Codex implementation и
local verification, exact artifact provenance, routing и usage evidence.
Ручного переноса контекста не было. В smoke Git commit не создавался.

Ровно одна дополнительная live invocation, без второго harness и третьей попытки.
Existing ChatGPT credentials остались byte-identical; API keys и новые credentials
не использовались. Timeout был ограничен 10 минутами. Вызов работал только с
маленьким disposable repository; в наблюдённых командах не было внешних delivery
side effects. Это scoped foreground proof, не гарантия изоляции произвольного кода.

Причина первого mismatch: top-level `model = "gpt-6.1-sol"` в существующем user
config. Installed exec help подтвердил `--ignore-user-config`, сохраняющий existing
auth. Новый boundary делегирует имя installed CLI default без `-m`, registry или
угадывания product model alias; фиксированные sandbox/auth ограничения сохранены.
Точное имя выбранной default модели не выдумывается. См. [resolution](model-resolution.md).

[Machine-readable smoke](second-smoke.json): input handoff 1506 bytes, exact
input/artifact/check digests. Reported usage: 77880 input + 527 output = 78407 tokens;
cache details сохранены отдельно. Monetary/internal provider-call usage остаётся
unknown, reservation retained. Unknown не превращён в zero.

Пользовательский foreground путь: enabled disposable engineering workspace →
`2f new "brief" --foreground` → saved handoff → native implementation → real check
→ READY → `2f open <id>`. Полный investigate/review/fix playbook, cross-executor
routing и resume по-прежнему доказаны offline fixtures; дополнительных live runs
для них не делалось. Новая live попытка требует отдельного разрешения.

## Independent review

Fresh-context read-only review точного диапазона `e7039cc..8f3a64b` проверил
continuity, handoffs, triggers, ownership/fences, bounds, обычные/editorial Tasks,
permissions и разделение foreground/offline от unattended GO.

Подтверждены и исправлены два P2: no-change diagnosis после fixing patch сохранял
неверный outcome; ordinary rerun с `--foreground` мог молча запускать detached
executor. Regression tests прошли 10/10 и 5/5. P1 не сообщались. См. [review](review.md).
Local delivery реализован после этого review и проверен отдельными tests; его
независимая проверка этим диапазоном не заявляется.

## Local commit permission — PASS в disposable Git

Flow: verified patch → `2f commit <id> "message"` → exact patch/identity preview →
permission required → `2f allow <id> --digest <scope>` → local commit → receipt.
ACCEPT patch не выдаёт grant. `2f reject <id> --digest <scope>` сохраняет patch.
Local TUI/Web ALLOW/REJECT передают тот же digest через общие actions.

Preview связывает task/intent/artifact/check, repository/worktree/parent,
Git directory, exact diff/tree, scope, message, author, index и hashes hooks.
Permission имеет отдельную proposal identity; revoke, изменившиеся bytes/constraints/
hooks/diff инвалидируют её. Восстановление bytes не возрождает старый grant.
Duplicate execution возвращает тот же resulting commit, без второго effect.

Используется private index и owned index lock; compare-and-swap обновляет только
managed detached HEAD. Source checkout и чужой staged index сохраняются. Tree
строится из проверенного immutable artifact, без filters. Repository-local
pre-commit/prepare-commit-msg/commit-msg hooks исполняются явно с saved receipts;
после них проверяются bytes/tree/message/index. Другие active hooks/custom hooksPath
refuse. Native Git plumbing предотвращает неявное изменение approved tree hooks.
Grant/consumption intent сохраняется до effect. Потерянный outcome после object/ref
effect становится uncertain и автоматически не повторяется.

[Real Git demo](delivery-demo.json) воспроизводится командой
`node scripts/demo-engineering-delivery.mjs`: acceptance без grant; REJECT без
commit; новый grant; один resulting commit; duplicate с тем же receipt;
source checkout HEAD/dirty bytes unchanged, managed worktree clean. Все commits
создавались только в disposable repositories. Demo harness — deterministic fixture,
реальный Git; live-model calls=0. Temporary demo repositories очищены после capture.

Ограничения: self-contained disposable repositories под system temporary roots;
локальный author; три поддержанных hook types; без global Git config, signing,
credential helpers, remote relay delivery или общего delivery framework. Hooks —
trusted local code, не arbitrary-command sandbox. Native smoke и real Git delivery
проверены отдельно: smoke явно запрещал commit и не был повторён для объединённого
live scenario.

## Notification spam

Подтверждён источник: workflow fixture регистрировала native supervisor для каждого
теста, а repair выполнял bootout/bootstrap. Ordinary `npm test` теперь не создаёт
native fixtures: guard срабатывает до workspace/registration. 119 native tests
доступны отдельно через `node scripts/test-native-launchd.mjs`.

Уже зарегистрированные confirmed fixture jobs перезапускаются `kickstart -k`.
Bootstrap — только для новой registration. Проверяются temporary fixture path,
label, runtime argv и exact plist; неизвестные labels не затрагиваются. Cleanup
подтверждает fixture ownership. Production supervisor/scheduler lifecycle не менялся.

Одна explicit native проверка создала одну fixture registration, выполнила два
restart без перерегистрации и завершила cleanup. Ordinary regression проверил
refusal до registration; до/после ordinary suite fixture agent files/loaded agents
равны нулю, protected LaunchAgent hash прежний. Это notification-boundary proof,
не полный native supervision GO.

## Verification

Один unchanged final `npm test` на code commit `23b96e1`: **867 total, 748 passed,
0 failed, 119 intentionally skipped native tests**, exit 0, 64.4s. Повторов full
suite и timing diagnosis не потребовалось. Native integration не выдаётся за
пройденную обычным suite.

`npm run check`: exit 0. Независимо проверены exit codes 192 JavaScript syntax
checks и AST 7 Python файлов. Targeted adapter/foreground 25/25; connected local
delivery/interfaces 97/97; последующие delivery/workspace/projection 20/20;
restriction regression 1/1; финальный full suite включает все 17 delivery scenarios.
См. [commands/results](verification.json), включая exact native command.

## Preservation и cleanup

[Preservation](preservation.json): original/stable HEAD, tracked bytes/status,
protected package-файлы, LaunchAgent file/binding, schedule и scheduler installation
не изменены. Task #2: 7 runs/105 файлов, все historical SHA-256 совпадают.
Task #3: все 24 файла совпали с начальным snapshot этого turn. В production `.work`
изменились только scheduler.log/health от естественных runs; новых файлов нет.
Manual tick, repair, recovery, unload/reinstall production agent не выполнялись.
Captured scheduler health success=true, last native exit=0.

[Cleanup inventory](cleanup.json): 0 fixture agent files, 0 loaded fixture agents,
0 supervision IPC sockets, 0 delivery temporary repositories, 0 foreground lock
owners; known foreground driver завершён. Один подтверждённый пустой fixture dir
от первого debugging test удалён только rmdir с проверками owner/name/empty.
Private second-smoke workspace с exact raw evidence и development worktree
сохранены намеренно, без active worker. Чужие/historical artifacts не удалялись.
Credential values, private absolute paths, provider sessions и model conversations
в эти committed summaries не включены.

## Scoped verdicts и следующий slice

Foreground single implementation + deterministic verification: **PASS**.
Disposable local commit through separate exact permission: **PASS**.
Ordinary suite native-registration boundary: **PASS**.
Unattended external/provider rollout: **NO-GO**, отдельный track. Hard monetary/
provider/account ceilings и исторический supervision blocker здесь не решались.
Production activation и delivery в реальных repositories не выполнялись.

Дополнительных решений для выполненного локального scope не требуется. Следующий
минимальный slice: read-only reconciliation uncertain delivery по HEAD/tree/receipt
с явным human resolution, без автоматического повторения commit. Новые live runs,
production activation и внешние delivery actions требуют отдельных разрешений.

Rollback: revoke pending grants, отключить engineering opt-in для новых Tasks,
сохранить историю/receipts/dirty worktrees. Revert code commits `23b96e1`, `7d775e4`,
`d8c7dbe`, `462c4f8` в development branch без amend/reset; safe evidence docs можно
оставить. Production checkout/runtime для rollback не менять.
