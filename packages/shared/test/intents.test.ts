import { describe, expect, it } from 'vitest';
import { routeMessage } from '../src/intents.js';

describe('routeMessage (the prototype phrases)', () => {
  it.each([
    ["What's this page about?", { ai: 'summarise' }],
    ['Summarise this page', { ai: 'summarise' }],
    ['What does delivery cost?', { ai: 'chat' }],
    ['Describe the images', { ai: 'describe_images' }],
    ['Add the black runners in size 10 to my cart', { ai: 'chat' }],
    ['Check out', { local: { kind: 'payment' } }],
    ['Make the text bigger', { local: { kind: 'zoom', direction: 'in' } }],
    ['Make it bigger', { local: { kind: 'zoom', direction: 'in' } }],
    ['High contrast', { local: { kind: 'contrast', on: 'toggle' } }],
    ['Turn on the reading guide', { local: { kind: 'readingGuide', on: true } }],
    ['Explain this in plain English', { ai: 'plain_english' }],
    ['reset the page', { local: { kind: 'reset' } }],
    ['stop', { local: { kind: 'stop' } }],
    ['undo', { local: { kind: 'undo' } }],
    ['Jump to a section', { local: { kind: 'jump', target: '' } }],
    ['Go to how to apply', { local: { kind: 'jump', target: 'how to apply' } }],
    ['What can I do here?', { local: { kind: 'whatCanIDo' } }],
    ['captions', { local: { kind: 'openTab', tab: 'captions' } }],
  ])('%s', (text, expected) => expect(routeMessage(text)).toEqual(expected));
});
