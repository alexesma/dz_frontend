/**
 * InventoryFileImportModal — загрузка инвентаризации из файла старой 1С.
 *
 * Шаги: выбрать файл → «Проверить» (предпросмотр без изменений) → «Применить».
 * Применение идёт в фоне на сервере, здесь показывается ход выполнения.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Collapse, Descriptions, Modal, Popconfirm, Progress, Select, Space, Switch, Table, Typography, Upload, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import api from '../api';
import { lookupBrands } from '../api/brands';

const { Text } = Typography;
const n = (v) => Number(v || 0).toLocaleString('ru-RU');

const InventoryFileImportModal = ({ open, onClose, onDone }) => {
    const [file, setFile] = useState(null);
    const [report, setReport] = useState(null);
    const [checking, setChecking] = useState(false);
    const [zeroMissing, setZeroMissing] = useState(false);
    const [decisions, setDecisions] = useState({}); // ключ бренда -> {action, brand_id}
    const [found, setFound] = useState({}); // результаты поиска брендов по ключу
    const [job, setJob] = useState(null);
    const timer = useRef(null);

    useEffect(() => () => clearTimeout(timer.current), []);
    useEffect(() => {
        if (!open) { setFile(null); setReport(null); setJob(null); setDecisions({}); setFound({}); }
    }, [open]);

    const form = (extra = {}) => {
        const data = new FormData();
        data.append('file', file);
        data.append('zero_missing', zeroMissing ? 'true' : 'false');
        data.append('brand_decisions', JSON.stringify(decisions));
        Object.entries(extra).forEach(([k, v]) => data.append(k, v));
        return data;
    };

    const check = async () => {
        setChecking(true);
        try {
            const res = await api.post('/inventory/file-import/preview', form(), { timeout: 180000 });
            setReport(res.data);
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось проверить файл');
        } finally {
            setChecking(false);
        }
    };

    const poll = (jobId) => {
        timer.current = setTimeout(async () => {
            try {
                const res = await api.get(`/inventory/file-import/jobs/${jobId}`);
                setJob(res.data);
                if (res.data.state === 'done') { message.success('Инвентаризация проведена'); onDone?.(); return; }
                if (res.data.state === 'error') return;
            } catch (err) {
                setJob({ state: 'error', error: err?.response?.data?.detail || 'Нет связи с сервером' });
                return;
            }
            poll(jobId);
        }, 3000);
    };

    const apply = async () => {
        try {
            const res = await api.post('/inventory/file-import/apply', form({ confirm: 'APPLY' }), { timeout: 180000 });
            setJob({ state: 'starting', done: 0, total: report?.positions || 0 });
            poll(res.data.job_id);
        } catch (err) {
            message.error(err?.response?.data?.detail || 'Не удалось запустить');
        }
    };

    const searchBrand = async (key, q) => {
        if (!q || q.length < 2) return;
        try {
            const res = await lookupBrands(q, 20, [], true);
            setFound((prev) => ({
                ...prev,
                [key]: (res.data || []).map((b) => ({ value: `map:${b.id}`, label: b.name })),
            }));
        } catch { /* ignore */ }
    };

    const choose = (key, value) => {
        if (value === 'create') setDecisions((p) => { const n2 = { ...p }; delete n2[key]; return n2; });
        else if (value === 'skip') setDecisions((p) => ({ ...p, [key]: { action: 'skip' } }));
        else setDecisions((p) => ({ ...p, [key]: { action: 'map', brand_id: Number(String(value).split(':')[1]) } }));
        setReport((r) => r); // решения применяются при следующей проверке
    };

    const decisionValue = (key) => {
        const d = decisions[key];
        if (!d) return 'create';
        return d.action === 'skip' ? 'skip' : `map:${d.brand_id}`;
    };

    const running = job && !['done', 'error'].includes(job.state);

    return (
        <Modal
            open={open}
            onCancel={running ? undefined : onClose}
            closable={!running}
            maskClosable={false}
            title="Загрузить инвентаризацию из файла (старая 1С)"
            width={720}
            footer={null}
            destroyOnClose
        >
            <Upload.Dragger
                accept=".xlsx"
                maxCount={1}
                beforeUpload={(f) => { setFile(f); setReport(null); setJob(null); return false; }}
                onRemove={() => { setFile(null); setReport(null); }}
                disabled={running}
            >
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p>Перетащите файл «Инвентаризация.xlsx» или нажмите для выбора</p>
            </Upload.Dragger>
            <div style={{ margin: '12px 0 4px' }}>
                <Space>
                    <Switch checked={zeroMissing} onChange={(v) => { setZeroMissing(v); setReport(null); }} disabled={running} />
                    <Text>Обнулять то, чего нет в файле</Text>
                </Space>
                <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {zeroMissing
                            ? 'Строгий режим: всё, чего нет в файле, списывается.'
                            : 'Мягкий режим (рекомендуется): ничего не списывается. Позиции из файла ставятся на места из файла, остальное из старых ячеек переносится в «Приёмку».'}
                    </Text>
                </div>
            </div>
            <Space style={{ margin: '12px 0' }}>
                <Button type="primary" onClick={check} loading={checking} disabled={!file || running}>
                    Проверить (без изменений)
                </Button>
                {report && !job && (
                    <Popconfirm
                        title="Изменить остатки и места хранения?"
                        description="Остатки приводятся к файлу, лишнее обнуляется, старые места удаляются. Действие нельзя отменить."
                        okText="Применить"
                        cancelText="Отмена"
                        okButtonProps={{ danger: true }}
                        onConfirm={apply}
                    >
                        <Button danger>Применить</Button>
                    </Popconfirm>
                )}
            </Space>

            {report && (
                <Descriptions size="small" bordered column={2} style={{ marginBottom: 12 }}>
                    <Descriptions.Item label="Позиций в файле">{n(report.positions)}</Descriptions.Item>
                    <Descriptions.Item label="Найдено в номенклатуре">{n(report.matched_positions)}</Descriptions.Item>
                    <Descriptions.Item label="Будет создано позиций">{n(report.new_autoparts)}</Descriptions.Item>
                    <Descriptions.Item label="Новых брендов (создадутся)">{n(report.new_brands_count)}</Descriptions.Item>
                    <Descriptions.Item label="Количество в файле">{n(report.file_quantity)}</Descriptions.Item>
                    <Descriptions.Item label="Сейчас в системе">{n(report.current_quantity)}</Descriptions.Item>
                    <Descriptions.Item label="Мест в файле / новых">{n(report.file_locations)} / {n(report.new_locations)}</Descriptions.Item>
                    <Descriptions.Item label="Старых мест удалить">{n(report.old_locations_to_delete)}</Descriptions.Item>
                    <Descriptions.Item label={report.zero_missing ? 'Позиций будет обнулено' : 'Позиций нет в файле (не списываются)'}>{n(report.positions_zeroed)} ({n(report.quantity_zeroed)} шт.; в ячейках {n(report.absent_in_cells_qty)}, в «Приёмке» {n(report.absent_in_receiving_qty)})</Descriptions.Item>
                    <Descriptions.Item label="Без места («BEZ MESTA»)">{n(report.no_location_rows)}</Descriptions.Item>
                    <Descriptions.Item label="Вне загрузки (др. склады, системные)">{n(report.out_of_scope_quantity)} шт.</Descriptions.Item>
                    <Descriptions.Item label="Резервов под заказы">{n(report.reserved_quantity)} шт., без остатка: {n(report.reserved_conflicts)} поз.</Descriptions.Item>
                    <Descriptions.Item label="Остаток по складам" span={2}>
                        {Object.entries(report.stock_by_warehouse || {}).map(([k, v]) => `${k}: ${n(v)}`).join(' · ') || '—'}
                    </Descriptions.Item>
                </Descriptions>
            )}
            {report && (
                <Collapse
                    size="small"
                    style={{ marginBottom: 12 }}
                    defaultActiveKey={['brands']}
                    items={[
                        ...((report.new_brands || []).length ? [{
                            key: 'brands',
                            label: `Новые бренды: ${n(report.new_brands.length)} — выберите, что делать (после выбора нажмите «Проверить»)`,
                            children: (
                                <Table
                                    size="small"
                                    rowKey="key"
                                    pagination={false}
                                    dataSource={report.new_brands}
                                    columns={[
                                        { title: 'Бренд в файле', dataIndex: 'name', width: 150 },
                                        { title: 'Поз. / шт.', width: 80, render: (_, r) => `${r.positions} / ${r.quantity}` },
                                        {
                                            title: 'Решение',
                                            render: (_, r) => (
                                                <Select
                                                    showSearch
                                                    filterOption={false}
                                                    style={{ width: '100%' }}
                                                    value={decisionValue(r.key)}
                                                    onSearch={(q) => searchBrand(r.key, q)}
                                                    onChange={(v) => choose(r.key, v)}
                                                    options={[
                                                        { value: 'create', label: 'Создать как новый бренд' },
                                                        { value: 'skip', label: 'Отказ (не загружать позиции)' },
                                                        ...((r.suggestions || []).length ? [{
                                                            label: 'Похожие в системе',
                                                            options: r.suggestions.map((b) => ({ value: `map:${b.id}`, label: `Сопоставить: ${b.name}` })),
                                                        }] : []),
                                                        ...((found[r.key] || []).length ? [{
                                                            label: 'Найдено поиском',
                                                            options: found[r.key].map((b) => ({ value: b.value, label: `Сопоставить: ${b.label}` })),
                                                        }] : []),
                                                    ]}
                                                    placeholder="Введите название бренда для поиска"
                                                />
                                            ),
                                        },
                                    ]}
                                />
                            ),
                        }] : []),
                        {
                            key: 'zeroed',
                            label: `${report.zero_missing ? 'Что обнулится' : 'Нет в файле (останутся)'}: крупнейшие позиции (больше 1000 шт.: ${n(report.zeroed_over_1000)})`,
                            children: (
                                <Table
                                    size="small"
                                    rowKey={(r) => `${r.brand}-${r.article}`}
                                    pagination={false}
                                    dataSource={report.top_zeroed || []}
                                    columns={[
                                        { title: 'Бренд', dataIndex: 'brand', width: 110 },
                                        { title: 'Артикул', dataIndex: 'article', width: 140 },
                                        { title: 'Название', dataIndex: 'name', ellipsis: true },
                                        { title: 'Шт.', dataIndex: 'quantity', width: 80, align: 'right', render: n },
                                        { title: 'Места', dataIndex: 'locations', width: 130, render: (v) => (v || []).join(', ') },
                                    ]}
                                />
                            ),
                        },
                        ...(report.skipped_count ? [{
                            key: 'skipped',
                            label: `Пропущено (ошибочный бренд): ${n(report.skipped_count)}`,
                            children: (report.skipped_positions || []).map((r) => (
                                <div key={`${r.brand}-${r.article}`}>{r.brand} · {r.article} · {r.name} · {r.quantity} шт.</div>
                            )),
                        }] : []),
                    ]}
                />
            )}

            {job && (
                <>
                    <Progress
                        percent={job.total ? Math.round((job.done / job.total) * 100) : 0}
                        status={job.state === 'error' ? 'exception' : job.state === 'done' ? 'success' : 'active'}
                    />
                    {job.state === 'error' && <Alert type="error" showIcon message={job.error} />}
                    {job.state === 'done' && (
                        <Alert
                            type="success"
                            showIcon
                            message="Готово"
                            description={<Text type="secondary" style={{ fontSize: 12 }}>{JSON.stringify(job.result)}</Text>}
                        />
                    )}
                </>
            )}
        </Modal>
    );
};

export default InventoryFileImportModal;
