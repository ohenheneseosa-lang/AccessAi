/**
 * Redact card, Medicare and TFN patterns before any text leaves the device.
 */

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
const MEDICARE = /\b[2-6]\d{3}[ ]?\d{5}[ ]?\d(?:[ /-]?\d)?\b/g;
const TFN = /\b\d{3}[ ]?\d{3}[ ]?\d{3}\b/g;
const CVV_CONTEXT = /\b(cvv|cvc|security code)\s*[:#]?\s*\d{3,4}\b/gi;

export function redactSensitive(text: string): string {
  return text
    .replace(CARD, (m) => {
      const digits = m.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits) ? '[card number removed]' : m;
    })
    .replace(CVV_CONTEXT, '$1 [removed]')
    .replace(MEDICARE, (m) => (m.replace(/\D/g, '').length >= 10 ? '[Medicare number removed]' : m))
    .replace(TFN, '[possible tax file number removed]');
}
