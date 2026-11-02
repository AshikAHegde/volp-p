import { loginVOLP, fetchUserCourses } from "../services/volp.service.js";
import { usersCollection, coursesCollection } from "../services/db.service.js";
import { encrypt } from "../services/encryption.service.js";
import { getTelegramBotInfo, generateTelegramLinkToken } from "../services/telegram.service.js";

// Authenticates user credentials with the VOLP portal and updates the user session in the database.
export const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  const normalizedEmail = String(username).trim().toLowerCase();

  try {
    const token = await loginVOLP(username, password);
    const encryptedPassword = encrypt(password);
    // Set 2-hour platform-independent session expiration timestamp in MongoDB
    const tokenExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await usersCollection.updateOne(
      { email: normalizedEmail },
      {
        $set: {
          token,
          token_expires_at: tokenExpiresAt,
          encrypted_password: encryptedPassword,
          updated_at: new Date(),
        },
        $unset: { password: "" },
        $setOnInsert: { email: normalizedEmail, created_at: new Date() },
      },
      { upsert: true },
    );


    try {
      const liveCourses = await fetchUserCourses(token, normalizedEmail);
      if (liveCourses.length > 0) {
        for (const currentCourse of liveCourses) {
          await coursesCollection.updateOne(
            { user_email: normalizedEmail, colid: Number(currentCourse.colid) },
            {
              $set: {
                crsid: currentCourse.crsid || null,
                course_name: currentCourse.course_name,
                semester: currentCourse.semester || null,
                academic_year: currentCourse.academic_year || null,
                updated_at: new Date(),
              },
              $setOnInsert: {
                user_email: normalizedEmail,
                colid: Number(currentCourse.colid),
                is_blocked: false,
                blocked_at: null,
              },
            },
            { upsert: true },
          );
        }
      }
    } catch (courseErr) {
      console.warn("Could not pre-fetch courses on login:", courseErr.message);
    }

    const existingUser = await usersCollection.findOne(
      { email: normalizedEmail },
      { projection: { telegram_chat_id: 1, is_premium: 1 } }
    );

    // Auto-preserve premium access for primary developer account or existing premium status
    const isPremiumUser = existingUser?.is_premium === true || normalizedEmail === 'ashik.hegde24@vit.edu';
    if (isPremiumUser && !existingUser?.is_premium) {
      await usersCollection.updateOne({ email: normalizedEmail }, { $set: { is_premium: true } });
    }

    res.json({
      success: true,
      message: "VOLP Login & User Registration Successful",
      email: normalizedEmail,
      token,
      telegram_chat_id: existingUser?.telegram_chat_id || "",
      is_premium: isPremiumUser,
    });
  } catch (err) {
    res.status(401).json({ error: "Authentication failed: " + err.message });
  }
};

// Verifies the Bearer token in the database and returns the active user session.
export const getActiveSession = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.get("authorization") || "";
    let token = "";

    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (req.query?.token) {
      token = String(req.query.token).trim();
    }

    if (!token) {
      return res.status(401).json({ error: "Unauthorized: Session token required." });
    }

    const user = await usersCollection.findOne(
      { token },
      { projection: { _id: 0, email: 1, token: 1, telegram_chat_id: 1, is_premium: 1, token_expires_at: 1, updated_at: 1 } },
    );

    if (!user) {
      return res.status(401).json({ error: "Invalid or expired session token. Please log in again." });
    }

    // Invalidate session if backend 2-hour expiration window has elapsed
    if (user.token_expires_at && new Date() > new Date(user.token_expires_at)) {
      await usersCollection.updateOne({ token }, { $unset: { token: "" } });
      return res.status(401).json({ error: "Session expired after 2 hours. Please log in again." });
    }

    return res.json({
      success: true,
      email: user.email,
      token: user.token,
      telegram_chat_id: user.telegram_chat_id || "",
      is_premium: user.is_premium === true,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to verify session: " + err.message });
  }
};

// Invalidates the current session token in the database upon user logout.
export const logout = async (req, res) => {
  try {
    // Invalidate session strictly for the authenticated user from req.user
    const token = req.user?.token || (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: Session token missing." });
    }

    await usersCollection.updateOne(
      { token },
      {
        $unset: { token: "" },
        $set: { updated_at: new Date() },
      },
    );

    return res.json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Logout failed: " + err.message });
  }
};

// Updates or saves the user's Telegram chat_id for 8 PM reminders.
export const updateTelegramChatId = async (req, res) => {
  const email = req.user?.email || req.body?.email;
  const telegramChatId = req.body?.telegram_chat_id;

  if (!email) {
    return res.status(400).json({ error: "User email is required." });
  }

  const cleanedChatId = String(telegramChatId || "").trim();

  try {
    await usersCollection.updateOne(
      { email },
      {
        $set: {
          telegram_chat_id: cleanedChatId,
          updated_at: new Date(),
        },
      },
      { upsert: false }
    );

    return res.json({
      success: true,
      message: "Telegram Chat ID saved successfully.",
      telegram_chat_id: cleanedChatId,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to update Telegram Chat ID: " + err.message });
  }
};

// Returns Telegram bot status and public configuration.
export const getTelegramConfig = async (req, res) => {
  try {
    const info = await getTelegramBotInfo();
    return res.json({
      success: true,
      bot: info,
      defaultChatId: process.env.TELEGRAM_CHAT_ID || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Generates a 1-Click Deep Link for connecting user's Telegram without manual Chat ID.
export const getTelegramLinkToken = async (req, res) => {
  const email = req.user?.email || req.body?.email;
  if (!email) {
    return res.status(400).json({ error: "User email is required." });
  }

  try {
    const result = await generateTelegramLinkToken(email);
    if (!result?.linkUrl) {
      return res.status(500).json({
        error: "Could not generate Telegram link. Bot token might be invalid or unconfigured."
      });
    }

    return res.json({
      success: true,
      token: result.token,
      botUsername: result.botUsername,
      linkUrl: result.linkUrl,
      webUrl: result.webUrl,
      appUrl: result.appUrl
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to generate Telegram link: " + err.message });
  }
};

// Checks real-time Telegram connection status for the user.
export const getTelegramStatus = async (req, res) => {
  const email = req.user?.email || req.query?.email;
  if (!email) {
    return res.status(400).json({ error: "User email is required." });
  }

  try {
    const user = await usersCollection.findOne(
      { email },
      { projection: { telegram_chat_id: 1, telegram_username: 1 } }
    );

    const isConnected = Boolean(user?.telegram_chat_id);
    return res.json({
      success: true,
      connected: isConnected,
      telegram_chat_id: user?.telegram_chat_id || "",
      telegram_username: user?.telegram_username || ""
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Disconnects/unlinks Telegram from user's account.
export const disconnectTelegram = async (req, res) => {
  const email = req.user?.email || req.body?.email;
  if (!email) {
    return res.status(400).json({ error: "User email is required." });
  }

  try {
    await usersCollection.updateOne(
      { email },
      {
        $set: { telegram_chat_id: "", telegram_username: "", updated_at: new Date() },
        $unset: { telegram_link_token: "", telegram_link_expires: "" }
      }
    );

    return res.json({
      success: true,
      message: "Telegram disconnected successfully."
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Developer-only: sets or revokes premium access for a user.
// Protected by the ADMIN_SECRET header — never expose to the frontend.
export const setPremium = async (req, res) => {
  const secret = req.headers['x-admin-secret'];
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || secret !== adminSecret) {
    return res.status(403).json({ error: 'Forbidden: invalid admin secret.' });
  }

  const { email, is_premium } = req.body;
  if (!email || typeof is_premium !== 'boolean') {
    return res.status(400).json({ error: 'email (string) and is_premium (boolean) are required.' });
  }

  try {
    const result = await usersCollection.updateOne(
      { email },
      { $set: { is_premium, updated_at: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: `No user found with email: ${email}` });
    }

    return res.json({
      success: true,
      message: `User ${email} premium access set to ${is_premium}.`,
      email,
      is_premium,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update premium status: ' + err.message });
  }
};

