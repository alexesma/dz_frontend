import React, { useMemo } from 'react';
import { Layout, Menu } from 'antd';
import { Link, useLocation } from 'react-router-dom';

const { Sider } = Layout;

const Sidebar = () => {
    const location = useLocation();

    console.log('📍 Sidebar: текущий путь =', location.pathname);

    const selectedKey = useMemo(() => {
        const p = location.pathname;
        if (p === '/' || p === '') return '/';
        if (p.startsWith('/restock')) return '/restock';
        if (p.startsWith('/orders')) return '/orders';
        if (p.startsWith('/providers')) return '/providers';
        if (p.startsWith('/customers')) return '/customers';
        return '/';
    }, [location.pathname]);

    console.log('🎯 Sidebar: selectedKey =', selectedKey);

    return (
        <Sider width={250}>
            <div style={{padding: '10px', color: 'white', fontSize: '12px'}}>
                DEBUG: {location.pathname}
            </div>
            <Menu
                mode="inline"
                theme="dark"
                selectedKeys={[selectedKey]}
            >
                <Menu.Item key="/">
                    <Link to="/" onClick={() => console.log('🏠 Клик: Dashboard')}>
                        Dashboard
                    </Link>
                </Menu.Item>
                <Menu.Item key="/customers">
                    <Link
                        to="/customers"
                        onClick={() => console.log('👥 Клик: Клиенты')}
                    >
                        Клиенты ⭐
                    </Link>
                </Menu.Item>
                <Menu.Item key="/restock">
                    <Link to="/restock">Формирование заказов</Link>
                </Menu.Item>
                <Menu.Item key="/orders">
                    <Link to="/orders">Заказы поставщикам</Link>
                </Menu.Item>
                <Menu.Item key="/providers">
                    <Link to="/providers">Поставщики</Link>
                </Menu.Item>
            </Menu>
        </Sider>
    );
};

export default Sidebar;