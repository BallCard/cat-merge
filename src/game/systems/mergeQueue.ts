export type PendingMerge = {
  leftId: string;
  rightId: string;
  resultLevel: number;
  scoreGained: number;
  key: string;
};

export type MergeQueue = {
  items: PendingMerge[];
};

export function createMergeQueue(): MergeQueue {
  return { items: [] };
}

export function enqueueMergePair(
  queue: MergeQueue,
  leftId: string,
  rightId: string,
  resultLevel: number,
  scoreGained: number
): MergeQueue {
  const normalized = [leftId, rightId].sort();
  const key = `${normalized[0]}::${normalized[1]}`;

  if (queue.items.some((item) => item.key === key)) {
    return queue;
  }

  return {
    items: [...queue.items, { leftId: normalized[0], rightId: normalized[1], resultLevel, scoreGained, key }]
  };
}

export function shiftNextMerge(queue: MergeQueue): { queue: MergeQueue; next: PendingMerge | null } {
  if (queue.items.length === 0) {
    return { queue, next: null };
  }

  const [next, ...rest] = queue.items;
  return {
    queue: { items: rest },
    next
  };
}
