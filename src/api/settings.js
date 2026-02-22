import api from "../api.js";

export const getPriceCheckSchedule = () => api.get("/settings/price-check");

export const updatePriceCheckSchedule = (data) =>
    api.put("/settings/price-check", data);

export const getPriceStaleAlerts = (params = {}) =>
    api.get("/alerts/pricelist-stale", { params });

export const getPriceCheckLogs = (params = {}) =>
    api.get("/alerts/price-check-logs", { params });
