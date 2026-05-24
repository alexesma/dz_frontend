import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    AutoComplete,
    Card,
    Form,
    Input,
    InputNumber,
    Button,
    Table,
    Space,
    Select,
    Tag,
    Divider,
    message,
    Checkbox,
    Spin,
    Tooltip,
    Modal,
} from 'antd';
import {
    CheckOutlined,
    SearchOutlined,
    CloseOutlined,
    CloudDownloadOutlined,
    LineChartOutlined,
    PlusOutlined,
    ShoppingCartOutlined,
    DeleteOutlined,
    SendOutlined,
    MailOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    addAutopartCross,
    addAutopartInvalidCross,
    getAutopartCrosses,
    getAutopartInvalidCrosses,
    getAutopartOffers,
    getDragonzapBrands,
    getDragonzapOffers,
    searchAutopartsByOem,
    sendDragonzapOrder,
} from '../api/autoparts';
import { lookupBrands } from '../api/brands';
import { getCustomersSummary } from '../api/customers';
import {
    createManualSupplierOrder,
    sendSupplierOrders,
} from '../api/customerOrders';
import {
    getTrackingOrderInsights,
    getTrackingOrderItems,
    updateTrackingOrderItem,
} from '../api/orderTracking';
import TrackingOrderHistoryTable from './TrackingOrderHistoryTable';

const OEM_HISTORY_KEY = 'autopart_oem_history_v1';
const STATE_STORAGE_KEY = 'autopart_offers_state_v2';
const MAX_PERSISTED_CART_ITEMS = 200;

const buildCartKey = (sourceType, record) => {
    if (sourceType === 'supplier') {
        return [
            'supplier',
            record.provider_id,
            record.provider_config_id || 'base',
            record.autopart_id,
            record.oem_number,
        ].join(':');
    }
    return [
        'dragonzap',
        record.supplier_id ||
            record.provider_id ||
            normalizeSupplierName(
                record.supplier_name || record.sup_logo || record.provider_name
            ) ||
            'unknown',
        record.hash_key || record.api_hash || record.system_hash || record.oem,
        record.oem,
    ].join(':');
};

const clampQty = (value, maxValue) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 1;
    }
    if (Number.isFinite(maxValue) && maxValue > 0) {
        return Math.min(parsed, maxValue);
    }
    return parsed;
};

function normalizeSupplierName(value) {
    const normalized = String(value || '').trim();
    return normalized || null;
}

const extractRequestError = (error, fallback) => {
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
        return detail.trim();
    }
    if (Array.isArray(detail) && detail.length) {
        return detail
            .map((item) => item?.msg || item?.message || String(item))
            .filter(Boolean)
            .join('; ');
    }
    return fallback;
};

const describeDragonzapRequestError = (error) => {
    const status = Number(error?.response?.status || 0);
    const rawDetail = extractRequestError(
        error,
        error?.message || 'Ошибка запроса к Dragonzap'
    );

    if (status === 504) {
        return {
            userMessage:
                'Dragonzap отвечает слишком долго. Мы подождали, но сайт не успел вернуть результат.',
            technicalDetails: `HTTP 504 Gateway Timeout. ${rawDetail}`,
        };
    }

    if (status === 502) {
        return {
            userMessage:
                'Промежуточный сервер не смог получить корректный ответ от Dragonzap.',
            technicalDetails: `HTTP 502 Bad Gateway. ${rawDetail}`,
        };
    }

    if (status === 500) {
        return {
            userMessage:
                'Во время запроса к Dragonzap произошла серверная ошибка.',
            technicalDetails: `HTTP 500 Internal Server Error. ${rawDetail}`,
        };
    }

    if (
        String(error?.code || '').toUpperCase() === 'ECONNABORTED' ||
        /timeout/i.test(String(rawDetail || ''))
    ) {
        return {
            userMessage:
                'Мы слишком долго ждали ответ от Dragonzap и остановили запрос по таймауту.',
            technicalDetails: rawDetail,
        };
    }

    if (!error?.response) {
        return {
            userMessage:
                'Не удалось связаться с Dragonzap. Похоже на временную сетевую проблему.',
            technicalDetails: rawDetail,
        };
    }

    return {
        userMessage:
            'Не удалось получить ответ от Dragonzap. Попробуй повторить запрос чуть позже.',
        technicalDetails: status
            ? `HTTP ${status}. ${rawDetail}`
            : rawDetail,
    };
};

const formatShortDate = (value) => {
    if (!value) {
        return '—';
    }
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
    });
};

const formatInsightMoney = (value) => {
    if (value === null || value === undefined || value === '') {
        return '—';
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return '—';
    }
    return number.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const formatInsightDateTime = (value) => {
    if (!value) {
        return '—';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
    });
};

const formatInsightDelivery = (minDeliveryDay, maxDeliveryDay) => {
    if (
        minDeliveryDay !== null &&
        minDeliveryDay !== undefined &&
        maxDeliveryDay !== null &&
        maxDeliveryDay !== undefined
    ) {
        return `${minDeliveryDay}-${maxDeliveryDay} дн`;
    }
    if (minDeliveryDay !== null && minDeliveryDay !== undefined) {
        return `от ${minDeliveryDay} дн`;
    }
    if (maxDeliveryDay !== null && maxDeliveryDay !== undefined) {
        return `до ${maxDeliveryDay} дн`;
    }
    return 'срок не указан';
};

const extractUniqueCrossOems = (offers, baseOem) => {
    const normalizedBase = String(baseOem || '').trim().toUpperCase();
    const uniqueOems = new Set();
    for (const offer of offers || []) {
        const normalizedOem = String(
            offer?.oem ||
            offer?.oem_number ||
            offer?.article ||
            offer?.part_number ||
            ''
        ).trim().toUpperCase();
        if (!normalizedOem || normalizedOem === normalizedBase) {
            continue;
        }
        uniqueOems.add(normalizedOem);
    }
    return Array.from(uniqueOems);
};

const normalizeCrossKey = (brandName, oemNumber) =>
    [
        String(brandName || '').trim().toUpperCase(),
        String(oemNumber || '').trim().toUpperCase(),
    ].join('::');

const extractUniqueCrossItemsFromSiteOffers = (offers, baseOem) => {
    const normalizedBase = String(baseOem || '').trim().toUpperCase();
    const uniqueItems = new Map();
    for (const offer of offers || []) {
        const oemNumber = String(
            offer?.oem ||
            offer?.oem_number ||
            offer?.article ||
            offer?.part_number ||
            ''
        ).trim().toUpperCase();
        const brandName = String(
            offer?.make_name ||
            offer?.brand_name ||
            offer?.brand ||
            ''
        ).trim();
        const name = String(
            offer?.detail_name ||
            offer?.name ||
            offer?.autopart_name ||
            ''
        ).trim();
        if (!oemNumber || oemNumber === normalizedBase) {
            continue;
        }
        const key = normalizeCrossKey(brandName, oemNumber);
        if (!uniqueItems.has(key)) {
            uniqueItems.set(key, {
                key,
                source: 'site',
                brand_name: brandName || null,
                oem_number: oemNumber,
                name: name || null,
            });
        }
    }
    return Array.from(uniqueItems.values());
};

const INSIGHT_TONE_STYLES = {
    blue: {
        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
        border: '1px solid #bfdbfe',
    },
    green: {
        background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
        border: '1px solid #a7f3d0',
    },
    amber: {
        background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
        border: '1px solid #fcd34d',
    },
    rose: {
        background: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
        border: '1px solid #fecdd3',
    },
    slate: {
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        border: '1px solid #cbd5e1',
    },
};

const InsightTile = ({ tone = 'blue', title, value, subtitle, extra }) => (
    <div
        style={{
            ...INSIGHT_TONE_STYLES[tone],
            borderRadius: 10,
            padding: 10,
            minHeight: 78,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 6,
            boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)',
        }}
    >
        <div style={{ color: '#475569', fontSize: 11, fontWeight: 700 }}>
            {title}
        </div>
        <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 800 }}>
            {value}
        </div>
        <div style={{ color: '#334155', fontSize: 11, lineHeight: 1.35 }}>
            {subtitle}
        </div>
        {extra ? (
            <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                {extra}
            </div>
        ) : null}
    </div>
);

const TREND_LABELS = { up: '↑ растёт', down: '↓ снижается', stable: '→ стабильна' };
const TREND_COLORS = { up: '#dc2626', down: '#16a34a', stable: '#6b7280' };

const safeJsonParse = (value, fallback) => {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const safeStorageGet = (key) => {
    try {
        return window.localStorage.getItem(key);
    } catch (error) {
        console.warn(`Failed to read localStorage key "${key}"`, error);
        return null;
    }
};

const safeStorageSet = (key, value) => {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.warn(`Failed to persist localStorage key "${key}"`, error);
        return false;
    }
};

const normalizeDragonzapBrandCandidates = (payload) => {
    const rawList = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
            ? payload
            : [];

    return rawList
        .map((item) => ({
            brand: String(item?.brand || '').trim(),
            rate: Number(item?.rate || 0),
            des_text: String(item?.des_text || '').trim(),
        }))
        .filter((item) => item.brand)
        .sort((a, b) => {
            if (b.rate !== a.rate) {
                return b.rate - a.rate;
            }
            return a.brand.localeCompare(b.brand);
        });
};

const pickBestDragonzapBrand = (candidates) => {
    if (!Array.isArray(candidates) || !candidates.length) {
        return '';
    }
    const positiveCandidate = candidates.find((item) => Number(item.rate) > 0);
    return positiveCandidate?.brand || candidates[0]?.brand || '';
};

const buildPersistedCartItems = (items) => {
    if (!Array.isArray(items)) {
        return [];
    }
    return items.slice(0, MAX_PERSISTED_CART_ITEMS).map((item) => ({
        cart_key: item.cart_key,
        source_type: item.source_type,
        autopart_id: item.autopart_id ?? null,
        provider_id: item.provider_id ?? null,
        provider_name: item.provider_name ?? null,
        provider_config_id: item.provider_config_id ?? null,
        provider_config_name: item.provider_config_name ?? null,
        supplier_id: item.supplier_id ?? null,
        supplier_name: item.supplier_name ?? null,
        oem_number: item.oem_number ?? null,
        brand_name: item.brand_name ?? null,
        name: item.name ?? null,
        price: item.price ?? 0,
        available_qty: item.available_qty ?? 0,
        order_qty: item.order_qty ?? 1,
        min_delivery_day: item.min_delivery_day ?? null,
        max_delivery_day: item.max_delivery_day ?? null,
        is_own_price: Boolean(item.is_own_price),
        hash_key: item.hash_key ?? null,
        system_hash: item.system_hash ?? null,
    }));
};

const buildPersistedOffersState = ({
    currentOem,
    selectedBrand,
    selectedCustomerId,
    showCrosses,
    partialSearch,
    cartItems,
    selectedCartKeys,
}) => ({
    currentOem,
    selectedBrand,
    selectedCustomerId,
    showCrosses,
    partialSearch,
    cartItems: buildPersistedCartItems(cartItems),
    selectedCartKeys: Array.isArray(selectedCartKeys)
        ? selectedCartKeys.slice(0, MAX_PERSISTED_CART_ITEMS)
        : [],
});

const renderHighlightedOem = (value, query) => {
    const source = String(value || '');
    const needle = String(query || '').trim();
    if (!source || !needle) {
        return source || '—';
    }

    const lowerSource = source.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    const matchIndex = lowerSource.indexOf(lowerNeedle);
    if (matchIndex < 0) {
        return source;
    }

    const before = source.slice(0, matchIndex);
    const match = source.slice(matchIndex, matchIndex + needle.length);
    const after = source.slice(matchIndex + needle.length);

    return (
        <>
            {before}
            <mark
                style={{
                    backgroundColor: '#fef3c7',
                    padding: 0,
                }}
            >
                {match}
            </mark>
            {after}
        </>
    );
};

const AutopartOffers = () => {
    const [form] = Form.useForm();
    const [offers, setOffers] = useState([]);
    const [historicalOffers, setHistoricalOffers] = useState([]);
    const [trackingHistory, setTrackingHistory] = useState([]);
    const [trackingHistoryLoading, setTrackingHistoryLoading] = useState(false);
    const [trackingInsights, setTrackingInsights] = useState(null);
    const [trackingInsightsLoading, setTrackingInsightsLoading] = useState(false);
    const [siteBrandWarning, setSiteBrandWarning] = useState(null);
    const [confirmedCrosses, setConfirmedCrosses] = useState([]);
    const [invalidCrosses, setInvalidCrosses] = useState([]);
    const [crossActionLoadingKey, setCrossActionLoadingKey] = useState('');
    const [showAllSummaryCrosses, setShowAllSummaryCrosses] = useState(false);
    const [cartItems, setCartItems] = useState([]);
    const [selectedCartKeys, setSelectedCartKeys] = useState([]);
    const [loading, setLoading] = useState(false);
    const [remoteOffers, setRemoteOffers] = useState([]);
    const [siteExactOffers, setSiteExactOffers] = useState([]);
    const [siteOffersWithCrosses, setSiteOffersWithCrosses] = useState([]);
    const [siteResponseDiagnostics, setSiteResponseDiagnostics] = useState(null);
    const [siteRequestError, setSiteRequestError] = useState(null);
    const [remoteLoading, setRemoteLoading] = useState(false);
    const [cartSubmitting, setCartSubmitting] = useState(false);
    const [bestSupplierQty, setBestSupplierQty] = useState(1);
    const [remoteMeta, setRemoteMeta] = useState({ total: 0 });
    const [showCrosses, setShowCrosses] = useState(false);
    const [partialSearch, setPartialSearch] = useState(false);
    const [currentOem, setCurrentOem] = useState('');
    const [siteBrandCandidates, setSiteBrandCandidates] = useState([]);
    const [nomenclatureInfo, setNomenclatureInfo] = useState(null); // { in_nomenclature, id, brand, name }
    const [oemInput, setOemInput] = useState('');
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupResults, setLookupResults] = useState([]);
    const [selectedBrand, setSelectedBrand] = useState('');
    const [oemHistory, setOemHistory] = useState([]);
    const [customerOptions, setCustomerOptions] = useState([]);
    const [customersLoading, setCustomersLoading] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [localFilters, setLocalFilters] = useState({
        brand: '',
        provider: '',
        minPrice: null,
        maxPrice: null,
        minQty: null,
        maxDelivery: null,
    });
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const lookupRequestIdRef = useRef(0);
    const autoSearchKeyRef = useRef('');

    const replaceItemId = searchParams.get('replace_item_id');
    const replaceSource = searchParams.get('replace_source');

    const markReplacedItemRemoved = useCallback(async () => {
        if (!replaceItemId || !replaceSource) return;
        try {
            await updateTrackingOrderItem(replaceSource, Number(replaceItemId), {
                status: 'REMOVED',
            });
        } catch {
            // non-critical — order was placed, just couldn't update old status
        }
    }, [replaceItemId, replaceSource]);
    const activeLookupQuery = String(oemInput || '').trim();

    const brandOptions = useMemo(() => {
        const options = [];
        const seen = new Set();

        for (const brand of [...offers, ...historicalOffers]
            .map((item) => item.brand_name)
            .filter((value) => value && value.trim())) {
            const normalized = String(brand).trim();
            const key = normalized.toLowerCase();
            if (!normalized || seen.has(key)) {
                continue;
            }
            seen.add(key);
            options.push({
                label: normalized,
                value: normalized,
            });
        }

        for (const candidate of siteBrandCandidates) {
            const normalized = String(candidate.brand || '').trim();
            const key = normalized.toLowerCase();
            if (!normalized || seen.has(key)) {
                continue;
            }
            seen.add(key);
            const rate = Number(candidate.rate || 0);
            options.push({
                label:
                    rate > 0
                        ? `${normalized} · Dragonzap (${rate})`
                        : `${normalized} · Dragonzap`,
                value: normalized,
            });
        }

        return options;
    }, [historicalOffers, offers, siteBrandCandidates]);

    const normalizedCurrentOem = useMemo(
        () => String(currentOem || '').trim().toUpperCase(),
        [currentOem]
    );

    const confirmedCrossKeySet = useMemo(
        () =>
            new Set(
                (confirmedCrosses || []).map((item) =>
                    normalizeCrossKey(
                        item?.cross_brand_name,
                        item?.cross_oem_number
                    )
                )
            ),
        [confirmedCrosses]
    );

    const invalidCrossKeySet = useMemo(
        () =>
            new Set(
                (invalidCrosses || []).map((item) =>
                    normalizeCrossKey(
                        item?.invalid_brand_name,
                        item?.invalid_oem_number
                    )
                )
            ),
        [invalidCrosses]
    );

    const siteCrossItems = useMemo(
        () => extractUniqueCrossItemsFromSiteOffers(siteOffersWithCrosses, currentOem),
        [currentOem, siteOffersWithCrosses]
    );

    const summaryCrossItems = useMemo(() => {
        const itemsByKey = new Map();

        for (const item of trackingInsights?.cross_items || []) {
            const normalizedOem = String(item?.oem_number || '').trim().toUpperCase();
            if (!normalizedOem || normalizedOem === normalizedCurrentOem) {
                continue;
            }
            const key = normalizeCrossKey(item?.brand_name, normalizedOem);
            itemsByKey.set(key, {
                key,
                source: 'system',
                brand_name: String(item?.brand_name || '').trim() || null,
                oem_number: normalizedOem,
                name: String(item?.name || '').trim() || null,
                autopart_id: item?.autopart_id ?? null,
            });
        }

        for (const item of siteCrossItems) {
            const existing = itemsByKey.get(item.key);
            if (existing) {
                itemsByKey.set(item.key, {
                    ...existing,
                    source:
                        existing.source === 'system'
                            ? 'system+site'
                            : existing.source,
                    name: existing.name || item.name || null,
                });
                continue;
            }
            itemsByKey.set(item.key, item);
        }

        return Array.from(itemsByKey.values())
            .map((item) => ({
                ...item,
                isConfirmed: confirmedCrossKeySet.has(item.key),
                isInvalid: invalidCrossKeySet.has(item.key),
                isSiteSuggested: String(item.source || '').includes('site'),
            }))
            .sort((a, b) => {
                const aWeight = a.isSiteSuggested ? 0 : 1;
                const bWeight = b.isSiteSuggested ? 0 : 1;
                if (aWeight !== bWeight) {
                    return aWeight - bWeight;
                }
                const brandCompare = String(a.brand_name || '').localeCompare(
                    String(b.brand_name || ''),
                    'ru-RU'
                );
                if (brandCompare !== 0) {
                    return brandCompare;
                }
                return String(a.oem_number || '').localeCompare(
                    String(b.oem_number || ''),
                    'ru-RU'
                );
            });
    }, [
        confirmedCrossKeySet,
        invalidCrossKeySet,
        normalizedCurrentOem,
        siteCrossItems,
        trackingInsights,
    ]);

    const visibleSummaryCrossItems = useMemo(
        () =>
            showAllSummaryCrosses
                ? summaryCrossItems
                : summaryCrossItems.slice(0, 8),
        [showAllSummaryCrosses, summaryCrossItems]
    );

    const fetchTrackingInsights = useCallback(async ({
        oemValue,
        brandValue,
        extraOemNumbers = [],
    }) => {
        const normalizedOemValue = String(oemValue || '').trim();
        if (!normalizedOemValue) {
            setTrackingInsights(null);
            return null;
        }
        setTrackingInsightsLoading(true);
        try {
            const normalizedExtraOems = Array.from(
                new Set(
                    (extraOemNumbers || [])
                        .map((item) => String(item || '').trim().toUpperCase())
                        .filter((item) =>
                            item &&
                            item !== normalizedOemValue.toUpperCase()
                        )
                )
            );
            const response = await getTrackingOrderInsights({
                oem: normalizedOemValue,
                brand: brandValue || undefined,
                site_cross_oems: normalizedExtraOems.length
                    ? normalizedExtraOems.join(',')
                    : undefined,
            });
            const payload = response?.data || null;
            setTrackingInsights(payload);
            return payload;
        } catch (error) {
            console.error('Fetch tracking insights error:', error);
            setTrackingInsights(null);
            return null;
        } finally {
            setTrackingInsightsLoading(false);
        }
    }, []);

    const fetchCrossStates = useCallback(async (autopartId) => {
        if (!autopartId) {
            setConfirmedCrosses([]);
            setInvalidCrosses([]);
            return;
        }
        try {
            const [confirmedResponse, invalidResponse] = await Promise.all([
                getAutopartCrosses(autopartId),
                getAutopartInvalidCrosses(autopartId),
            ]);
            setConfirmedCrosses(
                Array.isArray(confirmedResponse?.data)
                    ? confirmedResponse.data
                    : []
            );
            setInvalidCrosses(
                Array.isArray(invalidResponse?.data)
                    ? invalidResponse.data
                    : []
            );
        } catch (error) {
            console.error('Load cross states error:', error);
        }
    }, []);

    useEffect(() => {
        fetchCrossStates(nomenclatureInfo?.id || null);
    }, [fetchCrossStates, nomenclatureInfo?.id]);

    useEffect(() => {
        setShowAllSummaryCrosses(false);
    }, [currentOem]);

    const resolveBrandIdByName = useCallback(async (brandName) => {
        const normalizedBrandName = String(brandName || '').trim();
        if (!normalizedBrandName) {
            throw new Error('Не удалось определить бренд кросса');
        }
        const { data } = await lookupBrands(normalizedBrandName, 50);
        const exactMatch = (data || []).find(
            (item) =>
                String(item?.name || '').trim().toUpperCase() ===
                normalizedBrandName.toUpperCase()
        );
        if (!exactMatch?.id) {
            throw new Error(
                `Бренд ${normalizedBrandName} не найден в справочнике брендов`
            );
        }
        return exactMatch.id;
    }, []);

    const handleApproveSiteCross = useCallback((crossItem) => {
        const sourceLabel = `${nomenclatureInfo?.brand || selectedBrand || '—'} ${currentOem || '—'}`.trim();
        const targetLabel = `${crossItem?.brand_name || '—'} ${crossItem?.oem_number || '—'}`.trim();
        Modal.confirm({
            title: 'Подтвердить кросс',
            content: `Подтверждаете кросс нашей позиции ${sourceLabel} и позиции ${targetLabel}?`,
            okText: 'Подтвердить',
            cancelText: 'Отмена',
            onOk: async () => {
                if (!nomenclatureInfo?.id) {
                    message.warning('Сначала нужна позиция в номенклатуре');
                    return;
                }
                const actionKey = `approve:${crossItem.key}`;
                setCrossActionLoadingKey(actionKey);
                try {
                    const brandId = await resolveBrandIdByName(
                        crossItem?.brand_name
                    );
                    await addAutopartCross(nomenclatureInfo.id, {
                        cross_brand_id: brandId,
                        cross_oem_number: crossItem?.oem_number,
                        comment: 'Подтверждено из поиска по сайту',
                    });
                    await fetchCrossStates(nomenclatureInfo.id);
                    if (currentOem) {
                        await fetchTrackingInsights({
                            oemValue: currentOem,
                            brandValue:
                                selectedBrand || nomenclatureInfo?.brand || '',
                            extraOemNumbers: extractUniqueCrossOems(
                                siteOffersWithCrosses,
                                currentOem
                            ),
                        });
                    }
                    message.success('Кросс добавлен в систему');
                } catch (error) {
                    console.error('Approve site cross error:', error);
                    message.error(
                        error?.response?.data?.detail ||
                            error?.message ||
                            'Не удалось сохранить кросс'
                    );
                } finally {
                    setCrossActionLoadingKey('');
                }
            },
        });
    }, [
        currentOem,
        fetchCrossStates,
        fetchTrackingInsights,
        nomenclatureInfo,
        resolveBrandIdByName,
        selectedBrand,
        siteOffersWithCrosses,
    ]);

    const handleRejectSiteCross = useCallback((crossItem) => {
        const sourceLabel = `${nomenclatureInfo?.brand || selectedBrand || '—'} ${currentOem || '—'}`.trim();
        const targetLabel = `${crossItem?.brand_name || '—'} ${crossItem?.oem_number || '—'}`.trim();
        Modal.confirm({
            title: 'Исключить неверный кросс',
            content: `Подтверждаете, что ${targetLabel} не является кроссом для позиции ${sourceLabel}?`,
            okText: 'Исключить',
            cancelText: 'Отмена',
            okButtonProps: { danger: true },
            onOk: async () => {
                if (!nomenclatureInfo?.id) {
                    message.warning('Сначала нужна позиция в номенклатуре');
                    return;
                }
                const actionKey = `reject:${crossItem.key}`;
                setCrossActionLoadingKey(actionKey);
                try {
                    const brandId = await resolveBrandIdByName(
                        crossItem?.brand_name
                    );
                    await addAutopartInvalidCross(nomenclatureInfo.id, {
                        invalid_brand_id: brandId,
                        invalid_oem_number: crossItem?.oem_number,
                        comment: 'Исключено из поиска по сайту вручную',
                    });
                    const nextSiteOffersWithCrosses = siteOffersWithCrosses.filter(
                        (offer) =>
                            normalizeCrossKey(
                                offer?.make_name || offer?.brand_name,
                                offer?.oem || offer?.oem_number
                            ) !== crossItem.key
                    );
                    setSiteOffersWithCrosses(nextSiteOffersWithCrosses);
                    await fetchCrossStates(nomenclatureInfo.id);
                    if (currentOem) {
                        await fetchTrackingInsights({
                            oemValue: currentOem,
                            brandValue:
                                selectedBrand || nomenclatureInfo?.brand || '',
                            extraOemNumbers: extractUniqueCrossOems(
                                nextSiteOffersWithCrosses,
                                currentOem
                            ),
                        });
                    }
                    message.success('Неверный кросс исключён');
                } catch (error) {
                    console.error('Reject site cross error:', error);
                    message.error(
                        error?.response?.data?.detail ||
                            error?.message ||
                            'Не удалось исключить кросс'
                    );
                } finally {
                    setCrossActionLoadingKey('');
                }
            },
        });
    }, [
        currentOem,
        fetchCrossStates,
        fetchTrackingInsights,
        nomenclatureInfo,
        resolveBrandIdByName,
        selectedBrand,
        siteOffersWithCrosses,
    ]);

    const insightTiles = useMemo(() => {
        if (!trackingInsights) {
            return [];
        }
        const exactMinOffer = trackingInsights.exact_min_offer;
        const minOfferWithCrosses = trackingInsights.min_offer_with_crosses;
        const siteExactMinOffer = Array.isArray(siteExactOffers) && siteExactOffers.length
            ? siteExactOffers[0]
            : null;
        const siteCrossMinOffer = Array.isArray(siteOffersWithCrosses)
            && siteOffersWithCrosses.length
            ? siteOffersWithCrosses[0]
            : null;
        const localExactBest = exactMinOffer
            ? {
                source: 'Прайсы',
                provider_name: exactMinOffer.provider_name,
                oem_number: exactMinOffer.oem_number,
                quantity: exactMinOffer.quantity,
                min_delivery_day: exactMinOffer.min_delivery_day,
                max_delivery_day: exactMinOffer.max_delivery_day,
                price: Number(exactMinOffer.price),
            }
            : null;
        const localCrossBest = minOfferWithCrosses
            ? {
                source: 'Прайсы',
                provider_name: minOfferWithCrosses.provider_name,
                oem_number: minOfferWithCrosses.oem_number,
                quantity: minOfferWithCrosses.quantity,
                min_delivery_day: minOfferWithCrosses.min_delivery_day,
                max_delivery_day: minOfferWithCrosses.max_delivery_day,
                price: Number(minOfferWithCrosses.price),
            }
            : null;
        const siteExactBest = siteExactMinOffer
            ? {
                source: 'Dragonzap',
                provider_name: siteExactMinOffer.supplier_name || 'Dragonzap',
                oem_number: siteExactMinOffer.oem,
                quantity: Number(siteExactMinOffer.qnt || 0),
                min_delivery_day: siteExactMinOffer.min_delivery_day,
                max_delivery_day: siteExactMinOffer.max_delivery_day,
                price: Number(siteExactMinOffer.price),
            }
            : null;
        const siteCrossBest = siteCrossMinOffer
            ? {
                source: 'Dragonzap',
                provider_name: siteCrossMinOffer.supplier_name || 'Dragonzap',
                oem_number: siteCrossMinOffer.oem,
                quantity: Number(siteCrossMinOffer.qnt || 0),
                min_delivery_day: siteCrossMinOffer.min_delivery_day,
                max_delivery_day: siteCrossMinOffer.max_delivery_day,
                price: Number(siteCrossMinOffer.price),
            }
            : null;
        const exactCurrentBest = [localExactBest, siteExactBest]
            .filter((item) => item && Number.isFinite(item.price))
            .sort((a, b) => a.price - b.price)[0] || null;
        const crossCurrentBest = [localCrossBest, siteCrossBest]
            .filter((item) => item && Number.isFinite(item.price))
            .sort((a, b) => a.price - b.price)[0] || null;

        const trendLabel = TREND_LABELS[trackingInsights.price_trend] ?? null;
        const trendColor = TREND_COLORS[trackingInsights.price_trend] ?? '#6b7280';
        const peakMonths = Array.isArray(trackingInsights.peak_months)
            ? trackingInsights.peak_months
            : [];

        const tiles = [
            {
                key: 'exact-min',
                tone: 'green',
                title: 'Мин. цена по OEM сейчас',
                value: exactCurrentBest
                    ? `${formatInsightMoney(exactCurrentBest.price)}`
                    : '—',
                subtitle: exactCurrentBest
                    ? `${exactCurrentBest.source} · ${exactCurrentBest.provider_name} · ${exactCurrentBest.quantity} шт · ${formatInsightDelivery(
                        exactCurrentBest.min_delivery_day,
                        exactCurrentBest.max_delivery_day
                    )}`
                    : 'Ни прайсы, ни сайт по точному OEM пока ничего не дали',
                extra: exactCurrentBest?.oem_number
                    ? `OEM: ${exactCurrentBest.oem_number}`
                    : '',
            },
            {
                key: 'cross-min',
                tone: 'blue',
                title: 'Мин. цена с кроссами сейчас',
                value: crossCurrentBest
                    ? `${formatInsightMoney(crossCurrentBest.price)}`
                    : '—',
                subtitle: crossCurrentBest
                    ? `${crossCurrentBest.source} · ${crossCurrentBest.provider_name} · ${crossCurrentBest.quantity} шт · ${formatInsightDelivery(
                        crossCurrentBest.min_delivery_day,
                        crossCurrentBest.max_delivery_day
                    )}`
                    : 'По OEM и кроссам пока нет ни локального, ни site-результата',
                extra: crossCurrentBest
                    ? (
                        crossCurrentBest.oem_number !== normalizedCurrentOem
                            ? `Сработал кросс: ${crossCurrentBest.oem_number}`
                            : 'Лучшее предложение по текущему OEM'
                    )
                    : '',
            },
            {
                key: 'avg-purchase-price',
                tone: 'amber',
                title: 'Средняя цена покупки',
                value: trackingInsights.avg_purchase_price != null
                    ? formatInsightMoney(trackingInsights.avg_purchase_price)
                    : '—',
                subtitle: trackingInsights.last_purchase_price != null
                    ? `Последняя: ${formatInsightMoney(trackingInsights.last_purchase_price)}`
                    : 'Нет данных по фактически полученным заказам',
                extra: trendLabel
                    ? (
                        <span style={{ color: trendColor }}>
                            {trendLabel}
                            {trackingInsights.price_trend_pct != null
                                ? ` (${trackingInsights.price_trend_pct > 0 ? '+' : ''}${trackingInsights.price_trend_pct}%)`
                                : ''}
                        </span>
                    )
                    : 'Тренд: недостаточно данных',
            },
            {
                key: 'markup',
                tone: 'slate',
                title: 'Наценка / маржа',
                value: trackingInsights.markup_percent != null
                    ? `${trackingInsights.markup_percent > 0 ? '+' : ''}${trackingInsights.markup_percent}%`
                    : '—',
                subtitle: trackingInsights.margin_percent != null
                    ? `Маржа: ${trackingInsights.margin_percent > 0 ? '+' : ''}${trackingInsights.margin_percent}%`
                    : 'Нет данных для расчёта',
                extra: 'Наценка = (цена продажи − ср. закупка) / ср. закупка',
            },
            {
                key: 'in-transit',
                tone: 'blue',
                title: 'В пути / в обработке',
                value: `${Number(trackingInsights.in_transit_qty ?? 0).toLocaleString('ru-RU')} шт`,
                subtitle: 'Заказано, но ещё не получено (активные заказы)',
                extra: 'С учётом кроссов',
            },
            {
                key: 'historical-min',
                tone: 'amber',
                title: 'Мин. цена в наших заказах за 1 год',
                value: trackingInsights.historical_min_price_with_crosses != null
                    ? `${formatInsightMoney(trackingInsights.historical_min_price_with_crosses)}`
                    : '—',
                subtitle:
                    trackingInsights.historical_min_price_exact != null
                        ? `Без кроссов: ${formatInsightMoney(trackingInsights.historical_min_price_exact)}`
                        : 'По точному OEM в заказах за год цены не найдено',
                extra: 'Ориентир по тому, как уже покупали через программу',
            },
            {
                key: 'fill-rate',
                tone: 'rose',
                title: 'Исполнение заказов за 1 год',
                value: trackingInsights.fill_rate_percent != null
                    ? `${trackingInsights.fill_rate_percent}%`
                    : '—',
                subtitle: `Получено ${Number(
                    trackingInsights.total_received_quantity_last_year || 0
                ).toLocaleString('ru-RU')} из ${Number(
                    trackingInsights.total_ordered_quantity_last_year || 0
                ).toLocaleString('ru-RU')} шт`,
                extra: trackingInsights.last_received_at
                    ? `Последнее получение: ${formatInsightDateTime(trackingInsights.last_received_at)}`
                    : '',
            },
            {
                key: 'lead-time',
                tone: 'blue',
                title: 'Средний фактический срок',
                value: trackingInsights.average_actual_lead_days != null
                    ? `${trackingInsights.average_actual_lead_days} дн`
                    : '—',
                subtitle: 'Считается по тем заказам, где есть дата фактического получения',
                extra: 'С учётом кроссов.',
            },
        ];

        if (peakMonths.length) {
            const peakStr = peakMonths
                .map((m) => `${m.month_name} (${m.qty} шт)`)
                .join(', ');
            tiles.push({
                key: 'seasonality',
                tone: 'green',
                title: 'Сезонность (пик спроса)',
                value: peakMonths[0]?.month_name ?? '—',
                subtitle: `Топ месяцы: ${peakStr}`,
                extra: `Всего ${(Array.isArray(trackingInsights.seasonality) ? trackingInsights.seasonality : []).reduce((s, m) => s + m.qty, 0)} шт за год с учётом кроссов`,
            });
        }

        return tiles;
    }, [
        normalizedCurrentOem,
        siteExactOffers,
        siteOffersWithCrosses,
        trackingInsights,
    ]);

    const siteDiagnosticsAlert = useMemo(() => {
        if (siteRequestError) {
            return {
                type: 'error',
                message: siteRequestError.userMessage,
                description: (
                    <Space direction="vertical" size={4}>
                        <div>
                            Можно повторить запрос позже или попробовать уточнить бренд для поиска.
                        </div>
                        {siteRequestError.technicalDetails ? (
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                Тех. детали: {siteRequestError.technicalDetails}
                            </div>
                        ) : null}
                    </Space>
                ),
            };
        }
        if (!siteResponseDiagnostics) {
            return null;
        }

        const {
            requestedBrand,
            usingCrossFallback,
            exact,
            crosses,
        } = siteResponseDiagnostics;

        const exactDiagnostic = (
            <div>
                Точный OEM: получено <strong>{exact.rawCount}</strong>, показано{' '}
                <strong>{exact.shownCount}</strong>
                {exact.qtyFilteredCount > 0 ? (
                    <>
                        , скрыто из-за нулевого остатка{' '}
                        <strong>{exact.qtyFilteredCount}</strong>
                    </>
                ) : null}
                {exact.brandFilteredCount > 0 ? (
                    <>
                        , скрыто из-за несовпадения бренда{' '}
                        <strong>{exact.brandFilteredCount}</strong>
                    </>
                ) : null}
                .
            </div>
        );

        const crossDiagnostic = (
            <div>
                OEM + кроссы: получено <strong>{crosses.rawCount}</strong>, показано{' '}
                <strong>{crosses.shownCount}</strong>
                {crosses.qtyFilteredCount > 0 ? (
                    <>
                        , скрыто из-за нулевого остатка{' '}
                        <strong>{crosses.qtyFilteredCount}</strong>
                    </>
                ) : null}
                .
            </div>
        );

        if (usingCrossFallback) {
            return {
                type: 'info',
                message:
                    'По точному OEM сайт ничего не показал, поэтому ниже выведены предложения с учетом кроссов.',
                description: (
                    <Space direction="vertical" size={2}>
                        <div>
                            Запрос на сайт шёл по бренду <strong>{requestedBrand}</strong>.
                        </div>
                        {exactDiagnostic}
                        {crossDiagnostic}
                    </Space>
                ),
            };
        }

        if (!exact.shownCount && !crosses.shownCount) {
            return {
                type: 'warning',
                message: 'Сайт ответил, но к показу не осталось предложений.',
                description: (
                    <Space direction="vertical" size={2}>
                        <div>
                            Запрос на сайт шёл по бренду <strong>{requestedBrand}</strong>.
                        </div>
                        {exactDiagnostic}
                        {crossDiagnostic}
                    </Space>
                ),
            };
        }

        return null;
    }, [siteRequestError, siteResponseDiagnostics]);

    const resolvedTrackingOems = useMemo(() => {
        if (!trackingInsights) {
            return [];
        }
        const raw = Array.isArray(trackingInsights.resolved_oem_numbers)
            ? trackingInsights.resolved_oem_numbers
            : [
                trackingInsights.oem_number,
                ...(trackingInsights.cross_oem_numbers || []),
                ...(trackingInsights.site_cross_oem_numbers || []),
            ];
        const seen = new Set();
        return raw.filter((item) => {
            const value = String(item || '').trim().toUpperCase();
            if (!value || seen.has(value)) {
                return false;
            }
            seen.add(value);
            return true;
        });
    }, [trackingInsights]);

    const ownPriceTiles = useMemo(() => {
        const analysis = trackingInsights?.own_price_analysis;
        if (!analysis) {
            return [];
        }
        const quantityBreakdown = Array.isArray(analysis.current_quantity_breakdown)
            ? analysis.current_quantity_breakdown
            : [];
        return [
            {
                key: 'own-current-qty',
                tone: 'green',
                title: 'Остаток сейчас по нашему прайсу',
                value: `${Number(analysis.current_quantity || 0).toLocaleString('ru-RU')} шт`,
                subtitle: `${analysis.provider_name} · ${analysis.provider_config_name || `Конфиг #${analysis.provider_config_id}`}`,
                extra: (
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        {analysis.latest_pricelist_date ? (
                            <div>
                                Снимок прайса: {formatShortDate(analysis.latest_pricelist_date)}
                            </div>
                        ) : null}
                        {quantityBreakdown.length ? (
                            <div>
                                По OEM:{' '}
                                {quantityBreakdown
                                    .map(
                                        (item) =>
                                            `${item.oem_number} — ${Number(
                                                item.quantity || 0
                                            ).toLocaleString('ru-RU')} шт`
                                    )
                                    .join(' · ')}
                            </div>
                        ) : null}
                    </Space>
                ),
            },
            {
                key: 'own-price',
                tone: 'blue',
                title: 'Текущая цена в нашем прайсе',
                value: analysis.latest_price != null
                    ? `${formatInsightMoney(analysis.latest_price)}`
                    : '—',
                subtitle: 'Берём последнюю найденную цену по OEM и его кроссам',
            },
            {
                key: 'own-arrivals',
                tone: 'amber',
                title: 'Приходы для расчёта',
                value: `${Number(analysis.arrivals_last_30_days || 0).toLocaleString('ru-RU')} шт`,
                subtitle: `За 90 дней: ${Number(analysis.arrivals_last_90_days || 0).toLocaleString('ru-RU')} шт · за 1 год: ${Number(analysis.arrivals_last_365_days || 0).toLocaleString('ru-RU')} шт`,
                extra: 'Считаем по точному OEM и всем кроссам из выборки: приходы из заказов программы + рост остатка между снимками прайса',
            },
            {
                key: 'own-consumption',
                tone: 'amber',
                title: 'Расход по остатку',
                value: `${Number(analysis.sold_last_30_days || 0).toLocaleString('ru-RU')} шт`,
                subtitle: `За 90 дней: ${Number(analysis.sold_last_90_days || 0).toLocaleString('ru-RU')} шт · за 1 год: ${Number(analysis.sold_last_365_days || 0).toLocaleString('ru-RU')} шт`,
                extra: 'Считается по точному OEM и всем кроссам из выборки уже после учёта приходов в каждом интервале',
            },
            {
                key: 'own-days-left',
                tone: 'rose',
                title: 'Оценка, на сколько хватит',
                value: analysis.estimated_days_left_30_days != null
                    ? `${analysis.estimated_days_left_30_days} дн`
                    : '—',
                subtitle: analysis.average_daily_decrease_30_days != null
                    ? `Темп расхода: ${analysis.average_daily_decrease_30_days} шт/день за 30 дней`
                    : 'Недостаточно данных за 30 дней для оценки',
                extra: (() => {
                    const rp = trackingInsights?.reorder_point;
                    const oq = trackingInsights?.optimal_order_qty;
                    const parts = [];
                    if (rp != null) parts.push(`Точка дозаказа: ${rp} шт`);
                    if (oq != null) parts.push(`Оптим. партия: ${oq} шт`);
                    return parts.join(' · ') || '';
                })(),
            },
        ];
    }, [trackingInsights]);

    const combinedInsightTiles = useMemo(
        () => [...insightTiles, ...ownPriceTiles],
        [insightTiles, ownPriceTiles]
    );

    const oemOptions = useMemo(() => {
        const seen = new Set();
        const options = [];

        for (const item of oemHistory) {
            const value = String(item || '').trim();
            if (!value) {
                continue;
            }
            const key = value.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            options.push({
                value,
                label: (
                    <div>
                        <div style={{ fontWeight: 500 }}>
                            {renderHighlightedOem(value, activeLookupQuery)}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 12 }}>
                            История поиска
                        </div>
                    </div>
                ),
            });
        }

        for (const item of lookupResults) {
            const value = String(item.oem_number || '').trim();
            if (!value) {
                continue;
            }
            const key = value.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            options.push({
                value,
                label: (
                    <div>
                        <div style={{ fontWeight: 500 }}>
                            {renderHighlightedOem(
                                item.oem_number,
                                activeLookupQuery
                            )}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 12 }}>
                            {[item.brand, item.name].filter(Boolean).join(' · ') || 'Найдено в базе'}
                        </div>
                    </div>
                ),
            });
        }

        return options;
    }, [activeLookupQuery, lookupResults, oemHistory]);

    useEffect(() => {
        const storedHistory = safeJsonParse(
            safeStorageGet(OEM_HISTORY_KEY),
            []
        );
        if (Array.isArray(storedHistory)) {
            setOemHistory(
                storedHistory
                    .map((item) => String(item || '').trim())
                    .filter((item) => item)
                    .slice(0, 10)
            );
        }

        const storedState = safeJsonParse(
            safeStorageGet(STATE_STORAGE_KEY),
            null
        );
        if (storedState && typeof storedState === 'object') {
            if (Array.isArray(storedState.cartItems)) {
                setCartItems(storedState.cartItems);
            }
            if (Array.isArray(storedState.selectedCartKeys)) {
                setSelectedCartKeys(storedState.selectedCartKeys);
            }
            setShowCrosses(Boolean(storedState.showCrosses));
            setPartialSearch(Boolean(storedState.partialSearch));
            setCurrentOem(storedState.currentOem || '');
            setSelectedBrand(storedState.selectedBrand || '');
            setSelectedCustomerId(
                storedState.selectedCustomerId
                    ? Number(storedState.selectedCustomerId)
                    : null
            );
            if (storedState.currentOem) {
                form.setFieldsValue({ oem: storedState.currentOem });
                setOemInput(storedState.currentOem);
            }
        }
    }, [form]);

    useEffect(() => {
        let isMounted = true;

        const fetchCustomers = async () => {
            setCustomersLoading(true);
            try {
                const { data } = await getCustomersSummary({
                    page: 1,
                    page_size: 200,
                });
                if (!isMounted) {
                    return;
                }
                const items = Array.isArray(data?.items) ? data.items : [];
                const options = items.map((item) => ({
                    value: item.id,
                    label: item.name || `#${item.id}`,
                }));
                setCustomerOptions(options);
                setSelectedCustomerId((prev) => {
                    if (
                        prev != null &&
                        options.some((option) => option.value === prev)
                    ) {
                        return prev;
                    }
                    return null;
                });
            } catch {
                if (isMounted) {
                    setCustomerOptions([]);
                }
            } finally {
                if (isMounted) {
                    setCustomersLoading(false);
                }
            }
        };

        fetchCustomers();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        const payload = buildPersistedOffersState({
            currentOem,
            selectedBrand,
            selectedCustomerId,
            showCrosses,
            partialSearch,
            cartItems,
            selectedCartKeys,
        });
        safeStorageSet(STATE_STORAGE_KEY, JSON.stringify(payload));
    }, [
        currentOem,
        selectedBrand,
        selectedCustomerId,
        showCrosses,
        partialSearch,
        cartItems,
        selectedCartKeys,
    ]);

    useEffect(() => {
        const normalized = String(oemInput || '').trim();
        if (normalized.length < 2) {
            setLookupResults([]);
            setLookupLoading(false);
            return undefined;
        }

        const currentRequestId = lookupRequestIdRef.current + 1;
        lookupRequestIdRef.current = currentRequestId;
        setLookupLoading(true);

        const timerId = window.setTimeout(async () => {
            try {
                const { data } = await searchAutopartsByOem(normalized, 12);
                if (lookupRequestIdRef.current !== currentRequestId) {
                    return;
                }
                setLookupResults(Array.isArray(data) ? data : []);
            } catch {
                if (lookupRequestIdRef.current !== currentRequestId) {
                    return;
                }
                setLookupResults([]);
            } finally {
                if (lookupRequestIdRef.current === currentRequestId) {
                    setLookupLoading(false);
                }
            }
        }, 250);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [oemInput]);

    const pushOemHistory = useCallback((value) => {
        const normalized = String(value || '').trim();
        if (!normalized) {
            return;
        }
        setOemHistory((prev) => {
            const deduped = prev.filter(
                (item) => item.toLowerCase() !== normalized.toLowerCase()
            );
            const next = [normalized, ...deduped].slice(0, 10);
            safeStorageSet(OEM_HISTORY_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const upsertCartItem = (nextItem) => {
        setCartItems((prev) => {
            const existing = prev.find((item) => item.cart_key === nextItem.cart_key);
            if (!existing) {
                return [...prev, nextItem];
            }
            const maxValue = Number(
                nextItem.available_qty ?? existing.available_qty ?? Number.NaN
            );
            return prev.map((item) => {
                if (item.cart_key !== nextItem.cart_key) {
                    return item;
                }
                return {
                    ...item,
                    ...nextItem,
                    order_qty: clampQty(
                        Number(item.order_qty || 1) + 1,
                        maxValue
                    ),
                };
            });
        });
    };

    const addLocalOfferToCart = (record) => {
        upsertCartItem({
            cart_key: buildCartKey('supplier', record),
            source_type: 'supplier',
            autopart_id: record.autopart_id,
            provider_id: record.provider_id,
            provider_name: record.provider_name,
            provider_config_id: record.provider_config_id,
            provider_config_name: record.provider_config_name,
            oem_number: record.oem_number,
            brand_name: record.brand_name,
            name: record.name,
            price: Number(record.price ?? 0),
            available_qty: Number(record.quantity ?? 0),
            order_qty: 1,
            min_delivery_day: record.min_delivery_day,
            max_delivery_day: record.max_delivery_day,
            is_own_price: Boolean(record.is_own_price),
        });
        message.success('Позиция добавлена в корзину');
    };

    const addDragonzapOfferToCart = (record) => {
        const supplierId = record.supplier_id || record.provider_id || null;
        const hashKey = record.hash_key || record.api_hash || null;
        const supplierName = normalizeSupplierName(
            record.supplier_name || record.sup_logo || record.provider_name
        );
        upsertCartItem({
            cart_key: buildCartKey('dragonzap', record),
            source_type: 'dragonzap',
            autopart_id: record.autopart_id ?? null,
            supplier_id: supplierId,
            provider_id: supplierId,
            supplier_name: supplierName,
            provider_name: supplierName || 'Dragonzap',
            oem_number: record.oem || record.oem_number,
            brand_name: record.make_name || record.brand_name,
            name: record.detail_name || record.name,
            price: Number(record.price ?? 0),
            available_qty: Number(record.qnt ?? 0),
            order_qty: 1,
            min_delivery_day: record.min_delivery_day,
            max_delivery_day: record.max_delivery_day,
            hash_key: hashKey,
            system_hash: record.system_hash || null,
        });
        message.success('Позиция добавлена в корзину');
    };

    const updateCartQty = (cartKey, value) => {
        setCartItems((prev) =>
            prev.map((item) => {
                if (item.cart_key !== cartKey) {
                    return item;
                }
                return {
                    ...item,
                    order_qty: clampQty(value, Number(item.available_qty)),
                };
            })
        );
    };

    const removeCartItem = (cartKey) => {
        setCartItems((prev) => prev.filter((item) => item.cart_key !== cartKey));
        setSelectedCartKeys((prev) => prev.filter((key) => key !== cartKey));
    };

    const clearCartItems = (keys) => {
        const keySet = new Set(keys);
        setCartItems((prev) => prev.filter((item) => !keySet.has(item.cart_key)));
        setSelectedCartKeys((prev) => prev.filter((key) => !keySet.has(key)));
    };

    const showDragonzapBasketConflict = useCallback((detail, processedCount = 0) => {
        Modal.warning({
            title: 'Не удалось автоматически очистить корзину Dragonzap',
            okText: 'Понятно',
            width: 560,
            content: (
                <Space direction="vertical" size="small">
                    <div>
                        Отправка остановлена, потому что в корзине Dragonzap
                        остались старые позиции и автоматическая очистка не
                        сработала.
                    </div>
                    <div style={{ color: '#4b5563' }}>
                        {detail}
                    </div>
                    {processedCount > 0 ? (
                        <div style={{ color: '#92400e' }}>
                            Часть выбранных позиций уже успела оформиться:
                            {' '}
                            {processedCount}.
                            {' '}
                            Их мы уже убрали из локальной корзины.
                        </div>
                    ) : null}
                    <div style={{ color: '#1d4ed8' }}>
                        Очисти корзину на сайте Dragonzap вручную и потом
                        повтори отправку.
                    </div>
                </Space>
            ),
        });
    }, []);

    const executeSearch = useCallback(async (
        oemValue,
        usePartialSearch,
        brandHint = ''
    ) => {
        if (!oemValue) {
            message.warning('Введите OEM номер');
            return '';
        }
        setLoading(true);
        setTrackingHistoryLoading(true);
        setHistoricalOffers([]);
        setRemoteOffers([]);
        setSiteExactOffers([]);
        setSiteOffersWithCrosses([]);
        setSiteResponseDiagnostics(null);
        setSiteRequestError(null);
        setTrackingHistory([]);
        setTrackingInsights(null);
        setRemoteMeta({ total: 0 });
        setSiteBrandCandidates([]);
        setSiteBrandWarning(null);
        setBestSupplierQty(1);
        try {
            const { data } = await getAutopartOffers(
                oemValue,
                usePartialSearch
            );
            const list = Array.isArray(data?.offers) ? data.offers : [];
            const historicalList = Array.isArray(data?.historical_offers)
                ? data.historical_offers
                : [];
            const filtered = list.filter(
                (item) => (item.quantity ?? 0) > 0
            );
            const filteredHistorical = historicalList.filter(
                (item) => (item.quantity ?? 0) > 0
            );
            const sortedByPrice = [...filtered].sort((a, b) => {
                const aPrice = Number(a.price ?? Number.POSITIVE_INFINITY);
                const bPrice = Number(b.price ?? Number.POSITIVE_INFINITY);
                return aPrice - bPrice;
            });
            const sortedHistorical = [...filteredHistorical].sort((a, b) => {
                const aDate = String(a.pricelist_date || '');
                const bDate = String(b.pricelist_date || '');
                if (aDate !== bDate) {
                    return bDate.localeCompare(aDate);
                }
                const aPrice = Number(a.price ?? Number.POSITIVE_INFINITY);
                const bPrice = Number(b.price ?? Number.POSITIVE_INFINITY);
                return aPrice - bPrice;
            });
            setOffers(sortedByPrice);
            setHistoricalOffers(sortedHistorical);
            setNomenclatureInfo({
                in_nomenclature: data?.in_nomenclature ?? false,
                id: data?.nomenclature_autopart_id ?? null,
                brand: data?.nomenclature_brand_name ?? null,
                name: data?.nomenclature_name ?? null,
            });
            setCurrentOem(oemValue);
            setOemInput(oemValue);
            pushOemHistory(oemValue);
            const fallbackBrand = [...list, ...historicalList].find(
                (item) => item.brand_name
            )?.brand_name;
            const resolvedBrand = brandHint || fallbackBrand || '';
            const siteBrandsResponse = await getDragonzapBrands(oemValue).catch(
                () => null
            );
            const candidates = normalizeDragonzapBrandCandidates(
                siteBrandsResponse?.data
            );
            setSiteBrandCandidates(candidates);
            const siteSuggestedBrand = pickBestDragonzapBrand(candidates);
            if (
                resolvedBrand &&
                siteSuggestedBrand &&
                String(resolvedBrand).trim().toUpperCase() !==
                    String(siteSuggestedBrand).trim().toUpperCase()
            ) {
                setSiteBrandWarning({
                    type: 'warning',
                    message:
                        `Для сайта по этому OEM вероятнее бренд ${siteSuggestedBrand}.`,
                    description:
                        `В локальных прайсах позиция найдена как ${resolvedBrand}, ` +
                        `но Dragonzap может отвечать только по бренду ${siteSuggestedBrand}. ` +
                        'Если прямой запрос будет пустым, программа попробует этот бренд автоматически.',
                });
            }
            const effectiveBrand = (
                !resolvedBrand ||
                String(resolvedBrand).trim().toUpperCase() === 'DRAGONZAP'
            ) && siteSuggestedBrand
                ? siteSuggestedBrand
                : resolvedBrand;
            const trackingResponse = await getTrackingOrderItems({
                oem: oemValue,
                brand: effectiveBrand || undefined,
                sync_site: true,
                include_crosses: true,
                limit: 1000,
                site_cross_oems: undefined,
            }).catch(() => null);
            const trackingRows = Array.isArray(trackingResponse?.data)
                ? trackingResponse.data
                : [];
            setTrackingHistory(trackingRows);
            await fetchTrackingInsights({
                oemValue,
                brandValue: effectiveBrand || siteSuggestedBrand || '',
                extraOemNumbers: [],
            });
            setSelectedBrand(effectiveBrand || siteSuggestedBrand || '');
            if (!filtered.length) {
                if (sortedHistorical.length) {
                    message.info(
                        'В актуальных прайсах ничего не найдено. ' +
                        'Ниже показана последняя история по старым прайсам.'
                    );
                } else {
                    message.info('В актуальных прайсах ничего не найдено');
                }
            }
            return effectiveBrand || siteSuggestedBrand || '';
        } catch (error) {
            console.error('Fetch offers error:', error);
            message.error('Ошибка получения данных');
            return '';
        } finally {
            setLoading(false);
            setTrackingHistoryLoading(false);
        }
    }, [fetchTrackingInsights, pushOemHistory]);

    const handleSearch = async (values) => {
        const oemValue = (values.oem || '').trim();
        await executeSearch(oemValue, partialSearch);
    };

    const requestDragonzapOffers = useCallback(async (oemValue, brandValue) => {
        let effectiveBrand = String(brandValue || '').trim();
        if (!oemValue) {
            message.warning('Введите OEM номер');
            return;
        }
        if (!effectiveBrand) {
            const brandsResponse = await getDragonzapBrands(oemValue).catch(
                () => null
            );
            const candidates = normalizeDragonzapBrandCandidates(
                brandsResponse?.data
            );
            setSiteBrandCandidates(candidates);
            effectiveBrand = pickBestDragonzapBrand(candidates);
            if (effectiveBrand) {
                setSelectedBrand(effectiveBrand);
            }
        }
        if (!effectiveBrand) {
            message.warning(
                'Не удалось определить бренд для запроса. ' +
                'Уточните бренд вручную или добавьте позицию в номенклатуру.'
            );
            return;
        }
        setRemoteLoading(true);
        setSiteBrandWarning(null);
        setSiteRequestError(null);
        setSiteResponseDiagnostics(null);
        try {
            const normalizeSiteResponse = (payload, requestedBrand, allowCrosses) => {
                const responseBrandCandidates = normalizeDragonzapBrandCandidates(
                    payload?.site_brand_candidates
                );
                const queryBrands = Array.isArray(payload?.query_brands)
                    ? payload.query_brands
                        .map((brand) => String(brand || '').toLowerCase())
                        .filter((brand) => brand)
                    : [];
                const rawList = Array.isArray(payload)
                    ? payload
                    : Array.isArray(payload?.data)
                        ? payload.data
                        : [];
                const normalizedList = rawList.map((item) => {
                    const oem =
                        item.oem ??
                        item.oem_number ??
                        item.article ??
                        item.artikul ??
                        item.part_number;
                    const price =
                        item.price ??
                        item.price_rub ??
                        item.price_total ??
                        item.price_total_rub ??
                        item.price_with_markup ??
                        item.cost;
                    const supplierName =
                        normalizeSupplierName(
                            item.supplier_name ??
                                item.supplier ??
                                item.supplier_title ??
                                item.supplier_company ??
                                item.provider ??
                                item.seller_name ??
                                item.price_name ??
                                item.sup_logo
                        );
                    const quantity =
                        item.qnt ??
                        item.quantity ??
                        item.qty ??
                        item.balance ??
                        item.stock;
                    const detailName =
                        item.detail_name ??
                        item.name ??
                        item.autopart_name ??
                        item.title;
                    const makeName =
                        item.make_name ??
                        item.brand ??
                        item.brand_name;
                    const minDelivery =
                        item.min_delivery_day ??
                        item.min_delivery ??
                        item.min_delivery_days;
                    const maxDelivery =
                        item.max_delivery_day ??
                        item.max_delivery ??
                        item.max_delivery_days;
                    const supplierId =
                        item.supplier_id ??
                        item.provider_id ??
                        item?.provider?.id ??
                        null;
                    const hashKey =
                        item.hash_key ??
                        item.api_hash ??
                        item.system_hash ??
                        null;
                    return {
                        ...item,
                        oem,
                        price,
                        supplier_id: supplierId,
                        supplier_name: supplierName,
                        qnt: quantity,
                        detail_name: detailName,
                        make_name: makeName,
                        min_delivery_day: minDelivery,
                        max_delivery_day: maxDelivery,
                        hash_key: hashKey,
                    };
                });
                const qtyFiltered = normalizedList.filter((item) => {
                    const qty = Number(item.qnt ?? 0);
                    if (Number.isNaN(qty) || qty <= 0) {
                        return false;
                    }
                    return true;
                });
                const qtyFilteredCount = normalizedList.length - qtyFiltered.length;
                const filtered = qtyFiltered.filter((item) => {
                    if (allowCrosses || !requestedBrand) {
                        return true;
                    }
                    const itemBrand = (item.make_name || '').toLowerCase();
                    const responseRequestedBrand = (
                        item?.sys_info?.requested_make_name ||
                        item?.query_brand ||
                        ''
                    ).toLowerCase();
                    if (queryBrands.length) {
                        return (
                            queryBrands.includes(itemBrand) ||
                            queryBrands.includes(responseRequestedBrand)
                        );
                    }
                    return itemBrand === requestedBrand.toLowerCase();
                });
                const brandFilteredCount = qtyFiltered.length - filtered.length;
                const sortedByPrice = [...filtered].sort((a, b) => {
                    const aPrice = Number(a.price ?? Number.POSITIVE_INFINITY);
                    const bPrice = Number(b.price ?? Number.POSITIVE_INFINITY);
                    return aPrice - bPrice;
                });
                return {
                    offers: sortedByPrice,
                    responseBrandCandidates,
                    fallbackBrand: Array.isArray(payload?.query_brands)
                        ? String(payload.query_brands[0] || '').trim()
                        : '',
                    usedFallbackBrand: Boolean(payload?.used_fallback_brand),
                    rawCount: normalizedList.length,
                    shownCount: sortedByPrice.length,
                    qtyFilteredCount,
                    brandFilteredCount,
                };
            };

            const [exactResponse, crossResponse] = await Promise.all([
                getDragonzapOffers(oemValue, effectiveBrand, true),
                getDragonzapOffers(oemValue, effectiveBrand, false),
            ]);
            const exactParsed = normalizeSiteResponse(
                exactResponse?.data,
                effectiveBrand,
                false
            );
            const crossParsed = normalizeSiteResponse(
                crossResponse?.data,
                effectiveBrand,
                true
            );
            const filteredCrossOffers = crossParsed.offers.filter((offer) => {
                const normalizedOfferOem = String(
                    offer?.oem || offer?.oem_number || ''
                ).trim().toUpperCase();
                if (
                    !normalizedOfferOem ||
                    normalizedOfferOem ===
                        String(oemValue || '').trim().toUpperCase()
                ) {
                    return true;
                }
                return !invalidCrossKeySet.has(
                    normalizeCrossKey(
                        offer?.make_name || offer?.brand_name,
                        normalizedOfferOem
                    )
                );
            });
            crossParsed.offers = filteredCrossOffers;
            crossParsed.shownCount = filteredCrossOffers.length;
            const activeParsed = showCrosses ? crossParsed : exactParsed;
            const usingCrossFallback =
                !showCrosses &&
                !exactParsed.offers.length &&
                crossParsed.offers.length > 0;
            const nextSiteCrossOems = extractUniqueCrossOems(
                crossParsed.offers,
                oemValue
            );
            const displayedOffers = usingCrossFallback
                ? crossParsed.offers
                : activeParsed.offers;

            setSiteExactOffers(exactParsed.offers);
            setSiteOffersWithCrosses(crossParsed.offers);
            setSiteResponseDiagnostics({
                requestedBrand: effectiveBrand,
                usingCrossFallback,
                exact: {
                    rawCount: exactParsed.rawCount,
                    shownCount: exactParsed.shownCount,
                    qtyFilteredCount: exactParsed.qtyFilteredCount,
                    brandFilteredCount: exactParsed.brandFilteredCount,
                },
                crosses: {
                    rawCount: crossParsed.rawCount,
                    shownCount: crossParsed.shownCount,
                    qtyFilteredCount: crossParsed.qtyFilteredCount,
                    brandFilteredCount: crossParsed.brandFilteredCount,
                },
            });

            if (activeParsed.responseBrandCandidates.length) {
                setSiteBrandCandidates(activeParsed.responseBrandCandidates);
            }
            if (
                activeParsed.usedFallbackBrand &&
                activeParsed.fallbackBrand &&
                activeParsed.fallbackBrand !== effectiveBrand
            ) {
                setSelectedBrand(activeParsed.fallbackBrand);
                setSiteBrandWarning({
                    type: 'warning',
                    message:
                        `Сайт не вернул данные по бренду ${effectiveBrand}.`,
                    description:
                        `Автоматически переключили поиск на ${activeParsed.fallbackBrand} и показали найденные предложения.`,
                });
                message.info(
                    `По бренду ${effectiveBrand} сайт ничего не вернул. ` +
                    `Показаны результаты по бренду ${activeParsed.fallbackBrand}.`
                );
            } else if (
                activeParsed.responseBrandCandidates.length &&
                effectiveBrand &&
                String(activeParsed.responseBrandCandidates[0]?.brand || '').toUpperCase() !==
                    effectiveBrand.toUpperCase()
            ) {
                setSiteBrandWarning({
                    type: 'info',
                    message:
                        `На сайте есть и другой бренд для этого OEM: ${activeParsed.responseBrandCandidates[0].brand}.`,
                    description:
                        'Если результаты по текущему бренду выглядят неполными, можно быстро переключить запрос на подсказанный бренд.',
                });
            }

            setRemoteOffers(displayedOffers);
            setRemoteMeta({ total: displayedOffers.length });
            const [trackingResponse] = await Promise.all([
                getTrackingOrderItems({
                    oem: oemValue,
                    brand: effectiveBrand || undefined,
                    sync_site: true,
                    include_crosses: true,
                    limit: 1000,
                    site_cross_oems: nextSiteCrossOems.length
                        ? nextSiteCrossOems.join(',')
                        : undefined,
                }).catch(() => null),
                fetchTrackingInsights({
                    oemValue,
                    brandValue: effectiveBrand,
                    extraOemNumbers: nextSiteCrossOems,
                }),
            ]);
            const trackingRows = Array.isArray(trackingResponse?.data)
                ? trackingResponse.data
                : [];
            setTrackingHistory(trackingRows);
            if (usingCrossFallback) {
                message.info(
                    'По точному OEM сайт ничего не вернул. Показаны предложения с учетом кроссов.'
                );
            } else if (!exactParsed.offers.length && !crossParsed.offers.length) {
                message.info(
                    'Сайт ничего не показал ни по точному OEM, ни по запросу с учетом кроссов.'
                );
            }
        } catch (error) {
            console.error('Dragonzap request error:', error);
            const describedError = describeDragonzapRequestError(error);
            setSiteRequestError(describedError);
            message.error(describedError.userMessage);
        } finally {
            setRemoteLoading(false);
        }
    }, [fetchTrackingInsights, invalidCrossKeySet, showCrosses]);

    useEffect(() => {
        if (!siteExactOffers.length && !siteOffersWithCrosses.length) {
            return;
        }
        const nextOffers = showCrosses
            ? siteOffersWithCrosses
            : (siteExactOffers.length ? siteExactOffers : siteOffersWithCrosses);
        setRemoteOffers(nextOffers);
        setRemoteMeta({ total: nextOffers.length });
    }, [showCrosses, siteExactOffers, siteOffersWithCrosses]);

    const handleDragonzapRequest = async () => {
        const oemValue = currentOem || form.getFieldValue('oem');
        const brandValue = selectedBrand;
        await requestDragonzapOffers(oemValue, brandValue);
    };

    useEffect(() => {
        const oemValue = String(searchParams.get('oem') || '').trim();
        const brandValue = String(searchParams.get('brand') || '').trim();
        const shouldAutoSearch = searchParams.get('auto') === '1';
        if (!shouldAutoSearch || !oemValue) {
            return;
        }

        const requestKey = `${oemValue}::${brandValue}`;
        if (autoSearchKeyRef.current === requestKey) {
            return;
        }
        autoSearchKeyRef.current = requestKey;

        form.setFieldsValue({ oem: oemValue });
        setOemInput(oemValue);

        void (async () => {
            const resolvedBrand = await executeSearch(
                oemValue,
                false,
                brandValue
            );
            const effectiveBrand = brandValue || resolvedBrand;
            if (effectiveBrand) {
                await requestDragonzapOffers(oemValue, effectiveBrand);
            }
        })();
    }, [executeSearch, form, requestDragonzapOffers, searchParams]);

    const filteredOffers = useMemo(() => {
        const brandNeedle = localFilters.brand.trim().toLowerCase();
        const providerNeedle = localFilters.provider.trim().toLowerCase();
        const minPrice = localFilters.minPrice;
        const maxPrice = localFilters.maxPrice;
        const minQty = localFilters.minQty;
        const maxDelivery = localFilters.maxDelivery;

        return offers.filter((item) => {
            const brandValue = (item.brand_name || '').toLowerCase();
            const providerValue = (item.provider_name || '').toLowerCase();
            const priceValue = Number(item.price ?? Number.NaN);
            const qtyValue = Number(item.quantity ?? Number.NaN);
            const deliveryValue = Number(
                item.min_delivery_day ?? item.max_delivery_day ?? Number.NaN
            );

            if (brandNeedle && !brandValue.includes(brandNeedle)) {
                return false;
            }
            if (providerNeedle && !providerValue.includes(providerNeedle)) {
                return false;
            }
            if (minPrice != null) {
                if (Number.isNaN(priceValue) || priceValue < minPrice) {
                    return false;
                }
            }
            if (maxPrice != null) {
                if (Number.isNaN(priceValue) || priceValue > maxPrice) {
                    return false;
                }
            }
            if (minQty != null) {
                if (Number.isNaN(qtyValue) || qtyValue < minQty) {
                    return false;
                }
            }
            if (maxDelivery != null) {
                if (Number.isNaN(deliveryValue) || deliveryValue > maxDelivery) {
                    return false;
                }
            }
            return true;
        });
    }, [offers, localFilters]);

    const effectiveCartItems = useMemo(() => {
        if (!selectedCartKeys.length) {
            return cartItems;
        }
        const selectedSet = new Set(selectedCartKeys);
        return cartItems.filter((item) => selectedSet.has(item.cart_key));
    }, [cartItems, selectedCartKeys]);

    const selectedSupplierCartItems = useMemo(
        () => effectiveCartItems.filter((item) => item.source_type === 'supplier'),
        [effectiveCartItems]
    );

    const selectedDragonzapCartItems = useMemo(
        () => effectiveCartItems.filter((item) => item.source_type === 'dragonzap'),
        [effectiveCartItems]
    );

    const cartSummary = useMemo(() => {
        return cartItems.reduce(
            (acc, item) => {
                acc.total += 1;
                acc.sum += Number(item.price ?? 0) * Number(item.order_qty ?? 0);
                if (item.source_type === 'supplier') {
                    acc.supplier += 1;
                } else if (item.source_type === 'dragonzap') {
                    acc.dragonzap += 1;
                }
                return acc;
            },
            { total: 0, supplier: 0, dragonzap: 0, sum: 0 }
        );
    }, [cartItems]);

    const resetLocalFilters = () => {
        setLocalFilters({
            brand: '',
            provider: '',
            minPrice: null,
            maxPrice: null,
            minQty: null,
            maxDelivery: null,
        });
    };

    const handleCreateSupplierOrders = async (sendNow = false) => {
        if (!selectedSupplierCartItems.length) {
            message.warning(
                selectedCartKeys.length
                    ? 'В выбранных строках нет позиций из прайсов поставщиков'
                    : 'Добавьте в корзину позиции из прайсов поставщиков'
            );
            return;
        }

        const groups = selectedSupplierCartItems.reduce((acc, item) => {
            const key = String(item.provider_id);
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(item);
            return acc;
        }, {});

        const createdOrderIds = [];
        const processedKeys = [];
        const failedProviders = [];

        setCartSubmitting(true);
        try {
            for (const [providerId, items] of Object.entries(groups)) {
                try {
                    const { data } = await createManualSupplierOrder({
                        provider_id: Number(providerId),
                        items: items.map((item) => ({
                            autopart_id: item.autopart_id,
                            oem: item.oem_number,
                            brand: item.brand_name,
                            name: item.name,
                            quantity: Number(item.order_qty),
                            price: Number(item.price),
                            min_delivery_day: item.min_delivery_day,
                            max_delivery_day: item.max_delivery_day,
                        })),
                    });
                    if (data?.id) {
                        createdOrderIds.push(data.id);
                    }
                    processedKeys.push(...items.map((item) => item.cart_key));
                } catch {
                    failedProviders.push(
                        items[0]?.provider_name || `#${providerId}`
                    );
                }
            }

            if (sendNow && createdOrderIds.length) {
                const { data } = await sendSupplierOrders(createdOrderIds);
                message.success(
                    `Создано ${createdOrderIds.length} заказов. Отправлено ${data?.sent || 0}, ошибок ${data?.failed || 0}.`
                );
            } else if (createdOrderIds.length) {
                message.success(
                    `Создано ${createdOrderIds.length} заказов поставщикам.`
                );
            }

            if (failedProviders.length) {
                message.error(
                    `Не удалось создать заказы для: ${failedProviders.join(', ')}`
                );
            }

            if (processedKeys.length) {
                clearCartItems(processedKeys);
                await markReplacedItemRemoved();
            }
        } catch (error) {
            const detail =
                error?.response?.data?.detail ||
                'Не удалось создать заказы поставщикам';
            message.error(detail);
        } finally {
            setCartSubmitting(false);
        }
    };

    const handleSendDragonzapCart = async () => {
        if (!selectedDragonzapCartItems.length) {
            message.warning(
                selectedCartKeys.length
                    ? 'В выбранных строках нет позиций с сайта'
                    : 'Добавьте в корзину позиции с сайта'
            );
            return;
        }
        if (!selectedCustomerId) {
            message.warning(
                'Выберите клиента, от имени которого нужно оформить заказ на Dragonzap'
            );
            return;
        }

        const invalidItems = selectedDragonzapCartItems.filter(
            (item) =>
                !item.hash_key ||
                (!item.supplier_id && !normalizeSupplierName(item.supplier_name))
        );
        if (invalidItems.length) {
            const invalidPreview = invalidItems
                .slice(0, 3)
                .map((item) => item.oem_number || item.name || item.cart_key)
                .join(', ');
            message.error(
                `У части позиций сайта не хватает данных для заказа (${invalidPreview}). Нужны hash_key и поставщик.`
            );
            return;
        }

        const groups = selectedDragonzapCartItems.reduce((acc, item) => {
            const supplierName = normalizeSupplierName(
                item.supplier_name || item.provider_name
            );
            const key =
                item.supplier_id != null
                    ? `id:${item.supplier_id}`
                    : `name:${supplierName}`;
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(item);
            return acc;
        }, {});

        const processedKeys = [];
        const failedSuppliers = [];

        setCartSubmitting(true);
        try {
            for (const [supplierId, items] of Object.entries(groups)) {
                try {
                    const payload = items.map((item) => ({
                        autopart_id: item.autopart_id ?? null,
                        oem_number: item.oem_number,
                        brand_name: item.brand_name,
                        autopart_name: item.name,
                        supplier_id:
                            item.supplier_id != null
                                ? Number(item.supplier_id)
                                : null,
                        supplier_name: normalizeSupplierName(
                            item.supplier_name || item.provider_name
                        ),
                        quantity: Number(item.order_qty),
                        confirmed_price: Number(item.price),
                        min_delivery_day: item.min_delivery_day,
                        max_delivery_day: item.max_delivery_day,
                        status: 'Send',
                        tracking_uuid: item.cart_key,
                        hash_key: item.hash_key,
                        system_hash: item.system_hash,
                    }));
                    const { data } = await sendDragonzapOrder(
                        payload,
                        selectedCustomerId
                    );
                    const successfulKeys = Array.isArray(data?.results)
                        ? data.results
                            .filter((result) => result?.status === 'success')
                            .map(
                                (result) =>
                                    result.request_tracking_uuid ||
                                    result.tracking_uuid
                            )
                        : [];
                    processedKeys.push(...successfulKeys);
                    if ((data?.successful_items || 0) > 0) {
                        message.success(
                            `Dragonzap: оформлен заказ по поставщику ${items[0]?.provider_name || supplierId} (${data.successful_items} поз.).`
                        );
                    }
                    if ((data?.failed_items || 0) > 0) {
                        const resultErrors = Array.isArray(data?.results)
                            ? data.results
                                .filter((result) => result?.status !== 'success')
                                .map((result) => String(result?.message || '').trim())
                                .filter(Boolean)
                            : [];
                        const uniqueErrors = [...new Set(resultErrors)].slice(0, 3);
                        failedSuppliers.push(
                            uniqueErrors.length
                                ? `${items[0]?.provider_name || `#${supplierId}`}: ${uniqueErrors.join(' | ')}`
                                : items[0]?.provider_name || `#${supplierId}`
                        );
                    }
                } catch (error) {
                    const statusCode = error?.response?.status;
                    const errorMessage = extractRequestError(
                        error,
                        'Ошибка отправки на Dragonzap'
                    );
                    if (statusCode === 409) {
                        if (processedKeys.length) {
                            clearCartItems(processedKeys);
                        }
                        showDragonzapBasketConflict(
                            errorMessage,
                            processedKeys.length
                        );
                        return;
                    }
                    failedSuppliers.push(
                        `${items[0]?.provider_name || `#${supplierId}`}: ${errorMessage}`
                    );
                }
            }

            if (processedKeys.length) {
                clearCartItems(processedKeys);
                await markReplacedItemRemoved();
            }
            if (failedSuppliers.length) {
                message.error(
                    `Не удалось оформить заказ через Dragonzap для: ${failedSuppliers.join(', ')}`
                );
            }
        } finally {
            setCartSubmitting(false);
        }
    };

    const localColumns = [
        {
            title: 'OEM',
            dataIndex: 'oem_number',
            key: 'oem_number',
            width: 112,
            ellipsis: true,
        },
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            key: 'brand_name',
            width: 88,
            ellipsis: true,
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
            width: 180,
        },
        {
            title: 'Источник',
            key: 'source',
            width: 170,
            ellipsis: true,
            render: (_, record) => (
                <div className="autopart-offers-source-cell">
                    <div className="autopart-offers-source-title">{record.provider_name}</div>
                    <div className="autopart-offers-source-meta">
                        {record.provider_config_name || 'Основной прайс'}
                        {record.is_own_price ? ' · Наш прайс' : ''}
                    </div>
                </div>
            ),
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 82,
            sorter: (a, b) => {
                const aPrice = Number(a.price ?? Number.POSITIVE_INFINITY);
                const bPrice = Number(b.price ?? Number.POSITIVE_INFINITY);
                return aPrice - bPrice;
            },
            defaultSortOrder: 'ascend',
            render: (value) =>
                value === null || value === undefined ? '—' : Number(value).toFixed(2),
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 62,
            sorter: (a, b) => {
                const aQty = Number(a.quantity ?? Number.NEGATIVE_INFINITY);
                const bQty = Number(b.quantity ?? Number.NEGATIVE_INFINITY);
                return aQty - bQty;
            },
        },
        {
            title: 'Срок',
            key: 'delivery',
            width: 72,
            sorter: (a, b) => {
                const aVal = Number(a.min_delivery_day ?? a.max_delivery_day ?? Number.POSITIVE_INFINITY);
                const bVal = Number(b.min_delivery_day ?? b.max_delivery_day ?? Number.POSITIVE_INFINITY);
                return aVal - bVal;
            },
            render: (_, record) => {
                const min = record.min_delivery_day;
                const max = record.max_delivery_day;
                if (min == null && max == null) {
                    return '—';
                }
                return `${min ?? '?'} - ${max ?? '?'}`;
            },
        },
        {
            title: 'Обновлён',
            dataIndex: 'pricelist_date',
            key: 'pricelist_date',
            width: 86,
            render: (value) => formatShortDate(value),
        },
        {
            title: '',
            key: 'price_history',
            width: 48,
            render: (_, record) => (
                <Tooltip title="График цен">
                    <Button
                        size="small"
                        type="text"
                        shape="circle"
                        icon={<LineChartOutlined />}
                        onClick={() => navigate(`/autoparts/price-history?oem=${encodeURIComponent(record.oem_number)}`)}
                    />
                </Tooltip>
            ),
        },
        {
            title: '',
            key: 'add_to_cart',
            width: 48,
            render: (_, record) => (
                <Tooltip title="Добавить в корзину">
                    <Button
                        size="small"
                        type="text"
                        shape="circle"
                        icon={<ShoppingCartOutlined />}
                        onClick={() => addLocalOfferToCart(record)}
                    />
                </Tooltip>
            ),
        },
    ];

    const historicalColumns = [
        ...localColumns
            .filter((column) => column.key !== 'add_to_cart')
            .map((column) => {
            if (column.key === 'source') {
                return {
                    ...column,
                    render: (_, record) => (
                        <div>
                            <div style={{ fontWeight: 500 }}>{record.provider_name}</div>
                            <div style={{ color: '#b45309', fontSize: 12 }}>
                                {record.provider_config_name || 'Основной прайс'} ·
                                {' '}нет в свежем прайсе
                            </div>
                        </div>
                    ),
                };
            }
            return column;
        }),
    ];

    const remoteColumns = [
        { title: 'OEM', dataIndex: 'oem', key: 'oem', width: 112 },
        { title: 'Бренд', dataIndex: 'make_name', key: 'make_name', width: 88, ellipsis: true },
        { title: 'Наименование', dataIndex: 'detail_name', key: 'detail_name', ellipsis: true, width: 180 },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 82,
            sorter: (a, b) => {
                const aPrice = Number(a.price ?? Number.POSITIVE_INFINITY);
                const bPrice = Number(b.price ?? Number.POSITIVE_INFINITY);
                return aPrice - bPrice;
            },
            render: (value) =>
                value === null || value === undefined ? '—' : Number(value).toFixed(2),
        },
        {
            title: 'Кол-во',
            dataIndex: 'qnt',
            key: 'qnt',
            width: 62,
            render: (value) => (value === null || value === undefined ? '—' : value),
        },
        {
            title: 'Срок',
            key: 'delivery',
            width: 72,
            sorter: (a, b) => {
                const aVal = Number(a.min_delivery_day ?? a.max_delivery_day ?? Number.POSITIVE_INFINITY);
                const bVal = Number(b.min_delivery_day ?? b.max_delivery_day ?? Number.POSITIVE_INFINITY);
                return aVal - bVal;
            },
            render: (_, record) => {
                const min = record.min_delivery_day;
                const max = record.max_delivery_day;
                if (min == null && max == null) {
                    return '—';
                }
                return `${min ?? '?'} - ${max ?? '?'}`;
            },
        },
        {
            title: 'Поставщик',
            dataIndex: 'supplier_name',
            key: 'supplier_name',
            width: 130,
            render: (value) => value || '—',
        },
        { title: 'Комментарий', dataIndex: 'comment', key: 'comment', ellipsis: true, width: 140 },
        {
            title: '',
            key: 'price_history',
            width: 48,
            render: (_, record) => {
                const oem = record.oem || record.oem_number;
                return (
                    <Tooltip title="График цен">
                        <Button
                            size="small"
                            type="text"
                            shape="circle"
                            icon={<LineChartOutlined />}
                            onClick={() => {
                                if (!oem) return;
                                navigate(`/autoparts/price-history?oem=${encodeURIComponent(oem)}`);
                            }}
                        />
                    </Tooltip>
                );
            },
        },
        {
            title: '',
            key: 'add_to_cart',
            width: 48,
            render: (_, record) => (
                <Tooltip title="Добавить в корзину">
                    <Button
                        size="small"
                        type="text"
                        shape="circle"
                        icon={<ShoppingCartOutlined />}
                        onClick={() => addDragonzapOfferToCart(record)}
                    />
                </Tooltip>
            ),
        },
    ];

    const cartColumns = [
        {
            title: 'Источник',
            dataIndex: 'source_type',
            key: 'source_type',
            width: 92,
            render: (value) => (
                <Tag color={value === 'dragonzap' ? 'blue' : 'green'}>
                    {value === 'dragonzap' ? 'Сайт' : 'Прайс'}
                </Tag>
            ),
        },
        {
            title: 'OEM',
            dataIndex: 'oem_number',
            key: 'oem_number',
            width: 130,
            ellipsis: true,
        },
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            key: 'brand_name',
            width: 110,
            ellipsis: true,
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            width: 220,
            ellipsis: true,
        },
        {
            title: 'Поставщик',
            dataIndex: 'provider_name',
            key: 'provider_name',
            width: 180,
            ellipsis: true,
            render: (value, record) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{value || '—'}</div>
                    {record.provider_config_name ? (
                        <div style={{ color: '#6b7280', fontSize: 12 }}>
                            {record.provider_config_name}
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 90,
            render: (value) =>
                value === null || value === undefined ? '—' : Number(value).toFixed(2),
        },
        {
            title: 'Доступно',
            dataIndex: 'available_qty',
            key: 'available_qty',
            width: 82,
            render: (value) => value ?? '—',
        },
        {
            title: 'В заказ',
            dataIndex: 'order_qty',
            key: 'order_qty',
            width: 95,
            render: (value, record) => (
                <InputNumber
                    min={1}
                    max={Number(record.available_qty) > 0 ? Number(record.available_qty) : undefined}
                    value={value}
                    size="small"
                    style={{ width: '100%' }}
                    onChange={(nextValue) => updateCartQty(record.cart_key, nextValue)}
                />
            ),
        },
        {
            title: 'Срок',
            key: 'delivery',
            width: 90,
            render: (_, record) => {
                const min = record.min_delivery_day;
                const max = record.max_delivery_day;
                if (min == null && max == null) {
                    return '—';
                }
                return `${min ?? '?'} - ${max ?? '?'}`;
            },
        },
        {
            title: '',
            key: 'remove',
            width: 64,
            render: (_, record) => (
                <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => removeCartItem(record.cart_key)}
                />
            ),
        },
    ];

    return (
        <Card title="Поиск позиций по артикулу" style={{ margin: '20px' }}>
            <Form
                form={form}
                layout="inline"
                onFinish={handleSearch}
                style={{ marginBottom: 16, rowGap: 12 }}
            >
                <Form.Item
                    name="oem"
                    rules={[{ required: true, message: 'Введите OEM' }]}
                >
                    <AutoComplete
                        options={oemOptions}
                        style={{ width: 220 }}
                        placeholder="OEM номер"
                        onSearch={(value) => setOemInput(value)}
                        onChange={(value) => setOemInput(value)}
                        onSelect={(value) => {
                            const normalized = String(value || '').trim();
                            form.setFieldsValue({ oem: normalized });
                            setOemInput(normalized);
                            setPartialSearch(false);
                            void executeSearch(normalized, false);
                        }}
                        notFoundContent={
                            lookupLoading ? 'Поиск...' : undefined
                        }
                        filterOption={(inputValue, option) =>
                            option?.value
                                ?.toLowerCase()
                                .includes(inputValue.toLowerCase())
                        }
                    >
                        <Input />
                    </AutoComplete>
                </Form.Item>
                <Form.Item style={{ marginRight: 0 }}>
                    <Checkbox
                        checked={partialSearch}
                        onChange={(e) => setPartialSearch(e.target.checked)}
                    >
                        Искать по части номера
                    </Checkbox>
                </Form.Item>
                <Form.Item>
                    <Button
                        type="primary"
                        icon={<SearchOutlined />}
                        htmlType="submit"
                        loading={loading}
                    >
                        Найти в прайсах
                    </Button>
                </Form.Item>
            </Form>

            {selectedBrand ? (
                <div style={{ marginBottom: 12, color: '#6b7280' }}>
                    Подсказка бренда: <strong>{selectedBrand}</strong>
                </div>
            ) : null}

            {/* Nomenclature status banner */}
            {nomenclatureInfo && !partialSearch && (
                <div style={{ marginBottom: 12 }}>
                    {nomenclatureInfo.in_nomenclature ? (
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            background: '#f6ffed', border: '1px solid #b7eb8f',
                            borderRadius: 6, padding: '4px 12px', fontSize: 13,
                        }}>
                            <span style={{ color: '#52c41a', fontWeight: 600 }}>✔ В номенклатуре:</span>
                            <span style={{ fontWeight: 500 }}>
                                {nomenclatureInfo.brand} — {nomenclatureInfo.name}
                            </span>
                            <Button
                                size="small"
                                type="link"
                                style={{ padding: 0 }}
                                onClick={() => navigate(`/autoparts/nomenclature?q=${currentOem}`)}
                            >
                                Открыть
                            </Button>
                        </div>
                    ) : (
                        currentOem && (
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                background: '#fff7e6', border: '1px solid #ffd591',
                                borderRadius: 6, padding: '4px 12px', fontSize: 13,
                            }}>
                                <span style={{ color: '#fa8c16', fontWeight: 600 }}>⚠ Нет в номенклатуре</span>
                                <Button
                                    size="small"
                                    type="link"
                                    style={{ padding: 0 }}
                                    onClick={() => navigate(`/autoparts/nomenclature?create=1&oem=${currentOem}`)}
                                >
                                    + Создать позицию
                                </Button>
                            </div>
                        )
                    )}
                </div>
            )}

            <Space wrap style={{ marginBottom: 12 }}>
                <AutoComplete
                    options={brandOptions}
                    value={localFilters.brand}
                    style={{ width: 220 }}
                    placeholder="Фильтр по бренду"
                    onChange={(value) =>
                        setLocalFilters((prev) => ({ ...prev, brand: value || '' }))
                    }
                    filterOption={(inputValue, option) =>
                        option?.label
                            ?.toLowerCase()
                            .includes(inputValue.toLowerCase())
                    }
                />
                <Input
                    value={localFilters.provider}
                    onChange={(e) =>
                        setLocalFilters((prev) => ({ ...prev, provider: e.target.value }))
                    }
                    style={{ width: 200 }}
                    placeholder="Фильтр по поставщику"
                />
                <InputNumber
                    value={localFilters.minPrice}
                    onChange={(value) =>
                        setLocalFilters((prev) => ({ ...prev, minPrice: value }))
                    }
                    style={{ width: 140 }}
                    min={0}
                    placeholder="Цена от"
                />
                <InputNumber
                    value={localFilters.maxPrice}
                    onChange={(value) =>
                        setLocalFilters((prev) => ({ ...prev, maxPrice: value }))
                    }
                    style={{ width: 140 }}
                    min={0}
                    placeholder="Цена до"
                />
                <InputNumber
                    value={localFilters.minQty}
                    onChange={(value) =>
                        setLocalFilters((prev) => ({ ...prev, minQty: value }))
                    }
                    style={{ width: 140 }}
                    min={0}
                    placeholder="Мин. кол-во"
                />
                <InputNumber
                    value={localFilters.maxDelivery}
                    onChange={(value) =>
                        setLocalFilters((prev) => ({ ...prev, maxDelivery: value }))
                    }
                    style={{ width: 140 }}
                    min={0}
                    placeholder="Срок до (дней)"
                />
                <Button onClick={resetLocalFilters}>Сбросить фильтры</Button>
            </Space>

            <Spin spinning={loading}>
                <Table
                    className="autopart-offers-table"
                    rowKey={(record) =>
                        `${record.autopart_id}-${record.provider_id}-${record.provider_config_id || 'base'}`
                    }
                    columns={localColumns}
                    dataSource={filteredOffers}
                    size="small"
                    pagination={{ pageSize: 20, showSizeChanger: false }}
                    tableLayout="fixed"
                    scroll={{ x: 820 }}
                />
            </Spin>

            <Divider />

            <Space direction="vertical" style={{ width: '100%' }} size="small">
                {Array.isArray(trackingInsights?.cross_offer_rows) &&
                trackingInsights.cross_offer_rows.length ? (
                    <Space
                        direction="vertical"
                        style={{ width: '100%' }}
                        size="small"
                    >
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                В прайсах поставщиков по кроссам
                            </div>
                            <div style={{ color: '#6b7280' }}>
                                Ниже показываем найденные предложения по кросс-артикулам,
                                которые попали в выборку из нашей базы и из подсказок сайта.
                            </div>
                        </div>
                        <Table
                            className="autopart-offers-table"
                            rowKey={(record) =>
                                `cross-${record.autopart_id}-${record.provider_id}-${record.provider_config_id || 'base'}-${record.oem_number}`
                            }
                            columns={localColumns}
                            dataSource={trackingInsights.cross_offer_rows}
                            size="small"
                            pagination={{ pageSize: 5, showSizeChanger: false }}
                            tableLayout="fixed"
                            scroll={{ x: 820 }}
                        />
                    </Space>
                ) : null}
                <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        Что уже заказывали через программу за 1 год
                    </div>
                    <div style={{ color: '#6b7280' }}>
                        Здесь видно, где мы уже заказывали эту позицию, по какой цене,
                        сколько заказали, сколько получили и какой статус сейчас.
                        Для заказов с сайта статусы подтягиваются автоматически.
                    </div>
                    {summaryCrossItems.length ? (
                        <div style={{ color: '#2563eb', marginTop: 8 }}>
                            <div>В выборку также включены кросс-артикулы:</div>
                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: 6,
                                    marginTop: 6,
                                }}
                            >
                                {visibleSummaryCrossItems.map((item) => (
                                    <div
                                        key={item.key}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            padding: '4px 8px',
                                            borderRadius: 999,
                                            background: item.isInvalid
                                                ? '#fff1f2'
                                                : '#eff6ff',
                                            border: item.isInvalid
                                                ? '1px solid #fecdd3'
                                                : '1px solid #bfdbfe',
                                            color: '#1e3a8a',
                                            fontSize: 12,
                                        }}
                                    >
                                        <span>
                                            <strong>{item.brand_name || '—'}</strong>{' '}
                                            {item.oem_number}
                                        </span>
                                        {item.isConfirmed ? (
                                            <Tag color="green" style={{ marginInlineEnd: 0 }}>
                                                подтвержден
                                            </Tag>
                                        ) : null}
                                        {item.isInvalid ? (
                                            <Tag color="red" style={{ marginInlineEnd: 0 }}>
                                                исключён
                                            </Tag>
                                        ) : null}
                                        {item.isSiteSuggested &&
                                        nomenclatureInfo?.in_nomenclature &&
                                        !item.isConfirmed &&
                                        !item.isInvalid ? (
                                            <>
                                                <Tooltip title="Подтвердить кросс и сохранить в систему">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        shape="circle"
                                                        icon={<CheckOutlined />}
                                                        loading={
                                                            crossActionLoadingKey === `approve:${item.key}`
                                                        }
                                                        onClick={() =>
                                                            handleApproveSiteCross(item)
                                                        }
                                                    />
                                                </Tooltip>
                                                <Tooltip title="Пометить как неверный кросс">
                                                    <Button
                                                        danger
                                                        type="text"
                                                        size="small"
                                                        shape="circle"
                                                        icon={<CloseOutlined />}
                                                        loading={
                                                            crossActionLoadingKey === `reject:${item.key}`
                                                        }
                                                        onClick={() =>
                                                            handleRejectSiteCross(item)
                                                        }
                                                    />
                                                </Tooltip>
                                            </>
                                        ) : null}
                                    </div>
                                ))}
                                {summaryCrossItems.length > visibleSummaryCrossItems.length ? (
                                    <Button
                                        type="link"
                                        size="small"
                                        style={{ paddingInline: 0 }}
                                        onClick={() => setShowAllSummaryCrosses(true)}
                                    >
                                        Показать ещё {summaryCrossItems.length - visibleSummaryCrossItems.length}
                                    </Button>
                                ) : null}
                                {showAllSummaryCrosses && summaryCrossItems.length > 8 ? (
                                    <Button
                                        type="link"
                                        size="small"
                                        style={{ paddingInline: 0 }}
                                        onClick={() => setShowAllSummaryCrosses(false)}
                                    >
                                        Свернуть
                                    </Button>
                                ) : null}
                            </div>
                            {siteCrossItems.length && !nomenclatureInfo?.in_nomenclature ? (
                                <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>
                                    Чтобы подтверждать или исключать кроссы с сайта, позиция должна быть в номенклатуре.
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
                <TrackingOrderHistoryTable
                    rows={trackingHistory}
                    loading={trackingHistoryLoading}
                    compact
                    showOem
                    emptyText="По этой позиции за последний год заказов через программу не было"
                />
                <Spin spinning={trackingInsightsLoading}>
                    {trackingInsights ? (
                        <Space
                            direction="vertical"
                            style={{ width: '100%' }}
                            size="middle"
                        >
                            <div>
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                    Краткая сводка для заказа
                                </div>
                                <div style={{ color: '#6b7280' }}>
                                    Здесь сводим вместе актуальные прайсы, сайт Dragonzap
                                    и историю заказов через программу, чтобы быстрее понять,
                                    как лучше заказывать позицию прямо сейчас.
                                </div>
                                {resolvedTrackingOems.length ? (
                                    <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                                        История за год и аналитика посчитаны по{' '}
                                        <strong>{resolvedTrackingOems.length}</strong>{' '}
                                        OEM: {resolvedTrackingOems.join(', ')}
                                    </div>
                                ) : null}
                            </div>

                            {combinedInsightTiles.length ? (
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                                        gap: 8,
                                    }}
                                >
                                    {combinedInsightTiles.map((tile) => (
                                        <InsightTile key={tile.key} {...tile} />
                                    ))}
                                </div>
                            ) : null}

                            {!trackingInsights?.own_price_analysis &&
                            (trackingInsights?.own_price_configs || []).length ? (
                                <div style={{ color: '#6b7280' }}>
                                    Для блока по нашему прайсу выбери один конфиг в
                                    настройках поставщика: `Конфигурации прайс-листов` →
                                    `Использовать для сводки заказа`.
                                </div>
                            ) : null}

                            {(() => {
                                const bs = trackingInsights?.best_supplier;
                                if (!bs) return null;
                                const deliveryStr = formatInsightDelivery(
                                    bs.current_min_delivery,
                                    bs.current_max_delivery
                                );
                                return (
                                    <div
                                        style={{
                                            ...INSIGHT_TONE_STYLES.green,
                                            borderRadius: 10,
                                            padding: 12,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 8,
                                            boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)',
                                        }}
                                    >
                                        <div style={{ color: '#475569', fontSize: 11, fontWeight: 700 }}>
                                            Лучший поставщик по позиции
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                            <div>
                                                <div style={{ color: '#0f172a', fontSize: 16, fontWeight: 800 }}>
                                                    {bs.provider_name}
                                                </div>
                                                <div style={{ color: '#334155', fontSize: 12 }}>
                                                    {bs.current_oem_number
                                                        ? `${bs.current_brand_name || '—'} ${bs.current_oem_number}`
                                                        : ''}
                                                    {bs.current_price != null
                                                        ? `  ·  ${formatInsightMoney(bs.current_price)} руб.`
                                                        : ''}
                                                    {bs.current_qty != null
                                                        ? `  ·  ${bs.current_qty} шт`
                                                        : ''}
                                                    {deliveryStr !== 'срок не указан'
                                                        ? `  ·  ${deliveryStr}`
                                                        : ''}
                                                </div>
                                                <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                                                    {bs.fill_rate != null ? `Исполнение: ${bs.fill_rate}%` : ''}
                                                    {bs.avg_lead_days != null ? `  ·  Срок ср.: ${bs.avg_lead_days} дн` : ''}
                                                    {bs.avg_price != null ? `  ·  Ср. цена покупки: ${formatInsightMoney(bs.avg_price)}` : ''}
                                                </div>
                                            </div>
                                            <Space>
                                                <InputNumber
                                                    min={1}
                                                    max={bs.current_qty > 0 ? bs.current_qty : undefined}
                                                    value={bestSupplierQty}
                                                    size="small"
                                                    style={{ width: 70 }}
                                                    onChange={(v) => setBestSupplierQty(v || 1)}
                                                />
                                                <Button
                                                    type="primary"
                                                    size="small"
                                                    icon={<ShoppingCartOutlined />}
                                                    onClick={() => {
                                                        addLocalOfferToCart({
                                                            autopart_id: bs.current_autopart_id,
                                                            provider_id: bs.provider_id,
                                                            provider_name: bs.provider_name,
                                                            provider_config_id: bs.current_provider_config_id,
                                                            provider_config_name: bs.current_provider_config_name,
                                                            oem_number: bs.current_oem_number || currentOem,
                                                            brand_name: bs.current_brand_name,
                                                            name: bs.current_autopart_name,
                                                            price: bs.current_price,
                                                            quantity: bs.current_qty,
                                                            min_delivery_day: bs.current_min_delivery,
                                                            max_delivery_day: bs.current_max_delivery,
                                                            is_own_price: bs.is_own_price,
                                                        });
                                                        // apply the chosen qty after upsert
                                                        if (bestSupplierQty > 1) {
                                                            const cartKey = [
                                                                'supplier',
                                                                bs.provider_id,
                                                                bs.current_provider_config_id || 'base',
                                                                bs.current_autopart_id,
                                                                bs.current_oem_number || currentOem,
                                                            ].join(':');
                                                            updateCartQty(cartKey, bestSupplierQty);
                                                        }
                                                    }}
                                                >
                                                    В корзину
                                                </Button>
                                            </Space>
                                        </div>
                                    </div>
                                );
                            })()}
                        </Space>
                    ) : null}
                </Spin>
            </Space>

            <Divider />

            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Space wrap>
                    <AutoComplete
                        options={brandOptions}
                        value={selectedBrand || ''}
                        style={{ width: 260 }}
                        placeholder="Бренд для запроса на dragonzap"
                        onChange={(value) => setSelectedBrand(value || '')}
                        filterOption={(inputValue, option) =>
                            option?.label
                                ?.toLowerCase()
                                .includes(inputValue.toLowerCase())
                        }
                    />
                </Space>
                <Space wrap>
                    <Checkbox
                        checked={showCrosses}
                        onChange={(e) => setShowCrosses(e.target.checked)}
                    >
                        Показывать кроссы
                    </Checkbox>
                    <Button
                        type="primary"
                        icon={<CloudDownloadOutlined />}
                        onClick={handleDragonzapRequest}
                        loading={remoteLoading}
                    >
                        Запросить на dragonzap
                    </Button>
                </Space>

                {siteBrandWarning ? (
                    <Alert
                        type={siteBrandWarning.type || 'info'}
                        showIcon
                        message={siteBrandWarning.message}
                        description={siteBrandWarning.description}
                        style={{ marginBottom: siteDiagnosticsAlert ? 0 : 12 }}
                    />
                ) : null}

                {siteDiagnosticsAlert ? (
                    <Alert
                        type={siteDiagnosticsAlert.type || 'info'}
                        showIcon
                        message={siteDiagnosticsAlert.message}
                        description={siteDiagnosticsAlert.description}
                        style={{ marginBottom: 12 }}
                    />
                ) : null}

                <Spin spinning={remoteLoading}>
                    {remoteMeta.total > 0 ? (
                        <div style={{ marginBottom: 8, color: '#6b7280' }}>
                            Найдено {remoteMeta.total}. Показаны все предложения
                            {siteResponseDiagnostics?.usingCrossFallback
                                ? ' с учетом кроссов.'
                                : '.'}
                        </div>
                    ) : null}
                    <Table
                        className="autopart-offers-table"
                        rowKey={(record, index) => record.api_hash || `${record.oem}-${index}`}
                        columns={remoteColumns}
                        dataSource={remoteOffers}
                        size="small"
                        pagination={{ pageSize: 20, showSizeChanger: false }}
                        tableLayout="fixed"
                        scroll={{ x: 820 }}
                    />
                </Spin>

                {Array.isArray(trackingInsights?.invalid_cross_items) &&
                trackingInsights.invalid_cross_items.length ? (
                    <div style={{ marginTop: 16 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6, color: '#b91c1c' }}>
                            Невалидные кроссы (исключены из поиска)
                        </div>
                        <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 8 }}>
                            Эти кроссы помечены как неверные — они не учитываются при поиске предложений.
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {trackingInsights.invalid_cross_items.map((item) => (
                                <Tooltip
                                    key={item.id}
                                    title={item.comment
                                        ? `Причина: ${item.comment}`
                                        : 'Помечен как неверный кросс'}
                                >
                                    <div
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            padding: '3px 10px',
                                            borderRadius: 999,
                                            background: '#fff1f2',
                                            border: '1px solid #fecdd3',
                                            color: '#9f1239',
                                            fontSize: 12,
                                        }}
                                    >
                                        <CloseOutlined style={{ fontSize: 10 }} />
                                        <strong>{item.invalid_brand_name || '—'}</strong>
                                        {' '}
                                        {item.invalid_oem_number}
                                        {item.invalid_autopart_name
                                            ? ` · ${item.invalid_autopart_name}`
                                            : ''}
                                    </div>
                                </Tooltip>
                            ))}
                        </div>
                    </div>
                ) : null}
            </Space>

            <Divider />

            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        Корзина заказа
                    </div>
                    <div style={{ color: '#6b7280' }}>
                        Всего позиций: {cartSummary.total} · из прайсов: {cartSummary.supplier} · с сайта: {cartSummary.dragonzap} · сумма: {cartSummary.sum.toFixed(2)}
                        {selectedCartKeys.length
                            ? ` · выбрано: ${selectedCartKeys.length}`
                            : ' · если ничего не выделено, действие применяется ко всей корзине'}
                    </div>
                </div>

                <Space wrap align="center">
                    <span style={{ color: '#374151' }}>Клиент для сайта:</span>
                    <Select
                        allowClear
                        showSearch
                        placeholder="Выберите клиента"
                        value={selectedCustomerId}
                        loading={customersLoading}
                        options={customerOptions}
                        style={{ minWidth: 260 }}
                        optionFilterProp="label"
                        onChange={(value) => setSelectedCustomerId(value ?? null)}
                    />
                </Space>

                <Space wrap>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        disabled={!selectedSupplierCartItems.length}
                        loading={cartSubmitting}
                        onClick={() => handleCreateSupplierOrders(false)}
                    >
                        Создать заказы поставщикам
                    </Button>
                    <Button
                        icon={<MailOutlined />}
                        disabled={!selectedSupplierCartItems.length}
                        loading={cartSubmitting}
                        onClick={() => handleCreateSupplierOrders(true)}
                    >
                        Создать и отправить письмом
                    </Button>
                    <Button
                        type="primary"
                        ghost
                        icon={<SendOutlined />}
                        disabled={
                            !selectedDragonzapCartItems.length ||
                            !selectedCustomerId
                        }
                        loading={cartSubmitting}
                        onClick={handleSendDragonzapCart}
                    >
                        Отправить на Dragonzap
                    </Button>
                    <Button
                        disabled={!cartItems.length}
                        onClick={() => {
                            setCartItems([]);
                            setSelectedCartKeys([]);
                        }}
                    >
                        Очистить корзину
                    </Button>
                </Space>

                <Table
                    rowKey="cart_key"
                    columns={cartColumns}
                    dataSource={cartItems}
                    size="small"
                    pagination={{ pageSize: 20, showSizeChanger: false }}
                    tableLayout="fixed"
                    rowSelection={{
                        selectedRowKeys: selectedCartKeys,
                        onChange: (keys) => setSelectedCartKeys(keys),
                    }}
                    locale={{
                        emptyText: 'Корзина пуста',
                    }}
                    scroll={{ x: 1080 }}
                />
            </Space>

            {historicalOffers.length ? (
                <>
                    <Divider />
                    <Space
                        direction="vertical"
                        style={{ width: '100%' }}
                        size="small"
                    >
                        <div style={{ color: '#6b7280' }}>
                            История по старым прайсам. Эти позиции уже не
                            найдены в свежих прайсах поставщиков, но раньше по
                            ним были предложения.
                        </div>
                        <Table
                            className="autopart-offers-table"
                            rowKey={(record) =>
                                `history-${record.autopart_id}-${record.provider_id}-${record.provider_config_id || 'base'}`
                            }
                            columns={historicalColumns}
                            dataSource={historicalOffers}
                            size="small"
                            pagination={{ pageSize: 20, showSizeChanger: false }}
                            tableLayout="fixed"
                            scroll={{ x: 820 }}
                        />
                    </Space>
                </>
            ) : null}
        </Card>
    );
};

export default AutopartOffers;
