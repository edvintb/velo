import { useCallback, useMemo } from "react";
import { useUIStore } from "@/stores/uiStore";
import { useThreadStore, parseThreadKey } from "@/stores/threadStore";
import {
  ALL_FIVE_SPLIT_CATEGORIES,
  ALL_THREE_SPLIT_CATEGORIES,
  type CategoryMode,
} from "@/services/db/threadCategories";
import { setThreadCategoryManual } from "@/services/db/threadCategories";
import { advanceAndRemoveThreads } from "@/services/emailActions";
import {
  Mail,
  Bell,
  Megaphone,
  Users,
  Newspaper,
  Rss,
  BellRing,
  Search,
} from "lucide-react";
import { ListPickerDialog, type ListPickerItem } from "@/components/ui/ListPickerDialog";

interface MoveToCategoryDialogProps {
  isOpen: boolean;
  threadIds: string[];
  onClose: () => void;
}

const FIVE_SPLIT_ICONS: Record<string, typeof Mail> = {
  Primary: Mail,
  Updates: Bell,
  Promotions: Megaphone,
  Social: Users,
  Newsletters: Newspaper,
};

const THREE_SPLIT_ICONS: Record<string, typeof Mail> = {
  Primary: Mail,
  Feeds: Rss,
  Notifications: BellRing,
};

function getItems(mode: CategoryMode): ListPickerItem[] {
  const categories = mode === "three-split" ? ALL_THREE_SPLIT_CATEGORIES : ALL_FIVE_SPLIT_CATEGORIES;
  const icons = mode === "three-split" ? THREE_SPLIT_ICONS : FIVE_SPLIT_ICONS;
  return categories.map((cat) => {
    const Icon = icons[cat] ?? Mail;
    return {
      id: cat,
      label: cat,
      icon: <Icon size={15} className="text-text-tertiary" />,
    };
  });
}

export function MoveToCategoryDialog({ isOpen, threadIds, onClose }: MoveToCategoryDialogProps) {
  const inboxViewMode = useUIStore((s) => s.inboxViewMode);
  const mode: CategoryMode = inboxViewMode === "three-split" ? "three-split" : "five-split";
  const items = useMemo(() => getItems(mode), [mode]);

  // Resolve sender info from the first thread
  const senderLabel = useMemo(() => {
    if (threadIds.length === 0) return null;
    const threadMap = useThreadStore.getState().threadMap;
    const thread = threadMap.get(threadIds[0]!);
    if (!thread) return null;
    if (threadIds.length > 1) {
      return `${threadIds.length} threads`;
    }
    if (thread.fromName && thread.fromAddress) {
      return `${thread.fromName} <${thread.fromAddress}>`;
    }
    return thread.fromName ?? thread.fromAddress ?? null;
  }, [threadIds]);

  const handleSelect = useCallback(
    async (item: ListPickerItem) => {
      if (threadIds.length === 0) return;
      onClose();

      const threadMap = useThreadStore.getState().threadMap;
      for (const threadId of threadIds) {
        const thread = threadMap.get(threadId);
        const acctId = thread?.accountId ?? parseThreadKey(threadId).accountId;
        const realThreadId = parseThreadKey(threadId).threadId;
        await setThreadCategoryManual(acctId, realThreadId, item.id, mode);
      }

      // Remove from current view and advance focus
      advanceAndRemoveThreads(threadIds);
      window.dispatchEvent(new Event("velo-sync-done"));
    },
    [threadIds, mode, onClose],
  );

  return (
    <ListPickerDialog
      isOpen={isOpen}
      onClose={onClose}
      onSelect={handleSelect}
      items={items}
      searchable
      searchPlaceholder="Categorize as..."
      header={<Search size={16} className="text-text-tertiary shrink-0" />}
      info={senderLabel}
    />
  );
}
