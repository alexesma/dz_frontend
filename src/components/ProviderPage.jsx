// src/components/ProviderPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    Card,
    Form,
    Input,
    Button,
    message,
    Spin,
    Divider,
    Space,
    Select,
    InputNumber,
    Typography,
    Table,
    Tag,
    Modal,
    Popconfirm,
    Upload,
    Switch,
} from "antd";
import {
    SaveOutlined,
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ArrowLeftOutlined,
    UploadOutlined,
    CloudDownloadOutlined,
} from "@ant-design/icons";

import {
    getProviderFullById,
    createProvider,
    updateProvider,
    deleteProviderApi,
    createProviderConfig,
    updateProviderConfig,
    deleteProviderConfig,
    createAbbreviation,
    updateAbbreviation,
    deleteAbbreviation,
    downloadProviderPricelist,
    uploadProviderPricelist,
} from "../api/providers";

const { Title, Text } = Typography;

const ProviderPage = () => {
    const { providerId: providerIdParam } = useParams();
    const navigate = useNavigate();

    const isNew = !providerIdParam || providerIdParam.toLowerCase() === "create";
    const providerId = !isNew ? Number(providerIdParam) : null;

    const [loading, setLoading] = useState(!isNew);
    const [downloading, setDownloading] = useState({});

    const [saving, setSaving] = useState(false);
    const [providerData, setProviderData] = useState(null);

    const [configModalVisible, setConfigModalVisible] = useState(false);
    const [editingConfig, setEditingConfig] = useState(null);

    const [abbrModalVisible, setAbbrModalVisible] = useState(false);
    const [editingAbbr, setEditingAbbr] = useState(null);

    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [uploadingForConfigId, setUploadingForConfigId] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadForm] = Form.useForm();

    const [providerForm] = Form.useForm();
    const [configForm] = Form.useForm();
    const [abbrForm] = Form.useForm();

    // --- загрузка данных при редактировании ---
    useEffect(() => {
        if (isNew) {
            // режим создания — чистая форма
            providerForm.resetFields();
            setProviderData(null);
            setLoading(false);
            return;
        }

        // защита от кривого урла /providers/undefined/edit или /providers/abc/edit
        if (!providerId || Number.isNaN(providerId)) {
            message.error("Некорректный идентификатор поставщика");
            navigate("/providers");
            return;
        }

        (async () => {
            setLoading(true);
            try {
                const { data } = await getProviderFullById(providerId);
                setProviderData(data);
                providerForm.setFieldsValue({
                    name: data.provider.name,
                    email_contact: data.provider.email_contact,
                    email_incoming_price: data.provider.email_incoming_price,
                    type_prices: data.provider.type_prices,
                    description: data.provider.description,
                    comment: data.provider.comment,
                    is_virtual: data.provider.is_virtual,
                });
            } catch (err) {
                message.error(err?.message || "Ошибка загрузки поставщика");
                navigate("/providers");
            } finally {
                setLoading(false);
            }
        })();
    }, [isNew, providerId, providerForm, navigate]);


    const handleProviderSubmit = async (values) => {
        setSaving(true);
        try {
            if (isNew) {
                const { data } = await createProvider(values);
                message.success("Поставщик успешно создан");
                // после создания переходим на страницу редактирования созданного поставщика
                navigate(`/providers/${data.id}/edit`);
            } else {
                await updateProvider(providerId, values);
                message.success("Данные поставщика обновлены");
                // обновляем данные на странице
                const { data } = await getProviderFullById(providerId);
                setProviderData(data);
            }
        } catch (err) {
            console.error(err);
            message.error("Ошибка сохранения поставщика");
        } finally {
            setSaving(false);
        }
    };

    // --- удалить поставщика ---
    const handleDeleteProvider = async () => {
        if (!providerId) return;

        try {
            await deleteProviderApi(providerId);
            message.success('Поставщик удалён');
            navigate('/providers');
        } catch (err) {
            message.error(err?.message || 'Ошибка удаления поставщика');
        }
    };

    // --- конфиги ---
    const openConfigModal = (config = null) => {
        setEditingConfig(config);
        if (config) {
            configForm.setFieldsValue(config);
        } else {
            configForm.resetFields();
        }
        setConfigModalVisible(true);
    };

    const handleConfigSubmit = async (values) => {
        if (!providerId) return;

        try {
            if (editingConfig) {
                await updateProviderConfig(providerId, editingConfig.id, values);
                message.success("Конфигурация обновлена");
            } else {
                await createProviderConfig(providerId, values);
                message.success("Конфигурация создана");
            }
            setConfigModalVisible(false);
            setEditingConfig(null);
            configForm.resetFields();

            // обновляем данные
            const { data } = await getProviderFullById(providerId);
            setProviderData(data);
        } catch (err) {
            console.error(err);
            message.error("Ошибка сохранения конфигурации");
        }
    };

    const handleDeleteConfig = async (configId) => {
        if (!providerId) return;

        try {
            await deleteProviderConfig(providerId, configId);
            message.success("Конфигурация удалена");

            // обновляем данные
            const { data } = await getProviderFullById(providerId);
            setProviderData(data);
        } catch (err) {
            console.error(err);
            message.error("Ошибка удаления конфигурации");
        }
    };

    // ===== Handlers: Abbreviations =====
    const openAbbrModal = (abbr = null) => {
        setEditingAbbr(abbr);
        if (abbr) {
            abbrForm.setFieldsValue({ abbreviation: abbr.abbreviation });
        } else {
            abbrForm.resetFields();
        }
        setAbbrModalVisible(true);
    };

    const handleAbbrSubmit = async (values) => {
        if (!providerId) return;

        try {
            if (editingAbbr) {
                await updateAbbreviation(
                    providerId,
                    editingAbbr.id,
                    values.abbreviation
                );
                message.success("Аббревиатура обновлена");
            } else {
                await createAbbreviation(providerId, values.abbreviation);
                message.success("Аббревиатура добавлена");
            }
            setAbbrModalVisible(false);
            setEditingAbbr(null);
            abbrForm.resetFields();

            // обновляем данные
            const { data } = await getProviderFullById(providerId);
            setProviderData(data);
        } catch (err) {
            console.error(err);
            message.error("Ошибка сохранения аббревиатуры");
        }
    };

    const handleDeleteAbbr = async (abbrId) => {
        if (!providerId) return;

        try {
            await deleteAbbreviation(providerId, abbrId);
            message.success("Аббревиатура удалена");

            // обновляем данные
            const { data } = await getProviderFullById(providerId);
            setProviderData(data);
        } catch (err) {
            console.error(err);
            message.error("Ошибка удаления аббревиатуры");
        }
    };

    // --------- Загрузка прайс-листа по конфигу ----------
    const handleDownloadPricelist = async (configId) => {
        if (!providerId) return;

        setDownloading(prev => ({ ...prev, [configId]: true }));

        try {
            await downloadProviderPricelist(providerId, configId);
            message.success("Прайс-лист успешно загружен из email и обработан");

            // обновляем данные после загрузки
            const { data } = await getProviderFullById(providerId);
            setProviderData(data);
        } catch (err) {
            console.error(err);
            message.error(err?.response?.data?.detail || "Ошибка загрузки прайс-листа из email");
        } finally {
            setDownloading(prev => ({ ...prev, [configId]: false }));
        }
    };

    // ===== Upload pricelist from local file =====
    const openUploadModal = (configId) => {
        const config = providerData.pricelist_configs.find(c => c.id === configId);
        setUploadingForConfigId(configId);

        // Предзаполняем форму данными из конфигурации
        uploadForm.setFieldsValue({
            use_stored_params: true,
            start_row: config?.start_row || 1,
            oem_col: config?.oem_col || 0,
            brand_col: config?.brand_col || null,
            name_col: config?.name_col || null,
            qty_col: config?.qty_col || 1,
            price_col: config?.price_col || 2,
        });

        setUploadModalVisible(true);
    };

    const handleUploadPricelist = async () => {
        if (!providerId || !uploadingForConfigId) return;

        try {
            const values = await uploadForm.validateFields();

            const fileList = values.file?.fileList || [];
            if (!fileList.length) {
                message.error("Выберите файл прайс-листа");
                return;
            }
            const fileObj = fileList[0].originFileObj;

            setUploading(true);
            await uploadProviderPricelist(providerId, uploadingForConfigId, {
                file: fileObj,
                use_stored_params: values.use_stored_params ?? true,
                start_row: values.start_row,
                oem_col: values.oem_col,
                brand_col: values.brand_col,
                name_col: values.name_col,
                qty_col: values.qty_col,
                price_col: values.price_col,
            });

            message.success("Прайс-лист успешно загружен и обработан");
            setUploadModalVisible(false);
            setUploadingForConfigId(null);
            uploadForm.resetFields();

            // обновляем данные после загрузки
            const { data } = await getProviderFullById(providerId);
            setProviderData(data);
        } catch (err) {
            console.error(err);
            message.error(err?.response?.data?.detail || "Ошибка загрузки прайс-листа");
        } finally {
            setUploading(false);
        }
    };

    // ===== Table columns for configs =====
    const configColumns = [
        {
            title: "Название прайса",
            dataIndex: "name_price",
            key: "name_price",
            render: (text) => text || <span style={{ color: "#ccc" }}>—</span>,
        },
        {
            title: "Название письма",
            dataIndex: "name_mail",
            key: "name_mail",
            render: (text) => text || <span style={{ color: "#ccc" }}>—</span>,
        },
        {
            title: "URL файла",
            dataIndex: "file_url",
            key: "file_url",
            render: (text) => text || <span style={{ color: "#ccc" }}>—</span>,
        },
        {
            title: "Строка начала",
            dataIndex: "start_row",
            key: "start_row",
        },
        {
            title: "Колонки",
            key: "columns",
            render: (_, record) => (
                <div>
                    <div>OEM: {record.oem_col}</div>
                    <div>Кол-во: {record.qty_col}</div>
                    <div>Цена: {record.price_col}</div>
                    {record.name_col !== null && record.name_col !== undefined && (
                        <div>Название: {record.name_col}</div>
                    )}
                    {record.brand_col !== null && record.brand_col !== undefined && (
                        <div>Бренд: {record.brand_col}</div>
                    )}
                </div>
            ),
        },
        {
            title: "Доставка (дни)",
            key: "delivery",
            render: (_, record) => (
                <span>
                    {record.min_delivery_day ?? 1} - {record.max_delivery_day ?? 3}
                </span>
            ),
        },
        {
            title: "Последний прайс",
            key: "latest_pricelist",
            render: (_, record) => {
                if (!record.latest_pricelist) {
                    return <Tag color="default">Нет прайсов</Tag>;
                }
                return (
                    <div>
                        <Tag color={record.latest_pricelist.is_active ? "green" : "orange"}>
                            ID: {record.latest_pricelist.id}
                        </Tag>
                        <div style={{ fontSize: "12px", color: "#666" }}>
                            {record.latest_pricelist.date}
                        </div>
                    </div>
                );
            },
        },
        {
            title: "Действия",
            key: "actions",
            width: 120,
            render: (_, record) => (
                <Space size="small">
                    <Button
                        icon={<UploadOutlined />}
                        size="small"
                        onClick={() => openUploadModal(record.id)}
                    >
                        Загрузить файл
                    </Button>
                    <Button
                        type="default"
                        size="small"
                        icon={<CloudDownloadOutlined />}
                        loading={downloading[record.id]}
                        onClick={() => handleDownloadPricelist(record.id)}
                        title="Скачать прайс-лист из email"
                    />
                    <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openConfigModal(record)}
                    />
                    <Popconfirm
                        title="Удалить конфигурацию?"
                        description="Это действие необратимо"
                        onConfirm={() => handleDeleteConfig(record.id)}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button type="primary" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", padding: 50 }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div style={{ margin: 20 }}>
            <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/providers')}>
                    Назад к списку
                </Button>

                {!isNew && (
                    <Popconfirm
                        title="Удалить поставщика?"
                        description="Это действие необратимо"
                        onConfirm={handleDeleteProvider}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button danger>Удалить поставщика</Button>
                    </Popconfirm>
                )}
            </div>

            <Title level={2}>
                {isNew
                    ? "Создание поставщика"
                    : `Поставщик: ${providerData?.provider?.name ?? "..."}`}
            </Title>

            {/* Форма поставщика */}
            <Card title="Основная информация" style={{ marginBottom: 20 }}>
                <Form form={providerForm} layout="vertical" onFinish={handleProviderSubmit}>
                    <Form.Item
                        name="name"
                        label="Название"
                        rules={[
                            { required: true, whitespace: true, message: 'Введите название поставщика' },
                            { validator: (_, v) => {
                                    const val = (v ?? '').trim();
                                    if (!val) return Promise.reject('Название не может быть пустым');
                                    if (!/^[A-Za-z0-9 .,_&()\\-]+$/.test(val)) {
                                      return Promise.reject('Разрешены только латинские буквы, цифры и - _ . , & ( )');
                                    }
                                    return Promise.resolve();
                                }
                            }
                        ]}
                        normalize={(v) => (v ?? '').trim()}
                    >
                        <Input placeholder="Название поставщика" />
                    </Form.Item>

                    <Form.Item
                        name="type_prices"
                        label="Тип цен"
                        rules={[{ required: true, message: "Выберите тип цен" }]}
                    >
                        <Select
                            options={[
                                { value: "Wholesale", label: "Оптовые" },
                                { value: "Retail", label: "Розничные" },
                            ]}
                            placeholder="Выберите тип цен"
                        />
                    </Form.Item>

                    <Form.Item
                        name="email_contact"
                        label="Контактный Email"
                        rules={[{ type: "email", message: "Введите корректный email" }]}
                    >
                        <Input placeholder="contact@provider.com" />
                    </Form.Item>

                    <Form.Item
                        name="email_incoming_price"
                        label="Email входящих прайсов"
                        rules={[{ type: "email", message: "Введите корректный email" }]}
                    >
                        <Input placeholder="prices@provider.com" />
                    </Form.Item>

                    <Form.Item name="description" label="Описание">
                        <Input.TextArea rows={3} placeholder="Описание поставщика" />
                    </Form.Item>

                    <Form.Item name="comment" label="Комментарий">
                        <Input.TextArea rows={2} placeholder="Дополнительные комментарии" />
                    </Form.Item>

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={saving}
                            icon={<SaveOutlined />}
                        >
                            {isNew ? "Создать поставщика" : "Сохранить изменения"}
                        </Button>
                    </Form.Item>
                </Form>
            </Card>

            {/* Блоки только для существующего поставщика */}
            {!isNew && providerData && (
                <>
                    {/* Аббревиатуры */}
                    <Card
                        title="Аббревиатуры"
                        extra={
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => openAbbrModal()}>
                                Добавить
                            </Button>
                        }
                        style={{ marginBottom: 20 }}
                    >
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {providerData.abbreviations?.length ? (
                                providerData.abbreviations.map((abbr) => (
                                    <Tag
                                        key={abbr.id}
                                        color="blue"
                                        closable
                                        onClose={(e) => {
                                            e.preventDefault();
                                            handleDeleteAbbr(abbr.id);
                                        }}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                            cursor: "pointer",
                                            paddingInline: 10,
                                            height: 28,
                                        }}
                                        onClick={() => openAbbrModal(abbr)}
                                    >
                                        {abbr.abbreviation}
                                        <EditOutlined style={{ fontSize: 12 }} />
                                    </Tag>
                                ))
                            ) : (
                                <Text type="secondary">Аббревиатуры не добавлены</Text>
                            )}
                        </div>
                    </Card>

                    {/* Конфигурации прайс-листов */}
                    <Card
                        title="Конфигурации прайс-листов"
                        extra={
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => openConfigModal()}>
                                Добавить конфигурацию
                            </Button>
                        }
                    >
                        <Table
                            rowKey="id"
                            columns={configColumns}
                            dataSource={providerData.pricelist_configs || []}
                            pagination={false}
                            size="middle"
                            locale={{ emptyText: "Конфигурации не настроены" }}
                            scroll={{ x: 900 }}
                        />
                    </Card>

                    {/* Информация о последнем письме */}
                    {providerData.provider?.last_email_uid && (
                        <Card title="Последний Email UID" style={{ marginTop: 20 }}>
                            <div>
                                <Text strong>UID: </Text>
                                <Text>{providerData.provider.last_email_uid.uid}</Text>
                            </div>
                            {providerData.provider.last_email_uid.updated_at && (
                                <div>
                                    <Text strong>Обновлен: </Text>
                                    <Text>
                                        {new Date(
                                            providerData.provider.last_email_uid.updated_at
                                        ).toLocaleString()}
                                    </Text>
                                </div>
                            )}
                        </Card>
                    )}
                </>
            )}

            {/* Модалка конфигурации */}
            <Modal
                title={editingConfig ? "Редактирование конфигурации" : "Создание конфигурации"}
                open={configModalVisible}
                onCancel={() => {
                    setConfigModalVisible(false);
                    setEditingConfig(null);
                    configForm.resetFields();
                }}
                footer={null}
                width={800}
                destroyOnClose
            >
                <Form form={configForm} layout="vertical" onFinish={handleConfigSubmit}>
                    <Form.Item name="name_price" label="Название прайса">
                        <Input placeholder="Например: Основной прайс" />
                    </Form.Item>

                    <Form.Item name="name_mail" label="Название письма">
                        <Input placeholder="Шаблон темы письма для поиска" />
                    </Form.Item>

                    <Form.Item name="file_url" label="URL файла">
                        <Input placeholder="http://example.com/pricelist.xlsx" />
                    </Form.Item>

                    <Divider>Настройки парсинга</Divider>

                    <Form.Item
                        name="start_row"
                        label="Строка начала данных"
                        rules={[{ required: true, message: "Укажите строку начала" }]}
                    >
                        <InputNumber min={1} placeholder="Номер строки" style={{ width: "100%" }} />
                    </Form.Item>

                    <div
                        style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}
                    >
                        <Form.Item
                            name="oem_col"
                            label="Колонка OEM номера"
                            rules={[{ required: true, message: "Укажите колонку OEM" }]}
                        >
                            <InputNumber min={0} placeholder="Номер колонки" style={{ width: "100%" }} />
                        </Form.Item>

                        <Form.Item name="name_col" label="Колонка названия">
                            <InputNumber min={0} placeholder="Номер колонки" style={{ width: "100%" }} />
                        </Form.Item>

                        <Form.Item name="brand_col" label="Колонка бренда">
                            <InputNumber min={0} placeholder="Номер колонки" style={{ width: "100%" }} />
                        </Form.Item>

                        <Form.Item
                            name="qty_col"
                            label="Колонка количества"
                            rules={[{ required: true, message: "Укажите колонку количества" }]}
                        >
                            <InputNumber min={0} placeholder="Номер колонки" style={{ width: "100%" }} />
                        </Form.Item>

                        <Form.Item
                            name="price_col"
                            label="Колонка цены"
                            rules={[{ required: true, message: "Укажите колонку цены" }]}
                        >
                            <InputNumber min={0} placeholder="Номер колонки" style={{ width: "100%" }} />
                        </Form.Item>
                    </div>

                    <Divider>Настройки доставки</Divider>

                    <div
                        style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}
                    >
                        <Form.Item name="min_delivery_day" label="Минимум дней доставки" initialValue={1}>
                            <InputNumber min={0} style={{ width: "100%" }} />
                        </Form.Item>

                        <Form.Item name="max_delivery_day" label="Максимум дней доставки" initialValue={3}>
                            <InputNumber min={0} style={{ width: "100%" }} />
                        </Form.Item>
                    </div>

                    <Form.Item>
                        <Space>
                            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                                {editingConfig ? "Обновить" : "Создать"}
                            </Button>
                            <Button
                                onClick={() => {
                                    setConfigModalVisible(false);
                                    setEditingConfig(null);
                                    configForm.resetFields();
                                }}
                            >
                                Отмена
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Модалка аббревиатуры */}
            <Modal
                title={editingAbbr ? "Редактирование аббревиатуры" : "Добавление аббревиатуры"}
                open={abbrModalVisible}
                onCancel={() => {
                    setAbbrModalVisible(false);
                    setEditingAbbr(null);
                    abbrForm.resetFields();
                }}
                footer={null}
                destroyOnClose
            >
                <Form form={abbrForm} layout="vertical" onFinish={handleAbbrSubmit}>
                    <Form.Item
                        name="abbreviation"
                        label="Аббревиатура"
                        rules={[
                            { required: true, message: "Введите аббревиатуру" },
                            { max: 20, message: "Максимум 20 символов" },
                        ]}
                    >
                        <Input placeholder="Например: ABC" maxLength={20} />
                    </Form.Item>

                    <Form.Item>
                        <Space>
                            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                                {editingAbbr ? "Обновить" : "Добавить"}
                            </Button>
                            <Button
                                onClick={() => {
                                    setAbbrModalVisible(false);
                                    setEditingAbbr(null);
                                    abbrForm.resetFields();
                                }}
                            >
                                Отмена
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
            {/* Модал: загрузка прайс-листа */}
            <Modal
                title="Загрузка прайс-листа"
                open={uploadModalVisible}
                onCancel={() => {
                    setUploadModalVisible(false);
                    setUploadingForConfigId(null);
                    uploadForm.resetFields();
                }}
                footer={null}
                width={600}
                destroyOnClose
            >
                <Form form={uploadForm} layout="vertical" onFinish={handleUploadPricelist}>
                    <Form.Item
                        name="file"
                        label="Файл прайс-листа"
                        rules={[{ required: true, message: "Выберите файл" }]}
                    >
                        <Upload
                            accept=".xlsx,.xls,.csv"
                            maxCount={1}
                            beforeUpload={() => false}
                        >
                            <Button icon={<UploadOutlined />}>Выбрать файл</Button>
                        </Upload>
                    </Form.Item>

                    <Form.Item
                        name="use_stored_params"
                        label="Использовать параметры из конфигурации"
                        valuePropName="checked"
                        initialValue={true}
                    >
                        <input type="checkbox" />
                        <span style={{ marginLeft: 8 }}>Использовать сохраненные параметры парсинга</span>
                    </Form.Item>

                    <Form.Item noStyle shouldUpdate>
                        {({ getFieldValue }) => {
                            const useStoredParams = getFieldValue('use_stored_params');
                            if (useStoredParams) return null;

                            return (
                                <>
                                    <Divider>Параметры парсинга</Divider>

                                    <Form.Item
                                        name="start_row"
                                        label="Строка начала данных"
                                        rules={[{ required: true, message: "Укажите строку начала" }]}
                                    >
                                        <InputNumber min={1} style={{ width: "100%" }} />
                                    </Form.Item>

                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                                        <Form.Item
                                            name="oem_col"
                                            label="Колонка OEM"
                                            rules={[{ required: true, message: "Укажите колонку OEM" }]}
                                        >
                                            <InputNumber min={0} style={{ width: "100%" }} />
                                        </Form.Item>

                                        <Form.Item name="name_col" label="Колонка названия">
                                            <InputNumber min={0} style={{ width: "100%" }} />
                                        </Form.Item>

                                        <Form.Item name="brand_col" label="Колонка бренда">
                                            <InputNumber min={0} style={{ width: "100%" }} />
                                        </Form.Item>

                                        <Form.Item
                                            name="qty_col"
                                            label="Колонка количества"
                                            rules={[{ required: true, message: "Укажите колонку количества" }]}
                                        >
                                            <InputNumber min={0} style={{ width: "100%" }} />
                                        </Form.Item>

                                        <Form.Item
                                            name="price_col"
                                            label="Колонка цены"
                                            rules={[{ required: true, message: "Укажите колонку цены" }]}
                                        >
                                            <InputNumber min={0} style={{ width: "100%" }} />
                                        </Form.Item>
                                    </div>
                                </>
                            );
                        }}
                    </Form.Item>

                    <Form.Item>
                        <Space>
                            <Button type="primary" htmlType="submit" loading={uploading} icon={<SaveOutlined />}>
                                Загрузить и обработать
                            </Button>
                            <Button
                                onClick={() => {
                                    setUploadModalVisible(false);
                                    setUploadingForConfigId(null);
                                    uploadForm.resetFields();
                                }}
                            >
                                Отмена
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ProviderPage;