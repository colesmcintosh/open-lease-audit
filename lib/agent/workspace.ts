import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TYPE_GUIDANCE } from "@/lib/columns";
import type { ColumnDef, LeaseDoc } from "@/lib/types";

export interface WorkspaceLease {
  doc: LeaseDoc;
  /** Path relative to the workspace root, e.g. "leases/hq-suite-400.txt". */
  relPath: string;
}

export interface Workspace {
  root: string;
  leases: WorkspaceLease[];
  /** Directory the record_abstract tool writes per-lease JSON into. */
  abstractsDir: string;
  /** Directory the report_candidate tool writes per-candidate JSON into. */
  candidatesDir: string;
  dispose: () => Promise<void>;
}

/** Filesystem-safe name that still reads like the original file. */
function slugify(name: string, fallback: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path
    .basename(name, path.extname(name))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || fallback}${ext === ".pdf" ? ".pdf" : ".txt"}`;
}

function schemaDoc(columns: ColumnDef[], leases: WorkspaceLease[], today: string) {
  const fields = columns
    .map(
      (column) =>
        `| \`${column.name}\` | ${column.type} | ${column.description} | ${TYPE_GUIDANCE[column.type]} |`
    )
    .join("\n");

  return `# Abstraction schema

Today's date is **${today}**. Treat every deadline, notice window, and expiration
against that date.

The portfolio owner asked for these fields, in their own words. Report values
using the **exact** column name in the first row so they land in the right column.

| Column | Type | What they want | Format |
| --- | --- | --- | --- |
${fields}

## Rules

- Never invent a value. If the lease genuinely does not specify a field, report
  it as \`null\` — a missing term is itself a signal for the auditors downstream.
- Every non-null value carries a short **verbatim** quote from the lease as
  evidence. Quote the document, do not paraphrase it.
- Confidence: \`high\` = stated explicitly, \`medium\` = derived or paraphrased,
  \`low\` = ambiguous or assembled from several clauses.
- Read the whole document before reporting. Terms are frequently defined in one
  place and contradicted in another; that contradiction is the point.

## Portfolio

${leases.map((lease) => `- \`${lease.relPath}\` (original name: ${lease.doc.name})`).join("\n")}
`;
}

/**
 * Materializes the uploaded portfolio on disk so the agents can read it with
 * their own file tools. The workspace doubles as shared memory between stages:
 * abstracts and candidates are written back into it, so a later subagent reads
 * an earlier one's output from disk instead of through the orchestrator's
 * context window.
 */
export async function createWorkspace({
  docs,
  columns,
  today,
}: {
  docs: LeaseDoc[];
  columns: ColumnDef[];
  today: string;
}): Promise<Workspace> {
  const root = await mkdtemp(path.join(tmpdir(), "lease-audit-"));
  const leaseDir = path.join(root, "leases");
  const abstractsDir = path.join(root, "abstracts");
  const candidatesDir = path.join(root, "candidates");

  await Promise.all([
    mkdir(leaseDir, { recursive: true }),
    mkdir(abstractsDir, { recursive: true }),
    mkdir(candidatesDir, { recursive: true }),
  ]);

  const used = new Set<string>();
  const leases: WorkspaceLease[] = [];

  for (const [index, doc] of docs.entries()) {
    let fileName = slugify(doc.name, `lease-${index + 1}`);
    // Two uploads can slug to the same name; keep them distinguishable.
    while (used.has(fileName)) {
      const ext = path.extname(fileName);
      fileName = `${path.basename(fileName, ext)}-${index + 1}${ext}`;
    }
    used.add(fileName);

    const absolute = path.join(leaseDir, fileName);
    await writeFile(
      absolute,
      doc.kind === "pdf" ? Buffer.from(doc.data, "base64") : doc.data,
      doc.kind === "pdf" ? undefined : "utf8"
    );
    leases.push({ doc, relPath: path.join("leases", fileName) });
  }

  await writeFile(
    path.join(root, "SCHEMA.md"),
    schemaDoc(columns, leases, today),
    "utf8"
  );

  return {
    root,
    leases,
    abstractsDir,
    candidatesDir,
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
