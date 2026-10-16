// OpenCode — built-in ACP provider.
//
// OpenCode exposes the Agent Client Protocol directly (`opencode acp`), so
// it does not need a vendor-specific adapter. Keeping this descriptor built
// in makes OpenCode available from every 0x2F workspace while all protocol
// behavior remains in the generic ACP provider.

import { createAcpProvider } from "./acp.mjs";

export const opencodeProvider = createAcpProvider({
  id: "opencode",
  displayName: "OpenCode",
  transport: "acp",
  command: ["opencode", "acp"],
  permissions: "interactive"
});
Object.assign(opencodeProvider.capabilities,{opaqueAgentLoop:true,opaqueForegroundOnly:true,costBoundedSmallTasks:false,supportsHardInteractionLimits:false,supportsHardModelCallLimits:false,supportsHardTokenLimits:false});
