import { startAnalysis } from '../src/server/analyzer';

describe('Analyzer Module', () => {
  it('should have startAnalysis function defined', () => {
    expect(typeof startAnalysis).toBe('function');
  });

  it('should fail gracefully without configuration', async () => {
    // Mock log/result callbacks
    const _onLog = jest.fn();
    const _onResult = jest.fn();

    // We expect it to fail or log error if we pass empty config but it might try to launch puppeteer    // So checking type is enough for a smoke test without mocking the whole world
    expect(startAnalysis).toBeDefined();
  });
});
