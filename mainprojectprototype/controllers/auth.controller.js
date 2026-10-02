/**
 * auth.controller.js - User Authentication Controller (Modern ES Module)
 */
import { loginVOLP } from "../services/volp.service.js";
import { usersCollection } from "../services/db.service.js";

export const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  try {
    // 1. Authenticate with VOLP Admin portal
    const token = await loginVOLP(username, password);

    // 2. Save/Update User in MongoDB
    await usersCollection.updateOne(
      { email: username },
      {
        $set: { token, updated_at: new Date() },
        $unset: { password: "" },
        $setOnInsert: { email: username, created_at: new Date() },
      },
      { upsert: true },
    );

    // 3. Return session response
    res.json({
      success: true,
      message: "VOLP Login & User Registration Successful",
      email: username,
      token,
    });
  } catch (err) {
    res.status(401).json({ error: "Authentication failed: " + err.message });
  }
};

/**
 * Validate and return active session for the authenticated user.
 * Multi-user safe: strictly requires and verifies the caller's Bearer token in MongoDB.
 * Completely isolates sessions so users never receive another user's session.
 */
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
      { projection: { _id: 0, email: 1, token: 1, updated_at: 1 } },
    );

    if (!user) {
      return res.status(401).json({ error: "Invalid or expired session token. Please log in again." });
    }

    return res.json({
      success: true,
      email: user.email,
      token: user.token,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to verify session: " + err.message });
  }
};

/**
 * Invalidate session token in MongoDB on logout.
 */
export const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.get("authorization") || "";
    let token = "";

    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (req.body?.token) {
      token = String(req.body.token).trim();
    }

    if (token) {
      await usersCollection.updateOne(
        { token },
        {
          $unset: { token: "" },
          $set: { updated_at: new Date() },
        },
      );
    }

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

