import mongoose from 'mongoose';

export const FARM_STARTING_SIZE = 10;

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
    surfaceType: { type: String, enum: ['water'], default: undefined },
    skinId: { type: String, default: null },
    unlockedSkinIds: { type: [String], default: [] },
    isDirt: { type: Boolean, default: false },
    stage: { type: Number, default: 0 },
    placedAt: { type: Date, default: Date.now },
    lastHarvestedAt: { type: Date },
    factoryQueuedUnits: { type: Number, default: 0 },
    factoryStartedAt: { type: Date },
    factoryInputItemId: { type: String }
}, { _id: false });

const housedAnimalSchema = new mongoose.Schema({
    itemId: { type: String, required: true },
    skinId: { type: String, default: null },
    placedAt: { type: Date, required: true },
    lastHarvestedAt: { type: Date }
});

tileSchema.add({
    housedAnimals: { type: [housedAnimalSchema], default: undefined }
});

const farmSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    size: { type: Number, default: FARM_STARTING_SIZE, min: FARM_STARTING_SIZE },
    grassStyle: { type: String, default: 'classic' },
    backgroundStyle: { type: String, default: 'classic' },
    backgroundIsNight: { type: Boolean, default: false },
    tiles: [tileSchema]
}, { timestamps: true });

export default mongoose.model('Farm', farmSchema);