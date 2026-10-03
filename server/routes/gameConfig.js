import express from 'express';
import { listGameItems } from '../services/gameCatalog.js';
import { getMediaSettings, resolveGameItemImages } from '../services/mediaStorage.js';

const router = express.Router();

router.get('/', async (_req, res, next) => {
    try {
        const settings = await getMediaSettings();
    res.set('Cache-Control', 'no-store');
    res.json(listGameItems().map(item => ({
        ...resolveGameItemImages(item, settings),
        requiredLevel: item.requiredLevel ?? 1,
        sortOrder: item.sortOrder,
    })));
    } catch (error) {
        next(error);
    }
});

export default router;