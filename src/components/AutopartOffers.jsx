import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    AutoComplete,
    Badge,
    Card,
    Collapse,
    Form,
    Input,
    InputNumber,
    Button,
    Table,
    Space,
    Select,
    Segmented,
    Tag,
    Divider,
    message,
    Checkbox,
    Spin,
    Tooltip,
    Modal,
    Popover,
    Popconfirm,
} from 'antd';
import {
    CheckOutlined,
    SearchOutlined,
    CloseOutlined,
    CloudDownloadOutlined,
    InfoCircleOutlined,
    LineChartOutlined,
    PlusOutlined,
    ShoppingCartOutlined,
    DeleteOutlined,
    SendOutlined,
    MailOutlined,
    DownOutlined,
    ShopOutlined,
    FilterOutlined,
    SaveOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    addAutopartCross,
    addAutopartInvalidCross,
    deleteAutopartCross,
    getAutopartCrosses,
    getAutopartInvalidCrosses,
    getAutopartOffers,
    getDragonzapBrands,
    getDragonzapOffers,
    getOwnStockByOems,
    searchAutopartsByOem,
    sendDragonzapOrder,
} from '../api/autoparts';
import { getBrands, lookupBrands } from '../api/brands';
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
import useAuth from '../context/useAuth';

const OEM_HISTORY_KEY = 'autopart_oem_history_v1';
const STATE_STORAGE_KEY = 'autopart_offers_state_v2';
const SITE_OFFER_FILTER_STORAGE_PREFIX = 'autopart_site_offer_filters_v1';
const VIEW_MODE_STORAGE_KEY = 'autopart_offers_view_mode_v1';
const MAX_PERSISTED_CART_ITEMS = 200;
const MAX_SITE_EXACT_CROSS_REQUESTS = 3;
const SITE_RECOMMENDATION_LOW_STOCK_QTY = 10;
const TOYOTA_BRAND_TOKEN = 'TOYOTA';
// Закупка дороже этой доли от нашей цены продажи — маржа под угрозой
// (то же правило, что в автозаказе: закупка ≤ 90% продажи).
const MAX_PURCHASE_TO_SALE_RATIO = 0.9;

const DEFAULT_SITE_OFFER_FILTERS = Object.freeze({
    brands: [],
    suppliers: [],
    sourceTypes: [],
    minPrice: null,
    maxPrice: null,
    minQty: null,
    maxDelivery: null,
});

const normalizeSiteOfferFilters = (value) => {
    const source = value && typeof value === 'object' ? value : {};
    const stringList = (items) => (
        Array.isArray(items)
            ? [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))]
            : []
    );
    const nullableNumber = (item) => {
        if (item === null || item === undefined || item === '') {
            return null;
        }
        const parsed = Number(item);
        return Number.isFinite(parsed) ? parsed : null;
    };
    return {
        brands: stringList(source.brands),
        suppliers: stringList(source.suppliers),
        sourceTypes: stringList(source.sourceTypes),
        minPrice: nullableNumber(source.minPrice),
        maxPrice: nullableNumber(source.maxPrice),
        minQty: nullableNumber(source.minQty),
        maxDelivery: nullableNumber(source.maxDelivery),
    };
};

// Каноничный вид OEM как в базе: без дефисов/пробелов, верхний регистр.
const normalizeOemKey = (value) =>
    String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

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

const normalizePositiveQty = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 1;
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
    const normalizedBase = normalizeOemKey(baseOem);
    const uniqueOems = new Set();
    for (const offer of offers || []) {
        const normalizedOem = normalizeOemKey(
            offer?.oem ||
            offer?.oem_number ||
            offer?.article ||
            offer?.part_number ||
            ''
        );
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
        normalizeOemKey(oemNumber),
    ].join('::');

const normalizeBrandToken = (value) =>
    String(value || '').trim().toUpperCase();

const extractUniqueCrossItemsFromSiteOffers = (offers, baseOem) => {
    const normalizedBase = normalizeOemKey(baseOem);
    const uniqueItems = new Map();
    for (const offer of offers || []) {
        const oemNumber = normalizeOemKey(
            offer?.oem ||
            offer?.oem_number ||
            offer?.article ||
            offer?.part_number ||
            ''
        );
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

const extractCheapestCrossCandidatesFromLocalOffers = (
    rows,
    baseOem,
    limit = MAX_SITE_EXACT_CROSS_REQUESTS
) => {
    const normalizedBase = normalizeOemKey(baseOem);
    const byKey = new Map();
    for (const row of rows || []) {
        const oemNumber = normalizeOemKey(row?.oem_number);
        const brandName = String(row?.brand_name || '').trim();
        const price = Number(row?.price);
        if (
            !oemNumber ||
            oemNumber === normalizedBase ||
            !brandName ||
            !Number.isFinite(price)
        ) {
            continue;
        }
        const key = normalizeCrossKey(brandName, oemNumber);
        const existing = byKey.get(key);
        if (
            !existing ||
            price < existing.price ||
            (price === existing.price &&
                Number(row?.quantity ?? 0) > Number(existing.quantity ?? 0))
        ) {
            byKey.set(key, {
                brand_name: brandName,
                oem_number: oemNumber,
                price,
                quantity: Number(row?.quantity ?? 0),
            });
        }
    }
    return Array.from(byKey.values())
        .sort((a, b) => {
            if (a.price !== b.price) {
                return a.price - b.price;
            }
            return Number(b.quantity ?? 0) - Number(a.quantity ?? 0);
        })
        .slice(0, limit);
};

const dedupeAndSortSiteOffers = (offers) => {
    const dedupedOffers = new Map();
    for (const offer of offers || []) {
        const price = Number(offer?.price);
        const quantity = Number(offer?.qnt ?? 0);
        if (!Number.isFinite(price) || quantity <= 0) {
            continue;
        }
        const key = buildCartKey('dragonzap', {
            ...offer,
            oem: offer?.oem || offer?.oem_number,
        });
        const existing = dedupedOffers.get(key);
        const currentLead = Number(
            offer?.min_delivery_day ??
                offer?.max_delivery_day ??
                Number.POSITIVE_INFINITY
        );
        const existingLead = existing
            ? Number(
                existing?.min_delivery_day ??
                    existing?.max_delivery_day ??
                    Number.POSITIVE_INFINITY
            )
            : Number.POSITIVE_INFINITY;
        if (
            !existing ||
            price < Number(existing?.price ?? Number.POSITIVE_INFINITY) ||
            (price === Number(existing?.price) && currentLead < existingLead)
        ) {
            dedupedOffers.set(key, offer);
        }
    }
    return Array.from(dedupedOffers.values()).sort((a, b) => {
        const priceDiff =
            Number(a?.price ?? Number.POSITIVE_INFINITY) -
            Number(b?.price ?? Number.POSITIVE_INFINITY);
        if (priceDiff !== 0) {
            return priceDiff;
        }
        const aLead = Number(
            a?.min_delivery_day ?? a?.max_delivery_day ?? Number.POSITIVE_INFINITY
        );
        const bLead = Number(
            b?.min_delivery_day ?? b?.max_delivery_day ?? Number.POSITIVE_INFINITY
        );
        if (aLead !== bLead) {
            return aLead - bLead;
        }
        return Number(b?.qnt ?? 0) - Number(a?.qnt ?? 0);
    });
};

const pickSiteRecommendationOffers = (offers) => {
    const sorted = dedupeAndSortSiteOffers(offers);
    if (!sorted.length) {
        return [];
    }
    const selected = [sorted[0]];
    if (
        Number(sorted[0]?.qnt ?? 0) < SITE_RECOMMENDATION_LOW_STOCK_QTY &&
        sorted[1]
    ) {
        selected.push(sorted[1]);
    }
    if (
        selected.length === 2 &&
        Number(sorted[1]?.qnt ?? 0) < SITE_RECOMMENDATION_LOW_STOCK_QTY &&
        sorted[2]
    ) {
        selected.push(sorted[2]);
    }
    return selected;
};

const sortSiteOffersByPriority = (offers) =>
    [...(offers || [])].sort((a, b) => {
        const priceDiff =
            Number(a?.price ?? Number.POSITIVE_INFINITY) -
            Number(b?.price ?? Number.POSITIVE_INFINITY);
        if (priceDiff !== 0) {
            return priceDiff;
        }
        const aLead = Number(
            a?.min_delivery_day ?? a?.max_delivery_day ?? Number.POSITIVE_INFINITY
        );
        const bLead = Number(
            b?.min_delivery_day ?? b?.max_delivery_day ?? Number.POSITIVE_INFINITY
        );
        if (aLead !== bLead) {
            return aLead - bLead;
        }
        return Number(b?.qnt ?? 0) - Number(a?.qnt ?? 0);
    });

const getSiteOfferBrandName = (offer) => String(
    offer?.make_name || offer?.brand_name || offer?.brand || ''
).trim();

const getSiteOfferOemNumber = (offer) => String(
    offer?.oem || offer?.oem_number || offer?.article || offer?.part_number || ''
).trim();

const getSiteOfferSupplierName = (offer) => String(
    offer?.supplier_name || offer?.sup_logo || offer?.provider_name || ''
).trim();

const getSiteOfferDelivery = (offer) => Number(
    offer?.min_delivery_day ?? offer?.max_delivery_day ?? Number.NaN
);

const mergeSiteOffersForDisplay = (groups) => {
    const byKey = new Map();

    for (const group of groups || []) {
        const label = String(group?.label || '').trim();
        const type = String(group?.type || '').trim();
        for (const offer of group?.offers || []) {
            const key = buildCartKey('dragonzap', {
                ...offer,
                oem: offer?.oem || offer?.oem_number,
            });
            const existing = byKey.get(key);
            if (!existing) {
                const siteRequestEntries =
                    label || type ? [{ label, type }] : [];
                byKey.set(key, {
                    ...offer,
                    site_request_entries: siteRequestEntries,
                    site_request_labels: label ? [label] : [],
                    site_request_types: type ? [type] : [],
                });
                continue;
            }
            const nextEntries = new Map(
                (existing.site_request_entries || []).map((entry) => [
                    `${entry.type || ''}::${entry.label || ''}`,
                    entry,
                ])
            );
            if (label || type) {
                nextEntries.set(`${type}::${label}`, { label, type });
            }
            const mergedEntries = Array.from(nextEntries.values());
            byKey.set(key, {
                ...existing,
                site_request_entries: mergedEntries,
                site_request_labels: mergedEntries
                    .map((entry) => String(entry?.label || '').trim())
                    .filter(Boolean),
                site_request_types: mergedEntries
                    .map((entry) => String(entry?.type || '').trim())
                    .filter(Boolean),
            });
        }
    }

    return sortSiteOffersByPriority(Array.from(byKey.values()));
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

const ABC_MEANINGS = {
    A: 'ключевая позиция по обороту',
    B: 'средний вклад в оборот',
    C: 'низкий вклад в оборот',
};

const XYZ_MEANINGS = {
    X: 'спрос стабильный',
    Y: 'спрос умеренно колеблется',
    Z: 'спрос очень нерегулярный',
};

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
        sale_price_reference: item.sale_price_reference ?? null,
        margin_warning: Boolean(item.margin_warning),
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
    const { user } = useAuth();
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
    const [cartPopoverOpen, setCartPopoverOpen] = useState(false);
    const [selectedCartKeys, setSelectedCartKeys] = useState([]);
    const [loading, setLoading] = useState(false);
    const [remoteOffers, setRemoteOffers] = useState([]);
    const [remoteOffersPage, setRemoteOffersPage] = useState(1);
    const [siteExactOffers, setSiteExactOffers] = useState([]);
    const [siteOffersWithCrosses, setSiteOffersWithCrosses] = useState([]);
    const [siteExactCrossOffers, setSiteExactCrossOffers] = useState([]);
    const [siteBrandFamilyNames, setSiteBrandFamilyNames] = useState([]);
    const [siteCrossFollowupStatus, setSiteCrossFollowupStatus] = useState({
        active: false,
        total: 0,
        completed: 0,
        candidates: [],
    });
    const [siteResponseDiagnostics, setSiteResponseDiagnostics] = useState(null);
    const [siteRequestError, setSiteRequestError] = useState(null);
    const [remoteLoading, setRemoteLoading] = useState(false);
    const [cartSubmitting, setCartSubmitting] = useState(false);
    const [bestSupplierQty, setBestSupplierQty] = useState(1);
    const [draftOrderQty, setDraftOrderQty] = useState(1);
    const [remoteMeta, setRemoteMeta] = useState({ total: 0 });
    const [showCrosses, setShowCrosses] = useState(false);
    const [restrictCrossBrand, setRestrictCrossBrand] = useState(false);
    const [partialSearch, setPartialSearch] = useState(false);
    const [supplierScoreExpanded, setSupplierScoreExpanded] = useState(false);
    const [currentOem, setCurrentOem] = useState('');
    const [siteBrandCandidates, setSiteBrandCandidates] = useState([]);
    const [nomenclatureInfo, setNomenclatureInfo] = useState(null); // { in_nomenclature, id, brand, name }
    const [ourStockRows, setOurStockRows] = useState([]);
    // Наличие нашего прайса по сайтовым (непроверенным) кроссам
    const [unverifiedStockRows, setUnverifiedStockRows] = useState([]);
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
    const [siteOfferFilters, setSiteOfferFilters] = useState(() =>
        normalizeSiteOfferFilters(DEFAULT_SITE_OFFER_FILTERS)
    );
    const [siteOfferFiltersSaved, setSiteOfferFiltersSaved] = useState(false);
    const [viewMode, setViewMode] = useState(() =>
        safeStorageGet(VIEW_MODE_STORAGE_KEY) === 'large' ? 'large' : 'normal'
    );
    const [pendingRestoredSearch, setPendingRestoredSearch] = useState(null);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const lookupRequestIdRef = useRef(0);
    const autoSearchKeyRef = useRef('');
    const brandCatalogRef = useRef(null);
    const previousRestrictCrossBrandRef = useRef(false);
    const previousShowCrossesRef = useRef(false);
    const didRestoreStateRef = useRef(false);

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
    const isAdmin = user?.role === 'admin';
    const siteOfferFilterStorageKey = useMemo(() => {
        const userKey = user?.id || user?.email || user?.username || 'default';
        return `${SITE_OFFER_FILTER_STORAGE_PREFIX}:${userKey}`;
    }, [user?.email, user?.id, user?.username]);

    useEffect(() => {
        const restored = normalizeSiteOfferFilters(
            safeJsonParse(
                safeStorageGet(siteOfferFilterStorageKey),
                DEFAULT_SITE_OFFER_FILTERS
            )
        );
        setSiteOfferFilters(restored);
        setSiteOfferFiltersSaved(Boolean(safeStorageGet(siteOfferFilterStorageKey)));
    }, [siteOfferFilterStorageKey]);

    const updateSiteOfferFilter = useCallback((key, value) => {
        setSiteOfferFilters((previous) => normalizeSiteOfferFilters({
            ...previous,
            [key]: value,
        }));
        setSiteOfferFiltersSaved(false);
    }, []);

    const saveSiteOfferFilters = useCallback(() => {
        const saved = safeStorageSet(
            siteOfferFilterStorageKey,
            JSON.stringify(siteOfferFilters)
        );
        if (saved) {
            setSiteOfferFiltersSaved(true);
            message.success('Фильтр site-предложений сохранён для пользователя');
        } else {
            message.error('Не удалось сохранить фильтр в браузере');
        }
    }, [siteOfferFilterStorageKey, siteOfferFilters]);

    const resetSiteOfferFilters = useCallback(() => {
        const defaults = normalizeSiteOfferFilters(DEFAULT_SITE_OFFER_FILTERS);
        setSiteOfferFilters(defaults);
        const saved = safeStorageSet(
            siteOfferFilterStorageKey,
            JSON.stringify(defaults)
        );
        setSiteOfferFiltersSaved(saved);
        setRemoteOffersPage(1);
    }, [siteOfferFilterStorageKey]);

    const reloadTrackingHistory = useCallback(async () => {
        const oemValue = String(currentOem || oemInput || '').trim();
        if (!oemValue) {
            return;
        }
        setTrackingHistoryLoading(true);
        try {
            const { data } = await getTrackingOrderItems({
                oem: oemValue,
                brand: selectedBrand || undefined,
                sync_site: false,
                include_crosses: true,
                limit: 1000,
            });
            setTrackingHistory(Array.isArray(data) ? data : []);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            message.error(detail || 'Не удалось обновить историю заказов');
        } finally {
            setTrackingHistoryLoading(false);
        }
    }, [currentOem, oemInput, selectedBrand]);

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

    const loadBrandCatalog = useCallback(async () => {
        if (Array.isArray(brandCatalogRef.current)) {
            return brandCatalogRef.current;
        }
        const { data } = await getBrands();
        const rows = Array.isArray(data) ? data : [];
        brandCatalogRef.current = rows;
        return rows;
    }, []);

    const resolveBrandFamilyNames = useCallback(async (brandName) => {
        const normalizedInput = normalizeBrandToken(brandName);
        if (!normalizedInput) {
            return [];
        }
        try {
            const brands = await loadBrandCatalog();
            const matchedBrand = brands.find((item) => {
                const mainName = normalizeBrandToken(item?.name);
                if (mainName === normalizedInput) {
                    return true;
                }
                return (item?.synonyms || []).some(
                    (synonym) =>
                        normalizeBrandToken(synonym?.name) === normalizedInput
                );
            });
            if (!matchedBrand) {
                return [normalizedInput];
            }
            const family = new Set([
                normalizeBrandToken(matchedBrand?.name),
                ...(matchedBrand?.synonyms || []).map((synonym) =>
                    normalizeBrandToken(synonym?.name)
                ),
                normalizedInput,
            ]);
            return Array.from(family).filter(Boolean);
        } catch (error) {
            console.warn('Failed to resolve brand family names:', error);
            return [normalizedInput];
        }
    }, [loadBrandCatalog]);

    const normalizedCurrentOem = useMemo(
        () => normalizeOemKey(currentOem),
        [currentOem]
    );

    // Наша текущая цена продажи (из блока «наш прайс» сводки) —
    // ориентир для контроля маржи при закупке.
    const ownSalePrice = useMemo(() => {
        const value = Number(
            trackingInsights?.own_price_analysis?.latest_price
        );
        return Number.isFinite(value) && value > 0 ? value : null;
    }, [trackingInsights?.own_price_analysis?.latest_price]);

    const isLowMarginPurchase = useCallback(
        (price) => {
            if (ownSalePrice == null) {
                return false;
            }
            const parsed = Number(price);
            return (
                Number.isFinite(parsed) &&
                parsed > ownSalePrice * MAX_PURCHASE_TO_SALE_RATIO
            );
        },
        [ownSalePrice]
    );

    const renderPurchasePrice = useCallback(
        (value, { skipMarginCheck = false } = {}) => {
            if (value === null || value === undefined) {
                return '—';
            }
            const formatted = Number(value).toFixed(2);
            if (skipMarginCheck || !isLowMarginPurchase(value)) {
                return formatted;
            }
            return (
                <Tooltip
                    title={
                        `Закупка выше ${Math.round(MAX_PURCHASE_TO_SALE_RATIO * 100)}% ` +
                        `нашей цены продажи (${ownSalePrice.toFixed(2)} руб.) — маржа под угрозой`
                    }
                >
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>
                        {formatted} ⚠
                    </span>
                </Tooltip>
            );
        },
        [isLowMarginPurchase, ownSalePrice]
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

    // OEM-номера сайтовых кроссов, по которым надо проверить наш прайс
    // (исключаем базовый номер и то, что уже есть в проверенном наличии).
    const verifiedStockOemSet = useMemo(
        () =>
            new Set(
                (ourStockRows || []).map((row) =>
                    normalizeOemKey(row.oem_number)
                )
            ),
        [ourStockRows]
    );

    const crossOemsForOwnStock = useMemo(() => {
        const base = normalizeOemKey(currentOem);
        const set = new Set();
        const push = (value, brandName) => {
            const oem = normalizeOemKey(value);
            const crossKey = normalizeCrossKey(brandName, oem);
            if (
                oem &&
                oem !== base &&
                !verifiedStockOemSet.has(oem) &&
                !invalidCrossKeySet.has(crossKey)
            ) {
                set.add(oem);
            }
        };
        for (const item of siteCrossItems || []) {
            push(item?.oem_number, item?.brand_name);
        }
        for (const offer of siteExactCrossOffers || []) {
            push(
                offer?.oem || offer?.oem_number,
                offer?.make_name || offer?.brand_name
            );
        }
        return Array.from(set);
    }, [
        currentOem,
        invalidCrossKeySet,
        siteCrossItems,
        siteExactCrossOffers,
        verifiedStockOemSet,
    ]);

    useEffect(() => {
        let cancelled = false;
        if (!crossOemsForOwnStock.length) {
            setUnverifiedStockRows([]);
            return () => {
                cancelled = true;
            };
        }
        (async () => {
            try {
                const { data } = await getOwnStockByOems(crossOemsForOwnStock);
                if (cancelled) {
                    return;
                }
                const rows = Array.isArray(data?.rows) ? data.rows : [];
                const seen = new Set(
                    (ourStockRows || []).map(
                        (row) => `${row.autopart_id}-${row.pricelist_id}`
                    )
                );
                setUnverifiedStockRows(
                    rows.filter(
                        (row) =>
                            !seen.has(`${row.autopart_id}-${row.pricelist_id}`)
                    )
                );
            } catch {
                if (!cancelled) {
                    setUnverifiedStockRows([]);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [crossOemsForOwnStock, ourStockRows]);

    const bestSiteOffersForOrder = useMemo(
        () => {
            if (!showCrosses) {
                return pickSiteRecommendationOffers(
                    Array.isArray(siteExactOffers) ? siteExactOffers : []
                );
            }
            return pickSiteRecommendationOffers([
                ...(Array.isArray(siteExactCrossOffers)
                    ? siteExactCrossOffers
                    : []),
                ...(Array.isArray(siteOffersWithCrosses)
                    ? siteOffersWithCrosses
                    : []),
                ...(Array.isArray(siteExactOffers) ? siteExactOffers : []),
            ]);
        },
        [showCrosses, siteExactCrossOffers, siteExactOffers, siteOffersWithCrosses]
    );

    const mergedRemoteSiteOffers = useMemo(() => {
        const normalizedOem = String(currentOem || '').trim().toUpperCase();
        const normalizedBrand = String(selectedBrand || '').trim();
        const baseQueryLabel = [normalizedBrand, normalizedOem]
            .filter(Boolean)
            .join(' ')
            .trim();
        const groups = [];

        if (siteExactOffers.length) {
            groups.push({
                label: baseQueryLabel
                    ? `Исходный точный запрос: ${baseQueryLabel}`
                    : 'Исходный точный запрос',
                type: 'base_exact',
                offers: siteExactOffers,
            });
        }

        if (showCrosses && siteOffersWithCrosses.length) {
            groups.push({
                label: baseQueryLabel
                    ? `Запрос по исходному OEM с кроссами: ${baseQueryLabel}`
                    : 'Запрос по исходному OEM с кроссами',
                type: 'base_cross',
                offers: siteOffersWithCrosses,
            });
        }

        const directCrossGroups = new Map();
        for (const offer of showCrosses ? siteExactCrossOffers || [] : []) {
            const crossBrand = String(
                offer?.recommendation_cross_brand_name ||
                    offer?.make_name ||
                    offer?.brand_name ||
                    ''
            ).trim();
            const crossOem = String(
                offer?.recommendation_cross_oem_number ||
                    offer?.oem ||
                    offer?.oem_number ||
                    ''
            )
                .trim()
                .toUpperCase();
            const requestLabel = [crossBrand, crossOem]
                .filter(Boolean)
                .join(' ')
                .trim();
            const groupKey = normalizeCrossKey(crossBrand, crossOem);
            if (!directCrossGroups.has(groupKey)) {
                directCrossGroups.set(groupKey, {
                    label: requestLabel
                        ? `Прямой запрос по кроссу: ${requestLabel}`
                        : 'Прямой запрос по кроссу',
                    type: 'cross_exact',
                    offers: [],
                });
            }
            directCrossGroups.get(groupKey).offers.push(offer);
        }

        return mergeSiteOffersForDisplay([
            ...groups,
            ...Array.from(directCrossGroups.values()),
        ]);
    }, [
        currentOem,
        selectedBrand,
        showCrosses,
        siteExactCrossOffers,
        siteExactOffers,
        siteOffersWithCrosses,
    ]);

    const siteOfferFilterOptions = useMemo(() => {
        const brands = new Set();
        const suppliers = new Set();
        for (const offer of remoteOffers) {
            const brand = getSiteOfferBrandName(offer);
            const supplier = getSiteOfferSupplierName(offer);
            if (brand) brands.add(brand);
            if (supplier) suppliers.add(supplier);
        }
        const toOptions = (values) => Array.from(values)
            .sort((a, b) => a.localeCompare(b, 'ru'))
            .map((value) => ({ value, label: value }));
        return {
            brands: toOptions(brands),
            suppliers: toOptions(suppliers),
        };
    }, [remoteOffers]);

    const activeSiteOfferFilterCount = useMemo(() => (
        (siteOfferFilters.brands.length ? 1 : 0)
        + (siteOfferFilters.suppliers.length ? 1 : 0)
        + (siteOfferFilters.sourceTypes.length ? 1 : 0)
        + [
            siteOfferFilters.minPrice,
            siteOfferFilters.maxPrice,
            siteOfferFilters.minQty,
            siteOfferFilters.maxDelivery,
        ].filter((value) => value !== null).length
    ), [siteOfferFilters]);

    const filteredRemoteSiteOffers = useMemo(() => {
        const brandSet = new Set(
            siteOfferFilters.brands.map(normalizeBrandToken)
        );
        const supplierSet = new Set(
            siteOfferFilters.suppliers.map((value) => value.toUpperCase())
        );
        const sourceTypeSet = new Set(siteOfferFilters.sourceTypes);
        return remoteOffers.filter((offer) => {
            const brand = normalizeBrandToken(getSiteOfferBrandName(offer));
            const supplier = getSiteOfferSupplierName(offer).toUpperCase();
            const price = Number(offer?.price ?? Number.NaN);
            const quantity = Number(offer?.qnt ?? Number.NaN);
            const delivery = getSiteOfferDelivery(offer);
            const requestTypes = Array.isArray(offer?.site_request_types)
                ? offer.site_request_types
                : [];
            if (brandSet.size && !brandSet.has(brand)) return false;
            if (supplierSet.size && !supplierSet.has(supplier)) return false;
            if (
                sourceTypeSet.size
                && !requestTypes.some((type) => sourceTypeSet.has(type))
            ) return false;
            if (
                siteOfferFilters.minPrice !== null
                && (!Number.isFinite(price) || price < siteOfferFilters.minPrice)
            ) return false;
            if (
                siteOfferFilters.maxPrice !== null
                && (!Number.isFinite(price) || price > siteOfferFilters.maxPrice)
            ) return false;
            if (
                siteOfferFilters.minQty !== null
                && (!Number.isFinite(quantity) || quantity < siteOfferFilters.minQty)
            ) return false;
            if (
                siteOfferFilters.maxDelivery !== null
                && (!Number.isFinite(delivery) || delivery > siteOfferFilters.maxDelivery)
            ) return false;
            return true;
        });
    }, [remoteOffers, siteOfferFilters]);

    const groupedRemoteSiteOffers = useMemo(() => {
        const groups = new Map();
        for (const offer of filteredRemoteSiteOffers) {
            const brand = getSiteOfferBrandName(offer);
            const oem = getSiteOfferOemNumber(offer);
            const normalizedOem = normalizeOemKey(oem);
            const groupKey = normalizedOem
                ? normalizeCrossKey(brand, normalizedOem)
                : `UNKNOWN::${buildCartKey('dragonzap', offer)}`;
            if (!groups.has(groupKey)) groups.set(groupKey, []);
            groups.get(groupKey).push(offer);
        }
        const rows = [];
        for (const [groupKey, offersInGroup] of groups.entries()) {
            const offers = sortSiteOffersByPriority(offersInGroup);
            const bestOffer = offers[0];
            const requestEntries = new Map();
            for (const offer of offers) {
                for (const entry of offer?.site_request_entries || []) {
                    requestEntries.set(
                        `${entry?.type || ''}::${entry?.label || ''}`,
                        entry
                    );
                }
            }
            const mergedEntries = Array.from(requestEntries.values());
            rows.push({
                ...bestOffer,
                site_group_key: groupKey,
                grouped_offers: offers,
                offer_count: offers.length,
                site_request_entries: mergedEntries,
                site_request_types: [
                    ...new Set(mergedEntries.map((entry) => entry?.type).filter(Boolean)),
                ],
                site_request_labels: [
                    ...new Set(mergedEntries.map((entry) => entry?.label).filter(Boolean)),
                ],
            });
        }
        return sortSiteOffersByPriority(rows);
    }, [filteredRemoteSiteOffers]);

    useEffect(() => {
        setRemoteOffersPage(1);
    }, [siteOfferFilters, remoteOffers.length]);

    const hasHiddenCrossSiteOffers = useMemo(
        () =>
            !showCrosses &&
            (siteOffersWithCrosses.length > 0 || siteExactCrossOffers.length > 0),
        [showCrosses, siteExactCrossOffers.length, siteOffersWithCrosses.length]
    );

    const summaryCrossItems = useMemo(() => {
        const itemsByKey = new Map();

        for (const item of trackingInsights?.cross_items || []) {
            const normalizedOem = normalizeOemKey(item?.oem_number);
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

    useEffect(() => {
        const nextQty = Number(
            trackingInsights?.draft_purchase_order?.recommended_qty || 1
        );
        setDraftOrderQty(nextQty > 0 ? nextQty : 1);
    }, [trackingInsights?.draft_purchase_order?.recommended_qty]);

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

    const resolveAutopartByBrandAndOem = useCallback(async (brandName, oemNumber) => {
        const normalizedBrandName = String(brandName || '').trim().toUpperCase();
        const normalizedOemNumber = String(oemNumber || '').trim().toUpperCase();
        if (!normalizedBrandName || !normalizedOemNumber) {
            return null;
        }
        const { data } = await searchAutopartsByOem(normalizedOemNumber, 50);
        const exactMatch = (data || []).find((item) => {
            const itemBrand = String(
                item?.brand_name || item?.brand || ''
            ).trim().toUpperCase();
            const itemOem = String(item?.oem_number || '').trim().toUpperCase();
            return itemBrand === normalizedBrandName && itemOem === normalizedOemNumber;
        });
        return exactMatch || null;
    }, []);

    const handleApproveSiteCross = useCallback(async (crossItem) => {
        if (!nomenclatureInfo?.id) {
            message.warning('Сначала нужна позиция в номенклатуре');
            return false;
        }
        const actionKey = `approve:${crossItem.key}`;
        setCrossActionLoadingKey(actionKey);
        try {
            const targetAutopart =
                crossItem?.autopart_id != null
                    ? { id: crossItem.autopart_id }
                    : await resolveAutopartByBrandAndOem(
                          crossItem?.brand_name,
                          crossItem?.oem_number
                      );
            const brandId = await resolveBrandIdByName(
                crossItem?.brand_name
            );
            await addAutopartCross(nomenclatureInfo.id, {
                cross_autopart_id: targetAutopart?.id ?? undefined,
                cross_brand_id: brandId,
                cross_oem_number: crossItem?.oem_number,
                comment: 'Подтверждено из поиска по сайту',
            });
            setConfirmedCrosses((prev) => {
                const nextItems = Array.isArray(prev) ? [...prev] : [];
                if (
                    nextItems.some(
                        (item) =>
                            normalizeCrossKey(
                                item?.cross_brand_name,
                                item?.cross_oem_number
                            ) === crossItem.key
                    )
                ) {
                    return nextItems;
                }
                nextItems.unshift({
                    id: `optimistic-confirmed:${crossItem.key}`,
                    cross_brand_id: brandId,
                    cross_brand_name: crossItem?.brand_name || null,
                    cross_oem_number: crossItem?.oem_number || '',
                    cross_autopart_id: targetAutopart?.id ?? null,
                    comment: 'Подтверждено из поиска по сайту',
                });
                return nextItems;
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
            message.success(
                targetAutopart?.id
                    ? 'Кросс добавлен в систему и привязан к позиции номенклатуры'
                    : 'Кросс добавлен в систему без привязки к позиции номенклатуры'
            );
            return true;
        } catch (error) {
            console.error('Approve site cross error:', error);
            message.error(
                error?.response?.data?.detail ||
                    error?.message ||
                    'Не удалось сохранить кросс'
            );
            return false;
        } finally {
            setCrossActionLoadingKey('');
        }
    }, [
        currentOem,
        fetchCrossStates,
        fetchTrackingInsights,
        nomenclatureInfo,
        resolveAutopartByBrandAndOem,
        resolveBrandIdByName,
        selectedBrand,
        siteOffersWithCrosses,
    ]);

    const handleRejectSiteCross = useCallback(async (crossItem) => {
        if (!nomenclatureInfo?.id) {
            message.warning('Сначала нужна позиция в номенклатуре');
            return false;
        }
        const actionKey = `reject:${crossItem.key}`;
        setCrossActionLoadingKey(actionKey);
        try {
            const matchingConfirmedCross = (confirmedCrosses || []).find(
                (item) =>
                    normalizeCrossKey(
                        item?.cross_brand_name,
                        item?.cross_oem_number
                    ) === crossItem.key
            );
            let brandId = null;
            if (!crossItem?.autopart_id) {
                try {
                    brandId = await resolveBrandIdByName(
                        crossItem?.brand_name
                    );
                } catch (brandError) {
                    console.warn(
                        'Reject site cross fallback to raw brand name:',
                        brandError
                    );
                }
            }
            if (matchingConfirmedCross?.id) {
                await deleteAutopartCross(matchingConfirmedCross.id);
            }
            await addAutopartInvalidCross(nomenclatureInfo.id, {
                invalid_autopart_id: crossItem?.autopart_id ?? undefined,
                invalid_brand_id: brandId ?? undefined,
                invalid_brand_name:
                    brandId == null
                        ? crossItem?.brand_name || undefined
                        : undefined,
                invalid_oem_number: crossItem?.oem_number || undefined,
                comment: 'Исключено из поиска по сайту вручную',
            });
            setConfirmedCrosses((prev) =>
                (Array.isArray(prev) ? prev : []).filter(
                    (item) =>
                        normalizeCrossKey(
                            item?.cross_brand_name,
                            item?.cross_oem_number
                        ) !== crossItem.key
                )
            );
            setInvalidCrosses((prev) => {
                const nextItems = Array.isArray(prev) ? [...prev] : [];
                if (
                    nextItems.some(
                        (item) =>
                            normalizeCrossKey(
                                item?.invalid_brand_name,
                                item?.invalid_oem_number
                            ) === crossItem.key
                    )
                ) {
                    return nextItems;
                }
                nextItems.unshift({
                    id: `optimistic-invalid:${crossItem.key}`,
                    invalid_brand_id: brandId,
                    invalid_brand_name: crossItem?.brand_name || null,
                    invalid_oem_number: crossItem?.oem_number || '',
                    invalid_autopart_id: crossItem?.autopart_id ?? null,
                    comment: 'Исключено из поиска по сайту вручную',
                });
                return nextItems;
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
            message.success('Кросс исключён из выборки');
            return true;
        } catch (error) {
            console.error('Reject site cross error:', error);
            if (error?.response?.status === 409) {
                await fetchCrossStates(nomenclatureInfo.id);
                message.success('Кросс уже был исключён ранее');
                return true;
            }
            message.error(
                error?.response?.data?.detail ||
                    error?.message ||
                    'Не удалось исключить кросс'
            );
            return false;
        } finally {
            setCrossActionLoadingKey('');
        }
    }, [
        currentOem,
        fetchCrossStates,
        fetchTrackingInsights,
        nomenclatureInfo,
        resolveBrandIdByName,
        selectedBrand,
        confirmedCrosses,
        siteOffersWithCrosses,
    ]);

    const handleApproveOwnStockCross = useCallback(async (row) => {
        const crossItem = {
            key: normalizeCrossKey(row?.brand_name, row?.oem_number),
            brand_name: row?.brand_name || '',
            oem_number: row?.oem_number || '',
            autopart_id: row?.autopart_id ?? null,
        };
        const saved = await handleApproveSiteCross(crossItem);
        if (!saved) {
            return;
        }

        const promotedRows = (unverifiedStockRows || []).filter(
            (candidate) =>
                normalizeCrossKey(
                    candidate?.brand_name,
                    candidate?.oem_number
                ) === crossItem.key
        );
        setOurStockRows((previousRows) => {
            const nextRows = Array.isArray(previousRows)
                ? [...previousRows]
                : [];
            const existingKeys = new Set(
                nextRows.map(
                    (candidate) =>
                        `${candidate?.autopart_id}-${candidate?.pricelist_id}`
                )
            );
            for (const candidate of promotedRows) {
                const rowKey = `${candidate?.autopart_id}-${candidate?.pricelist_id}`;
                if (existingKeys.has(rowKey)) {
                    continue;
                }
                existingKeys.add(rowKey);
                nextRows.push({
                    ...candidate,
                    unverified_cross: false,
                    is_requested_oem: false,
                });
            }
            return nextRows;
        });
        setUnverifiedStockRows((previousRows) =>
            (Array.isArray(previousRows) ? previousRows : []).filter(
                (candidate) =>
                    normalizeCrossKey(
                        candidate?.brand_name,
                        candidate?.oem_number
                    ) !== crossItem.key
            )
        );
    }, [handleApproveSiteCross, unverifiedStockRows]);

    const handleRejectOwnStockCross = useCallback(async (row) => {
        const crossItem = {
            key: normalizeCrossKey(row?.brand_name, row?.oem_number),
            brand_name: row?.brand_name || '',
            oem_number: row?.oem_number || '',
            autopart_id: row?.autopart_id ?? null,
        };
        const saved = await handleRejectSiteCross(crossItem);
        if (!saved) {
            return;
        }
        setUnverifiedStockRows((previousRows) =>
            (Array.isArray(previousRows) ? previousRows : []).filter(
                (candidate) =>
                    normalizeCrossKey(
                        candidate?.brand_name,
                        candidate?.oem_number
                    ) !== crossItem.key
            )
        );
    }, [handleRejectSiteCross]);

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
                        normalizeOemKey(crossCurrentBest.oem_number) !==
                            normalizedCurrentOem
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

        if (trackingInsights.abc_xyz?.abc_class || trackingInsights.abc_xyz?.xyz_class) {
            const abcClass = trackingInsights.abc_xyz?.abc_class || '—';
            const xyzClass = trackingInsights.abc_xyz?.xyz_class || '—';
            tiles.push({
                key: 'abcxyz',
                tone: 'slate',
                title: 'ABC / XYZ',
                value: `${abcClass} / ${xyzClass}`,
                subtitle: [
                    abcClass !== '—' ? `${abcClass} = ${ABC_MEANINGS[abcClass] || ''}` : null,
                    xyzClass !== '—' ? `${xyzClass} = ${XYZ_MEANINGS[xyzClass] || ''}` : null,
                ]
                    .filter(Boolean)
                    .join(' · '),
                extra: [
                    `За год заказали ${Number(
                        trackingInsights.abc_xyz?.annual_ordered_qty || 0
                    ).toLocaleString('ru-RU')} шт`,
                    `активных месяцев: ${trackingInsights.abc_xyz?.active_months || 0}`,
                    trackingInsights.abc_xyz?.monthly_cv != null
                        ? `CV ${trackingInsights.abc_xyz.monthly_cv} = разброс спроса по месяцам`
                        : null,
                    trackingInsights.abc_xyz?.cumulative_share_pct != null
                        ? `доля в общем ранге оборота: ${trackingInsights.abc_xyz.cumulative_share_pct}%`
                        : null,
                ]
                    .filter(Boolean)
                    .join(' · '),
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

    const supplierScoreRows = useMemo(() => {
        const rows = Array.isArray(trackingInsights?.supplier_stats)
            ? [...trackingInsights.supplier_stats]
            : [];
        return rows.sort((a, b) => {
            const priceDiff =
                Number(a?.current_price || 9_999_999) -
                Number(b?.current_price || 9_999_999);
            if (priceDiff !== 0) {
                return priceDiff;
            }
            const fillDiff =
                Number(b?.fill_rate || 0) - Number(a?.fill_rate || 0);
            if (fillDiff !== 0) {
                return fillDiff;
            }
            return (
                Number(a?.effective_lead_days || 9_999) -
                Number(b?.effective_lead_days || 9_999)
            );
        });
    }, [trackingInsights?.supplier_stats]);

    const supplierScoreColumns = useMemo(
        () => [
            {
                title: 'Поставщик',
                key: 'provider',
                render: (_, row) => (
                    <div>
                        <div style={{ fontWeight: 600 }}>{row.provider_name || '—'}</div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                            {row.current_brand_name && row.current_oem_number
                                ? `${row.current_brand_name} ${row.current_oem_number}`
                                : row.current_oem_number || '—'}
                        </div>
                    </div>
                ),
            },
            {
                title: 'Цена',
                dataIndex: 'current_price',
                width: 110,
                render: (value) =>
                    value != null ? `${formatInsightMoney(value)}` : '—',
            },
            {
                title: 'Наличие',
                dataIndex: 'current_qty',
                width: 90,
                render: (value) =>
                    value != null ? `${Number(value).toLocaleString('ru-RU')} шт` : '—',
            },
            {
                title: 'Факт. срок',
                key: 'lead',
                width: 110,
                render: (_, row) =>
                    row.avg_lead_days != null
                        ? `${row.avg_lead_days} дн`
                        : row.effective_lead_days != null
                            ? `~${row.effective_lead_days} дн`
                            : '—',
            },
            {
                title: 'Исполнение',
                dataIndex: 'fill_rate',
                width: 100,
                render: (value) => (value != null ? `${value}%` : '—'),
            },
            {
                title: 'Заказов',
                dataIndex: 'order_count',
                width: 90,
            },
        ],
        []
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
        if (didRestoreStateRef.current) {
            return;
        }
        didRestoreStateRef.current = true;
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
                // Данные не хранятся в localStorage — перезапускаем поиск,
                // чтобы страница не оставалась пустой. URL-автопоиск имеет
                // приоритет.
                const hasUrlAutoSearch =
                    searchParams.get('auto') === '1' &&
                    String(searchParams.get('oem') || '').trim();
                if (!hasUrlAutoSearch) {
                    setPendingRestoredSearch({
                        oem: storedState.currentOem,
                        brand: storedState.selectedBrand || '',
                        partial: Boolean(storedState.partialSearch),
                    });
                }
            }
        }
    }, [form, searchParams]);

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
        safeStorageSet(VIEW_MODE_STORAGE_KEY, viewMode);
    }, [viewMode]);

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
                const nextQty =
                    item.source_type === 'supplier'
                        ? normalizePositiveQty(Number(item.order_qty || 1) + 1)
                        : clampQty(Number(item.order_qty || 1) + 1, maxValue);
                return {
                    ...item,
                    ...nextItem,
                    order_qty: nextQty,
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
            sale_price_reference: ownSalePrice,
            margin_warning:
                !record.is_own_price && isLowMarginPurchase(record.price),
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
            sale_price_reference: ownSalePrice,
            margin_warning: isLowMarginPurchase(record.price),
        });
        message.success('Позиция добавлена в корзину');
    };

    const updateCartQty = (cartKey, value) => {
        setCartItems((prev) =>
            prev.map((item) => {
                if (item.cart_key !== cartKey) {
                    return item;
                }
                const nextQty =
                    item.source_type === 'supplier'
                        ? normalizePositiveQty(value)
                        : clampQty(value, Number(item.available_qty));
                return {
                    ...item,
                    order_qty: nextQty,
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
            return { brand: '', oem: '' };
        }
        setLoading(true);
        setTrackingHistoryLoading(true);
        setHistoricalOffers([]);
        setRemoteOffers([]);
        setSiteExactOffers([]);
        setSiteOffersWithCrosses([]);
        setSiteExactCrossOffers([]);
        setSiteBrandFamilyNames([]);
        setSiteCrossFollowupStatus({
            active: false,
            total: 0,
            completed: 0,
            candidates: [],
        });
        setSiteResponseDiagnostics(null);
        setSiteRequestError(null);
        setTrackingHistory([]);
        setTrackingInsights(null);
        setOurStockRows([]);
        setUnverifiedStockRows([]);
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
            setOurStockRows(
                Array.isArray(data?.our_stock_rows)
                    ? data.our_stock_rows
                    : []
            );
            // Каноничный OEM из ответа бэкенда (без дефисов/пробелов) —
            // иначе сравнения с базой и сайтом дают ложные «кроссы».
            const canonicalOem =
                String(data?.oem_number || '').trim() || oemValue;
            setCurrentOem(canonicalOem);
            setOemInput(canonicalOem);
            pushOemHistory(canonicalOem);
            const fallbackBrand = [...list, ...historicalList].find(
                (item) => item.brand_name
            )?.brand_name;
            const resolvedBrand = brandHint || fallbackBrand || '';
            const siteBrandsResponse = await getDragonzapBrands(
                canonicalOem
            ).catch(() => null);
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
            // Быстрая история из базы без синка с сайтом: полный синк
            // статусов и тяжёлая сводка выполняются один раз в
            // requestDragonzapOffers (уже со списком кроссов сайта).
            const trackingResponse = await getTrackingOrderItems({
                oem: canonicalOem,
                brand: effectiveBrand || undefined,
                sync_site: false,
                include_crosses: true,
                limit: 1000,
                site_cross_oems: undefined,
            }).catch(() => null);
            const trackingRows = Array.isArray(trackingResponse?.data)
                ? trackingResponse.data
                : [];
            setTrackingHistory(trackingRows);
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
            return {
                brand: effectiveBrand || siteSuggestedBrand || '',
                oem: canonicalOem,
            };
        } catch (error) {
            console.error('Fetch offers error:', error);
            message.error(
                extractRequestError(error, 'Ошибка получения данных')
            );
            return { brand: '', oem: oemValue };
        } finally {
            setLoading(false);
            setTrackingHistoryLoading(false);
        }
    }, [pushOemHistory]);

    const handleSearch = async (values, options = {}) => {
        const oemValue = (values.oem || '').trim();
        if (oemValue) {
            setRemoteOffersPage(1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        const effectivePartialSearch =
            options.partialSearch ?? partialSearch;
        const { brand: resolvedBrand, oem: canonicalOem } =
            await executeSearch(oemValue, effectivePartialSearch);
        if (!oemValue) {
            return;
        }
        const brandFamily = resolvedBrand
            ? await resolveBrandFamilyNames(resolvedBrand)
            : [];
        const shouldRestrictCrossBrand = brandFamily.some(
            (brand) => normalizeBrandToken(brand) === TOYOTA_BRAND_TOKEN
        );
        setShowCrosses(true);
        setRestrictCrossBrand(shouldRestrictCrossBrand);
        await requestDragonzapOffers(canonicalOem || oemValue, resolvedBrand, {
            showCrosses: true,
            restrictCrossBrand: shouldRestrictCrossBrand,
        });
    };

    const requestDragonzapOffers = useCallback(async (
        oemValue,
        brandValue,
        options = {}
    ) => {
        let effectiveBrand = String(brandValue || '').trim();
        const effectiveShowCrosses = options.showCrosses ?? showCrosses;
        const effectiveRestrictCrossBrand =
            options.restrictCrossBrand ?? restrictCrossBrand;
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
            // Сайт не спрашиваем, но сводку по заказам всё равно показываем.
            void fetchTrackingInsights({
                oemValue,
                brandValue: '',
                extraOemNumbers: [],
            });
            return;
        }
        setRemoteLoading(true);
        setSiteBrandWarning(null);
        setSiteRequestError(null);
        setSiteResponseDiagnostics(null);
        setSiteExactCrossOffers([]);
        setSiteCrossFollowupStatus({
            active: false,
            total: 0,
            completed: 0,
            candidates: [],
        });
        try {
            const allowedBrandFamilyNames = effectiveRestrictCrossBrand
                ? await resolveBrandFamilyNames(
                    effectiveBrand || selectedBrand || brandValue || ''
                )
                : [];
            const allowedBrandFamilySet = new Set(
                allowedBrandFamilyNames.map(normalizeBrandToken)
            );
            setSiteBrandFamilyNames(allowedBrandFamilyNames);
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

            // Точный запрос и запрос с кроссами независимы — параллелим,
            // это заметно сокращает ожидание ответа сайта.
            const [exactResponse, crossResponse] = await Promise.all([
                getDragonzapOffers(oemValue, effectiveBrand, true),
                effectiveShowCrosses
                    ? getDragonzapOffers(oemValue, effectiveBrand, false)
                    : Promise.resolve(null),
            ]);
            const exactParsed = normalizeSiteResponse(
                exactResponse?.data,
                effectiveBrand,
                false
            );
            const crossParsed = crossResponse
                ? normalizeSiteResponse(
                    crossResponse.data,
                    effectiveBrand,
                    true
                )
                : {
                    offers: [],
                    responseBrandCandidates: [],
                    fallbackBrand: '',
                    usedFallbackBrand: false,
                    rawCount: 0,
                    shownCount: 0,
                    qtyFilteredCount: 0,
                    brandFilteredCount: 0,
                };
            const filteredCrossOffers = crossParsed.offers.filter((offer) => {
                const normalizedOfferOem = normalizeOemKey(
                    offer?.oem || offer?.oem_number
                );
                const normalizedOfferBrand = normalizeBrandToken(
                    offer?.make_name || offer?.brand_name
                );
                if (
                    effectiveRestrictCrossBrand &&
                    allowedBrandFamilySet.size &&
                    normalizedOfferBrand &&
                    !allowedBrandFamilySet.has(normalizedOfferBrand)
                ) {
                    return false;
                }
                if (
                    !normalizedOfferOem ||
                    normalizedOfferOem === normalizeOemKey(oemValue)
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
            const activeParsed = effectiveShowCrosses ? crossParsed : exactParsed;
            const nextSiteCrossOems = extractUniqueCrossOems(
                crossParsed.offers,
                oemValue
            );

            setSiteExactOffers(exactParsed.offers);
            setSiteOffersWithCrosses(crossParsed.offers);
            setSiteResponseDiagnostics({
                requestedBrand: effectiveBrand,
                usingCrossFallback: false,
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

            const [trackingResponse, trackingInsightsPayload] = await Promise.all([
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
            const crossLookupCandidates = extractCheapestCrossCandidatesFromLocalOffers(
                trackingInsightsPayload?.cross_offer_rows,
                oemValue
            ).filter((item) => {
                if (
                    !effectiveRestrictCrossBrand ||
                    !allowedBrandFamilySet.size
                ) {
                    return true;
                }
                return allowedBrandFamilySet.has(
                    normalizeBrandToken(item?.brand_name)
                );
            });
            if (effectiveShowCrosses && crossLookupCandidates.length) {
                setSiteCrossFollowupStatus({
                    active: true,
                    total: crossLookupCandidates.length,
                    completed: 0,
                    candidates: crossLookupCandidates,
                });
            } else {
                setSiteCrossFollowupStatus({
                    active: false,
                    total: 0,
                    completed: 0,
                    candidates: [],
                });
            }
            let nextSiteExactCrossOffers = [];
            if (effectiveShowCrosses && crossLookupCandidates.length) {
                const siteBrandCandidatesByOem = new Map();
                for (const offer of filteredCrossOffers) {
                    const candidateOem = String(
                        offer?.oem || offer?.oem_number || ''
                    ).trim().toUpperCase();
                    const candidateBrand = String(
                        offer?.make_name || offer?.brand_name || ''
                    ).trim();
                    const candidatePrice = Number(offer?.price);
                    if (
                        !candidateOem ||
                        !candidateBrand ||
                        !Number.isFinite(candidatePrice)
                    ) {
                        continue;
                    }
                    const existingCandidate = siteBrandCandidatesByOem.get(
                        candidateOem
                    );
                    if (
                        !existingCandidate ||
                        candidatePrice < existingCandidate.price
                    ) {
                        siteBrandCandidatesByOem.set(candidateOem, {
                            brand_name: candidateBrand,
                            price: candidatePrice,
                        });
                    }
                }
                const directCrossExactResponses = await Promise.all(
                    crossLookupCandidates.map(async (item) => {
                        const siteBrandCandidate = siteBrandCandidatesByOem.get(
                            item.oem_number
                        );
                        const requestBrand =
                            siteBrandCandidate?.brand_name || item.brand_name;
                        try {
                            const response = await getDragonzapOffers(
                                item.oem_number,
                                requestBrand,
                                true
                            );
                            const parsed = normalizeSiteResponse(
                                response?.data,
                                requestBrand,
                                false
                            );
                            return (parsed.offers || []).map((offer) => ({
                                ...offer,
                                recommendation_source: 'cross_exact',
                                recommendation_cross_brand_name: requestBrand,
                                recommendation_cross_oem_number: item.oem_number,
                                recommendation_local_cross_price: item.price,
                            }));
                        } catch (crossExactError) {
                            console.warn(
                                'Dragonzap direct cross exact lookup failed:',
                                item,
                                crossExactError
                            );
                            return [];
                        } finally {
                            setSiteCrossFollowupStatus((prev) => ({
                                ...prev,
                                completed: Math.min(
                                    prev.total,
                                    Number(prev.completed || 0) + 1
                                ),
                            }));
                        }
                    })
                );
                nextSiteExactCrossOffers = dedupeAndSortSiteOffers(
                    directCrossExactResponses.flat()
                );
            }
            setSiteExactCrossOffers(nextSiteExactCrossOffers);
            setSiteCrossFollowupStatus((prev) => ({
                ...prev,
                active: false,
            }));
            const trackingRows = Array.isArray(trackingResponse?.data)
                ? trackingResponse.data
                : [];
            setTrackingHistory(trackingRows);
            if (!effectiveShowCrosses && !exactParsed.offers.length) {
                message.info(
                    'Сайт ничего не показал по точному OEM и выбранному бренду.'
                );
            } else if (
                effectiveShowCrosses &&
                !exactParsed.offers.length &&
                crossParsed.offers.length
            ) {
                message.info(
                    'По точному OEM сайт ничего не вернул. Показаны предложения с учетом кроссов.'
                );
            } else if (
                effectiveShowCrosses &&
                !exactParsed.offers.length &&
                !crossParsed.offers.length
            ) {
                message.info(
                    'Сайт ничего не показал ни по точному OEM, ни по запросу с учетом кроссов.'
                );
            }
        } catch (error) {
            console.error('Dragonzap request error:', error);
            setSiteCrossFollowupStatus((prev) => ({
                ...prev,
                active: false,
            }));
            const describedError = describeDragonzapRequestError(error);
            setSiteRequestError(describedError);
            message.error(describedError.userMessage);
        } finally {
            setRemoteLoading(false);
        }
    }, [
        fetchTrackingInsights,
        invalidCrossKeySet,
        restrictCrossBrand,
        resolveBrandFamilyNames,
        selectedBrand,
        showCrosses,
    ]);

    useEffect(() => {
        setRemoteOffers(mergedRemoteSiteOffers);
        setRemoteMeta({ total: mergedRemoteSiteOffers.length });
    }, [mergedRemoteSiteOffers]);

    useEffect(() => {
        if (previousRestrictCrossBrandRef.current === restrictCrossBrand) {
            return;
        }
        previousRestrictCrossBrandRef.current = restrictCrossBrand;
        if (!showCrosses || !currentOem || !siteResponseDiagnostics) {
            return;
        }
        void requestDragonzapOffers(currentOem, selectedBrand || '');
    }, [
        currentOem,
        requestDragonzapOffers,
        restrictCrossBrand,
        selectedBrand,
        siteResponseDiagnostics,
        showCrosses,
    ]);

    useEffect(() => {
        if (previousShowCrossesRef.current === showCrosses) {
            return;
        }
        const wasEnabled = previousShowCrossesRef.current;
        previousShowCrossesRef.current = showCrosses;
        if (!currentOem || !siteResponseDiagnostics) {
            return;
        }
        if (showCrosses && !wasEnabled) {
            void requestDragonzapOffers(currentOem, selectedBrand || '');
        }
    }, [
        currentOem,
        requestDragonzapOffers,
        selectedBrand,
        showCrosses,
        siteResponseDiagnostics,
    ]);

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
            const { brand: resolvedBrand, oem: canonicalOem } =
                await executeSearch(oemValue, false, brandValue);
            const effectiveBrand = brandValue || resolvedBrand;
            if (effectiveBrand) {
                const brandFamily = await resolveBrandFamilyNames(effectiveBrand);
                const shouldRestrictCrossBrand = brandFamily.some(
                    (brand) => normalizeBrandToken(brand) === TOYOTA_BRAND_TOKEN
                );
                setShowCrosses(true);
                setRestrictCrossBrand(shouldRestrictCrossBrand);
                await requestDragonzapOffers(
                    canonicalOem || oemValue,
                    effectiveBrand,
                    {
                        showCrosses: true,
                        restrictCrossBrand: shouldRestrictCrossBrand,
                    }
                );
            }
        })();
    }, [
        executeSearch,
        form,
        requestDragonzapOffers,
        resolveBrandFamilyNames,
        searchParams,
    ]);

    useEffect(() => {
        if (!pendingRestoredSearch) {
            return;
        }
        const { oem, brand, partial } = pendingRestoredSearch;
        setPendingRestoredSearch(null);
        void (async () => {
            const { brand: resolvedBrand, oem: canonicalOem } =
                await executeSearch(oem, partial, brand);
            const effectiveBrand = brand || resolvedBrand;
            if (!effectiveBrand) {
                return;
            }
            const brandFamily = await resolveBrandFamilyNames(effectiveBrand);
            const shouldRestrictCrossBrand = brandFamily.some(
                (item) => normalizeBrandToken(item) === TOYOTA_BRAND_TOKEN
            );
            setShowCrosses(true);
            setRestrictCrossBrand(shouldRestrictCrossBrand);
            await requestDragonzapOffers(
                canonicalOem || oem,
                effectiveBrand,
                {
                    showCrosses: true,
                    restrictCrossBrand: shouldRestrictCrossBrand,
                }
            );
        })();
    }, [
        executeSearch,
        pendingRestoredSearch,
        requestDragonzapOffers,
        resolveBrandFamilyNames,
    ]);

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

    const comparisonSnapshots = useMemo(() => {
        const summarize = (rows, { quantityKey, getLabel }) => {
            const sourceRows = Array.isArray(rows) ? rows : [];
            const pricedRows = sourceRows.filter((row) => {
                const price = Number(row?.price);
                return Number.isFinite(price) && price > 0;
            });
            const bestPriceRow = pricedRows.reduce((best, row) => {
                if (!best || Number(row.price) < Number(best.price)) {
                    return row;
                }
                return best;
            }, null);
            const maxQuantity = sourceRows.reduce((maximum, row) => {
                const quantity = Number(row?.[quantityKey]);
                return Number.isFinite(quantity)
                    ? Math.max(maximum, quantity)
                    : maximum;
            }, 0);
            return {
                count: sourceRows.length,
                minPrice: bestPriceRow ? Number(bestPriceRow.price) : null,
                maxQuantity,
                bestLabel: bestPriceRow ? getLabel(bestPriceRow) : '',
            };
        };

        const ownRows = [
            ...(ourStockRows || []),
            ...(unverifiedStockRows || []),
        ];
        const supplierRows = filteredOffers.filter((row) => !row?.is_own_price);

        return {
            own: summarize(ownRows, {
                quantityKey: 'quantity',
                getLabel: (row) =>
                    [row?.brand || row?.brand_name, row?.oem_number]
                        .filter(Boolean)
                        .join(' '),
            }),
            suppliers: summarize(supplierRows, {
                quantityKey: 'quantity',
                getLabel: (row) =>
                    [row?.provider_name, row?.brand_name, row?.oem_number]
                        .filter(Boolean)
                        .join(' · '),
            }),
            site: summarize(filteredRemoteSiteOffers, {
                quantityKey: 'qnt',
                getLabel: (row) =>
                    [
                        getSiteOfferSupplierName(row),
                        getSiteOfferBrandName(row),
                        getSiteOfferOemNumber(row),
                    ]
                        .filter(Boolean)
                        .join(' · '),
            }),
        };
    }, [filteredOffers, filteredRemoteSiteOffers, ourStockRows, unverifiedStockRows]);

    const scrollToOffersSection = useCallback((sectionId) => {
        document.getElementById(sectionId)?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        });
    }, []);

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

    const supplierOverAvailableCartItems = useMemo(
        () =>
            cartItems.filter((item) => {
                if (item.source_type !== 'supplier') {
                    return false;
                }
                const available = Number(item.available_qty ?? 0);
                const ordered = Number(item.order_qty ?? 0);
                return Number.isFinite(available) && ordered > available;
            }),
        [cartItems]
    );

    const selectedSupplierOverAvailableItems = useMemo(
        () =>
            selectedSupplierCartItems.filter((item) => {
                const available = Number(item.available_qty ?? 0);
                const ordered = Number(item.order_qty ?? 0);
                return Number.isFinite(available) && ordered > available;
            }),
        [selectedSupplierCartItems]
    );

    const marginWarningCartItems = useMemo(
        () => cartItems.filter((item) => item.margin_warning),
        [cartItems]
    );

    const selectedMarginWarningItems = useMemo(
        () => effectiveCartItems.filter((item) => item.margin_warning),
        [effectiveCartItems]
    );

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

    const handleCreateAutoDraftOrder = async (sendNow = false) => {
        const draft = trackingInsights?.draft_purchase_order;
        if (!draft?.provider_id || !draft?.oem_number) {
            message.warning('Для позиции пока нет готового черновика закупки');
            return;
        }

        const quantity = clampQty(
            draftOrderQty,
            Number.MAX_SAFE_INTEGER
        );
        if (quantity <= 0) {
            message.warning('Количество для черновика должно быть больше нуля');
            return;
        }

        setCartSubmitting(true);
        try {
            const { data } = await createManualSupplierOrder({
                provider_id: Number(draft.provider_id),
                items: [
                    {
                        autopart_id: draft.autopart_id,
                        oem: draft.oem_number,
                        brand: draft.brand_name || '',
                        name: draft.autopart_name,
                        quantity,
                        price: draft.price != null ? Number(draft.price) : null,
                        min_delivery_day: trackingInsights?.recommended_supplier?.current_min_delivery,
                        max_delivery_day: trackingInsights?.recommended_supplier?.current_max_delivery,
                    },
                ],
            });
            if (sendNow && data?.id) {
                const sent = await sendSupplierOrders([data.id]);
                message.success(
                    `Черновик создан и отправлен. Успешно: ${sent?.data?.sent || 0}, ошибок: ${sent?.data?.failed || 0}.`
                );
            } else {
                message.success('Черновик закупки создан');
            }
        } catch (error) {
            message.error(
                error?.response?.data?.detail ||
                    'Не удалось создать черновик закупки'
            );
        } finally {
            setCartSubmitting(false);
        }
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
            if (selectedSupplierOverAvailableItems.length) {
                message.warning(
                    `В ${selectedSupplierOverAvailableItems.length} поз. заказ больше остатка в прайсе. Отправляем введённое количество.`
                );
            }
            const supplierMarginWarnings = selectedSupplierCartItems.filter(
                (item) => item.margin_warning
            );
            if (supplierMarginWarnings.length) {
                message.warning(
                    `В ${supplierMarginWarnings.length} поз. закупка выше ${Math.round(MAX_PURCHASE_TO_SALE_RATIO * 100)}% нашей цены продажи.`
                );
            }
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
            const dragonzapMarginWarnings = selectedDragonzapCartItems.filter(
                (item) => item.margin_warning
            );
            if (dragonzapMarginWarnings.length) {
                message.warning(
                    `В ${dragonzapMarginWarnings.length} поз. закупка выше ${Math.round(MAX_PURCHASE_TO_SALE_RATIO * 100)}% нашей цены продажи.`
                );
            }
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
            render: (value, record) =>
                renderPurchasePrice(value, {
                    skipMarginCheck: Boolean(record.is_own_price),
                }),
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
        {
            title: 'Позиция',
            key: 'position',
            width: 138,
            render: (_, record) => (
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            fontWeight: 600,
                            lineHeight: 1.2,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {record.oem || record.oem_number || '—'}
                    </div>
                    <div
                        style={{
                            color: '#64748b',
                            fontSize: 11,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {record.make_name || record.brand_name || '—'}
                    </div>
                    {Number(record.offer_count || 0) > 1 ? (
                        <div
                            style={{
                                marginTop: 2,
                                color: '#2563eb',
                                fontSize: 11,
                                fontWeight: 600,
                            }}
                        >
                            {record.offer_count} предлож.
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'Наименование',
            dataIndex: 'detail_name',
            key: 'detail_name',
            ellipsis: true,
            width: 140,
        },
        {
            title: 'Запрос',
            key: 'site_request_labels',
            width: 132,
            render: (_, record) => {
                const entries = Array.isArray(record.site_request_entries)
                    ? record.site_request_entries
                    : [];
                if (!entries.length) {
                    return <span style={{ color: '#94a3b8' }}>—</span>;
                }
                const hasBaseExact = entries.some(
                    (entry) => String(entry?.type || '').trim() === 'base_exact'
                );
                const hasBaseCross = entries.some(
                    (entry) => String(entry?.type || '').trim() === 'base_cross'
                );
                const crossExactEntries = entries.filter(
                    (entry) => String(entry?.type || '').trim() === 'cross_exact'
                );
                const compactTags = [];
                if (hasBaseExact) {
                    compactTags.push({ key: 'base_exact', label: 'OEM', color: 'green' });
                }
                if (hasBaseCross) {
                    compactTags.push({ key: 'base_cross', label: 'OEM+X', color: 'blue' });
                }
                if (crossExactEntries.length) {
                    compactTags.push({
                        key: 'cross_exact',
                        label:
                            crossExactEntries.length > 1
                                ? `Кросс +${crossExactEntries.length}`
                                : 'Кросс',
                        color: 'purple',
                    });
                }
                const tooltipContent = (
                    <Space direction="vertical" size={4}>
                        {entries.map((entry) => (
                            <div key={`${entry?.type || ''}:${entry?.label || ''}`}>
                                {entry?.label || 'Запрос сайта'}
                            </div>
                        ))}
                    </Space>
                );
                return (
                    <Tooltip title={tooltipContent}>
                        <Space size={4} wrap>
                            {compactTags.map((entry) => (
                                <Tag
                                    key={entry.key}
                                    color={entry.color}
                                    style={{ marginInlineEnd: 0 }}
                                >
                                    {entry.label}
                                </Tag>
                            ))}
                        </Space>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 76,
            sorter: (a, b) => {
                const aPrice = Number(a.price ?? Number.POSITIVE_INFINITY);
                const bPrice = Number(b.price ?? Number.POSITIVE_INFINITY);
                return aPrice - bPrice;
            },
            render: (value, record) => (
                <div>
                    {renderPurchasePrice(value)}
                    {Number(record.offer_count || 0) > 1 ? (
                        <div style={{ color: '#16a34a', fontSize: 10 }}>
                            лучшая цена
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'Кол-во',
            dataIndex: 'qnt',
            key: 'qnt',
            width: 56,
            render: (value) => (value === null || value === undefined ? '—' : value),
        },
        {
            title: 'Срок',
            key: 'delivery',
            width: 66,
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
                return `${min ?? '?'}-${max ?? '?'}`;
            },
        },
        {
            title: 'Поставщик',
            dataIndex: 'supplier_name',
            key: 'supplier_name',
            width: 92,
            ellipsis: true,
            render: (value) => value || '—',
        },
        {
            title: 'Комм.',
            dataIndex: 'comment',
            key: 'comment',
            width: 46,
            align: 'center',
            render: (value) =>
                value ? (
                    <Tooltip title={value}>
                        <InfoCircleOutlined style={{ color: '#64748b' }} />
                    </Tooltip>
                ) : (
                    <span style={{ color: '#94a3b8' }}>—</span>
                ),
        },
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
            width: 76,
            render: (value) => (
                <Tag color={value === 'dragonzap' ? 'blue' : 'green'}>
                    {value === 'dragonzap' ? 'Сайт' : 'Прайс'}
                </Tag>
            ),
        },
        {
            title: 'Позиция',
            key: 'position',
            width: 150,
            render: (_, record) => (
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            fontWeight: 600,
                            lineHeight: 1.2,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {record.oem_number || '—'}
                    </div>
                    <div
                        style={{
                            color: '#64748b',
                            fontSize: 11,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {record.brand_name || '—'}
                    </div>
                </div>
            ),
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            width: 150,
            ellipsis: true,
            render: (value) =>
                value ? (
                    <Tooltip title={value}>
                        <span>{value}</span>
                    </Tooltip>
                ) : '—',
        },
        {
            title: 'Поставщик',
            dataIndex: 'provider_name',
            key: 'provider_name',
            width: 126,
            ellipsis: true,
            render: (value, record) => (
                <Tooltip
                    title={
                        <Space direction="vertical" size={2}>
                            <div>{value || '—'}</div>
                            {record.provider_config_name ? (
                                <div>{record.provider_config_name}</div>
                            ) : null}
                        </Space>
                    }
                >
                    <div style={{ minWidth: 0 }}>
                        <div
                            style={{
                                fontWeight: 500,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {value || '—'}
                        </div>
                        {record.provider_config_name ? (
                            <div
                                style={{
                                    color: '#6b7280',
                                    fontSize: 11,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {record.provider_config_name}
                            </div>
                        ) : null}
                    </div>
                </Tooltip>
            ),
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 76,
            render: (value, record) => {
                if (value === null || value === undefined) {
                    return '—';
                }
                const formatted = Number(value).toFixed(2);
                if (!record.margin_warning) {
                    return formatted;
                }
                return (
                    <Tooltip
                        title={
                            record.sale_price_reference != null
                                ? `Закупка выше ${Math.round(MAX_PURCHASE_TO_SALE_RATIO * 100)}% нашей цены продажи (${Number(record.sale_price_reference).toFixed(2)} руб.)`
                                : 'Закупка близка к нашей цене продажи — маржа под угрозой'
                        }
                    >
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>
                            {formatted} ⚠
                        </span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Дост.',
            dataIndex: 'available_qty',
            key: 'available_qty',
            width: 64,
            render: (value) => value ?? '—',
        },
        {
            title: 'Заказ',
            dataIndex: 'order_qty',
            key: 'order_qty',
            width: 112,
            render: (value, record) => {
                const isSupplier = record.source_type === 'supplier';
                const available = Number(record.available_qty ?? 0);
                const ordered = Number(value ?? 0);
                const overAvailable =
                    isSupplier &&
                    Number.isFinite(available) &&
                    ordered > available;
                return (
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <InputNumber
                            min={1}
                            max={
                                !isSupplier && Number(record.available_qty) > 0
                                    ? Number(record.available_qty)
                                    : undefined
                            }
                            value={value}
                            size="small"
                            status={overAvailable ? 'error' : undefined}
                            style={{ width: '100%' }}
                            onChange={(nextValue) =>
                                updateCartQty(record.cart_key, nextValue)
                            }
                        />
                        {overAvailable ? (
                            <Tooltip title="В прайсе поставщика указано меньшее количество. Заказ всё равно будет отправлен с введённым количеством.">
                                <span style={{ color: '#dc2626', fontSize: 11 }}>
                                    больше прайса
                                </span>
                            </Tooltip>
                        ) : null}
                    </Space>
                );
            },
        },
        {
            title: 'Срок',
            key: 'delivery',
            width: 72,
            render: (_, record) => {
                const min = record.min_delivery_day;
                const max = record.max_delivery_day;
                if (min == null && max == null) {
                    return '—';
                }
                return `${min ?? '?'}-${max ?? '?'}`;
            },
        },
        {
            title: '',
            key: 'remove',
            width: 48,
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

    const renderCartActions = ({ compact = false } = {}) => (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
            {supplierOverAvailableCartItems.length ? (
                <Alert
                    type="warning"
                    showIcon
                    message="Есть позиции, где заказ больше остатка в прайсе"
                    description={
                        selectedSupplierOverAvailableItems.length
                            ? `В выбранном заказе таких позиций: ${selectedSupplierOverAvailableItems.length}. Заказ будет отправлен с введённым количеством.`
                            : `В корзине таких позиций: ${supplierOverAvailableCartItems.length}. Если они попадут в отправку, заказ уйдёт с введённым количеством.`
                    }
                />
            ) : null}

            {marginWarningCartItems.length ? (
                <Alert
                    type="warning"
                    showIcon
                    message={`Маржа под угрозой: закупка выше ${Math.round(MAX_PURCHASE_TO_SALE_RATIO * 100)}% нашей цены продажи`}
                    description={
                        selectedMarginWarningItems.length
                            ? `В выбранном заказе таких позиций: ${selectedMarginWarningItems.length} (отмечены ⚠ в колонке «Цена»). Проверьте цену перед отправкой.`
                            : `В корзине таких позиций: ${marginWarningCartItems.length} (отмечены ⚠ в колонке «Цена»).`
                    }
                />
            ) : null}

            <Space wrap align="center">
                <span style={{ color: '#374151' }}>Клиент для сайта:</span>
                <Select
                    allowClear
                    showSearch
                    placeholder="Выберите клиента"
                    value={selectedCustomerId}
                    loading={customersLoading}
                    options={customerOptions}
                    style={{ minWidth: compact ? 220 : 260 }}
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
        </Space>
    );

    const cartPreview = (
        <div className="autopart-offers-cart-popover">
            <div className="autopart-offers-cart-popover-summary">
                Всего: {cartSummary.total} · из прайсов: {cartSummary.supplier} · с сайта: {cartSummary.dragonzap} · сумма: {cartSummary.sum.toFixed(2)}
            </div>
            <div style={{ marginBottom: 12 }}>
                {renderCartActions({ compact: true })}
            </div>
            <Table
                rowKey="cart_key"
                columns={cartColumns}
                dataSource={cartItems}
                size="small"
                pagination={false}
                tableLayout="fixed"
                rowSelection={{
                    selectedRowKeys: selectedCartKeys,
                    onChange: (keys) => setSelectedCartKeys(keys),
                }}
                locale={{
                    emptyText: 'Корзина пуста',
                }}
                scroll={{ x: 840, y: 360 }}
            />
        </div>
    );

    const ourStockColumns = [
        {
            title: 'Бренд',
            dataIndex: 'brand_name',
            key: 'brand_name',
            width: 240,
            render: (value, record) => {
                const crossKey = normalizeCrossKey(
                    record?.brand_name,
                    record?.oem_number
                );
                const canDecide = Boolean(nomenclatureInfo?.in_nomenclature);
                const basePosition = `${(
                    nomenclatureInfo?.brand || selectedBrand || '—'
                ).trim()} ${(currentOem || '—').trim()}`;
                const crossPosition = `${record?.brand_name || '—'} ${
                    record?.oem_number || '—'
                }`;

                return (
                    <Space size={4} wrap>
                        <strong>{value || '—'}</strong>
                        {record.is_requested_oem ? (
                            <Tag color="green">точно</Tag>
                        ) : record.unverified_cross ? (
                            <Tag color="orange">кросс ⚠ не проверен</Tag>
                        ) : (
                            <Tag color="blue">кросс</Tag>
                        )}
                        {record.unverified_cross ? (
                            <Space size={2}>
                                <Popconfirm
                                    title="Подтвердить кросс"
                                    description={`Подтверждаете кросс нашей позиции ${basePosition} и позиции ${crossPosition}?`}
                                    okText="Подтвердить"
                                    cancelText="Отмена"
                                    disabled={!canDecide}
                                    onConfirm={() => handleApproveOwnStockCross(record)}
                                    okButtonProps={{
                                        loading:
                                            crossActionLoadingKey === `approve:${crossKey}`,
                                    }}
                                >
                                    <Tooltip
                                        title={
                                            canDecide
                                                ? 'Подтвердить и сохранить кросс'
                                                : 'Сначала нужна позиция в номенклатуре'
                                        }
                                    >
                                        <Button
                                            type="text"
                                            size="small"
                                            shape="circle"
                                            icon={<CheckOutlined />}
                                            aria-label={`Подтвердить кросс ${crossPosition}`}
                                            disabled={!canDecide}
                                            loading={
                                                crossActionLoadingKey === `approve:${crossKey}`
                                            }
                                        />
                                    </Tooltip>
                                </Popconfirm>
                                <Popconfirm
                                    title="Исключить неверный кросс"
                                    description={`Подтверждаете, что ${crossPosition} не является кроссом для позиции ${basePosition}?`}
                                    okText="Исключить"
                                    cancelText="Отмена"
                                    disabled={!canDecide}
                                    okButtonProps={{
                                        danger: true,
                                        loading:
                                            crossActionLoadingKey === `reject:${crossKey}`,
                                    }}
                                    onConfirm={() => handleRejectOwnStockCross(record)}
                                >
                                    <Tooltip
                                        title={
                                            canDecide
                                                ? 'Пометить как неверный кросс'
                                                : 'Сначала нужна позиция в номенклатуре'
                                        }
                                    >
                                        <Button
                                            danger
                                            type="text"
                                            size="small"
                                            shape="circle"
                                            icon={<CloseOutlined />}
                                            aria-label={`Исключить кросс ${crossPosition}`}
                                            disabled={!canDecide}
                                            loading={
                                                crossActionLoadingKey === `reject:${crossKey}`
                                            }
                                        />
                                    </Tooltip>
                                </Popconfirm>
                            </Space>
                        ) : null}
                    </Space>
                );
            },
        },
        {
            title: 'Номер',
            dataIndex: 'oem_number',
            key: 'oem_number',
            width: 140,
            render: (value) => (
                <code
                    style={{
                        background: '#f5f5f5',
                        padding: '1px 4px',
                        borderRadius: 3,
                    }}
                >
                    {value || '—'}
                </code>
            ),
        },
        {
            title: 'Наименование',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
            render: (value) => value || '—',
        },
        {
            title: 'Кол-во',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 90,
            align: 'right',
            render: (value) => `${Number(value || 0)} шт`,
        },
        {
            title: 'Цена',
            dataIndex: 'price',
            key: 'price',
            width: 110,
            align: 'right',
            render: (value) => `${formatInsightMoney(value)} руб.`,
        },
        {
            title: 'Прайс',
            dataIndex: 'pricelist_date',
            key: 'pricelist_date',
            width: 90,
            render: (value) => formatShortDate(value),
        },
    ];

    const renderOurStockSummary = () => {
        const combinedRows = [
            ...(ourStockRows || []),
            ...(unverifiedStockRows || []),
        ];
        if (!combinedRows.length) {
            return (
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#fafafa',
                        border: '1px solid #e5e7eb',
                        borderRadius: 6,
                        padding: '4px 12px',
                        fontSize: 13,
                        color: '#6b7280',
                    }}
                >
                    <ShopOutlined />
                    Наше наличие: нет
                </span>
            );
        }
        // В свёрнутом виде остатки альтернатив нельзя складывать: это разные
        // предложения одной позиции. Показываем лучший доступный остаток.
        const maxQty = Math.max(
            0,
            ...combinedRows.map((row) => Number(row.quantity || 0))
        );
        const crossCount = (ourStockRows || []).filter(
            (row) => !row.is_requested_oem
        ).length;
        const unverifiedCount = unverifiedStockRows.length;
        const hasStock = maxQty > 0;

        const chip = (
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    background: hasStock ? '#f6ffed' : '#fafafa',
                    border: `1px solid ${hasStock ? '#b7eb8f' : '#e5e7eb'}`,
                    borderRadius: 6,
                    padding: '4px 12px',
                    fontSize: 13,
                }}
            >
                <ShopOutlined
                    style={{ color: hasStock ? '#52c41a' : '#9ca3af' }}
                />
                <span style={{ fontWeight: 600 }}>Наше наличие:</span>
                <span style={{ fontWeight: 600 }}>{maxQty} шт</span>
                <span style={{ color: '#6b7280' }}>
                    · {combinedRows.length} поз.
                </span>
                {crossCount ? (
                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                        + кроссы: {crossCount}
                    </Tag>
                ) : null}
                {unverifiedCount ? (
                    <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                        ⚠ непроверенные: {unverifiedCount}
                    </Tag>
                ) : null}
                <DownOutlined style={{ fontSize: 10, color: '#9ca3af' }} />
            </span>
        );

        return (
            <Popover
                trigger="click"
                placement="bottomLeft"
                title="Наше наличие (с кроссами)"
                content={
                    <div style={{ maxWidth: 820 }}>
                        <Table
                            rowKey={(row) =>
                                `${row.autopart_id}-${row.pricelist_id}`
                            }
                            columns={ourStockColumns}
                            dataSource={combinedRows}
                            size="small"
                            pagination={false}
                            tableLayout="fixed"
                            scroll={{ x: 790, y: 320 }}
                        />
                        {unverifiedCount ? (
                            <div
                                style={{
                                    marginTop: 6,
                                    fontSize: 12,
                                    color: '#d46b08',
                                }}
                            >
                                ⚠ Непроверенные кроссы найдены по данным сайта и
                                не подтверждены в нашей системе кроссов —
                                проверьте применимость перед заказом.
                            </div>
                        ) : null}
                    </div>
                }
            >
                {chip}
            </Popover>
        );
    };

    return (
        <Card
            title="Поиск позиций по артикулу"
            className={[
                'autopart-offers-page',
                viewMode === 'large' ? 'autopart-offers-page--large' : '',
            ].filter(Boolean).join(' ')}
            style={{ margin: '20px' }}
        >
            <div className="autopart-offers-search-sticky">
                <Form
                    form={form}
                    layout="inline"
                    onFinish={handleSearch}
                    className="autopart-offers-search-form"
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
                            void handleSearch(
                                { oem: normalized },
                                { partialSearch: false }
                            );
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
                            loading={loading || remoteLoading}
                        >
                            Найти в прайсах
                        </Button>
                    </Form.Item>
                </Form>
                <Popover
                    open={cartPopoverOpen}
                    onOpenChange={setCartPopoverOpen}
                    trigger="click"
                    placement="bottomRight"
                    content={cartPreview}
                    title="Корзина заказа"
                >
                    <Button
                        shape="circle"
                        icon={(
                            <Badge
                                size="small"
                                count={cartSummary.total}
                                offset={[6, -6]}
                            >
                                <ShoppingCartOutlined />
                            </Badge>
                        )}
                        aria-label="Открыть корзину"
                    />
                </Popover>
            </div>

            {/* Статусная строка: бренд · номенклатура · наше наличие (с кроссами) */}
            <div
                className="autopart-offers-status-row"
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 12,
                }}
            >
                {selectedBrand ? (
                    <span style={{ color: '#6b7280', fontSize: 13 }}>
                        Подсказка бренда: <strong>{selectedBrand}</strong>
                    </span>
                ) : null}

                {/* Nomenclature status banner */}
                {nomenclatureInfo && !partialSearch ? (
                    nomenclatureInfo.in_nomenclature ? (
                        <span style={{
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
                        </span>
                    ) : (
                        currentOem && (
                            <span style={{
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
                            </span>
                        )
                    )
                ) : null}

                {!partialSearch && currentOem ? renderOurStockSummary() : null}
            </div>

            <section
                className="autopart-offers-comparison-sticky"
                aria-label="Сравнение предложений"
            >
                <div className="autopart-offers-comparison-toolbar">
                    <div>
                        <div className="autopart-offers-comparison-title">
                            Предложения по позиции
                        </div>
                        <div className="autopart-offers-comparison-hint">
                            Цена и остаток считаются отдельно: остатки разных вариантов не складываются.
                        </div>
                    </div>
                    <div className="autopart-offers-comparison-controls">
                        <Segmented
                            aria-label="Быстрый переход по разделам"
                            options={[
                                { label: 'Прайсы', value: 'autopart-price-offers' },
                                { label: 'Сайт', value: 'autopart-site-offers' },
                                { label: 'История', value: 'autopart-order-history' },
                                { label: 'Сводка', value: 'autopart-order-summary' },
                            ]}
                            onChange={scrollToOffersSection}
                        />
                        <Segmented
                            aria-label="Размер текста"
                            value={viewMode}
                            options={[
                                { label: 'Обычный', value: 'normal' },
                                { label: 'Крупный', value: 'large' },
                            ]}
                            onChange={setViewMode}
                        />
                    </div>
                </div>
                <div className="autopart-offers-comparison-grid">
                    {[
                        {
                            key: 'own',
                            title: 'Наш склад',
                            icon: <ShopOutlined />,
                            sectionId: 'autopart-price-offers',
                            snapshot: comparisonSnapshots.own,
                        },
                        {
                            key: 'suppliers',
                            title: 'Прайсы поставщиков',
                            icon: <CloudDownloadOutlined />,
                            sectionId: 'autopart-price-offers',
                            snapshot: comparisonSnapshots.suppliers,
                        },
                        {
                            key: 'site',
                            title: 'Предложения сайта',
                            icon: <SearchOutlined />,
                            sectionId: 'autopart-site-offers',
                            snapshot: comparisonSnapshots.site,
                        },
                    ].map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            className={`autopart-offers-comparison-card autopart-offers-comparison-card--${item.key}`}
                            onClick={() => scrollToOffersSection(item.sectionId)}
                        >
                            <span className="autopart-offers-comparison-card-title">
                                {item.icon}
                                {item.title}
                                <Tag>{item.snapshot.count} вар.</Tag>
                            </span>
                            <span className="autopart-offers-comparison-values">
                                <span>
                                    <small>Цена от</small>
                                    <strong>
                                        {item.snapshot.minPrice == null
                                            ? '—'
                                            : `${formatInsightMoney(item.snapshot.minPrice)} ₽`}
                                    </strong>
                                </span>
                                <span>
                                    <small>Макс. остаток</small>
                                    <strong>{item.snapshot.maxQuantity} шт.</strong>
                                </span>
                            </span>
                            <span className="autopart-offers-comparison-best">
                                {item.snapshot.bestLabel || 'Предложения пока не найдены'}
                            </span>
                        </button>
                    ))}
                </div>
            </section>

            <section
                id="autopart-price-offers"
                className="autopart-offers-section autopart-offers-price-section"
            >
                <div className="autopart-offers-section-heading">
                    <div>
                        <h2>Наличие в подключённых прайсах</h2>
                        <p>Наш склад и актуальные предложения поставщиков с ценой и сроком.</p>
                    </div>
                </div>
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
            </section>

            <Divider />

            <Space
                id="autopart-order-history"
                className="autopart-offers-section autopart-offers-history-section"
                direction="vertical"
                style={{ width: '100%' }}
                size="small"
            >
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
                                        {nomenclatureInfo?.in_nomenclature &&
                                        !item.isInvalid ? (
                                            <>
                                                {item.isSiteSuggested &&
                                                !item.isConfirmed ? (
                                                    <Popconfirm
                                                        title="Подтвердить кросс"
                                                        description={`Подтверждаете кросс нашей позиции ${(nomenclatureInfo?.brand || selectedBrand || '—').trim()} ${(currentOem || '—').trim()} и позиции ${item.brand_name || '—'} ${item.oem_number || '—'}?`}
                                                        okText="Подтвердить"
                                                        cancelText="Отмена"
                                                        onConfirm={() => handleApproveSiteCross(item)}
                                                        okButtonProps={{
                                                            loading:
                                                                crossActionLoadingKey === `approve:${item.key}`,
                                                        }}
                                                    >
                                                        <Tooltip title="Подтвердить кросс и сохранить в систему">
                                                            <Button
                                                                type="text"
                                                                size="small"
                                                                shape="circle"
                                                                icon={<CheckOutlined />}
                                                                loading={
                                                                    crossActionLoadingKey === `approve:${item.key}`
                                                                }
                                                            />
                                                        </Tooltip>
                                                    </Popconfirm>
                                                ) : null}
                                                <Popconfirm
                                                    title="Исключить неверный кросс"
                                                    description={`Подтверждаете, что ${item.brand_name || '—'} ${item.oem_number || '—'} не является кроссом для позиции ${(nomenclatureInfo?.brand || selectedBrand || '—').trim()} ${(currentOem || '—').trim()}?`}
                                                    okText="Исключить"
                                                    cancelText="Отмена"
                                                    okButtonProps={{
                                                        danger: true,
                                                        loading:
                                                            crossActionLoadingKey === `reject:${item.key}`,
                                                    }}
                                                    onConfirm={() => handleRejectSiteCross(item)}
                                                >
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
                                                        />
                                                    </Tooltip>
                                                </Popconfirm>
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
                            {summaryCrossItems.length && !nomenclatureInfo?.in_nomenclature ? (
                                <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>
                                    Чтобы подтверждать или исключать кроссы, позиция должна быть в номенклатуре.
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
                    allowEdit={isAdmin}
                    allowStatusMappingSuggestion={isAdmin}
                    onUpdated={reloadTrackingHistory}
                    emptyText="По этой позиции за последний год заказов через программу не было"
                />
            </Space>

            <Divider />

            <Space
                id="autopart-site-offers"
                className="autopart-offers-section autopart-offers-site-section"
                direction="vertical"
                style={{ width: '100%' }}
                size="middle"
            >
                <div className="autopart-offers-section-heading">
                    <div>
                        <h2>Предложения с сайта</h2>
                        <p>Уникальные сочетания бренда и номера, отсортированные по лучшей цене.</p>
                    </div>
                </div>
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
                    <Tooltip title="Оставлять только кроссы того же бренда и его синонимов из справочника брендов">
                        <Checkbox
                            checked={restrictCrossBrand}
                            disabled={!showCrosses}
                            onChange={(e) =>
                                setRestrictCrossBrand(e.target.checked)
                            }
                        >
                            Ограничить кроссы брендом
                        </Checkbox>
                    </Tooltip>
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

                {siteCrossFollowupStatus.total > 0 ? (
                    <Alert
                        type={siteCrossFollowupStatus.active ? 'info' : 'success'}
                        showIcon
                        message={
                            siteCrossFollowupStatus.active
                                ? 'Ждём дополнительный ответ от сайта по кроссам'
                                : 'Дополнительная проверка сайта по кроссам завершена'
                        }
                        description={
                            <Space direction="vertical" size={2}>
                                <div>
                                    Проверяем ещё {siteCrossFollowupStatus.total} кросс-артикула
                                    по прямому запросу на сайт после основного ответа.
                                </div>
                                <div>
                                    Прогресс: {siteCrossFollowupStatus.completed} из{' '}
                                    {siteCrossFollowupStatus.total}
                                </div>
                                {siteCrossFollowupStatus.candidates.length ? (
                                    <div style={{ fontSize: 12, color: '#64748b' }}>
                                        Кроссы для доп. проверки:{' '}
                                        {siteCrossFollowupStatus.candidates
                                            .map(
                                                (item) =>
                                                    `${item.brand_name} ${item.oem_number}`
                                            )
                                            .join(' · ')}
                                    </div>
                                ) : null}
                            </Space>
                        }
                        style={{ marginBottom: 12 }}
                    />
                ) : null}

                {showCrosses && restrictCrossBrand && siteBrandFamilyNames.length ? (
                    <div style={{ color: '#6b7280', fontSize: 12 }}>
                        По кроссам оставляем только бренд запроса и его синонимы:{' '}
                        {siteBrandFamilyNames.join(' · ')}
                    </div>
                ) : null}

                <Spin spinning={remoteLoading}>
                    {remoteMeta.total > 0 ? (
                        <div style={{ marginBottom: 8, color: '#6b7280' }}>
                            Найдено {remoteMeta.total} предложений. После фильтра:{' '}
                            {filteredRemoteSiteOffers.length}; уникальных сочетаний{' '}
                            «Бренд + Номер»: {groupedRemoteSiteOffers.length}.{' '}
                            {showCrosses
                                ? (
                                    <>
                                        Показаны все site-предложения из исходного
                                        запроса, запроса с кроссами и доп. прямых
                                        запросов по кроссам.
                                    </>
                                )
                                : (
                                    <>
                                        Показаны только предложения по исходному
                                        точному запросу.
                                    </>
                                )}
                        </div>
                    ) : null}
                    {hasHiddenCrossSiteOffers ? (
                        <div style={{ marginBottom: 8, color: '#2563eb', fontSize: 12 }}>
                            Ответы по кроссам уже получены, но скрыты. Включи
                            ` Показывать кроссы `, чтобы увидеть полную картину.
                        </div>
                    ) : null}
                    {remoteOffers.length ? (
                        <div
                            className={[
                                'site-offer-filter-panel',
                                activeSiteOfferFilterCount
                                    ? 'site-offer-filter-panel--active'
                                    : '',
                            ].filter(Boolean).join(' ')}
                        >
                            <div className="site-offer-filter-header">
                                <Space wrap size={8}>
                                    <FilterOutlined />
                                    <strong>Фильтр site-предложений</strong>
                                    {activeSiteOfferFilterCount ? (
                                        <Tag color="blue">
                                            Фильтр активен: {activeSiteOfferFilterCount}
                                        </Tag>
                                    ) : (
                                        <Tag>Показаны все предложения</Tag>
                                    )}
                                    {siteOfferFiltersSaved ? (
                                        <Tag color="green">Сохранён для пользователя</Tag>
                                    ) : activeSiteOfferFilterCount ? (
                                        <Tag color="orange">Изменения не сохранены</Tag>
                                    ) : null}
                                </Space>
                                <Space wrap size={8}>
                                    <Button
                                        size="small"
                                        onClick={resetSiteOfferFilters}
                                        disabled={!activeSiteOfferFilterCount}
                                    >
                                        Сбросить
                                    </Button>
                                    <Button
                                        size="small"
                                        type="primary"
                                        icon={<SaveOutlined />}
                                        onClick={saveSiteOfferFilters}
                                    >
                                        Сохранить по умолчанию
                                    </Button>
                                </Space>
                            </div>
                            <Space wrap size={[8, 8]}>
                                <Select
                                    mode="multiple"
                                    allowClear
                                    maxTagCount="responsive"
                                    value={siteOfferFilters.brands}
                                    options={siteOfferFilterOptions.brands}
                                    placeholder="Бренды"
                                    style={{ minWidth: 190, maxWidth: 300 }}
                                    onChange={(value) =>
                                        updateSiteOfferFilter('brands', value)
                                    }
                                />
                                <Select
                                    mode="multiple"
                                    allowClear
                                    maxTagCount="responsive"
                                    value={siteOfferFilters.suppliers}
                                    options={siteOfferFilterOptions.suppliers}
                                    placeholder="Поставщики"
                                    style={{ minWidth: 190, maxWidth: 300 }}
                                    onChange={(value) =>
                                        updateSiteOfferFilter('suppliers', value)
                                    }
                                />
                                <Select
                                    mode="multiple"
                                    allowClear
                                    maxTagCount="responsive"
                                    value={siteOfferFilters.sourceTypes}
                                    options={[
                                        { value: 'base_exact', label: 'Исходный OEM' },
                                        { value: 'base_cross', label: 'Запрос с кроссами' },
                                        { value: 'cross_exact', label: 'Прямой запрос кросса' },
                                    ]}
                                    placeholder="Источник запроса"
                                    style={{ minWidth: 210, maxWidth: 320 }}
                                    onChange={(value) =>
                                        updateSiteOfferFilter('sourceTypes', value)
                                    }
                                />
                                <InputNumber
                                    min={0}
                                    value={siteOfferFilters.minPrice}
                                    placeholder="Цена от"
                                    addonAfter="руб."
                                    style={{ width: 145 }}
                                    onChange={(value) =>
                                        updateSiteOfferFilter('minPrice', value)
                                    }
                                />
                                <InputNumber
                                    min={0}
                                    value={siteOfferFilters.maxPrice}
                                    placeholder="Цена до"
                                    addonAfter="руб."
                                    style={{ width: 145 }}
                                    onChange={(value) =>
                                        updateSiteOfferFilter('maxPrice', value)
                                    }
                                />
                                <InputNumber
                                    min={0}
                                    value={siteOfferFilters.minQty}
                                    placeholder="Остаток от"
                                    addonAfter="шт."
                                    style={{ width: 145 }}
                                    onChange={(value) =>
                                        updateSiteOfferFilter('minQty', value)
                                    }
                                />
                                <InputNumber
                                    min={0}
                                    value={siteOfferFilters.maxDelivery}
                                    placeholder="Срок до"
                                    addonAfter="дн."
                                    style={{ width: 145 }}
                                    onChange={(value) =>
                                        updateSiteOfferFilter('maxDelivery', value)
                                    }
                                />
                            </Space>
                        </div>
                    ) : null}
                    <Table
                        className="autopart-offers-table"
                        rowKey={(record, index) =>
                            record.site_group_key ||
                            record.api_hash ||
                            buildCartKey('dragonzap', {
                                ...record,
                                oem: record?.oem || record?.oem_number,
                            }) ||
                            `${record.oem}-${index}`
                        }
                        columns={remoteColumns}
                        dataSource={groupedRemoteSiteOffers}
                        size="small"
                        pagination={{
                            current: remoteOffersPage,
                            pageSize: 20,
                            showSizeChanger: false,
                            onChange: (page) => setRemoteOffersPage(page),
                        }}
                        expandable={{
                            rowExpandable: (record) =>
                                Number(record.offer_count || 0) > 1,
                            expandedRowRender: (record) => (
                                <div className="site-offer-expanded-group">
                                    <div className="site-offer-expanded-title">
                                        Все предложения для{' '}
                                        <strong>
                                            {getSiteOfferBrandName(record) || 'Без бренда'}{' '}
                                            {getSiteOfferOemNumber(record) || '—'}
                                        </strong>
                                    </div>
                                    <Table
                                        className="autopart-offers-table"
                                        rowKey={(offer, index) =>
                                            offer.api_hash ||
                                            buildCartKey('dragonzap', {
                                                ...offer,
                                                oem: offer?.oem || offer?.oem_number,
                                            }) ||
                                            `${offer.oem || offer.oem_number}-${index}`
                                        }
                                        columns={remoteColumns}
                                        dataSource={record.grouped_offers || []}
                                        size="small"
                                        pagination={false}
                                        tableLayout="fixed"
                                        scroll={{ x: 840 }}
                                    />
                                </div>
                            ),
                        }}
                        tableLayout="fixed"
                        scroll={{ x: 840 }}
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

            <Space
                className="autopart-offers-section autopart-offers-cart-section"
                direction="vertical"
                style={{ width: '100%' }}
                size="middle"
            >
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

                {renderCartActions()}

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
                    scroll={{ x: 840 }}
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
            <Space
                className="autopart-offers-section autopart-offers-history-section"
                direction="vertical"
                style={{ width: '100%' }}
                size="small"
            >
                <div className="autopart-offers-section-heading">
                    <div>
                        <h2>Дополнительный анализ для заказа</h2>
                        <p>Предложения по кроссам и итоговая рекомендация для текущего заказа.</p>
                    </div>
                </div>
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
                <Spin
                    id="autopart-order-summary"
                    className="autopart-offers-order-summary"
                    spinning={trackingInsightsLoading}
                >
                    {trackingInsights ? (
                        <Space
                            direction="vertical"
                            style={{ width: '100%' }}
                            size="middle"
                        >
                            <div className="autopart-offers-order-summary-heading">
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                    Краткая сводка для заказа
                                </div>
                                <div style={{ color: '#6b7280' }}>
                                    Здесь сводим вместе актуальные прайсы, сайт Dragonzap
                                    и историю заказов через программу, чтобы быстрее понять,
                                    как лучше заказывать позицию прямо сейчас.
                                </div>
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

                            {Array.isArray(trackingInsights?.exceptions) &&
                            trackingInsights.exceptions.length ? (
                                <Card
                                    size="small"
                                    title="Очередь исключений по позиции"
                                    style={{ borderRadius: 10 }}
                                >
                                    <Space
                                        direction="vertical"
                                        size={8}
                                        style={{ width: '100%' }}
                                    >
                                        {trackingInsights.exceptions.map((item) => (
                                            <Alert
                                                key={item.code}
                                                type={
                                                    item.severity === 'critical'
                                                        ? 'error'
                                                        : item.severity === 'warning'
                                                            ? 'warning'
                                                            : 'info'
                                                }
                                                showIcon
                                                message={item.title}
                                                description={item.description}
                                            />
                                        ))}
                                    </Space>
                                </Card>
                            ) : null}

                            {(() => {
                                const recommendationRows = bestSiteOffersForOrder.map(
                                    (row, index) => ({
                                        key: `recommended-${index}`,
                                        title:
                                            index === 0
                                                ? 'Лучший по цене для заказа'
                                                : `Доп. вариант ${index + 1}`,
                                        tone:
                                            index === 0
                                                ? INSIGHT_TONE_STYLES.green
                                                : INSIGHT_TONE_STYLES.blue,
                                        row,
                                    })
                                );

                                if (!recommendationRows.length) {
                                    return null;
                                }

                                return (
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns:
                                                'repeat(auto-fit, minmax(240px, 1fr))',
                                            gap: 8,
                                        }}
                                    >
                                        {recommendationRows.map(({ key, title, tone, row }, index) => {
                                            const deliveryStr = formatInsightDelivery(
                                                row.min_delivery_day,
                                                row.max_delivery_day
                                            );
                                            const rowOem = row.oem || row.oem_number || currentOem;
                                            const rowBrand =
                                                row.make_name || row.brand_name || '—';
                                            const rowQty = Number(row.qnt ?? 0);
                                            const rowSupplier =
                                                normalizeSupplierName(
                                                    row.supplier_name ||
                                                        row.sup_logo ||
                                                        row.provider_name
                                                ) || 'Dragonzap';
                                            return (
                                                <div
                                                    key={key}
                                                    style={{
                                                        ...tone,
                                                        borderRadius: 10,
                                                        padding: 12,
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: 8,
                                                        boxShadow:
                                                            '0 6px 18px rgba(15, 23, 42, 0.05)',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            color: '#475569',
                                                            fontSize: 11,
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        {title}
                                                    </div>
                                                    <div
                                                        style={{
                                                            color: '#0f172a',
                                                            fontSize: 15,
                                                            fontWeight: 800,
                                                        }}
                                                    >
                                                        {rowSupplier}
                                                    </div>
                                                    <div style={{ color: '#334155', fontSize: 12 }}>
                                                        {`${rowBrand} ${rowOem || '—'}`}
                                                    </div>
                                                    <div style={{ color: '#334155', fontSize: 12 }}>
                                                        {row.price != null
                                                            ? `${formatInsightMoney(row.price)} руб.`
                                                            : 'Цена: —'}
                                                        {rowQty > 0
                                                            ? ` · ${rowQty} шт`
                                                            : ''}
                                                        {deliveryStr !== 'срок не указан'
                                                            ? ` · ${deliveryStr}`
                                                            : ''}
                                                    </div>
                                                    <div style={{ color: '#64748b', fontSize: 11 }}>
                                                        {row.recommendation_source === 'cross_exact'
                                                            ? 'Dragonzap · найдено прямым запросом по кроссу без режима кроссов'
                                                            : 'Dragonzap · учитываем прямой OEM, cross-режим и прямые запросы по найденным кроссам'}
                                                    </div>
                                                    <div style={{ color: '#64748b', fontSize: 11 }}>
                                                        {index === 0
                                                            ? (
                                                                rowOem &&
                                                                normalizeOemKey(rowOem) !== normalizedCurrentOem
                                                                    ? `Сработал кросс: ${rowOem}`
                                                                    : 'Лучшее предложение по текущему OEM на сайте'
                                                            )
                                                            : Number(
                                                                recommendationRows[index - 1]?.row?.qnt ?? 0
                                                            ) < SITE_RECOMMENDATION_LOW_STOCK_QTY
                                                                ? `Показываем ещё вариант, потому что у предыдущего меньше ${SITE_RECOMMENDATION_LOW_STOCK_QTY} шт`
                                                                : 'Дополнительный вариант по сайту'}
                                                    </div>
                                                    {row.price != null ? (
                                                        <Space>
                                                            <InputNumber
                                                                min={1}
                                                                max={rowQty > 0 ? rowQty : undefined}
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
                                                                    addDragonzapOfferToCart(row);
                                                                    if (bestSupplierQty > 1) {
                                                                        const cartKey = buildCartKey(
                                                                            'dragonzap',
                                                                            row
                                                                        );
                                                                        updateCartQty(cartKey, bestSupplierQty);
                                                                    }
                                                                }}
                                                            >
                                                                В корзину
                                                            </Button>
                                                        </Space>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                            {trackingInsights?.draft_purchase_order ? (
                                <Card
                                    size="small"
                                    title="Авточерновик закупки"
                                    style={{ borderRadius: 10 }}
                                >
                                    <Space
                                        direction="vertical"
                                        size={8}
                                        style={{ width: '100%' }}
                                    >
                                        <div style={{ color: '#334155' }}>
                                            <strong>{trackingInsights.draft_purchase_order.provider_name}</strong>
                                            {trackingInsights.draft_purchase_order.provider_config_name
                                                ? ` · ${trackingInsights.draft_purchase_order.provider_config_name}`
                                                : ''}
                                        </div>
                                        <div style={{ color: '#475569', fontSize: 12 }}>
                                            {trackingInsights.draft_purchase_order.brand_name || '—'}{' '}
                                            {trackingInsights.draft_purchase_order.oem_number}
                                            {trackingInsights.draft_purchase_order.price != null
                                                ? ` · ${formatInsightMoney(trackingInsights.draft_purchase_order.price)} руб.`
                                                : ''}
                                        </div>
                                        <div style={{ color: '#475569', fontSize: 12 }}>
                                            В наличии/в пути: {trackingInsights.draft_purchase_order.available_qty} шт · цель: {trackingInsights.draft_purchase_order.target_qty ?? '—'} шт
                                            {trackingInsights.draft_purchase_order.lead_days_used != null
                                                ? ` · срок для расчёта: ${trackingInsights.draft_purchase_order.lead_days_used} дн`
                                                : ''}
                                        </div>
                                        {trackingInsights.draft_purchase_order.reason ? (
                                            <div style={{ color: '#64748b', fontSize: 12 }}>
                                                {trackingInsights.draft_purchase_order.reason}
                                            </div>
                                        ) : null}
                                        <Space wrap>
                                            <InputNumber
                                                min={1}
                                                value={draftOrderQty}
                                                size="small"
                                                style={{ width: 90 }}
                                                onChange={(v) => setDraftOrderQty(v || 1)}
                                            />
                                            <Button
                                                type="primary"
                                                icon={<PlusOutlined />}
                                                loading={cartSubmitting}
                                                onClick={() => handleCreateAutoDraftOrder(false)}
                                            >
                                                Создать черновик
                                            </Button>
                                            <Button
                                                icon={<MailOutlined />}
                                                loading={cartSubmitting}
                                                onClick={() => handleCreateAutoDraftOrder(true)}
                                            >
                                                Создать и отправить
                                            </Button>
                                        </Space>
                                    </Space>
                                </Card>
                            ) : null}

                            {supplierScoreRows.length ? (
                                <Collapse
                                    size="small"
                                    activeKey={supplierScoreExpanded ? ['supplier-score'] : []}
                                    onChange={(keys) => {
                                        const nextKeys = Array.isArray(keys)
                                            ? keys
                                            : [keys];
                                        setSupplierScoreExpanded(
                                            nextKeys.includes('supplier-score')
                                        );
                                    }}
                                    items={[
                                        {
                                            key: 'supplier-score',
                                            label: (
                                                <span>
                                                    Сравнение поставщиков для заказа · {supplierScoreRows.length}
                                                </span>
                                            ),
                                            children: (
                                                <Space
                                                    direction="vertical"
                                                    size="small"
                                                    style={{ width: '100%' }}
                                                >
                                                    <div
                                                        style={{
                                                            color: '#6b7280',
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        Сравниваем текущую цену, наличие,
                                                        фактический срок, исполнение прошлых
                                                        заказов и частоту заказов.
                                                    </div>
                                                    <Table
                                                        rowKey={(row) =>
                                                            `${row.provider_id || row.provider_name}:${row.current_provider_config_id || 'base'}`
                                                        }
                                                        columns={supplierScoreColumns}
                                                        dataSource={supplierScoreRows}
                                                        size="small"
                                                        pagination={{ pageSize: 5, showSizeChanger: false }}
                                                        scroll={{ x: 760 }}
                                                    />
                                                </Space>
                                            ),
                                        },
                                    ]}
                                />
                            ) : null}
                        </Space>
                    ) : null}
                </Spin>
            </Space>
        </Card>
    );
};

export default AutopartOffers;
