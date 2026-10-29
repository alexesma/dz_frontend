import api from '../api.js';

// Локальный каталог для распознавания кодов без запроса на сервер: на складе
// связь нестабильна, а скан должен отвечать мгновенно. Всё, чего нет в каталоге
// (этикетки, коробки, новые товары), распознаёт сервер.
const DB_NAME = 'dz-scan-catalog';
const STORE = 'catalog';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MIN_OEM_LENGTH = 5;

let index = null;
let loading = null;

const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const dbGet = async () => {
    try {
        const db = await openDb();
        return await new Promise((resolve) => {
            const request = db.transaction(STORE).objectStore(STORE).get('catalog');
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => resolve(null);
        });
    } catch { return null; }
};

const dbPut = async (value) => {
    try {
        const db = await openDb();
        db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, 'catalog');
    } catch { /* кеш необязателен */ }
};

export const oemKey = (value) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

// Те же правила, что code_keys на сервере: целиком, затем по частям.
export const codeKeys = (raw) => {
    const keys = [];
    const add = (value) => {
        const key = oemKey(value);
        if (key.length >= MIN_OEM_LENGTH && !keys.includes(key)) keys.push(key);
    };
    const text = String(raw || '').trim();
    add(text);
    // GS (ASCII 29) из GS1-кодов тоже разделитель
    text.split(String.fromCharCode(29)).join(' ').split(/\s+/).forEach(add);
    return keys;
};

const build = (data) => {
    const byBarcode = new Map();
    const byOem = new Map();
    const parts = new Map();
    data.parts.forEach(([id, oem, barcode, brand, name]) => {
        const part = { id, oem, brand: brand || '', name };
        parts.set(id, part);
        if (barcode) byBarcode.set(barcode, id);
        const key = oemKey(oem);
        if (!byOem.has(key)) byOem.set(key, []);
        byOem.get(key).push(id);
    });
    const aliases = new Map(data.aliases.map(([code, id]) => [code, id]));
    const locations = new Map(data.locations.map(([id, name]) => [String(name).toUpperCase(), { id, name }]));
    return { byBarcode, byOem, parts, aliases, locations };
};

const fetchCatalog = async () => {
    const { data } = await api.get('/scan/catalog', { timeout: 120000 });
    const record = { savedAt: Date.now(), data };
    index = build(data);
    void dbPut(record);
};

export const ensureCatalog = () => {
    if (loading) return loading;
    loading = (async () => {
        if (!index) {
            const cached = await dbGet();
            if (cached?.data) {
                index = build(cached.data);
                if (Date.now() - cached.savedAt < MAX_AGE_MS) return;
            }
        }
        try { await fetchCatalog(); } catch { /* останемся на старом кеше */ }
    })().finally(() => { loading = null; });
    return loading;
};

export const refreshCatalog = async () => { await fetchCatalog(); };

export const rememberAlias = (code, autopartId) => {
    if (index) index.aliases.set(code, autopartId);
};

const partResult = (ids) => {
    const options = ids.map((id) => {
        const part = index.parts.get(id);
        return { autopart_id: id, brand: part.brand, oem: part.oem, name: part.name };
    });
    const first = options[0];
    return {
        kind: ids.length === 1 ? 'autopart' : 'autopart_choice',
        title: `${first.brand} ${first.oem} · ${first.name}`.trim(),
        route: `/autoparts/nomenclature?autopart_id=${first.autopart_id}&edit=1`,
        autopart_id: first.autopart_id, options, source: 'local',
    };
};

// null — не нашли локально (сервер ответит сам, в том числе «не найдено»).
export const resolveLocal = (code) => {
    if (!index) return null;
    const place = index.locations.get(code.toUpperCase());
    if (place) {
        return {
            kind: 'location', title: `Место ${place.name}`, route: '/warehouse/storage',
            storage_location_id: place.id, name: place.name, source: 'local',
        };
    }
    const byBarcode = index.byBarcode.get(code);
    if (byBarcode !== undefined) return partResult([byBarcode]);
    const alias = index.aliases.get(code);
    if (alias !== undefined && index.parts.has(alias)) return partResult([alias]);
    const keys = codeKeys(code);
    for (let i = 0; i < keys.length; i += 1) {
        const ids = index.byOem.get(keys[i]);
        if (ids?.length) return partResult(ids);
    }
    return null;
};

// Подсказка для привязки неизвестного кода: позиции, чей артикул похож на код.
export const similarity = (code, oem) => {
    const a = oemKey(code);
    const b = oemKey(oem);
    if (!a || !b) return 0;
    if (a.includes(b) || b.includes(a)) return 1;
    let common = 0;
    while (common < Math.min(a.length, b.length) && a[common] === b[common]) common += 1;
    return common / Math.max(a.length, b.length);
};
