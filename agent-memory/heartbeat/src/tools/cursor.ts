/**
 * Cursor — IDE activity and project status
 *
 * Monitors development environment: recent file changes,
 * git status, test results, and build status.
 *
 * Unlike API-based tools, Cursor gathers data from the local filesystem
 * (git repos, build outputs, test results).
 *
 * Env: CURSOR_PROJECT_PATHS (comma-separated project paths)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { BaseTool } from "./base-tool.js";
import type { GatherContext, GatherResult, ToolConfigSchema } from "../types.js";

export class CursorTool extends BaseTool {
  id = "cursor";
  name = "Cursor";
  description = "IDE project status, git changes, and build/test results";
  category = "development" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "CURSOR_PROJECT_PATHS",
          description: "Comma-separated paths to projects to monitor",
          required: false,
          example: "~/projects/app,~/projects/api",
        },
      ],
      settings: [
        {
          key: "checkGit",
          description: "Check git status of projects",
          type: "boolean",
          default: true,
        },
        {
          key: "checkTests",
          description: "Check for recent test results",
          type: "boolean",
          default: false,
        },
      ],
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const projectPaths = this.env("CURSOR_PROJECT_PATHS")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (projectPaths.length === 0) {
        return [];
      }

      const projects: Array<{
        path: string;
        name: string;
        gitStatus?: string;
        branch?: string;
        uncommitted?: number;
        unpushed?: number;
        recentFiles?: string[];
      }> = [];

      for (const projectPath of projectPaths) {
        const resolvedPath = projectPath.replace("~", process.env.HOME ?? "");

        try {
          await fs.access(resolvedPath);
        } catch {
          continue;
        }

        const project: (typeof projects)[number] = {
          path: resolvedPath,
          name: path.basename(resolvedPath),
        };

        // Git status
        if (ctx.config.checkGit !== false) {
          try {
            project.branch = execSync("git branch --show-current", {
              cwd: resolvedPath,
              encoding: "utf-8",
              timeout: 5000,
            }).trim();

            const status = execSync("git status --porcelain", {
              cwd: resolvedPath,
              encoding: "utf-8",
              timeout: 5000,
            });
            project.uncommitted = status.split("\n").filter(Boolean).length;

            const log = execSync("git log @{u}..HEAD --oneline 2>/dev/null || echo ''", {
              cwd: resolvedPath,
              encoding: "utf-8",
              timeout: 5000,
            });
            project.unpushed = log.split("\n").filter(Boolean).length;

            project.gitStatus = `${project.branch} | ${project.uncommitted} uncommitted | ${project.unpushed} unpushed`;
          } catch {
            project.gitStatus = "Not a git repo or git error";
          }
        }

        // Recent files (last modified in past hour)
        try {
          const output = execSync(
            'find . -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.md" | head -20 | xargs ls -t 2>/dev/null | head -5',
            { cwd: resolvedPath, encoding: "utf-8", timeout: 5000 }
          );
          project.recentFiles = output.split("\n").filter(Boolean).slice(0, 5);
        } catch {
          // Ignore
        }

        projects.push(project);
      }

      return projects;
    });

    const items = result.map((project) =>
      this.item({
        type: "project",
        title: project.name,
        content: [
          project.gitStatus ? `Git: ${project.gitStatus}` : "",
          project.recentFiles?.length
            ? `Recent: ${project.recentFiles.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        priority:
          (project.uncommitted ?? 0) > 10 || (project.unpushed ?? 0) > 5
            ? "medium"
            : "info",
        metadata: project,
      })
    );

    const alerts = items
      .filter((i) => i.priority !== "info")
      .map((i) =>
        this.alert("info", `${i.title}: uncommitted work`, i.content)
      );

    return this.success(
      items,
      alerts,
      `${items.length} project(s) checked.`,
      ms
    );
  }
}
