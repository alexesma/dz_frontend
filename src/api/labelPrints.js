// Журнал печати товарных этикеток и бирок мест хранения.
//
// У этих двух видов этикеток (в отличие от этикеток волны сборки и
// кросс-докинга) не было следа печати: их собирают на лету, без
// привязки к объекту в базе. Запись создаётся при каждом нажатии
// «Печать» — кто напечатал, что именно и сколько копий.
import api from '../api';

export const printProductLabels = (data) =>
    api.post('/inventory/labels/product/print-events', data);

export const printLocationLabel = (data) =>
    api.post('/inventory/labels/location/print-events', data);

export const listLabelPrintEvents = (params = {}) =>
    api.get('/inventory/labels/print-events', { params });
