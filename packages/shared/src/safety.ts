/**
 * Hard safety rules. These are enforced in code by the action layer, never
 * left to the model's prompt. 100% test coverage is required on this file.
 */

export interface ElementFacts {
  tag: string;
  type?: string;
  role?: string;
  /** Accessible name / visible label. */
  name?: string;
  id?: string;
  htmlName?: string;
  autocomplete?: string;
  placeholder?: string;
}

const SENSITIVE_AUTOCOMPLETE =
  /^(cc-|current-password|new-password|one-time-code|transaction-|bday)/i;
const SENSITIVE_WORDS =
  /(pass(word|code|phrase)?|pin\b|cvv|cvc|csc|security code|card ?(number|no)|credit card|debit card|expiry|exp(iration)? date|one[- ]time|otp|verification code|2fa|bsb|account number|iban|swift|sort code|routing|medicare|tax file|\btfn\b|passport|driver'?s? licen[cs]e|licen[cs]e number|social security|\bssn\b)/i;

/** True for fields the agent must never read out to the AI or type into. */
export function isSensitiveField(el: ElementFacts): boolean {
  const tag = el.tag.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return false;
  if ((el.type ?? '').toLowerCase() === 'password') return true;
  if (el.autocomplete && SENSITIVE_AUTOCOMPLETE.test(el.autocomplete.trim())) return true;
  const haystack = [el.name, el.id, el.htmlName, el.placeholder].filter(Boolean).join(' ');
  return SENSITIVE_WORDS.test(haystack);
}

const PAYMENT_WORDS =
  /\b(pay|payment|checkout|check out|place (my )?order|complete (my )?(order|purchase)|confirm (and pay|order|purchase|payment)|buy now|purchase|submit order|proceed to payment)\b/i;
const SEND_WORDS =
  /\b(send|submit|book|reserve|confirm booking|apply now|sign up|subscribe|post|publish|transfer)\b/i;
const DESTRUCTIVE_WORDS =
  /\b(delete|close) (my )?account\b|\bdeactivate\b|\bremove (my )?account\b/i;

export type ActionVerdict =
  | { kind: 'allow' }
  | { kind: 'confirm'; reason: string }
  | { kind: 'block'; category: 'payment' | 'sensitive' | 'destructive'; reason: string };

/** True for final buttons the agent stops at (payment, ordering, account deletion). */
export function isCommitControl(el: ElementFacts): boolean {
  if (!isPressable(el)) return false;
  const name = el.name ?? '';
  return PAYMENT_WORDS.test(name) || DESTRUCTIVE_WORDS.test(name);
}

function isPressable(el: ElementFacts): boolean {
  const tag = el.tag.toLowerCase();
  const type = (el.type ?? '').toLowerCase();
  return (
    tag === 'button' ||
    tag === 'a' ||
    (tag === 'input' && (type === 'submit' || type === 'button' || type === 'image')) ||
    el.role === 'button' ||
    el.role === 'link'
  );
}

/** Decide whether the agent may perform `op` on this element. */
export function judgeAction(op: string, el: ElementFacts): ActionVerdict {
  if (isSensitiveField(el)) {
    return {
      kind: 'block',
      category: 'sensitive',
      reason:
        'This field asks for a password, card, bank or identity detail. I never touch those. Please fill it in yourself.',
    };
  }
  if (op === 'click' || op === 'type') {
    const name = el.name ?? '';
    if (DESTRUCTIVE_WORDS.test(name)) {
      return {
        kind: 'block',
        category: 'destructive',
        reason: 'This step would delete or close an account. Please do it yourself.',
      };
    }
    if (op === 'click' && isPressable(el) && PAYMENT_WORDS.test(name)) {
      return {
        kind: 'block',
        category: 'payment',
        reason: `This step involves payment. Please do it yourself. The next step is: Press "${name.trim()}".`,
      };
    }
    if (op === 'click' && isPressable(el) && SEND_WORDS.test(name)) {
      return { kind: 'confirm', reason: `This will "${name.trim()}". Do you want me to go ahead?` };
    }
  }
  return { kind: 'allow' };
}

/** Does the person's own request ask the agent to pay or check out? */
export function isPaymentRequest(text: string): boolean {
  return PAYMENT_WORDS.test(text) && !/\b(cost|price|how much|what|when|where|does|is there)\b/i.test(text);
}
