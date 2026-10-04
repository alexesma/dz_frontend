import { useEffect, useState } from 'react';
import { lookupPartPhotos } from '../api/autoparts.js';

// ── Пакетная подгрузка фото ─────────────────────────────────────────────────
// Ярлычков в таблице много: собираем их запросы в один POST и кэшируем.
// Если у строки нет своей миниатюры с сайта, сервер сам спрашивает фото у
// платформы Parts-Soft (через поиск сайта) и кэширует ответ.

const cache = new Map();
const waiters = new Map();
let queue = new Map();
let timer = null;

const baseKey = (brand, oem) =>
    `${String(brand || '').trim().toLowerCase()}|${String(oem || '')
        .toUpperCase()
        .replace(/[^0-9A-ZА-Я]/g, '')}`;
const keyOf = (brand, oem, site) => `${baseKey(brand, oem)}${site ? '|site' : ''}`;

const flush = async () => {
    timer = null;
    const batch = queue;
    queue = new Map();
    const groups = { true: [], false: [] };
    batch.forEach((entry, key) => groups[entry.site].push([key, entry]));
    await Promise.all(Object.entries(groups).map(async ([site, entries]) => {
        if (!entries.length) return;
        const byKey = new Map();
        try {
            const { data } = await lookupPartPhotos(
                entries.map(([, e]) => ({ brand: e.brand, oem: e.oem })),
                site === 'true',
            );
            (data?.rows || []).forEach((row) => {
                [baseKey(row.brand, row.oem), baseKey('', row.oem)].forEach((k) => {
                    const prev = byKey.get(k);
                    if (!prev || (row.photos?.length || 0) > (prev.photos?.length || 0)) {
                        byKey.set(k, row);
                    }
                });
            });
        } catch {
            // без фото — ярлычок просто не появится
        }
        entries.forEach(([key, e]) => {
            cache.set(key, byKey.get(baseKey(e.brand, e.oem)) || null);
        });
    }));
    batch.forEach((_, key) => {
        (waiters.get(key) || []).forEach((fn) => fn(cache.get(key)));
        waiters.delete(key);
    });
};

const requestPhotos = (brand, oem, site) =>
    new Promise((resolve) => {
        const key = keyOf(brand, oem, site);
        if (cache.has(key)) {
            resolve(cache.get(key));
            return;
        }
        waiters.set(key, [...(waiters.get(key) || []), resolve]);
        queue.set(key, { brand: brand || null, oem: String(oem), site });
        if (!timer) timer = setTimeout(flush, 60);
    });

// Фото каталога + миниатюра с сайта. Если миниатюра уже пришла вместе со
// строкой (sitePhotoUrl), сервер сайт не опрашивает.
export const usePartPhotos = (brand, oem, sitePhotoUrl) => {
    const site = !sitePhotoUrl;
    const [catalog, setCatalog] = useState(() => cache.get(keyOf(brand, oem, site)) || null);
    useEffect(() => {
        if (!oem) return undefined;
        let alive = true;
        requestPhotos(brand, oem, site).then((row) => alive && setCatalog(row));
        return () => {
            alive = false;
        };
    }, [brand, oem, site]);
    const photos = [...(catalog?.photos || [])];
    if (sitePhotoUrl && !photos.includes(sitePhotoUrl)) photos.push(sitePhotoUrl);
    return { photos, name: catalog?.name || null };
};
