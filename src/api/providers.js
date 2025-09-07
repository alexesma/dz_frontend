import api from "../api.js";

export const getProviderFullById = async (providerId) => {
    return api.get(`/providers/${providerId}/full`);
};

export const createProvider = async (data) => {
    return api.post(`/providers/`, data);
};

export const updateProvider = async (providerId, data) => {
    return api.patch(`/providers/${providerId}/`, data);
};

export const deleteProviderApi = async (providerId) => {
    return api.delete(`/providers/${providerId}/`);
};

// Конфиги
export const createProviderConfig = async (providerId, data) => {
    return api.post(`/providers/${providerId}/pricelist-config/`, data);
};

export const updateProviderConfig = async (providerId, configId, data) => {
    return api.patch(`/providers/${providerId}/pricelist-config/${configId}/`, data);
};

export const deleteProviderConfig = async (providerId, configId) => {
    return api.delete(`/providers/${providerId}/pricelist-config/${configId}/`);
};

// Аббревиатуры
export const createAbbreviation = async (providerId, abbreviation) => {
    return api.post(`/providers/${providerId}/abbreviations`, { abbreviation_name: abbreviation });
};

export const updateAbbreviation = async (providerId, abbrId, abbreviation) => {
    return api.patch(`/providers/${providerId}/abbreviations/${abbrId}`, { new_abbreviation: abbreviation });
};

export const deleteAbbreviation = async (providerId, abbrId) => {
    return api.delete(`/providers/${providerId}/abbreviations/${abbrId}`);
};

export const uploadProviderPricelist = async (
    providerId,
    configId,
    {
        file,                 // File | Blob (обязателен)
        use_stored_params,    // boolean (по умолчанию true на бэке)
        start_row,            // number | undefined
        oem_col,              // number | undefined
        brand_col,            // number | undefined
        name_col,             // number | undefined
        qty_col,              // number | undefined
        price_col,            // number | undefined
    } = {}
) => {
    const form = new FormData();
    form.append("file", file);
    if (use_stored_params !== undefined) form.append("use_stored_params", String(use_stored_params));
    if (start_row !== undefined && start_row !== null) form.append("start_row", String(start_row));
    if (oem_col !== undefined && oem_col !== null) form.append("oem_col", String(oem_col));
    if (brand_col !== undefined && brand_col !== null) form.append("brand_col", String(brand_col));
    if (name_col !== undefined && name_col !== null) form.append("name_col", String(name_col));
    if (qty_col !== undefined && qty_col !== null) form.append("qty_col", String(qty_col));
    if (price_col !== undefined && price_col !== null) form.append("price_col", String(price_col));

    return api.post(
        `/providers/${providerId}/pricelists/${configId}/upload/`,
        form,
        {
            headers: { /* 'Content-Type': 'multipart/form-data' */ },
        }
    );
};

// Загрузка прайс-листа из email
export const downloadProviderPricelist = async (providerId, configId) => {
    return api.post(`/providers/${providerId}/download`, null, {
        params: {
            provider_price_config_id: configId
        }
    });
};