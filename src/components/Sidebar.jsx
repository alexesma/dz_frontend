import React, { useState } from 'react';
import { Button, Drawer, Grid, Layout, Menu } from 'antd';
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
} from '@ant-design/icons';
import useAuth from '../context/useAuth';

const { Sider } = Layout;
const { useBreakpoint } = Grid;

const Sidebar = () => {
    const { user, loading, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const screens = useBreakpoint();
    const [mobileOpen, setMobileOpen] = useState(false);

    if (loading || !user) {
        return null;
    }

    const handleLogout = async () => {
        setMobileOpen(false);
        await logout();
        navigate('/login');
    };

    const selectedKey = (() => {
        const path = location.pathname;
        if (path.startsWith('/restock')) return '2';
        if (path.startsWith('/orders/tracking')) return 'orders-tracking';
        if (path.startsWith('/orders')) return '3';
        if (path.startsWith('/customer-orders/suppliers')) return 'customer-supplier-orders';
        if (path.startsWith('/customer-orders/receipts')) return 'supplier-receipts';
        if (path.startsWith('/customer-orders/stock')) return 'stock-orders';
        if (path.startsWith('/documents/incoming')) return 'documents-incoming';
        if (path.startsWith('/documents/outgoing')) return 'documents-outgoing';
        if (path.startsWith('/customer-orders')) return 'customer-orders';
        if (path.startsWith('/providers') || path.startsWith('/provider-configs')) return '4';
        if (path.startsWith('/customers')) return 'customers';
        if (path.startsWith('/substitutions')) return 'substitutions';
        if (path.startsWith('/autoparts/offers')) return 'autopart-offers';
        if (path.startsWith('/watchlist')) return 'watchlist';
        if (path.startsWith('/autoparts/price-history')) return 'autopart-price-history';
        if (path.startsWith('/admin/users')) return 'admin-users';
        if (path.startsWith('/admin/email-accounts')) return 'admin-emails';
        if (path.startsWith('/admin/settings')) return 'admin-settings';
        if (path.startsWith('/admin/price-control')) return 'admin-price-control';
        if (path.startsWith('/admin/brands')) return 'admin-brands';
        if (path.startsWith('/admin/order-status-mappings')) return 'admin-order-status-mappings';
        if (path.startsWith('/admin/monitor')) return 'admin-monitor';
        if (path.startsWith('/admin/order-windows')) return 'admin-order-windows';
        if (path.startsWith('/inbox')) return 'inbox';
        return '1';
    })();

    const renderMenu = () => (
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
            <Menu.Item key="2">
                <Link to="/restock">Формирование заказов</Link>
            </Menu.Item>
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
                key="autopart-search"
                icon={<SearchOutlined />}
                title="Поиск позиций по артикулу"
            >
                <Menu.Item key="autopart-offers">
                    <Link to="/autoparts/offers">Прайсы по артикулу</Link>
                </Menu.Item>
                <Menu.Item key="orders-tracking" icon={<SendOutlined />}>
                    <Link to="/orders/tracking">Отслеживание наших заказов</Link>
                </Menu.Item>
                <Menu.Item
                    key="autopart-price-history"
                    icon={<LineChartOutlined />}
                >
                    <Link to="/autoparts/price-history">График цен</Link>
                </Menu.Item>
            </Menu.SubMenu>
            <Menu.Item key="watchlist" icon={<EyeOutlined />}>
                <Link to="/watchlist">Отслеживание позиций</Link>
            </Menu.Item>
            <Menu.Item key="inbox" icon={<MailOutlined />}>
                <Link to="/inbox">Входящие письма</Link>
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
            <Menu.Item key="logout" onClick={handleLogout}>
                Выйти
            </Menu.Item>
        </Menu>
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
