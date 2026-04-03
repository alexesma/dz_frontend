import React from 'react';
import { Layout } from 'antd';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import NotificationCenter from './components/NotificationCenter';
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
import OrdersTrackingPage from './components/OrdersTrackingPage';
import StockOrdersPage from './components/StockOrdersPage';
import CustomerOrdersPage from './components/CustomerOrdersPage';
import CustomerOrderDetailPage from './components/CustomerOrderDetailPage';
import CustomerSupplierOrdersPage from './components/CustomerSupplierOrdersPage';
import CustomerSupplierOrderDetailPage from './components/CustomerSupplierOrderDetailPage';
import EmailAccountsPage from './components/EmailAccountsPage';
import SettingsPage from './components/SettingsPage';
import AdminMonitoringPage from './components/AdminMonitoringPage';
import PriceControlPage from './components/PriceControlPage';
import BrandManagementPage from './components/BrandManagementPage';
import OrderStatusMappingsPage from './components/OrderStatusMappingsPage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import AdminUsers from './components/AdminUsers';
import WatchlistPage from './components/WatchlistPage';
import { AuthProvider } from './context/AuthContext';
import useAuth from './context/useAuth';


const { Content } = Layout;

const RequireAuth = ({ children }) => {
    const { user, loading } = useAuth();
    if (loading) {
        return null;
    }
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    return children;
};

const RequireAdmin = ({ children }) => {
    const { user, loading } = useAuth();
    if (loading) {
        return null;
    }
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    if (user.role !== 'admin') {
        return <Navigate to="/" replace />;
    }
    return children;
};

const AppRoutes = () => (
    <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/restock" element={<RequireAuth><RestockOffers /></RequireAuth>} />
        <Route path="/orders" element={<RequireAuth><OrdersList /></RequireAuth>} />
        <Route path="/orders/tracking" element={<RequireAuth><OrdersTrackingPage /></RequireAuth>} />
        <Route path="/customer-orders" element={<RequireAuth><CustomerOrdersPage /></RequireAuth>} />
        <Route path="/customer-orders/:orderId" element={<RequireAuth><CustomerOrderDetailPage /></RequireAuth>} />
        <Route path="/customer-orders/stock" element={<RequireAuth><StockOrdersPage /></RequireAuth>} />
        <Route path="/customer-orders/suppliers" element={<RequireAuth><CustomerSupplierOrdersPage /></RequireAuth>} />
        <Route path="/customer-orders/suppliers/:orderId" element={<RequireAuth><CustomerSupplierOrderDetailPage /></RequireAuth>} />

        {/* Providers */}
        <Route path="/providers" element={<RequireAuth><ProvidersList /></RequireAuth>} />
        <Route path="/providers/create" element={<RequireAuth><ProviderPage /></RequireAuth>} />
        <Route path="/providers/:providerId/edit" element={<RequireAuth><ProviderPage /></RequireAuth>} />
        <Route path="/provider-configs/:id" element={<RequireAuth><ProviderConfigDetail /></RequireAuth>} />

        {/* Customers */}
        <Route path="/customers" element={<RequireAuth><CustomersList /></RequireAuth>} />
        <Route path="/customers/create" element={<RequireAuth><CustomerPage /></RequireAuth>} />
        <Route path="/customers/:customerId/edit" element={<RequireAuth><CustomerPage /></RequireAuth>} />

        {/* Substitutions */}
        <Route path="/substitutions" element={<RequireAuth><SubstitutionsList /></RequireAuth>} />
        <Route path="/substitutions/create" element={<RequireAuth><SubstitutionPage /></RequireAuth>} />
        <Route path="/substitutions/:substitutionId/edit" element={<RequireAuth><SubstitutionPage /></RequireAuth>} />

        {/* Autoparts offers */}
        <Route path="/autoparts/offers" element={<RequireAuth><AutopartOffers /></RequireAuth>} />

        {/* Autopart price history */}
        <Route path="/autoparts/price-history" element={<RequireAuth><PriceHistoryPlot /></RequireAuth>} />

        {/* Admin */}
        <Route path="/admin/users" element={<RequireAdmin><AdminUsers /></RequireAdmin>} />
        <Route path="/admin/email-accounts" element={<RequireAdmin><EmailAccountsPage /></RequireAdmin>} />
        <Route path="/admin/settings" element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
        <Route path="/admin/monitor" element={<RequireAdmin><AdminMonitoringPage /></RequireAdmin>} />
        <Route path="/admin/price-control" element={<RequireAdmin><PriceControlPage /></RequireAdmin>} />
        <Route path="/admin/brands" element={<RequireAdmin><BrandManagementPage /></RequireAdmin>} />
        <Route path="/admin/order-status-mappings" element={<RequireAdmin><OrderStatusMappingsPage /></RequireAdmin>} />
        <Route path="/watchlist" element={<RequireAuth><WatchlistPage /></RequireAuth>} />
    </Routes>
);

const App = () => (
    <AuthProvider>
        <Router>
            <Layout className="app-shell">
                <Sidebar />
                <Layout className="app-main-layout">
                    <Content className="app-content">
                        <div className="app-content-inner">
                            <AppRoutes />
                        </div>
                    </Content>
                </Layout>
                <NotificationCenter />
            </Layout>
        </Router>
    </AuthProvider>
);

export default App;
