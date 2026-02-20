import React from 'react';
import { Layout, Menu } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { TeamOutlined, SwapOutlined, SearchOutlined, LineChartOutlined, UserOutlined } from '@ant-design/icons';
import useAuth from '../context/useAuth';

const { Sider } = Layout;

const Sidebar = () => {
    const { user, loading, logout } = useAuth();
    const navigate = useNavigate();

    if (loading || !user) {
        return null;
    }

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <Sider width={250}>
            <Menu mode="inline" defaultSelectedKeys={['1']} theme="dark">
                <Menu.Item key="1">
                    <Link to="/">Dashboard</Link>
                </Menu.Item>
                <Menu.Item key="2">
                    <Link to="/restock">Формирование заказов</Link>
                </Menu.Item>
                <Menu.Item key="3">
                    <Link to="/orders">Заказы поставщикам</Link>
                </Menu.Item>
                <Menu.Item key="4">
                    <Link to="/providers">Поставщики</Link>
                </Menu.Item>
                <Menu.Item key="customers" icon={<TeamOutlined />}>
                    <Link to="/customers">Клиенты</Link>
                </Menu.Item>
                <Menu.Item key="substitutions" icon={<SwapOutlined />}>
                    <Link to="/substitutions">Подмены</Link>
                </Menu.Item>
                <Menu.Item key="autopart-offers" icon={<SearchOutlined />}>
                    <Link to="/autoparts/offers">Прайсы по артикулу</Link>
                </Menu.Item>
                <Menu.Item key="autopart-price-history" icon={<LineChartOutlined />}>
                    <Link to="/autoparts/price-history">График цен</Link>
                </Menu.Item>
                {user.role === 'admin' && (
                    <Menu.Item key="admin-users" icon={<UserOutlined />}>
                        <Link to="/admin/users">Админ: пользователи</Link>
                    </Menu.Item>
                )}
                <Menu.Item key="logout" onClick={handleLogout}>
                    Выйти
                </Menu.Item>
            </Menu>
        </Sider>
    );
};

export default Sidebar;
