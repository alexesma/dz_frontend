import { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import { enqueuePrintJob, getMyPrinters } from '../api/printJobs';
import { openLabelPrintWindow } from './labelPrint';

export function usePrintDelivery(kind = 'label') {
    const [printers, setPrinters] = useState(null);
    const uncertainRequests = useRef(new Map());
    useEffect(() => {
        let active = true;
        const refresh = () => getMyPrinters()
            .then(({ data }) => { if (active) setPrinters(data); })
            .catch(() => { if (active) setPrinters((current) => current || { label: [], a4: [] }); });
        void refresh();
        window.addEventListener('focus', refresh);
        const timer = window.setInterval(refresh, 60000);
        return () => {
            active = false;
            window.removeEventListener('focus', refresh);
            window.clearInterval(timer);
        };
    }, []);

    const printHtml = useCallback(async (html, title, browserFallback) => {
        if (!printers) throw new Error('Настройки печати загружаются. Повторите попытку.');
        const printer = (printers[kind] || []).find((row) => row.is_default);
        if (printer) {
            const signature = `${kind}|${title}|${html}`;
            const requestKey = uncertainRequests.current.get(signature) || crypto.randomUUID();
            uncertainRequests.current.set(signature, requestKey);
            const { data } = await enqueuePrintJob({
                request_key: requestKey, kind, title, html, device_id: printer.id,
            });
            uncertainRequests.current.delete(signature);
            message[printer.online ? 'success' : 'warning'](
                `Задание #${data.id} в очереди: ${printer.display_name}`
                + (printer.online ? '' : ' (компьютер принтера не отвечает)'),
            );
            return { queued: true, job: data };
        }
        const opened = browserFallback
            ? browserFallback()
            : openLabelPrintWindow(html);
        if (!opened) throw new Error('Браузер заблокировал окно печати');
        return { queued: false };
    }, [kind, printers]);

    const printUrl = useCallback(async (url, title) => {
        if (!printers) throw new Error('Настройки печати загружаются. Повторите попытку.');
        if (!(printers[kind] || []).some((row) => row.is_default)) {
            if (!window.open(url, '_blank')) throw new Error('Браузер заблокировал окно печати');
            return { queued: false };
        }
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) throw new Error(`Не удалось получить документ: HTTP ${response.status}`);
        return printHtml(await response.text(), title);
    }, [kind, printers, printHtml]);

    return { printHtml, printUrl, printers, ready: printers !== null };
}
