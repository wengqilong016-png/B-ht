describe('checkDbHealth', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses the auth health endpoint instead of the REST root', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as typeof fetch;

    const { checkDbHealth } = await import('../supabaseClient');
    await expect(checkDbHealth()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/health',
      expect.objectContaining({
        headers: { apikey: 'anon-key' },
        cache: 'no-store',
      }),
    );
  });

  it('returns false when the health endpoint is unavailable', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false });
    global.fetch = fetchMock as typeof fetch;

    const { checkDbHealth } = await import('../supabaseClient');
    await expect(checkDbHealth()).resolves.toBe(false);
  });
});
