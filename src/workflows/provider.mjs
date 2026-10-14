import { validateSnapshot } from '../core/workflow-schema.mjs';
import { rejectCredentials } from '../core/workflow-adapters.mjs';
import { workflowKind } from './registry.mjs';
import { WORKFLOW_PROVIDER } from '../core/workflows.mjs';

// One adapter to the existing worker contract; no second task runtime.
export function createWorkflowProvider() {
  const controller = new AbortController();
  return {
    id: WORKFLOW_PROVIDER, displayName: 'Local workflow', integrationType: 'workflow',
    command: [process.execPath], workflowOnly: true,
    capabilities: { supportsResume: false, supportsStructuredEvents: true,
      supportsFileChanges: false, supportsCommands: false, supportsPermissionRequests: false,
      supportsSandbox: false, supportsStreaming: true, resultOnCompletion: true },
    async start({ cwd, task, store, onEvent }) {
      validateSnapshot(task.workflow.definition);
      const handler = workflowKind(task.workflow?.definition.kind).start;
      if (!handler) throw new Error('Unknown workflow kind.');
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, task.workflow.definition.maxDurationMs);
      try {
        await onEvent({ type: 'run.started' });
        const outcome = await handler({ cwd, task, store, signal: controller.signal, onEvent });
        if (timedOut) return { status: 'failed', error: 'Workflow duration limit exceeded.' };
        return outcome;
      } catch (error) {
        let message = timedOut ? 'Workflow duration limit exceeded.' : error.message;
        try { rejectCredentials(message, task.workflow.definition); } catch { message = 'Credential-bearing error output refused.'; }
        return { status: 'failed', error: message };
      } finally { clearTimeout(timeout); }
    },
    cancel() { controller.abort(); return { delivered: true }; }
  };
}
