import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Modal, Popconfirm, Progress, Space, Spin, Typography } from 'antd';
import { DownloadOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import {
    downloadCustomerPricelistArtifact,
    getCustomerPricelistJobState,
    startCustomerPricelistJob,
} from '../api/customers';

const { Text } = Typography;
const activeJob = (job) => ['queued', 'running'].includes(job?.status);
const dateLabel = (value) => value ? new Date(value).toLocaleString('ru-RU') : '—';

async function errorText(error) {
    let body = error?.response?.data;
    if (body instanceof Blob) {
        try { body = JSON.parse(await body.text()); } catch { body = null; }
    }
    if (typeof body?.detail === 'string') return body.detail;
    const status = error?.response?.status;
    if (status === 504 || error?.code === 'ECONNABORTED') {
        return 'Время ожидания ответа истекло. Задача могла продолжить работу — проверьте её состояние перед повтором.';
    }
    return status ? `Сервер вернул ошибку HTTP ${status}.` : 'Нет связи с сервером. Проверка состояния повторится автоматически.';
}

export default function CustomerPricelistProgressModal({ customerId, config, intent, onClose }) {
    const [state, setState] = useState(null);
    const [error, setError] = useState('');
    const [pollError, setPollError] = useState('');
    const [busy, setBusy] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const revision = useRef(0);
    const alive = useRef(true);
    const actionStarted = useRef(false);

    useEffect(() => {
        let stopped = false;
        let timer;
        alive.current = true;
        const poll = async () => {
            const currentRevision = revision.current;
            try {
                const { data } = await getCustomerPricelistJobState(customerId, config.id);
                if (!stopped && currentRevision === revision.current) {
                    setState(data);
                    setPollError('');
                }
            } catch (err) {
                const description = await errorText(err);
                if (!stopped) setPollError(description);
            }
            if (!stopped) timer = setTimeout(poll, 3000);
        };
        poll();
        return () => { stopped = true; alive.current = false; clearTimeout(timer); };
    }, [customerId, config.id]);

    const start = async (action, pricelistId = null) => {
        if (actionStarted.current) return;
        actionStarted.current = true;
        revision.current += 1;
        setBusy(true);
        setError('');
        try {
            const { data: job } = await startCustomerPricelistJob(customerId, config.id, {
                action, pricelist_id: pricelistId,
            });
            if (alive.current) setState((previous) => ({ ...previous, job }));
        } catch (err) {
            const description = await errorText(err);
            if (alive.current) setError(description);
        } finally {
            // Invalidate any status request started while enqueueing.
            revision.current += 1;
            actionStarted.current = false;
            if (alive.current) setBusy(false);
        }
    };

    const download = async () => {
        setDownloading(true);
        setError('');
        try {
            const response = await downloadCustomerPricelistArtifact(customerId, config.id, state.latest.id);
            const url = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = state.latest.filename || 'price.xlsx';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            const description = await errorText(err);
            if (alive.current) setError(description);
        } finally {
            if (alive.current) setDownloading(false);
        }
    };

    const job = state?.job;
    const active = activeJob(job);
    const disabled = busy || active || state?.generation_in_progress || !state || Boolean(pollError);
    const elapsed = job?.started_at || job?.created_at;
    const seconds = elapsed ? Math.max(0, Math.floor(
        ((job.finished_at ? new Date(job.finished_at).getTime() : Date.now()) - new Date(elapsed).getTime()) / 1000
    )) : 0;
    const readyMessage = job?.action === 'build' ? 'Файл готов к скачиванию'
        : job?.delivery_status === 'queued' ? 'Прайс передан в очередь отправки relay'
            : 'Прайс принят почтовым транспортом';

    return (
        <Modal open title={`Прайс: ${config.name}`} onCancel={onClose} width={660}
            styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
            footer={<Button onClick={onClose}>Закрыть</Button>}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {!state && !pollError && <Spin tip="Проверяем готовый файл и состояние обработки"><div style={{ height: 64 }} /></Spin>}
                {pollError && <Alert type="warning" showIcon message="Не удалось обновить состояние" description={pollError} />}
                {error && <Alert type="error" showIcon message={error} />}
                {state?.latest && (
                    <Card size="small" title="Последний готовый файл">
                        <Space direction="vertical" style={{ width: '100%' }}>
                            <Text strong>{dateLabel(state.latest.generated_at)}</Text>
                            <Text type="secondary">{state.latest.filename} · {Number(state.latest.positions_count || 0).toLocaleString('ru-RU')} позиций</Text>
                            <Text type="secondary">Файл отражает данные на момент сборки. Чтобы применить новые цены, фильтры и наценки, обновите прайс.</Text>
                            <Space wrap>
                                <Button type="primary" icon={<DownloadOutlined />} loading={downloading} onClick={download}>
                                    Скачать готовый
                                </Button>
                                {intent === 'send' && state.latest.generation_status !== 'send_failed' && (
                                    <Popconfirm title="Отправить этот готовый файл?"
                                        description={`Будет отправлена версия от ${dateLabel(state.latest.generated_at)} текущим получателям конфигурации. Если она уже отправлялась, это будет повторная отправка.`}
                                        onConfirm={() => start('send', state.latest.id)} okText="Отправить" cancelText="Отмена" disabled={disabled}>
                                        <Button icon={<SendOutlined />} disabled={disabled}>Отправить этот файл</Button>
                                    </Popconfirm>
                                )}
                            </Space>
                        </Space>
                    </Card>
                )}
                {job && (
                    <Card size="small" title={`Задача №${job.id} · ${job.action === 'send' ? 'Подготовка и отправка' : 'Обновление прайса'}`}>
                        <Text strong>{job.status === 'succeeded' ? readyMessage : job.stage}</Text>
                        <Progress percent={job.progress} status={job.status === 'failed' ? 'exception' : active ? 'active' : 'success'} />
                        <Text type="secondary">{job.finished_at ? 'Длительность' : 'Прошло'}: {Math.floor(seconds / 60)} мин {seconds % 60} сек</Text>
                        {active && <div><Text type="secondary">Шкала показывает этапы, а не точный прогноз времени. Можно закрыть окно и вернуться — обработка продолжится.</Text></div>}
                        {job.status === 'queued' && seconds > 60 && <Alert style={{ marginTop: 8 }} type="warning" showIcon message="Задача ещё ожидает обработки" description="Возможно, выполняется другой прайс. Если ожидание затягивается, сообщите администратору номер задачи." />}
                        {job.status === 'failed' && <Alert style={{ marginTop: 8 }} type="error" showIcon message={job.error || 'Ошибка обработки'} />}
                        {job.status === 'succeeded' && job.action === 'send' && <div><Text type="secondary">Это статус передачи на отправку, а не подтверждение доставки во «Входящие».</Text></div>}
                    </Card>
                )}
                {state?.generation_in_progress && !active && <Alert type="info" showIcon message="Прайс уже формируется другим запуском. Готовый файл появится здесь после завершения." />}
                {state && <Button icon={<ReloadOutlined />} loading={busy} disabled={disabled}
                    onClick={() => start(intent === 'send' ? 'send' : 'build')}>
                    {intent === 'send' ? 'Сформировать новый и отправить' : state.latest ? 'Обновить прайс' : 'Сформировать прайс'}
                </Button>}
                {state && !state.latest && <Text type="secondary">Готового файла пока нет. Запустите сборку — здесь будут отображаться её этапы.</Text>}
            </Space>
        </Modal>
    );
}
