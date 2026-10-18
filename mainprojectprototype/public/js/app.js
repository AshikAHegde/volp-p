
let currentUser = null;
let rawAssignments = [];
let rawCourses = [];
let blockedCoursesList = [];
let blockedAssignmentsList = [];

let currentTab = "dashboard";
let currentTaskView = "kanban";
let currentStatusFilter = "all";
let currentTypeFilter = "all";
let currentSubjectFilter = "all";
let currentSearchQuery = "";
let pendingModalAction = null;
let calendarView = "month";
let calendarDate = new Date();
let calendarCourseFilter = "all";
let calendarStatusFilter = "all";

// Initializes application state, session, and views upon DOM load.
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initSidebarState();
  initSidebarTourState();
  if (!initUserSession()) return;
  const footerYear = document.getElementById("appFooterYear");
  if (footerYear) footerYear.textContent = new Date().getFullYear();
  renderAllViews();
  await loadAppData();

  document.addEventListener("keydown", (e) => {
    const tourModal = document.getElementById("interactiveTourOverlay");
    if (tourModal && tourModal.classList.contains("active")) {
      if (e.key === "Escape") { closeInteractiveTour(); return; }
      if (e.key === "ArrowRight") { nextTourStep(); return; }
      if (e.key === "ArrowLeft") { prevTourStep(); return; }
    }

    if (e.key === "Escape") {
      const modal = document.getElementById("modalOverlay");
      if (modal && modal.classList.contains("active")) {
        closeModal();
      } else {
        closeSidebar();
      }
    }
  });
});

// Initializes the sidebar collapsed or expanded state from local storage.
function initSidebarState() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  const collapsed = localStorage.getItem("sidebar-collapsed") === "true";
  sidebar.classList.toggle("is-collapsed", collapsed);
  updateSidebarCollapseButton(collapsed);
}

// Hides the sidebar tour callout if previously dismissed by the user.
function initSidebarTourState() {
  const dismissed = localStorage.getItem("volp_sidebar_tour_dismissed") === "true";
  const card = document.getElementById("sidebarTourCard");
  if (card && dismissed) {
    card.style.display = "none";
  }
}

// Dismisses the sidebar tour card and records the preference in local storage.
function dismissSidebarTour(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const card = document.getElementById("sidebarTourCard");
  if (card) {
    card.style.display = "none";
  }
  localStorage.setItem("volp_sidebar_tour_dismissed", "true");
  if (typeof showToast === "function") {
    showToast("Tour card dismissed. You can restore it anytime in 'How to Use'!", "info");
  }
}

// Restores the visibility of the sidebar tour callout in the left sidebar.
function restoreSidebarTour() {
  localStorage.removeItem("volp_sidebar_tour_dismissed");
  const card = document.getElementById("sidebarTourCard");
  if (card) {
    card.style.display = "";
  }
  if (typeof showToast === "function") {
    showToast("Tour card restored in left sidebar!", "success");
  }
}

window.dismissSidebarTour = dismissSidebarTour;
window.restoreSidebarTour = restoreSidebarTour;

// Updates the collapse toggle button icon and tooltip based on sidebar state.
function updateSidebarCollapseButton(collapsed) {
  const button = document.getElementById("sidebarCollapseBtn");
  if (!button) return;
  button.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  button.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  button.innerHTML = collapsed
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';
}

// Toggles the collapsed state of the sidebar navigation and stores it in local storage.
function toggleSidebarCollapse() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  const collapsed = sidebar.classList.toggle("is-collapsed");
  localStorage.setItem("sidebar-collapsed", String(collapsed));
  updateSidebarCollapseButton(collapsed);
}

// Applies the saved color theme from local storage or defaults to dark.
function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);
}

// Switches between light and dark themes and persists preference.
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeIcon(next);
  showToast(`Switched to ${next.toUpperCase()} theme`, "info");
}

// Updates the theme button icon to reflect the active theme.
function updateThemeIcon(theme) {
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.textContent = theme === "dark" ? "☼" : "◐";
}

// Validates user authentication from local storage and populates UI profile headers.
function initUserSession() {
  const stored = localStorage.getItem("volp_user");
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      if (!currentUser?.email || !currentUser?.token) {
        currentUser = null;
      }
    } catch (e) {
      currentUser = null;
    }
  } else {
    currentUser = null;
  }

  if (!currentUser) {
    window.location.href = "login.html";
    return false;
  }

  const userEmail = currentUser.email;
  const nameDisplay = userEmail.split("@")[0].toUpperCase();
  const avatarText = (
    nameDisplay.length >= 2 ? nameDisplay.substring(0, 2) : nameDisplay
  ).toUpperCase();

  const sideName = document.getElementById("sidebarUserName");
  const sideAvatar = document.getElementById("sidebarAvatar");
  const settingsEmail = document.getElementById("settingsEmail");
  const settingsLargeAvatar = document.getElementById("settingsLargeAvatar");
  const settingsProfileTitle = document.getElementById("settingsProfileTitle");

  if (sideName) sideName.textContent = userEmail;
  if (sideAvatar) sideAvatar.textContent = avatarText;
  if (settingsEmail) settingsEmail.value = userEmail;
  if (settingsLargeAvatar) settingsLargeAvatar.textContent = avatarText;
  if (settingsProfileTitle) settingsProfileTitle.textContent = nameDisplay;
  loadTelegramSettings();

  if (currentUser?.token) {
    fetch("/api/auth/session", {
      headers: { Authorization: `Bearer ${currentUser.token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.telegram_chat_id) {
          currentUser.telegram_chat_id = data.telegram_chat_id;
          localStorage.setItem("volp_user", JSON.stringify(currentUser));
          const input = document.getElementById("settingsTelegramChatId");
          if (input && !input.value) input.value = data.telegram_chat_id;
          if (currentTab === "reminders") renderRemindersView();
        }
      })
      .catch(() => {});
  }

  return true;
}

// Clears the stored user session, calls the logout API, and redirects to login.
function handleSignOut() {
  if (currentUser?.token) {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentUser.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: currentUser.token }),
    }).catch(() => {});
  }
  localStorage.removeItem("volp_user");
  showToast("Signed out successfully", "info");
  setTimeout(() => {
    window.location.href = "login.html";
  }, 400);
}

// Normalizes raw assignment type strings into standard identifiers.
function normalizeType(type) {
  if (!type) return "";
  const clean = String(type)
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (clean === "HANDSON" || clean === "HANDS_ON") return "HANDS_ON";
  if (clean === "SUBJECTIVE") return "SUBJECTIVE";
  return clean;
}

// Checks whether an assignment item is marked as submitted.
function isSubmitted(item) {
  return (
    item.is_submitted === true ||
    item.is_submitted === 1 ||
    item.is_submitted === "true" ||
    item.is_submitted === "1"
  );
}

// Parses diverse date string formats from the portal into JavaScript Date objects.
function parseVolpDate(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  const lower = str.toLowerCase();

  if (lower.includes("overdue") || lower.includes("yesterday")) {
    return new Date(Date.now() - 86400000);
  }
  if (lower.includes("today")) {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }
  if (lower.includes("tomorrow")) {
    const d = new Date(Date.now() + 86400000);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  const inDaysMatch = lower.match(/in\s+(\d+)\s+days?/);
  if (inDaysMatch) {
    return new Date(Date.now() + parseInt(inDaysMatch[1], 10) * 86400000);
  }

  const match = str.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i,
  );
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    let hours = match[4] ? parseInt(match[4], 10) : 23;
    const minutes = match[5] ? parseInt(match[5], 10) : 59;
    const seconds = match[6] ? parseInt(match[6], 10) : 0;
    const ampm = match[7] ? match[7].toUpperCase() : null;
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return new Date(year, month, day, hours, minutes, seconds);
  }

  const parsed = Date.parse(str);
  return isNaN(parsed) ? null : new Date(parsed);
}

// Determines if an unsubmitted assignment has passed its due date.
function isAssignmentOverdue(item) {
  if (isSubmitted(item)) return false;
  if (!item.due_date_raw) return false;
  const d = parseVolpDate(item.due_date_raw);
  if (!d) {
    return (item.due_date_raw || "").toLowerCase().includes("overdue");
  }
  return d.getTime() < Date.now();
}

// Strips HTML tags and decodes entities from assignment titles.
function cleanHtmlTitle(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Constructs authorization and user headers for API requests.
function getAuthHeaders() {
  if (!currentUser?.token || !currentUser?.email) return {};
  return {
    Authorization: `Bearer ${currentUser.token}`,
    "X-User-Email": currentUser.email,
  };
}

// Fetches courses, assignments, and block lists, progressively updating views.
async function loadAppData(refresh = false) {
  try {
    const courseRes = await fetch("/api/assignments/my-courses", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        email: currentUser.email,
        token: currentUser.token,
        refresh,
      }),
    });

    if (courseRes.ok) {
      const courseData = await courseRes.json();
      rawCourses = courseData.courses || [];
      const statusEl = document.getElementById("settingsDataSource");
      if (statusEl)
        statusEl.value = `Source: ${courseData.source || "MONGODB_DATABASE"} (Live Connected)`;
      renderDashboardStats();
      renderDashboardProjectsGrid();
      renderCoursesView();
      renderSubjectFilter();
      renderCalendarCourseFilter();
    } else {
      throw new Error("Course API returned " + courseRes.status);
    }

    const assignRes = await fetch("/api/assignments/my-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        email: currentUser.email,
        token: currentUser.token,
        refresh,
      }),
    });

    if (assignRes.ok) {
      const assignData = await assignRes.json();
      rawAssignments = assignData.assignments || [];
    }

    await loadBlockedData();
    renderAllViews();

    if (!refresh && rawAssignments.length === 0 && rawCourses.length > 0) {
      showToast("Fetching assignments from university portal in background...", "info");
      fetch("/api/assignments/sync-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          email: currentUser.email,
          token: currentUser.token,
        }),
      })
      .then(async (res) => {
        if (res.ok) {
          const syncData = await res.json();
          if (syncData.assignments && syncData.assignments.length > 0) {
            rawAssignments = syncData.assignments;
            renderAllViews();
            showToast(`Loaded ${rawAssignments.length} assignments!`, "success");
          }
        }
      })
      .catch((e) => console.warn("Background assignment sync note:", e.message));
    }
  } catch (err) {
    console.error("Backend API note:", err.message);
    const statusEl = document.getElementById("settingsDataSource");
    if (statusEl) statusEl.value = "Connected state note: " + err.message;
    renderAllViews();
  }
}

// Fetches lists of blocked courses and blocked assignments from the backend.
async function loadBlockedData() {
  try {
    const bCourseRes = await fetch(
      `/api/blocked?email=${encodeURIComponent(currentUser.email)}`,
      {
        headers: getAuthHeaders(),
      },
    );
    if (bCourseRes.ok) {
      const bData = await bCourseRes.json();
      blockedCoursesList = bData.blocked || [];
    } else {
      throw new Error("Blocked course API returned " + bCourseRes.status);
    }

    const bAssignRes = await fetch(
      `/api/blocked-assignments?email=${encodeURIComponent(currentUser.email)}`,
      {
        headers: getAuthHeaders(),
      },
    );
    if (bAssignRes.ok) {
      const aData = await bAssignRes.json();
      blockedAssignmentsList = aData.blocked || [];
    } else {
      throw new Error("Blocked assignment API returned " + bAssignRes.status);
    }
  } catch (e) {
    blockedCoursesList = rawCourses.filter((c) => c.is_blocked);
    blockedAssignmentsList = rawAssignments.filter((a) => a.is_blocked);
  }
}

// Switches active view pages and updates navigation highlights and headers.
function navigateTo(pageId, event) {
  if (event) event.preventDefault();

  currentTab = pageId;
  document
    .querySelectorAll(".page-view")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll(".sidebar-nav-item")
    .forEach((el) => el.classList.remove("active"));

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add("active");

  const navItem = document.querySelector(
    `.sidebar-nav-item[data-page="${pageId}"]`,
  );
  if (navItem) navItem.classList.add("active");

  const titles = {
    dashboard: "PROJECTS DASHBOARD",
    tasks: "ASSIGNMENTS",
    courses: "COURSES",
    calendar: "LEARNING CALENDAR",
    blocked: "BLOCKED ITEMS",
    reminders: "REMINDERS & NOTIFICATION LOG",
    settings: "ACCOUNT CONFIGURATION",
    howtouse: "HOW THIS APP WORKS (SIMPLE GUIDE)",
  };

  const titleEl = document.getElementById("headerTitle");
  if (titleEl) titleEl.textContent = titles[pageId] || pageId.toUpperCase();

  const mainContent = document.getElementById("mainContent");
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: "smooth" });

  if (pageId === "reminders") {
    renderRemindersView();
  }
  if (pageId === "settings") {
    loadTelegramSettings();
  }
  if (pageId === "calendar") {
    renderCalendarCourseFilter();
    renderCalendarView();
  }

  closeSidebar();
}

// Opens or closes the mobile sidebar drawer.
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  sidebar.classList.toggle("open");
  overlay.classList.toggle("active");
}

// Closes the mobile sidebar drawer and backdrop overlay.
function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("active");
}

// Returns a Set of course IDs that are currently blocked.
function getBlockedCourseIds() {
  const set = new Set();
  rawCourses.forEach((c) => {
    if (c.is_blocked) set.add(Number(c.colid));
  });
  blockedCoursesList.forEach((c) => {
    if (c.colid !== undefined && c.colid !== null) set.add(Number(c.colid));
  });
  return set;
}

// Returns a Set of assignment keys that are currently blocked.
function getBlockedAssignmentKeys() {
  const set = new Set();
  rawAssignments.forEach((a) => {
    if (a.is_blocked) set.add(`${a.assignment_id}:${a.assignment_type}`);
  });
  blockedAssignmentsList.forEach((a) => {
    if (a.assignment_id) set.add(`${a.assignment_id}:${a.assignment_type}`);
  });
  return set;
}

// Checks whether an assignment or its parent course is blocked.
function isAssignmentBlocked(item) {
  if (!item) return false;
  if (item.is_blocked) return true;
  const blockedCourseIds = getBlockedCourseIds();
  if (item.colid && blockedCourseIds.has(Number(item.colid))) return true;
  const blockedAssignmentKeys = getBlockedAssignmentKeys();
  if (
    blockedAssignmentKeys.has(`${item.assignment_id}:${item.assignment_type}`)
  )
    return true;
  return false;
}

// Checks whether a course is marked as blocked or unavailable.
function isCourseUnavailable(course) {
  if (!course) return true;
  return (
    Boolean(course.is_blocked) ||
    getBlockedCourseIds().has(Number(course.colid))
  );
}

// Formats a Date object into a YYYY-MM-DD date key string.
function dateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Converts a YYYY-MM-DD date string back into a Date object.
function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Returns a Date instance set to midnight for accurate day comparison.
function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

// Returns a new Date object offset by a given number of days.
function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

// Formats a date using localized date string options.
function formatCalendarDate(date, options = {}) {
  return date.toLocaleDateString(undefined, options);
}

// Transforms non-blocked assignments into structured calendar event objects.
function courseCalendarEvents() {
  const blockedIds = getBlockedCourseIds();
  return rawAssignments
    .filter(
      (item) =>
        !isAssignmentBlocked(item) && !blockedIds.has(Number(item.colid)),
    )
    .map((assignment) => {
      const course = rawCourses.find(
        (item) => Number(item.colid) === Number(assignment.colid),
      ) || { colid: assignment.colid, course_name: assignment.course_name };
      const deadline = parseVolpDate(assignment.due_date_raw);
      const completed = isSubmitted(assignment);
      const daysToDeadline = deadline
        ? Math.ceil((startOfDay(deadline) - startOfDay(new Date())) / 86400000)
        : Infinity;
      const status = completed
        ? "completed"
        : daysToDeadline < 0
          ? "overdue"
          : "active";
      return {
        assignment,
        course,
        assignments: [assignment],
        start: deadline ? startOfDay(deadline) : null,
        end: deadline ? startOfDay(deadline) : null,
        deadline,
        progress: completed ? 100 : 0,
        completed,
        status,
        deadlineSoon: false,
      };
    });
}

// Filters calendar events by course selection and completion status.
function calendarVisibleEvents() {
  return courseCalendarEvents().filter((event) => {
    if (
      calendarCourseFilter !== "all" &&
      String(event.course.colid) !== String(calendarCourseFilter)
    )
      return false;
    return calendarStatusFilter === "all"
      || (calendarStatusFilter === "done" && event.completed)
      || (calendarStatusFilter === "not-done" && !event.completed);
  });
}

// Returns an array of date keys covering the event duration.
function calendarEventDates(event) {
  if (!event.start) return [];
  const end = event.end || event.start;
  const dates = [];
  for (
    let date = startOfDay(event.start);
    date <= end && dates.length < 90;
    date = addDays(date, 1)
  )
    dates.push(dateKey(date));
  return dates;
}

// Generates HTML markup for a single calendar event badge.
function courseEventMarkup(event, compact = false) {
  const assignment = event.assignment;
  const course = event.course;
  const statusLabel = event.completed ? "DONE" : "NOT DONE";
  const type =
    assignment.assignment_type ||
    course.category ||
    course.type ||
    course.semester ||
    "ASSIGNMENT";
  const deadline = event.deadline
    ? formatCalendarDate(event.deadline, { month: "short", day: "numeric" })
    : "No deadline";
  return `<button class="calendar-event calendar-event--${event.status}${event.deadlineSoon ? " calendar-event--deadline" : ""}" onclick="openAssignmentDetails(${Number(assignment.assignment_id)}, '${escapeJsString(assignment.assignment_type || "")}')" title="Open ${escapeHtml(assignment.title_html || "Assignment")}">
    <span class="calendar-event-title">${escapeHtml(cleanHtmlTitle(assignment.title_html) || `Assignment #${assignment.assignment_id}`)}</span>
    ${compact ? "" : `<span class="calendar-event-meta">${escapeHtml(course.course_name || "Course")} · ${escapeHtml(type)} · ${deadline}</span>`}
    <span class="calendar-event-status">${statusLabel}</span>
  </button>`;
}

// Generates HTML markup for a single calendar day cell with its events.
function calendarDayMarkup(date, events, outside = false) {
  const key = dateKey(date);
  const today = key === dateKey(new Date());
  const dayEvents = events.filter((event) =>
    calendarEventDates(event).includes(key),
  );
  return `<div class="calendar-day${outside ? " calendar-day--outside" : ""}${today ? " calendar-day--today" : ""}">
    <div class="calendar-day-number"><span>${date.getDate()}</span>${today ? "<b>TODAY</b>" : ""}</div>
    <div class="calendar-day-events">${dayEvents.map((event) => courseEventMarkup(event, false)).join("") || '<span class="calendar-empty-dot"></span>'}</div>
  </div>`;
}

// Renders the full interactive learning calendar grid or agenda view.
function renderCalendarView() {
  const shell = document.getElementById("calendarShell");
  const summary = document.getElementById("calendarSummary");
  const label = document.getElementById("calendarPeriodLabel");
  const upcoming = document.getElementById("calendarUpcoming");
  const unscheduled = document.getElementById("unscheduledSection");
  if (!shell || !label) return;
  const allEvents = calendarVisibleEvents();
  const unscheduledEvents = allEvents.filter((event) => !event.start);
  const datedEvents = allEvents.filter((event) => event.start);
  const availableCount = courseCalendarEvents().length;
  if (summary)
    summary.textContent = `${availableCount} AVAILABLE ASSIGNMENT${availableCount === 1 ? "" : "S"}`;
  if (upcoming) {
    const upcomingEvents = allEvents
      .filter((event) =>
        event.deadline &&
        !event.completed &&
        startOfDay(event.deadline) >= startOfDay(new Date()),
      )
      .sort((first, second) => first.deadline - second.deadline)
      .slice(0, 4);
    upcoming.innerHTML = upcomingEvents.length
      ? `<div class="calendar-upcoming-heading"><span>TOP NOT DONE FROM TODAY</span><small>${upcomingEvents.length} unfinished assignment${upcomingEvents.length === 1 ? "" : "s"}</small></div><div class="calendar-upcoming-list">${upcomingEvents.map((event) => `<button class="calendar-upcoming-card" onclick="openAssignmentDetails(${Number(event.assignment.assignment_id)}, '${escapeJsString(event.assignment.assignment_type || "")}')"><span class="calendar-upcoming-date">${formatCalendarDate(event.deadline, { month: "short", day: "numeric" })}</span><strong>${escapeHtml(cleanHtmlTitle(event.assignment.title_html) || `Assignment #${event.assignment.assignment_id}`)}</strong><small>${escapeHtml(event.course.course_name || event.assignment.course_name || "Course")} · NOT DONE</small></button>`).join("")}</div>`
      : "";
  }
  document
    .querySelectorAll('[id^="calendarView"]')
    .forEach((button) =>
      button.classList.toggle(
        "active",
        button.id ===
          `calendarView${calendarView[0].toUpperCase()}${calendarView.slice(1)}`,
      ),
    );
  if (calendarView === "month") {
    label.textContent = formatCalendarDate(calendarDate, {
      month: "long",
      year: "numeric",
    });
    const first = new Date(
      calendarDate.getFullYear(),
      calendarDate.getMonth(),
      1,
    );
    const gridStart = addDays(first, -first.getDay());
    const days = Array.from({ length: 42 }, (_, index) =>
      addDays(gridStart, index),
    );
    shell.innerHTML = `<div class="calendar-grid calendar-grid--month"><div class="calendar-weekdays">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<span>${day}</span>`).join("")}</div><div class="calendar-days">${days.map((day) => calendarDayMarkup(day, datedEvents, day.getMonth() !== calendarDate.getMonth())).join("")}</div></div>`;
  } else {
    const dayStart =
      calendarView === "week"
        ? addDays(startOfDay(calendarDate), -calendarDate.getDay())
        : startOfDay(calendarDate);
    const count = calendarView === "week" ? 7 : 1;
    const dates = Array.from({ length: count }, (_, index) =>
      addDays(dayStart, index),
    );
    label.textContent =
      calendarView === "week"
        ? `${formatCalendarDate(dates[0], { month: "short", day: "numeric" })} – ${formatCalendarDate(dates[6], { month: "short", day: "numeric", year: "numeric" })}`
        : formatCalendarDate(calendarDate, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          });
    shell.innerHTML = `<div class="calendar-agenda">${dates
      .map(
        (date) =>
          `<section class="agenda-day${dateKey(date) === dateKey(new Date()) ? " agenda-day--today" : ""}"><header><span>${formatCalendarDate(date, { weekday: "short" })}</span><strong>${formatCalendarDate(date, { month: "short", day: "numeric" })}</strong></header><div>${
            datedEvents
              .filter((event) =>
                calendarEventDates(event).includes(dateKey(date)),
              )
              .map((event) => courseEventMarkup(event, true))
              .join("") ||
            '<p class="calendar-empty-state">No scheduled courses</p>'
          }</div></section>`,
      )
      .join("")}</div>`;
  }
  unscheduled.innerHTML = unscheduledEvents.length
    ? `<div class="unscheduled-header"><div><div class="eyebrow">NO DATE ATTACHED</div><h2>Unscheduled assignments</h2></div><span>${unscheduledEvents.length}</span></div><div class="unscheduled-grid">${unscheduledEvents.map((event) => `<button class="unscheduled-card" onclick="openAssignmentDetails(${Number(event.assignment.assignment_id)}, '${escapeJsString(event.assignment.assignment_type || "")}')"><strong>${escapeHtml(cleanHtmlTitle(event.assignment.title_html) || `Assignment #${event.assignment.assignment_id}`)}</strong><span>${escapeHtml(event.course.course_name || event.assignment.course_name || "Course")}</span><small>${event.completed ? "Done" : "Not done"}</small></button>`).join("")}</div>`
    : "";
}

// Changes the active calendar view between month, week, and day.
function setCalendarView(view) {
  calendarView = view;
  renderCalendarView();
}
// Shifts the current calendar view forward or backward by month, week, or day.
function shiftCalendar(amount) {
  if (calendarView === "month")
    calendarDate.setMonth(calendarDate.getMonth() + amount);
  else if (calendarView === "week")
    calendarDate.setDate(calendarDate.getDate() + amount * 7);
  else calendarDate.setDate(calendarDate.getDate() + amount);
  renderCalendarView();
}
// Resets the calendar view to the current date.
function goToCalendarToday() {
  calendarDate = new Date();
  renderCalendarView();
}
// Sets the course filter for the calendar view and updates the display.
function setCalendarFilter(value) {
  calendarCourseFilter = value;
  renderCalendarView();
}
// Sets the status filter for the calendar view and updates the display.
function setCalendarStatusFilter(value, element) {
  calendarStatusFilter = value;
  document
    .querySelectorAll("#calendarStatusFilter .filter-btn")
    .forEach((button) => button.classList.remove("active"));
  if (element) element.classList.add("active");
  renderCalendarView();
}

// Populates the course filter dropdown options in the calendar toolbar.
function renderCalendarCourseFilter() {
  const select = document.getElementById("calendarCourseFilter");
  if (!select) return;
  const courses = rawCourses
    .filter((course) => !isCourseUnavailable(course))
    .sort((a, b) => String(a.course_name).localeCompare(String(b.course_name)));
  select.innerHTML =
    '<option value="all">ALL COURSES</option>' +
    courses
      .map(
        (course) =>
          `<option value="${escapeHtml(course.colid)}">${escapeHtml(course.course_name || course.crsid || `Course ${course.colid}`)}</option>`,
      )
      .join("");
  select.value = courses.some(
    (course) => String(course.colid) === String(calendarCourseFilter),
  )
    ? calendarCourseFilter
    : "all";
}

// Opens the slide-over modal drawer displaying assignment details.
function openAssignmentDetails(assignmentId, assignmentType = "") {
  const event = courseCalendarEvents().find(
    (item) =>
      Number(item.assignment.assignment_id) === Number(assignmentId) &&
      (!assignmentType || item.assignment.assignment_type === assignmentType),
  );
  const overlay = document.getElementById("courseDetailsOverlay");
  const content = document.getElementById("courseDetailsContent");
  if (!event || !overlay || !content) return;
  const assignment = event.assignment;
  const course = event.course;
  const title =
    cleanHtmlTitle(assignment.title_html) ||
    `Assignment #${assignment.assignment_id}`;
  const description =
    assignment.unit_name ||
    "Assignment details from the connected learning platform.";
  content.innerHTML = `<div class="course-detail-kicker">${escapeHtml(assignment.assignment_type || "ASSIGNMENT")} · ${escapeHtml(course.course_name || assignment.course_name || "COURSE")}</div><h2 id="courseDetailsTitle">${escapeHtml(title)}</h2><p class="course-detail-description">${escapeHtml(description)}</p><div class="course-detail-status"><span class="badge badge--${event.completed ? "submitted" : "pending"}">${event.completed ? "DONE" : "NOT DONE"}</span></div><dl class="course-detail-list"><div><dt>COURSE</dt><dd>${escapeHtml(course.course_name || assignment.course_name || "Not provided")}</dd></div><div><dt>TYPE</dt><dd>${escapeHtml(assignment.assignment_type || "Assignment")}</dd></div><div><dt>UNIT</dt><dd>${escapeHtml(assignment.unit_name || "Not provided")}</dd></div><div><dt>DUE DATE</dt><dd>${event.deadline ? escapeHtml(formatCalendarDate(event.deadline, { dateStyle: "medium" })) : "No date provided"}</dd></div><div><dt>ASSIGNMENT ID</dt><dd>#${escapeHtml(assignment.assignment_id)}</dd></div></dl><div class="course-detail-actions"><button class="btn btn--primary course-detail-cta" ${event.deadline ? `onclick="addAssignmentToCalendar(${Number(assignment.assignment_id)}, '${escapeJsString(assignment.assignment_type || "")}')"` : "disabled"}>${event.deadline ? "ADD TO CALENDAR" : "NO DATE TO ADD"} <span>＋</span></button><button class="btn btn--ghost course-detail-cta" onclick="closeCourseDetails(); navigateTo('tasks')">OPEN ASSIGNMENT <span>→</span></button></div>`;
  overlay.classList.add("active");
}

// Generates and triggers download of an .ics calendar file for an assignment.
function addAssignmentToCalendar(assignmentId, assignmentType = "") {
  const assignment = rawAssignments.find(
    (item) =>
      Number(item.assignment_id) === Number(assignmentId) &&
      (!assignmentType || item.assignment_type === assignmentType),
  );
  if (
    !assignment ||
    isAssignmentBlocked(assignment) ||
    !parseVolpDate(assignment.due_date_raw)
  ) {
    showToast("This assignment has no usable date.", "warning");
    return;
  }
  const due = parseVolpDate(assignment.due_date_raw);
  const start = new Date(due.getTime() - 60 * 60 * 1000);
  const toIcsDate = (date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const title =
    cleanHtmlTitle(assignment.title_html) ||
    `Assignment #${assignment.assignment_id}`;
  const course = rawCourses.find(
    (item) => Number(item.colid) === Number(assignment.colid),
  );
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VOLP//Assignment Calendar//EN",
    "BEGIN:VEVENT",
    `UID:volp-assignment-${assignment.assignment_id}-${assignment.assignment_type || "item"}@volp`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(due)}`,
    `SUMMARY:${title.replace(/[\n,;]/g, " ")}`,
    `DESCRIPTION:${String(course?.course_name || assignment.course_name || "Course").replace(/[\n,;]/g, " ")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([ics], { type: "text/calendar;charset=utf-8" }),
  );
  link.download = `assignment-${assignment.assignment_id}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Assignment added to your calendar file.", "success");
}

// Generates an add-to-calendar action button for an assignment item.
function assignmentCalendarButton(item) {
  const date = parseVolpDate(item?.due_date_raw);
  return `<button class="btn btn--ghost btn--sm assignment-calendar-btn" ${date ? `onclick="addAssignmentToCalendar(${Number(item.assignment_id)}, '${escapeJsString(item.assignment_type || "")}')"` : "disabled"} title="${date ? "Add to calendar" : "No date available"}">＋ CALENDAR</button>`;
}

// Closes the assignment detail slide-over drawer.
function closeCourseDetails(event) {
  if (
    !event ||
    event.target === document.getElementById("courseDetailsOverlay")
  )
    document.getElementById("courseDetailsOverlay")?.classList.remove("active");
}

// Filters assignments according to search keywords and re-renders the task view.
function filterTasks() {
  const input = document.getElementById("taskSearchInput");
  currentSearchQuery = input ? input.value.trim().toLowerCase() : "";
  renderTasksView();
}

// Applies a status filter to assignments and updates active filter buttons.
function setStatusFilter(filter, el) {
  currentStatusFilter = filter;
  document
    .querySelectorAll("#statusFilterGroup .filter-btn")
    .forEach((b) => b.classList.remove("active"));
  if (el) el.classList.add("active");
  renderTasksView();
}

// Applies an assignment type filter and updates active filter buttons.
function setTypeFilter(filter, el) {
  currentTypeFilter = filter;
  document
    .querySelectorAll("#typeFilterGroup .filter-btn")
    .forEach((b) => b.classList.remove("active"));
  if (el) el.classList.add("active");
  renderTasksView();
}

// Applies a subject filter to assignments and re-renders the task view.
function setSubjectFilter(filter) {
  currentSubjectFilter = filter || "all";
  renderTasksView();
}

// Populates the subject filter dropdown with active enrolled courses.
function renderSubjectFilter() {
  const select = document.getElementById("subjectFilterSelect");
  if (!select) return;

  const blockedCourseIds = getBlockedCourseIds();
  const activeCourses = rawCourses
    .filter((course) => !blockedCourseIds.has(Number(course.colid)))
    .sort((first, second) =>
      String(first.course_name || "").localeCompare(
        String(second.course_name || ""),
      ),
    );

  if (
    !activeCourses.some(
      (course) => String(course.colid) === String(currentSubjectFilter),
    )
  ) {
    currentSubjectFilter = "all";
  }

  select.innerHTML = '<option value="all">ALL SUBJECTS</option>';
  activeCourses.forEach((course) => {
    const option = document.createElement("option");
    option.value = String(course.colid);
    option.textContent =
      course.course_name || course.crsid || `COURSE ${course.colid}`;
    select.appendChild(option);
  });
  select.value = currentSubjectFilter;
}

// Filters raw assignments by subject, search query, type, and status.
function getFilteredAssignments() {
  const blockedCourseIds = getBlockedCourseIds();

  return rawAssignments.filter((item) => {
    if (item.colid && blockedCourseIds.has(Number(item.colid))) {
      return false;
    }

    if (
      currentSubjectFilter !== "all" &&
      String(item.colid) !== String(currentSubjectFilter)
    ) {
      return false;
    }

    if (currentSearchQuery) {
      const q = currentSearchQuery;
      const rawTitle = item.title_html || "";
      const textTitle = cleanHtmlTitle(rawTitle).toLowerCase();
      const matchTitle =
        textTitle.includes(q) || rawTitle.toLowerCase().includes(q);
      const matchCourse = (item.course_name || "").toLowerCase().includes(q);
      const matchUnit = (item.unit_name || "").toLowerCase().includes(q);
      const matchId = String(item.assignment_id || "")
        .toLowerCase()
        .includes(q);
      const itemType = (item.assignment_type || "").toLowerCase();
      const matchType =
        itemType.replace(/_/g, "-").includes(q) || itemType.includes(q);
      const matchDue = (item.due_date_raw || "").toLowerCase().includes(q);

      if (
        !matchTitle &&
        !matchCourse &&
        !matchUnit &&
        !matchId &&
        !matchType &&
        !matchDue
      ) {
        return false;
      }
    }

    if (currentTypeFilter !== "all") {
      const itemTypeNorm = normalizeType(item.assignment_type);
      const filterTypeNorm = normalizeType(currentTypeFilter);
      if (itemTypeNorm !== filterTypeNorm) {
        return false;
      }
    }

    const submitted = isSubmitted(item);
    const overdue = isAssignmentOverdue(item);

    if (currentStatusFilter === "pending") {
      if (submitted || isAssignmentBlocked(item)) return false;
    } else if (currentStatusFilter === "submitted") {
      if (!submitted) return false;
    } else if (currentStatusFilter === "overdue") {
      if (!overdue) return false;
    }

    return true;
  });
}

// Re-renders all main UI views with current data.
function renderAllViews() {
  renderDashboardStats();
  renderDashboardProjectsGrid();
  renderDashboardRecentTable();
  renderSubjectFilter();
  renderTasksView();
  renderCoursesView();
  renderCalendarCourseFilter();
  renderCalendarView();
  renderBlockManagerView();
  renderRemindersView();
}

// Computes and renders metric counts on the dashboard overview cards.
function renderDashboardStats() {
  const blockedCourseIds = getBlockedCourseIds();
  const activeAssignments = rawAssignments.filter(
    (a) => !blockedCourseIds.has(Number(a.colid)),
  );

  const total = activeAssignments.length;
  const pending = activeAssignments.filter(
    (a) => !isSubmitted(a) && !isAssignmentBlocked(a),
  ).length;
  const submitted = activeAssignments.filter((a) => isSubmitted(a)).length;
  const blocked = blockedCoursesList.length + blockedAssignmentsList.length;

  const totalEl = document.getElementById("statTotalAssignments");
  const pendingEl = document.getElementById("statPendingAssignments");
  const submittedEl = document.getElementById("statSubmittedAssignments");
  const blockedEl = document.getElementById("statBlockedAssignments");

  if (totalEl) totalEl.textContent = total;
  if (pendingEl) pendingEl.textContent = pending;
  if (submittedEl) submittedEl.textContent = submitted;
  if (blockedEl) blockedEl.textContent = blocked;

  const totalSub = document.getElementById("statTotalAssignmentsSub");
  const pendingSub = document.getElementById("statPendingAssignmentsSub");
  const submittedSub = document.getElementById("statSubmittedAssignmentsSub");
  const blockedSub = document.getElementById("statBlockedAssignmentsSub");

  const activeCoursesCount = rawCourses.filter((c) => !c.is_blocked).length;
  if (totalSub) totalSub.textContent = `${activeCoursesCount} ACTIVE COURSES`;
  if (pendingSub) {
    const overdueCount = activeAssignments.filter((a) =>
      isAssignmentOverdue(a),
    ).length;
    pendingSub.textContent =
      overdueCount > 0 ? `${overdueCount} OVERDUE` : "ALL ON SCHEDULE";
  }
  if (submittedSub)
    submittedSub.textContent = `${Math.round(total > 0 ? (submitted / total) * 100 : 0)}% COMPLETION`;
  if (blockedSub)
    blockedSub.textContent = `${blockedCoursesList.length} COURSES · ${blockedAssignmentsList.length} TASKS`;
}

// Renders enrolled course cards into the dashboard project grid.
function renderDashboardProjectsGrid() {
  const container = document.getElementById("dashboardProjectsGrid");
  if (!container) return;

  container.innerHTML = "";
  const displayCourses = rawCourses.slice(0, 6);

  if (displayCourses.length === 0) {
    container.innerHTML =
      '<div style="color:var(--muted);font-family:var(--font-mono);font-size:12px;padding:24px;">NO ENROLLED COURSES FOUND</div>';
    return;
  }

  displayCourses.forEach((course) => {
    const courseAssignments = rawAssignments.filter(
      (a) => Number(a.colid) === Number(course.colid),
    );
    const pendingCount = courseAssignments.filter(
      (a) => !isSubmitted(a),
    ).length;

    const card = document.createElement("div");
    card.className = "project-card";
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-title">${escapeHtml(course.course_name)}</div>
        <ul class="project-card-meta-list">
          <li><span class="meta-key">Course Code:</span> ${escapeHtml(course.crsid ? String(course.crsid) : "COLID #" + course.colid)}</li>
          <li><span class="meta-key">Semester:</span> ${escapeHtml(course.semester || "N/A")}</li>
          <li><span class="meta-key">Academic Year:</span> ${escapeHtml(course.academic_year || "N/A")}</li>
          <li><span class="meta-key">Status:</span> ${course.is_blocked ? '<span style="color:var(--danger)">BLOCKED / MUTED</span>' : '<span style="color:var(--success)">ACTIVE</span>'}</li>
          <li><span class="meta-key">Assignments:</span> ${courseAssignments.length} total (${pendingCount} pending)</li>
        </ul>
      </div>
      <div class="project-card-footer">
        <span class="code-tag code-tag--lime">COLID #${course.colid}</span>
        <button class="btn btn--sm ${course.is_blocked ? "btn--success" : "btn--ghost"}" onclick="toggleCourseBlock(${course.colid}, '${escapeJsString(course.course_name)}', ${Boolean(course.is_blocked)})">
          ${course.is_blocked ? "UNBLOCK" : "BLOCK"}
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Renders urgent upcoming deadlines into the dashboard table.
function renderDashboardRecentTable() {
  const tbody = document.getElementById("dashboardRecentTableBody");
  if (!tbody) return;

  tbody.innerHTML = "";
  const blockedCourseIds = getBlockedCourseIds();
  const pendingItems = rawAssignments
    .filter(
      (a) =>
        !blockedCourseIds.has(Number(a.colid)) &&
        !isSubmitted(a) &&
        !isAssignmentBlocked(a),
    )
    .slice(0, 5);

  if (pendingItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px;font-family:var(--font-mono);font-size:12px;">NO PENDING DEADLINES FOUND</td></tr>`;
    return;
  }

  pendingItems.forEach((item) => {
    const tr = document.createElement("tr");
    const typeNorm = normalizeType(item.assignment_type);
    const typeLabel = typeNorm === "HANDS_ON" ? "HANDS-ON" : "SUBJECTIVE";
    const typeBadgeClass =
      typeNorm === "HANDS_ON"
        ? "type-badge--handson"
        : "type-badge--subjective";
    const overdue = isAssignmentOverdue(item);
    const cleanTitle =
      cleanHtmlTitle(item.title_html) || "Assignment #" + item.assignment_id;

    tr.innerHTML = `
      <td><span class="type-badge ${typeBadgeClass}">${typeLabel}</span></td>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(item.course_name || "Course")}</span></td>
      <td>
        <div class="assignment-title">${escapeHtml(cleanTitle)}</div>
        <div class="assignment-sub">${item.unit_name ? escapeHtml(item.unit_name) + " · " : ""}ID: #${item.assignment_id}</div>
      </td>
      <td>
        <span class="meta-text" style="color:${overdue ? "var(--danger)" : "var(--warning)"};">
          ${overdue ? "⚠ " : ""}${escapeHtml(item.due_date_raw || "Pending")}
        </span>
      </td>
      <td>
        <span class="badge ${overdue ? "badge--overdue" : "badge--pending"}">
          ${overdue ? "OVERDUE" : "PENDING"}
        </span>
      </td>
      <td style="text-align:right">
        <button class="btn btn--ghost btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${escapeJsString(item.assignment_type)}', '${escapeJsString(item.course_name)}', '${escapeJsString(cleanTitle)}', ${Boolean(item.is_blocked)})">
          ${item.is_blocked ? "RESTORE" : "BLOCK"}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Toggles assignments view between Kanban board and table layout.
function switchTaskView(mode) {
  currentTaskView = mode;
  document
    .getElementById("viewToggleKanban")
    .classList.toggle("active", mode === "kanban");
  document
    .getElementById("viewToggleTable")
    .classList.toggle("active", mode === "table");

  document.getElementById("tasksKanbanView").style.display =
    mode === "kanban" ? "grid" : "none";
  document.getElementById("tasksTableView").style.display =
    mode === "table" ? "block" : "none";
  renderTasksView();
}

// Renders either the Kanban board or data table view based on user selection.
function renderTasksView() {
  const filtered = getFilteredAssignments();

  if (currentTaskView === "kanban") {
    renderKanbanBoard(filtered);
  } else {
    renderTasksTable(filtered);
  }
}

// Populates the Kanban board columns with categorized assignment cards.
function renderKanbanBoard(items) {
  const todoCol = document.getElementById("kanbanColTodo");
  const progressCol = document.getElementById("kanbanColProgress");
  const doneCol = document.getElementById("kanbanColDone");

  todoCol.innerHTML = "";
  progressCol.innerHTML = "";
  doneCol.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "kanban-card";

    const typeNorm = normalizeType(item.assignment_type);
    const typeLabel = typeNorm === "HANDS_ON" ? "HANDS-ON" : "SUBJECTIVE";
    const typeBadgeClass =
      typeNorm === "HANDS_ON"
        ? "type-badge--handson"
        : "type-badge--subjective";
    const submitted = isSubmitted(item);
    const overdue = isAssignmentOverdue(item);
    const cleanTitle =
      cleanHtmlTitle(item.title_html) || "Assignment #" + item.assignment_id;

    card.innerHTML = `
      <div class="kanban-card-top">
        <span class="type-badge ${typeBadgeClass}">${typeLabel}</span>
        <span class="kanban-card-course">${escapeHtml(item.course_name || "Course")}</span>
      </div>
      <div class="kanban-card-title" title="${escapeHtml(cleanTitle)}" style="margin-top: 8px;">
        ${escapeHtml(cleanTitle)}
      </div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:6px;">
        ${item.unit_name ? escapeHtml(item.unit_name) + " · " : ""}ID: #${item.assignment_id}
      </div>
      <div style="font-family:var(--font-mono);font-size:10px;margin-top:8px;display:flex;align-items:center;justify-content:space-between;">
        <span style="color: ${overdue ? "var(--danger)" : "var(--text-secondary)"};">
          ${overdue ? "⚠ OVERDUE: " : "Due: "}${escapeHtml(item.due_date_raw || "No Deadline")}
        </span>
        <span class="badge ${submitted ? "badge--submitted" : item.is_blocked ? "badge--blocked" : overdue ? "badge--overdue" : "badge--pending"}">
          ${submitted ? "SUBMITTED" : item.is_blocked ? "BLOCKED" : overdue ? "OVERDUE" : "PENDING"}
        </span>
      </div>
      <div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border);display:flex;gap:6px;justify-content:flex-end;">
        ${assignmentCalendarButton(item)}
        <button class="btn btn--ghost btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${escapeJsString(item.assignment_type)}', '${escapeJsString(item.course_name)}', '${escapeJsString(cleanTitle)}', ${Boolean(item.is_blocked)})">
          ${item.is_blocked ? "RESTORE" : "BLOCK"}
        </button>
      </div>
    `;

    if (submitted) {
      doneCol.appendChild(card);
    } else if (overdue) {
      todoCol.appendChild(card);
    } else {
      progressCol.appendChild(card);
    }
  });

  if (todoCol.children.length === 0)
    todoCol.innerHTML =
      '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;text-align:center;">NO OVERDUE ASSIGNMENTS</div>';
  if (progressCol.children.length === 0)
    progressCol.innerHTML =
      '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;text-align:center;">NO PENDING ASSIGNMENTS</div>';
  if (doneCol.children.length === 0)
    doneCol.innerHTML =
      '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;text-align:center;">NO COMPLETED ASSIGNMENTS</div>';
}

// Populates the assignments data table view with filtered assignments.
function renderTasksTable(items) {
  const tbody = document.getElementById("tasksFullTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px;font-family:var(--font-mono);font-size:12px;">NO MATCHING ASSIGNMENTS FOUND</td></tr>`;
    return;
  }

  items.forEach((item) => {
    const tr = document.createElement("tr");
    const typeNorm = normalizeType(item.assignment_type);
    const typeLabel = typeNorm === "HANDS_ON" ? "HANDS-ON" : "SUBJECTIVE";
    const typeBadgeClass =
      typeNorm === "HANDS_ON"
        ? "type-badge--handson"
        : "type-badge--subjective";
    const submitted = isSubmitted(item);
    const overdue = isAssignmentOverdue(item);
    const cleanTitle =
      cleanHtmlTitle(item.title_html) || "Assignment #" + item.assignment_id;

    tr.innerHTML = `
      <td><span class="type-badge ${typeBadgeClass}">${typeLabel}</span></td>
      <td>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(item.course_name || "Course")}</span>
      </td>
      <td>
        <div class="assignment-title" title="${escapeHtml(cleanTitle)}">${escapeHtml(cleanTitle)}</div>
        <div class="assignment-sub">${item.unit_name ? escapeHtml(item.unit_name) + " · " : ""}ID: #${item.assignment_id}</div>
      </td>
      <td>
        <span class="meta-text" style="color: ${overdue ? "var(--danger)" : "var(--text-secondary)"};">
          ${overdue ? "⚠ " : ""}${escapeHtml(item.due_date_raw || "No Deadline")}
        </span>
      </td>
      <td>
        <span class="badge ${submitted ? "badge--submitted" : overdue ? "badge--overdue" : item.is_blocked ? "badge--blocked" : "badge--pending"}">
          ${submitted ? "SUBMITTED" : overdue ? "OVERDUE" : item.is_blocked ? "BLOCKED" : "PENDING"}
        </span>
      </td>
      <td style="text-align:right">
        ${assignmentCalendarButton(item)}
        <button class="btn btn--ghost btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${escapeJsString(item.assignment_type)}', '${escapeJsString(item.course_name)}', '${escapeJsString(cleanTitle)}', ${Boolean(item.is_blocked)})">
          ${item.is_blocked ? "RESTORE" : "BLOCK"}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Renders all enrolled courses into the courses grid view.
function renderCoursesView() {
  const grid = document.getElementById("allCoursesGrid");
  if (!grid) return;

  grid.innerHTML = "";
  const metaCount = document.getElementById("coursesCountMeta");
  if (metaCount)
    metaCount.textContent = `${rawCourses.length} ENROLLED COURSES`;

  if (rawCourses.length === 0) {
    grid.innerHTML =
      '<div style="color:var(--muted);font-family:var(--font-mono);font-size:12px;padding:24px;">NO ENROLLED COURSES FOUND</div>';
    return;
  }

  rawCourses.forEach((course) => {
    const courseAssignments = rawAssignments.filter(
      (a) => Number(a.colid) === Number(course.colid),
    );
    const pendingCount = courseAssignments.filter(
      (a) => !isSubmitted(a),
    ).length;

    const card = document.createElement("div");
    card.className = "project-card";
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-title">${escapeHtml(course.course_name)}</div>
        <ul class="project-card-meta-list">
          <li><span class="meta-key">Course Code:</span> ${escapeHtml(course.crsid ? String(course.crsid) : "COLID #" + course.colid)}</li>
          <li><span class="meta-key">Semester:</span> ${escapeHtml(course.semester || "N/A")}</li>
          <li><span class="meta-key">Academic Year:</span> ${escapeHtml(course.academic_year || "N/A")}</li>
          <li><span class="meta-key">Status:</span> ${course.is_blocked ? '<span style="color:var(--danger)">MUTED / BLOCKED</span>' : '<span style="color:var(--success)">ACTIVE</span>'}</li>
          <li><span class="meta-key">Assignments:</span> ${courseAssignments.length} total (${pendingCount} pending)</li>
        </ul>
      </div>
      <div class="project-card-footer">
        <span class="code-tag code-tag--lime">COLID #${course.colid}</span>
        <button class="btn btn--sm ${course.is_blocked ? "btn--success" : "btn--danger"}" onclick="toggleCourseBlock(${course.colid}, '${escapeJsString(course.course_name)}', ${Boolean(course.is_blocked)})">
          ${course.is_blocked ? "RESTORE COURSE" : "BLOCK COURSE"}
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Renders blocked courses and blocked assignments in the block manager tables.
function renderBlockManagerView() {
  const cTbody = document.getElementById("blockedCoursesTableBody");
  if (cTbody) {
    cTbody.innerHTML = "";
    const blockedC = blockedCoursesList;

    if (blockedC.length === 0) {
      cTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px;font-family:var(--font-mono);font-size:11px;">NO BLOCKED COURSES</td></tr>`;
    } else {
      blockedC.forEach((c) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(c.crsid ? String(c.crsid) : "COLID #" + c.colid)}</span></td>
          <td><strong>${escapeHtml(c.course_name)}</strong></td>
          <td><span class="meta-text">${escapeHtml(c.blocked_at || "ACTIVE BLOCK")}</span></td>
          <td style="text-align:right">
            <button class="btn btn--success btn--sm" onclick="toggleCourseBlock(${c.colid}, '${escapeJsString(c.course_name)}', true)">RESTORE</button>
          </td>
        `;
        cTbody.appendChild(tr);
      });
    }
  }

  const aTbody = document.getElementById("blockedAssignmentsTableBody");
  if (aTbody) {
    aTbody.innerHTML = "";
    const blockedA = blockedAssignmentsList;

    if (blockedA.length === 0) {
      aTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:18px;font-family:var(--font-mono);font-size:11px;">NO BLOCKED ASSIGNMENTS</td></tr>`;
    } else {
      blockedA.forEach((a) => {
        const tr = document.createElement("tr");
        const cleanTitle =
          cleanHtmlTitle(a.title_html || a.title_hint) ||
          "Assignment #" + a.assignment_id;
        tr.innerHTML = `
          <td><span class="code-tag code-tag--cyan">#${a.assignment_id}</span></td>
          <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(a.course_name || "Course")}</span></td>
          <td>${escapeHtml(cleanTitle)}</td>
          <td><span class="meta-text">${escapeHtml(a.blocked_at || "RECENT")}</span></td>
          <td style="text-align:right">
            <button class="btn btn--success btn--sm" onclick="toggleAssignmentBlock(${a.assignment_id}, '${escapeJsString(a.assignment_type)}', '${escapeJsString(a.course_name)}', '${escapeJsString(cleanTitle)}', true)">RESTORE</button>
          </td>
        `;
        aTbody.appendChild(tr);
      });
    }
  }
}

// Renders the log of automated and manual reminder dispatch events.
function renderRemindersView() {
  const list = document.getElementById("remindersTimelineList");
  if (!list) return;

  const blockedCourseIds = getBlockedCourseIds();
  const pendingUnblocked = rawAssignments.filter(
    (a) =>
      !blockedCourseIds.has(Number(a.colid)) &&
      !isSubmitted(a) &&
      !isAssignmentBlocked(a),
  ).length;
  const blockedCount =
    blockedCoursesList.length + blockedAssignmentsList.length;

  const chatIdDisplay = currentUser?.telegram_chat_id ? `CHAT ID: ${currentUser.telegram_chat_id}` : "CHAT ID NOT SET (CLICK SETTINGS)";
  let html = "";

  if (!currentUser?.telegram_chat_id) {
    html += `
      <div class="note-card" style="border-left: 4px solid var(--warning); background: rgba(240, 187, 65, 0.08);">
        <div class="note-card-header">
          <span style="color: var(--warning); font-weight: 700;">⚠️ TELEGRAM CHAT ID NOT CONFIGURED</span>
          <span class="badge badge--pending">ACTION NEEDED</span>
        </div>
        <div class="note-card-body" style="font-size: 13px;">
          You haven't connected your Telegram Chat ID yet! To receive automatic 8:00 PM alerts on your phone, enter your Telegram Chat ID in <strong>Settings</strong> or test an alert below.
        </div>
        <div class="note-card-footer" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <button class="btn btn--primary btn--sm" onclick="navigateTo('settings')">GO TO SETTINGS TO ENTER CHAT ID</button>
          <span style="font-size: 11px; color: var(--muted);">Tip: Message <a href="https://t.me/userinfobot" target="_blank" style="color: var(--accent); text-decoration: underline;">@userinfobot</a> on Telegram to find your Chat ID.</span>
        </div>
      </div>
    `;
  }

  const botUser = window.telegramBotUsername || "volp_remainder_bot";
  html += `
    <div class="note-card">
      <div class="note-card-header">
        <span>DAILY TELEGRAM REMINDER CONFIGURATION</span>
        <span class="badge ${currentUser?.telegram_chat_id ? "badge--submitted" : "badge--pending"}">${currentUser?.telegram_chat_id ? "ACTIVE BOT CRON" : "AWAITING CHAT ID"}</span>
      </div>
      <div class="note-card-body">
        Daily cron is scheduled for <strong>8:00 PM ("0 20 * * *")</strong>. It checks all active enrolled courses, aggregates unsubmitted assignments, omits blocked items, and dispatches a consolidated digest directly via Telegram Bot.
        <div style="margin-top: 10px; font-size: 11px; color: var(--text-secondary); background: rgba(0, 136, 204, 0.08); padding: 8px 12px; border-radius: 4px; border-left: 2px solid #0088cc;">
          ℹ️ <strong>Telegram Requirement:</strong> Open <a href="https://t.me/${botUser}" target="_blank" style="color: #0088cc; font-weight: 700; text-decoration: underline;">@${botUser}</a> in Telegram and click <strong>START</strong> (/start) so Telegram permits messages.
        </div>
      </div>
      <div class="note-card-footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <span>RECIPIENT: ${escapeHtml(chatIdDisplay)} | PENDING TO SEND: ${pendingUnblocked} | MUTED ITEMS: ${blockedCount}</span>
        <a id="remindersBotLink" href="https://t.me/${botUser}" target="_blank" class="btn btn--ghost btn--sm" style="color: #0088cc;">
          OPEN @${botUser} IN TELEGRAM ↗
        </a>
      </div>
    </div>
  `;

  if (window.reminderLogs && window.reminderLogs.length > 0) {
    window.reminderLogs.forEach((log) => {
      html += `
        <div class="note-card">
          <div class="note-card-header">
            <span>${escapeHtml(log.title)} — ${escapeHtml(log.time)}</span>
            <span class="badge ${log.success ? "badge--submitted" : "badge--pending"}">${log.success ? "DELIVERED" : "LOGGED"}</span>
          </div>
          <div class="note-card-body">${escapeHtml(log.message)}</div>
          <div class="note-card-footer">CHANNEL: TELEGRAM PUSH | RECIPIENT: ${escapeHtml(currentUser?.telegram_chat_id || currentUser?.email || "N/A")} | STATUS: PROCESSED</div>
        </div>
      `;
    });
  }

  list.innerHTML = html;
}

// Displays the full-screen live sync loading overlay.
function showSyncProgress() {
  const overlay = document.getElementById("syncOverlay");
  if (!overlay) return;
  overlay.classList.add("active");
  overlay.setAttribute("aria-hidden", "false");
}

// Hides the full-screen live sync loading overlay.
function hideSyncProgress() {
  const overlay = document.getElementById("syncOverlay");
  if (!overlay) return;
  overlay.classList.remove("active");
  overlay.setAttribute("aria-hidden", "true");
}

// Returns a Promise that rejects after a 5-minute timeout.
function createSyncTimeout() {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error("SYNC_TIMEOUT")), 5 * 60 * 1000);
  });
}

// Initiates a live sync from the university portal with progress overlay.
async function syncNow() {
  const btn = document.getElementById("syncBtn");
  const label = document.getElementById("syncBtnLabel");

  if (btn) btn.disabled = true;
  if (label) label.textContent = "SYNCING VOLP...";
  showSyncProgress();

  try {
    await Promise.race([loadAppData(true), createSyncTimeout()]);
    showToast("VOLP Live Sync completed successfully", "success");
    const syncStatusLabel = document.getElementById("lastSyncStatusLabel");
    if (syncStatusLabel) {
      syncStatusLabel.textContent = `LAST SYNC: JUST NOW (${new Date().toLocaleTimeString()})`;
    }
  } catch (err) {
    if (err.message === "SYNC_TIMEOUT") {
      showToast(
        "Sync is taking longer than expected. Refresh the page after 5 minutes and try again.",
        "warning",
      );
    } else {
      showToast("Sync updated from cached state", "warning");
    }
  } finally {
    hideSyncProgress();
    if (btn) btn.disabled = false;
    if (label) label.textContent = "SYNC VOLP";
  }
}

// Loads Telegram bot configuration and current user's chat ID into Settings.
async function loadTelegramSettings() {
  const input = document.getElementById("settingsTelegramChatId");
  if (input && currentUser?.telegram_chat_id) {
    input.value = currentUser.telegram_chat_id;
  }

  try {
    const res = await fetch("/api/auth/telegram-config");
    if (res.ok) {
      const data = await res.json();
      if (data.bot?.configured && data.bot.botUsername) {
        window.telegramBotUsername = data.bot.botUsername;
        const link = document.getElementById("openTelegramBotLink");
        const hint = document.getElementById("telegramBotStatusHint");
        if (link) {
          link.href = `https://t.me/${data.bot.botUsername}`;
          link.style.display = "inline-flex";
          link.textContent = `OPEN @${data.bot.botUsername} ↗`;
        }
        if (hint) {
          hint.textContent = `CONNECTED TO BOT: @${data.bot.botUsername}`;
          hint.style.color = "var(--accent)";
        }
        const remindersLink = document.getElementById("remindersBotLink");
        if (remindersLink) {
          remindersLink.href = `https://t.me/${data.bot.botUsername}`;
          remindersLink.textContent = `OPEN @${data.bot.botUsername} IN TELEGRAM ↗`;
        }
      }
    }
  } catch (_) {}
}

// Saves user's Telegram Chat ID to the database.
async function saveTelegramChatId() {
  const input = document.getElementById("settingsTelegramChatId");
  const btn = document.getElementById("saveTelegramBtn");
  if (!input) return;
  const chatId = input.value.trim();
  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/auth/telegram-chat-id", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        email: currentUser.email,
        token: currentUser.token,
        telegram_chat_id: chatId,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      currentUser.telegram_chat_id = chatId;
      localStorage.setItem("volp_user", JSON.stringify(currentUser));
      showToast("Telegram Chat ID saved successfully!", "success");
    } else {
      throw new Error(data.error || "Failed to save Chat ID");
    }
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Manually triggers the 8 PM reminder Telegram simulation and logs the result.
async function triggerReminder() {
  const btn = document.getElementById("reminderBtn");
  const pageBtn = document.getElementById("triggerReminderPageBtn");
  if (btn) btn.disabled = true;
  if (pageBtn) pageBtn.disabled = true;
  showToast("Dispatching 8 PM Telegram Assignment Alert...", "info");

  try {
    const res = await fetch("/api/assignments/trigger-8pm-reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        email: currentUser.email,
        token: currentUser.token,
      }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || "8 PM Telegram alert dispatched!", "success");
      if (!window.reminderLogs) window.reminderLogs = [];
      window.reminderLogs.unshift({
        title: "MANUAL 8 PM TELEGRAM DISPATCH",
        message:
          data.message ||
          `Dispatched 8 PM Telegram assignment alert for ${currentUser.email}`,
        time: new Date().toLocaleTimeString(),
        success: true,
      });
      renderRemindersView();
    } else {
      throw new Error(data.error || "Server error");
    }
  } catch (e) {
    showToast("8 PM Reminder: " + e.message, "info");
    if (!window.reminderLogs) window.reminderLogs = [];
    window.reminderLogs.unshift({
      title: "MANUAL 8 PM TELEGRAM DISPATCH",
      message: `Trigger executed for ${currentUser.email}: ${e.message}`,
      time: new Date().toLocaleTimeString(),
      success: false,
    });
    renderRemindersView();
  } finally {
    if (btn) btn.disabled = false;
    if (pageBtn) pageBtn.disabled = false;
  }
}

// Prompts confirmation and toggles the blocked status of a course.
async function toggleCourseBlock(colid, courseName, currentlyBlocked) {
  const actionText = currentlyBlocked ? "unblock" : "block";

  openModal(
    `${actionText.toUpperCase()} COURSE`,
    `Are you sure you want to ${actionText} "${courseName}"? ${currentlyBlocked ? "It will reappear in daily reminders." : "All assignments for this course will be omitted from 8 PM Telegram alerts."}`,
    async () => {
      try {
        const response = await fetch("/api/blocked", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            email: currentUser.email,
            colid,
            course_name: courseName,
            is_blocked: !currentlyBlocked,
          }),
        });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
      } catch (e) {
        console.warn("Course block request failed:", e.message);
        showToast(`Course ${actionText} failed: ${e.message}`, "error");
        return;
      }

      const c = rawCourses.find((item) => Number(item.colid) === Number(colid));
      if (c) c.is_blocked = !currentlyBlocked;
      await loadBlockedData();

      if (currentUser?.token) {
        try {
          const assignRes = await fetch("/api/assignments/my-assignments", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getAuthHeaders(),
            },
            body: JSON.stringify({
              email: currentUser.email,
              token: currentUser.token,
              refresh: false,
            }),
          });
          if (assignRes.ok) {
            const assignData = await assignRes.json();
            rawAssignments = assignData.assignments || [];
          }
        } catch (e) {
          console.warn(
            "Could not re-sync assignments after toggling course block:",
            e.message,
          );
        }
      }

      showToast(
        `Course "${courseName}" ${actionText}ed successfully`,
        "success",
      );
      renderAllViews();
    },
  );
}

// Prompts confirmation and toggles the blocked status of an assignment.
async function toggleAssignmentBlock(
  assignmentId,
  assignmentType,
  courseName,
  titleHint,
  currentlyBlocked,
) {
  const actionText = currentlyBlocked ? "unblock" : "block";

  openModal(
    `${actionText.toUpperCase()} ASSIGNMENT`,
    `Are you sure you want to ${actionText} "${titleHint || "Assignment #" + assignmentId}"?`,
    async () => {
      try {
        const response = await fetch("/api/blocked-assignments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            email: currentUser.email,
            assignment_id: assignmentId,
            assignment_type: assignmentType,
            course_name: courseName,
            title_hint: titleHint,
            is_blocked: !currentlyBlocked,
          }),
        });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
      } catch (e) {
        console.warn("Assignment block request failed:", e.message);
        showToast(`Assignment ${actionText} failed: ${e.message}`, "error");
        return;
      }

      const a = rawAssignments.find(
        (item) => Number(item.assignment_id) === Number(assignmentId),
      );
      if (a) a.is_blocked = !currentlyBlocked;
      await loadBlockedData();

      showToast(
        `Assignment #${assignmentId} ${actionText}ed successfully`,
        "success",
      );
      renderAllViews();
    },
  );
}

// Opens the confirmation modal dialog with customizable title and action callback.
function openModal(title, body, confirmCallback) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").textContent = body;
  pendingModalAction = confirmCallback;
  document.getElementById("modalOverlay").classList.add("active");
}

// Closes the confirmation modal dialog.
function closeModal() {
  document.getElementById("modalOverlay").classList.remove("active");
  pendingModalAction = null;
}

// Executes the pending confirmation action callback and closes the modal.
function confirmModal() {
  if (typeof pendingModalAction === "function") {
    pendingModalAction();
  }
  closeModal();
}

// Displays a transient notification toast banner.
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <span style="cursor:pointer;margin-left:12px;opacity:0.6;" onclick="this.parentElement.remove()">✕</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.2s ease";
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// Escapes HTML characters in strings to prevent XSS.
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Escapes quotation marks and slashes for safe inline JavaScript strings.
function escapeJsString(str) {
  return escapeHtml(str)
    .replace(/\\/g, "\\\\")
    .replace(/&#039;/g, "\\'");
}

let currentTourStep = 0;

const TOUR_STEPS = [
  {
    step: 0,
    kicker: "01 / EASY & SAFE SIGN-IN",
    title: "Log in Safely Once with Your Existing College Account",
    narrative: "No complicated setup! Just enter your normal university portal email and password. The app connects directly to your college system, verifies your account, and safely remembers your session so you don't have to keep signing in every day.",
    points: [
      "100% Private & Safe: Your password is never stored or shared anywhere.",
      "One-Time Login: Stay signed in across visits without repeatedly typing passwords.",
      "Always Ready: Even if the college website is slow, your saved assignments remain visible."
    ],
    protip: "Helpful Tip: If you ever change your university password, just click 'Sign Out' in the top right and log in once with your new password.",
    actionLabel: "View Account Info",
    actionFn: () => { closeInteractiveTour(); navigateTo("settings"); },
    renderVisual: () => `
      <div class="pipeline-diagram">
        <div class="pipeline-node active-glow">
          <div class="pnode-left">
            <span class="pnode-icon">👤</span>
            <div>
              <div class="pnode-title">You Sign In Once</div>
              <div class="pnode-sub">Normal College Login</div>
            </div>
          </div>
          <span class="pnode-tag pnode-tag--secure">Fast & Safe</span>
        </div>
        <div class="pipeline-arrow">▼ Verifies Directly With</div>
        <div class="pipeline-node">
          <div class="pnode-left">
            <span class="pnode-icon">🏫</span>
            <div>
              <div class="pnode-title">College Portal</div>
              <div class="pnode-sub">Official University Website</div>
            </div>
          </div>
          <span class="pnode-tag pnode-tag--secure">Verified</span>
        </div>
        <div class="pipeline-arrow">▼ Safely Remembers Session</div>
        <div class="pipeline-node">
          <div class="pnode-left">
            <span class="pnode-icon">🔒</span>
            <div>
              <div class="pnode-title">Ready on Your Device</div>
              <div class="pnode-sub">Zero Password Storage</div>
            </div>
          </div>
          <span class="pnode-tag pnode-tag--cron">Private</span>
        </div>
      </div>
    `
  },
  {
    step: 1,
    kicker: "02 / 1-CLICK AUTO REFRESH",
    title: "Gathers Homework from All 16+ Subjects in 1 Click",
    narrative: "In the college portal, finding homework requires clicking into every single subject, chapter, and unit one by one. Clicking the green 'SYNC VOLP' button checks all your subjects automatically and brings all your assignments together into one tidy place.",
    points: [
      "Finds Everything: Gathers written questions, lab assignments, coding practicals & presentation uploads.",
      "Knows What's Done: Automatically recognizes whether you already submitted your file or if it's still pending.",
      "Clear Deadlines: Shows the exact due date and maximum marks for every task."
    ],
    protip: "Helpful Tip: Click 'SYNC VOLP' in the top right anytime your teacher assigns new homework or after you upload your work on the college site.",
    actionLabel: "Click to Refresh Work Now",
    actionFn: () => { closeInteractiveTour(); syncNow(); },
    renderVisual: () => `
      <div class="discovery-branches-box">
        <div class="discovery-root-pill">
          <span>🔄 Checks All 16+ Subjects at Once</span>
        </div>
        <div class="discovery-branches-grid">
          <div class="branch-card branch-card--subj">
            <div class="branch-badge branch-badge--subj">THEORY HOMEWORK</div>
            <div class="branch-name">Written Questions</div>
            <div class="branch-desc">Essay prompts, unit homework, and short answer submissions.</div>
          </div>
          <div class="branch-card branch-card--hands">
            <div class="branch-badge branch-badge--hands">LAB & PRACTICALS</div>
            <div class="branch-name">Projects & Files</div>
            <div class="branch-desc">Lab code, practical uploads, slide decks & presentations.</div>
          </div>
        </div>
      </div>
    `
  },
  {
    step: 2,
    kicker: "03 / TRACK YOUR WORK",
    title: "See Pending Homework, Done Tasks & Calendar View",
    narrative: "Stop keeping messy notebook reminders. Every assignment is clearly color-coded so you know what requires urgent attention, what can wait, and what you've already completed. You can also view all deadlines on a monthly calendar!",
    points: [
      "Color-Coded Status: Green for completed work, yellow/red for pending work with close deadlines.",
      "Quick Filters: Filter by any subject or search by keyword in under a second.",
      "Visual Calendar: See your entire month laid out like a personal study planner."
    ],
    protip: "Helpful Tip: Click on any assignment card to view the teacher's full prompt, your uploaded file name, and submission time.",
    actionLabel: "Open Assignments Page",
    actionFn: () => { closeInteractiveTour(); navigateTo("tasks"); },
    renderVisual: () => `
      <div class="mock-assignment-preview">
        <div class="preview-tags-row">
          <span class="preview-course-tag">Operating Systems</span>
          <span class="preview-status-tag">NEEDS ACTION</span>
        </div>
        <div class="preview-title">Unit 3: Process Scheduling Analysis & Lab Report</div>
        <div class="preview-meta-row">
          <span>📅 Due in 2 Days (Thursday)</span>
          <span>⚖️ 10 Marks</span>
          <span>🗂️ Unit 3</span>
        </div>
      </div>
    `
  },
  {
    step: 3,
    kicker: "04 / ZERO CLUTTER",
    title: "Silence Old Semesters or Extra Subjects (Muting)",
    narrative: "Have subjects from an earlier semester or elective labs you don't need alerts for? Click 'Block' to silence them. They stay safely on your official college portal, but won't clutter your dashboard or spam your phone with notifications.",
    points: [
      "Declutter Your View: Muted subjects disappear from your daily homework board.",
      "Silence Telegram Alerts: Muted subjects won't generate daily reminder alerts.",
      "Easy to Un-mute: Review or restore any muted subject anytime in the 'BLOCKED ITEMS' tab."
    ],
    protip: "Helpful Tip: Go to the 'COURSES' tab to mute any past courses you've already passed so your active view stays clean.",
    actionLabel: "View Blocked Items Tab",
    actionFn: () => { closeInteractiveTour(); navigateTo("blocked"); },
    renderVisual: () => `
      <div class="mock-block-interactive">
        <div class="mock-course-row">
          <div class="mock-row-left">
            <div class="mock-row-title">Active Semester Subjects</div>
            <div class="mock-row-sub">Current Subjects • Reminders Active</div>
          </div>
          <span class="mock-block-pill mock-block-pill--ok">ACTIVE IN DAILY LIST</span>
        </div>
        <div class="mock-course-row is-muted">
          <div class="mock-row-left">
            <div class="mock-row-title">Previous Finished Lab</div>
            <div class="mock-row-sub">Already Done • Muted from Screen</div>
          </div>
          <span class="mock-block-pill mock-block-pill--active">🔇 MUTED</span>
        </div>
      </div>
    `
  },
  {
    step: 4,
    kicker: "05 / EVENING REMINDERS",
    title: "Automatic 8:00 PM Alert Directly to Your Telegram",
    narrative: "You don't even need to open this app every single day! Every evening at 8:00 PM, the system automatically checks your active subjects and sends a direct Telegram push notification to your phone with only the tasks you still need to finish.",
    points: [
      "Arrives Daily at 8:00 PM: Sent straight to your Telegram bot so you never miss tomorrow's submission.",
      "Clean & Short: Lists only pending tasks with subject names and exact deadlines.",
      "Test Anytime: Click the button below to test your Telegram push notification right now!"
    ],
    protip: "Helpful Tip: Click 'Send Sample Telegram Alert Now' below to test your Telegram notification right away!",
    actionLabel: "Send Sample Telegram Alert Now",
    actionFn: () => { closeInteractiveTour(); triggerReminder(); },
    renderVisual: () => `
      <div class="telegram-mock-card" style="border: 1px solid rgba(0, 136, 204, 0.35); background: rgba(0, 136, 204, 0.03); border-radius: var(--radius-md); overflow: hidden;">
        <div class="telegram-mock-header">
          <div class="telegram-mock-avatar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
          </div>
          <div>
            <div class="telegram-mock-botname">
              VOLP Reminder Bot
              <span class="telegram-mock-badge">BOT</span>
            </div>
            <div class="telegram-mock-sub">8:00 PM • Direct Push Notification</div>
          </div>
        </div>
        <div class="telegram-mock-body">
          <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">📚 VOLP 8 PM Assignment Reminder</div>
          <div>Hello Student, you have <strong>2 pending assignments</strong>:</div>
          <div class="telegram-mock-item telegram-mock-item--urgent">
            <div style="font-weight: 700; color: var(--text-primary);">1. Compiler Design <span style="font-size: 10px; color: var(--muted); font-weight: 400;">[SUBJECTIVE]</span></div>
            <div>📝 Assignment 7: Symbol Table</div>
            <div style="color: var(--danger); font-weight: 600;">📅 Due: Tonight, 11:59 PM</div>
          </div>
          <div class="telegram-mock-item telegram-mock-item--warning">
            <div style="font-weight: 700; color: var(--text-primary);">2. Operating Systems <span style="font-size: 10px; color: var(--muted); font-weight: 400;">[HANDS_ON]</span></div>
            <div>📝 Unit 4: Process Synchronization Lab</div>
            <div style="color: var(--warning); font-weight: 600;">📅 Due: Tomorrow, 11:59 PM</div>
          </div>
          <div style="font-size: 10px; color: var(--muted); display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(0, 136, 204, 0.15); padding-top: 6px; margin-top: 6px;">
            <span>⚡ Direct push to Telegram</span>
            <span>8:00 PM ✓✓</span>
          </div>
        </div>
      </div>
    `
  }
];

// Starts the guided interactive product tour from a specific step.
function startInteractiveTour(stepIndex = 0) {
  const overlay = document.getElementById("interactiveTourOverlay");
  if (!overlay) return;
  overlay.classList.add("active");
  goToTourStep(stepIndex);
}

// Closes and dismisses the interactive tour modal overlay.
function closeInteractiveTour() {
  const overlay = document.getElementById("interactiveTourOverlay");
  if (!overlay) return;
  overlay.classList.remove("active");
}

// Advances or navigates directly to a specified tour step.
function goToTourStep(index) {
  if (index < 0 || index >= TOUR_STEPS.length) return;
  currentTourStep = index;
  renderTourStep();
}

// Advances to the next step in the interactive tour.
function nextTourStep() {
  if (currentTourStep < TOUR_STEPS.length - 1) {
    goToTourStep(currentTourStep + 1);
  } else {
    closeInteractiveTour();
    showToast("Tour completed! Explore your dashboard.", "success");
  }
}

// Navigates to the previous step in the interactive tour.
function prevTourStep() {
  if (currentTourStep > 0) {
    goToTourStep(currentTourStep - 1);
  }
}

// Renders content, visual preview, and action buttons for the current tour step.
function renderTourStep() {
  const stepData = TOUR_STEPS[currentTourStep];
  if (!stepData) return;

  const counterEl = document.getElementById("tourStepCounter");
  if (counterEl) {
    counterEl.textContent = `STEP 0${currentTourStep + 1} OF 0${TOUR_STEPS.length}`;
  }

  const fillEl = document.getElementById("tourProgressFill");
  if (fillEl) {
    const percent = ((currentTourStep + 1) / TOUR_STEPS.length) * 100;
    fillEl.style.width = `${percent}%`;
  }

  for (let i = 0; i < TOUR_STEPS.length; i++) {
    const tab = document.getElementById(`tourTab${i}`);
    if (tab) {
      tab.classList.toggle("active", i === currentTourStep);
    }
  }

  const prevBtn = document.getElementById("tourPrevBtn");
  if (prevBtn) {
    prevBtn.disabled = currentTourStep === 0;
  }

  const nextBtn = document.getElementById("tourNextBtn");
  if (nextBtn) {
    nextBtn.textContent = currentTourStep === TOUR_STEPS.length - 1 ? "FINISH & EXPLORE 🚀" : "NEXT STEP →";
  }

  const bodyEl = document.getElementById("tourModalBody");
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="tour-step-container">
        <div class="tour-step-visual">
          ${stepData.renderVisual()}
        </div>
        <div class="tour-step-info">
          <div>
            <div class="tour-step-kicker">
              <span class="pulse-beacon"></span>
              <span>${stepData.kicker}</span>
            </div>
            <h3 class="tour-step-heading">${stepData.title}</h3>
            <p class="tour-step-narrative">${stepData.narrative}</p>
            <ul class="tour-feature-points">
              ${stepData.points.map(pt => `
                <li>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>${escapeHtml(pt)}</span>
                </li>
              `).join('')}
            </ul>
            <div class="tour-protip-box">
              <strong>${stepData.protip.split(':')[0]}:</strong> ${stepData.protip.split(':').slice(1).join(':')}
            </div>
          </div>
          <div style="margin-top: 12px;">
            <button type="button" class="btn btn--accent-sm" onclick="TOUR_STEPS[${currentTourStep}].actionFn()">
              ${stepData.actionLabel}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
