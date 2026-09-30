export const animals = [
	{
		id: 'chicken',
		name: 'Курка',
		type: 'ANIMAL',
		footprint: { width: 1, height: 1 },
		spriteScale: 0.72,
		price: 100,
		plantingXp: 5,
		shopImage: '/assets/animals/chiken.png',
        growthImages: [
            '/assets/animals/chiken.png',
        ],
		productionTimeMs: 120000,
		yieldItem: 'egg',
		yieldName: 'Яйця',
		yieldIcon: '🥚',
		yieldImage: '/assets/animals/product/chikenegg.png',
		yieldAmount: 1,
		sellPrice: 10,
		placementSurface: 'grass'
	},

	{
		id: 'sheep',
		name: 'Овечка',
		type: 'ANIMAL',
		footprint: { width: 1, height: 1 },
		spriteScale: 0.85,
		price: 100,
		plantingXp: 5,
		shopImage: '/assets/animals/sheep.png',
        growthImages: [
            '/assets/animals/sheep.png',
        ],
		productionTimeMs: 10000,
		yieldItem: 'wool',
		yieldName: 'Вовна',
		yieldIcon: '🐑',
		yieldImage: '/assets/animals/product/vovna.png',
		yieldAmount: 1,
		sellPrice: 10,
		placementSurface: 'grass'
	},

	{
		id: 'cow',
		name: 'Корова',
		type: 'ANIMAL',
		footprint: { width: 2, height: 1 },
		spriteScale: 1.15,
		canFlip: false,
		price: 500,
		plantingXp: 10,
				shopImage: '/assets/animals/cow.png',
        growthImages: [
            '/assets/animals/cow.png',
        ],

		productionTimeMs: 300000,
		yieldItem: 'milk',
		yieldName: 'Молоко',
		yieldIcon: '🥛',
		yieldImage: '/assets/animals/product/milk.png',
		yieldAmount: 1,
		sellPrice: 50,
		placementSurface: 'grass'
	}
];
