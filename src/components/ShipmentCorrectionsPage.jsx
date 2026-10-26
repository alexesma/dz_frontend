import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert, Button, Card, DatePicker, Input, InputNumber, Select,
    Space, Table, Tag, Typography, message,
} from 'antd';
import dayjs from 'dayjs';
import { Link, useSearchParams } from 'react-router-dom';

import {
    createShipmentCorrection, getShipment,
    getShipmentCorrectionPrintUrl, listShipmentCorrections,
    listShipments, postShipmentCorrection, updateShipmentCorrection,
} from '../api/inventory';
import {
    createDiadocOutboundDocumentFromShipmentCorrection,
    getDiadocShipmentCorrectionReadiness, listDiadocOutboundDocuments,
} from '../api/diadoc';
import { usePrintDelivery } from '../utils/usePrintDelivery';

const { Title, Text } = Typography;
const errorText = (error) => {
    const detail = error?.response?.data?.detail;
    if (Array.isArray(detail)) return detail.map((item) => item.msg || String(item)).join('; ');
    return detail || error?.message || 'Ошибка';
};
const today = () => dayjs().format('YYYY-MM-DD');

export default function ShipmentCorrectionsPage() {
    const [searchParams] = useSearchParams();
    const initialShipmentId = Number(searchParams.get('shipmentId')) || null;
    const { printUrl } = usePrintDelivery('a4');
    const [corrections, setCorrections] = useState([]);
    const [shipmentOptions, setShipmentOptions] = useState([]);
    const [shipment, setShipment] = useState(null);
    const [sourceFunction, setSourceFunction] = useState('КСЧФДИС');
    const [selected, setSelected] = useState(null);
    const [values, setValues] = useState({});
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({
        doc_number: '', doc_date: today(), basis_number: '', basis_date: today(),
        basis_description: '', reason: '', document_function: 'КСЧФДИС',
    });

    const refresh = useCallback(async (shipmentId) => {
        const response = await listShipmentCorrections(
            shipmentId ? { shipment_id: shipmentId } : {}
        );
        setCorrections(response.data || []);
        return response.data || [];
    }, []);

    const searchShipments = useCallback(async (query = '') => {
        const { data } = await listShipments({
            limit: 50, status: 'posted', doc_number: query || undefined,
        });
        setShipmentOptions((data || [])
            .map((row) => ({
                value: row.id,
                label: `#${row.doc_number || row.id} · ${row.customer_name || '—'}`,
            })));
    }, []);

    const loadShipment = useCallback(async (id) => {
        if (!id) { setShipment(null); setSelected(null); return; }
        const [{ data }, rows, outbound] = await Promise.all([
            getShipment(id), refresh(id),
            listDiadocOutboundDocuments({ source_type: 'shipment_document', source_id: id })
                .then((response) => response.data || []).catch(() => []),
        ]);
        const source = outbound.find((row) => row.type_named_id === 'UniversalTransferDocument'
            && row.message_id && row.entity_id && !row.is_draft
            && !['error', 'rejected', 'revoked'].includes(row.status));
        const functionBySource = { ДОП: 'ДИС', СЧФ: 'КСЧФ', СЧФДОП: 'КСЧФДИС' };
        const nextFunction = functionBySource[source?.document_function] || 'КСЧФДИС';
        setSourceFunction(nextFunction);
        setShipment(data);
        setSelected(null);
        setValues({});
        setForm({
            doc_number: '', doc_date: today(), basis_number: '', basis_date: today(),
            basis_description: '', reason: '', document_function: nextFunction,
        });
        setShipmentOptions((previous) => previous.some((row) => row.value === id)
            ? previous : [{
                value: id,
                label: `#${data.doc_number || id} · ${data.customer_name || '—'}`,
            }, ...previous]);
        return rows;
    }, [refresh]);

    useEffect(() => {
        searchShipments().catch((error) => message.error(errorText(error)));
        if (initialShipmentId) loadShipment(initialShipmentId).catch((error) => message.error(errorText(error)));
        else refresh().catch((error) => message.error(errorText(error)));
    }, [initialShipmentId, loadShipment, refresh, searchShipments]);

    const currentValues = useMemo(() => {
        const result = Object.fromEntries((shipment?.items || []).map((row) => [
            row.id, { quantity: Number(row.quantity), price: Number(row.price || 0) },
        ]));
        [...corrections].reverse().filter((row) => row.status === 'posted').forEach((doc) => {
            doc.items.forEach((row) => {
                result[row.shipment_item_id] = {
                    quantity: Number(row.quantity_after),
                    price: Number(row.price_after),
                };
            });
        });
        return result;
    }, [shipment, corrections]);

    const openCorrection = async (doc) => {
        if (!shipment || Number(shipment.id) !== Number(doc.shipment_id)) {
            await loadShipment(doc.shipment_id);
        }
        setSelected(doc);
        setForm({
            doc_number: doc.doc_number, doc_date: doc.doc_date,
            basis_number: doc.basis_number, basis_date: doc.basis_date,
            basis_description: doc.basis_description, reason: doc.reason,
            document_function: doc.document_function,
        });
        setValues(Object.fromEntries(doc.items.map((row) => [
            row.shipment_item_id,
            { quantity: Number(row.quantity_after), price: Number(row.price_after) },
        ])));
    };

    const startNew = () => {
        setSelected(null);
        setValues({});
        setForm({
            doc_number: '', doc_date: today(), basis_number: '', basis_date: today(),
            basis_description: '', reason: '', document_function: sourceFunction,
        });
    };

    const changedItems = (shipment?.items || []).filter((row) => {
        const current = currentValues[row.id];
        const desired = values[row.id] || current;
        return current && desired && (
            Number(desired.quantity) !== Number(current.quantity)
            || Number(desired.price) !== Number(current.price)
        );
    }).map((row) => ({
        shipment_item_id: row.id,
        quantity_after: Number((values[row.id] || currentValues[row.id]).quantity),
        price_after: Number((values[row.id] || currentValues[row.id]).price),
    }));

    const save = async (postNow = false) => {
        if (!shipment) { message.warning('Выберите реализацию'); return; }
        if (Object.values(values).some((item) => item.quantity == null || item.price == null)) {
            message.warning('Заполните количество и цену для изменённых строк');
            return;
        }
        if (!changedItems.length) { message.warning('Измените количество или цену'); return; }
        setBusy(true);
        try {
            const payload = { ...form, shipment_id: shipment.id, items: changedItems };
            const { data } = selected
                ? await updateShipmentCorrection(selected.id, payload)
                : await createShipmentCorrection(payload);
            const result = postNow ? (await postShipmentCorrection(data.id)).data : data;
            await refresh(shipment.id);
            setSelected(result);
            message.success(postNow ? 'Корректировка проведена' : 'Черновик сохранён');
        } catch (error) {
            message.error(errorText(error));
        } finally { setBusy(false); }
    };

    const createDiadoc = async () => {
        if (!selected) return;
        setBusy(true);
        try {
            const { data: readiness } = await getDiadocShipmentCorrectionReadiness(selected.id);
            if (!readiness.ready_formalized) {
                message.error(readiness.missing_required_fields.join('; '));
                return;
            }
            const { data } = await createDiadocOutboundDocumentFromShipmentCorrection(
                selected.id, { send_mode: 'draft' }
            );
            await refresh(shipment.id);
            setSelected((current) => ({ ...current, diadoc_outgoing_document_id: data.id }));
            message.success('Черновик УКД создан в Диадоке. Подпишите его в разделе «Диадок».');
        } catch (error) { message.error(errorText(error)); }
        finally { setBusy(false); }
    };

    const print = async (formalized = false) => {
        if (!selected) return;
        try {
            await printUrl(
                getShipmentCorrectionPrintUrl(selected.id, formalized),
                `УКД ${selected.doc_number}`
            );
        } catch (error) { message.error(errorText(error)); }
    };

    const editable = Boolean(shipment && selected?.status !== 'posted');
    return <div style={{ padding: 24 }}>
        <Title level={3}>Корректировки реализаций — УКД</Title>
        <Alert showIcon type="info" style={{ marginBottom: 16 }}
            message="Укажите согласованное изменение количества или цены по проведённой реализации с НДС 22%. Исходный документ и складские остатки сохраняются."
            description="Основание изменения обязательно. После проведения создаётся событие обмена с 1С; формализованный УКД создаётся в Диадоке отдельно." />
        <Card title="Документы" style={{ marginBottom: 16 }} extra={<Button onClick={startNew}>Новая корректировка</Button>}>
            <Table rowKey="id" size="small" dataSource={corrections} pagination={{ pageSize: 10 }}
                columns={[
                    { title: 'УКД', dataIndex: 'doc_number', render: (value, row) => value || `#${row.id}` },
                    { title: 'Реализация', dataIndex: 'shipment_number', render: (value, row) => <Link to={`/warehouse/shipments/${row.shipment_id}`}>#{value || row.shipment_id}</Link> },
                    { title: 'Дата', dataIndex: 'doc_date', render: (value) => dayjs(value).format('DD.MM.YYYY') },
                    { title: 'Статус', dataIndex: 'status', render: (value) => <Tag color={value === 'posted' ? 'green' : 'orange'}>{value === 'posted' ? 'Проведена' : 'Черновик'}</Tag> },
                    { title: '1С', dataIndex: 'sync_status', render: (value) => <Tag>{value}</Tag> },
                    { title: 'Диадок', dataIndex: 'diadoc_outgoing_document_id', render: (value) => value ? <Link to="/documents/diadoc">УКД #{value}</Link> : '—' },
                    { title: '', render: (_, row) => <Button size="small" onClick={() => openCorrection(row).catch((error) => message.error(errorText(error)))}>Открыть</Button> },
                ]} />
        </Card>
        <Card title={selected ? `Корректировка #${selected.id}` : 'Новая корректировка'}>
            <Space wrap style={{ marginBottom: 16 }}>
                <Select showSearch filterOption={false} onSearch={(value) => searchShipments(value).catch(() => {})}
                    style={{ width: 340 }} options={shipmentOptions} value={shipment?.id}
                    disabled={Boolean(selected)} placeholder="Проведённая реализация"
                    onChange={(id) => loadShipment(id).catch((error) => message.error(errorText(error)))} />
                {shipment && <Link to={`/warehouse/shipments/${shipment.id}`}>Открыть реализацию</Link>}
            </Space>
            {shipment && <>
                <Space wrap style={{ marginBottom: 16 }}>
                    <Input placeholder="Номер УКД" style={{ width: 150 }} value={form.doc_number} disabled={!editable}
                        onChange={(event) => setForm((old) => ({ ...old, doc_number: event.target.value }))} />
                    <DatePicker value={dayjs(form.doc_date)} disabled={!editable}
                        onChange={(value) => setForm((old) => ({ ...old, doc_date: value?.format('YYYY-MM-DD') || '' }))} />
                    <Select value={form.document_function} disabled={!editable} style={{ width: 185 }}
                        options={[{ value: 'ДИС', label: 'ДИС — изменение' }, { value: 'КСЧФ', label: 'КСЧФ — корректировочный счёт-фактура' }, { value: 'КСЧФДИС', label: 'КСЧФДИС — с КСФ' }]}
                        onChange={(value) => setForm((old) => ({ ...old, document_function: value }))} />
                    <Input placeholder="Документ-основание" style={{ width: 200 }} value={form.basis_description} disabled={!editable}
                        onChange={(event) => setForm((old) => ({ ...old, basis_description: event.target.value }))} />
                    <Input placeholder="№ основания" style={{ width: 145 }} value={form.basis_number} disabled={!editable}
                        onChange={(event) => setForm((old) => ({ ...old, basis_number: event.target.value }))} />
                    <DatePicker value={form.basis_date ? dayjs(form.basis_date) : null} disabled={!editable}
                        onChange={(value) => setForm((old) => ({ ...old, basis_date: value?.format('YYYY-MM-DD') || '' }))} />
                    <Input placeholder="Причина изменения" style={{ width: 270 }} value={form.reason} disabled={!editable}
                        onChange={(event) => setForm((old) => ({ ...old, reason: event.target.value }))} />
                </Space>
                <Table rowKey="id" size="small" pagination={false} dataSource={shipment.items || []}
                    columns={[
                        { title: 'Артикул', render: (_, row) => row.customer_oem || row.oem_number || '—' },
                        { title: 'Бренд / товар', render: (_, row) => `${row.customer_brand || row.brand_name || ''} ${row.customer_name || row.name || ''}` },
                        { title: 'Кол-во до', render: (_, row) => selected?.status === 'posted'
                            ? selected.items.find((item) => item.shipment_item_id === row.id)?.quantity_before ?? currentValues[row.id]?.quantity
                            : currentValues[row.id]?.quantity },
                        { title: 'Кол-во после', render: (_, row) => <InputNumber min={0} disabled={!editable}
                            value={(values[row.id] || currentValues[row.id])?.quantity}
                            onChange={(quantity) => setValues((old) => ({ ...old, [row.id]: {
                                ...(old[row.id] || currentValues[row.id]), quantity,
                            } }))} /> },
                        { title: 'Цена до, с НДС', render: (_, row) => selected?.status === 'posted'
                            ? selected.items.find((item) => item.shipment_item_id === row.id)?.price_before ?? currentValues[row.id]?.price
                            : currentValues[row.id]?.price },
                        { title: 'Цена после, с НДС', render: (_, row) => <InputNumber min={0} precision={2} disabled={!editable}
                            value={(values[row.id] || currentValues[row.id])?.price}
                            onChange={(price) => setValues((old) => ({ ...old, [row.id]: {
                                ...(old[row.id] || currentValues[row.id]), price,
                            } }))} /> },
                    ]} />
                <Space wrap style={{ marginTop: 16 }}>
                    {editable && <>
                        <Button loading={busy} onClick={() => save(false)}>Сохранить черновик</Button>
                        <Button type="primary" loading={busy} onClick={() => save(true)}>Провести</Button>
                    </>}
                    {selected && <Button onClick={() => print(false)}>Предпросмотр УКД</Button>}
                    {selected?.status === 'posted' && !selected.diadoc_outgoing_document_id &&
                        <Button loading={busy} onClick={createDiadoc}>Создать УКД в Диадоке</Button>}
                    {selected?.diadoc_outgoing_document_id &&
                        <Button onClick={() => print(true)}>Печатная форма Диадока (PDF)</Button>}
                </Space>
                <div style={{ marginTop: 12 }}><Text type="secondary">
                    При уменьшении количества проверьте отдельно, где находится товар: УКД не создаёт складской приход.
                </Text></div>
            </>}
        </Card>
    </div>;
}
