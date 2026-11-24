/**
 * The prototype video's sample answers for the three bundled demo sites.
 * Demo mode uses these so the Sam, Mia and Grace journeys play exactly as in
 * the video without an AI key. Every answer is still grounded in text that is
 * really on the demo page (see the `sources`).
 */
export interface DemoFixture {
  summary: { text: string; sources: string[] };
  images?: { text: string }[];
  plainEnglish?: { text: string; sources: string[] };
  questions?: { match: RegExp; text: string; sources: string[] }[];
  transcriptSummary?: string;
  /** Scripted speech for the demo video, used by the demo caption source. */
  speech?: { at: number; text: string; confidence?: number }[];
}

export const DEMO_FIXTURES: Record<string, DemoFixture> = {
  'runner-shop': {
    summary: {
      text:
        'This is Runner Shop, an online store for running shoes. The main product is the Black Runner, a road running shoe for $129, available in sizes 7 to 12. Delivery is free on orders over $100.\n\nYou can: choose a size, add the shoes to your cart, or check out.',
      sources: ['Black Runner', '$129', 'Free delivery on orders over $100', 'Sizes 7 to 12'],
    },
    images: [
      {
        text:
          'A black running shoe shown from the side. It has a breathable mesh upper, a thick white foam sole, black laces and a small reflective strip on the heel.',
      },
    ],
    questions: [
      {
        match: /deliver|shipping|postage/i,
        text:
          'Delivery is free on orders over $100. The Black Runner is $129, so delivery would be free. It usually arrives in 2 to 4 business days.',
        sources: ['Free delivery on orders over $100', 'Arrives in 2 to 4 business days'],
      },
      {
        match: /return/i,
        text: 'You can return unworn shoes within 30 days for a full refund.',
        sources: ['Return unworn shoes within 30 days for a full refund.'],
      },
    ],
  },
  'harbour-health': {
    summary: {
      text:
        'This is the Harbour Health People team welcome page. It has a welcome video from the Chief Executive, which has no captions, and your first-week checklist.\n\nYou can: play the video, turn on live captions, or read the checklist.',
      sources: ['Welcome to the team', 'No captions available', 'first-week checklist'],
    },
    speech: [
      { at: 0, text: "Hi, and welcome to Harbour Health. We're so glad you're joining the team." },
      { at: 4500, text: "Your first week is all about settling in and meeting the people you'll work with." },
      { at: 9500, text: 'Your start date is Monday the 2nd of December, at 9 am.' },
      { at: 13500, text: 'Please come to the Level 3 reception, and bring photo ID and your bank details.' },
      { at: 18500, text: 'Your buddy is Priya from the patient care team.', confidence: 0.62 },
      { at: 22500, text: 'Before Friday, please complete the online induction module. See you soon!' },
    ],
    transcriptSummary:
      'Summary:\n• Welcome to Harbour Health; your first week is about settling in.\n• Your start date is Monday 2 December, at 9 am, at the Level 3 reception.\n• Bring photo ID and your bank details.\n• Your buddy is Priya from the patient care team.\n\nAction: complete the online induction module by Friday.',
  },
  'seniors-card': {
    summary: {
      text:
        'This is a Service Portal page about the Seniors Card: who can get it, what discounts it gives, and how to apply.\n\nYou can: read the eligibility rules, read about the discounts, or go to the online application.',
      sources: ['Seniors Card: eligibility, entitlements and application process'],
    },
    plainEnglish: {
      text:
        'You can get a Seniors Card if you are 60 or older and work less than 35 hours a week.\n\nThe card is free. It gives you discounts on public transport, energy bills and some shops.\n\nTo apply, fill in the online form. You need your Medicare card and proof of your address. It takes about 10 minutes.\n\nYour card arrives by post within 3 weeks.',
      sources: [
        'attained the age of 60 years',
        'aggregate of 35 hours or more per week',
        'The card is issued free of charge.',
        'Processing typically takes up to 15 business days',
      ],
    },
  },
};
