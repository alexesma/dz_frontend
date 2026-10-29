import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Descriptions, List, Space, Tag, Typography } from 'antd';

import { resolveScanCode } from '../api/inventory';
import { keyEventToChar, normalizeScanCode } from '../utils/scanCode';

const { Paragraph, Text, Title } = Typography;
const IDLE_MS = 400;

const analyse = (events) => {
    const chars = events.filter((e) => e.char && e.key !== 'Enter');
    const text = chars.map((e) => e.char).join('');
    const rawKeys = events.filter((e) => e.key.length === 1).map((e) => e.key).join('');
    const last = events[events.length - 1];
    const gaps = events.slice(1).map((e, i) => e.at - events[i].at);
    const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
    const cyrillic = /[а-яё]/i.test(rawKeys);
    const caseMismatch = !cyrillic && rawKeys.toLowerCase() === text.toLowerCase() && rawKeys !== text;
    const findings = [];
    if (last?.key === 'Enter') findings.push({ ok: true, text: 'Суффикс Enter есть: скан завершается сам.' });
    else if (last?.key === 'Tab') findings.push({ ok: false, text: 'Сканер заканчивает код клавишей Tab. Нужен суффикс Enter.' });
    else findings.push({ ok: false, text: 'После кода нет Enter. Включите суффикс Enter в настройках сканера.' });
    if (cyrillic) findings.push({ ok: false, text: 'Сейчас включена русская раскладка: на экране буквы русские. Система это исправляет сама, но надёжнее переключить на English (US) на компьютере или в сканере.' });
    else findings.push({ ok: true, text: 'Латиница приходит без искажений.' });
    if (caseMismatch) findings.push({ ok: false, text: 'Регистр букв перепутан (похоже на Caps Lock). Отключите Caps Lock или включите в сканере «игнорировать Caps Lock».' });
    if (avgGap == null) findings.push({ ok: false, text: 'Слишком короткий ввод для оценки скорости.' });
    else if (avgGap > 80) findings.push({ ok: false, text: `Средняя пауза между символами ${avgGap.toFixed(0)} мс: похоже на ручной ввод или очень медленный сканер. Система может не принять такой скан.` });
    else findings.push({ ok: true, text: `Скорость ввода нормальная (${avgGap.toFixed(0)} мс на символ).` });
    if (events.some((e) => e.key === 'Tab' && e !== last)) findings.push({ ok: true, text: 'Внутри кода есть Tab (так у Toyota): система разберёт его как разделитель.' });
    return { text, normalized: normalizeScanCode(text), rawKeys, last, avgGap, findings, length: chars.length };
};

// Страница проверки сканера: показывает, что именно «набирает» сканер.
const ScannerTestPage = () => {
    const [result, setResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [found, setFound] = useState(null);
    const burst = useRef([]);
    const timer = useRef(null);

    useEffect(() => {
        const finish = () => {
            const events = burst.current;
            burst.current = [];
            if (events.length < 2) return;
            const next = analyse(events);
            setResult(next);
            setFound(null);
            setHistory((prev) => [{ ...next, key: Date.now() }, ...prev].slice(0, 10));
        };
        const onKeyDown = (event) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (['Shift', 'CapsLock', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
            event.preventDefault();
            clearTimeout(timer.current);
            burst.current.push({
                key: event.key, code: event.code, at: performance.now(),
                char: event.key === 'Tab' ? '\t' : keyEventToChar(event),
            });
            if (event.key === 'Enter') finish();
            else timer.current = setTimeout(finish, IDLE_MS);
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => { window.removeEventListener('keydown', onKeyDown, true); clearTimeout(timer.current); };
    }, []);

    const lookup = async () => {
        try {
            setFound((await resolveScanCode(result.normalized.trim())).data);
        } catch (error) {
            setFound({ error: error?.response?.status === 404 ? 'Код не найден в системе' : 'Ошибка распознавания' });
        }
    };

    return <div style={{ maxWidth: 760, margin: '0 auto', padding: 12 }}>
        <Title level={4} style={{ marginTop: 0 }}>Проверка сканера</Title>
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
            message="Отсканируйте любой штрихкод. Страница покажет, что пришло от сканера, и подскажет, что настроить. Лучше проверить и при русской, и при английской раскладке." />
        {!result && <Card><Text type="secondary">Ждём скан…</Text></Card>}
        {result && <Card size="small" title="Последний скан">
            <Descriptions size="small" column={1} items={[
                { key: 't', label: 'Получено', children: <Text code>{JSON.stringify(result.text)}</Text> },
                { key: 'r', label: 'Как «видит» браузер', children: <Text code>{JSON.stringify(result.rawKeys)}</Text> },
                { key: 'l', label: 'Длина', children: result.length },
                { key: 'e', label: 'Завершение', children: result.last?.key === 'Enter' ? 'Enter' : result.last?.key },
            ]} />
            <List size="small" dataSource={result.findings} renderItem={(item) => <List.Item>
                <Tag color={item.ok ? 'green' : 'red'}>{item.ok ? 'ОК' : 'Исправить'}</Tag> {item.text}
            </List.Item>} />
            <Space style={{ marginTop: 8 }}>
                <Button onClick={lookup}>Найти в системе</Button>
                {found && <Text>{found.error || `${found.title} (${found.kind})`}</Text>}
            </Space>
        </Card>}
        {history.length > 1 && <Card size="small" title="Предыдущие" style={{ marginTop: 12 }}>
            {history.slice(1).map((row) => <Paragraph key={row.key} style={{ margin: 0 }}>
                <Text code>{row.text}</Text> {row.avgGap != null && <Text type="secondary">{row.avgGap.toFixed(0)} мс</Text>}
            </Paragraph>)}
        </Card>}
        <Card size="small" title="Если настройки сбились" style={{ marginTop: 12 }}>
            <Paragraph style={{ margin: 0 }}>
                В инструкции к сканеру найдите служебные штрихкоды и считайте по порядку: «Восстановить
                заводские настройки», затем «USB HID Keyboard», затем «Суффикс Enter» (Add CR / Enter),
                раскладка English (US), отключить Caps Lock-режим. Модель и бренд сканера подскажите мне,
                и я напишу точный порядок.
            </Paragraph>
        </Card>
    </div>;
};

export default ScannerTestPage;
