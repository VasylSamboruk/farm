import express from 'express';
import { listGameItems } from '../config/gameItems/index.js';

const router = express.Router();

router.get('/', (_req, res) => {
    res.json(listGameItems());
});

export default router;