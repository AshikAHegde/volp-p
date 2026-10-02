import { loginVOLP, fetchUserCourses } from "../services/volp.service.js";
import { usersCollection, coursesCollection } from "../services/db.service.js";

// Authenticates user credentials with the VOLP portal and updates the user session in the database.
export const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  try {
    const token = await loginVOLP(username, password);

    await usersCollection.updateOne(
      { email: username },
      {
        $set: { token, updated_at: new Date() },
        $unset: { password: "" },
        $setOnInsert: { email: username, created_at: new Date() },
      },
      { upsert: true },
    );

    try {
      const liveCourses = await fetchUserCourses(token, username);
      if (liveCourses.length > 0) {
        for (const currentCourse of liveCourses) {
          await coursesCollection.updateOne(
            { user_email: username, colid: Number(currentCourse.colid) },
            {
              $set: {
                crsid: currentCourse.crsid || null,
                course_name: currentCourse.course_name,
                semester: currentCourse.semester || null,
                academic_year: currentCourse.academic_year || null,
                updated_at: new Date(),
              },
              $setOnInsert: {
                user_email: username,
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

// Invalidates the current session token in the database upon user logout.
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
