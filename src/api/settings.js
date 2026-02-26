import api from "../api.js";

export const getPriceCheckSchedule = () => api.get("/settings/price-check");

export const updatePriceCheckSchedule = (data) =>
    api.put("/settings/price-check", data);

export const getPriceStaleAlerts = (params = {}) =>
    api.get("/alerts/pricelist-stale", { params });

export const getPriceCheckLogs = (params = {}) =>
    api.get("/alerts/price-check-logs", { params });

export const getSchedulerSettings = () => api.get("/settings/scheduler");

export const updateSchedulerSetting = (key, data) =>
    api.put(`/settings/scheduler/${key}`, data);

export const getMonitorSummary = () =>
    api.get("/settings/monitor/summary");

export const createMonitorSnapshot = () =>
    api.post("/settings/monitor/snapshot");

export const getMonitorSnapshots = (params = {}) =>
    api.get("/settings/monitor/snapshots", { params });
