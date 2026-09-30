import mongoose from 'mongoose';

const tileSchema = new mongoose.Schema({
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    quadrant: { type: Number, default: -1 }, // -1 для грядки (ціла клітинка), 0,1,2,3 для дерев
    occupiedQuadrants: { type: [Number], default: [] },
    occupiedCells: {
        type: [{ x: Number, y: Number, quadrant: Number }],
        default: []
    },
    flipX: { type: Boolean, default: false },
    itemId: { type: String, required: true },
    isDirt: { type: Boolean, default: false },
    stage: { type: Number, default: 0 },
    placedAt: { type: Date, default: Date.now },
    lastHarvestedAt: { type: Date }
}, { _id: false });

const farmSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    tiles: [tileSchema]
}, { timestamps: true });

export default mongoose.model('Farm', farmSchema);