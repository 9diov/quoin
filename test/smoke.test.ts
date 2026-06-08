import { describe, expect, it } from 'vitest';

import { parserModule } from '../src/index.js';

describe('project scaffold', () => {
  it('exports the Core placeholder modules', () => {
    expect(parserModule).toBe('core/parser');
  });
});
