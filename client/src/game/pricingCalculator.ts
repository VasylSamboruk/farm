export type PricingCategory = 'ALL' | 'TREE' | 'CROP' | 'ANIMAL';

export interface PricingReferenceItem {
  id: string;
  name: string;
  type: PricingCategory | string;
  price: number;
  productionTimeMs?: number | null;
  yieldItem?: string;
  yieldName?: string;
  yieldAmount?: number;
  sellPrice?: number | null;
  priceCurrency?: 'coins' | 'rubies';
  disabled?: boolean;
}

export interface PricingReference {
  item: PricingReferenceItem;
  timeDistance: number;
  estimatedPrice: number;
  estimatedSellPrice: number;
  estimatedCycleRevenue: number;
}

export interface PricingEstimate {
  price: number;
  sellPrice: number;
  cycleRevenue: number;
  referenceCycleRevenue: number;
  recoveryCycleRevenue: number;
  yieldAmount: number;
  baselineProductionTimeMs: number;
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
  productionTimeMs: number,
  yieldAmount = 1,
  plantingPriceOverride?: number,
  markupPercent = 100
): PricingEstimate | null => {
  if (!Number.isSafeInteger(productionTimeMs) || productionTimeMs < 1_000 ||
      !Number.isSafeInteger(yieldAmount) || yieldAmount < 1 || yieldAmount > 100_000 ||
      !Number.isFinite(markupPercent) || markupPercent <= 0 ||
      (plantingPriceOverride !== undefined && (!Number.isSafeInteger(plantingPriceOverride) || plantingPriceOverride < 0))) return null;

  const references = items.filter((item) =>
    (category === 'ALL' || item.type === category) &&
    !item.disabled &&
    item.priceCurrency !== 'rubies' &&
    item.yieldItem &&
    Number.isSafeInteger(item.productionTimeMs) &&
    (item.productionTimeMs ?? 0) > 0 &&
    Number.isSafeInteger(item.price) &&
    Number.isSafeInteger(item.sellPrice) &&
    (item.sellPrice ?? -1) >= 0 &&
    Number.isSafeInteger(item.yieldAmount ?? 1) && (item.yieldAmount ?? 1) > 0
  );
  if (references.length === 0) return null;

  const exactTimeMatch = references.some((item) => item.productionTimeMs === productionTimeMs);
  const baselineProductionTimeMs = median(references.map((item) => item.productionTimeMs ?? productionTimeMs));
  const referenceData = references.map((item) => {
    const referenceTime = item.productionTimeMs ?? productionTimeMs;
    const timeDistance = Math.abs(Math.log(productionTimeMs / referenceTime));
    const timeScale = Math.sqrt(productionTimeMs / referenceTime);
    const weight = exactTimeMatch ? (referenceTime === productionTimeMs ? 1 : 0) : 1 / (0.2 + timeDistance ** 2);
    return {
      item,
      timeDistance,
      weight,
      estimatedPrice: item.price * timeScale,
      estimatedCycleRevenue: (item.sellPrice ?? 0) * (item.yieldAmount ?? 1) * timeScale,
    };
  });
  const weighted = exactTimeMatch ? referenceData.filter((entry) => entry.weight > 0) : referenceData;
  const weightTotal = weighted.reduce((total, entry) => total + entry.weight, 0);
  const estimatedPlantingPrice = weighted.reduce((total, entry) => total + entry.estimatedPrice * entry.weight, 0) / weightTotal;
  const referenceCycleRevenue = weighted.reduce((total, entry) => total + entry.estimatedCycleRevenue * entry.weight, 0) / weightTotal * markupPercent / 100;
  const price = plantingPriceOverride ?? roundPrice(estimatedPlantingPrice * markupPercent / 100);
  const recoveryCycleRevenue = price / 4;
  const cycleRevenue = Math.max(referenceCycleRevenue, recoveryCycleRevenue);
  const sellPrice = Math.ceil(cycleRevenue / yieldAmount);

  return {
    price,
    sellPrice: roundPrice(sellPrice),
    cycleRevenue: roundPrice(cycleRevenue),
    referenceCycleRevenue: roundPrice(referenceCycleRevenue),
    recoveryCycleRevenue: roundPrice(recoveryCycleRevenue),
    yieldAmount,
    baselineProductionTimeMs,
    references: referenceData
      .sort((left, right) => left.timeDistance - right.timeDistance)
      .map(({ item, timeDistance, estimatedPrice, estimatedCycleRevenue }) => ({
      item,
      timeDistance,
      estimatedPrice: roundPrice(estimatedPrice),
      estimatedCycleRevenue: roundPrice(estimatedCycleRevenue),
      estimatedSellPrice: roundPrice((item.sellPrice ?? 0) * Math.sqrt(productionTimeMs / (item.productionTimeMs ?? productionTimeMs))),
    })),
    exactTimeMatch,
  };
};
