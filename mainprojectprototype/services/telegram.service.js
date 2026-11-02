import 'dotenv/config';
import crypto from 'crypto';
import { usersCollection } from './db.service.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

let isPollingActive = false;
let pollingAbortController = null;
let cachedBotUsername = null;

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
    let errorMsg = data.description || `Telegram API responded with HTTP ${res.status}`;
    if (errorMsg.toLowerCase().includes('chat not found')) {
      errorMsg = 'Chat not found. Please open your bot in Telegram and press START (/start) so it can send you messages.';
    } else if (errorMsg.toLowerCase().includes('blocked by the user')) {
      errorMsg = 'Bot was blocked. Please unblock your bot in Telegram.';
    }
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

/**
 * Generates a one-time link token for 1-Click Telegram Deep Linking.
 */
export const generateTelegramLinkToken = async (userEmail) => {
  const token = 'volp_' + crypto.randomBytes(8).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  await usersCollection.updateOne(
    { email: userEmail },
    {
      $set: {
        telegram_link_token: token,
        telegram_link_expires: expiresAt,
        updated_at: new Date()
      }
    }
  );

  let botUser = cachedBotUsername;
  if (!botUser) {
    const info = await getTelegramBotInfo();
    if (info?.botUsername) {
      cachedBotUsername = info.botUsername;
      botUser = info.botUsername;
    }
  }

  const linkUrl = botUser ? `https://t.me/${botUser}?start=${token}` : null;
  const webUrl = botUser ? `https://web.telegram.org/k/#?tgaddr=${encodeURIComponent(`tg://resolve?domain=${botUser}&start=${token}`)}` : null;
  const appUrl = botUser ? `tg://resolve?domain=${botUser}&start=${token}` : null;
  return { token, botUsername: botUser, linkUrl, webUrl, appUrl };
};

/**
 * Handles an incoming message from Telegram (e.g. /start <token>).
 */
export const handleTelegramIncomingMessage = async (message) => {
  if (!message || !message.chat || !message.text) return;

  const chatId = String(message.chat.id);
  const text = message.text.trim();
  const username = message.from?.username || message.chat?.username || '';
  const firstName = message.from?.first_name || message.chat?.first_name || 'Learner';

  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase();
  const startArg = parts[1] || '';

  if (command === '/start') {
    if (startArg) {
      // Find user with this active link token
      const user = await usersCollection.findOne({
        telegram_link_token: startArg,
        telegram_link_expires: { $gte: new Date() }
      });

      if (user) {
        await usersCollection.updateOne(
          { email: user.email },
          {
            $set: {
              telegram_chat_id: chatId,
              telegram_username: username,
              updated_at: new Date()
            },
            $unset: {
              telegram_link_token: '',
              telegram_link_expires: ''
            }
          }
        );

        console.log(`✓ 1-Click Connected: ${user.email} -> Telegram Chat ID ${chatId} (@${username})`);

        const welcomeMsg = [
          `🎉 <b>Connection Successful!</b>`,
          ``,
          `Hello <b>${escapeTelegramHtml(firstName)}</b>! Your Telegram is now connected to <b>${escapeTelegramHtml(user.email)}</b>.`,
          ``,
          `⏰ You will automatically receive your assignment summary here every evening at <b>8:00 PM</b>.`,
          ``,
          `⚡ <i>No further setup required. You're all set!</i>`
        ].join('\n');

        await sendTelegramMessage(chatId, welcomeMsg).catch(e => console.error('Error sending welcome message:', e.message));
        return;
      } else {
        const expiredMsg = [
          `⚠ <b>Link Expired or Invalid</b>`,
          ``,
          `This connection link has expired or is invalid.`,
          `Please return to your VOLP Reminder dashboard and click <b>Connect Telegram in 1-Click</b> to generate a fresh link.`
        ].join('\n');
        await sendTelegramMessage(chatId, expiredMsg).catch(() => {});
        return;
      }
    }

    // /start without parameter
    const existing = await usersCollection.findOne({ telegram_chat_id: chatId });
    if (existing) {
      const alreadyMsg = [
        `👋 Hello <b>${escapeTelegramHtml(firstName)}</b>!`,
        ``,
        `Your Telegram account is already connected to <b>${escapeTelegramHtml(existing.email)}</b>.`,
        `You will receive assignment alerts every day at <b>8:00 PM</b>.`
      ].join('\n');
      await sendTelegramMessage(chatId, alreadyMsg).catch(() => {});
    } else {
      const promptMsg = [
        `👋 Hello <b>${escapeTelegramHtml(firstName)}</b>!`,
        ``,
        `Welcome to <b>VOLP Reminder Bot</b>!`,
        `To link this bot to your university account, please open your VOLP Reminder dashboard and click <b>Connect Telegram in 1-Click</b>.`
      ].join('\n');
      await sendTelegramMessage(chatId, promptMsg).catch(() => {});
    }
  }
};

/**
 * Starts long-polling Telegram getUpdates in the background.
 */
export const startTelegramPolling = async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('ℹ TELEGRAM_BOT_TOKEN is not set. Telegram polling skipped.');
    return;
  }

  if (isPollingActive) {
    return;
  }

  isPollingActive = true;
  pollingAbortController = new AbortController();

  console.log('🤖 Starting Telegram Bot Long Polling (1-Click deep link listener)...');

  try {
    const info = await getTelegramBotInfo();
    if (info?.botUsername) {
      cachedBotUsername = info.botUsername;
      console.log(`✓ Telegram Bot active: @${cachedBotUsername}`);
    }
  } catch (_) {}

  (async () => {
    let offset = 0;
    while (isPollingActive) {
      try {
        const url = `${TELEGRAM_API_BASE}/bot${token}/getUpdates?offset=${offset}&timeout=20&allowed_updates=["message"]`;
        const res = await fetch(url, { signal: pollingAbortController?.signal });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = Math.max(offset, update.update_id + 1);
            if (update.message) {
              await handleTelegramIncomingMessage(update.message).catch(err => {
                console.error('Error handling Telegram update:', err.message);
              });
            }
          }
        } else {
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (err) {
        if (err.name === 'AbortError') break;
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  })();
};

/**
 * Stops the Telegram polling loop.
 */
export const stopTelegramPolling = () => {
  isPollingActive = false;
  if (pollingAbortController) {
    pollingAbortController.abort();
    pollingAbortController = null;
  }
};

