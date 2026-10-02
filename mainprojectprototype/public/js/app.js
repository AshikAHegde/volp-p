/**
 * VOLP Reminder — Assignment Console Client
 * Strictly aligned with Backend API Schema and Endpoints
 */

// Global State
let currentUser = null;
let rawAssignments = [];
let rawCourses = [];
let blockedCoursesList = [];
let blockedAssignmentsList = [];

let currentTab = "dashboard";
let currentTaskView = "kanban"; // 'kanban' | 'table'
let currentStatusFilter = "all"; // 'all' | 'pending' | 'submitted' | 'overdue'
let currentTypeFilter = "all"; // 'all' | 'SUBJECTIVE' | 'HANDS_ON'
let currentSubjectFilter = "all";
let currentSearchQuery = "";
let isOfflineMode = false;
let pendingModalAction = null;
let calendarView = "month";
let calendarDate = new Date();
let calendarCourseFilter = "all";
let calendarStatusFilter = "all";

// Initial Fallback Dataset (Conforming strictly to real backend API schema)
const DEFAULT_FALLBACK_COURSES = [
  {
    colid: 1,
    crsid: "CS301",
    course_name: "Operating Systems",
    semester: "Sem 5",
    academic_year: "2025-2026",
    is_blocked: false,
  },
  {
    colid: 2,
    crsid: "CS302",
    course_name: "Database Management Systems",
    semester: "Sem 5",
    academic_year: "2025-2026",
    is_blocked: false,
  },
  {
    colid: 3,
    crsid: "CS303",
    course_name: "Computer Networks",
    semester: "Sem 5",
    academic_year: "2025-2026",
    is_blocked: false,
  },
  {
    colid: 4,
    crsid: "CS304",
    course_name: "Software Engineering",
    semester: "Sem 5",
    academic_year: "2025-2026",
    is_blocked: false,
  },
  {
    colid: 5,
    crsid: "CS305",
    course_name: "Artificial Intelligence",
    semester: "Sem 5",
    academic_year: "2025-2026",
    is_blocked: true,
  },
  {
    colid: 6,
    crsid: "CS306",
    course_name: "Web Technologies",
    semester: "Sem 5",
    academic_year: "2025-2026",
    is_blocked: false,
  },
];

const DEFAULT_FALLBACK_ASSIGNMENTS = [
  {
    assignment_id: 101,
    assignment_type: "SUBJECTIVE",
    colid: 1,
    course_name: "Operating Systems",
    unit_name: null,
    title_html: "Process Scheduling Analysis (Round Robin & Priority)",
    due_date_raw: "Today, 11:59 PM",
    is_submitted: false,
    is_blocked: false,
  },
  {
    assignment_id: 102,
    assignment_type: "HANDS_ON",
    colid: 2,
    course_name: "Database Management Systems",
    unit_name: "Unit 2: Relational Models",
    title_html: "Build REST API Integration with PostgreSQL CRUD",
    due_date_raw: "In 2 Days",
    is_submitted: false,
    is_blocked: false,
  },
  {
    assignment_id: 103,
    assignment_type: "SUBJECTIVE",
    colid: 3,
    course_name: "Computer Networks",
    unit_name: null,
    title_html: "Setup development environment & TCP/IP Stack Report",
    due_date_raw: "In 5 Days",
    is_submitted: true,
    is_blocked: false,
  },
  {
    assignment_id: 104,
    assignment_type: "HANDS_ON",
    colid: 4,
    course_name: "Software Engineering",
    unit_name: "Unit 1: Agile Planning",
    title_html: "Define user personas & Sprint Jira Board",
    due_date_raw: "In 3 Days",
    is_submitted: true,
    is_blocked: false,
  },
  {
    assignment_id: 105,
    assignment_type: "SUBJECTIVE",
    colid: 2,
    course_name: "Database Management Systems",
    unit_name: null,
    title_html: "Create style guide & 3NF / BCNF Proofs",
    due_date_raw: "Tomorrow",
    is_submitted: false,
    is_blocked: false,
  },
  {
    assignment_id: 106,
    assignment_type: "HANDS_ON",
    colid: 6,
    course_name: "Web Technologies",
    unit_name: "Unit 4: Modern Frontends",
    title_html: "Implement responsive brutalist UI framework",
    due_date_raw: "In 6 Days",
    is_submitted: false,
    is_blocked: false,
  },
  {
    assignment_id: 107,
    assignment_type: "SUBJECTIVE",
    colid: 1,
    course_name: "Operating Systems",
    unit_name: null,
    title_html: "Virtual Memory Paging & Replacement Simulation",
    due_date_raw: "Overdue (Yesterday)",
    is_submitted: false,
    is_blocked: false,
  },
];

// Document Ready Initialization
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initSidebarState();
  initSidebarTourState();
  initUserSession();
  const footerYear = document.getElementById("appFooterYear");
  if (footerYear) footerYear.textContent = new Date().getFullYear();
  await loadAppData();

  // Accessibility & UX: Dismiss modal, tour, or mobile drawer on Escape key, Arrow keys for tour
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

function initSidebarState() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  const collapsed = localStorage.getItem("sidebar-collapsed") === "true";
  sidebar.classList.toggle("is-collapsed", collapsed);
  updateSidebarCollapseButton(collapsed);
}

function initSidebarTourState() {
  const dismissed = localStorage.getItem("volp_sidebar_tour_dismissed") === "true";
  const card = document.getElementById("sidebarTourCard");
  if (card && dismissed) {
    card.style.display = "none";
  }
}

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

function updateSidebarCollapseButton(collapsed) {
  const button = document.getElementById("sidebarCollapseBtn");
  if (!button) return;
  button.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  button.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  button.innerHTML = collapsed
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';
}

function toggleSidebarCollapse() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  const collapsed = sidebar.classList.toggle("is-collapsed");
  localStorage.setItem("sidebar-collapsed", String(collapsed));
  updateSidebarCollapseButton(collapsed);
}

// 1. Theme Management
function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeIcon(next);
  showToast(`Switched to ${next.toUpperCase()} theme`, "info");
}

function updateThemeIcon(theme) {
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.textContent = theme === "dark" ? "☼" : "◐";
}

// 2. User Session Management
function initUserSession() {
  const stored = localStorage.getItem("volp_user");
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
    } catch (e) {
      currentUser = { email: "student@university.edu", token: "demo" };
    }
  } else {
    currentUser = { email: "student@university.edu", token: "demo" };
  }

  const userEmail = currentUser.email || "student@university.edu";
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
}

function handleSignOut() {
  if (currentUser?.token && currentUser.token !== "demo") {
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

// 3. Helper Functions: Date Parsing & Data Normalization
function normalizeType(type) {
  if (!type) return "";
  const clean = String(type)
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (clean === "HANDSON" || clean === "HANDS_ON") return "HANDS_ON";
  if (clean === "SUBJECTIVE") return "SUBJECTIVE";
  return clean;
}

function isSubmitted(item) {
  return (
    item.is_submitted === true ||
    item.is_submitted === 1 ||
    item.is_submitted === "true" ||
    item.is_submitted === "1"
  );
}

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

  // Format: DD/MM/YYYY or DD-MM-YYYY (with optional HH:MM AM/PM)
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

function isAssignmentOverdue(item) {
  if (isSubmitted(item)) return false;
  if (!item.due_date_raw) return false;
  const d = parseVolpDate(item.due_date_raw);
  if (!d) {
    return (item.due_date_raw || "").toLowerCase().includes("overdue");
  }
  return d.getTime() < Date.now();
}

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

// 4. Data Fetching from Backend API
function getAuthHeaders() {
  if (!currentUser?.token || !currentUser?.email) return {};
  return {
    Authorization: `Bearer ${currentUser.token}`,
    "X-User-Email": currentUser.email,
  };
}

async function loadAppData(refresh = false) {
  try {
    // 1. Fetch Courses
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
      isOfflineMode = false;
      const statusEl = document.getElementById("settingsDataSource");
      if (statusEl)
        statusEl.value = `Source: ${courseData.source || "MONGODB_DATABASE"} (Live Connected)`;
    } else {
      throw new Error("Course API returned " + courseRes.status);
    }

    // 2. Fetch Assignments
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
    } else {
      throw new Error("Assignment API returned " + assignRes.status);
    }

    // 3. Fetch Blocked Items
    await loadBlockedData();
  } catch (err) {
    console.warn(
      "Backend API unavailable. Using fallback dataset:",
      err.message,
    );
    isOfflineMode = true;
    if (rawCourses.length === 0) rawCourses = [...DEFAULT_FALLBACK_COURSES];
    if (rawAssignments.length === 0)
      rawAssignments = [...DEFAULT_FALLBACK_ASSIGNMENTS];
    const statusEl = document.getElementById("settingsDataSource");
    if (statusEl) statusEl.value = "Offline / Fallback Local Storage Mode";
  }

  renderAllViews();
}

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

// 5. View Navigation
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
  if (pageId === "calendar") {
    renderCalendarCourseFilter();
    renderCalendarView();
  }

  closeSidebar();
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  sidebar.classList.toggle("open");
  overlay.classList.toggle("active");
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("active");
}

// Helper: Set of blocked course IDs and assignment keys
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

// Calendar transformation layer: API assignments -> availability filter -> calendar events.
// Assignment dates come from the existing due_date_raw field.
function isCourseUnavailable(course) {
  if (!course) return true;
  return (
    Boolean(course.is_blocked) ||
    getBlockedCourseIds().has(Number(course.colid))
  );
}

function dateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function formatCalendarDate(date, options = {}) {
  return date.toLocaleDateString(undefined, options);
}

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

function setCalendarView(view) {
  calendarView = view;
  renderCalendarView();
}
function shiftCalendar(amount) {
  if (calendarView === "month")
    calendarDate.setMonth(calendarDate.getMonth() + amount);
  else if (calendarView === "week")
    calendarDate.setDate(calendarDate.getDate() + amount * 7);
  else calendarDate.setDate(calendarDate.getDate() + amount);
  renderCalendarView();
}
function goToCalendarToday() {
  calendarDate = new Date();
  renderCalendarView();
}
function setCalendarFilter(value) {
  calendarCourseFilter = value;
  renderCalendarView();
}
function setCalendarStatusFilter(value, element) {
  calendarStatusFilter = value;
  document
    .querySelectorAll("#calendarStatusFilter .filter-btn")
    .forEach((button) => button.classList.remove("active"));
  if (element) element.classList.add("active");
  renderCalendarView();
}

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

function assignmentCalendarButton(item) {
  const date = parseVolpDate(item?.due_date_raw);
  return `<button class="btn btn--ghost btn--sm assignment-calendar-btn" ${date ? `onclick="addAssignmentToCalendar(${Number(item.assignment_id)}, '${escapeJsString(item.assignment_type || "")}')"` : "disabled"} title="${date ? "Add to calendar" : "No date available"}">＋ CALENDAR</button>`;
}

function closeCourseDetails(event) {
  if (
    !event ||
    event.target === document.getElementById("courseDetailsOverlay")
  )
    document.getElementById("courseDetailsOverlay")?.classList.remove("active");
}

// 6. Comprehensive Filtering & Search Engine
function filterTasks() {
  const input = document.getElementById("taskSearchInput");
  currentSearchQuery = input ? input.value.trim().toLowerCase() : "";
  renderTasksView();
}

function setStatusFilter(filter, el) {
  currentStatusFilter = filter;
  document
    .querySelectorAll("#statusFilterGroup .filter-btn")
    .forEach((b) => b.classList.remove("active"));
  if (el) el.classList.add("active");
  renderTasksView();
}

function setTypeFilter(filter, el) {
  currentTypeFilter = filter;
  document
    .querySelectorAll("#typeFilterGroup .filter-btn")
    .forEach((b) => b.classList.remove("active"));
  if (el) el.classList.add("active");
  renderTasksView();
}

/** Updates the assignment subject filter and refreshes the visible assignments. */
function setSubjectFilter(filter) {
  currentSubjectFilter = filter || "all";
  renderTasksView();
}

/** Renders subject options from courses that are currently unblocked in the frontend. */
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

function getFilteredAssignments() {
  const blockedCourseIds = getBlockedCourseIds();

  return rawAssignments.filter((item) => {
    // 0. Course Block Filter: Hide assignments of blocked courses from UI
    if (item.colid && blockedCourseIds.has(Number(item.colid))) {
      return false;
    }

    // 1. Subject Filter: match the selected non-blocked course by ID.
    if (
      currentSubjectFilter !== "all" &&
      String(item.colid) !== String(currentSubjectFilter)
    ) {
      return false;
    }

    // 2. Search Query Filter
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

    // 3. Type Filter ('all', 'SUBJECTIVE', 'HANDS_ON')
    if (currentTypeFilter !== "all") {
      const itemTypeNorm = normalizeType(item.assignment_type);
      const filterTypeNorm = normalizeType(currentTypeFilter);
      if (itemTypeNorm !== filterTypeNorm) {
        return false;
      }
    }

    // 4. Status Filter ('all', 'pending', 'submitted', 'overdue')
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

// 7. Render All Views
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

// Render Dashboard Metrics (Real computed data)
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

// Render Course Cards on Dashboard
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

// Render Dashboard Urgent Deadlines Table
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

// 8. Tasks & Assignments View (Kanban + Table View with live filters)
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

function renderTasksView() {
  const filtered = getFilteredAssignments();

  if (currentTaskView === "kanban") {
    renderKanbanBoard(filtered);
  } else {
    renderTasksTable(filtered);
  }
}

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

// 9. Render Courses View
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

// 10. Render Block Manager View
function renderBlockManagerView() {
  // 1. Blocked Courses
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

  // 2. Blocked Assignments
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

// 11. Render Reminders & Notification View
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

  let html = `
    <div class="note-card">
      <div class="note-card-header">
        <span>DAILY REMINDER SERVICE CONFIGURATION</span>
        <span class="badge badge--submitted">ACTIVE CRON</span>
      </div>
      <div class="note-card-body">
        Daily cron is scheduled for <strong>8:00 PM ("0 20 * * *")</strong>. It checks all active enrolled courses, aggregates unsubmitted assignments, omits blocked items, and dispatches a consolidated digest via SMTP.
      </div>
      <div class="note-card-footer">
        RECIPIENT: ${escapeHtml(currentUser?.email || "N/A")} | PENDING TO SEND: ${pendingUnblocked} | MUTED ITEMS: ${blockedCount}
      </div>
    </div>
  `;

  if (window.reminderLogs && window.reminderLogs.length > 0) {
    window.reminderLogs.forEach((log) => {
      html += `
        <div class="note-card">
          <div class="note-card-header">
            <span>${escapeHtml(log.title)} — ${escapeHtml(log.time)}</span>
            <span class="badge ${log.success ? "badge--submitted" : "badge--pending"}">${log.success ? "SENT" : "LOGGED"}</span>
          </div>
          <div class="note-card-body">${escapeHtml(log.message)}</div>
          <div class="note-card-footer">RECIPIENT: ${escapeHtml(currentUser?.email || "N/A")} | STATUS: PROCESSED</div>
        </div>
      `;
    });
  }

  list.innerHTML = html;
}

// 12. Actions: Sync, Trigger Reminders, Blocks, and Submission toggles
/** Shows the full-screen progress state while live VOLP data is being fetched. */
function showSyncProgress() {
  const overlay = document.getElementById("syncOverlay");
  if (!overlay) return;
  overlay.classList.add("active");
  overlay.setAttribute("aria-hidden", "false");
}

/** Hides the live sync progress state after the data refresh has settled. */
function hideSyncProgress() {
  const overlay = document.getElementById("syncOverlay");
  if (!overlay) return;
  overlay.classList.remove("active");
  overlay.setAttribute("aria-hidden", "true");
}

/** Rejects a sync attempt when it exceeds the user-facing five-minute wait limit. */
function createSyncTimeout() {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error("SYNC_TIMEOUT")), 5 * 60 * 1000);
  });
}

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

async function triggerReminder() {
  const btn = document.getElementById("reminderBtn");
  const pageBtn = document.getElementById("triggerReminderPageBtn");
  if (btn) btn.disabled = true;
  if (pageBtn) pageBtn.disabled = true;
  showToast("Simulating 8 PM Cron Assignment Reminder...", "info");

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
      showToast(data.message || "8 PM Reminder digest dispatched!", "success");
      if (!window.reminderLogs) window.reminderLogs = [];
      window.reminderLogs.unshift({
        title: "MANUAL 8 PM DISPATCH TRIGGER",
        message:
          data.message ||
          `Dispatched assignment reminder digest to ${currentUser.email}`,
        time: new Date().toLocaleTimeString(),
        success: true,
      });
      renderRemindersView();
    } else {
      throw new Error(data.error || "Server error");
    }
  } catch (e) {
    showToast("8 PM Reminder triggered: " + e.message, "info");
    if (!window.reminderLogs) window.reminderLogs = [];
    window.reminderLogs.unshift({
      title: "MANUAL 8 PM DISPATCH TRIGGER",
      message: `Trigger executed for ${currentUser.email}. Check server terminal / mailbox.`,
      time: new Date().toLocaleTimeString(),
      success: true,
    });
    renderRemindersView();
  } finally {
    if (btn) btn.disabled = false;
    if (pageBtn) pageBtn.disabled = false;
  }
}

// Block / Unblock Course
async function toggleCourseBlock(colid, courseName, currentlyBlocked) {
  const actionText = currentlyBlocked ? "unblock" : "block";

  openModal(
    `${actionText.toUpperCase()} COURSE`,
    `Are you sure you want to ${actionText} "${courseName}"? ${currentlyBlocked ? "It will reappear in daily reminders." : "All assignments for this course will be omitted from 8 PM email digests."}`,
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

      if (!isOfflineMode && currentUser?.token) {
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

// Block / Unblock Assignment
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

// 13. Modal Utilities
function openModal(title, body, confirmCallback) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").textContent = body;
  pendingModalAction = confirmCallback;
  document.getElementById("modalOverlay").classList.add("active");
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("active");
  pendingModalAction = null;
}

function confirmModal() {
  if (typeof pendingModalAction === "function") {
    pendingModalAction();
  }
  closeModal();
}

// 14. Toast Notification System
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

// Helper: Escape HTML strings
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJsString(str) {
  return escapeHtml(str)
    .replace(/\\/g, "\\\\")
    .replace(/&#039;/g, "\\'");
}


// ==========================================================================
// 15. INTERACTIVE PRODUCT TOUR & VISUAL WALKTHROUGH SYSTEM
// ==========================================================================
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
    narrative: "Have subjects from an earlier semester or elective labs you don't need alerts for? Click 'Block' to silence them. They stay safely on your official college portal, but won't clutter your dashboard or spam your email inbox.",
    points: [
      "Declutter Your View: Muted subjects disappear from your daily homework board.",
      "Silence Email Alerts: Muted subjects won't generate daily reminder emails.",
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
    title: "Automatic 8:00 PM Email Directly to Your Inbox",
    narrative: "You don't even need to open this app every single day! Every evening at 8:00 PM, the system automatically checks your active subjects and sends a polite summary email with only the tasks you still need to finish.",
    points: [
      "Arrives Daily at 8:00 PM: Sent straight to your email so you never miss tomorrow's submission.",
      "Clean & Short: Lists only pending tasks with subject names and exact deadlines.",
      "Test Anytime: Click the button below to send yourself a test reminder right now!"
    ],
    protip: "Helpful Tip: Click 'Send Me a Sample Email Now' below to test your email notification right away!",
    actionLabel: "Send Me a Sample Email Now",
    actionFn: () => { closeInteractiveTour(); triggerReminder(); },
    renderVisual: () => `
      <div class="email-mock-card">
        <div class="email-mock-header">
          <span class="email-dot red"></span>
          <span class="email-dot yellow"></span>
          <span class="email-dot green"></span>
          <span class="email-subject-line">🔔 College Reminder: 2 Pending Assignments Due Soon</span>
        </div>
        <div class="email-mock-table-wrap">
          <table class="email-mock-table">
            <thead>
              <tr><th>Subject</th><th>What is Due?</th><th>Due Date</th></tr>
            </thead>
            <tbody>
              <tr><td>Compiler Design</td><td>Assignment 7: Symbol Table</td><td>Tonight, 11:59 PM</td></tr>
              <tr><td>Operating Systems</td><td>Unit 4: Process Sync Report</td><td>Tomorrow</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `
  }
];

function startInteractiveTour(stepIndex = 0) {
  const overlay = document.getElementById("interactiveTourOverlay");
  if (!overlay) return;
  overlay.classList.add("active");
  goToTourStep(stepIndex);
}

function closeInteractiveTour() {
  const overlay = document.getElementById("interactiveTourOverlay");
  if (!overlay) return;
  overlay.classList.remove("active");
}

function goToTourStep(index) {
  if (index < 0 || index >= TOUR_STEPS.length) return;
  currentTourStep = index;
  renderTourStep();
}

function nextTourStep() {
  if (currentTourStep < TOUR_STEPS.length - 1) {
    goToTourStep(currentTourStep + 1);
  } else {
    closeInteractiveTour();
    showToast("Tour completed! Explore your dashboard.", "success");
  }
}

function prevTourStep() {
  if (currentTourStep > 0) {
    goToTourStep(currentTourStep - 1);
  }
}

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
