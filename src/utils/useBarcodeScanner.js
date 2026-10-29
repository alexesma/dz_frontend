import { useEffect, useRef } from 'react';

const MAX_KEY_GAP_MS = 60;
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
        const onKeyDown = (event) => {
            if (fallback && pageScanners > 0) return;
            if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
            const now = Date.now();
            if (now - lastAt > MAX_KEY_GAP_MS) buffer = '';
            lastAt = now;
            if (event.key === 'Enter') {
                const code = buffer.trim();
                buffer = '';
                if (code.length >= MIN_CODE_LENGTH) {
                    event.preventDefault();
                    handlerRef.current?.(code);
                }
                return;
            }
            if (event.key.length === 1) buffer += event.key;
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => {
            if (!fallback) pageScanners -= 1;
            window.removeEventListener('keydown', onKeyDown, true);
        };
    }, [enabled, fallback]);
};

export default useBarcodeScanner;
