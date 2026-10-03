import { useEffect, useState } from 'react';
import { lookupPartPhotos } from '../api/autoparts.js';

// ── Пакетная подгрузка фото каталога ────────────────────────────────────────
// Ярлычков в таблице много: собираем их запросы в один POST и кэшируем.

const cache = new Map();
const waiters = new Map();
let queue = new Map();
let timer = null;

const keyOf = (brand, oem) =>
    `${String(brand || '').trim().toLowerCase()}|${String(oem || '')
        .toUpperCase()
        .replace(/[^0-9A-ZА-Я]/g, '')}`;

const flush = async () => {
    timer = null;
    const batch = queue;
    queue = new Map();
    const items = [...batch.values()];
    try {
        const { data } = await lookupPartPhotos(items);
        const byKey = new Map();
        (data?.rows || []).forEach((row) => {
            [keyOf(row.brand, row.oem), keyOf('', row.oem)].forEach((k) => {
                const prev = byKey.get(k);
                if (!prev || (row.photos?.length || 0) > (prev.photos?.length || 0)) {
                    byKey.set(k, row);
                }
            });
        });
        batch.forEach((_, key) => cache.set(key, byKey.get(key) || null));
    } catch {
        batch.forEach((_, key) => cache.set(key, null));
    }
    batch.forEach((_, key) => {
        (waiters.get(key) || []).forEach((fn) => fn(cache.get(key)));
        waiters.delete(key);
    });
};

const requestCatalog = (brand, oem) =>
    new Promise((resolve) => {
        const key = keyOf(brand, oem);
        if (cache.has(key)) {
            resolve(cache.get(key));
            return;
        }
        waiters.set(key, [...(waiters.get(key) || []), resolve]);
        queue.set(key, { brand: brand || null, oem: String(oem) });
        if (!timer) timer = setTimeout(flush, 60);
    });

// Фото из каталога + (необязательно) миниатюра, пришедшая с сайта.
export const usePartPhotos = (brand, oem, sitePhotoUrl) => {
    const [catalog, setCatalog] = useState(() => cache.get(keyOf(brand, oem)) || null);
    useEffect(() => {
        if (!oem) return undefined;
        let alive = true;
        requestCatalog(brand, oem).then((row) => alive && setCatalog(row));
        return () => {
            alive = false;
        };
    }, [brand, oem]);
    const photos = [...(catalog?.photos || [])];
    if (sitePhotoUrl && !photos.includes(sitePhotoUrl)) photos.push(sitePhotoUrl);
    return { photos, name: catalog?.name || null };
};
