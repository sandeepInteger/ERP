// Keeps CLAUDE.md (the hand-off file) current.
//   node handoff-check.mjs stop     -> Stop hook: if code changed after CLAUDE.md was last saved,
//                                      tell Claude to update CLAUDE.md before ending the turn.
//   node handoff-check.mjs compact  -> SessionStart(compact) hook: right after the context was
//                                      compacted, tell Claude to record anything missing in CLAUDE.md.
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const mode = process.argv[2];
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  input = {};
}

// Paths that count as "code" for the hand-off.
const CODE = /^(apps|packages|tools|infra)\/|^docker-compose[^/]*$|(^|\/)Dockerfile[^/]*$|^\.env\.example$|^package\.json$|^pnpm-workspace\.yaml$|^turbo\.json$/;

function codeChangedSinceHandoff() {
  const handoff = statSync(path.join(root, "CLAUDE.md")).mtimeMs;
  const out = execSync("git status --porcelain --untracked-files=all", { cwd: root, encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3).split(" -> ").pop().replace(/^"|"$/g, ""))
    .filter((f) => CODE.test(f))
    .filter((f) => {
      try {
        return statSync(path.join(root, f)).mtimeMs > handoff + 1000;
      } catch {
        return false; // deleted file: can't compare, don't nag forever
      }
    });
}

if (mode === "stop") {
  if (input.stop_hook_active) process.exit(0); // already asked once this turn
  const files = codeChangedSinceHandoff();
  if (files.length === 0) process.exit(0);
  const list = files.slice(0, 10).join(", ") + (files.length > 10 ? ` (+${files.length - 10} more)` : "");
  console.log(
    JSON.stringify({
      decision: "block",
      reason:
        `Code changed after CLAUDE.md was last updated: ${list}. ` +
        "Update CLAUDE.md now: §2 Status (date, built/backlog/open questions, git state), §3 repo map for new files, " +
        "§4–8 for new rules, §5 for new logins/commands. Keep it short and factual. Then end the turn.",
    }),
  );
} else if (mode === "compact") {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext:
          "The conversation was just compacted. Before continuing, compare the summary with CLAUDE.md and record " +
          "anything it is missing (decisions, status, new files, open questions, pending tasks) so a fresh agent can " +
          "pick up from CLAUDE.md alone. Then continue the task.",
      },
    }),
  );
}
