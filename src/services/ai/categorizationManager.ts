import { isAiAvailable } from "./providerManager";
import { categorizeThreads, categorizeThreadsThreeSplit } from "./aiService";
import { getSetting } from "@/services/db/settings";
import {
  getRecentRuleCategorizedThreadIds,
  setThreadCategoriesBatch,
} from "@/services/db/threadCategories";

export async function categorizeNewThreads(accountId: string): Promise<void> {
  try {
    // Check if AI and auto-categorize are enabled
    const aiAvail = await isAiAvailable();
    if (!aiAvail) return;

    const autoCat = await getSetting("ai_auto_categorize");
    if (autoCat === "false") return;

    // Get recently rule-categorized inbox threads (AI refines, not replaces)
    const threads = await getRecentRuleCategorizedThreadIds(accountId, 20);
    if (threads.length === 0) return;

    // Pick AI categorizer based on inbox view mode
    const viewMode = await getSetting("inbox_view_mode");
    const aiCategorize = viewMode === "three-split" ? categorizeThreadsThreeSplit : categorizeThreads;

    // Categorize via AI (refines rule-based results)
    const categories = await aiCategorize(
      threads.map((t) => ({
        id: t.id,
        subject: t.subject ?? "",
        snippet: t.snippet ?? "",
        fromAddress: t.fromAddress ?? "",
      })),
    );

    if (categories.size === 0) return;

    // Store results (setThreadCategoriesBatch respects manual overrides)
    await setThreadCategoriesBatch(accountId, categories);
  } catch (err) {
    // Non-blocking — log and continue
    console.error("Auto-categorization failed:", err);
  }
}
