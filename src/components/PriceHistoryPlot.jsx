import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Space, DatePicker } from 'antd';
import { LineChartOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { API_URL } from '../api.js';

const { RangePicker } = DatePicker;

const PriceHistoryPlot = () => {
    const [form] = Form.useForm();
    const [plotUrl, setPlotUrl] = useState('');
    const location = useLocation();

    const handleSubmit = (values) => {
        const oem = (values.oem || '').trim();
        if (!oem) {
            message.warning('Введите артикул');
            return;
        }
        const [startDate, endDate] = values.date_range || [];
        const params = new URLSearchParams();
        if (startDate) {
            params.append('date_start', startDate.format('YYYY-MM-DD'));
        }
        if (endDate) {
            params.append('date_finish', endDate.format('YYYY-MM-DD'));
        }
        const query = params.toString();
        const url = `${API_URL}/autoparts/${encodeURIComponent(oem)}/price-history/plot/` +
            (query ? `?${query}` : '');
        setPlotUrl(url);
    };

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const oem = params.get('oem');
        const dateStart = params.get('date_start');
        const dateFinish = params.get('date_finish');
        if (!oem) {
            return;
        }

        let rangeValue;
        if (dateStart && dateFinish) {
            const start = dayjs(dateStart, 'YYYY-MM-DD');
            const end = dayjs(dateFinish, 'YYYY-MM-DD');
            if (start.isValid() && end.isValid()) {
                rangeValue = [start, end];
            }
        }

        form.setFieldsValue({
            oem,
            date_range: rangeValue,
        });
        handleSubmit({
            oem,
            date_range: rangeValue,
        });
    }, [location.search, form]);

    return (
        <Card title="История цен по артикулу" style={{ margin: 20 }}>
            <Form form={form} layout="inline" onFinish={handleSubmit}>
                <Form.Item
                    name="oem"
                    rules={[{ required: true, message: 'Введите артикул' }]}
                >
                    <Input placeholder="Артикул (OEM)" style={{ width: 260 }} />
                </Form.Item>
                <Form.Item name="date_range">
                    <RangePicker placeholder={['Дата от', 'Дата до']} />
                </Form.Item>
                <Form.Item>
                    <Button type="primary" icon={<LineChartOutlined />} htmlType="submit">
                        Показать график
                    </Button>
                </Form.Item>
            </Form>

            {plotUrl ? (
                <div style={{ marginTop: 20 }}>
                    <iframe
                        title="price-history-plot"
                        src={plotUrl}
                        style={{
                            width: '100%',
                            height: '780px',
                            border: '1px solid #e5e7eb',
                            borderRadius: 8,
                        }}
                    />
                </div>
            ) : (
                <Space style={{ marginTop: 20, color: '#6b7280' }}>
                    Введите артикул и нажмите «Показать график».
                </Space>
            )}
        </Card>
    );
};

export default PriceHistoryPlot;
