export type AttentionTier = "G" | "Y" | "R";

/** Case-insensitive substring match for channel-centric allowlist. */
const EDU_CHANNEL_HINTS = [
  "MIT",
  "OpenCourseWare",
  "Stanford",
  "Veritasium",
  "3Blue1Brown",
  "Khan Academy",
  "TED-Ed",
  "MinutePhysics",
  "Computerphile",
] as const;

const RED_FLAG_WORDS =
  /\b(?:INSANE|CRAZY|TIKTOK|BRAIN\s*ROT|COMPILATION|GONE\s*WRONG|YOU\s*WON'?T\s*BELIEVE)\b/i;

function countAllCapsWords(text: string): number {
  return text
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 1 && w === w.toUpperCase()).length;
}

export type RuleClassification = {
  tier: AttentionTier;
  /** Why the rule engine chose this tier (for logs / UX). */
  reasons: string[];
};

/**
 * R overrides G: clickbait signals win over channel name.
 * Default Y when neither strong signal.
 */
export function classifyHeuristicDetailed(
  title: string,
  channel: string
): RuleClassification {
  const t = title || "";
  const c = channel || "";
  const blob = `${t} ${c}`;

  const bangs = (t.match(/!/g) ?? []).length;
  const capsWords = t.length ? countAllCapsWords(t) : 0;

  const rReasons: string[] = [];
  if (capsWords > 2) {
    rReasons.push(`rule:R:title_all_caps_word_count=${capsWords}(>2)`);
  }
  if (bangs > 2) {
    rReasons.push(`rule:R:title_exclamation_count=${bangs}(>2)`);
  }
  if (RED_FLAG_WORDS.test(blob)) {
    rReasons.push("rule:R:clickbait_keyword_or_pattern_match");
  }
  if (rReasons.length > 0) {
    return { tier: "R", reasons: rReasons };
  }

  const ch = c.toLowerCase();
  for (const hint of EDU_CHANNEL_HINTS) {
    if (ch.includes(hint.toLowerCase())) {
      return {
        tier: "G",
        reasons: [`rule:G:edu_channel_substring="${hint}"`],
      };
    }
  }

  return {
    tier: "Y",
    reasons: ["rule:Y:default_no_strong_signal"],
  };
}

export function classifyHeuristic(title: string, channel: string): AttentionTier {
  return classifyHeuristicDetailed(title, channel).tier;
}
