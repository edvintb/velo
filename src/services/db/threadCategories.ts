import { getDb } from "./connection";

export type FiveSplitCategory = "Primary" | "Updates" | "Promotions" | "Social" | "Newsletters";

export const ALL_FIVE_SPLIT_CATEGORIES: FiveSplitCategory[] = [
  "Primary",
  "Updates",
  "Promotions",
  "Social",
  "Newsletters",
];

export type ThreeSplitCategory = "Primary" | "Feeds" | "Notifications";

export const ALL_THREE_SPLIT_CATEGORIES: ThreeSplitCategory[] = [
  "Primary",
  "Feeds",
  "Notifications",
];

export type CategoryMode = "five-split" | "three-split";

/** Maps mode to the category column name. */
function catCol(mode: CategoryMode): string {
  return mode === "three-split" ? "three_split_category" : "category";
}

/** Maps mode to the is_manual column name. */
function manualCol(mode: CategoryMode): string {
  return mode === "three-split" ? "three_split_is_manual" : "is_manual";
}

export async function getThreadCategory(
  accountId: string,
  threadId: string,
  mode: CategoryMode,
): Promise<string | null> {
  const db = await getDb();
  const col = catCol(mode);
  const rows = await db.select<Record<string, string | null>[]>(
    `SELECT ${col} as cat FROM thread_categories WHERE account_id = $1 AND thread_id = $2`,
    [accountId, threadId],
  );
  return rows[0]?.cat ?? null;
}

export async function getRecentRuleCategorizedThreadIds(
  accountId: string,
  mode: CategoryMode,
  limit = 20,
): Promise<{ id: string; subject: string; snippet: string; fromAddress: string }[]> {
  const db = await getDb();
  const col = catCol(mode);
  const manual = manualCol(mode);
  return db.select(
    `SELECT t.id, t.subject, t.snippet, m.from_address as fromAddress
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     INNER JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
     WHERE t.account_id = $1 AND tl.label_id = 'INBOX' AND tc.${manual} = 0 AND tc.${col} IS NOT NULL
     ORDER BY t.last_message_at DESC
     LIMIT $2`,
    [accountId, limit],
  );
}

export async function getCategoriesForThreads(
  accountId: string,
  threadIds: string[],
  mode: CategoryMode,
): Promise<Map<string, string>> {
  if (threadIds.length === 0) return new Map();
  const db = await getDb();
  const col = catCol(mode);
  const map = new Map<string, string>();
  const batchSize = 100;
  for (let i = 0; i < threadIds.length; i += batchSize) {
    const batch = threadIds.slice(i, i + batchSize);
    const placeholders = batch.map((_, idx) => `$${idx + 2}`).join(",");
    const rows = await db.select<{ thread_id: string; cat: string | null }[]>(
      `SELECT thread_id, ${col} as cat FROM thread_categories WHERE account_id = $1 AND thread_id IN (${placeholders})`,
      [accountId, ...batch],
    );
    for (const row of rows) {
      if (row.cat) map.set(row.thread_id, row.cat);
    }
  }
  return map;
}

/**
 * Set both 5-split and 3-split categories at once (used during sync).
 * Respects manual flags — only updates columns where is_manual = 0.
 */
export async function setThreadCategoriesAuto(
  accountId: string,
  threadId: string,
  fiveSplitCategory: string,
  threeSplitCategory: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO thread_categories (account_id, thread_id, category, three_split_category, three_split_is_manual)
     VALUES ($1, $2, $3, $4, 0)
     ON CONFLICT(account_id, thread_id) DO UPDATE SET
       category = CASE WHEN is_manual = 0 THEN $3 ELSE category END,
       three_split_category = CASE WHEN three_split_is_manual = 0 THEN $4 ELSE three_split_category END`,
    [accountId, threadId, fiveSplitCategory, threeSplitCategory],
  );
}

/**
 * Manually set a thread's category for a specific mode.
 * Only touches the columns for the given mode — doesn't corrupt the other mode's data.
 * The row must already exist (created during sync via setThreadCategoriesAuto).
 */
export async function setThreadCategoryManual(
  accountId: string,
  threadId: string,
  category: string,
  mode: CategoryMode,
): Promise<void> {
  const db = await getDb();
  const col = catCol(mode);
  const manual = manualCol(mode);
  await db.execute(
    `UPDATE thread_categories SET ${col} = $3, ${manual} = 1
     WHERE account_id = $1 AND thread_id = $2`,
    [accountId, threadId, category],
  );
}

/**
 * Batch-set categories for AI refinement (respects manual overrides).
 * Only touches the columns for the given mode.
 * Rows must already exist (created during sync via setThreadCategoriesAuto).
 */
export async function setThreadCategoriesBatch(
  accountId: string,
  categories: Map<string, string>,
  mode: CategoryMode,
): Promise<void> {
  const db = await getDb();
  const col = catCol(mode);
  const manual = manualCol(mode);
  for (const [threadId, cat] of categories) {
    await db.execute(
      `UPDATE thread_categories SET ${col} = $3
       WHERE account_id = $1 AND thread_id = $2 AND ${manual} = 0`,
      [accountId, threadId, cat],
    );
  }
}

export async function getCategoryUnreadCounts(
  accountId: string,
  mode: CategoryMode,
): Promise<Map<string, number>> {
  const db = await getDb();
  const col = catCol(mode);
  const rows = await db.select<{ category: string | null; count: number }[]>(
    `SELECT tc.${col} as category, COUNT(*) as count
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     LEFT JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id
     WHERE t.account_id = $1 AND tl.label_id = 'INBOX' AND t.is_read = 0
     GROUP BY tc.${col}`,
    [accountId],
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    const cat = row.category ?? "Primary";
    map.set(cat, (map.get(cat) ?? 0) + row.count);
  }
  return map;
}

/**
 * Get inbox threads where either category column is NULL/empty (needs categorization).
 */
export async function getUncategorizedInboxThreadIds(
  accountId: string,
  limit = 20,
): Promise<{ id: string; subject: string; snippet: string; fromAddress: string }[]> {
  const db = await getDb();
  return db.select(
    `SELECT t.id, t.subject, t.snippet, m.from_address as fromAddress
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
     LEFT JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id
     WHERE t.account_id = $1 AND tl.label_id = 'INBOX'
       AND (tc.thread_id IS NULL OR COALESCE(tc.category, '') = '' OR COALESCE(tc.three_split_category, '') = '')
     ORDER BY t.last_message_at DESC
     LIMIT $2`,
    [accountId, limit],
  );
}
