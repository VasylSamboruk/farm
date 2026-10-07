import GiftShopItem from '../models/GiftShopItem.js';
import { getGameItem, listGameItems } from './gameCatalog.js';
import { getMediaSettings, resolveGameItemImages } from './mediaStorage.js';

export const ensureGiftShopDefaults = async () => {
    const defaults = listGameItems()
        .filter((item) => item.giftOnly)
        .map((item) => ({
            itemId: item.id,
            price: item.price,
            priceCurrency: item.priceCurrency ?? 'coins',
            enabled: true,
        }));
    if (!defaults.length) return;
    await GiftShopItem.bulkWrite(defaults.map((item) => ({
        updateOne: {
            filter: { itemId: item.itemId },
            update: { $setOnInsert: item },
            upsert: true,
        },
    })));
};

export const listGiftShopItems = async ({ includeDisabled = false } = {}) => {
    await ensureGiftShopDefaults();
    const settings = await getMediaSettings();
    const records = await GiftShopItem.find(includeDisabled ? {} : { enabled: true }).sort({ createdAt: 1 }).lean();
    return records.flatMap((record) => {
        const item = getGameItem(record.itemId);
        if (!item?.giftOnly || (!includeDisabled && item.disabled)) return [];
        const resolved = resolveGameItemImages(item, settings);
        return [{
            itemId: item.id,
            name: item.name,
            type: item.type,
            image: resolved.shopImage ?? resolved.growthImages?.at(-1) ?? '',
            icon: item.shopIcon ?? '',
            price: record.price,
            priceCurrency: record.priceCurrency,
            enabled: record.enabled,
        }];
    });
};
