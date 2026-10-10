import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import GameItemPrice from '../models/GameItemPrice.js';
import { GAME_ITEMS } from '../config/gameItems/index.js';

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectDirectory = path.dirname(serverDirectory);
const recommendationsPath = path.join(projectDirectory, 'farm-economy-recommendations.csv');
const rollbackDirectory = path.join(serverDirectory, 'economy-rollbacks');
const fields = ['price', 'config.price', 'sellPrice', 'config.sellPrice', 'config.priceCurrency', 'config.productionTimeMs'];

dotenv.config({ path: path.join(serverDirectory, '.env') });

const parseDelimitedLine = (line) => {
    const cells = [];
    let cell = '';
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
            if (quoted && line[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === ';' && !quoted) {
            cells.push(cell);
            cell = '';
        } else {
            cell += character;
        }
    }

    if (quoted) throw new Error('Некоректний CSV: незакрите поле в лапках.');
    cells.push(cell);
    return cells;
};

const parseRecommendations = (contents) => {
    const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error('CSV рекомендацій не містить товарів.');

    const headers = parseDelimitedLine(lines[0]);
    const seenIds = new Set();
    const recommendations = lines.slice(1).map((line, index) => {
        const rowNumber = index + 2;
        const cells = parseDelimitedLine(line);
        if (cells.length !== headers.length) {
            throw new Error(`Рядок CSV ${rowNumber}: очікувалося ${headers.length} колонок, отримано ${cells.length}.`);
        }
        const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex].trim()]));
        const itemId = row['ID у сервері'];
        if (!itemId || seenIds.has(itemId)) throw new Error(`Рядок CSV ${rowNumber}: порожній або повторний ID товару.`);
        seenIds.add(itemId);

        const currencyLabel = row['Рекомендована валюта покупки'];
        const priceCurrency = currencyLabel === 'Монети' ? 'coins' : currencyLabel === 'Рубіни' ? 'rubies' : null;
        if (!priceCurrency) throw new Error(`Рядок CSV ${rowNumber}: невідома валюта «${currencyLabel}».`);

        const parseAmount = (value, label) => {
            if (!/^\d+$/.test(value)) throw new Error(`Рядок CSV ${rowNumber}: некоректне значення «${label}».`);
            const amount = Number(value);
            if (!Number.isSafeInteger(amount)) throw new Error(`Рядок CSV ${rowNumber}: значення «${label}» завелике.`);
            return amount;
        };

        const update = {
            price: parseAmount(row['Рекомендована ціна покупки'], 'ціна покупки'),
            priceCurrency,
        };
        const recommendedSellPrice = row['Рекомендована ціна продажу продукту'];
        if (recommendedSellPrice && recommendedSellPrice !== '—') {
            update.sellPrice = parseAmount(recommendedSellPrice, 'ціна продажу');
        }
        const timeText = row['Рекомендований час (год, хв, сек)'];
        if (timeText && timeText !== '—') {
            const timeParts = timeText.match(/^\s*(\d+)\D+(\d+)\D+(\d+)\D*$/);
            if (!timeParts) throw new Error(`Рядок CSV ${rowNumber}: некоректний час «${timeText}».`);
            const [, hours, minutes, seconds] = timeParts.map(Number);
            const productionTimeMs = ((hours * 60 + minutes) * 60 + seconds) * 1000;
            if (!Number.isSafeInteger(productionTimeMs) || productionTimeMs < 1000) {
                throw new Error(`Рядок CSV ${rowNumber}: виробничий час має бути щонайменше 1 секунду.`);
            }
            update.productionTimeMs = productionTimeMs;
        }

        return { itemId, update };
    });

    return recommendations;
};

const getPath = (document, field) => {
    let value = document;
    for (const segment of field.split('.')) {
        if (value == null || !Object.prototype.hasOwnProperty.call(value, segment)) {
            return { exists: false };
        }
        value = value[segment];
    }
    return { exists: true, value };
};

const sameValue = (left, right) =>
    left.exists === right.exists && (!left.exists || left.value === right.value);

const createChanges = (document, update) => {
    const changes = {};
    const values = {
        price: update.price,
        'config.price': update.price,
        'config.priceCurrency': update.priceCurrency,
        ...(update.sellPrice === undefined ? {} : { sellPrice: update.sellPrice, 'config.sellPrice': update.sellPrice }),
        ...(update.productionTimeMs === undefined ? {} : { 'config.productionTimeMs': update.productionTimeMs }),
    };
    for (const [field, value] of Object.entries(values)) {
        const before = getPath(document, field);
        const after = { exists: true, value };
        if (!sameValue(before, after)) changes[field] = { before, after };
    }
    return changes;
};

const makeMongoUpdate = (changes, side) => {
    const $set = {};
    const $unset = {};
    for (const [field, change] of Object.entries(changes)) {
        const value = change[side];
        if (value.exists) $set[field] = value.value;
        else $unset[field] = 1;
    }
    return {
        ...(Object.keys($set).length ? { $set } : {}),
        ...(Object.keys($unset).length ? { $unset } : {}),
    };
};

const restoreEntries = async (entries, verifyAfter) => {
    const itemIds = entries.map(({ itemId }) => itemId);
    const documents = await GameItemPrice.find({ itemId: { $in: itemIds } }).lean();
    const documentsById = new Map(documents.map((document) => [document.itemId, document]));
    if (verifyAfter) {
        const conflicts = [];
        for (const entry of entries) {
            const document = documentsById.get(entry.itemId);
            for (const [field, change] of Object.entries(entry.changes)) {
                if (!sameValue(getPath(document, field), change.after)) conflicts.push(`${entry.itemId}.${field}`);
            }
        }
        if (conflicts.length) {
            throw new Error(`Відкат зупинено: після застосування змінено поля ${conflicts.join(', ')}.`);
        }
    }

    for (const entry of entries) {
        const result = await GameItemPrice.updateOne(
            { itemId: entry.itemId },
            makeMongoUpdate(entry.changes, 'before'),
            { runValidators: true }
        );
        if (result.matchedCount !== 1) throw new Error(`Не знайдено запис перевизначень для відкату: ${entry.itemId}.`);
    }
};

const applyRecommendations = async () => {
    const recommendations = parseRecommendations(await readFile(recommendationsPath, 'utf8'));
    const catalogRecommendations = recommendations.filter(({ itemId }) => GAME_ITEMS[itemId]);
    const catalogIds = Object.keys(GAME_ITEMS);
    const catalogRecommendationIds = new Set(catalogRecommendations.map(({ itemId }) => itemId));
    const absentFromSheet = catalogIds.filter((itemId) => !catalogRecommendationIds.has(itemId));
    if (absentFromSheet.length) {
        throw new Error(`У таблиці немає рекомендацій для базових товарів: ${absentFromSheet.join(', ')}.`);
    }

    for (const { itemId, update } of catalogRecommendations) {
        const item = GAME_ITEMS[itemId];
        if (update.sellPrice !== undefined && !item.yieldItem) {
            throw new Error(`Таблиця задає ціну продажу товару «${itemId}» без продукту.`);
        }
        if (update.productionTimeMs !== undefined && !item.yieldItem) {
            throw new Error(`Таблиця задає час виробництва товару «${itemId}» без продукту.`);
        }
    }

    const itemIds = catalogRecommendations.map(({ itemId }) => itemId);
    const documents = await GameItemPrice.find({ itemId: { $in: itemIds } }).lean();
    const documentsById = new Map(documents.map((document) => [document.itemId, document]));
    const entries = catalogRecommendations
        .filter(({ itemId }) => documentsById.has(itemId))
        .map(({ itemId, update }) => ({
            itemId,
            changes: createChanges(documentsById.get(itemId), update),
        }))
        .filter(({ changes }) => Object.keys(changes).length > 0);

    const skippedIds = recommendations
        .filter(({ itemId }) => !GAME_ITEMS[itemId])
        .map(({ itemId }) => itemId);
    console.log(`CSV: ${recommendations.length} товарів; базовий каталог: ${catalogIds.length}; пропускаємо відсутніх у коді: ${skippedIds.length}.`);
    console.log(`Збережені перевизначення, які потребують оновлення: ${entries.length} товарів.`);
    if (entries.length === 0) {
        console.log('Збережені перевизначення вже відповідають рекомендаціям; записів у БД не змінено.');
        return;
    }

    if (process.argv[2] !== '--apply') {
        for (const entry of entries) {
            console.log(`${entry.itemId}: ${Object.keys(entry.changes).join(', ')}`);
        }
        console.log('Попередній перегляд, змін не внесено. Для застосування запусти: node scripts/syncEconomyOverrides.js --apply');
        return;
    }

    await mkdir(rollbackDirectory, { recursive: true });
    const rollbackPath = path.join(
        rollbackDirectory,
        `economy-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    const snapshot = {
        createdAt: new Date().toISOString(),
        source: path.relative(projectDirectory, recommendationsPath),
        entries,
    };
    await writeFile(rollbackPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });

    const applied = [];
    try {
        for (const entry of entries) {
            const result = await GameItemPrice.updateOne(
                { itemId: entry.itemId },
                makeMongoUpdate(entry.changes, 'after'),
                { runValidators: true }
            );
            if (result.matchedCount !== 1) throw new Error(`Не знайдено запис перевизначень для оновлення: ${entry.itemId}.`);
            applied.push(entry);
        }
    } catch (error) {
        try {
            await restoreEntries(applied, false);
        } catch (rollbackError) {
            throw new Error(`Оновлення не завершилось: ${error.message}. Автоматичний відкат також не завершився: ${rollbackError.message}. Знімок відкату: ${rollbackPath}.`);
        }
        throw new Error(`Оновлення не завершилось; внесені зміни автоматично відкотили. Знімок відкату: ${rollbackPath}. ${error.message}`);
    }

    console.log(`Оновлено ${entries.length} збережених перевизначень.`);
    console.log(`Знімок для безпечного відкату: ${rollbackPath}`);
};

const rollback = async (snapshotPath) => {
    if (!snapshotPath) throw new Error('Вкажи шлях до JSON-знімка після --rollback.');
    const snapshot = JSON.parse(await readFile(path.resolve(snapshotPath), 'utf8'));
    if (!Array.isArray(snapshot.entries) || snapshot.entries.length === 0 ||
        snapshot.entries.some((entry) => typeof entry.itemId !== 'string' || !entry.changes)) {
        throw new Error('Файл відкату не містить коректного списку змін.');
    }
    await restoreEntries(snapshot.entries, true);
    console.log(`Відновлено попередні значення для ${snapshot.entries.length} товарів.`);
};

const main = async () => {
    const args = process.argv.slice(2);
    const isApply = args.length === 1 && args[0] === '--apply';
    const isRollback = args.length === 2 && args[0] === '--rollback';
    if (!isApply && !isRollback && args.length > 0) {
        throw new Error('Використання: node scripts/syncEconomyOverrides.js [--apply | --rollback <snapshot.json>].');
    }
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI не налаштовано у server/.env.');

    await mongoose.connect(process.env.MONGO_URI);
    try {
        if (isRollback) await rollback(args[1]);
        else await applyRecommendations();
    } finally {
        await mongoose.disconnect();
    }
};

main().catch((error) => {
    console.error(`Не вдалося синхронізувати економіку: ${error.message}`);
    process.exitCode = 1;
});
