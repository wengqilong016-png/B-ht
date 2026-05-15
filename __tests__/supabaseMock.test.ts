import { describe, expect, it } from '@jest/globals';

import { makeChain, setChainResult } from './helpers/supabaseMock';

describe('supabaseMock helper', () => {
  it('filters array data with eq predicates', async () => {
    setChainResult([
      { id: 'tx-1', driverId: 'drv-1' },
      { id: 'tx-2', driverId: 'drv-2' },
      { id: 'tx-3', driverId: 'drv-1' },
    ]);

    const chain = makeChain();
    const query = chain.select('*') as unknown as typeof chain;
    const result = await query.eq('driverId', 'drv-1');

    expect(result).toEqual({
      data: [
        { id: 'tx-1', driverId: 'drv-1' },
        { id: 'tx-3', driverId: 'drv-1' },
      ],
      error: null,
    });
  });

  it('applies in, is, and limit predicates before resolving', async () => {
    setChainResult([
      { id: 'set-1', driverId: 'drv-1', status: 'pending', deletedAt: null },
      { id: 'set-2', driverId: 'drv-2', status: 'pending', deletedAt: null },
      { id: 'set-3', driverId: 'drv-3', status: 'confirmed', deletedAt: null },
      { id: 'set-4', driverId: 'drv-1', status: 'pending', deletedAt: '2026-01-01' },
      { id: 'set-5', driverId: 'drv-1', status: 'pending', deletedAt: null },
    ]);

    const chain = makeChain();
    const query = chain.select('*') as unknown as typeof chain;
    const driverQuery = query.in('driverId', ['drv-1', 'drv-3']) as unknown as typeof chain;
    const pendingQuery = driverQuery.eq('status', 'pending') as unknown as typeof chain;
    const activeQuery = pendingQuery.is('deletedAt', null) as unknown as typeof chain;
    const result = await activeQuery.limit(1);

    expect(result).toEqual({
      data: [{ id: 'set-1', driverId: 'drv-1', status: 'pending', deletedAt: null }],
      error: null,
    });
  });
});
