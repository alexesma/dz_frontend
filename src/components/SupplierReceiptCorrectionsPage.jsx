import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, DatePicker, Input, InputNumber, Select, Space, Table, Tag, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import {
    createSupplierReceiptCorrection,
    downloadSupplierReceiptCorrectionAttachment,
    getSupplierReceipt,
    getSupplierReceiptCorrectionOptions,
    getSupplierReceiptCorrections,
    postSupplierReceiptCorrection,
    updateSupplierReceiptCorrection,
} from '../api/customerOrders';

const { Title, Text } = Typography;
const errorText = (error) => error?.response?.data?.detail || 'Не удалось выполнить действие';

export default function SupplierReceiptCorrectionsPage() {
    const [corrections, setCorrections] = useState([]);
    const [receipts, setReceipts] = useState([]);
    const [selected, setSelected] = useState(null);
    const [receipt, setReceipt] = useState(null);
    const [receiptId, setReceiptId] = useState(null);
    const [number, setNumber] = useState('');
    const [documentDate, setDocumentDate] = useState(null);
    const [comment, setComment] = useState('');
    const [quantities, setQuantities] = useState({});
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        const [correctionResponse, receiptResponse] = await Promise.all([
            getSupplierReceiptCorrections(),
            getSupplierReceiptCorrectionOptions(),
        ]);
        setCorrections(correctionResponse.data || []);
        setReceipts(receiptResponse.data || []);
    }, []);

    useEffect(() => { refresh().catch((error) => message.error(errorText(error))); }, [refresh]);

    const openReceipt = useCallback(async (id, correction = null) => {
        setReceiptId(id);
        if (!id) { setReceipt(null); setQuantities({}); return; }
        try {
            const response = await getSupplierReceipt(id);
            const row = response.data;
            setReceipt(row);
            setReceipts((previous) => previous.some((option) => Number(option.id) === Number(row.id))
                ? previous : [{ id: row.id, provider_id: row.provider_id, provider_name: row.provider_name, document_number: row.document_number }, ...previous]);
            const corrected = Object.fromEntries((correction?.items || []).map((item) => [item.receipt_item_id, item.quantity_after]));
            const prior = corrections.filter((item) => item.status === 'posted' && Number(item.receipt_id) === Number(id));
            setQuantities(Object.fromEntries((row.items || []).map((item) => {
                const delta = prior.flatMap((entry) => entry.items || [])
                    .filter((entry) => Number(entry.receipt_item_id) === Number(item.id))
                    .reduce((sum, entry) => sum + Number(entry.quantity_delta || 0), 0);
                return [item.id, corrected[item.id] ?? Math.max(0, Number(item.received_quantity || 0) - delta)];
            })));
        } catch (error) {
            message.error(errorText(error));
        }
    }, [corrections]);

    const openCorrection = (row) => {
        setSelected(row);
        getSupplierReceiptCorrectionOptions({ provider_id: row.provider_id })
            .then((response) => setReceipts(response.data || []))
            .catch((error) => message.error(errorText(error)));
        setNumber(row.document_number || '');
        setDocumentDate(row.document_date ? dayjs(row.document_date) : null);
        setComment(row.comment || '');
        openReceipt(row.receipt_id, row);
    };

    const startManual = () => {
        setSelected(null);
        getSupplierReceiptCorrectionOptions()
            .then((response) => setReceipts(response.data || []))
            .catch((error) => message.error(errorText(error)));
        setReceipt(null);
        setReceiptId(null);
        setNumber('');
        setDocumentDate(null);
        setComment('');
        setQuantities({});
    };

    const selectedReceipt = useMemo(() => receipts.find((row) => Number(row.id) === Number(receiptId)), [receipts, receiptId]);
    const searchReceipts = async (query) => {
        try {
            const response = await getSupplierReceiptCorrectionOptions({
                query: query || undefined,
                provider_id: selected?.provider_id || undefined,
            });
            setReceipts((previous) => {
                const current = previous.find((row) => Number(row.id) === Number(receiptId));
                const results = response.data || [];
                return current && !results.some((row) => Number(row.id) === Number(current.id))
                    ? [current, ...results] : results;
            });
        } catch (error) {
            message.error(errorText(error));
        }
    };
    const changedItems = (receipt?.items || []).filter((item) => Number(quantities[item.id]) < Number(item.received_quantity || 0))
        .map((item) => ({ receipt_item_id: item.id, quantity_after: Number(quantities[item.id]) }));

    const save = async (postNow = false) => {
        if (!receiptId) { message.warning('Выберите исходный приход'); return; }
        if (!changedItems.length) { message.warning('Уменьшите количество хотя бы в одной строке'); return; }
        setBusy(true);
        try {
            const payload = {
                receipt_id: Number(receiptId),
                document_number: number || null,
                document_date: documentDate?.format('YYYY-MM-DD') || null,
                comment: comment || null,
                items: changedItems,
            };
            const saved = selected
                ? await updateSupplierReceiptCorrection(selected.id, payload)
                : await createSupplierReceiptCorrection(payload);
            if (postNow) await postSupplierReceiptCorrection(saved.data.id);
            message.success(postNow ? 'КСФ проведена' : 'Черновик КСФ сохранён');
            await refresh();
            startManual();
        } catch (error) {
            message.error(errorText(error));
        } finally {
            setBusy(false);
        }
    };

    const downloadAttachment = async (attachment) => {
        try {
            const response = await downloadSupplierReceiptCorrectionAttachment(selected.id, attachment.id);
            const url = URL.createObjectURL(response.data);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = attachment.filename;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            message.error(errorText(error));
        }
    };

    return <div style={{ padding: 24 }}>
        <Title level={3}>Корректировки поступлений (КСФ/УКД)</Title>
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Письмо или документ из Диадока создаёт черновик. Сопоставьте его с исходным приходом, укажите итоговое количество по исправленным строкам и проведите после проверки. Исходный приход сохраняется." />
        <Card title="Полученные и созданные КСФ" style={{ marginBottom: 16 }} extra={<Button onClick={startManual}>Новая вручную</Button>}>
            <Table rowKey="id" size="small" dataSource={corrections} pagination={{ pageSize: 10 }}
                columns={[
                    { title: 'КСФ', dataIndex: 'document_number', render: (value, row) => value || `#${row.id}` },
                    { title: 'Источник', dataIndex: 'source_kind', render: (value) => ({ email: 'Почта', diadoc: 'Диадок', manual: 'Менеджер' }[value] || value) },
                    { title: 'Поставщик', dataIndex: 'provider_id' },
                    { title: 'Приход', dataIndex: 'receipt_id', render: (value) => value ? <Link to={`/documents/incoming?openId=${value}`}>#{value}</Link> : 'Не сопоставлен' },
                    { title: 'Состояние', dataIndex: 'status', render: (value) => <Tag color={value === 'posted' ? 'green' : 'orange'}>{value === 'posted' ? 'Проведена' : 'Проверить'}</Tag> },
                    { title: '', render: (_, row) => <Button size="small" onClick={() => openCorrection(row)}>{row.status === 'posted' ? 'Просмотр' : 'Обработать'}</Button> },
                ]} />
        </Card>
        <Card title={selected ? `КСФ #${selected.id}` : 'Новая КСФ'}>
            {selected?.source_subject && <Alert type="info" style={{ marginBottom: 12 }} message={`Источник: ${selected.source_subject}`} description={selected.source_preview || undefined} />}
            {selected?.attachments?.length > 0 && <Space wrap style={{ marginBottom: 12 }}>
                {selected.attachments.map((attachment) => <Button key={attachment.id} size="small" onClick={() => downloadAttachment(attachment)}>{attachment.filename}</Button>)}
            </Space>}
            <Space wrap style={{ marginBottom: 16 }}>
                <Select showSearch filterOption={false} onSearch={searchReceipts} style={{ width: 330 }} placeholder="Исходный проведённый приход: поиск по №" value={receiptId}
                    disabled={selected?.status === 'posted'} onChange={(value) => openReceipt(value, selected)}
                    options={receipts.filter((row) => !selected || Number(row.provider_id) === Number(selected.provider_id)).map((row) => ({
                        value: row.id, label: `#${row.id} ${row.provider_name || `Поставщик ${row.provider_id}`} ${row.document_number || ''}`,
                    }))} />
                <Input placeholder="Номер КСФ" style={{ width: 170 }} value={number} disabled={selected?.status === 'posted'} onChange={(event) => setNumber(event.target.value)} />
                <DatePicker placeholder="Дата КСФ" value={documentDate} disabled={selected?.status === 'posted'} onChange={setDocumentDate} />
                <Input placeholder="Комментарий" style={{ width: 280 }} value={comment} disabled={selected?.status === 'posted'} onChange={(event) => setComment(event.target.value)} />
            </Space>
            {receipt && <>
                <Text>Исходный приход: {selectedReceipt?.document_number || `#${receipt.id}`}. Количество в нём не меняется.</Text>
                <Table rowKey="id" size="small" pagination={false} dataSource={receipt.items || []} style={{ marginTop: 12 }}
                    columns={[
                        { title: 'Артикул', dataIndex: 'oem_number' },
                        { title: 'Бренд', dataIndex: 'brand_name' },
                        { title: 'В исходном приходе', dataIndex: 'received_quantity' },
                        { title: 'Итог по КСФ', render: (_, row) => <InputNumber min={0} max={Number(row.received_quantity || 0)} value={quantities[row.id]} disabled={selected?.status === 'posted'} onChange={(value) => setQuantities((previous) => ({ ...previous, [row.id]: value }))} /> },
                    ]} />
                {selected?.status !== 'posted' && <Space style={{ marginTop: 16 }}>
                    <Button disabled={busy} onClick={() => save(false)}>Сохранить черновик</Button>
                    <Button type="primary" loading={busy} onClick={() => save(true)}>Провести КСФ</Button>
                </Space>}
            </>}
        </Card>
    </div>;
}
