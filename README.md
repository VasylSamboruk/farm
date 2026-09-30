# Ізометрична ферма

Браузерна гра-ферма. Клієнт написаний на React, TypeScript і Vite; сервер — на Express, база даних — MongoDB з Mongoose. Ізометричне поле малюється в Canvas. Каталог предметів зберігається на сервері та віддається клієнту через API.

## Запуск

Потрібні Node.js і MongoDB. У `server/.env` задайте власні значення:

```env
MONGO_URI=mongodb://127.0.0.1:27017/farm
JWT_SECRET=your-local-secret
PORT=5000
```

Не публікуйте `.env` і не додавайте його секрети до репозиторію.

Відкрийте два термінали з кореня проєкту.

Термінал 1, сервер:

```powershell
cd server
npm install
npm run dev
```

Термінал 2, клієнт:

```powershell
cd client
npm install
npm run dev
```

Vite покаже локальну адресу, зазвичай `http://localhost:5173`.

Перевірки клієнта:

```powershell
cd client
npm run lint
npm run build
```

## Публікація: Railway + Cloudflare Pages

Репозиторій містить клієнт і сервер у підпапках. Спочатку розгорни API та базу на Railway, потім клієнт на Cloudflare Pages.

### 1. MongoDB і API на Railway

1. Створи Railway project із GitHub-репозиторію `VasylSamboruk/farm`.
2. Додай MongoDB service у цьому project. Скопіюй його **private connection URL** із Variables.
3. Для сервісу гри задай Root Directory `/server`, Build Command `npm ci`, Start Command `npm start`.
4. У Variables сервісу гри додай:

```env
MONGO_URI=<private MongoDB connection URL>
JWT_SECRET=<long random secret>
CLIENT_ORIGINS=http://localhost:5173
NODE_ENV=production
```

Для `MONGO_URI` можна використати Railway variable reference на private URL MongoDB service. `PORT` вручну не задавай: Railway встановлює його автоматично.

Згенеруй `JWT_SECRET` локально командою PowerShell `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`, встав його безпосередньо у Railway Variables і нікому не надсилай. Після deploy перевір Railway URL: `/health` має повернути `{"ok":true}`.

### 2. Клієнт на Cloudflare Pages

1. Створи Pages project із того самого GitHub-репозиторію.
2. Production branch: `main`; Root Directory: `client`.
3. Build Command: `npm run build`; Build output directory: `dist`.
4. У Pages → Settings → Variables and Secrets додай production variable:

```env
VITE_API_URL=https://<твій-railway-домен>/api
```

5. Запусти перший deploy і скопіюй адресу Pages, наприклад `https://<назва>.pages.dev`.
6. Повернись у Railway та встанови `CLIENT_ORIGINS` точно в цю адресу, з `https://` і без кінцевого `/`. Якщо є кілька фронтендів, розділяй origins комами. Після зміни зроби redeploy API.

У Cloudflare Preview deployments origin буде інший; для тестування додай потрібний preview origin у `CLIENT_ORIGINS` або тестуй Production URL.

### 3. Безпека й перевірка

- Не додавай `server/.env`, JWT secret або database URL до GitHub. Кореневий `.gitignore` уже виключає `.env`; у репозиторії є тільки нешкідливі `.env.example` шаблони.
- Перевір `/health`, відкрий Pages URL, створи тестовий акаунт і перевір вхід та завантаження ферми.
- API має бути доступне через HTTPS Railway URL; клієнтський `VITE_API_URL` вбудовується під час Cloudflare build, тому після його зміни потрібен новий deploy Pages.

## Де що змінювати

| Що змінюється | Файл або папка |
| --- | --- |
| Ціни, XP, час росту й винагороди дерев | `server/config/gameItems/trees.js` |
| Перевірка часу росту та збору на сервері | `server/services/treeMechanics.js` |
| Розмір предмета в 2×2 мініклітинках | `server/services/footprint.js`, `client/src/game/footprint.ts` |
| Вигляд дерев, стадії, ghost-preview, підсвічування й таймер | `client/src/game/trees.ts` |
| Вигляд культур і тварин | `client/src/game/placedItems.ts` |
| Спільне кешування зображень предметів | `client/src/game/sprites.ts` |
| Ізометрична сітка, камера, кліки й інструменти | `client/src/components/game/FarmCanvas.tsx` |
| Магазин і показ каталогу | `client/src/components/game/ShopModal.tsx` |
| Інвентар і продаж товарів | `client/src/components/game/InventoryModal.tsx`, `server/routes/farm.js` (`/sell`) |
| Типи предметів, які передаються з API | `client/src/types/game.ts` |
| Завантаження каталогу гри | `server/routes/gameConfig.js`, `client/src/store/useGameConfigStore.ts` |
| Дані користувача та ферми в MongoDB | `server/models/User.js`, `server/models/Farm.js` |
| Маршрути авторизації | `server/routes/auth.js` |

Каталог предметів API збирається у `server/config/gameItems/index.js`. Детальна пам'ятка по полях каталогу: `server/config/gameItems/README.md`.

## Додати дерево

### 1. Підготувати картинки

Створіть папку `client/public/assets/trees/<tree_id>/`, де `<tree_id>` збігається з `id` дерева. Наприклад, для яблуні:

```text
client/public/assets/trees/apple_tree/
  stage_1_seedling.png
  stage_2_young.png
  stage_3_mature.png
  stage_4_fruiting.png
```

Для дерев зберігайте однакове прозоре полотно `256 × 512 px` і спільну базову лінію стовбура; четвертий кадр має показувати плоди. Для наземних об'єктів орієнтуйте полотно на footprint: гуска/курка/індик `1×1` — `256 × 256 px`; корова/свиня/буйвол `2×1` — `512 × 256 px`; велика тварина чи будівля `2×2` — `512 × 512 px`. Тримайте видимий малюнок приблизно в межах 80–90% полотна, без зайвого прозорого обрамлення; нижні лапи/ноги вирівнюйте по спільній базовій лінії. Canvas автоматично обрізає прозорі краї та вписує малюнок у footprint. Файли в масиві `growthImages` ідуть у порядку стадій.

Для тварини зазвичай достатньо одного статичного кадру в `growthImages`; для культури вкажіть послідовність кадрів росту. Зображення тримайте в `client/public/assets/animals/<id>/` або `client/public/assets/crops/<id>/`. URL у каталозі починається від `public` і має точно збігатися з ім'ям файла; наприклад файл `client/public/assets/animals/chiken.png` задається як `/assets/animals/chiken.png`. `shopIcon` — emoji-рядок, а не масив шляхів; для картинки магазину використовуйте `shopImage`.

### 2. Додати запис у каталог

У `server/config/gameItems/trees.js` додайте об'єкт з унікальним `id`. Шляхи до файлів пишуться від папки `client/public`, зі слешем на початку:

```js
{
    id: 'new_tree',
    name: 'Нове дерево',
    type: 'TREE',
    footprint: { width: 1, height: 1 },
    price: 150,
    plantingXp: 15,
    shopImage: '/assets/trees/new_tree/shop.png',
    growthImages: [
        '/assets/trees/new_tree/stage_1_seedling.png',
        '/assets/trees/new_tree/stage_2_young.png',
        '/assets/trees/new_tree/stage_3_mature.png',
        '/assets/trees/new_tree/stage_4_fruiting.png'
    ],
    productionTimeMs: 180000,
    yieldItem: 'new_fruit',
    yieldName: 'Плоди',
    yieldIcon: '🍎',
    yieldAmount: 2,
    sellPrice: 300,
    placementSurface: 'grass'
}
```

`productionTimeMs` задається в мілісекундах: `60000` — 1 хвилина, `300000` — 5 хвилин. Це один і той самий інтервал до першого й кожного наступного врожаю. Візуальні стадії розподіляються автоматично: перші 80% циклу — ріст, решта — дозрівання. Після збору дерево залишається дорослим. Налаштування застосовуються також до вже посаджених дерев.

### 3. Що означають поля

- `id` — унікальний технічний ID; використовується для збереження на фермі та назви папки з картинками.
- `name` — назва в магазині.
- `type` — для дерева завжди `TREE`.
- `footprint` — ширина/висота в мініклітинках усередині великої клітинки.
- `spriteScale` — необов'язковий візуальний множник розміру PNG; не змінює footprint чи правила зайнятості.
- `price` — ціна посадки в монетах.
- `plantingXp` — XP за посадку.
- `shopImage` — окреме зображення товару в магазині; якщо його немає, використовується остання стадія `growthImages`.
- `shopIcon` — emoji-fallback, якщо зображення магазину та стадії ще не додані.
- `growthImages` — PNG-стадії; останній кадр є плодоносною стадією.
- `productionTimeMs` — час до врожаю та інтервал між наступними врожаями.
- `yieldItem` — ID ресурсу врожаю для майбутньої системи інвентарю.
- `yieldName` — назва врожаю для інтерфейсу.
- `yieldIcon` — emoji-запасний варіант іконки врожаю.
- `yieldAmount` — кількість ресурсу за збір.
- `sellPrice` — монети за продаж однієї одиниці врожаю з інвентаря.
- `placementSurface` — дозволене місце посадки; дерева ставляться на `grass`.

Новому дереву не потрібно змінювати магазин чи Canvas: вони читають цей каталог автоматично.

## Мініклітинки та поверхні

Кожна велика клітинка поля має 4 мініклітинки, пронумеровані `0..3` у 2×2 сітці. Поле `footprint: { width, height }` задає прямокутний розмір предмета: дерево й курка `1×1`, корова `2×1`. Корова займає два суміжні сектори одного ряду; сервер зберігає весь footprint і блокує перетин з іншими предметами.

`placementSurface: 'soil'` означає, що посадити можна лише на попередньо скопану велику клітинку. `placementSurface: 'grass'` не дозволяє ставити предмет на грядку. Сервер перевіряє ці правила, а клієнт підсвічує всі зайняті мініклітинки footprint.

Якщо предмет виглядає замалим або завеликим, змінюй `spriteScale` у його записі каталогу (наприклад, `1.2` або `1.5`). Це змінює лише малюнок: корова зі `spriteScale: 1.5` усе одно займає рівно `2×1` мініклітинки.

## Врожай та інвентар

Після готовності дерева, культури або тварини сервер додає `yieldAmount` ресурсу `yieldItem` до `User.inventory`. Одноразова культура видаляється після збору, але перекопана грядка лишається; дерево й тварина залишаються та запускають наступний цикл.

Кнопка складу відкриває інвентар. Обери продукт і кількість для продажу; сервер перевірить запас і нарахує `amount × sellPrice`. Сам збір урожаю монет не видає.

## Інші типи предметів

`server/config/gameItems/crops.js` уже містить пшеницю, `animals.js` — курку та корову. Перевірки посадки, footprint, збору в інвентар і продажу для них працюють. `buildings.js` поки порожній: будівлям потрібні окремі правила поведінки до того, як вмикати їх у магазині.
