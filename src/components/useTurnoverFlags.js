import { useEffect, useState } from 'react';
import { getTurnoverFlags } from '../api/autoparts.js';

// Значок «топ» должен быть виден сразу при загрузке таблицы, поэтому
// флаги всех строк собираются в один запрос и кэшируются.
const cache = new Map();
const waiters = new Map();
let queue = new Set();
let timer = null;

const flush = async () => {
    timer = null;
    const ids = [...queue];
    queue = new Set();
    let found = new Map();
    try {
        const { data } = await getTurnoverFlags(ids);
        found = new Map((data?.flags || []).map((f) => [f.autopart_id, f]));
    } catch {
        ids.forEach((id) => waiters.delete(id));
        return;
    }
    ids.forEach((id) => {
        const flag = found.get(id) || { is_top: false, is_market_opportunity: false };
        cache.set(id, flag);
        (waiters.get(id) || []).forEach((fn) => fn(flag));
        waiters.delete(id);
    });
};

const request = (id) => new Promise((resolve) => {
    if (cache.has(id)) {
        resolve(cache.get(id));
        return;
    }
    waiters.set(id, [...(waiters.get(id) || []), resolve]);
    queue.add(id);
    if (!timer) timer = setTimeout(flush, 80);
});

export const useTurnoverFlags = (autopartId) => {
    const [flags, setFlags] = useState(() => cache.get(autopartId) || null);
    useEffect(() => {
        if (!autopartId) return undefined;
        let alive = true;
        request(autopartId).then((flag) => alive && setFlags(flag));
        return () => {
            alive = false;
        };
    }, [autopartId]);
    return flags;
};
