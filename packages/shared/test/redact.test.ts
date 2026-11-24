import { describe, expect, it } from 'vitest';
import { redactSensitive } from '../src/redact.js';

describe('redactSensitive', () => {
  it('removes Luhn-valid card numbers', () => {
    expect(redactSensitive('card 4111 1111 1111 1111 ok')).toBe('card [card number removed] ok');
    expect(redactSensitive('4242-4242-4242-4242')).toBe('[card number removed]');
  });
  it('leaves non-card digit runs alone', () => {
    expect(redactSensitive('order 1234 5678 9012 3456')).toBe('order 1234 5678 9012 3456');
  });
  it('removes CVV, Medicare and TFN patterns', () => {
    expect(redactSensitive('CVV: 123')).toBe('CVV [removed]');
    expect(redactSensitive('Medicare 2123 45670 1')).toContain('[Medicare number removed]');
    expect(redactSensitive('TFN 123 456 782')).toContain('[possible tax file number removed]');
  });
  it('keeps prices and dates', () => {
    const t = 'The Black Runner is $129. Start Monday 2 December at 9 am.';
    expect(redactSensitive(t)).toBe(t);
  });
});
