import { z } from "zod";
import { BaseToolHandler } from "./base.js";
import { appendMemory, writeMemory } from "../vault.js";
import { resolveContextAndRemember, contextNote } from "./resolveContext.js";
import { PATH_DESCRIPTION } from "./constants.js";

const APPEND_MAP: Record<string, string> = {
  progress: "progress.md",
  decisions: "decisions.md",
};

const WRITE_MAP: Record<string, string> = {
  memory: "memory.md",
  architecture: "architecture.md",
  stack: "stack.md",
  next_steps: "next_steps.md",
};

export class UpdateProjectMemoryHandler extends BaseToolHandler<
  z.ZodObject<{
    project: z.ZodOptional<z.ZodString>;
    subproject: z.ZodOptional<z.ZodString>;
    workspace_root: z.ZodOptional<z.ZodString>;
    path: z.ZodOptional<z.ZodString>;
    progress: z.ZodOptional<z.ZodString>;
    decisions: z.ZodOptional<z.ZodString>;
    next_steps: z.ZodOptional<z.ZodString>;
    memory: z.ZodOptional<z.ZodString>;
    architecture: z.ZodOptional<z.ZodString>;
    stack: z.ZodOptional<z.ZodString>;
    custom: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<{
          filename: z.ZodString;
          content: z.ZodString;
          mode: z.ZodOptional<z.ZodEnum<["append", "write"]>>;
        }>
      >
    >;
  }>
> {
  public readonly name = "update_project_memory";
  public readonly description = `Save session work to the project vault in a single call.

USE THIS TOOL when the user says something vague like:
- "update the memory"
- "save what we did today"
- "record this session"
- "update the project notes"

FLOW — follow these steps before calling:

1. If the vault context is not already loaded, call load_project_context first
   to understand what is already recorded and avoid duplicating information.

2. Analyze the current conversation and identify what changed:
   - Decisions made → "decisions" field
   - Work completed, features implemented → "progress" field
   - Updated list of upcoming tasks → "next_steps" field
   - Changed understanding of the project purpose or status → "memory" field
   - Architectural changes → "architecture" field
   - New tools, libraries, or infrastructure added → "stack" field
   - Custom .md files (e.g. api.md, testing.md) → "custom" field

3. Populate only the fields that actually changed. Leave others undefined.

WRITE RULES — how each field is stored:
- "progress"     → APPENDED to progress.md   (log, never overwrites history)
- "decisions"    → APPENDED to decisions.md  (log, never overwrites history)
- "next_steps"   → OVERWRITES next_steps.md  (always reflects current state)
- "memory"       → OVERWRITES memory.md      (always reflects current state)
- "architecture" → OVERWRITES architecture.md
- "stack"        → OVERWRITES stack.md
- "custom"       → each item uses its own mode ("append" or "write", default "append")

FORMAT GUIDANCE:
- For appended fields (progress, decisions): the date header "## YYYY-MM-DD" is REQUIRED and enforced.
  Example: "## 2026-04-23\\n- Implemented OAuth2 token validation\\n- Files: auth/token.php"
  Without this header the write will be rejected with an error.
- For overwritten fields: provide the complete updated content, not just the diff.`;

  public readonly inputSchema = z.object({
    project: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Project name. If omitted, auto-discovered from workspace_root (.luminavault.json) or last used project."
      ),
    subproject: z
      .string()
      .min(1)
      .optional()
      .describe("Subproject name. When provided, updates vault/project/subproject/."),
    workspace_root: z
      .string()
      .optional()
      .describe(
        "Project folder path. Used to auto-discover .luminavault.json when project is omitted."
      ),
    path: z.string().optional().describe(PATH_DESCRIPTION),
    progress: z
      .string()
      .optional()
      .describe(
        "Work completed in this session. APPENDED to progress.md. Include date and summary."
      ),
    decisions: z
      .string()
      .optional()
      .describe(
        "Decisions made in this session. APPENDED to decisions.md. Include date, decision, and rationale."
      ),
    next_steps: z
      .string()
      .optional()
      .describe(
        "Current list of upcoming tasks. OVERWRITES next_steps.md with the full updated content."
      ),
    memory: z
      .string()
      .optional()
      .describe("Updated project overview (purpose, status, key notes). OVERWRITES memory.md."),
    architecture: z
      .string()
      .optional()
      .describe("Updated architecture description. OVERWRITES architecture.md."),
    stack: z.string().optional().describe("Updated technical stack. OVERWRITES stack.md."),
    custom: z
      .array(
        z.object({
          filename: z.string().min(1).describe("The .md filename (e.g. api.md, testing.md)"),
          content: z.string().describe("Content to write"),
          mode: z
            .enum(["append", "write"])
            .optional()
            .describe('Write mode: "append" (add to end, default) or "write" (overwrite)'),
        })
      )
      .optional()
      .describe(
        'Custom .md files outside the standard set. Each entry: { filename, content, mode? ("append"|"write") }.'
      ),
  });

  constructor(private basePath: string) {
    super();
  }

  async execute(args: z.infer<typeof this.inputSchema>) {
    const standardFields = [
      "progress",
      "decisions",
      "next_steps",
      "memory",
      "architecture",
      "stack",
    ] as const;
    const hasContent =
      standardFields.some((f) => args[f] !== undefined) || (args.custom && args.custom.length > 0);

    if (!hasContent) {
      return {
        content: [
          {
            type: "text",
            text: "Nothing to update: no content fields were provided (progress, decisions, next_steps, memory, architecture, stack, custom).",
          },
        ],
      };
    }

    try {
      const ctx = await resolveContextAndRemember(this.basePath, args);
      if (!ctx.ok) return ctx.response;

      type WriteOp = { kind: "append" | "write"; filename: string; content: string };
      const ops: WriteOp[] = [];

      for (const [field, filename] of Object.entries(APPEND_MAP)) {
        const content = args[field as keyof typeof args] as string | undefined;
        if (content !== undefined) ops.push({ kind: "append", filename, content });
      }
      for (const [field, filename] of Object.entries(WRITE_MAP)) {
        const content = args[field as keyof typeof args] as string | undefined;
        if (content !== undefined) ops.push({ kind: "write", filename, content });
      }
      if (args.custom) {
        for (const item of args.custom) {
          ops.push({
            kind: item.mode !== "write" ? "append" : "write",
            filename: item.filename,
            content: item.content,
          });
        }
      }

      const settled = await Promise.allSettled(
        ops.map((op) =>
          op.kind === "append"
            ? appendMemory(ctx.basePath, ctx.project, op.filename, op.content, ctx.subproject)
            : writeMemory(ctx.basePath, ctx.project, op.filename, op.content, ctx.subproject)
        )
      );

      const appended: string[] = [];
      const written: string[] = [];
      const errors: string[] = [];

      for (let i = 0; i < ops.length; i++) {
        const op = ops[i]!;
        const result = settled[i]!;
        if (result.status === "fulfilled") {
          if (op.kind === "append") appended.push(op.filename);
          else written.push(op.filename);
        } else {
          const err: unknown = result.reason;
          errors.push(`${op.filename}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const label = ctx.subproject ? `${ctx.project}/${ctx.subproject}` : ctx.project;
      const parts: string[] = [`Project: ${label}${contextNote(ctx)}`];
      if (appended.length > 0) parts.push(`Appended: ${appended.join(", ")}`);
      if (written.length > 0) parts.push(`Overwritten: ${written.join(", ")}`);
      if (errors.length > 0) parts.push(`Errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`);

      return {
        content: [{ type: "text", text: parts.join("\n") }],
        isError: errors.length > 0,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
}
