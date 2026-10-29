import { useEffect, useRef } from 'react';

import { keyEventToChar, normalizeScanCode } from './scanCode';

// Пауза между символами сканера мала (USB ~5–30 мс, Bluetooth до ~100 мс);
// человек печатает заметно медленнее, поэтому смотрим на среднюю скорость.
const MAX_KEY_GAP_MS = 250;
const MAX_AVG_GAP_MS = 80;
const MIN_CODE_LENGTH = 4;

// Сколько страниц сейчас сами обрабатывают скан; глобальный обработчик
// (fallback) в это время молчит, чтобы код не обработался дважды.
let pageScanners = 0;

const isTypingTarget = (target) => {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

/**
 * Перехватывает ввод сканера-«клавиатуры» (USB/Bluetooth): быстрая серия
 * символов, завершённая Enter. Поля ввода не трогаем — там сканер просто
 * печатает значение, а Enter обрабатывает само поле.
 */
export const useBarcodeScanner = (onScan, enabled = true, { fallback = false } = {}) => {
    const handlerRef = useRef(onScan);
    handlerRef.current = onScan;

    useEffect(() => {
        if (!enabled) return undefined;
        if (!fallback) pageScanners += 1;
        let buffer = '';
        let lastAt = 0;
        let startedAt = 0;
        let burstField = null;
        let burstValue = '';
        // Глобальный сканер работает и когда курсор стоит в поле ввода (например в поиске):
        // после распознавания возвращаем в поле то, что было до скана.
        const restoreField = () => {
            if (!burstField || !('value' in burstField)) return;
            const proto = Object.getPrototypeOf(burstField);
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) {
                setter.call(burstField, burstValue);
                burstField.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };
        const onKeyDown = (event) => {
            if (fallback && pageScanners > 0) return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            const typing = isTypingTarget(event.target);
            if (typing && !fallback) return;
            const now = Date.now();
            if (now - lastAt > MAX_KEY_GAP_MS) {
                buffer = '';
                startedAt = now;
                burstField = typing ? event.target : null;
                burstValue = typing && 'value' in event.target ? event.target.value : '';
            }
            lastAt = now;
            if (event.key === 'Enter') {
                const code = normalizeScanCode(buffer);
                const length = buffer.length;
                const avgGap = length > 1 ? (now - startedAt) / (length - 1) : Infinity;
                buffer = '';
                if (code.length >= MIN_CODE_LENGTH && avgGap <= MAX_AVG_GAP_MS) {
                    event.preventDefault();
                    event.stopPropagation();
                    restoreField();
                    handlerRef.current?.(code);
                }
                burstField = null;
                return;
            }
            // Tab у части оригинальных кодов (Toyota) — разделитель внутри скана;
            // без preventDefault он увёл бы фокус со страницы.
            if (event.key === 'Tab' && buffer) {
                event.preventDefault();
                buffer += '\t';
                return;
            }
            const char = keyEventToChar(event);
            if (char) buffer += char;
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => {
            if (!fallback) pageScanners -= 1;
            window.removeEventListener('keydown', onKeyDown, true);
        };
    }, [enabled, fallback]);
};

export default useBarcodeScanner;
