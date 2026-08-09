import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Badge,
    Button,
    Drawer,
    Empty,
    Input,
    Modal,
    Select,
    Spin,
    Tag,
    Tooltip,
    message,
} from 'antd';
import {
    ApartmentOutlined,
    BarcodeOutlined,
    CheckCircleOutlined,
    CloudSyncOutlined,
    CommentOutlined,
    DeleteOutlined,
    EditOutlined,
    HistoryOutlined,
    MessageOutlined,
    PrinterOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    SaveOutlined,
    UndoOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

import {
    createProcessAnnotation,
    deleteProcessAnnotation,
    getProcessAnnotations,
    updateProcessAnnotation,
} from '../api/processArchitecture';
import useAuth from '../context/useAuth';
import './ProcessArchitecturePage.css';

const PAGE_KEY = 'dragonzap-operating-model';

const SECTION_TITLES = {
    'system-map': 'Три контура и владельцы данных',
    'stock-model': 'Единая модель товара и остатков',
    receipt: 'Поступление товара и документов',
    'assortment-price': 'Номенклатура, кроссы и клиентские прайсы',
    'order-routing': 'Приём заказа и выбор исполнения',
    production: 'Волны DragonZap и выпуск',
    labels: 'Автоматическая печать этикеток',
    crossdocking: 'Cross-docking',
    'customs-marking': 'ГТД, партии и маркировка',
    'shipment-documents': 'Сборка, реализация, УПД и ЭДО',
    exchanges: 'События обмена с 1С и внешними системами',
    'operating-cycle': 'Полный операционный цикл',
};

const SECTION_NAV = Object.entries(SECTION_TITLES);
const DRAWING_COLORS = ['#e4572e', '#0c7c86', '#172a3a', '#e9a23b'];

const systemTags = {
    dz: { label: 'Наша платформа', className: 'process-system-tag process-system-dz' },
    onec: { label: '1С:КА 2', className: 'process-system-tag process-system-onec' },
    partssoft: { label: 'parts-soft', className: 'process-system-tag process-system-partssoft' },
    external: { label: 'Внешняя система', className: 'process-system-tag process-system-external' },
    warehouse: { label: 'Склад', className: 'process-system-tag process-system-warehouse' },
};

const OWNERSHIP_ROWS = [
    {
        entity: 'Каталог, бренды, кроссы и группы выпуска',
        owner: 'Платформа',
        ownerType: 'dz',
        copy: 'В 1С только номенклатура с реальным движением',
        rule: 'Поиск и решение о замене остаются в операционном контуре.',
    },
    {
        entity: 'Контент, фото и карточки витрины',
        owner: 'parts-soft',
        ownerType: 'partssoft',
        copy: 'Платформа хранит ID и нужный для заказа снимок',
        rule: 'Не дублируем редактор витрины в нашей платформе.',
    },
    {
        entity: 'Прайсы, цены, наценки и правила клиентов',
        owner: 'Платформа',
        ownerType: 'dz',
        copy: 'Внешним системам уходит только результат',
        rule: 'Это наша торговая логика и конкурентное преимущество.',
    },
    {
        entity: 'Заказы, источник исполнения, резервы и готовность',
        owner: 'Платформа',
        ownerType: 'dz',
        copy: '1С получает факт хозяйственной операции',
        rule: 'Выбор склада, выпуска или cross-docking делает платформа.',
    },
    {
        entity: 'Физический остаток, ячейки, операционные партии и подбор',
        owner: 'Платформа',
        ownerType: 'dz',
        copy: '1С получает движения и сверяет остаток',
        rule: 'Склад не зависит от доступности 1С в момент приёмки и сборки.',
    },
    {
        entity: 'Реквизиты, договоры, бухгалтерские партии и себестоимость',
        owner: '1С:КА 2',
        ownerType: 'onec',
        copy: 'Платформа получает ID, статус и учётную стоимость',
        rule: 'Регламентированная истина и проводки остаются в 1С.',
    },
    {
        entity: 'УПД, УКД, ЭДО и отчётность по маркировке',
        owner: 'Один активный контур',
        ownerType: 'shared',
        copy: 'Вторая система хранит документ, ID и статус',
        rule: 'До миграции может отправлять платформа, после миграции 1С, но никогда обе сразу.',
    },
];

const authorName = (annotation) =>
    annotation?.created_by?.name || annotation?.created_by?.email || 'Сотрудник';

const formatDate = (value) => (value ? dayjs(value).format('DD.MM.YYYY HH:mm') : '—');

const pathForStroke = (stroke) => {
    const points = stroke?.points || [];
    if (!points.length) return '';
    return points
        .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x * 1000} ${y * 1000}`)
        .join(' ');
};

const SystemTag = ({ type }) => {
    const config = systemTags[type];
    return <span className={config.className}>{config.label}</span>;
};

const OwnerBadge = ({ type, children }) => (
    <span className={`process-owner-badge process-owner-${type}`}>{children}</span>
);

const Flow = ({ steps, compact = false }) => (
    <div className={`process-flow${compact ? ' process-flow-compact' : ''}`}>
        {steps.map((step, index) => (
            <React.Fragment key={`${step.title}-${index}`}>
                <div className={`process-flow-step process-tone-${step.tone || 'ink'}`}>
                    <span className="process-flow-number">{String(index + 1).padStart(2, '0')}</span>
                    <SystemTag type={step.system || 'dz'} />
                    <strong>{step.title}</strong>
                    {step.text && <span>{step.text}</span>}
                </div>
                {index < steps.length - 1 && <span className="process-flow-arrow" aria-hidden="true">→</span>}
            </React.Fragment>
        ))}
    </div>
);

const RuleCard = ({ title, children, tone = 'plain', icon = null }) => (
    <article className={`process-rule-card process-rule-${tone}`}>
        <div className="process-rule-title">
            {icon}
            <strong>{title}</strong>
        </div>
        <div>{children}</div>
    </article>
);

const DetailList = ({ items }) => (
    <ul className="process-detail-list">
        {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
);

const AnnotationCanvas = ({ drawings, draftStrokes, activeStroke, drawingMode, onPointerDown, onPointerMove, onPointerUp }) => (
    <svg
        className={`process-annotation-canvas${drawingMode ? ' is-drawing' : ''}`}
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden="true"
    >
        {drawings.flatMap((drawing) =>
            (drawing.drawing_data?.strokes || []).map((stroke, index) => (
                <path
                    key={`${drawing.id}-${index}`}
                    d={pathForStroke(stroke)}
                    fill="none"
                    stroke={stroke.color || '#e4572e'}
                    strokeWidth={(stroke.width || 3) * 3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    opacity="0.86"
                />
            )),
        )}
        {[...draftStrokes, ...(activeStroke ? [activeStroke] : [])].map((stroke, index) => (
            <path
                key={`draft-${index}`}
                d={pathForStroke(stroke)}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.width * 3}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
        ))}
    </svg>
);

const ProcessSection = ({
    sectionKey,
    kicker,
    title,
    summary,
    annotations,
    onPlaceComment,
    onOpenThread,
    onSaveDrawing,
    children,
    allowDrawing = true,
}) => {
    const sectionRef = useRef(null);
    const [commentMode, setCommentMode] = useState(false);
    const [drawingMode, setDrawingMode] = useState(false);
    const [drawingColor, setDrawingColor] = useState(DRAWING_COLORS[0]);
    const [draftStrokes, setDraftStrokes] = useState([]);
    const [activeStroke, setActiveStroke] = useState(null);
    const [savingDrawing, setSavingDrawing] = useState(false);

    const roots = annotations.filter(
        (item) => item.section_key === sectionKey && item.kind === 'comment' && !item.parent_id,
    );
    const drawings = annotations.filter(
        (item) => item.section_key === sectionKey && item.kind === 'drawing',
    );
    const openCount = roots.filter((item) => !item.is_resolved).length;

    const pointFromEvent = (event) => {
        const rect = sectionRef.current.getBoundingClientRect();
        return [
            Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
        ];
    };

    const handleSectionClick = (event) => {
        if (!commentMode || event.target.closest('button, a, input, textarea, .ant-select')) return;
        const [x, y] = pointFromEvent(event);
        setCommentMode(false);
        onPlaceComment(sectionKey, x, y);
    };

    const startStroke = (event) => {
        if (!drawingMode) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setActiveStroke({ color: drawingColor, width: 3, points: [pointFromEvent(event)] });
    };

    const moveStroke = (event) => {
        if (!drawingMode || !activeStroke) return;
        const nextPoint = pointFromEvent(event);
        setActiveStroke((current) => ({ ...current, points: [...current.points, nextPoint] }));
    };

    const finishStroke = () => {
        if (!activeStroke) return;
        if (activeStroke.points.length > 1) {
            setDraftStrokes((current) => [...current, activeStroke]);
        }
        setActiveStroke(null);
    };

    const saveDrawing = async () => {
        if (!draftStrokes.length) return;
        setSavingDrawing(true);
        try {
            await onSaveDrawing(sectionKey, draftStrokes);
            setDraftStrokes([]);
            setDrawingMode(false);
        } finally {
            setSavingDrawing(false);
        }
    };

    return (
        <section
            id={`process-${sectionKey}`}
            ref={sectionRef}
            className={`process-section${commentMode ? ' is-commenting' : ''}`}
            onClick={handleSectionClick}
        >
            <header className="process-section-header">
                <div>
                    <span className="process-kicker">{kicker}</span>
                    <h2>{title}</h2>
                    <p>{summary}</p>
                </div>
                <div className="process-section-tools">
                    <Tooltip title="Нажмите кнопку, затем выберите место в этом блоке">
                        <Badge count={openCount} size="small">
                            <Button
                                icon={<CommentOutlined />}
                                type={commentMode ? 'primary' : 'default'}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setDrawingMode(false);
                                    setCommentMode((value) => !value);
                                }}
                            >
                                Комментарий
                            </Button>
                        </Badge>
                    </Tooltip>
                    {allowDrawing && (
                        <Button
                            icon={<EditOutlined />}
                            type={drawingMode ? 'primary' : 'default'}
                            onClick={(event) => {
                                event.stopPropagation();
                                setCommentMode(false);
                                setDrawingMode((value) => !value);
                            }}
                        >
                            Рисовать
                        </Button>
                    )}
                    {drawingMode && (
                        <div className="process-drawing-tools" onClick={(event) => event.stopPropagation()}>
                            <Select
                                value={drawingColor}
                                onChange={setDrawingColor}
                                options={DRAWING_COLORS.map((color) => ({
                                    value: color,
                                    label: <span className="process-color-option"><i style={{ background: color }} />{color}</span>,
                                }))}
                                popupMatchSelectWidth={false}
                            />
                            <Button icon={<UndoOutlined />} disabled={!draftStrokes.length} onClick={() => setDraftStrokes((value) => value.slice(0, -1))} />
                            <Button icon={<SaveOutlined />} type="primary" loading={savingDrawing} disabled={!draftStrokes.length} onClick={saveDrawing}>
                                Сохранить
                            </Button>
                        </div>
                    )}
                </div>
            </header>

            <div className="process-section-body">{children}</div>

            <AnnotationCanvas
                drawings={drawings}
                draftStrokes={draftStrokes}
                activeStroke={activeStroke}
                drawingMode={drawingMode}
                onPointerDown={startStroke}
                onPointerMove={moveStroke}
                onPointerUp={finishStroke}
            />

            {roots.map((annotation, index) => (
                <button
                    key={annotation.id}
                    type="button"
                    className={`process-comment-pin${annotation.is_resolved ? ' is-resolved' : ''}`}
                    style={{
                        left: `${(annotation.anchor_x ?? 0.96) * 100}%`,
                        top: `${(annotation.anchor_y ?? 0.12) * 100}%`,
                    }}
                    title={`${authorName(annotation)}: ${annotation.content}`}
                    onClick={(event) => {
                        event.stopPropagation();
                        onOpenThread(annotation.id);
                    }}
                >
                    {index + 1}
                </button>
            ))}
        </section>
    );
};

const ProcessArchitecturePage = () => {
    const { user } = useAuth();
    const [annotations, setAnnotations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [commentDraft, setCommentDraft] = useState(null);
    const [commentText, setCommentText] = useState('');
    const [savingComment, setSavingComment] = useState(false);
    const [discussionOpen, setDiscussionOpen] = useState(false);
    const [selectedThreadId, setSelectedThreadId] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [replying, setReplying] = useState(false);

    const loadAnnotations = useCallback(async (showSpinner = false) => {
        if (showSpinner) setLoading(true);
        try {
            const response = await getProcessAnnotations(PAGE_KEY);
            setAnnotations(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось загрузить обсуждения');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadAnnotations(true);
        const timer = window.setInterval(() => void loadAnnotations(false), 20000);
        return () => window.clearInterval(timer);
    }, [loadAnnotations]);

    const roots = useMemo(
        () => annotations.filter((item) => item.kind === 'comment' && !item.parent_id),
        [annotations],
    );
    const openThreads = roots.filter((item) => !item.is_resolved);
    const selectedThread = annotations.find((item) => item.id === selectedThreadId) || null;
    const selectedReplies = annotations.filter((item) => item.parent_id === selectedThreadId);

    const canManage = (annotation) =>
        user?.role === 'admin' || annotation?.created_by_id === user?.id;

    const openThread = (id) => {
        setSelectedThreadId(id);
        setDiscussionOpen(true);
    };

    const saveComment = async () => {
        if (!commentText.trim() || !commentDraft) return;
        setSavingComment(true);
        try {
            const response = await createProcessAnnotation({
                page_key: PAGE_KEY,
                section_key: commentDraft.sectionKey,
                kind: 'comment',
                anchor_x: commentDraft.x,
                anchor_y: commentDraft.y,
                content: commentText.trim(),
            });
            setAnnotations((current) => [...current, response.data]);
            setCommentDraft(null);
            setCommentText('');
            message.success('Комментарий сохранён и виден команде');
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось сохранить комментарий');
        } finally {
            setSavingComment(false);
        }
    };

    const saveDrawing = async (sectionKey, strokes) => {
        try {
            const response = await createProcessAnnotation({
                page_key: PAGE_KEY,
                section_key: sectionKey,
                kind: 'drawing',
                drawing_data: { strokes },
            });
            setAnnotations((current) => [...current, response.data]);
            message.success('Рисунок сохранён и виден команде');
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось сохранить рисунок');
            throw error;
        }
    };

    const sendReply = async () => {
        if (!selectedThread || !replyText.trim()) return;
        setReplying(true);
        try {
            const response = await createProcessAnnotation({
                page_key: PAGE_KEY,
                section_key: selectedThread.section_key,
                kind: 'comment',
                parent_id: selectedThread.id,
                content: replyText.trim(),
            });
            setAnnotations((current) => [...current, response.data]);
            setReplyText('');
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось отправить ответ');
        } finally {
            setReplying(false);
        }
    };

    const toggleResolved = async (annotation) => {
        try {
            const response = await updateProcessAnnotation(annotation.id, {
                is_resolved: !annotation.is_resolved,
            });
            setAnnotations((current) => current.map((item) => (
                item.id === annotation.id ? response.data : item
            )));
        } catch (error) {
            message.error(error?.response?.data?.detail || 'Не удалось изменить обсуждение');
        }
    };

    const removeAnnotation = async (annotation) => {
        Modal.confirm({
            title: annotation.kind === 'drawing' ? 'Удалить рисунок?' : 'Удалить обсуждение?',
            content: 'Удаление будет видно всем участникам.',
            okText: 'Удалить',
            okButtonProps: { danger: true },
            cancelText: 'Отмена',
            onOk: async () => {
                try {
                    await deleteProcessAnnotation(annotation.id);
                    setAnnotations((current) => current.filter(
                        (item) => item.id !== annotation.id && item.parent_id !== annotation.id,
                    ));
                    if (selectedThreadId === annotation.id) setSelectedThreadId(null);
                } catch (error) {
                    message.error(error?.response?.data?.detail || 'Не удалось удалить аннотацию');
                }
            },
        });
    };

    const sectionProps = (sectionKey) => ({
        sectionKey,
        annotations,
        onPlaceComment: (key, x, y) => setCommentDraft({ sectionKey: key, x, y }),
        onOpenThread: openThread,
        onSaveDrawing: saveDrawing,
    });

    if (loading) {
        return <div className="process-loading"><Spin size="large" /></div>;
    }

    return (
        <div className="process-page">
            <header className="process-hero">
                <div className="process-hero-copy">
                    <span className="process-hero-eyebrow">Рабочая модель · версия для обсуждения</span>
                    <h1>Как DragonZap проходит путь от прайса до УПД</h1>
                    <p>
                        Общая карта будущего контура: наша платформа управляет ассортиментом,
                        заказом и складской операцией; 1С:КА 2 ведёт регламентированный учёт;
                        ЭДО и ГИС МТ возвращают юридические статусы.
                    </p>
                    <div className="process-hero-actions">
                        <Button type="primary" size="large" icon={<MessageOutlined />} onClick={() => {
                            setSelectedThreadId(null);
                            setDiscussionOpen(true);
                        }}>
                            Обсуждения <Badge count={openThreads.length} className="process-button-badge" />
                        </Button>
                        <Button size="large" icon={<ReloadOutlined />} onClick={() => void loadAnnotations(true)}>
                            Обновить
                        </Button>
                    </div>
                </div>
                <div className="process-hero-aside">
                    <span>Принцип</span>
                    <strong>Одна операция — один ответственный контур</strong>
                    <p>Платформа не дублирует бухгалтерию, а 1С не принимает решения по кроссам и исполнению заказа.</p>
                </div>
            </header>

            <nav className="process-toc" aria-label="Разделы схемы">
                {SECTION_NAV.map(([key, label], index) => {
                    const count = roots.filter((item) => item.section_key === key && !item.is_resolved).length;
                    return (
                        <a key={key} href={`#process-${key}`}>
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <strong>{label}</strong>
                            {count > 0 && <i>{count}</i>}
                        </a>
                    );
                })}
            </nav>

            <ProcessSection
                {...sectionProps('system-map')}
                kicker="01 · Архитектура"
                title="Три отдельных контура и один владелец каждой сущности"
                summary="Граница проходит не по названиям функций, а по ответственности: одна система меняет и подтверждает сущность, остальные получают контролируемую копию."
            >
                <div className="process-contour-grid">
                    <RuleCard title="Операционный контур" tone="orange" icon={<CloudSyncOutlined />}>
                        <DetailList items={[
                            'Прайсы, цены, кроссы и правила клиентов',
                            'Заказы, выбор источника, резервы и cross-docking',
                            'Физический склад, ячейки, волны, этикетки и рекламации',
                        ]} />
                        <SystemTag type="dz" />
                    </RuleCard>
                    <RuleCard title="Торговый контур" tone="blue" icon={<ApartmentOutlined />}>
                        <DetailList items={[
                            'Витрина и внешняя торговая площадка',
                            'Карточки, фото и описания',
                            'Передача заказов и статусов по согласованному API',
                        ]} />
                        <SystemTag type="partssoft" />
                    </RuleCard>
                    <RuleCard title="Регуляторный контур" tone="teal" icon={<HistoryOutlined />}>
                        <DetailList items={[
                            'Реквизиты, договоры, проводки и взаиморасчёты',
                            'Бухгалтерские партии, себестоимость и регламентированный учёт',
                            'Проведение поступления, выпуска, реализации и возврата',
                        ]} />
                        <SystemTag type="onec" />
                    </RuleCard>
                </div>
                <div className="process-system-boundary">
                    <span><ApartmentOutlined /> Клиенты и поставщики</span>
                    <strong>↔</strong>
                    <span><CloudSyncOutlined /> Платформа связывает контуры</span>
                    <strong>↔</strong>
                    <span><SafetyCertificateOutlined /> Диадок · ГИС МТ · перевозчики</span>
                </div>
                <div className="process-callout">
                    <strong>Владелец не равен единственному хранилищу</strong>
                    <span>Владелец изменяет и подтверждает запись. Другие контуры могут хранить её копию, внешний ID и статус, но не создают параллельную истину.</span>
                </div>
                <div className="process-ownership-table" role="table" aria-label="Владельцы сущностей">
                    <div className="process-ownership-head" role="row">
                        <strong role="columnheader">Сущность</strong>
                        <strong role="columnheader">Владелец</strong>
                        <strong role="columnheader">Копия</strong>
                        <strong role="columnheader">Правило</strong>
                    </div>
                    {OWNERSHIP_ROWS.map((row) => (
                        <div className="process-ownership-row" role="row" key={row.entity}>
                            <strong role="cell" data-label="Сущность">{row.entity}</strong>
                            <div role="cell" data-label="Владелец">
                                <OwnerBadge type={row.ownerType}>{row.owner}</OwnerBadge>
                            </div>
                            <span role="cell" data-label="Копия">{row.copy}</span>
                            <p role="cell" data-label="Правило">{row.rule}</p>
                        </div>
                    ))}
                </div>
                <div className="process-callout">
                    <strong>Ключевое правило интеграции</strong>
                    <span>Платформа отправляет команду с idempotency key, внешняя система возвращает ID и статус. Повтор команды не создаёт дубль.</span>
                </div>
            </ProcessSection>

            <ProcessSection
                {...sectionProps('stock-model')}
                kicker="02 · Номенклатура"
                title="Единая модель товара и остатков"
                summary="Каждая складская партия получает явную роль при приёмке. Маршрут исполнения заказа хранится отдельно и не подменяет состояние товара."
            >
                <div className="process-grid process-grid-3">
                    <RuleCard title="ORIGINAL_GOOD · товар как есть" tone="plain">
                        <DetailList items={[
                            'Приходуется под брендом и артикулом поставщика',
                            'Резервируется и продаётся без выпуска DragonZap',
                            'Партия, себестоимость, ГТД и КИЗ сохраняются у исходного товара',
                        ]} />
                    </RuleCard>
                    <RuleCard title="DRAGONZAP_MATERIAL · материал" tone="sand">
                        <DetailList items={[
                            'Хранится под номенклатурой входящего документа и конкретной партией',
                            'Не продаётся напрямую как DragonZap без задания на выпуск',
                            'Резервируется только в допустимую группу выпуска',
                        ]} />
                    </RuleCard>
                    <RuleCard title="DRAGONZAP_FINISHED · готовая продукция" tone="orange">
                        <DetailList items={[
                            'Появляется только после подтверждённого выпуска',
                            'Имеет юридическую номенклатуру DragonZap',
                            'Связана с материалом, упаковкой и строкой заказа',
                            'После отмены или возврата остаётся готовым товаром, а не превращается обратно в материал',
                        ]} />
                    </RuleCard>
                </div>
                <div className="process-callout">
                    <strong>Cross-docking не является четвёртым состоянием товара.</strong>
                    <span>Это маршрут исполнения: позиция не проходит выпуск DragonZap, но связывается с заказом поставщику, приёмкой, клиентской этикеткой и общей отгрузкой.</span>
                </div>
                <div className="process-grid process-grid-3">
                    <RuleCard title="Поставщик: только материал" tone="sand">
                        <p>Все допустимые поступления поставщика по умолчанию получают роль материала DragonZap.</p>
                    </RuleCard>
                    <RuleCard title="Поставщик: только товар" tone="teal">
                        <p>Поступления предназначены для прямой продажи и не участвуют в выпуске DragonZap.</p>
                    </RuleCard>
                    <RuleCard title="Поставщик: смешанный" tone="plain">
                        <p>Роль определяется правилом конкретного артикула, бренда или категории; спорные строки уходят оператору.</p>
                    </RuleCard>
                </div>
                <Flow steps={[
                    { title: 'Политика поставщика', text: 'Материал / товар / смешанный', system: 'dz' },
                    { title: 'Точное правило', text: 'Артикул → бренд → категория', system: 'dz', tone: 'orange' },
                    { title: 'Решение строки', text: 'Роль подтверждена при приёмке', system: 'warehouse' },
                    { title: 'Снимок партии', text: 'Роль и основание неизменяемы', system: 'dz', tone: 'teal' },
                ]} />
                <div className="process-warning">
                    <strong>Изменение правила поставщика не меняет старые партии задним числом.</strong>
                    Для уже принятой партии роль корректируется только отдельной операцией с пользователем, причиной и историей. Поисковый кросс по-прежнему не создаёт новый остаток.
                </div>
            </ProcessSection>

            <ProcessSection
                {...sectionProps('receipt')}
                kicker="03 · Входящий поток"
                title="Поступление товара и документов"
                summary="Документ может прийти тремя каналами; платформа распознаёт и сопоставляет, а 1С проводит хозяйственную операцию."
            >
                <div className="process-grid process-grid-3">
                    <RuleCard title="1. ЭДО" tone="teal">
                        <p>Диадок → XML УПД → поставщик, строки, партия, ГТД/РНПТ, КИЗ → проверка оператором.</p>
                    </RuleCard>
                    <RuleCard title="2. Почта" tone="sand">
                        <p>Вложение XLS/XLSX/PDF/XML → профиль поставщика → распознавание колонок → очередь исключений при расхождении.</p>
                    </RuleCard>
                    <RuleCard title="3. Ручной ввод" tone="plain">
                        <p>Оператор создаёт документ, прикладывает оригинал и заполняет недостающие реквизиты с обязательной историей изменений.</p>
                    </RuleCard>
                </div>
                <Flow steps={[
                    { title: 'Получить источник', text: 'ЭДО / почта / вручную', system: 'external' },
                    { title: 'Распознать', text: 'Контрагент, документ, строки, партии', system: 'dz' },
                    { title: 'Сопоставить', text: 'Поставщик → внутренняя номенклатура', system: 'dz' },
                    { title: 'Проверить расхождения', text: 'Цена, количество, бренд, КИЗ', system: 'dz', tone: 'orange' },
                    { title: 'Передать в 1С', text: 'Черновик поступления', system: 'onec', tone: 'teal' },
                    { title: 'Вернуть статус', text: 'Номер, проведение, ошибка', system: 'onec', tone: 'teal' },
                ]} />
                <div className="process-grid process-grid-2">
                    <RuleCard title="Быстрая приёмка списком" tone="sand">
                        <p>Сотрудник отмечает пришедшие строки, вводит фактическое количество и одной командой получает сгруппированные складские или клиентские этикетки.</p>
                    </RuleCard>
                    <RuleCard title="Приёмка сканером" tone="teal">
                        <p>Скан определяет строку поступления, система спрашивает количество, фиксирует факт и сразу создаёт задание печати нужных этикеток.</p>
                    </RuleCard>
                </div>
                <div className="process-two-column-note">
                    <div><strong>Обычный товар</strong><span>Принимается по документу и количеству; универсальное сканирование этикетки не требуется, потому что её часто нет.</span></div>
                    <div><strong>Маркируемый товар</strong><span>Коды КИЗ принимаются из УПД или отдельным сканированием и закрепляются за конкретной партией.</span></div>
                </div>
                <div className="process-callout">
                    <strong>Сканирование на приёмке остаётся выбором сотрудника.</strong>
                    <span>Массовый режим быстрее для однородной поставки, сканер удобнее для смешанного поступления. Внутренний логистический штрихкод и DataMatrix КИЗ учитываются как разные идентификаторы.</span>
                </div>
            </ProcessSection>

            <ProcessSection
                {...sectionProps('assortment-price')}
                kicker="04 · Продажи"
                title="Номенклатура, подтверждённые кроссы и клиентские прайсы"
                summary="Платформа решает, какие виртуальные предложения показывать каждому клиенту, но не создаёт под них фиктивные складские остатки."
            >
                <div className="process-lanes">
                    <div className="process-lane">
                        <span>Наш остаток</span>
                        <strong>DRAGONZAP · DZT113001111BA · 46 шт.</strong>
                        <p>Основная строка передаёт реальный остаток и установленную клиентскую цену.</p>
                    </div>
                    <div className="process-lane-arrow">→</div>
                    <div className="process-lane process-lane-highlight">
                        <span>Только подтверждённые AutoPartCross</span>
                        <strong>1014003218 · T113001111BA · DZ1014003218…</strong>
                        <p>Бренд во всех дополнительных строках DragonZap. Количество дополнительных кроссов изменяется по настроенному правилу, цена не изменяется.</p>
                    </div>
                    <div className="process-lane-arrow">→</div>
                    <div className="process-lane">
                        <span>Клиентский прайс</span>
                        <strong>Одна физическая позиция · несколько поисковых входов</strong>
                        <p>Фиксируется снимок опубликованных кроссов, чтобы последующий заказ можно было доказуемо сопоставить.</p>
                    </div>
                </div>
                <div className="process-grid process-grid-2">
                    <RuleCard title="Правила клиента" tone="plain">
                        <DetailList items={[
                            'Какие собственные и поставщицкие источники включены',
                            'Фильтры брендов, сроков, остатков и цены',
                            'Наценка и доступность заказа',
                            'Опция публикации подтверждённых кроссов DragonZap выключена по умолчанию',
                        ]} />
                    </RuleCard>
                    <RuleCard title="Защита от неоднозначности" tone="sand">
                        <p>Если один заказанный кросс связан с несколькими остатками DragonZap, платформа выбирает самый дешёвый допустимый вариант и сохраняет фактическую позицию отдельно от заказанной.</p>
                    </RuleCard>
                </div>
                <div className="process-grid process-grid-2">
                    <RuleCard title="Каталожный кросс" tone="plain">
                        <p>Отвечает на вопрос: «Эти номера взаимозаменяемы для поиска, предложения и клиентского прайса?» Источник истины — подтверждённый AutoPartCross.</p>
                    </RuleCard>
                    <RuleCard title="Группа выпуска DragonZap" tone="orange">
                        <p>Отвечает на другой вопрос: «Можно ли конкретную партию материала превратить в этот готовый SKU DragonZap?» Здесь действуют ограничения поставщика, партии, маркировки и упаковки.</p>
                    </RuleCard>
                </div>
                <div className="process-callout">
                    <strong>Двойного ввода кроссов не будет.</strong>
                    <span>Группа выпуска автоматически строится из подтверждённых кроссов DragonZap. Пользователь настраивает только допустимые источники материала, приоритеты и исключения.</span>
                </div>
                <div className="process-two-column-note">
                    <div><strong>Одинаковый GEELY 123 у разных поставщиков</strong><span>Каталожная карточка может быть общей, но партия поставщика А сохраняется как материал, а партия поставщика Б — как оригинальный товар. Различие хранится в партии и снимке применённого правила.</span></div>
                    <div><strong>Цена предложения DragonZap</strong><span>Рассчитывается по последовательности допустимых партий, покрывающих показываемое количество, плюс упаковка и наценка. Нельзя ориентироваться только на первую дешёвую FIFO-партию.</span></div>
                </div>
            </ProcessSection>

            <ProcessSection
                {...sectionProps('order-routing')}
                kicker="05 · Заказ"
                title="Приём заказа и выбор исполнения"
                summary="Заказанная клиентом строка никогда не перезаписывается: рядом сохраняется фактическая складская позиция и источник исполнения."
            >
                <Flow steps={[
                    { title: 'Получить заказ', text: 'Почта / сайт / ручной ввод', system: 'external' },
                    { title: 'Нормализовать', text: 'Бренд, артикул, цена, количество', system: 'dz' },
                    { title: 'Найти снимок прайса', text: 'Прямой номер или опубликованный кросс', system: 'dz' },
                    { title: 'Выбрать исполнение', text: 'Склад напрямую / DragonZap / cross-docking', system: 'dz', tone: 'orange' },
                    { title: 'Создать резервы', text: 'Фактический SKU и партия', system: 'onec', tone: 'teal' },
                ]} />
                <div className="process-identity-card">
                    <div><span>Что заказал клиент</span><strong>requested_brand · requested_oem · requested_name</strong><p>Используется в ответе, этикетке и клиентских документах.</p></div>
                    <div className="process-identity-link">связь</div>
                    <div><span>Что реально исполняем</span><strong>actual_autopart_id · партия · источник</strong><p>Используется для резерва, выпуска, списания, себестоимости и возврата.</p></div>
                </div>
                <div className="process-grid process-grid-3">
                    <RuleCard title="Наш оригинал" tone="plain"><p>Резервируется и продаётся непосредственно под юридической номенклатурой.</p></RuleCard>
                    <RuleCard title="DragonZap" tone="orange"><p>Материал резервируется в волну выпуска под заказанный клиентом артикул DragonZap.</p></RuleCard>
                    <RuleCard title="Cross-docking" tone="teal"><p>Формируется черновик заказа поставщику; после подтверждения ожидается конкретная строка поступления.</p></RuleCard>
                </div>
                <Flow steps={[
                    { title: 'Отфильтровать партии', text: 'Группа выпуска, роль, доступность, ограничения КИЗ', system: 'dz' },
                    { title: 'Рассчитать покрытие', text: 'FIFO и фактическая себестоимость всего количества', system: 'dz', tone: 'orange' },
                    { title: 'Зафиксировать выбор', text: 'Партии и количество по каждой', system: 'dz' },
                    { title: 'Поставить резерв', text: 'Сразу после подтверждения строки', system: 'onec', tone: 'teal' },
                ]} />
                <div className="process-warning">
                    <strong>Ручная замена материала допускается, но не остаётся незаметной.</strong>
                    Сотрудник выбирает другую допустимую партию, указывает причину, а система пересчитывает себестоимость и сохраняет аудит решения.
                </div>
            </ProcessSection>

            <ProcessSection
                {...sectionProps('production')}
                kicker="06 · DragonZap"
                title="Волны упаковки и выпуска"
                summary="Вместо сотен отдельных документов система накапливает потребность и создаёт одну волну по складу и выпускающему подразделению."
            >
                <div className="process-callout">
                    <strong>Переупаковка признаётся выпуском.</strong>
                    <span>Материал и упаковка списываются, готовая номенклатура DragonZap приходуется. Связь исходной партии, выпуска и клиентской строки сохраняется полностью.</span>
                </div>
                <Flow steps={[
                    { title: 'Накопить потребность', text: 'Все подтверждённые строки DragonZap', system: 'dz' },
                    { title: 'Запустить волну', text: 'По расписанию или вручную', system: 'dz', tone: 'orange' },
                    { title: 'Зарезервировать материалы', text: 'Исходные партии и упаковка', system: 'onec', tone: 'teal' },
                    { title: 'Создать задание', text: 'Сколько и во что переупаковать', system: 'dz' },
                    { title: 'Напечатать этикетки', text: 'Автоматически, до упаковки', system: 'warehouse', tone: 'orange' },
                    { title: 'Подтвердить выпуск', text: 'Готовая продукция DragonZap', system: 'onec', tone: 'teal' },
                ]} />
                <div className="process-grid process-grid-2">
                    <RuleCard title="Запуск волны" tone="sand">
                        <p>Администратор задаёт любое количество отсечек в течение дня. Дополнительно доступна ручная команда «Сформировать волну сейчас».</p>
                    </RuleCard>
                    <RuleCard title="Состав документов 1С" tone="teal">
                        <p>Один склад и одно выпускающее подразделение позволяют агрегировать множество заказов и строк в документе выпуска, сохраняя аналитическую связь с каждой клиентской строкой.</p>
                    </RuleCard>
                </div>
                <div className="process-grid process-grid-3">
                    <RuleCard title="1. Допуск материала" tone="plain">
                        <p>Партия входит в группу выпуска, имеет роль материала, не заблокирована и соответствует ограничениям маркировки.</p>
                    </RuleCard>
                    <RuleCard title="2. Распределение" tone="sand">
                        <p>FIFO с предпочтением одной партии, покрывающей строку; если количества не хватает, система делит потребность между партиями.</p>
                    </RuleCard>
                    <RuleCard title="3. Фактическая стоимость" tone="orange">
                        <p>Себестоимость готовой позиции складывается из реально списанных партий и упаковки, а не из цены первой доступной партии.</p>
                    </RuleCard>
                </div>
                <div className="process-two-column-note">
                    <div><strong>Пример расчёта</strong><span>2 шт. по 100 + 8 шт. по 150 дают среднюю стоимость материала 140 за штуку. После упаковки 10 итоговая себестоимость равна 150, а не 110.</span></div>
                    <div><strong>Отмена или возврат</strong><span>Уже выпущенная позиция возвращается в остаток DRAGONZAP_FINISHED. Обратное превращение в материал возможно только отдельным документированным процессом.</span></div>
                </div>
                <div className="process-warning">
                    <strong>Обычная продукция не требует обязательного сканирования материала.</strong>
                    Комплектовщик получает задание с местом хранения и количеством. Контроль КИЗ включается только для маркируемых групп.
                </div>
            </ProcessSection>

            <ProcessSection
                {...sectionProps('labels')}
                kicker="07 · Печать"
                title="Автоматическая печать этикеток перед упаковкой"
                summary="Количество и содержание этикеток рассчитываются системой из подтверждённых строк заказа; оператор только выбирает принтер или повторяет печать."
            >
                <Flow steps={[
                    { title: 'Волна готова', text: 'Известны клиентские строки и количество', system: 'dz' },
                    { title: 'Рассчитать этикетки', text: 'По упаковкам и количеству', system: 'dz', tone: 'orange' },
                    { title: 'Создать задание печати', text: 'До начала упаковки', system: 'dz', tone: 'orange' },
                    { title: 'Напечатать 58 × 40', text: 'Локальный принтер этикеток', system: 'warehouse' },
                    { title: 'Упаковать товар', text: 'По заданию волны', system: 'warehouse' },
                    { title: 'При необходимости повторить', text: 'С историей пользователя и времени', system: 'dz' },
                ]} />
                <div className="process-label-layout">
                    <div className="process-label-preview">
                        <div className="process-label-brand">DRAGONZAP</div>
                        <div className="process-label-oem">DZ1014003218</div>
                        <div className="process-label-name">Опора двигателя передняя</div>
                        <div className="process-label-meta"><span>12 шт.</span><span>Клиент: Формула</span></div>
                        <div className="process-label-order">Заказ №2999 · 05.08.2026</div>
                        <div className="process-fake-barcode" aria-label="Штрихкод внутренней строки заказа">
                            <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
                        </div>
                        <small>COI-26521</small>
                    </div>
                    <div>
                        <h3><PrinterOutlined /> На каждой этикетке</h3>
                        <DetailList items={[
                            'Бренд из заказа клиента',
                            'Артикул из заказа клиента',
                            'Наименование',
                            'Количество',
                            'Клиент',
                            'Номер заказа и дата заказа',
                            'Штрихкод внутренней строки заказа',
                        ]} />
                        <div className="process-callout process-callout-small">
                            <strong>Повторная печать</strong>
                            <span>Доступна из волны и из заказа. Система не создаёт новую потребность, а увеличивает счётчик печати и сохраняет сотрудника, время и причину.</span>
                        </div>
                    </div>
                </div>
                <div className="process-two-column-note">
                    <div><strong>DragonZap</strong><span>Этикетка сопровождает выпуск и переупаковку готовой продукции.</span></div>
                    <div><strong>Cross-docking</strong><span>Этикетка тоже печатается, но с брендом и артикулом именно из заказа клиента, без оформления производства.</span></div>
                </div>
                <div className="process-grid process-grid-2">
                    <RuleCard title="Массовая печать" tone="sand">
                        <p>После приёмки списком или запуска волны система группирует задания и автоматически печатает рассчитанное количество этикеток.</p>
                    </RuleCard>
                    <RuleCard title="Печать после сканирования" tone="teal">
                        <p>После скана и подтверждения количества этикетка создаётся для конкретной строки. Повторная печать доступна с обязательной записью в историю.</p>
                    </RuleCard>
                </div>
            </ProcessSection>

            <ProcessSection
                {...sectionProps('crossdocking')}
                kicker="08 · Поставщики рядом"
                title="Cross-docking без производства"
                summary="Позиция проходит от заказа поставщику к клиентской коробке через связанное поступление; наша платформа контролирует комплектность и срок."
            >
                <Flow steps={[
                    { title: 'Строка клиента', text: 'Бренд, артикул, количество, цена', system: 'dz' },
                    { title: 'Черновик заказа поставщику', text: 'Менеджер проверяет и отправляет', system: 'dz' },
                    { title: 'Ответ поставщика', text: 'Подтверждение / отказ / количество', system: 'external' },
                    { title: 'Ожидаемое поступление', text: 'Связано со строкой клиента', system: 'dz' },
                    { title: 'Приёмка', text: 'Документы, партия, доступные КИЗ', system: 'warehouse' },
                    { title: 'Клиентская этикетка', text: 'Автоматически перед укладкой', system: 'warehouse', tone: 'orange' },
                    { title: 'Реализация', text: 'В общей отгрузке клиента', system: 'onec', tone: 'teal' },
                ]} />
                <div className="process-grid process-grid-3">
                    <RuleCard title="Документы есть" tone="teal"><p>Поступление передаётся в 1С с реальными реквизитами, ГТД/РНПТ и КИЗ, если они пришли.</p></RuleCard>
                    <RuleCard title="Документы ожидаются" tone="sand"><p>Товар получает статус DOC_PENDING и остаётся в контроле исключений. Это не блокирует продажу по умолчанию, но задолженность по документам видна ответственному.</p></RuleCard>
                    <RuleCard title="Клиентская видимость" tone="plain"><p>В этикетке, реализации и УПД используется заказанная клиентом номенклатура; внутренний источник хранится в связи строки.</p></RuleCard>
                </div>
                <div className="process-grid process-grid-2">
                    <RuleCard title="Быстрая приёмка" tone="sand">
                        <p>Галочками отмечаются пришедшие строки и фактическое количество, затем одним заданием печатаются клиентские этикетки.</p>
                    </RuleCard>
                    <RuleCard title="Приёмка сканером" tone="teal">
                        <p>Скан открывает ожидаемую строку, сотрудник подтверждает количество, после чего этикетка печатается и позиция попадает в клиентскую коробку.</p>
                    </RuleCard>
                </div>
                <Flow steps={[
                    { title: 'PHYSICALLY_RECEIVED', text: 'Товар фактически принят', system: 'warehouse' },
                    { title: 'DOC_PENDING', text: 'Документ отсутствует или ожидается', system: 'dz', tone: 'orange' },
                    { title: 'READY_FOR_CUSTOMER', text: 'Позиция промаркирована и готова к сборке', system: 'dz', tone: 'teal' },
                ]} />
                <div className="process-warning">
                    <strong>Отсутствующий документ не скрывается и не останавливает обычный cross-docking автоматически.</strong>
                    Система разрешает продажу по принятому бизнес-правилу, сохраняет исключение и отдельно контролирует последующее получение основания.
                </div>
            </ProcessSection>

            <ProcessSection
                {...sectionProps('customs-marking')}
                kicker="09 · Прослеживаемость"
                title="ГТД, партии и маркировка"
                summary="Прослеживаемость строится от фактической партии. Для маркируемых товаров код движется вместе с единицей товара и не заменяется обычной этикеткой."
            >
                <div className="process-split-flow">
                    <div>
                        <h3>Партия и ГТД / РНПТ</h3>
                        <Flow compact steps={[
                            { title: 'Входящий документ', text: 'Номер и страна', system: 'external' },
                            { title: 'Партия', text: 'Количество и себестоимость', system: 'dz' },
                            { title: 'Движение', text: 'Продажа или материал', system: 'onec' },
                            { title: 'Исходящая строка', text: 'Реквизиты партии', system: 'onec' },
                        ]} />
                    </div>
                    <div>
                        <h3>Коды маркировки</h3>
                        <Flow compact steps={[
                            { title: 'КИЗ из УПД', text: 'Или отдельная приёмка кода', system: 'external' },
                            { title: 'Код на партии', text: 'Статус и владелец', system: 'dz' },
                            { title: 'Резерв к заказу', text: 'Конкретная единица', system: 'dz' },
                            { title: 'Исходящий УПД', text: 'Передача КИЗ клиенту', system: 'onec' },
                            { title: 'ГИС МТ', text: 'Подтверждение движения', system: 'external' },
                        ]} />
                    </div>
                </div>
                <div className="process-grid process-grid-3">
                    <RuleCard title="Оригинал напрямую" tone="plain"><p>Сохраняет входящий GTIN, КИЗ и партию при реализации.</p></RuleCard>
                    <RuleCard title="Cross-docking" tone="teal"><p>КИЗ, полученный от поставщика, передаётся в исходящем УПД по связанной строке.</p></RuleCard>
                    <RuleCard title="DragonZap" tone="orange"><p>Всегда считается новой продукцией: собственная номенклатура, собственный GTIN, заказ/нанесение нового КМ и ввод в оборот по применимому сценарию.</p></RuleCard>
                </div>
                <div className="process-warning">
                    <strong>Если обязательного кода нет или его статус не подходит,</strong>
                    строка блокируется до решения ответственного сотрудника и не должна автоматически попадать в отгрузочный УПД.
                </div>
            </ProcessSection>

            <ProcessSection
                {...sectionProps('shipment-documents')}
                kicker="10 · Отгрузка"
                title="Сборка, реализация, УПД и ЭДО"
                summary="Одна клиентская отгрузка объединяет собственный оригинал, выпущенный DragonZap и cross-docking, сохраняя происхождение каждой строки."
            >
                <Flow steps={[
                    { title: 'Готовность строк', text: 'Резерв / выпуск / поступление', system: 'dz' },
                    { title: 'Сборочное задание', text: 'Ячейки, коробки, клиентские строки', system: 'warehouse' },
                    { title: 'Контроль комплектности', text: 'Количество и внутренний штрихкод', system: 'warehouse' },
                    { title: 'Реализация в 1С', text: 'Юридическая номенклатура и партии', system: 'onec', tone: 'teal' },
                    { title: 'Формализованный УПД', text: 'Включая ГТД/РНПТ и КИЗ', system: 'onec', tone: 'teal' },
                    { title: 'Диадок', text: 'Отправка и статусы подписания', system: 'external' },
                    { title: 'Закрытие заказа', text: 'Факт отгрузки возвращается в платформу', system: 'dz' },
                ]} />
                <div className="process-grid process-grid-2">
                    <RuleCard title="В документах клиента" tone="orange">
                        <DetailList items={[
                            'Бренд, артикул и наименование, под которыми клиент сделал заказ',
                            'Количество и цена подтверждённой реализации',
                            'Обязательные реквизиты партии и маркировки',
                        ]} />
                    </RuleCard>
                    <RuleCard title="Во внутренней связи" tone="teal">
                        <DetailList items={[
                            'Фактический AutoPart и партия списания',
                            'Материал и документ выпуска для DragonZap',
                            'Поставщик и поступление для cross-docking',
                            'Строка заказа, этикетка, коробка и история статусов',
                        ]} />
                    </RuleCard>
                </div>
                <div className="process-grid process-grid-3">
                    <RuleCard title="Обычный контроль" tone="teal">
                        <p>Сотрудник сканирует внутренний штрихкод строки, система проверяет клиента, заказ, артикул и оставшееся количество.</p>
                    </RuleCard>
                    <RuleCard title="Аварийный обход" tone="sand">
                        <p>Только сотрудник с отдельным правом может продолжить без полного сканирования. Причина обязательна, действие попадает в аудит и выделяется предупреждением.</p>
                    </RuleCard>
                    <RuleCard title="КИЗ отдельно" tone="plain">
                        <p>Внутренний штрихкод подтверждает логистическую строку, DataMatrix КИЗ подтверждает конкретную маркированную единицу. Один код не заменяет другой.</p>
                    </RuleCard>
                </div>
            </ProcessSection>

            <ProcessSection
                {...sectionProps('exchanges')}
                kicker="11 · Интеграции"
                title="События обмена с 1С и внешними системами"
                summary="Обмен строится не выгрузкой всей базы, а понятными командами и ответами, которые можно безопасно повторить после сбоя."
            >
                <div className="process-event-grid">
                    <div className="process-event-head">Событие</div><div className="process-event-head">Откуда → куда</div><div className="process-event-head">Что передаём и что ждём</div>
                    <strong>Поступление готово</strong><span>Платформа → 1С</span><p>Контрагент, основание, строки, партии, ГТД/РНПТ, КИЗ → ID и статус проведения.</p>
                    <strong>Волна выпуска</strong><span>Платформа → 1С</span><p>Материалы, упаковка, готовые SKU DragonZap, количества, связи заказов → документ выпуска.</p>
                    <strong>Реализация готова</strong><span>Платформа → 1С</span><p>Клиент, заказанные реквизиты, фактические партии, цены и налоги → реализация и УПД.</p>
                    <strong>Документ ЭДО</strong><span>1С ⇄ Диадок ⇄ Платформа</span><p>XML, подписи, статусы доставки/подписания/отказа и ссылки на исходные документы.</p>
                    <strong>Маркировка</strong><span>Платформа / 1С ⇄ ГИС МТ</span><p>Эмиссия, ввод, передача, возврат или вывод кодов → актуальный статус каждого КИЗ.</p>
                    <strong>Возврат клиента</strong><span>Платформа → 1С</span><p>Заказанная строка + фактический SKU/партия → возврат, УКД и восстановление корректного остатка.</p>
                </div>
                <div className="process-callout">
                    <strong>Технический минимум каждого сообщения</strong>
                    <span>event_id, idempotency_key, source_document_id, timestamp, payload_version, статус, текст ошибки и идентификатор документа 1С.</span>
                </div>
                <div className="process-grid process-grid-2">
                    <RuleCard title="Единый реестр внешних документов" tone="teal">
                        <DetailList items={[
                            'Внутренняя операция, вид и версия документа',
                            'Организация, контрагент, номер, дата и сумма',
                            'Diadoc MessageId / EntityId и идентификатор 1С',
                            'Система-отправитель, статус, хеш содержимого и последняя ошибка',
                        ]} />
                    </RuleCard>
                    <RuleCard title="Один активный отправитель" tone="orange">
                        <p>Для каждого типа документа назначается один контур отправки. Второй контур получает внешний ID и статус, но не отправляет тот же документ повторно.</p>
                    </RuleCard>
                </div>
                <Flow steps={[
                    { title: 'Сформировать ключ', text: 'shipment:1258:UPD:version-1', system: 'dz' },
                    { title: 'Захватить блокировку', text: 'Уникальная запись до отправки', system: 'dz', tone: 'orange' },
                    { title: 'Отправить один раз', text: '1С или платформа → Диадок', system: 'external' },
                    { title: 'Сохранить результат', text: 'MessageId, EntityId и статус', system: 'dz', tone: 'teal' },
                ]} />
                <div className="process-warning">
                    <strong>Исправление не считается дублем исходного документа.</strong>
                    Для УКД, исправления или новой редакции создаётся следующая версия с собственным ключом и явной ссылкой на основание.
                </div>
            </ProcessSection>

            <ProcessSection
                {...sectionProps('operating-cycle')}
                kicker="12 · Итог"
                title="Полный операционный цикл"
                summary="Итоговая последовательность для команды разработки и сотрудников склада."
            >
                <div className="process-timeline">
                    {[
                        ['01', 'Обновить источники', 'Поставщики, собственный остаток, документы и статусы ЭДО попадают в платформу.'],
                        ['02', 'Сформировать клиентские предложения', 'Фильтры, наценки и подтверждённые кроссы создают персональный снимок прайса.'],
                        ['03', 'Принять заказ', 'Сохраняется строка клиента и выбирается фактический источник исполнения.'],
                        ['04', 'Зарезервировать', 'Наш оригинал резервируется напрямую; DragonZap — как материал волны; cross-docking — в заказ поставщику.'],
                        ['05', 'Получить cross-docking', 'Подтверждение, поступление, документы, партии и доступные КИЗ связываются с заказом.'],
                        ['06', 'Запустить волну DragonZap', 'Автоматически по отсечке или вручную формируется агрегированное задание выпуска.'],
                        ['07', 'Автоматически напечатать этикетки', 'До упаковки система рассчитывает количество этикеток 58 × 40; доступна повторная печать.'],
                        ['08', 'Собрать клиентские коробки', 'Склад объединяет прямой остаток, DragonZap и cross-docking по внутренним штрихкодам строк.'],
                        ['09', 'Создать реализацию и УПД', 'Платформа передаёт факт в 1С, 1С проводит документ и формирует формализованный УПД.'],
                        ['10', 'Отправить ЭДО и закрыть заказ', 'Диадок и ГИС МТ возвращают статусы, платформа показывает завершение или исключение.'],
                        ['11', 'Обработать возврат', 'Клиентская позиция возвращается к фактическому SKU и партии; при необходимости формируется УКД.'],
                    ].map(([number, title, text]) => (
                        <div className="process-timeline-item" key={number}>
                            <span>{number}</span><div><strong>{title}</strong><p>{text}</p></div>
                        </div>
                    ))}
                </div>
                <div className="process-final-principles">
                    <strong>Неизменяемые принципы модели</strong>
                    <Tag color="volcano">Заказ клиента не переписываем</Tag>
                    <Tag color="cyan">Cross-docking без производства</Tag>
                    <Tag color="gold">Этикетка до упаковки</Tag>
                    <Tag color="blue">Факт учёта в 1С</Tag>
                    <Tag color="green">Партия и КИЗ прослеживаются</Tag>
                    <Tag color="orange">Роль фиксируется в партии</Tag>
                    <Tag color="geekblue">Один отправитель ЭДО</Tag>
                </div>
                <div className="process-grid process-grid-3">
                    <RuleCard title="Пилот 1 · материал и выпуск" tone="orange">
                        <p>Один поставщик, одна группа DragonZap и несколько партий с разной себестоимостью: приёмка, резерв, волна, этикетка и возврат.</p>
                    </RuleCard>
                    <RuleCard title="Пилот 2 · cross-docking" tone="teal">
                        <p>Один клиентский заказ с документом и без него: быстрая приёмка, клиентская этикетка, общая сборка и контроль DOC_PENDING.</p>
                    </RuleCard>
                    <RuleCard title="Пилот 3 · 1С и ЭДО" tone="plain">
                        <p>Поступление, выпуск, реализация, УПД и УКД проходят повторяемый обмен без дублей с возвратом статусов в платформу.</p>
                    </RuleCard>
                </div>
            </ProcessSection>

            <Modal
                open={Boolean(commentDraft)}
                title={`Комментарий · ${SECTION_TITLES[commentDraft?.sectionKey] || ''}`}
                okText="Сохранить"
                cancelText="Отмена"
                confirmLoading={savingComment}
                okButtonProps={{ disabled: !commentText.trim() }}
                onOk={saveComment}
                onCancel={() => {
                    setCommentDraft(null);
                    setCommentText('');
                }}
            >
                <p className="process-modal-help">Комментарий появится в выбранной точке и будет виден всем сотрудникам.</p>
                <Input.TextArea value={commentText} onChange={(event) => setCommentText(event.target.value)} rows={5} maxLength={4000} showCount autoFocus />
            </Modal>

            <Drawer
                open={discussionOpen}
                title={selectedThread ? SECTION_TITLES[selectedThread.section_key] : 'Обсуждения схемы'}
                width={520}
                onClose={() => {
                    setDiscussionOpen(false);
                    setReplyText('');
                }}
            >
                {selectedThread ? (
                    <div className="process-thread">
                        <Button type="link" className="process-thread-back" onClick={() => setSelectedThreadId(null)}>← Все обсуждения</Button>
                        <article className={`process-thread-message${selectedThread.is_resolved ? ' is-resolved' : ''}`}>
                            <div><strong>{authorName(selectedThread)}</strong><span>{formatDate(selectedThread.created_at)}</span></div>
                            <p>{selectedThread.content}</p>
                            {canManage(selectedThread) && (
                                <div className="process-thread-actions">
                                    <Button size="small" icon={<CheckCircleOutlined />} onClick={() => void toggleResolved(selectedThread)}>
                                        {selectedThread.is_resolved ? 'Вернуть в работу' : 'Отметить решённым'}
                                    </Button>
                                    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => void removeAnnotation(selectedThread)}>Удалить</Button>
                                </div>
                            )}
                        </article>
                        <div className="process-replies">
                            {selectedReplies.map((reply) => (
                                <article key={reply.id} className="process-thread-message process-thread-reply">
                                    <div><strong>{authorName(reply)}</strong><span>{formatDate(reply.created_at)}</span></div>
                                    <p>{reply.content}</p>
                                    {canManage(reply) && <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => void removeAnnotation(reply)} />}
                                </article>
                            ))}
                        </div>
                        <div className="process-reply-box">
                            <Input.TextArea rows={3} value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="Ответить в обсуждении…" maxLength={4000} />
                            <Button type="primary" loading={replying} disabled={!replyText.trim()} onClick={sendReply}>Отправить ответ</Button>
                        </div>
                    </div>
                ) : roots.length ? (
                    <div className="process-discussion-list">
                        {roots.slice().reverse().map((annotation) => (
                            <button key={annotation.id} type="button" onClick={() => setSelectedThreadId(annotation.id)} className={annotation.is_resolved ? 'is-resolved' : ''}>
                                <span>{SECTION_TITLES[annotation.section_key] || annotation.section_key}</span>
                                <strong>{annotation.content}</strong>
                                <small>{authorName(annotation)} · {formatDate(annotation.created_at)}</small>
                            </button>
                        ))}
                        {annotations.filter((item) => item.kind === 'drawing').length > 0 && (
                            <div className="process-drawing-history">
                                <h3>Сохранённые рисунки</h3>
                                {annotations.filter((item) => item.kind === 'drawing').map((drawing) => (
                                    <div key={drawing.id}>
                                        <span>{SECTION_TITLES[drawing.section_key]} · {authorName(drawing)}</span>
                                        {canManage(drawing) && <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => void removeAnnotation(drawing)} />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : <Empty description="Обсуждений пока нет" />}
            </Drawer>
        </div>
    );
};

export default ProcessArchitecturePage;
