export type PricingCategory = 'TREE' | 'CROP' | 'ANIMAL';

export interface PricingReferenceItem {
  id: string;
  name: string;
  type: PricingCategory | string;
  price: number;
  productionTimeMs?: number | null;
  yieldItem?: string;
  yieldName?: string;
  sellPrice?: number | null;
  disabled?: boolean;
}

export interface PricingReference {
  item: PricingReferenceItem;
  timeDistance: number;
  estimatedPrice: number;
  estimatedSellPrice: number;
}

export interface PricingEstimate {
  price: number;
  sellPrice: number;
  references: PricingReference[];
  exactTimeMatch: boolean;
}

const roundPrice = (value: number) => Math.max(0, Math.round(value));
const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

export const estimateItemPricing = (
  items: PricingReferenceItem[],
  category: PricingCategory,
  productionTimeMs: number
): PricingEstimate | null => {
  if (!Number.isSafeInteger(productionTimeMs) || productionTimeMs < 1_000) return null;

  const references = items.filter((item) =>
    item.type === category &&
    !item.disabled &&
    item.yieldItem &&
    Number.isSafeInteger(item.productionTimeMs) &&
    (item.productionTimeMs ?? 0) > 0 &&
    Number.isSafeInteger(item.price) &&
    Number.isSafeInteger(item.sellPrice) &&
    (item.sellPrice ?? -1) >= 0
  );
  if (references.length === 0) return null;

  const exactMatches = references.filter((item) => item.productionTimeMs === productionTimeMs);
  const exactTimeMatch = exactMatches.length > 0;
  const selected = exactTimeMatch
    ? exactMatches
    : references
      .map((item) => ({
        item,
        timeDistance: Math.abs(Math.log(productionTimeMs / (item.productionTimeMs ?? productionTimeMs))),
      }))
      .sort((left, right) => left.timeDistance - right.timeDistance)
      .slice(0, 3);

  const weighted = selected.map((entry) => {
    const item = 'item' in entry ? entry.item : entry;
    const timeDistance = 'timeDistance' in entry
      ? entry.timeDistance
      : 0;
    const timeScale = exactTimeMatch ? 1 : Math.sqrt(productionTimeMs / (item.productionTimeMs ?? productionTimeMs));
    const weight = exactTimeMatch ? 1 : 1 / (0.15 + timeDistance);
    return {
      item,
      timeDistance,
      weight,
      estimatedPrice: (item.price ?? 0) * timeScale,
      estimatedSellPrice: (item.sellPrice ?? 0) * timeScale,
    };
  });
  const weightTotal = weighted.reduce((total, entry) => total + entry.weight, 0);
  const price = weighted.reduce((total, entry) => total + entry.estimatedPrice * entry.weight, 0) / weightTotal;
  const sellPrice = weighted.reduce((total, entry) => total + entry.estimatedSellPrice * entry.weight, 0) / weightTotal;

  return {
    price: roundPrice(exactTimeMatch ? median(weighted.map((entry) => entry.estimatedPrice)) : price),
    sellPrice: roundPrice(exactTimeMatch ? median(weighted.map((entry) => entry.estimatedSellPrice)) : sellPrice),
    references: weighted.map(({ item, timeDistance, estimatedPrice, estimatedSellPrice }) => ({
      item,
      timeDistance,
      estimatedPrice: roundPrice(estimatedPrice),
      estimatedSellPrice: roundPrice(estimatedSellPrice),
    })),
    exactTimeMatch,
  };
};
