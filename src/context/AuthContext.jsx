import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';

const AuthContext = createContext({
    user: null,
    loading: true,
    authUnavailable: false,
    refreshUser: async () => {},
    retryAuthBootstrap: async () => {},
    login: async () => {},
    logout: async () => {},
});

const AUTH_BOOTSTRAP_RETRIES = 3;
const AUTH_BOOTSTRAP_RETRY_DELAY_MS = 1500;

const sleep = (ms) => new Promise((resolve) => {
    window.setTimeout(resolve, ms);
});

const getErrorStatus = (error) => error?.response?.status || null;
const isAuthFailureStatus = (status) => status === 401 || status === 403;
const isTransientAuthError = (error) => {
    const status = getErrorStatus(error);
    if (isAuthFailureStatus(status)) {
        return false;
    }
    if (!status) {
        return true;
    }
    return status >= 500;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authUnavailable, setAuthUnavailable] = useState(false);

    const loadCurrentUser = useCallback(async ({ allowRetry = false } = {}) => {
        let attempt = 0;
        while (true) {
            try {
                const { data } = await api.get('/auth/me');
                setUser(data);
                setAuthUnavailable(false);
                return { ok: true, user: data };
            } catch (err) {
                const status = getErrorStatus(err);
                console.error('Failed to load current user', err);
                if (isAuthFailureStatus(status)) {
                    setUser(null);
                    setAuthUnavailable(false);
                    return { ok: false, unauthorized: true };
                }
                if (allowRetry && isTransientAuthError(err) && attempt < AUTH_BOOTSTRAP_RETRIES - 1) {
                    attempt += 1;
                    await sleep(AUTH_BOOTSTRAP_RETRY_DELAY_MS * attempt);
                    continue;
                }
                setAuthUnavailable(true);
                return { ok: false, transient: true };
            }
        }
    }, []);

    const refreshUser = useCallback(async () => {
        const result = await loadCurrentUser();
        if (result?.unauthorized) {
            setUser(null);
        }
    }, [loadCurrentUser]);

    const retryAuthBootstrap = useCallback(async () => {
        setLoading(true);
        try {
            await loadCurrentUser({ allowRetry: true });
        } finally {
            setLoading(false);
        }
    }, [loadCurrentUser]);

    useEffect(() => {
        let mounted = true;
        const init = async () => {
            try {
                const result = await loadCurrentUser({ allowRetry: true });
                if (!mounted) {
                    return;
                }
                if (result?.unauthorized) {
                    setUser(null);
                    setAuthUnavailable(false);
                } else if (result?.transient) {
                    setAuthUnavailable(true);
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
    }, [loadCurrentUser]);

    const login = useCallback(async (email, password) => {
        await api.post('/auth/login', { email, password });
        setAuthUnavailable(false);
        await refreshUser();
    }, [refreshUser]);

    const logout = useCallback(async () => {
        await api.post('/auth/logout');
        setUser(null);
        setAuthUnavailable(false);
    }, []);

    const value = useMemo(() => ({
        user,
        loading,
        authUnavailable,
        refreshUser,
        retryAuthBootstrap,
        login,
        logout,
    }), [user, loading, authUnavailable, refreshUser, retryAuthBootstrap, login, logout]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export { AuthContext };
