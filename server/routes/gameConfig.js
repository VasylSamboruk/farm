import express from 'express';
import { listGameItems } from '../services/gameCatalog.js';

const router = express.Router();

router.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(listGameItems());
});

export default router;