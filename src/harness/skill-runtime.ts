import { loadSkillsFromDir, type Skill } from "@earendil-works/pi-coding-agent";
import path from "node:path";

export interface SkillCatalog {
  skills: Skill[];
  diagnostics: Array<{ message: string; path?: string }>;
}

export class SkillRuntime {
  private catalog: SkillCatalog = { skills: [], diagnostics: [] };

  constructor(private readonly searchPaths: string[] = []) {}

  async reload(cwd: string): Promise<SkillCatalog> {
    const skills: Skill[] = [];
    const diagnostics: SkillCatalog["diagnostics"] = [];
    const paths =
      this.searchPaths.length > 0
        ? this.searchPaths
        : [path.join(cwd, "skills"), path.join(cwd, ".pi", "skills")];

    for (const dir of paths) {
      const result = loadSkillsFromDir({ dir, source: "harness" });
      skills.push(...result.skills);
      for (const d of result.diagnostics) {
        diagnostics.push({ message: d.message, path: d.path });
      }
    }

    this.catalog = { skills, diagnostics };
    return this.catalog;
  }

  list(): Skill[] {
    return this.catalog.skills;
  }

  findByName(name: string): Skill | undefined {
    return this.catalog.skills.find((s) => s.name === name);
  }

  formatForSystemPrompt(): string {
    if (this.catalog.skills.length === 0) {
      return "";
    }
    const lines = this.catalog.skills.map((s) => `- ${s.name}: ${s.description ?? "(no description)"}`);
    return ["可用 Skills（由 Harness Skill Runtime 发现）:", ...lines].join("\n");
  }
}
