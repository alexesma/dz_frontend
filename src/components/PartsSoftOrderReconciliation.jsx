import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Checkbox,
    Col,
    Input,
    message,
    Modal,
    Popconfirm,
    Row,
    Space,
    Statistic,
    Table,
    Tag,
    Typography,
} from 'antd';
import dayjs from 'dayjs';
import {
    getPartsSoftCustomerCandidates,
    getCachedPartsSoftOrders,
    getPartsSoftProductSyncStatus,
    getPartsSoftProductOutboxStatus,
    getPartsSoftDocumentSyncStatus,
    getPartsSoftDocuments,
    getPartsSoftSupplierSyncStatus,
    linkPartsSoftCustomer,
    reconcilePartsSoftOrders,
    syncPartsSoftProducts,
    syncPartsSoftSuppliers,
    processPartsSoftProductOutbox,
    enqueueAllPartsSoftProducts,
    syncPartsSoftDocuments,
} from '../api/customerOrders';

const { Paragraph, Text } = Typography;

const STATUS = {
    existing_external: { label: 'Уже связан', color: 'green' },
    existing_site_order: { label: 'Заказ с нашего сайта', color: 'green' },
    partial_site_match: { label: 'Частичное совпадение', color: 'orange' },
    order_conflict: { label: 'Конфликт заказов', color: 'red' },
    probable_duplicate: { label: 'Вероятный дубль заказа', color: 'orange' },
    customer_conflict: { label: 'Конфликт клиента', color: 'red' },
    customer_unmatched: { label: 'Клиент не связан', color: 'default' },
    new_order: { label: 'Новый заказ', color: 'blue' },
};

const MATCH_BASIS_LABELS = {
    external_order_id: 'тот же ID заказа сайта',
    tracking_uuid: 'точное совпадение по tracking ID',
    partial_tracking_uuid: 'часть позиций совпала по tracking ID',
    tracking_uuid_multiple_orders: 'позиции найдены в разных заказах',
    customer_order_number: 'тот же клиент и номер заказа',
    customer_date_items: 'тот же клиент, дата и состав заказа',
    external_id: 'постоянная связь клиента',
    inn_kpp: 'ИНН и КПП',
    inn: 'ИНН',
    email: 'email',
    phone: 'телефон',
    name: 'название',
    none: 'совпадений нет',
};

const formatMatchBasis = (value) => {
    const values = Array.isArray(value) ? value : String(value || '').split(',');
    return values
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => MATCH_BASIS_LABELS[item] || item)
        .join(', ') || '—';
};

const PartsSoftOrderReconciliation = () => {
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [errorText, setErrorText] = useState('');
    const [linkRow, setLinkRow] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [candidateLoading, setCandidateLoading] = useState(false);
    const [linkLoading, setLinkLoading] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [mergeDuplicate, setMergeDuplicate] = useState(false);
    const [productStatus, setProductStatus] = useState(null);
    const [productSyncLoading, setProductSyncLoading] = useState(false);
    const [supplierStatus, setSupplierStatus] = useState(null);
    const [supplierSyncLoading, setSupplierSyncLoading] = useState(false);
    const [outboxStatus, setOutboxStatus] = useState(null);
    const [outboxLoading, setOutboxLoading] = useState(false);
    const [documentStatus, setDocumentStatus] = useState(null);
    const [unmatchedDocuments, setUnmatchedDocuments] = useState([]);
    const [documentLoading, setDocumentLoading] = useState(false);

    const loadProductStatus = async () => {
        try {
            const response = await getPartsSoftProductSyncStatus();
            setProductStatus(response.data || null);
        } catch {
            setProductStatus(null);
        }
    };

    const loadSupplierStatus = async () => {
        try {
            const response = await getPartsSoftSupplierSyncStatus();
            setSupplierStatus(response.data || null);
        } catch {
            setSupplierStatus(null);
        }
    };

    const loadExchangeStatus = async () => {
        const [outbox, documents, unmatched] = await Promise.allSettled([
            getPartsSoftProductOutboxStatus(),
            getPartsSoftDocumentSyncStatus(),
            getPartsSoftDocuments({ import_status: 'unmatched_counterparty', limit: 100 }),
        ]);
        setOutboxStatus(outbox.status === 'fulfilled' ? outbox.value.data : null);
        setDocumentStatus(documents.status === 'fulfilled' ? documents.value.data : null);
        setUnmatchedDocuments(unmatched.status === 'fulfilled' ? unmatched.value.data : []);
    };

    useEffect(() => {
        void loadProductStatus();
        void loadSupplierStatus();
        void loadExchangeStatus();
        void loadCachedReport();
    }, []);

    const loadCachedReport = async () => {
        setLoading(true);
        setErrorText('');
        try {
            const response = await getCachedPartsSoftOrders();
            setReport(response.data);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            setErrorText(typeof detail === 'string' ? detail : 'Не удалось загрузить сохранённую сверку');
        } finally {
            setLoading(false);
        }
    };

    const processOutbox = async () => {
        setOutboxLoading(true);
        try {
            const response = await processPartsSoftProductOutbox(100);
            const counts = response.data?.counts || {};
            message.success(
                `Передано в Parts-Soft: ${counts.upserted || 0}; удалено: ${counts.deleted || 0}; ошибок: ${counts.errors || 0}`,
            );
            await loadExchangeStatus();
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось передать изменения товаров');
        } finally {
            setOutboxLoading(false);
        }
    };

    const enqueueAllProducts = async () => {
        setOutboxLoading(true);
        try {
            const response = await enqueueAllPartsSoftProducts();
            message.success(`В очередь поставлено карточек: ${response.data?.queued || 0}`);
            await loadExchangeStatus();
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось поставить карточки в очередь');
        } finally {
            setOutboxLoading(false);
        }
    };

    const runDocumentSync = async () => {
        setDocumentLoading(true);
        try {
            const response = await syncPartsSoftDocuments(30);
            const counts = response.data?.counts || {};
            message.success(
                `Документы обновлены: импортировано ${counts.imported || 0}, требуют связи ${counts.unmatched || 0}, ошибок ${counts.errors || 0}`,
            );
            await loadExchangeStatus();
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось импортировать документы');
        } finally {
            setDocumentLoading(false);
        }
    };

    const runSupplierSync = async () => {
        setSupplierSyncLoading(true);
        try {
            const response = await syncPartsSoftSuppliers();
            const counts = response.data?.counts || {};
            message.success(
                `Поставщики синхронизированы: создано ${counts.created || 0}, обновлено ${counts.updated || 0}, заполнено реквизитов ${counts.fields_filled || 0}, конфликтов ${counts.conflicts || 0}`,
            );
            await loadSupplierStatus();
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(typeof detail === 'string' ? detail : 'Не удалось синхронизировать поставщиков Parts-Soft');
        } finally {
            setSupplierSyncLoading(false);
        }
    };

    const runProductSync = async () => {
        setProductSyncLoading(true);
        try {
            const response = await syncPartsSoftProducts();
            const counts = response.data?.counts || {};
            message.success(
                `Карточки синхронизированы: создано ${counts.created || 0}, обновлено ${counts.updated || 0}, фото добавлено ${counts.photos_added || 0}`,
            );
            if ((response.data?.conflicts || []).length) {
                message.warning(
                    `Не объединено конфликтующих карточек: ${response.data.conflicts.length}. Одинаковые бренд и OEM относятся к разным ID Parts-Soft.`,
                    8,
                );
            }
            await loadProductStatus();
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(typeof detail === 'string' ? detail : 'Не удалось загрузить карточки Parts-Soft');
        } finally {
            setProductSyncLoading(false);
        }
    };

    const runReconciliation = async () => {
        setLoading(true);
        setErrorText('');
        try {
            const response = await reconcilePartsSoftOrders();
            setReport(response.data);
            message.success('Сверка заказов сайта завершена');
        } catch (error) {
            const detail = error?.response?.data?.detail;
            const text = typeof detail === 'string'
                ? detail
                : 'Не удалось выполнить сверку заказов сайта';
            setErrorText(text);
            message.error(text);
        } finally {
            setLoading(false);
        }
    };

    const loadCandidates = async (row, search = '') => {
        setCandidateLoading(true);
        try {
            const response = await getPartsSoftCustomerCandidates({
                name: row.customer_name || '',
                inn: row.customer_inn || '',
                kpp: row.customer_kpp || '',
                email: row.customer_email || '',
                search,
            });
            setCandidates(response.data || []);
        } catch {
            message.error('Не удалось найти клиентов в нашей системе');
            setCandidates([]);
        } finally {
            setCandidateLoading(false);
        }
    };

    const openLink = (row) => {
        setLinkRow(row);
        setSelectedCustomerId(row.local_customer_id || row.suggested_local_customer_id || null);
        setMergeDuplicate(false);
        setCandidates([]);
        void loadCandidates(row);
    };

    const saveLink = async () => {
        if (!linkRow || !selectedCustomerId) return;
        setLinkLoading(true);
        try {
            const response = await linkPartsSoftCustomer(
                linkRow.external_customer_id,
                selectedCustomerId,
                mergeDuplicate,
            );
            const conflicts = response.data?.conflicting_fields || [];
            if (conflicts.length) {
                message.warning(`Связь сохранена. Проверьте расхождения: ${conflicts.join(', ')}`);
            } else {
                message.success(response.data?.merged_customer_id
                    ? `Клиенты объединены, дубль ID ${response.data.merged_customer_id} удалён`
                    : 'Клиент Parts-Soft привязан');
            }
            setLinkRow(null);
            setSelectedCustomerId(null);
            await loadCachedReport();
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(typeof detail === 'string' ? detail : 'Не удалось привязать клиента');
        } finally {
            setLinkLoading(false);
        }
    };

    const rows = useMemo(
        () => (report?.orders || []).map((row) => ({ ...row, key: row.external_order_id })),
        [report]
    );
    const filters = useMemo(
        () => Object.entries(STATUS).map(([value, config]) => ({ text: config.label, value })),
        []
    );
    const columns = [
        {
            title: 'ID Parts-Soft',
            dataIndex: 'external_order_id',
            width: 125,
        },
        {
            title: 'Дата',
            dataIndex: 'created_at',
            width: 155,
            render: (value) => (value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—'),
        },
        {
            title: 'Клиент',
            key: 'customer',
            width: 260,
            render: (_, row) => (
                <div>
                    <div>{row.customer_name || `Parts-Soft #${row.external_customer_id}`}</div>
                    <Text type="secondary">ИНН {row.customer_inn || '—'} · КПП {row.customer_kpp || '—'}</Text>
                </div>
            ),
        },
        {
            title: 'Позиций',
            dataIndex: 'items_count',
            width: 90,
        },
        {
            title: 'Результат',
            dataIndex: 'classification',
            width: 190,
            filters,
            onFilter: (value, row) => row.classification === value,
            render: (value) => {
                const config = STATUS[value] || { label: value, color: 'default' };
                return <Tag color={config.color}>{config.label}</Tag>;
            },
        },
        {
            title: 'Основание',
            dataIndex: 'match_basis',
            width: 180,
            render: formatMatchBasis,
        },
        {
            title: 'Связь у нас',
            key: 'local',
            width: 150,
            render: (_, row) => (
                <div>
                    <div>Клиент: {row.is_own_site_order ? 'наш заказ' : (row.local_customer_id || '—')}</div>
                    <div>Заказ: {row.local_order_id || '—'}</div>
                </div>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            fixed: 'right',
            width: 175,
            render: (_, row) => row.is_own_site_order
                ? <Text type="secondary">Отслеживается</Text>
                : (
                    <Button size="small" onClick={() => openLink(row)}>
                        {row.customer_linked ? 'Изменить связь' : (row.local_customer_id ? 'Подтвердить связь' : 'Привязать')}
                    </Button>
                ),
        },
    ];

    const candidateColumns = [
        {
            title: 'Клиент в нашей системе',
            dataIndex: 'name',
            render: (value, row) => (
                <div>
                    <div>{value}</div>
                    <Text type="secondary">ID {row.id}</Text>
                </div>
            ),
        },
        {
            title: 'Реквизиты',
            key: 'details',
            render: (_, row) => (
                <div>
                    <div>ИНН {row.inn || '—'} · КПП {row.kpp || '—'}</div>
                    <Text type="secondary">{row.email || 'email не указан'}</Text>
                </div>
            ),
        },
        {
            title: 'Почему найден',
            dataIndex: 'match_basis',
            width: 170,
            render: (value) => formatMatchBasis(value) || 'ручной поиск',
        },
    ];

    return (
        <div>
            <Card
                title="Карточки товаров Parts-Soft"
                extra={(
                    <Button type="primary" loading={productSyncLoading} onClick={runProductSync}>
                        Загрузить карточки сейчас
                    </Button>
                )}
                style={{ marginBottom: 16 }}
            >
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={8}>
                        <Statistic title="Карточек сохранено" value={productStatus?.products || 0} />
                    </Col>
                    <Col xs={24} sm={8}>
                        <Statistic title="Карточек с фото" value={productStatus?.products_with_photos || 0} />
                    </Col>
                    <Col xs={24} sm={8}>
                        <Statistic
                            title="Последняя синхронизация"
                            value={productStatus?.last_synced_at
                                ? dayjs(productStatus.last_synced_at).format('DD.MM.YYYY HH:mm')
                                : 'Ещё не запускалась'}
                        />
                    </Col>
                </Row>
                <Paragraph type="secondary" style={{ margin: '12px 0 0' }}>
                    Повторный запуск обновляет существующие карточки по ID Parts-Soft и связке бренд + OEM,
                    не создавая дубли. Описание, размеры и фотографии доступны в нашей номенклатуре;
                    исходные свойства карточки сохраняются полностью.
                </Paragraph>
            </Card>
            <Card
                title="Обмен товарными карточками"
                extra={(
                    <Space wrap>
                        <Popconfirm
                            title="Передать всю нашу номенклатуру в Parts-Soft?"
                            description="Карточки с внешним ID будут обновлены, остальные будут созданы."
                            onConfirm={enqueueAllProducts}
                            okText="Поставить в очередь"
                            cancelText="Отмена"
                        >
                            <Button loading={outboxLoading}>Вся номенклатура</Button>
                        </Popconfirm>
                        <Button type="primary" loading={outboxLoading} onClick={processOutbox}>
                            Отправить изменения сейчас
                        </Button>
                    </Space>
                )}
                style={{ marginBottom: 16 }}
            >
                <Row gutter={[16, 16]}>
                    <Col xs={12} sm={6}><Statistic title="Ожидают" value={outboxStatus?.pending || 0} /></Col>
                    <Col xs={12} sm={6}><Statistic title="Передаются" value={outboxStatus?.processing || 0} /></Col>
                    <Col xs={12} sm={6}><Statistic title="Передано" value={outboxStatus?.sent || 0} /></Col>
                    <Col xs={12} sm={6}><Statistic title="Ошибки" value={outboxStatus?.error || 0} /></Col>
                </Row>
                <Paragraph type="secondary" style={{ margin: '12px 0 0' }}>
                    Новые и изменённые у нас карточки отправляются автоматически каждые 5 минут.
                    Если карточку удалили в Parts-Soft, она будет создана там заново. Удаление в Parts-Soft
                    не удаляет данные из нашей базы.
                </Paragraph>
            </Card>
            <Card
                title="Накладные Parts-Soft"
                extra={(
                    <Button loading={documentLoading} onClick={runDocumentSync}>
                        Импортировать за 30 дней
                    </Button>
                )}
                style={{ marginBottom: 16 }}
            >
                <Row gutter={[16, 16]}>
                    <Col xs={12} sm={6}>
                        <Statistic
                            title="Клиентские"
                            value={Object.values(documentStatus?.documents?.invoice || {}).reduce((a, b) => a + b, 0)}
                        />
                    </Col>
                    <Col xs={12} sm={6}>
                        <Statistic
                            title="Поставщиков"
                            value={Object.values(documentStatus?.documents?.supplier_invoice || {}).reduce((a, b) => a + b, 0)}
                        />
                    </Col>
                    <Col xs={12} sm={6}>
                        <Statistic
                            title="Требуют привязки"
                            value={(documentStatus?.documents?.invoice?.unmatched_counterparty || 0)
                                + (documentStatus?.documents?.supplier_invoice?.unmatched_counterparty || 0)}
                        />
                    </Col>
                    <Col xs={12} sm={6}>
                        <Statistic
                            title="Последнее обновление"
                            value={documentStatus?.last_synced_at
                                ? dayjs(documentStatus.last_synced_at).format('DD.MM.YYYY HH:mm')
                                : '—'}
                        />
                    </Col>
                </Row>
                <Paragraph type="secondary" style={{ margin: '12px 0 0' }}>
                    Клиентские накладные появляются в финансовых документах, накладные поставщиков —
                    в приходах как непроведённые документы. Если контрагент ещё не связан, исходный
                    документ сохраняется и будет импортирован после привязки.
                </Paragraph>
                {unmatchedDocuments.length > 0 && (
                    <Table
                        style={{ marginTop: 12 }}
                        size="small"
                        pagination={{ pageSize: 10, hideOnSinglePage: true }}
                        rowKey="id"
                        dataSource={unmatchedDocuments}
                        columns={[
                            {
                                title: 'Документ',
                                key: 'document',
                                render: (_, row) => row.document_type === 'invoice'
                                    ? 'Клиентская накладная'
                                    : 'Накладная поставщика',
                            },
                            { title: '№', dataIndex: 'document_number', key: 'document_number' },
                            {
                                title: 'Дата',
                                dataIndex: 'document_date',
                                key: 'document_date',
                                render: (value) => value ? dayjs(value).format('DD.MM.YYYY') : '—',
                            },
                            {
                                title: 'ID контрагента Parts-Soft',
                                dataIndex: 'external_counterparty_id',
                                key: 'external_counterparty_id',
                            },
                            { title: 'Сумма', dataIndex: 'total_amount', key: 'total_amount' },
                        ]}
                    />
                )}
            </Card>
            <Card
                title="Поставщики Parts-Soft"
                extra={(
                    <Button loading={supplierSyncLoading} onClick={runSupplierSync}>
                        Синхронизировать поставщиков
                    </Button>
                )}
                style={{ marginBottom: 16 }}
            >
                <Row gutter={[16, 16]} align="middle">
                    <Col xs={24} sm={8}>
                        <Statistic title="Связано поставщиков" value={supplierStatus?.suppliers || 0} />
                    </Col>
                    <Col xs={24} sm={16}>
                        <Paragraph type="secondary" style={{ margin: 0 }}>
                            Parts-Soft хранит поставщиков в общем справочнике контрагентов. Сверка использует
                            постоянный ID Parts-Soft, затем ИНН, email и название. Неоднозначные совпадения
                            остаются конфликтами и не создают дубли автоматически. Юридические, контактные и
                            банковские реквизиты дополняют только пустые поля нашей карточки.
                        </Paragraph>
                    </Col>
                </Row>
            </Card>
            <Alert
                type="info"
                showIcon
                message="Хранятся заказы сайта только за последние 7 дней"
                description="Данные обновляет автоматическая синхронизация. Заказы, созданные нашей системой, отслеживаются по tracking ID. Дубли и конфликты остаются только в этой вкладке."
                style={{ marginBottom: 16 }}
            />
            <Button type="primary" loading={loading} onClick={runReconciliation}>
                Обновить с сайта сейчас
            </Button>

            {errorText && (
                <Alert
                    type="error"
                    showIcon
                    message="Сверка не выполнена"
                    description={errorText}
                    style={{ marginTop: 16 }}
                />
            )}

            {report && (
                <>
                    <Paragraph style={{ marginTop: 12 }} type="secondary">
                        Период: {dayjs(report.date_from).format('DD.MM.YYYY HH:mm')} — {dayjs(report.date_to).format('DD.MM.YYYY HH:mm')}
                        {report.cache_updated_at && ` · данные обновлены ${dayjs(report.cache_updated_at).format('DD.MM.YYYY HH:mm')}`}
                    </Paragraph>
                    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                        <Col xs={12} md={6}><Card size="small"><Statistic title="Всего на сайте" value={report.remote_orders_total} /></Card></Col>
                        <Col xs={12} md={6}><Card size="small"><Statistic title="Заказов проверено" value={report.qualified_orders} /></Card></Col>
                        <Col xs={12} md={6}><Card size="small"><Statistic title="Позиций" value={report.items_total} /></Card></Col>
                        <Col xs={12} md={6}><Card size="small"><Statistic title="Требуют проверки" value={(report.orders || []).filter((row) => row.review_required).length} /></Card></Col>
                    </Row>
                    <Table
                        size="small"
                        loading={loading}
                        dataSource={rows}
                        columns={columns}
                        pagination={{ pageSize: 25, showSizeChanger: true }}
                        scroll={{ x: 1280 }}
                    />
                </>
            )}
            <Modal
                title="Привязать клиента Parts-Soft"
                open={Boolean(linkRow)}
                onCancel={() => setLinkRow(null)}
                onOk={saveLink}
                okText="Сохранить связь"
                cancelText="Отмена"
                okButtonProps={{ disabled: !selectedCustomerId }}
                confirmLoading={linkLoading}
                width={900}
                destroyOnClose
            >
                {linkRow && (
                    <Alert
                        type="info"
                        message={linkRow.customer_name}
                        description={(
                            <div>
                                <div>Parts-Soft ID {linkRow.external_customer_id}; ИНН {linkRow.customer_inn || '—'}; КПП {linkRow.customer_kpp || '—'}</div>
                                <div>Сохраняется постоянная связь. Пустые реквизиты клиента будут дополнены, существующие значения не перезаписываются.</div>
                            </div>
                        )}
                        style={{ marginBottom: 12 }}
                    />
                )}
                <Input.Search
                    allowClear
                    placeholder="Название, ИНН, КПП, email или ID клиента"
                    enterButton="Найти"
                    onSearch={(value) => linkRow && loadCandidates(linkRow, value)}
                    style={{ marginBottom: 12 }}
                />
                <Table
                    size="small"
                    loading={candidateLoading}
                    dataSource={candidates.map((row) => ({ ...row, key: row.id }))}
                    columns={candidateColumns}
                    rowSelection={{
                        type: 'radio',
                        selectedRowKeys: selectedCustomerId ? [selectedCustomerId] : [],
                        onChange: (keys) => setSelectedCustomerId(keys[0] || null),
                    }}
                    onRow={(row) => ({ onClick: () => setSelectedCustomerId(row.id) })}
                    pagination={{ pageSize: 10 }}
                />
                {linkRow?.local_customer_id
                    && selectedCustomerId
                    && Number(linkRow.local_customer_id) !== Number(selectedCustomerId) && (
                    <Checkbox
                        checked={mergeDuplicate}
                        onChange={(event) => setMergeDuplicate(event.target.checked)}
                        style={{ marginTop: 12 }}
                    >
                        Перенести заказы и связанные данные из клиента ID {linkRow.local_customer_id}
                        {' '}в выбранную карточку и удалить дубль
                    </Checkbox>
                )}
            </Modal>
        </div>
    );
};

export default PartsSoftOrderReconciliation;
