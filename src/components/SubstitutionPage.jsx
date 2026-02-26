import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Card, Form, Input, Button, message, Spin, InputNumber, Switch, Select, Modal
} from 'antd';
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import {
    getSubstitutionById,
    createSubstitution,
    updateSubstitution
} from '../api/substitutions';

const SubstitutionPage = () => {
    const { substitutionId } = useParams();
    const navigate = useNavigate();
    const isNew = !substitutionId || substitutionId === 'create';

    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    const confirmChange = (title) =>
        new Promise((resolve, reject) => {
            Modal.confirm({
                title,
                content: 'Проверьте данные перед сохранением.',
                okText: 'Сохранить',
                cancelText: 'Отмена',
                onOk: resolve,
                onCancel: () => reject(new Error('cancel')),
            });
        });

    useEffect(() => {
        const fetchSubstitution = async () => {
            if (isNew) {
                return;
            }
            setLoading(true);
            try {
                const { data } = await getSubstitutionById(substitutionId);
                form.setFieldsValue(data);
            } catch (error) {
                console.error('Fetch substitution error:', error);
                message.error('Ошибка загрузки подмены');
                navigate('/substitutions');
            } finally {
                setLoading(false);
            }
        };
        fetchSubstitution();
    }, [isNew, substitutionId, form, navigate]);

    const handleSubmit = async (values) => {
        setSaving(true);
        try {
            if (isNew) {
                await createSubstitution(values);
                message.success('Подмена создана');
            } else {
                await confirmChange('Сохранить изменения подмены?');
                await updateSubstitution(substitutionId, values);
                message.success('Подмена обновлена');
            }
            navigate('/substitutions');
        } catch (error) {
            if (error?.message === 'cancel') return;
            console.error('Save substitution error:', error);
            message.error('Ошибка сохранения подмены');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div style={{ margin: 20 }}>
            <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/substitutions')}
                style={{ marginBottom: 16 }}
            >
                Назад к списку
            </Button>

            <Card title={isNew ? 'Создание подмены' : 'Редактирование подмены'}>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    onFinishFailed={({ errorFields }) => {
                        message.error('Не отправлено: проверьте обязательные поля');
                        if (errorFields?.length) {
                            Modal.error({
                                title: 'Ошибки формы',
                                content: (
                                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                                        {errorFields.map((field) => (
                                            <li key={field.name.join('.')}>
                                                {field.errors?.[0] || field.name.join('.')}
                                            </li>
                                        ))}
                                    </ul>
                                ),
                            });
                            form.scrollToField(errorFields[0].name);
                        }
                    }}
                    scrollToFirstError
                    initialValues={{
                        priority: 1,
                        min_source_quantity: 4,
                        quantity_reduction: 1,
                        is_active: true,
                    }}
                >
                    <Form.Item
                        name="source_autopart_id"
                        label="ID исходной детали"
                        rules={[{ required: true, message: 'Введите ID детали' }]}
                    >
                        <InputNumber
                            placeholder="ID автозапчасти DRAGONZAP"
                            style={{ width: '100%' }}
                        />
                    </Form.Item>

                    <Form.Item
                        name="substitution_brand_id"
                        label="ID бренда подмены"
                        rules={[{ required: true, message: 'Введите ID бренда' }]}
                    >
                        <InputNumber
                            placeholder="ID бренда (TOYOTA, GEELY и т.д.)"
                            style={{ width: '100%' }}
                        />
                    </Form.Item>

                    <Form.Item
                        name="substitution_oem_number"
                        label="Артикул подмены"
                        rules={[{ required: true, message: 'Введите артикул' }]}
                    >
                        <Input placeholder="90915-YZZD3" />
                    </Form.Item>

                    <Form.Item
                        name="priority"
                        label="Приоритет"
                        tooltip="Чем меньше, тем раньше будет добавлена подмена"
                    >
                        <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                        name="min_source_quantity"
                        label="Минимальное количество"
                        tooltip="Если у исходной детали меньше, подмена не создается"
                    >
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                        name="quantity_reduction"
                        label="Уменьшение количества"
                        tooltip="На сколько уменьшать количество для подмены"
                    >
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                        name="customer_config_id"
                        label="ID конфигурации клиента (опционально)"
                        tooltip="Если не указано, применяется для всех клиентов"
                    >
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                        name="is_active"
                        label="Активна"
                        valuePropName="checked"
                    >
                        <Switch />
                    </Form.Item>

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={saving}
                            icon={<SaveOutlined />}
                        >
                            {isNew ? 'Создать' : 'Сохранить'}
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );
};

export default SubstitutionPage;
