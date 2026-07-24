import type { Reporter, TestCase, TestResult, FullResult } from "@playwright/test/reporter";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { commitAndPushAllChanges } from "./git-commit-push";

class HealerReporter implements Reporter {
  private failures: { file: string; title: string; error: string }[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== "passed" && result.status !== "skipped") {
      const err = result.errors?.[0];
      const errorContext = [
        err?.message ?? "unknown error",
        err?.snippet ?? "",
      ].filter(Boolean).join("\n");
      console.log(`[HEALER] Error context for "${test.title}":\n${errorContext}`);
      this.failures.push({
        file: test.location.file,
        title: test.title,
        error: errorContext,
      });
    }
  }

  onEnd(_result: FullResult) {
    if (this.failures.length === 0 || process.env.PW_HEALER_RUN) return;

    const script = path.join(__dirname, "../scripts/run-with-healer.sh");
    const outcomes: { file: string; title: string; healed: boolean }[] = [];

    for (const failure of this.failures) {
      console.log(`[HEALER] Invoking healer for "${failure.title}" in ${failure.file}`);
      console.log(`[HEALER] Error: ${failure.error}`);

      let verified = false;
      try {
        execFileSync("bash", [script], {
          stdio: "inherit",
          env: {
            ...process.env,
            PW_HEALER_RUN: "1",
            HEALER_TEST_FILE: failure.file,
            HEALER_TEST_NAME: failure.title,
            HEALER_ERROR: failure.error,
          },
        });
        verified = true;
      } catch (err) {
        console.error(`[HEALER] script failed for ${failure.file}:`, (err as Error).message);
        console.error(`[HEALER] Original test error: ${failure.error}`);
      }

      outcomes.push({ file: failure.file, title: failure.title, healed: verified });
      console.log(`[HEALER] ${failure.file} — ${verified ? "fixed" : "still failing"}`);
    }

    const stillBroken = outcomes.filter((o) => !o.healed);

    if (stillBroken.length > 0) {
      console.error(`[HEALER] ${stillBroken.length}/${outcomes.length} still failing after healing:`);
      stillBroken.forEach((o) => console.error(`  - ${o.title} (${o.file})`));
    } else {
      console.log(`[HEALER] All ${outcomes.length} failing test(s) fixed and verified.`);
      commitAndPushAllChanges(outcomes.map(({ file, title }) => ({ file, title })));
    }
  }
}

export default HealerReporter;
