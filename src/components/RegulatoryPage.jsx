import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Progress,
    Space,
    Statistic,
    Switch,
    Table,
    Tabs,
    Typography,
    Upload,
    message,
} from 'antd';
import { InboxOutlined, ReloadOutlined } from '@ant-design/icons';
import {
    applyCertificationRules,
    getRegulatoryCoverage,
    importRegulatoryFile,
    refreshFromRegistry,
} from '../api/regulatory';

const { Text, Title } = Typography;

const pct = (value) => (value == null ? '—' : `${value}%`);

// Красный до 50, жёлтый до 90 — на глаз видно, где дыра.
const tone = (value) => {
    if (value == null) return 'normal';
    if (value < 50) return 'exception';
    return value < 90 ? 'active' : 'success';
};

const RegulatoryPage = () => {
    const [coverage, setCoverage] = useState(null);
    const [loading, setLoading] = useState(false);
    const [onlyInStock, setOnlyInStock] = useState(true);

    const [file, setFile] = useState(null);
    const [importResult, setImportResult] = useState(null);
    const [importing, setImporting] = useState(false);

    const [rulesResult, setRulesResult] = useState(null);
    const [rulesBusy, setRulesBusy] = useState(false);

    const [registryResult, setRegistryResult] = useState(null);
    const [registryBusy, setRegistryBusy] = useState(false);

    const loadCoverage = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await getRegulatoryCoverage({
                only_in_stock: onlyInStock,
            });
            setCoverage(data);
        } catch (error) {
            message.error(
                error?.response?.data?.detail || 'Не удалось получить отчёт'
            );
        } finally {
            setLoading(false);
        }
    }, [onlyInStock]);

    useEffect(() => { void loadCoverage(); }, [loadCoverage]);

    const runImport = async (dryRun) => {
        if (!file) {
            message.warning('Выберите файл');
            return;
        }
        setImporting(true);
        try {
            const { data } = await importRegulatoryFile(file, {
                dry_run: dryRun,
            });
            setImportResult(data);
            if (!dryRun) {
                message.success(`Обновлено позиций: ${data.updated}`);
                await loadCoverage();
            }
        } catch (error) {
            message.error(
                error?.response?.data?.detail || 'Не удалось разобрать файл'
            );
        } finally {
            setImporting(false);
        }
    };

    const runRules = async (dryRun) => {
        setRulesBusy(true);
        try {
            const { data } = await applyCertificationRules({
                dry_run: dryRun,
            });
            setRulesResult(data);
            if (!dryRun) {
                message.success(`Проставлено позиций: ${data.updated}`);
                await loadCoverage();
            }
        } catch (error) {
            message.error(
                error?.response?.data?.detail || 'Не удалось применить правила'
            );
        } finally {
            setRulesBusy(false);
        }
    };

    const runRegistry = async () => {
        setRegistryBusy(true);
        try {
            const { data } = await refreshFromRegistry({ limit: 50 });
            setRegistryResult(data);
            if (data.aborted) {
                message.warning('Реестр не отвечает — сверка остановлена');
            } else {
                message.success(`Сверено документов: ${data.answered}`);
                await loadCoverage();
            }
        } catch (error) {
            message.error(
                error?.response?.data?.detail || 'Не удалось обратиться к реестру'
            );
        } finally {
            setRegistryBusy(false);
        }
    };

    const gapColumns = (key, title) => [
        { title, dataIndex: key },
        { title: 'Позиций', dataIndex: 'positions', width: 110 },
        {
            title: 'Без реквизитов',
            dataIndex: 'missing',
            width: 150,
            render: (value, row) => (
                <Text type={value === row.positions ? 'danger' : undefined}>
                    {value}
                </Text>
            ),
        },
    ];

    return (
        <div style={{ padding: 24, maxWidth: 1100 }}>
            <Title level={3} style={{ marginBottom: 0 }}>
                Реквизиты прайса
            </Title>
            <Text type="secondary">
                ТН ВЭД, ОКПД 2, Честный знак, сертификат ЕАС и ссылка ФГИС
            </Text>

            <Tabs
                style={{ marginTop: 16 }}
                items={[
                    {
                        key: 'coverage',
                        label: 'Покрытие',
                        children: (
                            <Card
                                loading={loading}
                                extra={(
                                    <Space>
                                        <Switch
                                            size="small"
                                            checked={onlyInStock}
                                            onChange={setOnlyInStock}
                                        />
                                        <Text type="secondary">
                                            только с остатком
                                        </Text>
                                        <Button
                                            size="small"
                                            icon={<ReloadOutlined />}
                                            onClick={loadCoverage}
                                        >
                                            Обновить
                                        </Button>
                                    </Space>
                                )}
                            >
                                {coverage && (
                                    <>
                                        <Space size={48} wrap>
                                            <Statistic
                                                title="Позиций в прайсах"
                                                value={coverage.positions}
                                            />
                                            <Statistic
                                                title="Заполнено полностью"
                                                value={pct(coverage.complete_pct)}
                                            />
                                            <Statistic
                                                title="Срок не указан"
                                                value={
                                                    coverage.undated_certificates
                                                }
                                            />
                                            <Statistic
                                                title="Истёкших"
                                                value={
                                                    coverage.expired_certificates
                                                }
                                            />
                                        </Space>
                                        <div style={{ marginTop: 24, maxWidth: 520 }}>
                                            {[
                                                ['ТН ВЭД', coverage.tnved_pct],
                                                ['ОКПД 2', coverage.okpd2_pct],
                                                [
                                                    'Сертификат или отметка',
                                                    coverage.certificate_pct,
                                                ],
                                            ].map(([label, value]) => (
                                                <div key={label} style={{ marginBottom: 8 }}>
                                                    <Text>{label}</Text>
                                                    <Progress
                                                        percent={value ?? 0}
                                                        status={tone(value)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                                            <Table
                                                size="small"
                                                rowKey="brand"
                                                pagination={{ pageSize: 10 }}
                                                columns={gapColumns('brand', 'Бренд')}
                                                dataSource={coverage.brands}
                                            />
                                            <Table
                                                size="small"
                                                rowKey="provider"
                                                pagination={{ pageSize: 10 }}
                                                columns={gapColumns('provider', 'Поставщик')}
                                                dataSource={coverage.providers}
                                            />
                                        </div>
                                    </>
                                )}
                            </Card>
                        ),
                    },
                    {
                        key: 'import',
                        label: 'Загрузка из прайса поставщика',
                        children: (
                            <Card>
                                <Upload.Dragger
                                    maxCount={1}
                                    accept=".csv,.txt,.xlsx,.xls"
                                    beforeUpload={(picked) => {
                                        setFile(picked);
                                        setImportResult(null);
                                        return false;
                                    }}
                                    onRemove={() => setFile(null)}
                                >
                                    <p className="ant-upload-drag-icon">
                                        <InboxOutlined />
                                    </p>
                                    <p>Перетащите файл поставщика сюда</p>
                                    <Text type="secondary">
                                        Нужны колонки бренда и артикула; остальные
                                        распознаются по названию
                                    </Text>
                                </Upload.Dragger>
                                <Space style={{ marginTop: 16 }}>
                                    <Button
                                        onClick={() => runImport(true)}
                                        loading={importing}
                                    >
                                        Предпросмотр
                                    </Button>
                                    <Button
                                        type="primary"
                                        disabled={!importResult}
                                        onClick={() => runImport(false)}
                                        loading={importing}
                                    >
                                        Записать
                                    </Button>
                                </Space>
                                {importResult && (
                                    <div style={{ marginTop: 16 }}>
                                        <Space size={32} wrap>
                                            <Statistic
                                                title="Строк в файле"
                                                value={importResult.rows}
                                            />
                                            <Statistic
                                                title="Сопоставлено"
                                                value={importResult.matched}
                                            />
                                            <Statistic
                                                title="Обновится"
                                                value={importResult.updated}
                                            />
                                            <Statistic
                                                title="Ручной ввод сохранён"
                                                value={importResult.skipped_manual}
                                            />
                                        </Space>
                                        {!!Object.keys(
                                            importResult.unmatched_brands || {}
                                        ).length && (
                                            <Alert
                                                style={{ marginTop: 16 }}
                                                type="info"
                                                showIcon
                                                message={`Не сопоставилось строк: ${importResult.unmatched}`}
                                                description={(
                                                    <Text type="secondary">
                                                        Больше всего:{' '}
                                                        {Object.entries(
                                                            importResult.unmatched_brands
                                                        )
                                                            .slice(0, 8)
                                                            .map(
                                                                ([brand, count]) =>
                                                                    `${brand} (${count})`
                                                            )
                                                            .join(', ')}
                                                    </Text>
                                                )}
                                            />
                                        )}
                                    </div>
                                )}
                            </Card>
                        ),
                    },
                    {
                        key: 'registry',
                        label: 'Сверка с реестром',
                        children: (
                            <Card>
                                <Alert
                                    type="info"
                                    showIcon
                                    message="Срок и состояние берутся из карточки ФГИС"
                                    description="В прайсах поставщиков сроков нет вовсе, поэтому документ выгружается как действующий, пока его не сверили. Приостановленный или прекращённый документ после сверки уходит из карточек сам."
                                />
                                <Button
                                    style={{ marginTop: 16 }}
                                    type="primary"
                                    onClick={runRegistry}
                                    loading={registryBusy}
                                >
                                    Сверить очередные 50
                                </Button>
                                {registryResult && (
                                    <>
                                        <Space size={32} wrap style={{ marginTop: 16 }}>
                                            <Statistic
                                                title="Запрошено"
                                                value={registryResult.supported}
                                            />
                                            <Statistic
                                                title="Ответил реестр"
                                                value={registryResult.answered}
                                            />
                                            <Statistic
                                                title="Получили срок"
                                                value={registryResult.dated}
                                            />
                                            <Statistic
                                                title="Не действуют"
                                                value={registryResult.not_active}
                                            />
                                        </Space>
                                        {registryResult.aborted && (
                                            <Alert
                                                style={{ marginTop: 16 }}
                                                type="warning"
                                                showIcon
                                                message="Реестр не ответил подряд несколько раз"
                                                description="Сверка остановлена, чтобы не ждать таймаут по каждому документу. Проверьте доступность pub.fsa.gov.ru с сервера."
                                            />
                                        )}
                                    </>
                                )}
                            </Card>
                        ),
                    },
                    {
                        key: 'rules',
                        label: 'Правила по названию',
                        children: (
                            <Card>
                                <Alert
                                    type="warning"
                                    showIcon
                                    message="Правила трогают только позиции без признака"
                                    description="Данные из документов поставщика и ручной ввод не перебиваются. Источник таких позиций помечается как «правило» — их всегда можно найти и пересмотреть."
                                />
                                <Space style={{ marginTop: 16 }}>
                                    <Button
                                        onClick={() => runRules(true)}
                                        loading={rulesBusy}
                                    >
                                        Предпросмотр
                                    </Button>
                                    <Button
                                        type="primary"
                                        disabled={!rulesResult}
                                        onClick={() => runRules(false)}
                                        loading={rulesBusy}
                                    >
                                        Применить
                                    </Button>
                                </Space>
                                {rulesResult && (
                                    <Space size={32} wrap style={{ marginTop: 16 }}>
                                        <Statistic
                                            title="Правил"
                                            value={rulesResult.rules}
                                        />
                                        <Statistic
                                            title="Проверено позиций"
                                            value={rulesResult.checked}
                                        />
                                        <Statistic
                                            title="Не требует"
                                            value={rulesResult.exempted}
                                        />
                                        <Statistic
                                            title="Требует"
                                            value={rulesResult.required}
                                        />
                                    </Space>
                                )}
                            </Card>
                        ),
                    },
                ]}
            />
        </div>
    );
};

export default RegulatoryPage;
