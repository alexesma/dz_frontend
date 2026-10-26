import React, { useState } from 'react';
import { Alert, Button, Col, Collapse, DatePicker, Divider, Form, Input, Row, Switch, message } from 'antd';
import dayjs from 'dayjs';

import { getCompanyProfile, updateCompanyProfile } from '../api/settings';

const digitsRule = (lengths, label) => ({
    validator: (_, value) => {
        const clean = String(value || '').replace(/\s/g, '');
        if (!clean || (/^\d+$/.test(clean) && lengths.includes(clean.length))) return Promise.resolve();
        return Promise.reject(new Error(`${label}: ${lengths.join(' или ')} цифр`));
    },
});

// Юридические данные нашей организации: подставляются в УПД, упаковочный
// лист, транспортную накладную, счёт и другие печатные формы.
const CompanyProfilePanel = () => {
    const [form] = Form.useForm();
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [prefilled, setPrefilled] = useState(false);
    const [updatedAt, setUpdatedAt] = useState(null);
    const isIp = Form.useWatch('is_individual_entrepreneur', form);

    const load = async () => {
        try {
            const { data } = await getCompanyProfile();
            form.setFieldsValue({
                ...data,
                ogrn_assigned_at: data.ogrn_assigned_at ? dayjs(data.ogrn_assigned_at) : null,
            });
            setPrefilled(!!data.prefilled);
            setUpdatedAt(data.updated_at || null);
            setLoaded(true);
        } catch {
            message.error('Не удалось загрузить реквизиты организации');
        }
    };

    // Данные грузим при первом раскрытии панели.
    const onOpen = (keys) => {
        if (keys.length && !loaded) void load();
    };

    const save = async (values) => {
        setSaving(true);
        try {
            const payload = {
                ...values,
                ogrn_assigned_at: values.ogrn_assigned_at
                    ? values.ogrn_assigned_at.format('YYYY-MM-DD') : null,
            };
            await updateCompanyProfile(payload);
            message.success('Реквизиты сохранены');
            await load();
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(typeof detail === 'string' ? detail
                : 'Не удалось сохранить: проверьте формат ИНН, КПП, БИК и счетов');
        } finally { setSaving(false); }
    };

    const field = (name, label, props = {}, rules = []) => (
        <Form.Item name={name} label={label} rules={rules}>
            <Input allowClear {...props} />
        </Form.Item>
    );

    return <Collapse onChange={onOpen} style={{ marginBottom: 16 }} items={[{
        key: 'company',
        label: 'Реквизиты нашей организации',
        children: <>
            <Alert showIcon type="info" style={{ marginBottom: 16 }}
                message="Эти данные подставляются в УПД, упаковочный лист, транспортную накладную, счёт и другие документы."
                description={prefilled
                    ? 'Профиль ещё не сохранялся: поля предзаполнены из настроек Диадока. Проверьте и сохраните.'
                    : (updatedAt ? `Последнее сохранение: ${dayjs(updatedAt).format('DD.MM.YYYY HH:mm')}` : undefined)} />
            <Form form={form} layout="vertical" onFinish={save} disabled={!loaded}
                initialValues={{ is_individual_entrepreneur: false, vat_payer: true }}>
                <Row gutter={16}>
                    <Col xs={24} md={8}>
                        <Form.Item name="is_individual_entrepreneur" label="Индивидуальный предприниматель" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                        <Form.Item name="vat_payer" label="Плательщик НДС" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </Col>
                </Row>
                <Divider orientation="left" plain>Организация</Divider>
                <Row gutter={16}>
                    <Col xs={24} md={12}>{field('short_name', 'Краткое наименование', { placeholder: 'ООО «ДрагонЗап»' })}</Col>
                    <Col xs={24} md={12}>{field('full_name', 'Полное наименование', { placeholder: 'Общество с ограниченной ответственностью «ДрагонЗап»' })}</Col>
                    <Col xs={24} md={6}>{field('inn', 'ИНН', { maxLength: 12 }, [digitsRule([10, 12], 'ИНН')])}</Col>
                    <Col xs={24} md={6}>{field('kpp', 'КПП', { maxLength: 9, disabled: !!isIp }, [digitsRule([9], 'КПП')])}</Col>
                    <Col xs={24} md={6}>{field('ogrn', isIp ? 'ОГРНИП' : 'ОГРН', { maxLength: 15 }, [digitsRule([13, 15], 'ОГРН')])}</Col>
                    <Col xs={24} md={6}>
                        {isIp ? <Form.Item name="ogrn_assigned_at" label="Дата присвоения ОГРНИП">
                            <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} />
                        </Form.Item> : field('okpo', 'ОКПО', { maxLength: 14 }, [digitsRule([8, 10, 14], 'ОКПО')])}
                    </Col>
                </Row>
                <Divider orientation="left" plain>Адреса и контакты</Divider>
                <Row gutter={16}>
                    <Col xs={24} md={12}>
                        <Form.Item name="legal_address" label="Юридический адрес"><Input.TextArea rows={2} /></Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                        <Form.Item name="postal_address" label="Почтовый адрес"><Input.TextArea rows={2} /></Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                        <Form.Item name="shipping_address" label="Адрес отгрузки (склад)"
                            extra="Если пусто, берётся почтовый адрес">
                            <Input.TextArea rows={2} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={4}>{field('phone', 'Телефон')}</Col>
                    <Col xs={24} md={4}>{field('email', 'Email')}</Col>
                    <Col xs={24} md={4}>{field('website', 'Сайт')}</Col>
                </Row>
                <Divider orientation="left" plain>Банк</Divider>
                <Row gutter={16}>
                    <Col xs={24} md={12}>{field('bank_name', 'Банк')}</Col>
                    <Col xs={24} md={4}>{field('bank_bik', 'БИК', { maxLength: 9 }, [digitsRule([9], 'БИК')])}</Col>
                    <Col xs={24} md={4}>{field('bank_account', 'Расчётный счёт', { maxLength: 20 }, [digitsRule([20], 'Счёт')])}</Col>
                    <Col xs={24} md={4}>{field('bank_corr_account', 'Корр. счёт', { maxLength: 20 }, [digitsRule([20], 'Счёт')])}</Col>
                </Row>
                <Divider orientation="left" plain>Подписанты</Divider>
                <Row gutter={16}>
                    <Col xs={24} md={6}>{field('director_position', 'Должность руководителя', { placeholder: 'Генеральный директор' })}</Col>
                    <Col xs={24} md={6}>{field('director_name', 'ФИО руководителя')}</Col>
                    <Col xs={24} md={6}>{field('director_basis', 'Основание полномочий', { placeholder: 'Устав / доверенность' })}</Col>
                    <Col xs={24} md={6}>{field('accountant_name', 'ФИО главного бухгалтера')}</Col>
                </Row>
                <Button type="primary" htmlType="submit" loading={saving}>Сохранить реквизиты</Button>
            </Form>
        </>,
    }]} />;
};

export default CompanyProfilePanel;
