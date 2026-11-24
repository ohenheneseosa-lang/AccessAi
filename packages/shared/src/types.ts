import { z } from 'zod/v4';

/** One interactive element on the page, as the content script sees it. */
export const InteractiveSchema = z.object({
  ref: z.string(),
  role: z.string(),
  name: z.string(),
  tag: z.string(),
  type: z.string().optional(),
  value: z.string().optional(),
  options: z.array(z.string()).optional(),
  disabled: z.boolean().optional(),
  /** Password, card, OTP, bank or identity field: the agent may never touch it. */
  sensitive: z.boolean(),
  /** Pay / place order / submit / delete account: the agent stops here. */
  commit: z.boolean(),
});
export type Interactive = z.infer<typeof InteractiveSchema>;

export const PageImageSchema = z.object({
  ref: z.string(),
  alt: z.string(),
  /** False when the image has no alt text, or only a filename-like one. */
  hasUsefulAlt: z.boolean(),
  /** Visible caption or nearby label, when there is one. */
  caption: z.string().optional(),
  width: z.number(),
  height: z.number(),
});
export type PageImage = z.infer<typeof PageImageSchema>;

export const HeadingSchema = z.object({ level: z.number(), text: z.string(), ref: z.string() });
export type Heading = z.infer<typeof HeadingSchema>;

/** A semantic snapshot of the page. Sent instead of screenshots. */
export const PageSnapshotSchema = z.object({
  url: z.string(),
  title: z.string(),
  site: z.string(),
  lang: z.string(),
  headings: z.array(HeadingSchema),
  landmarks: z.array(z.string()),
  /** Readable page text, in document order, already redacted. */
  text: z.string(),
  interactive: z.array(InteractiveSchema),
  images: z.array(PageImageSchema),
  /** Set by the bundled demo sites so demo mode can give the prototype's answers. */
  demo: z.string().optional(),
});
export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;

export const ActionStepSchema = z.object({
  op: z.enum(['select', 'click', 'type', 'focus', 'scroll']),
  ref: z.string(),
  value: z.string().optional(),
  /** Plain words the person will hear, e.g. Choose "10" in "Size". */
  description: z.string(),
});
export type ActionStep = z.infer<typeof ActionStepSchema>;

export const PlanSchema = z.object({
  goal: z.string(),
  steps: z.array(ActionStepSchema),
});
export type Plan = z.infer<typeof PlanSchema>;

export const AssistModeSchema = z.enum([
  'chat',
  'summarise',
  'describe_images',
  'plain_english',
  'transcript_summary',
]);
export type AssistMode = z.infer<typeof AssistModeSchema>;

export const ChatTurnSchema = z.object({ role: z.enum(['user', 'assistant']), text: z.string() });

export const AssistRequestSchema = z.object({
  mode: AssistModeSchema,
  message: z.string().max(4000),
  history: z.array(ChatTurnSchema).max(30).default([]),
  snapshot: PageSnapshotSchema.optional(),
  /** Images without useful alt text, as data URLs, only for describe_images. */
  images: z
    .array(z.object({ ref: z.string(), dataUrl: z.string().max(4_000_000) }))
    .max(4)
    .optional(),
  transcript: z.string().max(100_000).optional(),
  readingLevel: z.enum(['simple', 'standard']).default('simple'),
});
export type AssistRequest = z.infer<typeof AssistRequestSchema>;

export const AssistResponseSchema = z.object({
  /** Short card label: SUMMARY, IMAGE 1, IN PLAIN LANGUAGE, ... or null. */
  label: z.string().nullable(),
  text: z.string(),
  /** Exact page text the answer relies on ("Why did it say that?"). */
  sources: z.array(z.string()),
  plan: PlanSchema.nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  /** True when any part of the answer was machine-generated from an image. */
  aiDescription: z.boolean(),
  /** Which brain answered: a model id, or "demo". */
  answeredBy: z.string(),
});
export type AssistResponse = z.infer<typeof AssistResponseSchema>;
