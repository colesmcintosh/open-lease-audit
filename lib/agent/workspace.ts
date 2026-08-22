import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LeaseDoc } from "@/lib/types";

export interface WorkspaceLease {
  doc: LeaseDoc;
  /** Path relative to the workspace root, e.g. "leases/hq-suite-400.txt". */
  relPath: string;
}

export interface Workspace {
  root: string;
  leases: WorkspaceLease[];
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

function portfolioDoc(leases: WorkspaceLease[], today: string) {
  return `# Portfolio

Today's date is **${today}**. Measure every deadline, notice window, and
expiration against that date.

## Documents

${leases.map((lease) => `- \`${lease.relPath}\` (original name: ${lease.doc.name})`).join("\n")}

Read each one end to end. Commercial leases define a term in one section and
modify it in another, and the modification is what governs — so a clause you
found by keyword still has to be read in context before you rely on it.
`;
}

/**
 * Materializes the uploaded portfolio on disk so the agents can read it with
 * their own file tools. The workspace doubles as shared memory between stages:
 * candidates are written back into it, so the materiality gate reads the
 * detectors' output from disk instead of through the orchestrator's context
 * window.
 */
export async function createWorkspace({
  docs,
  today,
}: {
  docs: LeaseDoc[];
  today: string;
}): Promise<Workspace> {
  const root = await mkdtemp(path.join(tmpdir(), "lease-audit-"));
  const leaseDir = path.join(root, "leases");
  const candidatesDir = path.join(root, "candidates");

  await Promise.all([
    mkdir(leaseDir, { recursive: true }),
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
    path.join(root, "PORTFOLIO.md"),
    portfolioDoc(leases, today),
    "utf8"
  );

  return {
    root,
    leases,
    candidatesDir,
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
