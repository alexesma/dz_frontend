import { useEffect, useState } from 'react';
import JsBarcode from 'jsbarcode';

import { getPrintForms } from '../api/printForms';
import { buildLabelPrintDocument, escapeHtml } from './labelPrint';

export const PRINT_FIELD_LABELS = {
    brand_name: 'Бренд', brand: 'Бренд', requested_brand: 'Бренд клиента',
    oem_number: 'Артикул', oem: 'Артикул', requested_oem: 'Артикул клиента',
    name: 'Наименование', requested_name: 'Наименование клиента',
    quantity: 'Количество', customer_name: 'Клиент',
    order_number: 'Номер заказа', order_date: 'Дата заказа',
    sequence_number: 'Номер этикетки', total_labels: 'Всего этикеток',
    barcode: 'Штрихкод', location: 'Место хранения',
    location_name: 'Название места хранения', location_id: 'ID места',
    document_number: 'Номер реализации', box_number: 'Номер коробки',
    box_total: 'Всего коробок', id: 'ID позиции',
    stock_order_id: 'Складской заказ', position_count: 'Позиций в коробке',
};

const field = (id, name, x, y, width, height, fontSize, bold = false) => ({
    id, kind: 'text', field: name, text: '', x, y, width, height,
    font_size: fontSize, bold, align: 'left',
});
const barcode = (x = 3, y = 29) => ({
    id: 'barcode', kind: 'barcode', field: 'barcode', text: '',
    x, y, width: 52, height: 8, font_size: 9, bold: false, align: 'center',
});

export const PRINT_FORM_CATALOG = {
    product: {
        title: 'Товарная этикетка',
        fields: ['brand_name', 'oem_number', 'name', 'barcode', 'id'],
        sample: { brand_name: 'MERCEDES-BENZ', oem_number: 'A1234567890',
            name: 'Фильтр масляный', barcode: 'MERCEDES A1234567890', id: 123 },
        blocks: [field('brand', 'brand_name', 3, 2, 52, 5, 12, true),
            field('oem', 'oem_number', 3, 8, 52, 7, 16, true),
            field('name', 'name', 3, 17, 52, 9, 8), barcode()],
    },
    location: {
        title: 'Бирка места хранения',
        fields: ['location_name', 'barcode', 'location_id'],
        sample: { location_name: 'А-01-03', barcode: 'А-01-03', location_id: 17 },
        blocks: [field('location', 'location_name', 3, 7, 52, 10, 22, true),
            barcode(3, 22)],
    },
    production_wave: {
        title: 'Этикетка волны сборки',
        fields: ['requested_brand', 'requested_oem', 'requested_name',
            'quantity', 'customer_name', 'order_number', 'order_date',
            'sequence_number', 'total_labels', 'barcode'],
        sample: { requested_brand: 'MERCEDES-BENZ', requested_oem: 'A1234567890',
            requested_name: 'Фильтр масляный', quantity: 2,
            customer_name: 'Клиент', order_number: '5940', order_date: '25.10.2026',
            sequence_number: 1, total_labels: 2, barcode: 'DZ-0001' },
        blocks: [field('brand', 'requested_brand', 3, 2, 40, 5, 11, true),
            field('sequence', 'sequence_number', 46, 2, 9, 4, 7),
            field('oem', 'requested_oem', 3, 8, 52, 7, 15, true),
            field('name', 'requested_name', 3, 16, 52, 6, 8),
            field('customer', 'customer_name', 3, 23, 35, 4, 7),
            field('quantity', 'quantity', 41, 23, 14, 4, 8, true),
            barcode(3, 29)],
    },
    cross_docking: {
        title: 'Этикетка поступления поставщика',
        fields: ['requested_brand', 'requested_oem', 'requested_name',
            'quantity', 'customer_name', 'order_number', 'order_date', 'barcode'],
        sample: { requested_brand: 'MERCEDES-BENZ', requested_oem: 'A1234567890',
            requested_name: 'Фильтр масляный', quantity: 2,
            customer_name: 'Клиент', order_number: '5940', order_date: '25.10.2026',
            barcode: 'DZ-0002' },
        blocks: [field('brand', 'requested_brand', 3, 2, 52, 5, 11, true),
            field('oem', 'requested_oem', 3, 8, 52, 7, 15, true),
            field('name', 'requested_name', 3, 16, 52, 6, 8),
            field('customer', 'customer_name', 3, 23, 35, 4, 7),
            field('quantity', 'quantity', 41, 23, 14, 4, 8, true),
            barcode(3, 29)],
    },
    own_stock: {
        title: 'Этикетка отбора с нашего склада',
        fields: ['brand', 'oem', 'name', 'customer_name', 'order_number',
            'location', 'quantity', 'barcode'],
        sample: { brand: 'MERCEDES-BENZ', oem: 'A1234567890',
            name: 'Фильтр масляный', customer_name: 'Клиент', order_number: '5940',
            location: 'А-01-03', quantity: 2, barcode: 'DZ-0003' },
        blocks: [field('brand', 'brand', 3, 2, 52, 5, 11, true),
            field('oem', 'oem', 3, 8, 52, 7, 15, true),
            field('name', 'name', 3, 16, 52, 6, 8),
            field('customer', 'customer_name', 3, 23, 35, 4, 7),
            field('location', 'location', 41, 23, 14, 4, 7),
            barcode(3, 29)],
    },
    shipment_box: {
        title: 'Этикетка коробки реализации',
        fields: ['customer_name', 'document_number', 'box_number',
            'box_total', 'quantity', 'barcode'],
        sample: { customer_name: 'Клиент', document_number: 'РТ-100',
            box_number: 1, box_total: 3, quantity: 12, barcode: 'DZ-BOX-100-1' },
        blocks: [field('customer', 'customer_name', 3, 3, 52, 7, 14, true),
            field('document', 'document_number', 3, 12, 52, 5, 9),
            field('box', 'box_number', 3, 19, 25, 5, 10, true),
            field('quantity', 'quantity', 30, 19, 25, 5, 10, true),
            barcode(3, 29)],
    },
    stock_order_box: {
        title: 'Этикетка коробки складского заказа',
        fields: ['customer_name', 'stock_order_id', 'box_number',
            'box_total', 'position_count', 'quantity', 'barcode'],
        sample: { customer_name: 'Клиент', stock_order_id: 701,
            box_number: 1, box_total: 3, position_count: 5,
            quantity: 12, barcode: 'DZ-PACK-701-1' },
        blocks: [field('customer', 'customer_name', 3, 3, 52, 7, 14, true),
            field('box', 'box_number', 3, 11, 52, 6, 16, true),
            field('order', 'stock_order_id', 3, 19, 26, 5, 9),
            field('quantity', 'quantity', 31, 19, 24, 5, 9, true),
            barcode(3, 29)],
    },
};

export const freshDefaultForm = (key) => ({
    key, width_mm: 58, height_mm: 40,
    blocks: PRINT_FORM_CATALOG[key].blocks.map((block) => ({ ...block })),
});

export const getFieldValue = (item, path) => path.split('.').reduce(
    (value, part) => value?.[part], item,
);

export const PRINT_FORMS_CHANGED_EVENT = 'dz-print-forms-changed';

// Макет мог быть изменён в другой вкладке или другим администратором, а
// страница печати — оставаться открытой. Поэтому макет перечитывается при
// возврате в окно, при сохранении в редакторе и раз в минуту; ошибка
// загрузки не затирает уже полученный макет.
export function usePrintForm(key) {
    const [form, setForm] = useState(null);
    useEffect(() => {
        let active = true;
        const load = () => getPrintForms({ params: { _: Date.now() } }).then(({ data }) => {
            if (active) setForm((data || []).find((row) => row.key === key) || null);
        }).catch(() => {});
        void load();
        const onVisible = () => { if (!document.hidden) void load(); };
        window.addEventListener('focus', load);
        window.addEventListener(PRINT_FORMS_CHANGED_EVENT, load);
        document.addEventListener('visibilitychange', onVisible);
        const timer = window.setInterval(load, 60000);
        return () => {
            active = false;
            window.removeEventListener('focus', load);
            window.removeEventListener(PRINT_FORMS_CHANGED_EVENT, load);
            document.removeEventListener('visibilitychange', onVisible);
            window.clearInterval(timer);
        };
    }, [key]);
    return form;
}

export function buildCustomLabelDocument(form, items, title) {
    return buildLabelPrintDocument({
        title,
        widthMm: form.width_mm,
        heightMm: form.height_mm,
        fieldsCss: `.label { position: relative; display: block; padding: 0; }
            .print-block { position: absolute; overflow: hidden; white-space: nowrap; }
            .print-block svg { width: 100%; height: 100%; }`,
        items,
        renderLabel: (item) => form.blocks.map((block) => {
            const style = `left:${block.x}mm;top:${block.y}mm;`
                + `width:${block.width}mm;height:${block.height}mm;`
                + `font-size:${block.font_size}pt;`
                + `font-weight:${block.bold ? 700 : 400};text-align:${block.align};`;
            const value = block.field ? getFieldValue(item, block.field) : '';
            if (block.kind === 'barcode') {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                try {
                    JsBarcode(svg, String(value || ''), {
                        format: 'CODE128', width: 1, height: 36,
                        displayValue: false, margin: 0,
                    });
                } catch { return ''; }
                return `<div class="print-block" style="${style}">${svg.outerHTML}</div>`;
            }
            return `<div class="print-block" style="${style}">`
                + `${escapeHtml(block.text || '')}${escapeHtml(value)}</div>`;
        }).join(''),
    });
}
