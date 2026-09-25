import React, { useState } from 'react';
import { AutoComplete, Button, Drawer, Grid, Layout, Menu } from 'antd';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    TeamOutlined,
    SwapOutlined,
    SearchOutlined,
    LineChartOutlined,
    UserOutlined,
    InboxOutlined,
    SendOutlined,
    SettingOutlined,
    EyeOutlined,
    BarChartOutlined,
    DollarOutlined,
    MenuOutlined,
    TagsOutlined,
    MailOutlined,
    ClockCircleOutlined,
    DatabaseOutlined,
    AuditOutlined,
    FileAddOutlined,
    QrcodeOutlined,
    RetweetOutlined,
    ExceptionOutlined,
    RollbackOutlined,
    LockOutlined,
    FileDoneOutlined,
    UnorderedListOutlined,
    TableOutlined,
    CloudSyncOutlined,
    CloseOutlined,
    BarcodeOutlined,
    ApartmentOutlined,
    ExperimentOutlined,
    FileSearchOutlined,
} from '@ant-design/icons';
import useAuth from '../context/useAuth';

const { Sider } = Layout;
const { useBreakpoint } = Grid;

const NAVIGATION_SEARCH_ITEMS = [
    { path: '/', title: 'Dashboard', section: 'Главная', keywords: 'дашборд сводка показатели статистика' },
    { path: '/autoparts/nomenclature', title: 'Номенклатура', section: 'Запчасти', keywords: 'товар карточка артикул oem фото описание parts soft' },
    { path: '/autoparts/certificates', title: 'Сертификаты', section: 'Запчасти', keywords: 'еас декларация соответствие фгис ссылка документ' },
    { path: '/autoparts/regulatory', title: 'Реквизиты прайса', section: 'Запчасти', keywords: 'тн вэд окпд честный знак сертификат маркировка автохимия масло ароматизатор' },
    { path: '/autoparts/crosses', title: 'Кроссы', section: 'Запчасти', keywords: 'аналоги замены соответствия артикул' },
    { path: '/autoparts/invalid-crosses', title: 'Неверные кроссы', section: 'Запчасти', keywords: 'ошибочные аналоги исключения' },
    { path: '/autoparts/offers', title: 'Прайсы по артикулу', section: 'Запчасти', keywords: 'предложения цены остатки поставщики поиск' },
    { path: '/autoparts/labels', title: 'Печать этикеток', section: 'Запчасти', keywords: 'штрихкод наклейка barcode' },
    { path: '/orders/tracking', title: 'Отслеживание заказов', section: 'Запчасти', keywords: 'трек доставка статус' },
    { path: '/watchlist', title: 'Отслеживаемые позиции', section: 'Запчасти', keywords: 'наблюдение мониторинг артикул' },
    { path: '/orders/autopurchase', title: 'Автозаказ', section: 'Запчасти', keywords: 'автоматическая закупка обработка' },
    { path: '/orders/autopurchase-top', title: 'Топ для автозаказа', section: 'Запчасти', keywords: 'рейтинг продажи закупка' },
    { path: '/orders/customer-order-period-report', title: 'Отчёт по заказам', section: 'Запчасти', keywords: 'период аналитика продажи клиенты' },
    { path: '/orders/inventory-control', title: 'Контроль запасов', section: 'Запчасти', keywords: 'остатки дефицит склад пополнение' },
    { path: '/orders/exceptions', title: 'Очередь исключений', section: 'Запчасти', keywords: 'ошибки автозаказ проверка' },
    { path: '/autoparts/price-history', title: 'График цен', section: 'Запчасти', keywords: 'история динамика прайс аналитика' },
    { path: '/orders', title: 'Заказы поставщикам', section: 'Заказы', keywords: 'закупка поставщик отправка заказ' },
    { path: '/customer-orders', title: 'Заказы клиентов', section: 'Заказы', keywords: 'продажи покупатели parts soft сайт dragonzap почта' },
    { path: '/customer-orders/suppliers', title: 'Клиентские заказы → поставщики', section: 'Заказы', keywords: 'распределение закупка обработка' },
    { path: '/customer-orders/stock', title: 'Наш склад: заказы', section: 'Заказы', keywords: 'резерв наличие выдача' },
    { path: '/customer-orders/receipts', title: 'Поступления от поставщиков', section: 'Заказы', keywords: 'приемка приход накладная поставка' },
    { path: '/documents/incoming', title: 'Входящие документы', section: 'Документы', keywords: 'упд накладная эдо получение' },
    { path: '/documents/outgoing', title: 'Исходящие документы', section: 'Документы', keywords: 'упд накладная эдо отправка' },
    { path: '/documents/diadoc', title: 'Диадок', section: 'Документы', keywords: 'эдо контур упд', roles: ['admin'] },
    { path: '/documents/1c', title: 'Обмен с 1С', section: 'Документы', keywords: 'интеграция выгрузка загрузка синхронизация', roles: ['admin'] },
    { path: '/providers', title: 'Поставщики', section: 'Контрагенты', keywords: 'прайсы закупки инн реквизиты объединение' },
    { path: '/customers', title: 'Клиенты', section: 'Контрагенты', keywords: 'покупатели опт розница инн реквизиты объединение' },
    { path: '/substitutions', title: 'Подмены', section: 'Контрагенты', keywords: 'замена клиент поставщик' },
    { path: '/warehouse/storage', title: 'Склады и ячейки', section: 'Склад', keywords: 'места хранения адрес стеллаж' },
    { path: '/warehouse/inventory', title: 'Инвентаризация', section: 'Склад', keywords: 'пересчет остатки ревизия' },
    { path: '/warehouse/stock-documents', title: 'Оприходование / Списание', section: 'Склад', keywords: 'приход расход корректировка' },
    { path: '/warehouse/overview', title: 'Остатки (обзор)', section: 'Склад', keywords: 'наличие запасы количество' },
    { path: '/warehouse/movements', title: 'Движения товаров', section: 'Склад', keywords: 'история приход расход перемещение' },
    { path: '/warehouse/marking', title: 'Маркировка', section: 'Склад', keywords: 'честный знак киз код data matrix гис мт автохимия масло ароматизатор' },
    { path: '/warehouse/reserves', title: 'Резервы', section: 'Склад', keywords: 'бронь заказ наличие' },
    { path: '/warehouse/shipments', title: 'Накладные на отгрузку', section: 'Склад', keywords: 'реализация выдача отправка клиенту' },
    { path: '/warehouse/profit-report', title: 'Валовая прибыль', section: 'Склад', keywords: 'маржа рентабельность отчет' },
    { path: '/warehouse/returns', title: 'Возвраты', section: 'Склад', keywords: 'возврат клиент поставщик' },
    { path: '/reclamations', title: 'Рекламации', section: 'Склад', keywords: 'претензия брак возврат', roles: ['admin', 'reclamation'] },
    { path: '/warehouse/lots', title: 'Партии / ГТД', section: 'Склад', keywords: 'таможня декларация страна происхождения' },
    { path: '/warehouse/production-groups', title: 'Группы выпуска DragonZap', section: 'Склад', keywords: 'производство комплект сборка' },
    { path: '/warehouse/production-waves', title: 'Волны выпуска DragonZap', section: 'Склад', keywords: 'производство план выпуск' },
    { path: '/warehouse/transfer', title: 'Перемещение', section: 'Склад', keywords: 'между складами ячейками перенос' },
    { path: '/inbox', title: 'Входящие письма', section: 'Почта', keywords: 'email почта вложения прайсы заказы' },
    { path: '/finance', title: 'Финансы', section: 'Финансы', keywords: 'счета оплаты задолженность деньги' },
    { path: '/process-architecture', title: 'Карта процессов', section: 'Система', keywords: 'схема интеграции архитектура обмен' },
    { path: '/admin/users', title: 'Пользователи', section: 'Админ', keywords: 'сотрудники роли доступ', roles: ['admin'] },
    { path: '/admin/email-accounts', title: 'Почты', section: 'Админ', keywords: 'email smtp imap relay аккаунты', roles: ['admin'] },
    { path: '/admin/settings', title: 'Настройки', section: 'Админ', keywords: 'параметры система интеграции', roles: ['admin'] },
    { path: '/admin/price-control', title: 'Контроль цен', section: 'Админ', keywords: 'прайс отклонения скачки проверка', roles: ['admin'] },
    { path: '/admin/customer-pricelists', title: 'Прайсы клиентов', section: 'Админ', keywords: 'рассылка фильтры наценка публикация', roles: ['admin'] },
    { path: '/admin/brands', title: 'Бренды', section: 'Админ', keywords: 'марки производители синонимы', roles: ['admin'] },
    { path: '/admin/order-status-mappings', title: 'Статусы заказов', section: 'Админ', keywords: 'сопоставление состояния parts soft', roles: ['admin'] },
    { path: '/admin/monitor', title: 'Мониторинг', section: 'Админ', keywords: 'задания ошибки журнал здоровье relay', roles: ['admin'] },
    { path: '/admin/order-windows', title: 'Окна заказов', section: 'Админ', keywords: 'расписание время закупки', roles: ['admin'] },
    { path: '/restock', title: 'Формирование заказов', section: 'Заказы', keywords: 'пополнение закупка предложение поставщик' },
];

const normalizeNavigationSearch = (value) => String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .trim();

const Sidebar = () => {
    const { user, loading, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const screens = useBreakpoint();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [navigationQuery, setNavigationQuery] = useState('');

    if (loading || !user) {
        return null;
    }

    const handleLogout = async () => {
        setMobileOpen(false);
        await logout();
        navigate('/login');
    };

    const navigationTokens = normalizeNavigationSearch(navigationQuery)
        .split(/\s+/)
        .filter(Boolean);
    const navigationOptions = navigationTokens.length
        ? NAVIGATION_SEARCH_ITEMS
            .filter((item) => !item.roles || item.roles.includes(user.role))
            .filter((item) => {
                const searchText = normalizeNavigationSearch(
                    `${item.title} ${item.section} ${item.keywords}`
                );
                return navigationTokens.every((token) => searchText.includes(token));
            })
            .slice(0, 12)
            .map((item) => ({
                value: item.path,
                label: (
                    <div className="app-navigation-search-option">
                        <span>{item.title}</span>
                        <span>{item.section}</span>
                    </div>
                ),
            }))
        : [];

    const handleNavigationSelect = (path) => {
        setNavigationQuery('');
        setMobileOpen(false);
        navigate(path);
    };

    const selectedKey = (() => {
        const path = location.pathname;
        if (path.startsWith('/restock')) return '2';
        if (path.startsWith('/orders/autopurchase-top')) return 'orders-autopurchase-top';
        if (path.startsWith('/orders/customer-order-period-report')) return 'orders-customer-order-period-report';
        if (path.startsWith('/orders/autopurchase')) return 'orders-autopurchase';
        if (path.startsWith('/orders/inventory-control')) return 'orders-inventory-control';
        if (path.startsWith('/orders/exceptions')) return 'orders-exceptions';
        if (path.startsWith('/orders/tracking')) return 'orders-tracking';
        if (path.startsWith('/orders')) return '3';
        if (path.startsWith('/customer-orders/suppliers')) return 'customer-supplier-orders';
        if (path.startsWith('/customer-orders/receipts')) return 'supplier-receipts';
        if (path.startsWith('/customer-orders/stock')) return 'stock-orders';
        if (path.startsWith('/documents/incoming')) return 'documents-incoming';
        if (path.startsWith('/documents/outgoing')) return 'documents-outgoing';
        if (path.startsWith('/documents/diadoc')) return 'documents-diadoc';
        if (path.startsWith('/documents/1c')) return 'documents-1c';
        if (path.startsWith('/customer-orders')) return 'customer-orders';
        if (path.startsWith('/providers') || path.startsWith('/provider-configs')) return '4';
        if (path.startsWith('/customers')) return 'customers';
        if (path.startsWith('/substitutions')) return 'substitutions';
        if (path.startsWith('/autoparts/labels')) return 'autopart-labels';
        if (path.startsWith('/autoparts/offers')) return 'autopart-offers';
        if (path.startsWith('/autoparts/invalid-crosses')) return 'autopart-invalid-crosses';
        if (path.startsWith('/autoparts/crosses')) return 'autopart-crosses';
        if (path.startsWith('/autoparts/certificates')) return 'autoparts-certificates';
        if (path.startsWith('/autoparts/regulatory')) return 'autoparts-regulatory';
        if (path.startsWith('/autoparts/nomenclature')) return 'autopart-nomenclature';
        if (path.startsWith('/watchlist')) return 'watchlist';
        if (path.startsWith('/autoparts/price-history')) return 'autopart-price-history';
        if (path.startsWith('/admin/users')) return 'admin-users';
        if (path.startsWith('/admin/email-accounts')) return 'admin-emails';
        if (path.startsWith('/admin/settings')) return 'admin-settings';
        if (path.startsWith('/admin/price-control')) return 'admin-price-control';
        if (path.startsWith('/admin/customer-pricelists')) return 'admin-customer-pricelists';
        if (path.startsWith('/admin/brands')) return 'admin-brands';
        if (path.startsWith('/admin/order-status-mappings')) return 'admin-order-status-mappings';
        if (path.startsWith('/admin/monitor')) return 'admin-monitor';
        if (path.startsWith('/admin/order-windows')) return 'admin-order-windows';
        if (path.startsWith('/inbox')) return 'inbox';
        if (path.startsWith('/warehouse/stock-documents')) return 'warehouse-stock-documents';
        if (path.startsWith('/warehouse/storage')) return 'warehouse-storage';
        if (path.startsWith('/warehouse/inventory')) return 'warehouse-inventory';
        if (path.startsWith('/warehouse/movements')) return 'warehouse-movements';
        if (path.startsWith('/warehouse/marking')) return 'warehouse-marking';
        if (path.startsWith('/warehouse/reserves')) return 'warehouse-reserves';
        if (path.startsWith('/warehouse/profit-report')) return 'warehouse-profit-report';
        if (path.startsWith('/warehouse/shipments')) return 'warehouse-shipments';
        if (path.startsWith('/warehouse/returns')) return 'warehouse-returns';
        if (path.startsWith('/reclamations')) return 'reclamations';
        if (path.startsWith('/warehouse/lots')) return 'warehouse-lots';
        if (path.startsWith('/warehouse/production-groups')) return 'warehouse-production-groups';
        if (path.startsWith('/warehouse/production-waves')) return 'warehouse-production-waves';
        if (path.startsWith('/warehouse/transfer')) return 'warehouse-transfer';
        if (path.startsWith('/warehouse/overview')) return 'warehouse-overview';
        if (path.startsWith('/finance')) return 'finance';
        if (path.startsWith('/process-architecture')) return 'process-architecture';
        return '1';
    })();

    const renderMenu = () => (
        <>
            <div className="app-navigation-search">
                <SearchOutlined className="app-navigation-search-icon" />
                <AutoComplete
                    allowClear
                    value={navigationQuery}
                    options={navigationOptions}
                    placeholder="Найти раздел…"
                    notFoundContent={navigationTokens.length ? 'Раздел не найден' : null}
                    filterOption={false}
                    onChange={setNavigationQuery}
                    onSelect={handleNavigationSelect}
                    aria-label="Поиск по разделам"
                />
            </div>
            <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            defaultOpenKeys={['autopart-search']}
            theme="dark"
            className="app-sider-menu"
            onClick={() => {
                if (!screens.lg) {
                    setMobileOpen(false);
                }
            }}
            >
            <Menu.Item key="1">
                <Link to="/">Dashboard</Link>
            </Menu.Item>
            <Menu.SubMenu
                key="autopart-search"
                icon={<SearchOutlined />}
                title="Запчасти"
            >
                <Menu.Item key="autopart-nomenclature">
                    <Link to="/autoparts/nomenclature">Номенклатура</Link>
                </Menu.Item>
                <Menu.Item key="autoparts-certificates">
                    <Link to="/autoparts/certificates">Сертификаты</Link>
                </Menu.Item>
                <Menu.Item key="autoparts-regulatory">
                    <Link to="/autoparts/regulatory">Реквизиты прайса</Link>
                </Menu.Item>
                <Menu.Item key="autopart-crosses" icon={<TagsOutlined />}>
                    <Link to="/autoparts/crosses">Кроссы</Link>
                </Menu.Item>
                <Menu.Item key="autopart-invalid-crosses" icon={<CloseOutlined />}>
                    <Link to="/autoparts/invalid-crosses">Неверные кроссы</Link>
                </Menu.Item>
                <Menu.Item key="autopart-offers">
                    <Link to="/autoparts/offers">Прайсы по артикулу</Link>
                </Menu.Item>
                <Menu.Item key="autopart-labels" icon={<BarcodeOutlined />}>
                    <Link to="/autoparts/labels">Печать этикеток</Link>
                </Menu.Item>
                <Menu.Item key="orders-tracking" icon={<SendOutlined />}>
                    <Link to="/orders/tracking">Отслеживание заказов</Link>
                </Menu.Item>
                <Menu.Item key="watchlist" icon={<EyeOutlined />}>
                    <Link to="/watchlist">Отслеживаемые позиции</Link>
                </Menu.Item>
                <Menu.Item key="orders-autopurchase" icon={<ClockCircleOutlined />}>
                    <Link to="/orders/autopurchase">Автозаказ</Link>
                </Menu.Item>
                <Menu.Item key="orders-autopurchase-top" icon={<TableOutlined />}>
                    <Link to="/orders/autopurchase-top">Топ для автозаказа</Link>
                </Menu.Item>
                <Menu.Item key="orders-customer-order-period-report" icon={<BarChartOutlined />}>
                    <Link to="/orders/customer-order-period-report">Отчёт по заказам</Link>
                </Menu.Item>
                <Menu.Item key="orders-inventory-control" icon={<LineChartOutlined />}>
                    <Link to="/orders/inventory-control">Контроль запасов</Link>
                </Menu.Item>
                <Menu.Item key="orders-exceptions" icon={<AuditOutlined />}>
                    <Link to="/orders/exceptions">Очередь исключений</Link>
                </Menu.Item>
                <Menu.Item
                    key="autopart-price-history"
                    icon={<LineChartOutlined />}
                >
                    <Link to="/autoparts/price-history">График цен</Link>
                </Menu.Item>
            </Menu.SubMenu>
            <Menu.Item key="3">
                <Link to="/orders">Заказы поставщикам</Link>
            </Menu.Item>
            <Menu.Item key="customer-orders" icon={<InboxOutlined />}>
                <Link to="/customer-orders">Заказы клиентов</Link>
            </Menu.Item>
            <Menu.Item key="customer-supplier-orders" icon={<SendOutlined />}>
                <Link to="/customer-orders/suppliers">Клиентские заказы → поставщики</Link>
            </Menu.Item>
            <Menu.Item key="stock-orders" icon={<InboxOutlined />}>
                <Link to="/customer-orders/stock">Наш склад: заказы</Link>
            </Menu.Item>
            <Menu.Item key="supplier-receipts" icon={<InboxOutlined />}>
                <Link to="/customer-orders/receipts">Поступления от поставщиков</Link>
            </Menu.Item>
            <Menu.SubMenu
                key="documents"
                icon={<InboxOutlined />}
                title="Документы"
            >
                <Menu.Item key="documents-incoming" icon={<InboxOutlined />}>
                    <Link to="/documents/incoming">Входящие</Link>
                </Menu.Item>
                <Menu.Item key="documents-outgoing" icon={<SendOutlined />}>
                    <Link to="/documents/outgoing">Исходящие</Link>
                </Menu.Item>
                {user.role === 'admin' && (
                    <Menu.Item key="documents-diadoc" icon={<CloudSyncOutlined />}>
                        <Link to="/documents/diadoc">Диадок</Link>
                    </Menu.Item>
                )}
                {user.role === 'admin' && (
                    <Menu.Item key="documents-1c" icon={<DatabaseOutlined />}>
                        <Link to="/documents/1c">Обмен с 1С</Link>
                    </Menu.Item>
                )}
            </Menu.SubMenu>
            <Menu.Item key="4">
                <Link to="/providers">Поставщики</Link>
            </Menu.Item>
            <Menu.Item key="customers" icon={<TeamOutlined />}>
                <Link to="/customers">Клиенты</Link>
            </Menu.Item>
            <Menu.Item key="substitutions" icon={<SwapOutlined />}>
                <Link to="/substitutions">Подмены</Link>
            </Menu.Item>
            <Menu.SubMenu
                key="warehouse"
                icon={<DatabaseOutlined />}
                title="Склад"
            >
                <Menu.Item key="warehouse-storage" icon={<DatabaseOutlined />}>
                    <Link to="/warehouse/storage">Склады и ячейки</Link>
                </Menu.Item>
                <Menu.Item key="warehouse-inventory" icon={<AuditOutlined />}>
                    <Link to="/warehouse/inventory">Инвентаризация</Link>
                </Menu.Item>
                <Menu.Item key="warehouse-stock-documents" icon={<FileAddOutlined />}>
                    <Link to="/warehouse/stock-documents">Оприходование / Списание</Link>
                </Menu.Item>
                <Menu.Item key="warehouse-overview" icon={<TableOutlined />}>
                    <Link to="/warehouse/overview">Остатки (обзор)</Link>
                </Menu.Item>
                <Menu.Item key="warehouse-movements" icon={<RetweetOutlined />}>
                    <Link to="/warehouse/movements">Движения товаров</Link>
                </Menu.Item>
                <Menu.Item key="warehouse-marking" icon={<QrcodeOutlined />}>
                    <Link to="/warehouse/marking">Маркировка</Link>
                </Menu.Item>
                <Menu.Item key="warehouse-reserves" icon={<LockOutlined />}>
                    <Link to="/warehouse/reserves">Резервы</Link>
                </Menu.Item>
                <Menu.Item key="warehouse-shipments" icon={<FileDoneOutlined />}>
                    <Link to="/warehouse/shipments">Накладные на отгрузку</Link>
                </Menu.Item>
                <Menu.Item key="warehouse-profit-report" icon={<BarChartOutlined />}>
                    <Link to="/warehouse/profit-report">Валовая прибыль</Link>
                </Menu.Item>
                <Menu.Item key="warehouse-returns" icon={<RollbackOutlined />}>
                    <Link to="/warehouse/returns">Возвраты</Link>
                </Menu.Item>
                {['admin', 'reclamation'].includes(user.role) && (
                    <Menu.Item key="reclamations" icon={<ExceptionOutlined />}>
                        <Link to="/reclamations">Рекламации</Link>
                    </Menu.Item>
                )}
                <Menu.Item key="warehouse-lots" icon={<UnorderedListOutlined />}>
                    <Link to="/warehouse/lots">Партии / ГТД</Link>
                </Menu.Item>
                <Menu.Item key="warehouse-production-groups" icon={<ApartmentOutlined />}>
                    <Link to="/warehouse/production-groups">Группы выпуска DragonZap</Link>
                </Menu.Item>
                <Menu.Item key="warehouse-production-waves" icon={<ExperimentOutlined />}>
                    <Link to="/warehouse/production-waves">Волны выпуска DragonZap</Link>
                </Menu.Item>
                <Menu.Item key="warehouse-transfer" icon={<SwapOutlined />}>
                    <Link to="/warehouse/transfer">Перемещение</Link>
                </Menu.Item>
            </Menu.SubMenu>
            <Menu.Item key="inbox" icon={<MailOutlined />}>
                <Link to="/inbox">Входящие письма</Link>
            </Menu.Item>
            <Menu.Item key="finance" icon={<DollarOutlined />}>
                <Link to="/finance">Финансы</Link>
            </Menu.Item>
            <Menu.Item key="process-architecture" icon={<ApartmentOutlined />}>
                <Link to="/process-architecture">Карта процессов</Link>
            </Menu.Item>
            {user.role === 'admin' && (
                <Menu.SubMenu
                    key="admin"
                    icon={<SettingOutlined />}
                    title="Админ"
                >
                    <Menu.Item key="admin-users" icon={<UserOutlined />}>
                        <Link to="/admin/users">Пользователи</Link>
                    </Menu.Item>
                    <Menu.Item key="admin-emails" icon={<UserOutlined />}>
                        <Link to="/admin/email-accounts">Почты</Link>
                    </Menu.Item>
                    <Menu.Item key="admin-settings" icon={<SettingOutlined />}>
                        <Link to="/admin/settings">Настройки</Link>
                    </Menu.Item>
                    <Menu.Item key="admin-price-control" icon={<DollarOutlined />}>
                        <Link to="/admin/price-control">Контроль цен</Link>
                    </Menu.Item>
                    <Menu.Item key="admin-customer-pricelists" icon={<FileSearchOutlined />}>
                        <Link to="/admin/customer-pricelists">Прайсы клиентов</Link>
                    </Menu.Item>
                    <Menu.Item key="admin-brands" icon={<TagsOutlined />}>
                        <Link to="/admin/brands">Бренды</Link>
                    </Menu.Item>
                    <Menu.Item key="admin-order-status-mappings" icon={<TagsOutlined />}>
                        <Link to="/admin/order-status-mappings">Статусы заказов</Link>
                    </Menu.Item>
                    <Menu.Item key="admin-monitor" icon={<BarChartOutlined />}>
                        <Link to="/admin/monitor">Мониторинг</Link>
                    </Menu.Item>
                    <Menu.Item key="admin-order-windows" icon={<ClockCircleOutlined />}>
                        <Link to="/admin/order-windows">Окна заказов</Link>
                    </Menu.Item>
                </Menu.SubMenu>
            )}
            <Menu.Item key="2">
                <Link to="/restock">Формирование заказов</Link>
            </Menu.Item>
            <Menu.Item key="logout" onClick={handleLogout}>
                Выйти
            </Menu.Item>
            </Menu>
        </>
    );

    if (!screens.lg) {
        return (
            <>
                <Button
                    type="primary"
                    shape="circle"
                    icon={<MenuOutlined />}
                    className="app-mobile-nav-trigger"
                    onClick={() => setMobileOpen(true)}
                />
                <Drawer
                    open={mobileOpen}
                    placement="left"
                    onClose={() => setMobileOpen(false)}
                    width={280}
                    className="app-mobile-drawer"
                    styles={{ body: { padding: 0, background: '#001529' } }}
                    title="Навигация"
                >
                    {renderMenu()}
                </Drawer>
            </>
        );
    }

    return (
        <Sider
            width={250}
            breakpoint="lg"
            collapsedWidth={80}
            className="app-sider"
        >
            <div className="app-sider-inner">
                {renderMenu()}
            </div>
        </Sider>
    );
};

export default Sidebar;
