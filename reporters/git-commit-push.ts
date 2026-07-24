import { execFileSync } from "node:child_process";

export function commitAndPushAllChanges(outcomes: { file: string; title: string }[]) {
  try {
    const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf-8" }).trim();
    if (!status) return;

    if (process.env.GITHUB_TOKEN) {
      const remote = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf-8" }).trim();
      const authedUrl = remote
        .replace("https://", `https://x-access-token:${process.env.GITHUB_TOKEN}@`)
        .replace("git@github.com:", `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/`);
      execFileSync("git", ["remote", "set-url", "origin", authedUrl]);
    }

    const branch = `healer-auto-fix-${Date.now()}`;
    execFileSync("git", ["checkout", "-b", branch], { stdio: "inherit" });
    execFileSync("git", ["add", "-A"], { stdio: "inherit" });
    const message = `healer: auto-fix for ${outcomes.map((o) => o.title).join(", ")}`;
    execFileSync("git", ["commit", "-m", message], { stdio: "inherit" });
    execFileSync("git", ["push", "origin", branch], { stdio: "inherit" });
    console.log(`[HEALER] Changes pushed to branch: ${branch}`);

    execFileSync("curl", [
      "-sSf",
      "-X", "POST",
      "-H", `Authorization: token ${process.env.GITHUB_TOKEN}`,
      "-H", "Accept: application/vnd.github.v3+json",
      "https://api.github.com/repos/SamuelR2129/map-event-scrapper/pulls",
      "-d", JSON.stringify({
        title: message,
        head: branch,
        base: "main",
        body: `Auto-fix by healer:\n${outcomes.map(o => `- ${o.title} (${o.file})`).join("\n")}`
      })
    ]);
    console.log(`[HEALER] PR created for branch: ${branch}`);
  } catch (err) {
    console.error(`[HEALER] git operation failed: ${(err as Error).message}`);
  }
}
