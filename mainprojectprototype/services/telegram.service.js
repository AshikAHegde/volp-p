import 'dotenv/config';
import { usersCollection } from './db.service.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

// Escapes special characters for Telegram HTML mode (<, >, &)
export const escapeTelegramHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Sends a direct message to a Telegram chat via Telegram Bot API.
 */
export const sendTelegramMessage = async (chatId, text, options = {}) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment variables.');
  }

  if (!chatId) {
    throw new Error('Telegram chatId is required to send a message.');
  }

  const endpoint = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode || 'HTML',
    disable_web_page_preview: options.disableWebPagePreview !== false,
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    const errorMsg = data.description || `Telegram API responded with HTTP ${res.status}`;
    console.error(`❌ Telegram send error for chat ${chatId}:`, errorMsg);
    throw new Error(errorMsg);
  }

  return data.result;
};

/**
 * Formats and sends 8 PM assignment reminder digest to a student's Telegram.
 */
export const sendAssignmentReminderTelegram = async (userEmail, assignments = [], explicitChatId = null) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('⚠ TELEGRAM_BOT_TOKEN is missing. Reminder notification skipped.');
    return { success: false, reason: 'MISSING_BOT_TOKEN' };
  }

  let chatId = explicitChatId;

  // If chatId not provided, lookup user's registered telegram_chat_id in DB, or fallback to env
  if (!chatId) {
    try {
      const user = await usersCollection.findOne(
        { email: userEmail },
        { projection: { telegram_chat_id: 1 } }
      );
      if (user?.telegram_chat_id) {
        chatId = user.telegram_chat_id;
      }
    } catch (e) {
      console.warn(`Could not lookup Telegram chat_id for ${userEmail}:`, e.message);
    }
  }

  if (!chatId && process.env.TELEGRAM_CHAT_ID) {
    chatId = process.env.TELEGRAM_CHAT_ID;
  }

  if (!chatId) {
    const msg = `No Telegram chat ID configured for ${userEmail}. Connect your Telegram bot in Settings.`;
    console.warn(`⚠ ${msg}`);
    return { success: false, reason: 'NO_CHAT_ID', message: msg };
  }

  const pendingAssignments = assignments.filter((a) => !a.is_submitted && !a.is_blocked);

  let messageText = '';

  if (pendingAssignments.length === 0) {
    messageText = [
      `🎉 <b>VOLP Assignment Digest</b>`,
      ``,
      `Hello <b>${escapeTelegramHtml(userEmail)}</b>!`,
      `You have <b>0 pending assignments</b> right now. All caught up! 🚀`,
      ``,
      `<i>Synced at ${new Date().toLocaleTimeString()}</i>`,
    ].join('\n');
  } else {
    messageText = [
      `📚 <b>VOLP 8 PM Assignment Reminder</b>`,
      `Hello <b>${escapeTelegramHtml(userEmail)}</b>,`,
      `You have <b>${pendingAssignments.length} pending assignment(s)</b>:`,
      ``,
      ...pendingAssignments.map((a, idx) => {
        const typeBadge = a.assignment_type ? `[${escapeTelegramHtml(a.assignment_type)}]` : '';
        const dueDate = a.due_date_raw ? `📅 Due: <b>${escapeTelegramHtml(a.due_date_raw)}</b>` : '📅 Due: No date specified';
        const title = a.title_html ? escapeTelegramHtml(a.title_html.replace(/<[^>]+>/g, '').trim()) : 'Untitled Assignment';
        return [
          `<b>${idx + 1}. ${escapeTelegramHtml(a.course_name)}</b> ${typeBadge}`,
          `📝 ${title}`,
          `${dueDate}`,
          `───────────────────`
        ].join('\n');
      }),
      ``,
      `⚡ <i>Submit on VOLP before deadlines to avoid penalties!</i>`
    ].join('\n');
  }

  const result = await sendTelegramMessage(chatId, messageText, { parseMode: 'HTML' });
  console.log(`✓ Telegram reminder sent to ${userEmail} (chat ${chatId}). Message ID: ${result?.message_id}`);

  return {
    success: true,
    messageId: result?.message_id,
    recipient: chatId,
    count: pendingAssignments.length,
    message: `Telegram alert sent (${pendingAssignments.length} pending assignments).`
  };
};

/**
 * Validates bot token and gets bot profile info from Telegram.
 */
export const getTelegramBotInfo = async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { configured: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  }

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getMe`);
    const data = await res.json();
    if (res.ok && data.ok) {
      return {
        configured: true,
        botUsername: data.result.username,
        botFirstName: data.result.first_name,
        canJoinGroups: data.result.can_join_groups,
      };
    }
    return { configured: false, error: data.description || 'Invalid bot token' };
  } catch (err) {
    return { configured: false, error: err.message };
  }
};
