import api from "../api.js";

export const getWatchItems = (params = {}) =>
    api.get("/watchlist", { params });

export const createWatchItem = (data) =>
    api.post("/watchlist", data);

export const updateWatchItem = (id, data) =>
    api.patch(`/watchlist/${id}`, data);

export const deleteWatchItem = (id) =>
    api.delete(`/watchlist/${id}`);
