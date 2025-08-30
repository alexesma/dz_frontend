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


const { Content } = Layout;

const App = () => (
    <Router>
        <Layout style={{ height: '100vh' }}>
            <Sidebar />
            <Content style={{ padding: '20px' }}>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/restock" element={<RestockOffers />} />
                    <Route path="/orders" element={<OrdersList />} />
                    <Route path="/providers" element={<ProvidersList />} />
                    <Route path="/providers/create" element={<ProviderPage />} />
                    <Route path="/providers/:providerId/edit" element={<ProviderPage />} />
                    <Route path="/provider-configs/:id" element={<ProviderConfigDetail />} />
                </Routes>
            </Content>
        </Layout>
    </Router>
);

export default App;
