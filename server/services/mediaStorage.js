import MediaSettings from '../models/MediaSettings.js';

const SETTINGS_ID = 'assets';

const cleanBaseUrl = (value) => {
    if (typeof value !== 'string' || !value.trim()) return '';
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error('Базова адреса має бути HTTPS URL без логіна, параметрів і фрагмента');
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}/`;
};

const getDefaultBaseUrl = () => {
    try {
        return cleanBaseUrl(process.env.R2_PUBLIC_BASE_URL ?? '');
    } catch {
        return '';
    }
};

const publicSettings = (settings) => ({
    assetBaseUrl: settings.assetBaseUrl ?? getDefaultBaseUrl(),
    previousAssetBaseUrl: settings.previousAssetBaseUrl ?? '',
    assetBaseUrlHistory: settings.assetBaseUrlHistory ?? [],
});

export const getMediaSettings = async () => {
    const settings = await MediaSettings.findById(SETTINGS_ID).lean();
    return publicSettings(settings ?? {});
};

export const setAssetBaseUrl = async (value) => {
    const assetBaseUrl = cleanBaseUrl(value);
    const current = await MediaSettings.findById(SETTINGS_ID);
    const currentBaseUrl = current?.assetBaseUrl || getDefaultBaseUrl();
    const baseUrlHistory = new Set(current?.assetBaseUrlHistory ?? []);
    if (currentBaseUrl) baseUrlHistory.add(currentBaseUrl);
    if (assetBaseUrl) baseUrlHistory.add(assetBaseUrl);

    const settings = await MediaSettings.findOneAndUpdate(
        { _id: SETTINGS_ID },
        {
            $set: {
                assetBaseUrl,
                previousAssetBaseUrl: currentBaseUrl === assetBaseUrl ? current?.previousAssetBaseUrl ?? '' : currentBaseUrl,
                assetBaseUrlHistory: [...baseUrlHistory],
            },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    return publicSettings(settings);
};

export const restorePreviousAssetBaseUrl = async () => {
    const settings = await MediaSettings.findById(SETTINGS_ID);
    if (!settings?.previousAssetBaseUrl) return null;

    const currentBaseUrl = settings.assetBaseUrl || getDefaultBaseUrl();
    const previousAssetBaseUrl = settings.previousAssetBaseUrl;
    const baseUrlHistory = new Set(settings.assetBaseUrlHistory ?? []);
    if (currentBaseUrl) baseUrlHistory.add(currentBaseUrl);
    baseUrlHistory.add(previousAssetBaseUrl);
    settings.assetBaseUrl = previousAssetBaseUrl;
    settings.previousAssetBaseUrl = currentBaseUrl;
    settings.assetBaseUrlHistory = [...baseUrlHistory];
    await settings.save();
    return publicSettings(settings);
};

const getKnownBaseUrls = (settings) => [
    settings.assetBaseUrl,
    settings.previousAssetBaseUrl,
    ...(settings.assetBaseUrlHistory ?? []),
    getDefaultBaseUrl(),
].filter(Boolean);

export const normalizeAssetSource = (source, settings) => {
    if (typeof source !== 'string' || !source.trim()) return source;
    const value = source.trim();
    if (value.startsWith('/')) return value;
    if (/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(value) && !value.split('/').includes('..')) {
        return `/${value}`;
    }

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        return value;
    }

    for (const baseUrl of getKnownBaseUrls(settings)) {
        const base = new URL(baseUrl);
        if (parsed.origin !== base.origin) continue;
        const basePath = base.pathname.replace(/\/+$/, '');
        const imagePath = basePath && parsed.pathname.startsWith(`${basePath}/`)
            ? parsed.pathname.slice(basePath.length)
            : parsed.pathname;
        return `/${imagePath.replace(/^\/+/, '')}`;
    }
    if (parsed.hostname.endsWith('.r2.dev') && (settings.assetBaseUrl || getDefaultBaseUrl())) {
        return `/${parsed.pathname.replace(/^\/+/, '')}`;
    }
    return value;
};

export const resolveAssetSource = (source, settings) => {
    const normalized = normalizeAssetSource(source, settings);
    if (typeof normalized !== 'string' || !normalized.startsWith('/') || normalized.startsWith('/assets/')) {
        return normalized;
    }
    const baseUrl = settings.assetBaseUrl || getDefaultBaseUrl();
    return baseUrl ? `${baseUrl}${normalized.slice(1)}` : normalized;
};

export const resolveGameItemImages = (item, settings) => ({
    ...item,
    ...(item.shopImage ? { shopImage: resolveAssetSource(item.shopImage, settings) } : {}),
    ...(item.yieldImage ? { yieldImage: resolveAssetSource(item.yieldImage, settings) } : {}),
    ...(item.growthImages ? { growthImages: item.growthImages.map((source) => resolveAssetSource(source, settings)) } : {}),
});
