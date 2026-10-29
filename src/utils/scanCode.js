// Сканер-«клавиатура» шлёт коды клавиш, а не символы, поэтому при русской
// раскладке на странице появляются русские буквы. Читаем физическую клавишу
// (event.code) и получаем латиницу независимо от раскладки.
const SHIFT_DIGITS = ')!@#$%^&*(';
const PUNCTUATION = {
    Minus: ['-', '_'], Equal: ['=', '+'], Slash: ['/', '?'], Period: ['.', '>'],
    Comma: [',', '<'], Backslash: ['\\', '|'], Semicolon: [';', ':'],
    Quote: ["'", '"'], BracketLeft: ['[', '{'], BracketRight: [']', '}'],
    Backquote: ['`', '~'], Space: [' ', ' '],
    NumpadDecimal: ['.', '.'], NumpadSubtract: ['-', '-'], NumpadAdd: ['+', '+'],
    NumpadDivide: ['/', '/'], NumpadMultiply: ['*', '*'],
};

export const keyEventToChar = (event) => {
    const { code, shiftKey } = event;
    if (/^Key[A-Z]$/.test(code)) {
        const letter = code.slice(3);
        const caps = event.getModifierState?.('CapsLock') || false;
        return shiftKey !== caps ? letter : letter.toLowerCase();
    }
    if (/^Digit[0-9]$/.test(code)) {
        const digit = Number(code.slice(5));
        return shiftKey ? SHIFT_DIGITS[digit] : String(digit);
    }
    if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
    if (PUNCTUATION[code]) return PUNCTUATION[code][shiftKey ? 1 : 0];
    return event.key && event.key.length === 1 ? event.key : '';
};

const RU = 'йцукенгшщзхъфывапролджэячсмитьбюЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ';
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.QWERTYUIOP{}ASDFGHJKL:\"ZXCVBNM<>";
const RU_TO_EN = Object.fromEntries([...RU].map((char, index) => [char, EN[index]]));

// Запасной вариант для кодов, которые уже попали в поле ввода русскими буквами.
export const normalizeScanCode = (value) => {
    const text = String(value ?? '').trim();
    if (!/[а-яА-ЯёЁ]/.test(text)) return text;
    return [...text].map((char) => RU_TO_EN[char] ?? char).join('');
};
