// components/ProviderConfigDetail.jsx
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Descriptions, Spin, message, Button } from 'antd';
import axios from 'axios';

const ProviderConfigDetail = () => {
    const { id } = useParams();
    const [cfg, setCfg] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchCfg = async () => {
            setLoading(true);
            try {
                // 🔧 ПОПРАВЬ путь на свой реальный эндпойнт
                const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/provider_configs/${id}`);
                setCfg(data);
            } catch (e) {
                console.error(e);
                message.error('Не удалось загрузить конфигурацию прайса');
            } finally {
                setLoading(false);
            }
        };
        fetchCfg();
    }, [id]);

    return (
        <Card
            title={`Конфигурация прайса #${id}`}
            extra={<Link to="/providers"><Button>Назад к поставщикам</Button></Link>}
        >
            <Spin spinning={loading}>
                {cfg && (
                    <Descriptions bordered column={1} size="small">
                        <Descriptions.Item label="Название">{cfg.name_price}</Descriptions.Item>
                        {/* Ниже — поля, если они есть в ответе бэкенда */}
                        {'start_row' in cfg && (
                            <Descriptions.Item label="Начальная строка">{cfg.start_row}</Descriptions.Item>
                        )}
                        {'oem_col' in cfg && (
                            <Descriptions.Item label="Колонка OEM">{cfg.oem_col}</Descriptions.Item>
                        )}
                        {'brand_col' in cfg && (
                            <Descriptions.Item label="Колонка Бренд">{cfg.brand_col}</Descriptions.Item>
                        )}
                        {'name_col' in cfg && (
                            <Descriptions.Item label="Колонка Наименование">{cfg.name_col}</Descriptions.Item>
                        )}
                        {'qty_col' in cfg && (
                            <Descriptions.Item label="Колонка Кол-во">{cfg.qty_col}</Descriptions.Item>
                        )}
                        {'price_col' in cfg && (
                            <Descriptions.Item label="Колонка Цена">{cfg.price_col}</Descriptions.Item>
                        )}
                        {'allowed_extensions' in cfg && (
                            <Descriptions.Item label="Допустимые расширения">{cfg.allowed_extensions?.join(', ')}</Descriptions.Item>
                        )}
                        {'subject_filter' in cfg && (
                            <Descriptions.Item label="Фильтр по теме письма">{cfg.subject_filter}</Descriptions.Item>
                        )}
                        {'updated_at' in cfg && (
                            <Descriptions.Item label="Обновлено">{new Date(cfg.updated_at).toLocaleString()}</Descriptions.Item>
                        )}
                    </Descriptions>
                )}
            </Spin>
        </Card>
    );
};

export default ProviderConfigDetail;