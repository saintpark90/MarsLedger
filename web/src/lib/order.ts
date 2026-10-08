export function bySort<T extends { sort?: number }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => (left.item.sort ?? left.index) - (right.item.sort ?? right.index) || left.index - right.index)
    .map((entry) => entry.item);
}
