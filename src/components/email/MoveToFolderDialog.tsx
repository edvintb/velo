import { useCallback, useMemo } from "react";
import { useLabelStore } from "@/stores/labelStore";
import { useAccountStore, ALL_ACCOUNTS_ID } from "@/stores/accountStore";
import { useThreadStore, parseThreadKey } from "@/stores/threadStore";
import {
  archiveThread,
  trashThread,
  spamThread,
  addThreadLabel,
  removeThreadLabel,
  moveThread,
} from "@/services/emailActions";
import {
  Inbox,
  Archive,
  Trash2,
  Ban,
  Search,
  Tag,
} from "lucide-react";
import { ListPickerDialog, type ListPickerItem } from "@/components/ui/ListPickerDialog";

interface MoveToFolderDialogProps {
  isOpen: boolean;
  threadIds: string[];
  onClose: () => void;
}

interface FolderItem extends ListPickerItem {
  type: "system" | "label";
}

const SYSTEM_DESTINATIONS: FolderItem[] = [
  { id: "INBOX", label: "Inbox", icon: <Inbox size={15} className="text-text-tertiary" />, type: "system" },
  { id: "__archive__", label: "Archive", icon: <Archive size={15} className="text-text-tertiary" />, type: "system" },
  { id: "TRASH", label: "Trash", icon: <Trash2 size={15} className="text-text-tertiary" />, type: "system" },
  { id: "SPAM", label: "Spam", icon: <Ban size={15} className="text-text-tertiary" />, type: "system" },
];

export function MoveToFolderDialog({
  isOpen,
  threadIds,
  onClose,
}: MoveToFolderDialogProps) {
  const labels = useLabelStore((s) => s.labels);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccountStore((s) => s.accounts);

  const effectiveAccountId = activeAccountId === ALL_ACCOUNTS_ID ? (accounts[0]?.id ?? null) : activeAccountId;

  const items = useMemo(() => {
    const userLabels: FolderItem[] = labels.map((l) => ({
      id: l.id,
      label: l.name,
      icon: <Tag size={15} className="text-accent" />,
      type: "label" as const,
    }));
    return [...SYSTEM_DESTINATIONS, ...userLabels];
  }, [labels]);

  const handleSelect = useCallback(
    async (item: ListPickerItem) => {
      if (!effectiveAccountId || threadIds.length === 0) return;
      onClose();

      const dest = item as FolderItem;
      const threadMap = useThreadStore.getState().threadMap;
      for (const key of threadIds) {
        const thread = threadMap.get(key);
        const { accountId: acctId, threadId: tid } = parseThreadKey(key);
        const threadIsImap = accounts.find((a) => a.id === acctId)?.provider === "imap";

        if (dest.id === "__archive__") {
          await archiveThread(acctId, tid, []);
        } else if (dest.id === "TRASH") {
          await trashThread(acctId, tid, []);
        } else if (dest.id === "SPAM") {
          await spamThread(acctId, tid, [], true);
        } else if (dest.id === "INBOX") {
          if (threadIsImap) {
            await moveThread(acctId, tid, [], "INBOX");
          } else {
            await addThreadLabel(acctId, tid, "INBOX");
          }
        } else if (dest.type === "label") {
          if (threadIsImap) {
            await moveThread(acctId, tid, [], dest.id);
          } else {
            await addThreadLabel(acctId, tid, dest.id);
            if (thread?.labelIds.includes("INBOX")) {
              await removeThreadLabel(acctId, tid, "INBOX");
            }
          }
        }
      }

      window.dispatchEvent(new Event("velo-sync-done"));
    },
    [effectiveAccountId, threadIds, accounts, onClose],
  );

  return (
    <ListPickerDialog
      isOpen={isOpen}
      onClose={onClose}
      onSelect={handleSelect}
      items={items}
      searchable
      searchPlaceholder="Move to..."
      header={<Search size={16} className="text-text-tertiary shrink-0" />}
    />
  );
}
