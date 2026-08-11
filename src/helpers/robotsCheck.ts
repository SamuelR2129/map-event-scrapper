export type RobotsCheckResult = {
  allowed: boolean;
  rule?: string;
};

const robotsCache = new Map<string, string | null>();

const fetchRobotsTxt = async (targetUrl: string): Promise<string | null> => {
  const origin = new URL(targetUrl).origin;
  if (robotsCache.has(origin)) return robotsCache.get(origin) ?? null;

  let robotsText: string | null = null;
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": "map-event-scraper" },
      redirect: "follow",
    });
    if (response.ok) {
      const body = await response.text();
      if (body.trim()) robotsText = body;
    } else if (response.status !== 404) {
      console.log(`robots.txt unavailable (${response.status}) for ${origin}, assuming scrape is allowed`);
      robotsText = null;
    }
  } catch (err) {
    console.log(`robots.txt fetch failed for ${origin}, assuming scrape is allowed:`, (err as Error).message);
  }

  robotsCache.set(origin, robotsText);
  return robotsText;
};

const matchPathRule = (rule: string, urlPath: string): boolean => {
  if (!rule) return false;
  const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$/, "$");
  return new RegExp(`^${escaped}`).test(urlPath);
};

export const checkRobotsAllowed = async (
  targetUrl: string,
  userAgent?: string,
): Promise<RobotsCheckResult> => {
  const robotsText = await fetchRobotsTxt(targetUrl);
  if (!robotsText) return { allowed: true };

  const url = new URL(targetUrl);
  const urlPath = `${url.pathname}${url.search}`;

  const groups = new Map<string, Array<{ type: "allow" | "disallow"; path: string; original: string }>>();
  let currentAgent: string | null = null;

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const [key, ...valueParts] = line.split(":");
    const value = valueParts.join(":").trim();

    if (key?.toLowerCase() === "user-agent") {
      currentAgent = value.toLowerCase() || null;
      if (currentAgent && !groups.has(currentAgent)) groups.set(currentAgent, []);
    } else if (key?.toLowerCase() === "disallow" || key?.toLowerCase() === "allow") {
      if (!currentAgent) continue;
      const rules = groups.get(currentAgent);
      if (!rules) continue;
      if (value) rules.push({ type: key.toLowerCase() as "allow" | "disallow", path: value, original: value });
    }
  }

  const wildcardRules = groups.get("*");
  let rules = wildcardRules ?? [];

  if (userAgent) {
    const uaKey = userAgent.toLowerCase();
    const uaRules = groups.get(uaKey);
    if (uaRules) rules = uaRules;
  }

  if (rules.length === 0) return { allowed: true };

  const matchedRules = rules
    .filter((rule) => matchPathRule(rule.path, urlPath))
    .sort((a, b) => b.path.length - a.path.length);

  const longestMatch = matchedRules[0];
  if (!longestMatch) return { allowed: true };

  if (longestMatch.type === "allow") return { allowed: true };

  const overridingAllow = matchedRules.some(
    (rule) => rule.type === "allow" && rule.path.length > longestMatch.path.length,
  );
  if (overridingAllow) return { allowed: true };

  return { allowed: false, rule: longestMatch.original };
};
