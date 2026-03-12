import { getUncategorizedInboxThreadIds, setThreadCategoriesAuto } from "@/services/db/threadCategories";
import { getThreadLabelIds } from "@/services/db/threads";
import { getMessagesForThread } from "@/services/db/messages";
import { categorizeByFiveSplitRules, categorizeByThreeSplitRules } from "./ruleEngine";
import { loadThreeSplitConfig } from "./threeSplitConfig";

/**
 * Backfill uncategorized inbox threads with rule-based categorization.
 * Always categorizes into both 5-split and 3-split systems.
 */
export async function backfillUncategorizedThreads(
  accountId: string,
  batchSize = 50,
): Promise<number> {
  const threeSplitConfig = await loadThreeSplitConfig();

  let totalCategorized = 0;
  let batch: Awaited<ReturnType<typeof getUncategorizedInboxThreadIds>>;

  do {
    batch = await getUncategorizedInboxThreadIds(accountId, batchSize);

    await Promise.all(batch.map(async (thread) => {
      const [labelIds, messages] = await Promise.all([
        getThreadLabelIds(accountId, thread.id),
        getMessagesForThread(accountId, thread.id),
      ]);
      const lastMessage = messages[messages.length - 1];

      const catInput = {
        labelIds,
        fromAddress: lastMessage?.from_address ?? thread.fromAddress ?? null,
        listUnsubscribe: lastMessage?.list_unsubscribe ?? null,
      };

      const fiveCategory = categorizeByFiveSplitRules(catInput);
      const threeCategory = categorizeByThreeSplitRules(catInput, threeSplitConfig);
      await setThreadCategoriesAuto(accountId, thread.id, fiveCategory, threeCategory);
      totalCategorized++;
    }));
  } while (batch.length === batchSize);

  return totalCategorized;
}
