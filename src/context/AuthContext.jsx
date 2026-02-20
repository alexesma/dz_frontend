import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';

const AuthContext = createContext({
    user: null,
    loading: true,
    refreshUser: async () => {},
    login: async () => {},
    logout: async () => {},
});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const refreshUser = useCallback(async () => {
        try {
            const { data } = await api.get('/auth/me');
            setUser(data);
        } catch (err) {
            setUser(null);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        const init = async () => {
            try {
                const { data } = await api.get('/auth/me');
                if (mounted) {
                    setUser(data);
                }
            } catch (err) {
                if (mounted) {
                    setUser(null);
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };
        init();
        return () => {
            mounted = false;
        };
    }, []);

    const login = useCallback(async (email, password) => {
        await api.post('/auth/login', { email, password });
        await refreshUser();
    }, [refreshUser]);

    const logout = useCallback(async () => {
        await api.post('/auth/logout');
        setUser(null);
    }, []);

    const value = useMemo(() => ({
        user,
        loading,
        refreshUser,
        login,
        logout,
    }), [user, loading, refreshUser, login, logout]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
