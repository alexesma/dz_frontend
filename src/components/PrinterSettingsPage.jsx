import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert, Button, Card, Checkbox, Form, Popconfirm, Select, Space, Table, Tag,
    Typography, message,
} from 'antd';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import api from '../api.js';
import {
    deletePrintAssignment, getAdminPrintJobs, getPrintAssignments,
    getPrintDevices, retryPrintJob, savePrintAssignment,
} from '../api/printJobs';

const { Title, Text } = Typography;
const KIND_LABELS = { label: 'Этикетки', a4: 'Документы A4' };
const STATUS_LABELS = {
    pending: 'Ожидает', claimed: 'Передано компьютеру',
    printed: 'Отправлено в принтер', error: 'Ошибка',
};

const PrinterSettingsPage = () => {
    const [form] = Form.useForm();
    const [devices, setDevices] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [users, setUsers] = useState([]);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [deviceRes, assignmentRes, jobRes, userRes] = await Promise.all([
                getPrintDevices(), getPrintAssignments(), getAdminPrintJobs(),
                api.get('/admin/users', { params: { status: 'active' } }),
            ]);
            setDevices(deviceRes.data || []);
            setAssignments(assignmentRes.data || []);
            setJobs(jobRes.data || []);
            setUsers(userRes.data || []);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить принтеры');
        } finally { setLoading(false); }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const deviceMap = useMemo(() => Object.fromEntries(
        devices.map((device) => [device.id, device]),
    ), [devices]);
    const userMap = useMemo(() => Object.fromEntries(
        users.map((user) => [user.id, user]),
    ), [users]);

    const save = async (values) => {
        setBusy(true);
        try {
            await savePrintAssignment(values);
            message.success('Доступ к принтеру сохранён');
            form.resetFields();
            await load();
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось назначить принтер');
        } finally { setBusy(false); }
    };
    const remove = async (id) => {
        try {
            await deletePrintAssignment(id);
            await load();
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось снять доступ');
        }
    };
    const retry = async (id) => {
        try {
            await retryPrintJob(id);
            message.success('Задание снова ожидает печати');
            await load();
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось повторить печать');
        }
    };

    return <div style={{ padding: 24 }}>
        <Space style={{ marginBottom: 16 }}>
            <Title level={4} style={{ margin: 0 }}>Принтеры сотрудников</Title>
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Обновить</Button>
        </Space>
        <Alert showIcon type="info" style={{ marginBottom: 16 }}
            message="Запустите DZEmailRelay.exe с включённой печатью на каждом Windows-компьютере. Программа сама сообщит системе об установленных принтерах." />
        <Card title="Доступные принтеры" size="small" style={{ marginBottom: 16 }}>
            <Table rowKey="id" size="small" loading={loading} pagination={false}
                dataSource={devices} columns={[
                    { title: 'Компьютер', dataIndex: 'machine_id' },
                    { title: 'Принтер Windows', dataIndex: 'system_name' },
                    { title: 'Состояние', render: (_, row) => <Tag color={row.online ? 'green' : 'orange'}>
                        {row.online ? 'В сети' : 'Не отвечает'}
                    </Tag> },
                    { title: 'Последний ответ', dataIndex: 'last_seen_at', render: (value) =>
                        value ? dayjs(value).format('DD.MM.YYYY HH:mm:ss') : '—' },
                ]} />
        </Card>
        <Card title="Назначить принтер" size="small" style={{ marginBottom: 16 }}>
            <Form form={form} layout="inline" onFinish={save}
                initialValues={{ is_default: true }}>
                <Form.Item name="user_id" rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" placeholder="Сотрудник"
                        style={{ minWidth: 210 }} options={users.map((user) => ({
                            value: user.id, label: user.name || user.email,
                        }))} />
                </Form.Item>
                <Form.Item name="kind" rules={[{ required: true }]}>
                    <Select placeholder="Тип печати" style={{ minWidth: 170 }}
                        options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
                </Form.Item>
                <Form.Item name="device_id" rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" placeholder="Принтер"
                        style={{ minWidth: 270 }} options={devices.filter((row) => row.active)
                            .map((row) => ({ value: row.id,
                                label: `${row.machine_id} · ${row.display_name}` }))} />
                </Form.Item>
                <Form.Item name="is_default" valuePropName="checked">
                    <Checkbox>По умолчанию</Checkbox>
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={busy}>Сохранить доступ</Button>
            </Form>
        </Card>
        <Card title="Назначения сотрудников" size="small" style={{ marginBottom: 16 }}>
            <Table rowKey="id" size="small" loading={loading} pagination={false}
                dataSource={assignments} columns={[
                    { title: 'Сотрудник', render: (_, row) =>
                        userMap[row.user_id]?.name || userMap[row.user_id]?.email || `#${row.user_id}` },
                    { title: 'Тип', dataIndex: 'kind', render: (value) => KIND_LABELS[value] },
                    { title: 'Принтер', render: (_, row) =>
                        deviceMap[row.device_id]?.display_name || `#${row.device_id}` },
                    { title: 'Компьютер', render: (_, row) =>
                        deviceMap[row.device_id]?.machine_id || '—' },
                    { title: 'По умолчанию', render: (_, row) => row.is_default ? <Tag color="blue">Да</Tag> : 'Нет' },
                    { title: '', render: (_, row) => row.is_default ? null :
                        <Button size="small" onClick={() => savePrintAssignment({
                            user_id: row.user_id, device_id: row.device_id,
                            kind: row.kind, is_default: true,
                        }).then(load).catch((error) => message.error(
                            error?.response?.data?.detail || 'Не удалось сменить принтер'))}>
                            Сделать основным
                        </Button> },
                    { title: '', render: (_, row) => <Popconfirm
                        title="Убрать доступ сотрудника к принтеру?"
                        onConfirm={() => remove(row.id)}>
                        <Button danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm> },
                ]} />
        </Card>
        <Card title="Очередь печати" size="small">
            <Table rowKey="id" size="small" loading={loading}
                pagination={{ pageSize: 20 }} dataSource={jobs} columns={[
                    { title: '№', dataIndex: 'id', width: 70 },
                    { title: 'Создано', dataIndex: 'created_at', render: (value) =>
                        dayjs(value).format('DD.MM HH:mm') },
                    { title: 'Сотрудник', render: (_, row) =>
                        userMap[row.user_id]?.name || userMap[row.user_id]?.email || `#${row.user_id}` },
                    { title: 'Форма', dataIndex: 'title' },
                    { title: 'Принтер', dataIndex: 'printer_name' },
                    { title: 'Статус', render: (_, row) => <Tag color={row.status === 'error'
                        ? 'red' : row.status === 'printed' ? 'green' : 'blue'}>
                        {STATUS_LABELS[row.status] || row.status}</Tag> },
                    { title: 'Ошибка', dataIndex: 'error', render: (value) =>
                        <Text type="danger">{value || ''}</Text> },
                    { title: '', render: (_, row) => ['error', 'claimed'].includes(row.status)
                        ? <Popconfirm title="Убедитесь, что прежняя печать не прошла. Повторить?"
                            onConfirm={() => retry(row.id)}>
                            <Button size="small">Повторить</Button>
                        </Popconfirm> : null },
                ]} />
        </Card>
    </div>;
};

export default PrinterSettingsPage;
