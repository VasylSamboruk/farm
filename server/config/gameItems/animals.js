export const animals = [
	{
		id: 'chicken',
		name: 'Курка',
		type: 'ANIMAL',
		footprint: { width: 1, height: 1 },
		spriteScale: 0.72,
		price: 400,
		plantingXp: 5,
		shopImage: '/assets/animals/chiken.png',
        growthImages: [
            '/assets/animals/chiken.png',
        ],
		productionTimeMs: 2 * 60 * 60 * 1000,
		yieldItem: 'egg',
		yieldName: 'Яйця',
		yieldIcon: '🥚',
		yieldImage: '/assets/animals/product/chikenegg.png',
		yieldAmount: 1,
		sellPrice: 70,
		placementSurface: 'grass'
	},

{
		id: 'goose',
		name: 'Гуска',
		type: 'ANIMAL',
		footprint: { width: 1, height: 1 },
		spriteScale: 0.89,
		price: 1200,
		plantingXp: 5,
		shopImage: '/assets/animals/goose.png',
        growthImages: [
            '/assets/animals/goose.png',
        ],
		productionTimeMs: 6 * 60 * 60 * 1000,
		yieldItem: 'feather',
		yieldName: 'Піря',
		yieldIcon: '�',
		yieldImage: '/assets/animals/product/goosefeather.png',
		yieldAmount: 1,
		sellPrice: 210,
		placementSurface: 'grass'
	},

	{
		id: 'sheep',
		name: 'Овечка',
		type: 'ANIMAL',
		footprint: { width: 1, height: 1 },
		spriteScale: 0.85,
		price: 3500,
		plantingXp: 5,
		shopImage: '/assets/animals/sheep.png',
        growthImages: [
            '/assets/animals/sheep.png',
        ],
		productionTimeMs: 10 * 60 * 60 * 1000,
		yieldItem: 'wool',
		yieldName: 'Вовна',
		yieldIcon: '🐑',
		yieldImage: '/assets/animals/product/vovna.png',
		yieldAmount: 1,
		sellPrice: 350,
		placementSurface: 'grass'
	},

{
		id: 'pig',
		name: 'Свиня',
		type: 'ANIMAL',
		footprint: { width: 1, height: 1 },
		spriteScale: 0.99,
		price: 4500,
		plantingXp: 5,
		shopImage: '/assets/animals/pig.png',
        growthImages: [
            '/assets/animals/pig.png',
        ],
		productionTimeMs: 12 * 60 * 60 * 1000,
		yieldItem: 'bacon',
		yieldName: 'Бекон',
		yieldIcon: '🥓',
		yieldImage: '/assets/animals/product/bekon.png',
		yieldAmount: 1,
		sellPrice: 480,
		placementSurface: 'grass'
	},

	{
		id: 'boar',
		name: 'Кабан',
		type: 'ANIMAL',
		footprint: { width: 1, height: 1 },
		spriteScale: 0.99,
		price: 9500,
		plantingXp: 5,
		shopImage: '/assets/animals/boar.png',
        growthImages: [
            '/assets/animals/boar.png',
        ],
		productionTimeMs: 16 * 60 * 60 * 1000,
		yieldItem: 'baconkaban',
		yieldName: 'Бекон з кабана',
		yieldIcon: '🥓',
		yieldImage: '/assets/animals/product/bekonkaban.png',
		yieldAmount: 1,
		sellPrice: 1000,
		placementSurface: 'grass'
	},

	{
		id: 'cow',
		name: 'Корова',
		type: 'ANIMAL',
		footprint: { width: 2, height: 1 },
		spriteScale: 1.35,
		canFlip: false,
		price: 2500,
		plantingXp: 10,
				shopImage: '/assets/animals/cow.png',
        growthImages: [
            '/assets/animals/cow.png',
        ],

		productionTimeMs: 8 * 60 * 60 * 1000,
		yieldItem: 'milk',
		yieldName: 'Молоко',
		yieldIcon: '🥛',
		yieldImage: '/assets/animals/product/milk.png',
		yieldAmount: 1,
		sellPrice: 280,
		placementSurface: 'grass'
	}
];
