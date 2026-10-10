export const trees = [
    {
        id: 'pear_tree',
        name: 'Грушка',
        type: 'TREE',
        footprint: { width: 1, height: 1 },
        price: 500,
        plantingXp: 10,
        shopImage: '/assets/trees/pear_tree/stage_4_fruiting.png',
        growthImages: [
            '/assets/trees/pear_tree/stage_1_seedling.png',
            '/assets/trees/pear_tree/stage_2_young.png',
            '/assets/trees/pear_tree/stage_3_mature.png',
            '/assets/trees/pear_tree/stage_4_fruiting.png'
        ],
        productionTimeMs: 6 * 60 * 60 * 1000,
        yieldItem: 'pear',
        yieldName: 'Груші',
        yieldIcon: '🍐',
        yieldImage: '/assets/trees/product/pear.png',
        yieldAmount: 1,
        sellPrice: 130,
        placementSurface: 'grass'
    },
    {
        id: 'apple_tree',
        name: 'Яблуня',
        type: 'TREE',
        footprint: { width: 1, height: 1 },
        price: 400,
        plantingXp: 15,
        shopImage: '/assets/trees/apple_tree/stage_4_fruiting.png',
        growthImages: [
            '/assets/trees/apple_tree/stage_1_seedling.png',
            '/assets/trees/apple_tree/stage_2_young.png',
            '/assets/trees/apple_tree/stage_3_mature.png',
            '/assets/trees/apple_tree/stage_4_fruiting.png'
        ],
        productionTimeMs: 4 * 60 * 60 * 1000,
        yieldItem: 'apple',
        yieldName: 'Яблука',
        yieldIcon: '🍎',
        yieldImage: '/assets/trees/product/apple.png',
        yieldAmount: 1,
        sellPrice: 90,
        placementSurface: 'grass'
    },
{
        id: 'cherry_tree',
        name: 'Вишня',
        type: 'TREE',
        footprint: { width: 1, height: 1 },
        price: 700,
        plantingXp: 15,
        shopImage: '/assets/trees/cherry_tree/wyshnya4.png',
        growthImages: [
            '/assets/trees/cherry_tree/wyshnya1.png',
            '/assets/trees/cherry_tree/wyshnya2.png',
            '/assets/trees/cherry_tree/wyshnya3.png',
            '/assets/trees/cherry_tree/wyshnya4.png',
        ],
        productionTimeMs: 8 * 60 * 60 * 1000,
        yieldItem: 'cherry',
        yieldName: 'Вишні',
        yieldIcon: '�',
        yieldImage: '/assets/trees/product/cherry.png',
        yieldAmount: 1,
        sellPrice: 180,
        placementSurface: 'grass'
    },

{
        id: 'plum_tree',
        name: 'Слива',
        type: 'TREE',
        footprint: { width: 1, height: 1 },
        price: 1000,
        plantingXp: 15,
        shopImage: '/assets/trees/plum_tree/slyva4.png',
        growthImages: [
            '/assets/trees/plum_tree/slyva1.png',
            '/assets/trees/plum_tree/slyva2.png',
            '/assets/trees/plum_tree/slyva3.png',
            '/assets/trees/plum_tree/slyva4.png',
        ],
        productionTimeMs: 10 * 60 * 60 * 1000,
        yieldItem: 'plum',
        yieldName: 'Сливи',
        yieldIcon: '🍑',
        yieldImage: '/assets/trees/product/plum.png',
        yieldAmount: 1,
        sellPrice: 240,
        placementSurface: 'grass'
    },


    {
        id: 'malina', 
        name: 'Малина',
        type: 'TREE',
        footprint: { width: 1, height: 1 },
        spriteScale: 0.85,
        price: 500,
        plantingXp: 25,
        shopImage: '/assets/trees/malina/malina4.png',
        growthImages: [
            '/assets/trees/malina/malina1.png',
            '/assets/trees/malina/malina2.png',
            '/assets/trees/malina/malina3.png',
            '/assets/trees/malina/malina4.png'
        ],
        productionTimeMs: 2 * 60 * 60 * 1000,
        yieldItem: 'malina',
        yieldName: 'Малина',
        yieldIcon: '🍓',
        yieldImage: '/assets/trees/product/malina.png',
        yieldAmount: 1,
        sellPrice: 55,
        placementSurface: 'grass'
    },
    {
        id: 'nutstree',
        name: 'Ліщина',
        type: 'TREE',
        footprint: { width: 1, height: 1 },
        price: 3500,
        plantingXp: 25,
        shopImage: '/assets/trees/nutstree/stage_4_fruiting.png',
        growthImages: [
            '/assets/trees/nutstree/stage_1_seedling.png',
            '/assets/trees/nutstree/stage_2_young.png',
            '/assets/trees/nutstree/stage_3_mature.png',
            '/assets/trees/nutstree/stage_4_fruiting.png'
        ],
        productionTimeMs: 16 * 60 * 60 * 1000,
        yieldItem: 'nutstree',
        yieldName: 'Горіхи',
        yieldIcon: '🥜',
        yieldImage: '/assets/trees/product/nuts.png',
        yieldAmount: 1,
        sellPrice: 650,
        placementSurface: 'grass'
    }
];
