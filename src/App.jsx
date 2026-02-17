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
import SubstitutionsList from './components/SubstitutionsList';
import SubstitutionPage from './components/SubstitutionPage';
import CustomersList from './components/CustomersList';
import CustomerPage from './components/CustomerPage';
import AutopartOffers from './components/AutopartOffers';
import PriceHistoryPlot from './components/PriceHistoryPlot';


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

                    {/* Providers */}
                    <Route path="/providers" element={<ProvidersList />} />
                    <Route path="/providers/create" element={<ProviderPage />} />
                    <Route path="/providers/:providerId/edit" element={<ProviderPage />} />
                    <Route path="/provider-configs/:id" element={<ProviderConfigDetail />} />

                    {/* Customers */}
                    <Route path="/customers" element={<CustomersList />} />
                    <Route path="/customers/create" element={<CustomerPage />} />
                    <Route path="/customers/:customerId/edit" element={<CustomerPage />} />

                    {/* Substitutions */}
                    <Route path="/substitutions" element={<SubstitutionsList />} />
                    <Route path="/substitutions/create" element={<SubstitutionPage />} />
                    <Route path="/substitutions/:substitutionId/edit" element={<SubstitutionPage />} />

                    {/* Autoparts offers */}
                    <Route path="/autoparts/offers" element={<AutopartOffers />} />

                    {/* Autopart price history */}
                    <Route path="/autoparts/price-history" element={<PriceHistoryPlot />} />
                </Routes>
            </Content>
        </Layout>
    </Router>
);

export default App;
