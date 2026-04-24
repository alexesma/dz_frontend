import React from 'react';
import { Layout } from 'antd';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import RestockOffers from './components/RestockOffers';
import OrdersList from './components/OrdersList';
import Dashboard from './components/Dashboard';
import ProvidersList from './components/ProvidersList';
import ProviderConfigDetail from './components/ProviderConfigDetail';
import ProviderPage from './components/ProviderPage';
import CustomerPage from './components/CustomerPage.jsx';
import CustomersList from './components/CustomersList.jsx';


const { Content } = Layout;

// Отладочный компонент для показа текущего маршрута
const DebugInfo = () => {
    const location = useLocation();
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            background: 'red',
            color: 'white',
            padding: '10px',
            zIndex: 1000
        }}>
            <div>Версия: 3.0</div>
            <div>Путь: {location.pathname}</div>
            <div>Время: {new Date().toLocaleTimeString()}</div>
        </div>
    );
};

// Простые тестовые компоненты
const TestDashboard = () => (
    <div style={{padding: '20px', border: '2px solid blue'}}>
        <h1>Dashboard работает</h1>
    </div>
);

const TestCustomers = () => (
    <div style={{padding: '20px', border: '2px solid green', backgroundColor: '#f0fff0'}}>
        <h1>🎉 КЛИЕНТЫ РАБОТАЮТ!</h1>
        <p>Маршрут /customers успешно обрабатывается</p>
        <p>Время загрузки: {new Date().toLocaleString()}</p>
    </div>
);

const Test404 = () => {
    const location = useLocation();
    return (
        <div style={{padding: '20px', border: '2px solid red', backgroundColor: '#fff0f0'}}>
            <h1>404 - Неизвестный маршрут</h1>
            <p>Путь: <strong>{location.pathname}</strong></p>
            <p>Время: {new Date().toLocaleString()}</p>
        </div>
    );
};

const App = () => {
    console.log('🚀 App.jsx загружается - версия 3.0');
    console.log('🔗 Current URL:', window.location.href);
    console.log('📊 Environment:', import.meta.env.VITE_API_URL);

    return (
        <Router>
            <Layout style={{ height: '100vh' }}>
                <DebugInfo />
                <Sidebar />
                <Content style={{ padding: '20px' }}>
                    <Routes>
                        <Route path="/" element={<TestDashboard />} />
                        <Route path="/customers" element={<TestCustomers />} />
                        <Route path="/restock" element={<div>Restock тест</div>} />
                        <Route path="/orders" element={<div>Orders тест</div>} />
                        <Route path="/providers" element={<div>Providers тест</div>} />
                        <Route path="*" element={<Test404 />} />
                    </Routes>
                </Content>
            </Layout>
        </Router>
    );
};

export default App;
