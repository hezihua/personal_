import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SettingsManager,
  type CreateAgentSessionOptions,
} from "@earendil-works/pi-coding-agent";
import type { HarnessRuntime } from "../harness/harness.js";
import { createHarnessExtension } from "./harness-extension.js";

export interface CreateHarnessSessionOptions {
  cwd?: string;
  agentDir?: string;
  harness: HarnessRuntime;
  pi?: Omit<CreateAgentSessionOptions, "cwd" | "agentDir" | "resourceLoader" | "settingsManager">;
}

export async function createHarnessPiSession(options: CreateHarnessSessionOptions) {
  const cwd = options.cwd ?? process.cwd();
  const agentDir = options.agentDir ?? getAgentDir();
  const settingsManager = SettingsManager.create(cwd, agentDir);

  await options.harness.prepare(cwd, agentDir);

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    extensionFactories: [createHarnessExtension(options.harness)],
    additionalSkillPaths: options.harness.config.skillSearchPaths,
  });
  await resourceLoader.reload();

  const tools = options.pi?.tools ?? options.harness.config.defaultTools;

  const created = await createAgentSession({
    cwd,
    agentDir,
    settingsManager,
    resourceLoader,
    tools,
    ...options.pi,
  });

  options.harness.syncToolsFromPi(created.session.getAllTools());
  return created;
}
