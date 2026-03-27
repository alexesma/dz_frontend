import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Empty, Space, Spin, Table, Tag, Typography, message } from "antd";
import { ReloadOutlined } from "@ant-design/icons";

import { getProviderPricelistAnalytics } from "../api/providers";

const { Text, Title } = Typography;

const formatNumber = (value) => {
    if (value === null || value === undefined) return "—";
    const number = Number(value);
    if (Number.isNaN(number)) return value;
    return number.toLocaleString("ru-RU");
};

const formatPrice = (value) => {
    if (value === null || value === undefined) return "—";
    const number = Number(value);
    if (Number.isNaN(number)) return value;
    return number.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const formatPercent = (value) => {
    if (value === null || value === undefined) return "—";
    const number = Number(value);
    if (Number.isNaN(number)) return value;
    const sign = number > 0 ? "+" : "";
    return `${sign}${number.toFixed(2)}%`;
};

const ProviderPricelistAnalyticsSection = ({ providerId, refreshKey = 0 }) => {
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState([]);

    const loadAnalytics = useCallback(async ({ withSpinner = true } = {}) => {
        if (!providerId) return;
        if (withSpinner) setLoading(true);
        try {
            const { data } = await getProviderPricelistAnalytics(providerId, {
                top_n: 20,
            });
            setItems(data || []);
        } catch (err) {
            console.error(err);
            message.error(
                err?.response?.data?.detail || "Не удалось загрузить сводный анализ прайсов"
            );
        } finally {
            if (withSpinner) setLoading(false);
        }
    }, [providerId]);

    useEffect(() => {
        loadAnalytics();
    }, [loadAnalytics, refreshKey]);

    const turnoverColumns = useMemo(
        () => [
            {
                title: "OEM",
                dataIndex: "oem_number",
                key: "oem_number",
                width: 160,
            },
            {
                title: "Бренд / позиция",
                key: "name",
                render: (_, record) => (
                    <div>
                        <div>{record.brand || "—"}</div>
                        <Text type="secondary">{record.name || "—"}</Text>
                    </div>
                ),
            },
            {
                title: "Падение остатков",
                dataIndex: "quantity_drop",
                key: "quantity_drop",
                width: 140,
                render: (value) => formatNumber(value),
            },
            {
                title: "Было → стало",
                key: "qtys",
                width: 150,
                render: (_, record) => `${formatNumber(record.old_quantity)} → ${formatNumber(record.new_quantity)}`,
            },
            {
                title: "Текущая цена",
                dataIndex: "new_price",
                key: "new_price",
                width: 130,
                render: (value) => formatPrice(value),
            },
        ],
        []
    );

    const priceChangeColumns = useMemo(
        () => [
            {
                title: "OEM",
                dataIndex: "oem_number",
                key: "oem_number",
                width: 160,
            },
            {
                title: "Бренд / позиция",
                key: "name",
                render: (_, record) => (
                    <div>
                        <div>{record.brand || "—"}</div>
                        <Text type="secondary">{record.name || "—"}</Text>
                    </div>
                ),
            },
            {
                title: "Цена",
                key: "prices",
                width: 180,
                render: (_, record) => `${formatPrice(record.old_price)} → ${formatPrice(record.new_price)}`,
            },
            {
                title: "Изм. цены",
                dataIndex: "price_diff_pct",
                key: "price_diff_pct",
                width: 130,
                render: (value) => (
                    <Text type={Number(value) >= 0 ? "danger" : "success"}>
                        {formatPercent(value)}
                    </Text>
                ),
            },
            {
                title: "Остаток",
                key: "qtys",
                width: 150,
                render: (_, record) => `${formatNumber(record.old_quantity)} → ${formatNumber(record.new_quantity)}`,
            },
        ],
        []
    );

    return (
        <Card
            title="Сводный анализ последних прайсов"
            extra={
                <Button
                    icon={<ReloadOutlined />}
                    onClick={() => loadAnalytics()}
                    loading={loading}
                >
                    Обновить
                </Button>
            }
            style={{ marginTop: 16 }}
        >
            {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                    <Spin size="large" />
                </div>
            ) : !items.length ? (
                <Empty description="Для этого поставщика пока нет данных анализа" />
            ) : (
                <Space direction="vertical" size={16} style={{ width: "100%" }}>
                    {items.map((item) => (
                        <Card
                            key={item.config_id}
                            type="inner"
                            title={item.config_name || `Конфиг #${item.config_id}`}
                        >
                            <Space wrap size={[8, 8]} style={{ marginBottom: 12 }}>
                                <Tag color="blue">Последний прайс: {item.latest_pricelist_id || "—"}</Tag>
                                <Tag>Дата: {item.latest_pricelist_date || "—"}</Tag>
                                <Tag>Предыдущий: {item.previous_pricelist_id || "—"}</Tag>
                                <Tag color="purple">Позиций: {formatNumber(item.latest_positions_count)}</Tag>
                                <Tag color="green">Новых: {formatNumber(item.new_positions_count)}</Tag>
                                <Tag color="red">Удалено: {formatNumber(item.removed_positions_count)}</Tag>
                                <Tag color="gold">Изменений цены: {formatNumber(item.changed_price_count)}</Tag>
                                <Tag color="cyan">Изменений остатков: {formatNumber(item.changed_quantity_count)}</Tag>
                            </Space>

                            {!item.ready ? (
                                <Text type="secondary">{item.note || "Недостаточно данных для анализа."}</Text>
                            ) : (
                                <Space direction="vertical" size={16} style={{ width: "100%" }}>
                                    <div>
                                        <Title level={5} style={{ marginBottom: 8 }}>
                                            Самые оборачиваемые позиции
                                        </Title>
                                        <Table
                                            size="small"
                                            rowKey={(record) => `turnover-${item.config_id}-${record.autopart_id}`}
                                            columns={turnoverColumns}
                                            dataSource={item.top_turnover_positions || []}
                                            pagination={false}
                                            locale={{ emptyText: "Нет заметных падений остатков между двумя последними прайсами" }}
                                            scroll={{ x: 860 }}
                                        />
                                    </div>

                                    <div>
                                        <Title level={5} style={{ marginBottom: 8 }}>
                                            Самые резкие изменения цены
                                        </Title>
                                        <Table
                                            size="small"
                                            rowKey={(record) => `price-${item.config_id}-${record.autopart_id}`}
                                            columns={priceChangeColumns}
                                            dataSource={item.sharpest_price_changes || []}
                                            pagination={false}
                                            locale={{ emptyText: "Нет заметных изменений цены между двумя последними прайсами" }}
                                            scroll={{ x: 920 }}
                                        />
                                    </div>
                                </Space>
                            )}
                        </Card>
                    ))}
                </Space>
            )}
        </Card>
    );
};

export default ProviderPricelistAnalyticsSection;
