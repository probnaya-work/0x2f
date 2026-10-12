// Shared stop handle for a provider child process.
//
// The worker asks the active provider to cancel; each provider that owns a
// child process binds it here. Killing that child is the provider contract's
// cancel(), not a gesture the TUI or the Web UI performs itself.

export function createChildCancel() {
  let child = null;
  return {
    bind(proc) {
      child = proc;
    },
    cancel() {
      if (!child) return { delivered: false, error: "no active process" };
      try {
        child.kill("SIGTERM");
        return { delivered: true };
      } catch (error) {
        // The process already exited. The run's own completion owns the
        // result; this is not a failed delivery.
        if (error?.code === "ESRCH") return { delivered: true };
        return {
          delivered: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}
