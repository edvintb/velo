import { useThreadStore, threadKey, type Thread } from "@/stores/threadStore";
import { navigateToThread, getSelectedThreadId } from "@/router/navigate";
import type { EmailAction } from "./emailActions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UndoItem {
  accountId: string;
  /** Thread snapshot + list index for restoring removed threads */
  snapshot?: { thread: Thread; index: number };
  /** Reverse action to execute via executeEmailAction */
  reverseAction?: EmailAction;
  /** Custom undo for actions that bypass emailActions (category, pin, mute) */
  customUndo?: () => Promise<void>;
}

export interface UndoEntry {
  items: UndoItem[];
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const MAX_UNDO_DEPTH = 20;
const undoStack: UndoEntry[] = [];

/** Batch accumulator — when non-null, items are collected into this entry */
let batchEntry: UndoEntry | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function pushUndo(entry: UndoEntry): void {
  if (entry.items.length === 0) return;
  undoStack.push(entry);
  if (undoStack.length > MAX_UNDO_DEPTH) {
    undoStack.shift();
  }
}

export function popUndo(): UndoEntry | undefined {
  return undoStack.pop();
}

export function beginBatch(): void {
  batchEntry = { items: [] };
}

export function endBatch(): void {
  if (batchEntry && batchEntry.items.length > 0) {
    pushUndo(batchEntry);
  }
  batchEntry = null;
}

export function addUndoItem(item: UndoItem): void {
  if (batchEntry) {
    batchEntry.items.push(item);
  } else {
    pushUndo({ items: [item] });
  }
}

/**
 * Capture a thread snapshot (object + list index) before it's removed.
 */
export function captureThreadSnapshot(
  accountId: string,
  threadId: string,
): { thread: Thread; index: number } | undefined {
  const store = useThreadStore.getState();
  const key = threadKey({ accountId, id: threadId });
  const thread = store.threadMap.get(key);
  if (!thread) return undefined;
  const index = store.threads.findIndex((t) => threadKey(t) === key);
  return { thread: { ...thread }, index: index === -1 ? 0 : index };
}

// ---------------------------------------------------------------------------
// Undo execution
// ---------------------------------------------------------------------------

/** Module-level flag to prevent undo actions from being re-captured */
let _isUndo = false;

export function getIsUndo(): boolean {
  return _isUndo;
}

export async function executeUndo(): Promise<void> {
  const entry = popUndo();
  if (!entry) return;

  _isUndo = true;
  try {
    // First pass: restore snapshots (re-insert threads into the list)
    let restoredAny = false;
    for (const item of entry.items) {
      if (item.snapshot) {
        const store = useThreadStore.getState();
        const key = threadKey(item.snapshot.thread);
        // Only re-insert if not already present
        if (!store.threadMap.has(key)) {
          store.insertThread(item.snapshot.thread, item.snapshot.index);
          restoredAny = true;
        }
      }
    }

    // Navigate to the first restored thread if we restored any
    if (restoredAny && entry.items[0]?.snapshot) {
      const firstThread = entry.items[0].snapshot.thread;
      const firstKey = threadKey(firstThread);
      // Only navigate if nothing is currently selected
      if (!getSelectedThreadId()) {
        navigateToThread(firstKey);
      }
    }

    // Second pass: execute reverse actions / custom undos
    const { executeEmailAction } = await import("./emailActions");
    for (const item of entry.items) {
      if (item.customUndo) {
        await item.customUndo();
      } else if (item.reverseAction) {
        await executeEmailAction(item.accountId, item.reverseAction);
      }
    }
  } finally {
    _isUndo = false;
  }
}
