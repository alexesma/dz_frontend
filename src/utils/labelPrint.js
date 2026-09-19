// Общий движок печати этикеток через окно браузера.
//
// Раньше эта механика (экранирование, разметка страницы, открытие окна
// печати) была скопирована в четырёх местах — под товарные этикетки,
// этикетки волны сборки, этикетки кросс-докинга и бирки мест хранения.
// Один и тот же CSS-каркас и один и тот же escapeHtml приходилось
// править в четырёх файлах разом; менять размер этикетки без правки
// кода было нельзя нигде. Здесь — общая часть: экранирование, каркас
// страницы (@page, разрывы между этикетками, экранный предпросмотр) и
// открытие окна печати. Разметку и стили конкретных полей каждый вызов
// задаёт сам — у товарных, волновых и полочных этикеток разный набор
// полей, и сводить их в одну универсальную схему рискованнее, чем
// оставить как есть.

export const DEFAULT_LABEL_WIDTH_MM = 58;
export const DEFAULT_LABEL_HEIGHT_MM = 40;

export const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

/**
 * Собирает HTML-документ для печати листа этикеток.
 *
 * @param {string} title — заголовок окна печати.
 * @param {number} widthMm — ширина одной этикетки, мм.
 * @param {number} heightMm — высота одной этикетки, мм.
 * @param {string} fieldsCss — CSS полей внутри этикетки (свой для
 *   каждого вида: `.brand`, `.oem`, `.barcode` и т.д.), без .label и
 *   без @page — это часть каркаса.
 * @param {Array} items — этикетки для печати, в порядке следования.
 * @param {(item: any) => string} renderLabel — рендерит содержимое
 *   одной этикетки (то, что внутри `<section class="label">…</section>`).
 */
export function buildLabelPrintDocument({
    title,
    widthMm = DEFAULT_LABEL_WIDTH_MM,
    heightMm = DEFAULT_LABEL_HEIGHT_MM,
    fieldsCss = '',
    items,
    renderLabel,
}) {
    const labels = items.map((item) => (
        `<section class="label">${renderLabel(item)}</section>`
    )).join('\n');

    return `
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #111; }
    body { font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .label {
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      break-after: page;
      page-break-after: always;
    }
    .label:last-child { break-after: auto; page-break-after: auto; }
    ${fieldsCss}
    @media screen {
      body { background: #eef2f7; padding: 12px; }
      .label { background: #fff; margin: 0 auto 12px; box-shadow: 0 8px 24px rgba(15,23,42,.16); }
    }
  </style>
</head>
<body>
${labels}
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;
}

/**
 * Открывает окно печати и пишет в него готовый документ.
 * Возвращает false, если браузер заблокировал всплывающее окно —
 * вызывающий код должен сам показать об этом сообщение пользователю.
 */
export function openLabelPrintWindow(html) {
    const printWindow = window.open('', '_blank', 'width=480,height=640');
    if (!printWindow) {
        return false;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    return true;
}
