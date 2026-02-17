import React, { useEffect, useState } from 'react';
import {
    Table, Button, message, Spin, Tag, Space, Card, Modal, Upload, Popconfirm
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, ReloadOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
    getSubstitutions,
    deleteSubstitution,
    uploadSubstitutionsFromExcel
} from '../api/substitutions';

const SubstitutionsList = () => {
    const [substitutions, setSubstitutions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [fileList, setFileList] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        fetchSubstitutions();
    }, []);

    const fetchSubstitutions = async () => {
        setLoading(true);
        try {
            const { data } = await getSubstitutions();
            setSubstitutions(data);
        } catch (error) {
            message.error('Ошибка загрузки подмен');
            console.error('Fetch substitutions error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteSubstitution(id);
            message.success('Подмена удалена');
            fetchSubstitutions();
        } catch (error) {
            console.error('Delete substitution error:', error);
            message.error('Ошибка удаления подмены');
        }
    };

    const handleUpload = async () => {
        if (!fileList.length) {
            message.error('Выберите файл');
            return;
        }

        setUploading(true);
        try {
            const file = fileList[0].originFileObj;
            const { data } = await uploadSubstitutionsFromExcel(file);

            message.success(
                `Загружено: ${data.added}, пропущено: ${data.skipped}`
            );

            if (data.errors?.length > 0) {
                Modal.warning({
                    title: 'Обнаружены ошибки',
                    content: (
                        <div>
                            {data.errors.map((err, idx) => (
                                <div key={idx}>{err}</div>
                            ))}
                        </div>
                    )
                });
            }

            setUploadModalVisible(false);
            setFileList([]);
            fetchSubstitutions();
        } catch (error) {
            console.error('Upload substitutions error:', error);
            message.error('Ошибка загрузки файла');
        } finally {
            setUploading(false);
        }
    };

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 70,
        },
        {
            title: 'Исходная деталь',
            key: 'source',
            render: (_, record) => (
                <div>
                    <div><strong>ID:</strong> {record.source_autopart_id}</div>
                </div>
            ),
        },
        {
            title: 'Подмена',
            key: 'substitution',
            render: (_, record) => (
                <div>
                    <Tag color="blue">{record.substitution_brand_id}</Tag>
                    <div>{record.substitution_oem_number}</div>
                </div>
            ),
        },
        {
            title: 'Приоритет',
            dataIndex: 'priority',
            key: 'priority',
            width: 100,
            render: (priority) => <Tag color="purple">{priority}</Tag>,
        },
        {
            title: 'Мин. кол-во',
            dataIndex: 'min_source_quantity',
            key: 'min_source_quantity',
            width: 110,
        },
        {
            title: 'Уменьшение',
            dataIndex: 'quantity_reduction',
            key: 'quantity_reduction',
            width: 120,
        },
        {
            title: 'Статус',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 100,
            render: (active) => (
                <Tag color={active ? 'green' : 'red'}>
                    {active ? 'Активна' : 'Неактивна'}
                </Tag>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 120,
            render: (_, record) => (
                <Space size="small">
                    <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => navigate(`/substitutions/${record.id}/edit`)}
                    />
                    <Popconfirm
                        title="Удалить подмену?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button
                            type="primary"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <Card title="Подмены для прайс-листов" style={{ margin: '20px' }}>
            <div style={{ marginBottom: 16 }}>
                <Space>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => navigate('/substitutions/create')}
                    >
                        Добавить подмену
                    </Button>
                    <Button
                        icon={<UploadOutlined />}
                        onClick={() => setUploadModalVisible(true)}
                    >
                        Загрузить из Excel
                    </Button>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchSubstitutions}
                        loading={loading}
                    >
                        Обновить
                    </Button>
                </Space>
            </div>

            <Spin spinning={loading}>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={substitutions}
                    pagination={{ pageSize: 20 }}
                    scroll={{ x: 1000 }}
                    size="middle"
                />
            </Spin>

            {/* Модал загрузки Excel */}
            <Modal
                title="Загрузка подмен из Excel"
                open={uploadModalVisible}
                onCancel={() => {
                    setUploadModalVisible(false);
                    setFileList([]);
                }}
                onOk={handleUpload}
                confirmLoading={uploading}
                okText="Загрузить"
                cancelText="Отмена"
            >
                <div style={{ marginBottom: 16 }}>
                    <p>Формат файла:</p>
                    <pre style={{ background: '#f5f5f5', padding: 10 }}>
{`source_brand | source_oem | sub_brand | sub_oem | priority | min_qty | reduction
DRAGONZAP    | 12345      | TOYOTA    | 90915   | 1        | 4       | 1
DRAGONZAP    | 12345      | GEELY     | 123456  | 2        | 4       | 2`}
                    </pre>
                </div>

                <Upload
                    accept=".xlsx,.xls"
                    maxCount={1}
                    fileList={fileList}
                    onChange={({ fileList }) => setFileList(fileList)}
                    beforeUpload={() => false}
                >
                    <Button icon={<UploadOutlined />}>
                        Выбрать файл Excel
                    </Button>
                </Upload>
            </Modal>
        </Card>
    );
};

export default SubstitutionsList;
