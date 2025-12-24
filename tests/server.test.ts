import { startAnalysis } from '../src/server/analyzer';
import axios from 'axios';
import * as puppeteer from 'puppeteer';
import { Config } from '../src/server/types';

// Mock dependencies
jest.mock('axios');
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      goto: jest.fn().mockResolvedValue(null),
      close: jest.fn().mockResolvedValue(null),
      $: jest.fn().mockResolvedValue(null),
      evaluate: jest.fn().mockResolvedValue([]),
      setRequestInterception: jest.fn(),
      on: jest.fn(),
      cookies: jest.fn().mockResolvedValue([]),
    }),
    close: jest.fn().mockResolvedValue(null),
    isConnected: jest.fn().mockReturnValue(true),
    on: jest.fn(),
  }),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Analyzer Module', () => {
  let onLog: jest.Mock;
  let onResult: jest.Mock;

  beforeEach(() => {
    onLog = jest.fn();
    onResult = jest.fn();
    jest.clearAllMocks();
    process.env.INSTAGRAM_ACCESS_TOKEN = 'test-token';
  });

  const validConfig: Config = {
    postUrl: 'https://www.instagram.com/p/TestShortcode/',
    competitors: ['competitor1'],
  };

  it('should handle API errors gracefully', async () => {
    // Mock API failure for account check
    mockedAxios.get.mockRejectedValueOnce(new Error('API Failed'));

    await startAnalysis(validConfig, onLog, onResult);

    // Should log the error
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Starting Instagram Analyzer'));
    // It tries API first
    expect(mockedAxios.get).toHaveBeenCalled();
    // It should fall back to scraping or fail. In this code, if API fails, it logs error and returns null for commenters,
    // then proceeds to scraping path.
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('API Error'));
  }, 15000);

  it('should fail if no commenters found via API or scraping', async () => {
    // Mock API returning no account (so it skips to scraping)
    mockedAxios.get.mockResolvedValueOnce({ data: { data: [] } }); // No pages

    await startAnalysis(validConfig, onLog, onResult);

    // It should attempt to launch browser (mocked) and scrape
    // Since our mocked scrape returns empty set (default), it should fail
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('No valid commenters found'));
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'No valid commenters found.' }),
    );
  }, 15000);

  it('should successfully identify a winner if commenters exist', async () => {
    // 1. Mock API Account Check Success
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [{ instagram_business_account: { id: '123' } }],
      },
    });

    // 2. Mock Media Search
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [{ shortcode: 'TestShortcode', id: 'media_123' }],
      },
    });

    // 3. Mock Comments Fetch
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          { username: 'winner_user', text: 'I love this! @friend1 @friend2' }, // Valid
          { username: 'loser_user', text: 'Nice pic!' }, // Invalid
        ],
        paging: {},
      },
    });

    // 4. Mock Follower Check (Puppeteer)

    // We need to spy on the puppeteer mock we created above to make it return specific values for `evaluate`

    const browserInstance = await puppeteer.launch();

    const mockPage = await browserInstance.newPage();

    // Logic inside analyzeUser:

    // 1. Check private -> false

    // 2. Get User ID -> "999"

    // 3. Check Follow -> true

    (mockPage.evaluate as jest.Mock)

      .mockResolvedValueOnce(false) // isPrivate

      .mockResolvedValueOnce('999') // userId

      .mockResolvedValueOnce(true); // isFollowing (for competitor1)

    // Re-mock launch to return our controlled page
    (puppeteer.launch as jest.Mock).mockResolvedValue({
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    });

    await startAnalysis(validConfig, onLog, onResult);

    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('QUALIFIED: @winner_user'));
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        winner: 'winner_user',
        qualified: expect.arrayContaining(['winner_user']),
      }),
    );
  }, 15000);
});
