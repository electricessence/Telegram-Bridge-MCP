/**
 * Generic two-lane priority queue with waiter support.
 *
 * Response lane (reactions, callbacks) drains before message lane
 * (user messages, commands, media). Extracted from message-store.ts
 * so each session can own its own queue instance.
 *
 * Design:
 *   - Two lanes with configurable max size (default 5 000)
 *   - Voice-ready filtering via injectable `isReady` predicate
 *   - Consumed-ID tracking for dequeued items
 *   - Waiter mechanism for blocking dequeue callers
 */

import Queue from "@tsdotnet/queue";

// ---------------------------------------------------------------------------
// TwoLaneQueue
// ---------------------------------------------------------------------------

export interface TwoLaneQueueOptions<T> {
  /** Maximum items per lane. Default 5 000. */
  maxSize?: number;
  /** Return false to keep the item queued (e.g. voice pending transcription). */
  isReady?: (item: T) => boolean;
  /** Extract a numeric ID for consumed-tracking. Return 0 to skip tracking. */
  getId?: (item: T) => number;
}

const DEFAULT_MAX_SIZE = 5000;

export class TwoLaneQueue<T> {
  private readonly _responseLane = new Queue<T>();
  private readonly _messageLane = new Queue<T>();
  private readonly _consumedIds = new Set<number>();
  private _waiters: Array<() => void> = [];
  private readonly _maxSize: number;
  private readonly _isReady: (item: T) => boolean;
  private readonly _getId: (item: T) => number;

  constructor(options?: TwoLaneQueueOptions<T>) {
    this._maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE;
    this._isReady = options?.isReady ?? (() => true);
    this._getId = options?.getId ?? (() => 0);
  }

  // -------------------------------------------------------------------------
  // Enqueue
  // -------------------------------------------------------------------------

  /** Add to the high-priority response lane (reactions, callbacks). */
  enqueueResponse(item: T): void {
    this._capLane(this._responseLane);
    this._responseLane.enqueue(item);
    this._notifyWaiters();
  }

  /** Add to the normal-priority message lane (messages, commands). */
  enqueueMessage(item: T): void {
    this._capLane(this._messageLane);
    this._messageLane.enqueue(item);
    this._notifyWaiters();
  }

  // -------------------------------------------------------------------------
  // Dequeue
  // -------------------------------------------------------------------------

  /** Next ready item — response lane first. Skips not-ready items. */
  dequeue(): T | undefined {
    const item = this._dequeueReady(this._responseLane)
      ?? this._dequeueReady(this._messageLane);
    if (item) this._trackConsumed(item);
    return item;
  }

  /**
   * Batch dequeue: drain all ready response-lane items, then up to one
   * ready message-lane item. Returns empty array if nothing available.
   */
  dequeueBatch(): T[] {
    const batch: T[] = [];

    let resp: T | undefined;
    while ((resp = this._dequeueReady(this._responseLane)) !== undefined) {
      this._trackConsumed(resp);
      batch.push(resp);
    }

    const msg = this._dequeueReady(this._messageLane);
    if (msg) {
      this._trackConsumed(msg);
      batch.push(msg);
    }

    return batch;
  }

  /**
   * Find and remove the first item matching the predicate (response lane
   * first). Returns the predicate's result, or undefined if no match.
   * Notifies waiters on match (items may exist in the other lane).
   */
  dequeueMatch<R>(predicate: (item: T) => R | undefined): R | undefined {
    return this._scanAndRemove(this._responseLane, predicate)
      ?? this._scanAndRemove(this._messageLane, predicate);
  }

  // -------------------------------------------------------------------------
  // State queries
  // -------------------------------------------------------------------------

  /** Number of unconsumed items across both lanes. */
  pendingCount(): number {
    return this._responseLane.count + this._messageLane.count;
  }

  /** True if the given ID has been dequeued. */
  isConsumed(id: number): boolean {
    return this._consumedIds.has(id);
  }

  /** True if at least one caller is blocked waiting for data. */
  hasPendingWaiters(): boolean {
    return this._waiters.length > 0;
  }

  /** Promise that resolves when a new item is enqueued. */
  waitForEnqueue(): Promise<void> {
    return new Promise((resolve) => {
      this._waiters.push(resolve);
    });
  }

  // -------------------------------------------------------------------------
  // Public mutation
  // -------------------------------------------------------------------------

  /**
   * Wake all blocked waiters. Call after mutating a queued item in-place
   * (e.g. patchVoiceText filling in transcription text).
   */
  notifyWaiters(): void {
    this._notifyWaiters();
  }

  /** Reset all queue state. For tests only. */
  clear(): void {
    this._responseLane.clear();
    this._messageLane.clear();
    this._consumedIds.clear();
    this._waiters = [];
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Notify all pending waiters and clear the list. */
  private _notifyWaiters(): void {
    const batch = this._waiters;
    this._waiters = [];
    for (const resolve of batch) resolve();
  }

  /** Track a dequeued item's ID in the consumed set. */
  private _trackConsumed(item: T): void {
    const id = this._getId(item);
    if (id > 0) this._consumedIds.add(id);
  }

  /** Drop the oldest item if the lane is at capacity. */
  private _capLane(lane: Queue<T>): void {
    if (lane.count >= this._maxSize) lane.dequeue();
  }

  /** Dequeue the first ready item from a lane, re-enqueue the rest. */
  private _dequeueReady(lane: Queue<T>): T | undefined {
    const items = [...lane.consumer()];
    let found: T | undefined;
    for (const item of items) {
      if (!found && this._isReady(item)) {
        found = item;
        continue;
      }
      lane.enqueue(item);
    }
    return found;
  }

  /** Drain a lane, extract the first match, re-enqueue the rest. */
  private _scanAndRemove<R>(
    lane: Queue<T>,
    predicate: (item: T) => R | undefined,
  ): R | undefined {
    const items = [...lane.consumer()];
    let found: R | undefined;
    let consumedItem: T | undefined;
    for (const item of items) {
      if (found === undefined) {
        const result = predicate(item);
        if (result !== undefined) {
          found = result;
          consumedItem = item;
          continue;
        }
      }
      lane.enqueue(item);
    }
    if (consumedItem) this._trackConsumed(consumedItem);
    if (found !== undefined) this._notifyWaiters();
    return found;
  }
}
