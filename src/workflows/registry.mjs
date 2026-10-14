import { validateEditorialDefinition, validateEditorialDecisionRecord, freezeEditorialSnapshot, validateEditorialSnapshot, validateSourceCheckpoint } from './editorial-schema.mjs';
import { runEditorial } from './editorial.mjs';
import { editorialDecision } from './decisions.mjs';
// Trusted code, statically registered. Definitions never load arbitrary modules.
const kinds = new Map([
  ['editorial', { enabled: true, taskFields: ['topicKeys','selected','corrections'], receiptFiles: ['artifacts/editorial/image-attempt.json'], materialFiles: ['template.md','rules.md','examples.md'], optionalMaterials: ['history.json','visual-reference.md'], freezeSnapshot: freezeEditorialSnapshot, validateSnapshot: validateEditorialSnapshot, validateDefinition: validateEditorialDefinition, validateDecisionRecord: validateEditorialDecisionRecord, start: runEditorial, decide: editorialDecision,
    checkpoints: [{ path: 'artifacts/editorial/sources.json', validate: validateSourceCheckpoint }],
    verifyDecisionArtifacts: answer => /^(accept|published)\b/i.test(answer) }],
  ['engineering', { enabled: false }]
]);
export function workflowKind(name) {
  const kind = kinds.get(name);
  if (!kind?.enabled) throw new Error(`Workflow kind ${name} is not enabled. Register a trusted implementation first.`);
  return kind;
}
