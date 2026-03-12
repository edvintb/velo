import { useCallback } from "react";
import { insertFilter } from "@/services/db/filters";
import { Ban, X } from "lucide-react";
import { ListPickerDialog, type ListPickerItem } from "@/components/ui/ListPickerDialog";

interface AlwaysSpamDialogProps {
  isOpen: boolean;
  senderAddress: string | null;
  accountId: string | null;
  onClose: () => void;
}

const OPTIONS: ListPickerItem[] = [
  { id: "dismiss", label: "No, just this once", icon: <X size={15} className="text-text-tertiary" /> },
  { id: "always", label: "Yes, always mark as spam", icon: <Ban size={15} className="text-danger" /> },
];

export function AlwaysSpamDialog({
  isOpen,
  senderAddress,
  accountId,
  onClose,
}: AlwaysSpamDialogProps) {
  const handleSelect = useCallback(
    async (item: ListPickerItem) => {
      if (item.id === "always" && accountId && senderAddress) {
        try {
          await insertFilter({
            accountId,
            name: `Always spam: ${senderAddress}`,
            criteria: { from: senderAddress },
            actions: { spam: true },
          });
        } catch (err) {
          console.error("Failed to create spam filter:", err);
        }
      }
      onClose();
    },
    [accountId, senderAddress, onClose],
  );

  return (
    <ListPickerDialog
      isOpen={isOpen}
      onClose={onClose}
      onSelect={handleSelect}
      items={OPTIONS}
      header={
        <>
          <Ban size={16} className="text-danger shrink-0" />
          <span className="text-sm text-text-primary">
            Always mark <span className="font-medium">{senderAddress ?? "this sender"}</span> as spam?
          </span>
        </>
      }
    />
  );
}
