import { getSetting, setSetting } from "@/services/db/settings";
import {
  buildThreeSplitConfig,
  DEFAULT_FEED_PATTERNS,
  DEFAULT_NOTIFICATION_PATTERNS,
  type ThreeSplitConfig,
} from "./ruleEngine";

/**
 * Load 3-split config from DB settings, seeding defaults on first use.
 * Call once per sync cycle and pass to categorizeByThreeSplitRules.
 */
export async function loadThreeSplitConfig(): Promise<ThreeSplitConfig> {
  let [feedRaw, notifRaw] = await Promise.all([
    getSetting("three_split_feed_patterns"),
    getSetting("three_split_notification_patterns"),
  ]);

  // Seed defaults into DB on first use so the settings page has something to edit
  if (feedRaw === null) {
    feedRaw = JSON.stringify(DEFAULT_FEED_PATTERNS);
    await setSetting("three_split_feed_patterns", feedRaw);
  }
  if (notifRaw === null) {
    notifRaw = JSON.stringify(DEFAULT_NOTIFICATION_PATTERNS);
    await setSetting("three_split_notification_patterns", notifRaw);
  }

  return buildThreeSplitConfig(
    JSON.parse(feedRaw) as string[],
    JSON.parse(notifRaw) as string[],
  );
}
