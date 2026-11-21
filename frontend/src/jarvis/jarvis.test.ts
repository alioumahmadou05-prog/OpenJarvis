import { describe, expect, it } from 'vitest';
import { groupByDate, visible } from './api';
import { describeAction } from './chat';
import { takeSentences } from './voice';

describe('jarvis helpers', () => {
  it('hides action tags and thinking while streaming', () => {
    expect(visible('Done.\n[[remind: 2030-01-01T10:00 | x | none]]')).toBe('Done.');
    expect(visible('Done. [[remem')).toBe('Done.');
    expect(visible('<think>plan</think>Hello')).toBe('Hello');
  });

  it('splits streamed text into speakable sentences', () => {
    const [ready, rest] = takeSentences('Good evening. The market is closed! And then');
    expect(ready).toEqual(['Good evening.', 'The market is closed!']);
    expect(rest.trim()).toBe('And then');
    expect(takeSentences('And then some', true)[0]).toEqual(['And then some']);
    expect(takeSentences('Pi is 3.14 roughly')[0]).toEqual([]);
  });

  it('groups conversations by date', () => {
    const now = new Date('2026-11-21T15:00:00').getTime();
    const s = (d: string) => new Date(d).getTime() / 1000;
    const groups = groupByDate([{ updated_at: s('2026-11-21T09:00:00') }, { updated_at: s('2026-11-20T09:00:00') }, { updated_at: s('2026-11-16T09:00:00') }, { updated_at: s('2026-09-01T09:00:00') }], now);
    expect(groups.map(g => g.label)).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Older']);
  });

  it('describes applied actions honestly', () => {
    expect(describeAction({ type: 'remind', ok: false, error: 'That time is in the past.' })).toContain('past');
    expect(describeAction({ type: 'remember', ok: true, text: 'Studies chemical engineering' })).toBe('Remembered: Studies chemical engineering');
    expect(describeAction({ type: 'forget', ok: true, keyword: 'pizza', removed: 2 })).toContain('2');
  });
});
