/**
 * unit.telegram.service.test.js
 *
 * Unit tests for services/telegram.service.js.
 */
import { jest } from '@jest/globals';

const mockFindOne = jest.fn();
const mockUpdateOne = jest.fn();
await jest.unstable_mockModule('../services/db.service.js', () => ({
  usersCollection: {
    findOne: mockFindOne,
    updateOne: mockUpdateOne,
  },
}));

process.env.TELEGRAM_BOT_TOKEN = '123456:FAKE_TOKEN';
process.env.TELEGRAM_CHAT_ID = '987654321';

const {
  sendTelegramMessage,
  sendAssignmentReminderTelegram,
  getTelegramBotInfo,
  escapeTelegramHtml,
  generateTelegramLinkToken,
  handleTelegramIncomingMessage,
} = await import('../services/telegram.service.js');

describe('telegram.service.js', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('escapeTelegramHtml', () => {
    test('escapes <, >, and & characters', () => {
      expect(escapeTelegramHtml('<b>Test & "quote"</b>')).toBe(
        '&lt;b&gt;Test &amp; "quote"&lt;/b&gt;'
      );
    });

    test('handles null/undefined gracefully', () => {
      expect(escapeTelegramHtml(null)).toBe('');
      expect(escapeTelegramHtml(undefined)).toBe('');
    });
  });

  describe('sendTelegramMessage', () => {
    test('throws error if chatId is missing', async () => {
      await expect(sendTelegramMessage('', 'Hello')).rejects.toThrow(
        'Telegram chatId is required'
      );
    });

    test('sends POST request to Telegram API endpoint', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 101 } }),
      });

      const res = await sendTelegramMessage('12345', '<b>Test</b>');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bot123456:FAKE_TOKEN/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(res.message_id).toBe(101);
    });

    test('throws clean error when Telegram returns ok: false', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, description: 'Chat not found' }),
      });

      await expect(sendTelegramMessage('invalid_chat', 'Hi')).rejects.toThrow(
        'Chat not found'
      );
    });
  });

  describe('sendAssignmentReminderTelegram', () => {
    test('filters out submitted and blocked assignments', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 202 } }),
      });

      const assignments = [
        {
          course_name: 'Operating System',
          assignment_type: 'HANDS_ON',
          title_html: 'Assignment 1',
          due_date_raw: 'Tomorrow',
          is_submitted: false,
          is_blocked: false,
        },
        {
          course_name: 'Data Structures',
          assignment_type: 'SUBJECTIVE',
          title_html: 'Done Task',
          due_date_raw: 'Yesterday',
          is_submitted: true,
          is_blocked: false,
        },
        {
          course_name: 'Algorithms',
          assignment_type: 'SUBJECTIVE',
          title_html: 'Blocked Task',
          due_date_raw: 'Next week',
          is_submitted: false,
          is_blocked: true,
        },
      ];

      const res = await sendAssignmentReminderTelegram(
        'student@vit.edu',
        assignments,
        '12345'
      );

      expect(res.success).toBe(true);
      expect(res.count).toBe(1);

      const callPayload = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callPayload.text).toContain('Operating System');
      expect(callPayload.text).not.toContain('Done Task');
      expect(callPayload.text).not.toContain('Blocked Task');
    });

    test('fetches chat_id from MongoDB when not provided explicitly', async () => {
      mockFindOne.mockResolvedValue({ telegram_chat_id: 'db_chat_777' });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 303 } }),
      });

      const res = await sendAssignmentReminderTelegram('student@vit.edu', []);
      expect(mockFindOne).toHaveBeenCalledWith(
        { email: 'student@vit.edu' },
        { projection: { telegram_chat_id: 1 } }
      );
      expect(res.recipient).toBe('db_chat_777');
    });
  });

  describe('getTelegramBotInfo', () => {
    test('returns bot info on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: { username: 'MyVolpBot', first_name: 'VOLP Alert Bot' },
        }),
      });

      const info = await getTelegramBotInfo();
      expect(info.configured).toBe(true);
      expect(info.botUsername).toBe('MyVolpBot');
    });
  });

  describe('generateTelegramLinkToken', () => {
    test('generates secure link token and updates user in MongoDB', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          result: { username: 'MyVolpBot' },
        }),
      });

      const res = await generateTelegramLinkToken('user@vit.edu');
      expect(res.token).toMatch(/^volp_[a-f0-9]{16}$/);
      expect(res.linkUrl).toContain(`https://t.me/MyVolpBot?start=${res.token}`);
      expect(mockUpdateOne).toHaveBeenCalledWith(
        { email: 'user@vit.edu' },
        expect.objectContaining({
          $set: expect.objectContaining({
            telegram_link_token: res.token,
          }),
        })
      );
    });
  });

  describe('handleTelegramIncomingMessage', () => {
    test('binds telegram_chat_id when user sends /start <valid_token>', async () => {
      mockFindOne.mockResolvedValue({ email: 'ashik@vit.edu' });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 888 } }),
      });

      const message = {
        chat: { id: 7526762528, first_name: 'Ashik' },
        from: { username: 'ashik_hegde' },
        text: '/start volp_1234567890abcdef',
      };

      await handleTelegramIncomingMessage(message);

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { email: 'ashik@vit.edu' },
        expect.objectContaining({
          $set: expect.objectContaining({
            telegram_chat_id: '7526762528',
            telegram_username: 'ashik_hegde',
          }),
        })
      );
    });
  });
});

