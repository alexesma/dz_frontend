import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    DatePicker,
    Descriptions,
    Form,
    Input,
    InputNumber,
    Modal,
    Radio,
    Select,
    Space,
    Switch,
    Table,
    Tabs,
    Tag,
    Typography,
    message,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import {
    confirmDiadocCloudSignTask,
    deleteEtrnDirectoryItem,
    getEtrnShipmentPrefill,
    listEtrnDirectory,
    listEtrnWaybills,
    refreshEtrnWaybill,
    saveEtrnDirectoryItem,
    saveEtrnDraft,
    startEtrnT1Sign,
    startEtrnT3Accept,
    startEtrnT6Sign,
    syncEtrnWaybills,
    updateDiadocSettings,
} from '../api/diadoc';

const { Text } = Typography;

const STATUS = {
    draft: ['default', 'Черновик'],
    sign_pending: ['warning', 'Ждёт подписи'],
    sent: ['processing', 'Отправлена'],
    in_transit: ['blue', 'В пути'],
    delivered: ['success', 'Завершена'],
    refused: ['error', 'Отказ / аннулирована'],
    error: ['error', 'Ошибка'],
};
const T3_STATE = {
    none: 'Не принята',
    pending_sign: 'Ждёт подписи Т3',
    signed_here: 'Т3 подписан в DragonZap',
    signed_external: 'Т3 подписан в другой системе (1С)',
};
const T6_STATE = {
    none: 'Т5 получен, Т6 не подписан',
    pending_sign: 'Т6 ждёт подписи',
    signed_here: 'Т6 подписан',
};
const T3_RESULT = {
    accepted: 'Принять полностью',
    partial: 'Принять частично',
    rejected: 'Отказаться от груза',
};

const errText = (e, fallback) => e?.response?.data?.detail || fallback;
const iso = (v) => (v ? dayjs(v).toISOString() : undefined);

// Поля справочников: [name, label, required, type]
const DIRECTORIES = {
    carriers: {
        title: 'Перевозчики',
        fields: [
            ['name', 'Название', true],
            ['inn', 'ИНН'],
            ['kpp', 'КПП'],
            ['diadoc_box_id', 'Ящик в Диадоке (обязателен для отправки Т1)'],
            ['phone', 'Телефон'],
            ['address', 'Адрес'],
            ['comment', 'Комментарий'],
        ],
        columns: ['name', 'inn', 'diadoc_box_id', 'phone'],
    },
    drivers: {
        title: 'Водители',
        fields: [
            ['last_name', 'Фамилия', true],
            ['first_name', 'Имя', true],
            ['middle_name', 'Отчество'],
            ['license_series', 'Серия ВУ'],
            ['license_number', 'Номер ВУ'],
            ['license_date', 'Дата выдачи ВУ', false, 'date'],
            ['phone', 'Телефон'],
            ['carrier_id', 'Перевозчик', false, 'carrier'],
        ],
        columns: ['last_name', 'first_name', 'license_number', 'phone'],
    },
    vehicles: {
        title: 'Транспорт',
        fields: [
            ['plate_number', 'Госномер', true],
            ['brand', 'Марка', true],
            ['vehicle_type', 'Тип (фургон, тягач…)', true],
            ['max_weight', 'Грузоподъёмность, т', true, 'number'],
            ['capacity', 'Вместимость, м³', false, 'number'],
            ['trailer_number', 'Номер прицепа'],
            ['carrier_id', 'Перевозчик', false, 'carrier'],
        ],
        columns: ['plate_number', 'brand', 'vehicle_type', 'trailer_number'],
    },
    addresses: {
        title: 'Адреса',
        fields: [
            ['label', 'Название (склад, клиент…)', true],
            ['kind', 'Тип', true, 'kind'],
            ['zip_code', 'Индекс (6 цифр)', true],
            ['region_code', 'Код региона (2 цифры)', true],
            ['city', 'Город'],
            ['locality', 'Населённый пункт'],
            ['street', 'Улица'],
            ['building', 'Дом'],
            ['block', 'Корпус'],
            ['apartment', 'Квартира / офис'],
            ['other_info', 'Иные сведения'],
        ],
        columns: ['label', 'zip_code', 'city', 'street', 'building'],
    },
};

const DirectoryTab = ({ name, carriers, onChanged }) => {
    const cfg = DIRECTORIES[name];
    const [rows, setRows] = useState([]);
    const [editing, setEditing] = useState(null);
    const [form] = Form.useForm();

    const load = useCallback(async () => {
        try {
            const { data } = await listEtrnDirectory(name);
            setRows(data);
        } catch (e) {
            message.error(errText(e, 'Не удалось загрузить справочник'));
        }
    }, [name]);
    useEffect(() => { load(); }, [load]);

    const open = (row) => {
        setEditing(row || {});
        form.resetFields();
        form.setFieldsValue({
            kind: 'other',
            ...(row || {}),
            license_date: row?.license_date ? dayjs(row.license_date) : undefined,
        });
    };
    const save = async () => {
        const values = await form.validateFields();
        if (values.license_date) values.license_date = values.license_date.format('YYYY-MM-DD');
        try {
            await saveEtrnDirectoryItem(name, editing.id, values);
            setEditing(null);
            await load();
            onChanged?.();
        } catch (e) {
            message.error(errText(e, 'Не удалось сохранить'));
        }
    };
    const remove = async (row) => {
        await deleteEtrnDirectoryItem(name, row.id);
        await load();
        onChanged?.();
    };
    const label = (key) => cfg.fields.find((f) => f[0] === key)?.[1] || key;

    return (
        <Card
            size="small"
            title={cfg.title}
            extra={<Button icon={<PlusOutlined />} onClick={() => open(null)}>Добавить</Button>}
        >
            <Table
                size="small"
                rowKey="id"
                dataSource={rows}
                pagination={{ pageSize: 15 }}
                columns={[
                    ...cfg.columns.map((key) => ({ title: label(key), dataIndex: key })),
                    {
                        title: '',
                        render: (_, row) => (
                            <Space>
                                <a onClick={() => open(row)}>Изменить</a>
                                <a onClick={() => remove(row)}>Убрать</a>
                            </Space>
                        ),
                    },
                ]}
            />
            <Modal
                open={Boolean(editing)}
                title={editing?.id ? 'Изменить' : 'Добавить'}
                okText="Сохранить"
                cancelText="Отмена"
                onOk={save}
                onCancel={() => setEditing(null)}
            >
                <Form form={form} layout="vertical">
                    {cfg.fields.map(([key, text, required, type]) => (
                        <Form.Item
                            key={key}
                            name={key}
                            label={text}
                            rules={required ? [{ required: true, message: 'Обязательное поле' }] : []}
                        >
                            {type === 'number' ? (
                                <InputNumber style={{ width: '100%' }} min={0} />
                            ) : type === 'date' ? (
                                <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
                            ) : type === 'carrier' ? (
                                <Select
                                    allowClear
                                    options={carriers.map((c) => ({ value: c.id, label: c.name }))}
                                />
                            ) : type === 'kind' ? (
                                <Select
                                    options={[
                                        { value: 'warehouse', label: 'Склад компании' },
                                        { value: 'customer', label: 'Адрес клиента' },
                                        { value: 'other', label: 'Другой' },
                                    ]}
                                />
                            ) : (
                                <Input />
                            )}
                        </Form.Item>
                    ))}
                </Form>
            </Modal>
        </Card>
    );
};

// Выбор из справочника либо ручной ввод «разового» значения
const ManualAddress = ({ prefix }) => (
    <Space wrap>
        <Form.Item name={[prefix, 'zip_code']} label="Индекс" rules={[{ required: true }]}>
            <Input style={{ width: 90 }} />
        </Form.Item>
        <Form.Item name={[prefix, 'region_code']} label="Код региона" rules={[{ required: true }]}>
            <Input style={{ width: 90 }} />
        </Form.Item>
        <Form.Item name={[prefix, 'city']} label="Город"><Input style={{ width: 140 }} /></Form.Item>
        <Form.Item name={[prefix, 'street']} label="Улица"><Input style={{ width: 160 }} /></Form.Item>
        <Form.Item name={[prefix, 'building']} label="Дом"><Input style={{ width: 70 }} /></Form.Item>
    </Space>
);

const T1Modal = ({ open, draft, dir, onClose, onSaved, startSign }) => {
    const [form] = Form.useForm();
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        form.resetFields();
        const p = draft?.payload;
        form.setFieldsValue(
            p
                ? {
                    number: p.number,
                    date: p.date ? dayjs(p.date) : dayjs(),
                    cargo: p.cargo,
                    consignee_box_id: p.consignee?.box_id,
                    consignee_phone: p.consignee?.phone,
                    loading_arrival_at: p.loading?.arrival_at ? dayjs(p.loading.arrival_at) : undefined,
                    loading_departure_at: p.loading?.departure_at ? dayjs(p.loading.departure_at) : undefined,
                    customer_id: draft.customer_id,
                    shipment_id: draft.shipment_id,
                    carrier_id: draft.carrier_id,
                    driver_id: draft.driver_id,
                    vehicle_id: draft.vehicle_id,
                }
                : { date: dayjs(), cargo: [{ places: 1, gross_weight: 0 }] }
        );
    }, [open, draft, form]);

    const prefill = async (shipmentId) => {
        if (!shipmentId) return;
        try {
            const { data } = await getEtrnShipmentPrefill(shipmentId);
            form.setFieldsValue({
                shipment_id: data.shipment_id,
                customer_id: data.customer_id,
                number: data.number,
                date: dayjs(data.date),
                order_number: data.order_number,
                consignee_box_id: data.consignee_box_id,
            });
            message.success('Данные отгрузки подставлены');
        } catch (e) {
            message.error(errText(e, 'Отгрузка не найдена'));
        }
    };

    const build = (values) => {
        const out = {
            shipment_id: values.shipment_id || null,
            customer_id: values.customer_id || null,
            number: values.number,
            date: values.date.format('YYYY-MM-DD'),
            order_number: values.order_number,
            consignee_box_id: values.consignee_box_id,
            consignee_phone: values.consignee_phone,
            cargo: values.cargo,
            loading_arrival_at: iso(values.loading_arrival_at),
            loading_departure_at: iso(values.loading_departure_at),
            carrier_id: values.carrier_id || null,
            driver_id: values.driver_id || null,
            vehicle_id: values.vehicle_id || null,
            loading_address_id: values.loading_address_id || null,
            delivery_address_id: values.delivery_address_id || null,
        };
        if (!out.carrier_id && values.carrier_manual) out.carrier_manual = values.carrier_manual;
        if (!out.driver_id && values.driver_manual) out.driver_manual = values.driver_manual;
        if (!out.vehicle_id && values.vehicle_manual) out.vehicle_manual = values.vehicle_manual;
        if (!out.loading_address_id && values.loading_manual) out.loading_address_manual = values.loading_manual;
        if (!out.delivery_address_id && values.delivery_manual) out.delivery_address_manual = values.delivery_manual;
        if (values.warrant_id && values.warrant_date) {
            out.warrant = {
                id: values.warrant_id,
                date: values.warrant_date.format('YYYY-MM-DD'),
                number: values.warrant_number,
            };
        }
        return out;
    };

    const save = async (thenSign) => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            const { data } = await saveEtrnDraft(draft?.id, build(values));
            message.success('Черновик сохранён');
            onSaved();
            if (thenSign) await startSign(data);
            onClose();
        } catch (e) {
            message.error(errText(e, 'Не удалось сохранить черновик'));
        } finally {
            setSaving(false);
        }
    };

    const opts = (rows, text) => rows.map((r) => ({ value: r.id, label: text(r) }));
    const required = [{ required: true, message: 'Обязательное поле' }];

    return (
        <Modal
            open={open}
            width={900}
            title={draft ? `Т1 · черновик ${draft.number || ''}` : 'Новая ЭТрН (Т1)'}
            onCancel={onClose}
            footer={[
                <Button key="c" onClick={onClose}>Закрыть</Button>,
                <Button key="s" loading={saving} onClick={() => save(false)}>Сохранить черновик</Button>,
                <Button key="p" type="primary" loading={saving} onClick={() => save(true)}>
                    Сохранить и подписать (SMS)
                </Button>,
            ]}
        >
            <Form form={form} layout="vertical">
                <Space wrap align="start">
                    <Form.Item name="shipment_id" label="Отгрузка клиенту (ID)">
                        <InputNumber min={1} onBlur={(e) => prefill(Number(e.target.value))} />
                    </Form.Item>
                    <Form.Item name="customer_id" hidden><InputNumber /></Form.Item>
                    <Form.Item name="number" label="Номер ЭТрН" rules={required}><Input /></Form.Item>
                    <Form.Item name="date" label="Дата" rules={required}>
                        <DatePicker format="DD.MM.YYYY" />
                    </Form.Item>
                    <Form.Item name="consignee_box_id" label="Ящик грузополучателя (Диадок)" rules={required}>
                        <Input style={{ width: 300 }} />
                    </Form.Item>
                    <Form.Item name="consignee_phone" label="Телефон получателя"><Input /></Form.Item>
                </Space>

                <Card size="small" title="Груз" style={{ marginBottom: 12 }}>
                    <Form.List name="cargo">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map((f) => (
                                    <Space key={f.key} align="baseline" wrap>
                                        <Form.Item name={[f.name, 'name']} label="Наименование" rules={required}>
                                            <Input style={{ width: 320 }} placeholder="Автозапчасти" />
                                        </Form.Item>
                                        <Form.Item name={[f.name, 'places']} label="Мест" rules={required}>
                                            <InputNumber min={1} />
                                        </Form.Item>
                                        <Form.Item name={[f.name, 'gross_weight']} label="Масса брутто, кг" rules={required}>
                                            <InputNumber min={0} />
                                        </Form.Item>
                                        <a onClick={() => remove(f.name)}>Убрать</a>
                                    </Space>
                                ))}
                                <Button size="small" onClick={() => add({ places: 1, gross_weight: 0 })}>
                                    Добавить строку груза
                                </Button>
                            </>
                        )}
                    </Form.List>
                </Card>

                <Card size="small" title="Перевозчик, водитель, транспорт" style={{ marginBottom: 12 }}>
                    <Space wrap align="start">
                        <Form.Item name="carrier_id" label="Перевозчик (справочник)">
                            <Select allowClear style={{ width: 240 }}
                                options={opts(dir.carriers, (c) => `${c.name}${c.diadoc_box_id ? '' : ' (нет ящика)'}`)} />
                        </Form.Item>
                        <Form.Item name="driver_id" label="Водитель (справочник)">
                            <Select allowClear style={{ width: 240 }}
                                options={opts(dir.drivers, (d) => `${d.last_name} ${d.first_name}`)} />
                        </Form.Item>
                        <Form.Item name="vehicle_id" label="ТС (справочник)">
                            <Select allowClear style={{ width: 240 }}
                                options={opts(dir.vehicles, (v) => `${v.plate_number} ${v.brand || ''}`)} />
                        </Form.Item>
                    </Space>
                    <Form.Item noStyle shouldUpdate>
                        {({ getFieldValue }) => (
                            <Space wrap align="start">
                                {!getFieldValue('carrier_id') && (
                                    <>
                                        <Form.Item name={['carrier_manual', 'name']} label="Разовый перевозчик: название"><Input /></Form.Item>
                                        <Form.Item name={['carrier_manual', 'box_id']} label="Ящик Диадока" rules={required}><Input style={{ width: 280 }} /></Form.Item>
                                    </>
                                )}
                                {!getFieldValue('driver_id') && (
                                    <>
                                        <Form.Item name={['driver_manual', 'last_name']} label="Водитель: фамилия"><Input /></Form.Item>
                                        <Form.Item name={['driver_manual', 'first_name']} label="Имя"><Input /></Form.Item>
                                        <Form.Item name={['driver_manual', 'license_number']} label="Номер ВУ"><Input /></Form.Item>
                                    </>
                                )}
                                {!getFieldValue('vehicle_id') && (
                                    <>
                                        <Form.Item name={['vehicle_manual', 'plate_number']} label="ТС: госномер"><Input /></Form.Item>
                                        <Form.Item name={['vehicle_manual', 'brand']} label="Марка"><Input /></Form.Item>
                                        <Form.Item name={['vehicle_manual', 'vehicle_type']} label="Тип"><Input /></Form.Item>
                                        <Form.Item name={['vehicle_manual', 'max_weight']} label="Грузоподъёмность, т"><InputNumber min={0} /></Form.Item>
                                    </>
                                )}
                            </Space>
                        )}
                    </Form.Item>
                </Card>

                <Card size="small" title="Адреса и погрузка" style={{ marginBottom: 12 }}>
                    <Space wrap align="start">
                        <Form.Item name="loading_address_id" label="Адрес погрузки (справочник)">
                            <Select allowClear style={{ width: 280 }}
                                options={opts(dir.addresses, (a) => a.label)} />
                        </Form.Item>
                        <Form.Item name="delivery_address_id" label="Адрес выгрузки (справочник)">
                            <Select allowClear style={{ width: 280 }}
                                options={opts(dir.addresses, (a) => a.label)} />
                        </Form.Item>
                    </Space>
                    <Form.Item noStyle shouldUpdate>
                        {({ getFieldValue }) => (
                            <>
                                {!getFieldValue('loading_address_id') && (<><Text type="secondary">Разовый адрес погрузки</Text><ManualAddress prefix="loading_manual" /></>)}
                                {!getFieldValue('delivery_address_id') && (<><Text type="secondary">Разовый адрес выгрузки</Text><ManualAddress prefix="delivery_manual" /></>)}
                            </>
                        )}
                    </Form.Item>
                    <Space wrap>
                        <Form.Item name="loading_arrival_at" label="Прибытие на погрузку" rules={required}>
                            <DatePicker showTime format="DD.MM.YYYY HH:mm" />
                        </Form.Item>
                        <Form.Item name="loading_departure_at" label="Убытие с погрузки" rules={required}>
                            <DatePicker showTime format="DD.MM.YYYY HH:mm" />
                        </Form.Item>
                    </Space>
                </Card>

                <Card size="small" title="МЧД (необязательно)">
                    <Text type="secondary">
                        Директор подписывает своей облачной КЭП — доверенность не нужна. Заполняйте, только если
                        подписывает сотрудник по МЧД.
                    </Text>
                    <Space wrap style={{ display: 'flex', marginTop: 8 }}>
                        <Form.Item name="warrant_id" label="ID доверенности"><Input /></Form.Item>
                        <Form.Item name="warrant_number" label="Номер"><Input /></Form.Item>
                        <Form.Item name="warrant_date" label="Дата"><DatePicker format="DD.MM.YYYY" /></Form.Item>
                    </Space>
                </Card>
            </Form>
        </Modal>
    );
};

const AcceptModal = ({ target, onClose, startSign }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (target) {
            form.resetFields();
            form.setFieldsValue({
                result: 'accepted',
                places_received: Number(target.summary?.places) || undefined,
                gross_weight_received: Number(target.summary?.gross_weight) || undefined,
            });
        }
    }, [target, form]);

    const submit = async () => {
        const v = await form.validateFields();
        setLoading(true);
        try {
            await startSign(
                () => startEtrnT3Accept(target.id, {
                    result: v.result,
                    places_received: v.places_received,
                    gross_weight_received: v.gross_weight_received,
                    cargo_status: v.cargo_status,
                    rejection_reason: v.rejection_reason,
                    delivery_address: v.zip_code
                        ? { zip_code: v.zip_code, region_code: v.region_code, city: v.city, street: v.street, building: v.building }
                        : undefined,
                    delivery_address_id: v.delivery_address_id,
                    carrier_box_id: v.carrier_box_id,
                })
            );
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open={Boolean(target)}
            title={`Приёмка груза (Т3) · ${target?.number || ''}`}
            okText="Подписать (SMS)"
            cancelText="Отмена"
            confirmLoading={loading}
            onOk={submit}
            onCancel={onClose}
            width={640}
        >
            <Form form={form} layout="vertical">
                <Form.Item name="result" label="Результат приёмки">
                    <Radio.Group>
                        {Object.entries(T3_RESULT).map(([k, t]) => (
                            <Radio.Button key={k} value={k}>{t}</Radio.Button>
                        ))}
                    </Radio.Group>
                </Form.Item>
                <Form.Item noStyle shouldUpdate>
                    {({ getFieldValue }) =>
                        getFieldValue('result') === 'rejected' ? (
                            <Form.Item name="rejection_reason" label="Причина отказа" rules={[{ required: true }]}>
                                <Input.TextArea rows={3} />
                            </Form.Item>
                        ) : (
                            <>
                                <Space wrap>
                                    <Form.Item name="places_received" label="Принято мест" rules={[{ required: true }]}>
                                        <InputNumber min={0} />
                                    </Form.Item>
                                    <Form.Item name="gross_weight_received" label="Масса брутто принятого, кг" rules={[{ required: true }]}>
                                        <InputNumber min={0} />
                                    </Form.Item>
                                </Space>
                                <Form.Item
                                    name="cargo_status"
                                    label={getFieldValue('result') === 'partial'
                                        ? 'Что принято и почему не всё (обязательно)'
                                        : 'Замечания (необязательно)'}
                                    rules={getFieldValue('result') === 'partial' ? [{ required: true }] : []}
                                >
                                    <Input.TextArea rows={2} placeholder="Груз принят без замечаний" />
                                </Form.Item>
                                <Text type="secondary">Адрес выгрузки</Text>
                                <Space wrap>
                                    <Form.Item name="zip_code" label="Индекс" rules={[{ required: true }]}><Input style={{ width: 90 }} /></Form.Item>
                                    <Form.Item name="region_code" label="Код региона" rules={[{ required: true }]}><Input style={{ width: 90 }} /></Form.Item>
                                    <Form.Item name="city" label="Город"><Input /></Form.Item>
                                    <Form.Item name="street" label="Улица"><Input /></Form.Item>
                                    <Form.Item name="building" label="Дом"><Input style={{ width: 70 }} /></Form.Item>
                                </Space>
                            </>
                        )
                    }
                </Form.Item>
                <Form.Item name="carrier_box_id" label="Ящик перевозчика (если не найден по ИНН в справочнике)">
                    <Input />
                </Form.Item>
            </Form>
        </Modal>
    );
};

const WaybillStatus = ({ row }) => {
    const [color, text] = STATUS[row.status] || ['default', row.status];
    return (
        <Space direction="vertical" size={0}>
            <Tag color={color}>{text}</Tag>
            {row.stage_label && <Text type="secondary">{row.stage_label}</Text>}
            {row.driver_confirm?.text && (
                <Text type={row.driver_confirm.type === 'Error' ? 'danger' : 'secondary'}>
                    Водитель: {row.driver_confirm.text}
                </Text>
            )}
            {row.gis_status_text && (
                <Text type={row.gis_status_type === 'Error' ? 'danger' : 'secondary'}>
                    ГИС ЭПД: {row.gis_status_text}
                </Text>
            )}
            {row.last_error && <Text type="danger">{row.last_error}</Text>}
        </Space>
    );
};

const EtrnPanel = ({ status, onStatusChanged }) => {
    const [incoming, setIncoming] = useState([]);
    const [outgoing, setOutgoing] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dir, setDir] = useState({ carriers: [], drivers: [], vehicles: [], addresses: [] });
    const [t1Open, setT1Open] = useState(false);
    const [draft, setDraft] = useState(null);
    const [acceptTarget, setAcceptTarget] = useState(null);
    const [signTask, setSignTask] = useState(null);
    const [code, setCode] = useState('');
    const [confirming, setConfirming] = useState(false);
    const enabled = Boolean(status?.etrn_enabled);
    const t6Enabled = enabled && Boolean(status?.etrn_t6_enabled);
    const [t6Target, setT6Target] = useState(null);
    const [t6Info, setT6Info] = useState('');

    const loadDirs = useCallback(async () => {
        const out = {};
        for (const name of Object.keys(DIRECTORIES)) {
            try {
                out[name] = (await listEtrnDirectory(name)).data;
            } catch {
                out[name] = [];
            }
        }
        setDir(out);
    }, []);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [i, o] = await Promise.all([
                listEtrnWaybills({ direction: 'incoming' }),
                listEtrnWaybills({ direction: 'outgoing' }),
            ]);
            setIncoming(i.data);
            setOutgoing(o.data);
        } catch (e) {
            message.error(errText(e, 'Не удалось загрузить перевозки'));
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); loadDirs(); }, [load, loadDirs]);

    const sync = async () => {
        setLoading(true);
        try {
            const { data } = await syncEtrnWaybills();
            message.success(`Обновлено: новых ${data.created}, проблем ${data.problems}`);
            await load();
        } catch (e) {
            message.error(errText(e, 'Синхронизация не удалась'));
            setLoading(false);
        }
    };
    const refresh = async (row) => {
        try {
            await refreshEtrnWaybill(row.id);
            await load();
        } catch (e) {
            message.error(errText(e, 'Не удалось обновить статус'));
        }
    };
    const toggleEnabled = async (value, field = 'etrn_enabled') => {
        try {
            await updateDiadocSettings({ [field]: value });
            onStatusChanged?.();
        } catch (e) {
            message.error(errText(e, 'Не удалось изменить настройку'));
        }
    };

    // Шаг 1: запускаем подпись → открываем окно ввода SMS-кода
    const startSign = async (call) => {
        try {
            const { data } = await call();
            setSignTask(data);
            setCode('');
        } catch (e) {
            message.error(errText(e, 'Не удалось запустить подпись'));
            await load();
            throw e;
        }
    };
    const confirm = async () => {
        setConfirming(true);
        try {
            await confirmDiadocCloudSignTask(signTask.id, code.trim());
            message.success('Титул подписан и отправлен');
            setSignTask(null);
        } catch (e) {
            message.error(errText(e, 'Не удалось подтвердить подпись'));
        } finally {
            setConfirming(false);
            load();
        }
    };

    const baseCols = [
        { title: 'Номер', dataIndex: 'number', render: (v, r) => v || r.t1_message_id?.slice(0, 8) },
        { title: 'УИД ГИС ЭПД', dataIndex: 'mt_id', render: (v) => v || '—' },
        { title: 'Статус', render: (_, r) => <WaybillStatus row={r} /> },
    ];
    const incomingCols = [
        baseCols[0],
        { title: 'Грузоотправитель', render: (_, r) => r.shipper?.name || '—' },
        { title: 'Груз', render: (_, r) => (r.cargo || []).map((c) => `${c.name} (${c.places} мест)`).join('; ') || '—' },
        baseCols[1],
        baseCols[2],
        {
            title: 'Приёмка',
            render: (_, r) => (
                <Space direction="vertical" size={0}>
                    <Text>{T3_STATE[r.t3_state] || r.t3_state}{r.t3_result_label ? ` · ${r.t3_result_label}` : ''}</Text>
                    <Space>
                        {enabled && ['none', 'pending_sign'].includes(r.t3_state) && (
                            <Button size="small" type="primary" onClick={() => setAcceptTarget(r)}>Принять / отказаться</Button>
                        )}
                        <Button size="small" icon={<ReloadOutlined />} onClick={() => refresh(r)} />
                    </Space>
                </Space>
            ),
        },
    ];
    const outgoingCols = [
        baseCols[0],
        { title: 'Дата', dataIndex: 'waybill_date', render: (v) => (v ? dayjs(v).format('DD.MM.YYYY') : '—') },
        { title: 'Клиент', dataIndex: 'customer_name', render: (v) => v || '—' },
        { title: 'Перевозчик', dataIndex: 'carrier_name', render: (v) => v || '—' },
        baseCols[1],
        baseCols[2],
        {
            title: '',
            render: (_, r) => (
                <Space>
                    {enabled && ['draft', 'error', 'sign_pending'].includes(r.status) && !r.t1_message_id && (
                        <>
                            <a onClick={() => { setDraft(r); setT1Open(true); }}>Изменить</a>
                            <Button size="small" type="primary" onClick={() => startSign(() => startEtrnT1Sign(r.id))}>
                                Подписать
                            </Button>
                        </>
                    )}
                    {r.t1_message_id && <Button size="small" icon={<ReloadOutlined />} onClick={() => refresh(r)} />}
                    {t6Enabled && r.cost?.t5_entity_id && (
                        <Space direction="vertical" size={0}>
                            <Text type="secondary">{T6_STATE[r.cost.t6_state] || r.cost.t6_state}</Text>
                            {r.cost.t6_state !== 'signed_here' && (
                                <Button size="small" onClick={() => { setT6Target(r); setT6Info(''); }}>Подписать Т6</Button>
                            )}
                        </Space>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <Card>
            <Alert
                showIcon
                type={enabled ? 'info' : 'warning'}
                style={{ marginBottom: 12 }}
                message={enabled
                    ? 'Подписание ЭТрН из DragonZap включено. Перед подписанием проверяется состояние в Диадоке: если титул уже подписан в 1С, повторно он не отправится.'
                    : 'Режим «только чтение»: статусы, УИД и стадии видны, титулы подписываются в 1С.'}
                action={<Space>Подписание в DragonZap <Switch checked={enabled} onChange={toggleEnabled} /></Space>}
            />
            {enabled && (
                <Space style={{ marginBottom: 8 }}>
                    <Text type="secondary">
                        Т6 (ответ на стоимость перевозки, Т5 перевозчика) — необязательный титул
                    </Text>
                    <Switch size="small" checked={Boolean(status?.etrn_t6_enabled)}
                        onChange={(v) => toggleEnabled(v, 'etrn_t6_enabled')} />
                </Space>
            )}
            <Space style={{ marginBottom: 12 }}>
                <Button icon={<SyncOutlined />} onClick={sync} loading={loading}>Обновить из Диадока</Button>
                {enabled && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { setDraft(null); setT1Open(true); }}>
                        Создать ЭТрН (Т1)
                    </Button>
                )}
            </Space>
            <Tabs
                items={[
                    {
                        key: 'in',
                        label: `Входящие (${incoming.length})`,
                        children: <Table size="small" rowKey="id" loading={loading} dataSource={incoming} columns={incomingCols} scroll={{ x: 1000 }} />,
                    },
                    {
                        key: 'out',
                        label: `Исходящие (${outgoing.length})`,
                        children: <Table size="small" rowKey="id" loading={loading} dataSource={outgoing} columns={outgoingCols} scroll={{ x: 1000 }} />,
                    },
                    ...Object.entries(DIRECTORIES).map(([name, cfg]) => ({
                        key: name,
                        label: cfg.title,
                        children: <DirectoryTab name={name} carriers={dir.carriers} onChanged={loadDirs} />,
                    })),
                ]}
            />
            <T1Modal
                open={t1Open}
                draft={draft}
                dir={dir}
                onClose={() => setT1Open(false)}
                onSaved={load}
                startSign={(row) => startSign(() => startEtrnT1Sign(row.id))}
            />
            <AcceptModal
                target={acceptTarget}
                onClose={() => { setAcceptTarget(null); load(); }}
                startSign={startSign}
            />
            <Modal
                open={Boolean(t6Target)}
                title={`Т6 · стоимость перевозки ${t6Target?.number || ''}`}
                okText="Подписать (SMS)"
                cancelText="Отмена"
                onOk={async () => {
                    try {
                        await startSign(() => startEtrnT6Sign(t6Target.id, { info: t6Info || undefined }));
                        setT6Target(null);
                    } catch { /* ошибка уже показана */ }
                }}
                onCancel={() => setT6Target(null)}
            >
                <Text type="secondary">Основание (например, договор перевозки) — необязательно</Text>
                <Input.TextArea rows={2} value={t6Info} onChange={(e) => setT6Info(e.target.value)} />
            </Modal>
            <Modal
                open={Boolean(signTask)}
                title="Подтверждение подписи"
                okText="Подписать и отправить"
                cancelText="Позже"
                confirmLoading={confirming}
                okButtonProps={{ disabled: !code.trim() }}
                onOk={confirm}
                onCancel={() => setSignTask(null)}
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Descriptions size="small" column={1}>
                        <Descriptions.Item label="Операция">
                            {({ etrn_t3_send: 'Т3 — приёмка груза', etrn_t6_send: 'Т6 — стоимость перевозки' })[signTask?.operation] || 'Т1 — титул грузоотправителя'}
                        </Descriptions.Item>
                    </Descriptions>
                    <Text>Код из SMS придёт директору на телефон облачной подписи.</Text>
                    <Input placeholder="Код из SMS" value={code} onChange={(e) => setCode(e.target.value)} onPressEnter={confirm} />
                </Space>
            </Modal>
        </Card>
    );
};

export default EtrnPanel;
