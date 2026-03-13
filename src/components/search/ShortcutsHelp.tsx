import { useMemo } from "react";
import { SHORTCUTS, type ShortcutItem } from "@/constants/shortcuts";
import { useShortcutStore } from "@/stores/shortcutStore";
import { useUIStore } from "@/stores/uiStore";
import { Modal } from "@/components/ui/Modal";

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

/** IDs only relevant in five-split mode */
const FIVE_SPLIT_ONLY = new Set(["nav.goUpdates", "nav.goPromotions", "nav.goSocial"]);
/** IDs only relevant in three-split mode */
const THREE_SPLIT_ONLY = new Set(["nav.goFeeds"]);
/** IDs relevant in any split mode but not unified */
const SPLIT_ONLY = new Set(["nav.goPrimary", "nav.goNewsletters", "action.categorize"]);

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
  const keyMap = useShortcutStore((s) => s.keyMap);
  const mode = useUIStore((s) => s.inboxViewMode);

  const sections = useMemo(() => {
    return SHORTCUTS.map((section) => {
      const items = section.items.flatMap((item): ShortcutItem[] => {
        // Category nav / categorize action: hidden in unified mode
        if (SPLIT_ONLY.has(item.id) || FIVE_SPLIT_ONLY.has(item.id) || THREE_SPLIT_ONLY.has(item.id)) {
          if (mode === "unified") return [];
        }
        // Five-split-only items hidden in three-split
        if (FIVE_SPLIT_ONLY.has(item.id) && mode !== "five-split") return [];
        // Three-split-only items hidden in five-split
        if (THREE_SPLIT_ONLY.has(item.id) && mode !== "three-split") return [];
        // Adjust description for the merged newsletters/notifications shortcut
        if (item.id === "nav.goNewsletters") {
          const desc = mode === "three-split" ? "Go to Notifications" : "Go to Newsletters";
          return [{ ...item, desc }];
        }
        return [item];
      });
      return { ...section, items };
    }).filter((section) => section.items.length > 0);
  }, [mode]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keyboard Shortcuts" width="w-full max-w-lg" zIndex="z-[60]">
      <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
        {sections.map((section) => (
          <div key={section.category}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              {section.category}
            </h3>
            <div className="space-y-1">
              {section.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-1"
                >
                  <span className="text-sm text-text-secondary">
                    {item.desc}
                  </span>
                  <kbd className="text-xs text-text-tertiary bg-bg-tertiary px-2 py-0.5 rounded font-mono">
                    {keyMap[item.id] ?? item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
