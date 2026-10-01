export const buildings = [
	{
		id: 'barn',
		name: 'Амбар',
		type: 'BUILDING',
		footprint: { width: 2, height: 2 },
		largeFootprint: { width: 2, height: 2 },
		spriteScale: 2.2,
		canFlip: true,
		price: 5000,
		plantingXp: 100,
		shopIcon: '🏠',
		shopImage: '/assets/buildings/barn/barn.png',
		growthImages: ['/assets/buildings/barn/barn.png'],
		placementSurface: 'grass'
	},

	{
		id: 'rabbit_statue',
		name: 'Статуя Кролика',
		type: 'BUILDING',
		footprint: { width: 1, height: 1 },
		spriteScale: 1.1,
		canFlip: true,
		price: 1500,
		plantingXp: 30,
		shopIcon: '🏠',
		shopImage: '/assets/buildings/decor/dek1.png',
		growthImages: ['/assets/buildings/decor/dek1.png'],
		placementSurface: 'grass'
	},

	{
		id: 'scarecrow',
		name: 'Опудало',
		type: 'BUILDING',
		footprint: { width: 1, height: 1 },
		spriteScale: 1.1,
		canFlip: true,
		price: 1200,
		plantingXp: 25,
		shopIcon: '🏠',
		shopImage: '/assets/buildings/decor/dek2.png',
		growthImages: ['/assets/buildings/decor/dek2.png'],
		placementSurface: 'grass'
	},

{
		id: 'bird_statue',
		name: 'Пташечка',
		type: 'BUILDING',
		footprint: { width: 1, height: 1 },
		spriteScale: 1.1,
		canFlip: true,
		price: 999,
		plantingXp: 20,
		shopIcon: '🏠',
		shopImage: '/assets/buildings/decor/dek3.png',
		growthImages: ['/assets/buildings/decor/dek3.png'],
		placementSurface: 'grass'
	},

	{
		id: 'gnome_statue',
		name: 'Гном',
		type: 'BUILDING',
		footprint: { width: 1, height: 1 },
		spriteScale: 1.1,
		canFlip: true,
		price: 1000,
		plantingXp: 23,
		shopIcon: '🏠',
		shopImage: '/assets/buildings/decor/dek4.png',
		growthImages: ['/assets/buildings/decor/dek4.png'],
		placementSurface: 'grass'
	},

	{
		id: 'kolodiaz',
		name: 'Колодязь',
		type: 'BUILDING',
		footprint: { width: 2, height: 2 },
		largeFootprint: { width: 1, height: 1 },
		spriteScale: 1.1,
		canFlip: true,
		price: 1500,
		plantingXp: 50,
		requiredLevel: 15,
		shopIcon: '🏠',
		shopImage: '/assets/buildings/decor/kolodiz.png',
		growthImages: ['/assets/buildings/decor/kolodiz.png'],
		placementSurface: 'grass'
	},
];
