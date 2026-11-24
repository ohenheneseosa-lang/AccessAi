import { describe, expect, it } from 'vitest';
import { isCommitControl, isPaymentRequest, isSensitiveField, judgeAction } from '../src/safety.js';

describe('isSensitiveField', () => {
  it.each([
    [{ tag: 'input', type: 'password' }],
    [{ tag: 'input', type: 'text', autocomplete: 'cc-number' }],
    [{ tag: 'input', type: 'text', autocomplete: 'one-time-code' }],
    [{ tag: 'input', type: 'text', autocomplete: 'current-password' }],
    [{ tag: 'input', type: 'text', name: 'Card number' }],
    [{ tag: 'input', type: 'text', name: 'Security code (CVV)' }],
    [{ tag: 'input', type: 'tel', name: 'Verification code' }],
    [{ tag: 'input', type: 'text', name: 'BSB' }],
    [{ tag: 'input', type: 'text', name: 'Account number' }],
    [{ tag: 'input', type: 'text', htmlName: 'medicare_no' }],
    [{ tag: 'input', type: 'text', name: 'Tax file number' }],
    [{ tag: 'input', type: 'text', placeholder: 'Passport number' }],
    [{ tag: 'input', type: 'text', id: 'drivers-licence-number', name: "Driver's licence" }],
    [{ tag: 'textarea', name: 'Your PIN' }],
    [{ tag: 'select', name: 'Expiry date' }],
  ])('blocks %o', (el) => expect(isSensitiveField(el)).toBe(true));

  it.each([
    [{ tag: 'input', type: 'text', name: 'Search' }],
    [{ tag: 'select', name: 'Size' }],
    [{ tag: 'input', type: 'email', name: 'Email' }],
    [{ tag: 'button', name: 'Card number help' }],
  ])('allows %o', (el) => expect(isSensitiveField(el)).toBe(false));
});

describe('judgeAction', () => {
  it('stops at payment buttons with the prototype wording', () => {
    const v = judgeAction('click', { tag: 'button', name: 'Checkout and pay' });
    expect(v).toEqual({
      kind: 'block',
      category: 'payment',
      reason: 'This step involves payment. Please do it yourself. The next step is: Press "Checkout and pay".',
    });
  });
  it.each(['Place order', 'Pay now', 'Buy now', 'Complete purchase', 'Proceed to payment', 'Check out'])('blocks "%s"', (name) => {
    expect(judgeAction('click', { tag: 'button', name }).kind).toBe('block');
  });
  it('blocks submit inputs and link buttons too', () => {
    expect(judgeAction('click', { tag: 'input', type: 'submit', name: 'Pay' }).kind).toBe('block');
    expect(judgeAction('click', { tag: 'a', name: 'Checkout' }).kind).toBe('block');
    expect(judgeAction('click', { tag: 'div', role: 'button', name: 'Place my order' }).kind).toBe('block');
  });
  it('blocks account deletion', () => {
    expect(judgeAction('click', { tag: 'button', name: 'Delete my account' })).toMatchObject({ kind: 'block', category: 'destructive' });
    expect(judgeAction('type', { tag: 'div', name: 'Close account' })).toMatchObject({ kind: 'block', category: 'destructive' });
  });
  it('blocks any op on sensitive fields', () => {
    for (const op of ['type', 'focus', 'select', 'click', 'scroll'])
      expect(judgeAction(op, { tag: 'input', type: 'password', name: 'Password' })).toMatchObject({ kind: 'block', category: 'sensitive' });
  });
  it('asks before sending or booking', () => {
    expect(judgeAction('click', { tag: 'button', name: 'Send message' }).kind).toBe('confirm');
    expect(judgeAction('click', { tag: 'button', name: 'Book appointment' }).kind).toBe('confirm');
    expect(judgeAction('click', { tag: 'input', type: 'button', name: 'Submit' }).kind).toBe('confirm');
  });
  it('allows ordinary steps', () => {
    expect(judgeAction('click', { tag: 'button', name: 'Add to cart' }).kind).toBe('allow');
    expect(judgeAction('select', { tag: 'select', name: 'Size' }).kind).toBe('allow');
    expect(judgeAction('type', { tag: 'input', type: 'search', name: 'Search' }).kind).toBe('allow');
    expect(judgeAction('click', { tag: 'span', name: 'Pay' }).kind).toBe('allow'); // not pressable
  });
});

describe('isCommitControl', () => {
  it('marks payment and deletion controls', () => {
    expect(isCommitControl({ tag: 'button', name: 'Checkout and pay' })).toBe(true);
    expect(isCommitControl({ tag: 'button', name: 'Delete account' })).toBe(true);
    expect(isCommitControl({ tag: 'button', name: 'Add to cart' })).toBe(false);
    expect(isCommitControl({ tag: 'p', name: 'Pay' })).toBe(false);
  });
});

describe('isPaymentRequest', () => {
  it('spots requests to pay, not questions about price', () => {
    expect(isPaymentRequest('Check out')).toBe(true);
    expect(isPaymentRequest('place my order')).toBe(true);
    expect(isPaymentRequest('what does checkout cost')).toBe(false);
    expect(isPaymentRequest('What does delivery cost?')).toBe(false);
  });
});
