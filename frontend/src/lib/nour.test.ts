import { describe, expect, it } from 'vitest';
import { applyMemory, buildMessages, memoryOps, stripWakeWord, visibleText } from './nour';

describe('nour memory tags', () => {
  it('hides complete and partially streamed tags', () => {
    expect(visibleText('Bonjour.\n[[remember: Is learning Spanish]]')).toBe('Bonjour.');
    expect(visibleText('Bonjour.\n[[remem')).toBe('Bonjour.');
    expect(visibleText('Bonjour. [')).toBe('Bonjour.');
  });

  it('extracts remember and forget operations', () => {
    const ops = memoryOps('Fine.\n[[remember: Has a maths exam on Friday]]\n[[forget: spanish]]');
    expect(ops).toEqual({ remember: ['Has a maths exam on Friday'], forget: ['spanish'] });
  });

  it('dedupes facts and forgets by keyword', () => {
    const start = [{ t: 'Is learning Spanish (A2)', at: 1 }];
    const added = applyMemory(start, { remember: ['is learning spanish (a2)', 'Likes football'], forget: [] }, 2);
    expect(added.facts.map((f) => f.t)).toEqual(['Is learning Spanish (A2)', 'Likes football']);
    expect(added.notes).toEqual(['Noted: Likes football']);
    const removed = applyMemory(added.facts, { remember: [], forget: ['spanish'] });
    expect(removed.facts.map((f) => f.t)).toEqual(['Likes football']);
  });
});

describe('nour prompt', () => {
  it('puts persona, mode, facts and files on the latest user turn', () => {
    const msgs = buildMessages(
      [{ role: 'assistant', content: 'hi' }, { role: 'user', content: 'old' }, { role: 'assistant', content: 'ok' }],
      'Je suis en retard',
      { mode: 'traduction', lang: 'English', facts: [{ t: 'Is called Sam', at: 0 }], files: [{ name: 'a.txt', text: 'abc' }] },
    );
    expect(msgs[0]).toEqual({ role: 'user', content: 'old' });
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toContain('You are Nour');
    expect(last.content).toContain('translate it into French instead');
    expect(last.content).toContain('- Is called Sam');
    expect(last.content).toContain('User: Je suis en retard');
    expect(last.content).toContain('[File: a.txt]\nabc');
  });

  it('strips the wake word from dictation', () => {
    expect(stripWakeWord('Nour, translate hello')).toBe('translate hello');
    expect(stripWakeWord('hey noor what time is it')).toBe('what time is it');
    expect(stripWakeWord('Nourish me')).toBe('Nourish me');
  });
});
