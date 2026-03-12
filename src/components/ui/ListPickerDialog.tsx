import { useState, useRef, useCallback, type ReactNode } from "react";
import { CSSTransition } from "react-transition-group";

export interface ListPickerItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface ListPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: ListPickerItem) => void;
  items: ListPickerItem[];
  /** Header content shown above the list */
  header: ReactNode;
  /** Whether to show a search input. If true, items are filtered by label. */
  searchable?: boolean;
  /** Placeholder text for the search input */
  searchPlaceholder?: string;
  /** Info line shown between header and list (e.g. sender name) */
  info?: ReactNode;
}

export function ListPickerDialog({
  isOpen,
  onClose,
  onSelect,
  items,
  header,
  searchable = false,
  searchPlaceholder = "Search...",
  info,
}: ListPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = searchable && query.trim()
    ? items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : items;

  const scrollToIndex = (index: number) => {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[index] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: "nearest" });
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        setSelectedIdx((prev) => {
          const next = (prev + 1) % filtered.length;
          scrollToIndex(next);
          return next;
        });
      } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        setSelectedIdx((prev) => {
          const next = (prev - 1 + filtered.length) % filtered.length;
          scrollToIndex(next);
          return next;
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[selectedIdx];
        if (item) onSelect(item);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIdx, onSelect, onClose],
  );

  const handleEntered = () => {
    setQuery("");
    setSelectedIdx(0);
    if (searchable) {
      inputRef.current?.focus();
    } else {
      overlayRef.current?.querySelector<HTMLDivElement>("[data-picker-panel]")?.focus();
    }
  };

  return (
    <CSSTransition
      in={isOpen}
      timeout={150}
      classNames="modal"
      unmountOnExit
      nodeRef={overlayRef}
      onEntered={handleEntered}
    >
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="glass-backdrop absolute inset-0" />
        <div
          data-picker-panel
          tabIndex={-1}
          className="relative bg-bg-primary border border-border-primary rounded-lg glass-modal w-full max-w-md overflow-hidden outline-none"
          onKeyDown={handleKeyDown}
        >
          {/* Header */}
          {searchable ? (
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-secondary">
              {header}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIdx(0);
                }}
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
                autoFocus
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-secondary">
              {header}
            </div>
          )}

          {/* Optional info line */}
          {info && (
            <div className="px-3 py-1.5 border-b border-border-secondary text-xs text-text-tertiary truncate">
              {info}
            </div>
          )}

          {/* Item list */}
          <div
            ref={listRef}
            className="max-h-64 overflow-y-auto py-1"
            role="listbox"
          >
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-text-tertiary">
                No matches
              </div>
            )}
            {filtered.map((item, idx) => {
              const isSelected = idx === selectedIdx;
              return (
                <button
                  key={item.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-left cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-bg-selected text-text-primary"
                      : "text-text-secondary hover:bg-bg-hover"
                  }`}
                  onClick={() => onSelect(item)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border-secondary text-[10px] text-text-tertiary">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-bg-tertiary text-text-tertiary">
                ↑↓
              </kbd>{" "}
              navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-bg-tertiary text-text-tertiary">
                ↵
              </kbd>{" "}
              select
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-bg-tertiary text-text-tertiary">
                esc
              </kbd>{" "}
              dismiss
            </span>
          </div>
        </div>
      </div>
    </CSSTransition>
  );
}
