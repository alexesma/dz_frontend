/**
 * DepositsTab — учёт депозитов «на вечер» (Банк Точка и др.).
 *
 * Операции выписок «открытие депозита» → «возврат средств» → «выплата
 * процентов» связываются в сделку по её номеру. Здесь видно, сколько
 * заработано на процентах, под какую ставку и сколько денег лежит на депозите.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const fmt = (v) =>
    v != null ? Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtDate = (d) => (d ? dayjs(d).format('DD.MM.YYYY') : '—');
const nowrap = { whiteSpace: 'nowrap' };

const PRESETS = [
    { label: 'Этот месяц',   value: () => [dayjs().startOf('month'), dayjs()] },
    { label: 'Прошлый месяц', value: () => [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
    { label: '30 дней',      value: () => [dayjs().subtract(30, 'day'), dayjs()] },
    { label: 'С начала года', value: () => [dayjs().startOf('year'), dayjs()] },
];

const Metric = ({ label, value, hint, accent }) => (
    <div className="deposit-metric">
        <div className="deposit-metric-label">{label}</div>
        <div className="deposit-metric-value" style={accent ? { color: accent } : undefined}>{value}</div>
        {hint && <div className="deposit-metric-hint">{hint}</div>}
    </div>
);

const DepositsTab = () => {
    const [range, setRange] = useState([dayjs().startOf('month'), dayjs()]);
    const [data, setData] = useState({ totals: null, deals: [] });
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (range?.[0]) params.date_from = range[0].format('YYYY-MM-DD');
            if (range?.[1]) params.date_to = range[1].format('YYYY-MM-DD');
            const res = await api.get('/finance/deposits/summary', { params });
            setData(res.data);
        } catch {
            message.error('Не удалось загрузить депозиты');
        } finally {
            setLoading(false);
        }
    }, [range]);

    useEffect(() => { load(); }, [load]);

    const { totals, deals } = data;

    const columns = [
        {
            title: 'Сделка',
            dataIndex: 'deal_ref',
            width: '24%',
            render: (v) => <Text style={{ fontSize: 12, ...nowrap }}>{v || 'без номера'}</Text>,
        },
        {
            title: 'Открыта',
            dataIndex: 'opened_on',
            width: 98,
            render: (v) => <Text style={{ fontSize: 12, ...nowrap }}>{fmtDate(v)}</Text>,
        },
        {
            title: 'Возврат',
            dataIndex: 'returned_on',
            width: 98,
            render: (v) => <Text style={{ fontSize: 12, ...nowrap }}>{fmtDate(v)}</Text>,
        },
        {
            title: 'Сумма',
            dataIndex: 'principal',
            align: 'right',
            render: (v) => <Text style={{ fontSize: 12, ...nowrap }}>{fmt(v)}</Text>,
        },
        {
            title: 'Дней',
            dataIndex: 'days',
            width: 64,
            align: 'right',
            render: (v) => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text>,
        },
        {
            title: 'Проценты',
            dataIndex: 'interest',
            align: 'right',
            render: (v) => (
                <Text strong style={{ fontSize: 12, color: Number(v) > 0 ? '#27ae60' : undefined, ...nowrap }}>
                    {Number(v) > 0 ? `+${fmt(v)}` : '—'}
                </Text>
            ),
        },
        {
            title: <Tooltip title="Годовая ставка: проценты / сумма / дни × 365"><span>Ставка</span></Tooltip>,
            dataIndex: 'rate_percent',
            width: 84,
            align: 'right',
            render: (v) => <Text style={{ fontSize: 12, ...nowrap }}>{v != null ? `${fmt(v)} %` : '—'}</Text>,
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            width: 124,
            render: (v, rec) => (
                <Tag color={v === 'open' ? 'processing' : 'success'} style={{ margin: 0, fontSize: 11, ...nowrap }}>
                    {v === 'open' ? 'На депозите' : (Number(rec.returned_amount) < Number(rec.principal) ? 'Возврат не полный' : 'Закрыта')}
                </Tag>
            ),
        },
    ];

    return (
        <>
            <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                <RangePicker
                    value={range}
                    onChange={(value) => setRange(value || [null, null])}
                    format="DD.MM.YYYY"
                    allowClear
                    presets={PRESETS}
                />
                <Button icon={<ReloadOutlined />} onClick={load}>Обновить</Button>
            </Space>

            {totals && (
                <div className="deposit-metrics">
                    <Metric label="Проценты за период" value={`+${fmt(totals.interest_total)} ₽`} accent="#27ae60"
                        hint="доход, выплаченный банком" />
                    <Metric label="Средняя ставка"
                        value={totals.average_rate_percent != null ? `${fmt(totals.average_rate_percent)} %` : '—'}
                        hint="годовых, по закрытым сделкам" />
                    <Metric label="Сейчас на депозите" value={`${fmt(totals.open_principal)} ₽`}
                        hint={`открытых сделок: ${totals.deals_open}`} />
                    <Metric label="Сделок за период" value={totals.deals_total}
                        hint={`оборот ${fmt(totals.principal_turnover)} ₽`} />
                </div>
            )}

            <Table
                className="compact-table"
                rowKey={(rec) => `${rec.deal_ref || 'x'}-${rec.opened_on}-${rec.returned_on}`}
                size="small"
                tableLayout="fixed"
                loading={loading}
                dataSource={deals}
                columns={columns}
                pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
                locale={{ emptyText: 'За период депозитных операций нет' }}
            />

            <Alert
                type="info"
                showIcon
                style={{ marginTop: 12 }}
                message="Как учитываются депозиты"
                description={
                    <div style={{ fontSize: 12 }}>
                        Открытие и возврат депозита — перемещение своих денег, а не расход и не доход:
                        они не попадают в дебиторку и кредиторку. Доход — только выплата процентов.
                        Операции берутся из выписок автоматически и связываются в сделку по её номеру.
                    </div>
                }
            />
        </>
    );
};

export default DepositsTab;
