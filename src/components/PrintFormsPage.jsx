import React, { useEffect, useRef, useState } from 'react';
import {
    Alert, Button, Card, Input, InputNumber, Select, Space, Switch, Tabs,
    Typography, message,
} from 'antd';
import { DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';

import { getPrintForms, savePrintForm } from '../api/printForms';
import ShipmentDocumentsPanel from './ShipmentDocumentsPanel';
import {
    PRINT_FIELD_LABELS, PRINT_FORM_CATALOG, PRINT_FORMS_CHANGED_EVENT,
    freshDefaultForm, getFieldValue,
} from '../utils/printFormTemplates';

const { Title, Text } = Typography;
const SCALE = 8;
const round = (value) => Math.round(value * 10) / 10;

const PrintFormsPage = () => {
    const [saved, setSaved] = useState({});
    const [key, setKey] = useState('product');
    const [form, setForm] = useState(freshDefaultForm('product'));
    const [selectedId, setSelectedId] = useState(null);
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const drag = useRef(null);

    useEffect(() => {
        getPrintForms().then(({ data }) => {
            const forms = Object.fromEntries((data || []).map((row) => [row.key, row]));
            setSaved(forms);
            setForm(forms.product || freshDefaultForm('product'));
        }).catch(() => message.error('Не удалось загрузить печатные формы'));
    }, []);

    const selectForm = (nextKey) => {
        if (dirty && !window.confirm('Изменения не сохранены. Перейти к другой форме?')) return;
        setKey(nextKey);
        setForm(saved[nextKey] || freshDefaultForm(nextKey));
        setSelectedId(null);
        setDirty(false);
    };

    const changeForm = (patch) => {
        setForm((current) => ({ ...current, ...patch }));
        setDirty(true);
    };

    const changeBlock = (id, patch) => {
        setForm((current) => ({ ...current, blocks: current.blocks.map((block) =>
            block.id === id ? { ...block, ...patch } : block) }));
        setDirty(true);
    };

    const selected = form.blocks.find((block) => block.id === selectedId);
    const sample = PRINT_FORM_CATALOG[key].sample;
    const suggestedFields = PRINT_FORM_CATALOG[key].fields;

    const addBlock = (kind, field = '') => {
        const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const block = {
            id, kind, field: kind === 'barcode' ? 'barcode' : field,
            text: kind === 'text' && !field ? 'Новый текст' : '',
            x: 3, y: 3, width: Math.min(30, form.width_mm - 3),
            height: kind === 'barcode' ? 9 : 6,
            font_size: 9, bold: false, align: 'left',
        };
        changeForm({ blocks: [...form.blocks, block] });
        setSelectedId(id);
    };

    const save = async () => {
        setBusy(true);
        try {
            const { data } = await savePrintForm(key, {
                width_mm: form.width_mm,
                height_mm: form.height_mm,
                blocks: form.blocks,
            });
            setForm(data);
            setSaved((current) => ({ ...current, [key]: data }));
            setDirty(false);
            window.dispatchEvent(new Event(PRINT_FORMS_CHANGED_EVENT));
            message.success('Форма сохранена для всех сотрудников');
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(typeof detail === 'string' ? detail : 'Не удалось сохранить форму');
        } finally { setBusy(false); }
    };

    const pointerDown = (event, block) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
            id: block.id, x: event.clientX, y: event.clientY,
            startX: block.x, startY: block.y, width: block.width, height: block.height,
        };
        setSelectedId(block.id);
    };
    const pointerMove = (event) => {
        const current = drag.current;
        if (!current) return;
        changeBlock(current.id, {
            x: round(Math.max(0, Math.min(form.width_mm - current.width,
                current.startX + (event.clientX - current.x) / SCALE))),
            y: round(Math.max(0, Math.min(form.height_mm - current.height,
                current.startY + (event.clientY - current.y) / SCALE))),
        });
    };

    const labelEditor = <>
        <Alert showIcon type="info" style={{ marginBottom: 16 }}
            message="Выберите формат, перетащите блоки и сохраните макет. До первого сохранения действует прежний вид этикетки." />
        <Space wrap style={{ marginBottom: 16 }}>
            <Select value={key} style={{ minWidth: 300 }} onChange={selectForm}
                options={Object.entries(PRINT_FORM_CATALOG).map(([value, config]) => ({
                    value, label: config.title,
                }))} />
            <Button type="primary" icon={<SaveOutlined />} loading={busy}
                disabled={!dirty} onClick={save}>Сохранить для всех</Button>
            <Button onClick={() => { changeForm(freshDefaultForm(key)); setSelectedId(null); }}>
                Исходный макет
            </Button>
        </Space>
        <Space wrap style={{ marginBottom: 16 }}>
            <Text>Ширина, мм</Text>
            <InputNumber min={20} max={210} value={form.width_mm} onChange={(value) => {
                if (value) changeForm({ width_mm: value });
            }} />
            <Text>Высота, мм</Text>
            <InputNumber min={15} max={297} value={form.height_mm} onChange={(value) => {
                if (value) changeForm({ height_mm: value });
            }} />
            <Select placeholder="Добавить поле" style={{ width: 190 }} value={null}
                onChange={(value) => addBlock('text', value)}
                options={suggestedFields.map((value) => ({
                    value, label: `${PRINT_FIELD_LABELS[value] || value} · ${value}`,
                }))} />
            <Button icon={<PlusOutlined />} onClick={() => addBlock('text')}>
                Свой текст
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => addBlock('barcode')}>
                Штрихкод
            </Button>
        </Space>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ overflow: 'auto', maxWidth: '100%' }}>
                <div style={{ position: 'relative', width: form.width_mm * SCALE,
                    height: form.height_mm * SCALE, background: '#fff',
                    border: '1px solid #9aa5b1', boxShadow: '0 6px 24px #dbe2e8' }}>
                    {form.blocks.map((block) => {
                        const value = block.field ? getFieldValue(sample, block.field) : '';
                        return <div key={block.id}
                            onPointerDown={(event) => pointerDown(event, block)}
                            onPointerMove={pointerMove}
                            onPointerUp={() => { drag.current = null; }}
                            style={{ position: 'absolute', left: block.x * SCALE,
                                top: block.y * SCALE, width: block.width * SCALE,
                                height: block.height * SCALE, overflow: 'hidden',
                                border: selectedId === block.id
                                    ? '2px solid #1677ff' : '1px dashed #9aa5b1',
                                cursor: 'move', touchAction: 'none', userSelect: 'none',
                                fontSize: block.font_size * 1.3,
                                fontWeight: block.bold ? 700 : 400,
                                textAlign: block.align, whiteSpace: 'nowrap' }}>
                            {block.kind === 'barcode'
                                ? <span style={{ letterSpacing: 2 }}>▥▥▥ {value || 'Штрихкод'}</span>
                                : `${block.text || ''}${value ?? ''}`}
                        </div>;
                    })}
                </div>
            </div>
            <Card title={selected ? 'Параметры блока' : 'Выберите блок'}
                style={{ width: 330, maxWidth: '100%' }} size="small">
                {selected ? <Space direction="vertical" style={{ width: '100%' }}>
                    <Text>Поле данных</Text>
                    <Input value={selected.field} placeholder="например, order_number"
                        onChange={(event) => changeBlock(selected.id, { field: event.target.value })} />
                    {selected.kind === 'text' && <><Text>Текст перед значением</Text>
                        <Input value={selected.text} placeholder="Например, Заказ № "
                            onChange={(event) => changeBlock(selected.id, { text: event.target.value })} /></>}
                    <Space wrap>
                        {['x', 'y', 'width', 'height'].map((name) => <span key={name}>
                            <Text>{name}, мм</Text><br />
                            <InputNumber size="small" min={0} max={300} step={0.5}
                                value={selected[name]} style={{ width: 76 }}
                                onChange={(value) => { if (value !== null) changeBlock(selected.id, { [name]: value }); }} />
                        </span>)}
                    </Space>
                    {selected.kind === 'text' && <Space wrap>
                        <span><Text>Размер, pt</Text><br /><InputNumber min={4} max={40}
                            value={selected.font_size} onChange={(value) => {
                                if (value) changeBlock(selected.id, { font_size: value });
                            }} /></span>
                        <span><Text>Жирный</Text><br /><Switch checked={selected.bold}
                            onChange={(value) => changeBlock(selected.id, { bold: value })} /></span>
                    </Space>}
                    <Select value={selected.align}
                        onChange={(value) => changeBlock(selected.id, { align: value })}
                        options={[{ value: 'left', label: 'Слева' },
                            { value: 'center', label: 'По центру' },
                            { value: 'right', label: 'Справа' }]} />
                    <Button danger icon={<DeleteOutlined />} onClick={() => {
                        changeForm({ blocks: form.blocks.filter((block) => block.id !== selected.id) });
                        setSelectedId(null);
                    }}>Удалить блок</Button>
                </Space> : <Text type="secondary">Нажмите на блок на этикетке.</Text>}
            </Card>
        </div>
    </>;

    return <div style={{ padding: 24 }}>
        <Title level={4}>Печатные формы</Title>
        <Tabs items={[
            { key: 'labels', label: 'Этикетки', children: labelEditor },
            { key: 'documents', label: 'Документы реализации', children: <ShipmentDocumentsPanel /> },
        ]} />
    </div>;
};

export default PrintFormsPage;
