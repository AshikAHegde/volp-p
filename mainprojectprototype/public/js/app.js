
let currentUser = null;
let rawAssignments = [];
let rawCourses = [];
let blockedCoursesList = [];
let blockedAssignmentsList = [];

// Hackathon dashboard state
let hackathonEvents = [];
let hackathonFiltered = [];
let hackathonPage = 1;
let hackathonLimit = 24;
let hackathonSource = 'all';
let hackathonTab = 'list';
let hkCalDate = new Date();
let hkCalSelected = null;
let selectedHackathons = new Set();
let currentHkPhaseFilter = "all";
let currentHkModeFilter = "all";
let currentHkFeeFilter = "all";
let currentHkThemeFilter = "all";
let currentHkSortOption = "deadline_asc";
let currentHkStartDateFilter = "";
let currentHkEndDateFilter = "";
let isHkAdvancedFilterOpen = false;
let isHkPhaseSectionCollapsed = false;

let currentTab = "dashboard";
let currentTaskView = "kanban";
let currentStatusFilter = "all";
let currentTypeFilter = "all";
let currentSubjectFilter = "all";
let currentSearchQuery = "";
let currentPhaseFilter = "all";
let currentPriorityFilter = "all";
let currentProgressFilter = "all";
let currentStartDateFilter = "";
let currentEndDateFilter = "";
let currentSortOption = "due_asc";
let selectedAssignments = new Set();
let isAdvancedFilterOpen = false;
let isPhaseSectionCollapsed = false;
let pendingModalAction = null;
let calendarView = "month";
let calendarDate = new Date();
// Selected date key for VOLP assignment calendar view
let calendarSelected = null;
let calendarCourseFilter = "all";
let calendarStatusFilter = "all";

// Initializes application state, session, and views upon DOM load.
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initSidebarState();
  initSidebarResize();
  initSidebarTourState();
  if (!initUserSession()) return;
  const footerYear = document.getElementById("appFooterYear");
  if (footerYear) footerYear.textContent = new Date().getFullYear();

  // Immediately restore previously active tab from localStorage or URL hash
  initActiveTab();

  renderAllViews();
  await loadAppData();

  // Refresh tab-specific content after asynchronous data load
  if (currentTab === "hackathons") {
    loadHackathonPage();
  } else if (currentTab === "calendar") {
    renderCalendarCourseFilter();
    renderCalendarView();
  } else if (currentTab === "reminders") {
    renderRemindersView();
  }

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

// Desktop Sidebar Resizing Constants
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 460;
const SIDEBAR_DEFAULT_WIDTH = 260;
const SIDEBAR_WIDTH_STORAGE_KEY = "volp_sidebar_width";

// Applies a given width to the left sidebar on desktop screens.
function applySidebarWidth(width, persist = false) {
  if (window.innerWidth <= 1024) return;
  const sidebar = document.getElementById("sidebar");
  if (!sidebar || sidebar.classList.contains("is-collapsed")) return;

  const clamped = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(width)));
  sidebar.style.width = `${clamped}px`;
  document.documentElement.style.setProperty("--sidebar-width", `${clamped}px`);

  if (persist) {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
    } catch (_) {}
  }
}

// Initializes drag-to-resize functionality for the left sidebar on desktop screens.
function initSidebarResize() {
  const sidebar = document.getElementById("sidebar");
  const resizer = document.getElementById("sidebarResizer");
  if (!sidebar || !resizer) return;

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  function onPointerDown(e) {
    // Desktop only and only when expanded
    if (window.innerWidth <= 1024) return;
    if (sidebar.classList.contains("is-collapsed")) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;

    isDragging = true;
    startX = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;

    sidebar.classList.add("is-resizing");
    document.body.classList.add("sidebar-is-resizing");

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    const targetWidth = startWidth + deltaX;
    applySidebarWidth(targetWidth, false);
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;

    sidebar.classList.remove("is-resizing");
    document.body.classList.remove("sidebar-is-resizing");

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);

    const currentWidth = sidebar.getBoundingClientRect().width;
    applySidebarWidth(currentWidth, true);
  }

  resizer.addEventListener("pointerdown", onPointerDown);

  // Double click resets to default width
  resizer.addEventListener("dblclick", () => {
    if (window.innerWidth <= 1024 || sidebar.classList.contains("is-collapsed")) return;
    applySidebarWidth(SIDEBAR_DEFAULT_WIDTH, true);
  });

  // Responsive resize watcher
  window.addEventListener("resize", () => {
    if (window.innerWidth <= 1024) {
      sidebar.style.removeProperty("width");
      document.documentElement.style.removeProperty("--sidebar-width");
    } else if (!sidebar.classList.contains("is-collapsed")) {
      const stored = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
      applySidebarWidth(stored ? parseInt(stored, 10) : SIDEBAR_DEFAULT_WIDTH, false);
    }
  });
}

// Initializes the sidebar collapsed or expanded state from local storage.
function initSidebarState() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  const collapsed = localStorage.getItem("sidebar-collapsed") === "true";
  sidebar.classList.toggle("is-collapsed", collapsed);
  updateSidebarCollapseButton(collapsed);

  if (collapsed) {
    sidebar.style.removeProperty("width");
  } else if (window.innerWidth > 1024) {
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (savedWidth) {
      applySidebarWidth(parseInt(savedWidth, 10), false);
    }
  }
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

  if (collapsed) {
    sidebar.style.removeProperty("width");
  } else if (window.innerWidth > 1024) {
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (savedWidth) {
      applySidebarWidth(parseInt(savedWidth, 10), false);
    } else {
      sidebar.style.removeProperty("width");
    }
  }
}

// Applies the saved color theme from local storage or defaults to light.
function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
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
      .then((res) => {
        // Platform-independent session check: redirect to login if backend rejects session as expired
        if (res.status === 401) {
          localStorage.removeItem("volp_user");
          window.location.href = "login.html?expired=true";
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (data) {
          if (data.telegram_chat_id) {
            currentUser.telegram_chat_id = data.telegram_chat_id;
          }
          // Sync is_premium from server on every page load
          currentUser.is_premium = Boolean(data.is_premium);
          localStorage.setItem("volp_user", JSON.stringify(currentUser));
          applyPremiumUI();
          loadTelegramSettings();
          if (currentTab === "reminders") renderRemindersView();
        }
      })
      .catch(() => {});
  }

  // Apply premium state from local cache immediately (server will correct if needed)
  applyPremiumUI();

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
  try {
    localStorage.removeItem("volp_active_tab");
  } catch (_) {}
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

  // Support ISO formats (YYYY-MM-DD) cross-browser including WebKit/Safari
  const isoMatch = str.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i,
  );
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    let hours = isoMatch[4] ? parseInt(isoMatch[4], 10) : 23;
    const minutes = isoMatch[5] ? parseInt(isoMatch[5], 10) : 59;
    const seconds = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
    const ampm = isoMatch[7] ? isoMatch[7].toUpperCase() : null;
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return new Date(year, month, day, hours, minutes, seconds);
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

  const normalized = str.includes(" ") && !str.includes("T") ? str.replace(" ", "T") : str;
  const parsed = Date.parse(normalized);
  return isNaN(parsed) ? (isNaN(Date.parse(str)) ? null : new Date(Date.parse(str))) : new Date(parsed);
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
      // Platform-independent session expiration check: redirect to login if backend rejects with 401
      if (courseRes.status === 401) {
        localStorage.removeItem("volp_user");
        window.location.href = "login.html?expired=true";
        return;
      }
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
    } else if (assignRes.status === 401) {
      // Platform-independent session expiration check: redirect to login if backend rejects with 401
      localStorage.removeItem("volp_user");
      window.location.href = "login.html?expired=true";
      return;
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
      const bSet = new Set(blockedCoursesList.map((c) => Number(c.colid)));
      rawCourses.forEach((c) => {
        c.is_blocked = bSet.has(Number(c.colid));
      });
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

// Restores the previously active navigation tab from localStorage or URL hash.
function initActiveTab() {
  const hashPage = (window.location.hash || "").replace("#", "").trim();
  let savedTab = "";
  try {
    savedTab = localStorage.getItem("volp_active_tab") || "";
  } catch (_) {}

  let targetPage = hashPage || savedTab || "dashboard";

  // Validate that the target page element actually exists
  if (!document.getElementById(`page-${targetPage}`)) {
    targetPage = "dashboard";
  }

  // If hackathons tab was saved but user is not premium, default to dashboard
  if (targetPage === "hackathons" && currentUser?.is_premium !== true) {
    targetPage = "dashboard";
  }

  navigateTo(targetPage);
}

// Switches active view pages and updates navigation highlights and headers.
function navigateTo(pageId, event) {
  if (event) event.preventDefault();

  currentTab = pageId;
  try {
    localStorage.setItem("volp_active_tab", pageId);
  } catch (_) {}

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
    reminders: "REMINDER LOGS",
    settings: "ACCOUNT CONFIGURATION",
    howtouse: "HOW THIS APP WORKS (SIMPLE GUIDE)",
    hackathons: "HACKATHON DASHBOARD — PREMIUM",
  };

  const titleEl = document.getElementById("headerTitle");
  if (titleEl) titleEl.textContent = titles[pageId] || pageId.toUpperCase();

  const mainContent = document.getElementById("mainContent");
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: "smooth" });

  if (pageId === "reminders") {
    fetchServerReminderLogs();
    renderRemindersView();
  }
  if (pageId === "settings") {
    loadTelegramSettings();
  }
  if (pageId === "calendar") {
    renderCalendarCourseFilter();
    renderCalendarView();
  }
  if (pageId === "hackathons") {
    // Refresh hackathons when navigating to the tab to ensure live database sync
    loadHackathonPage(true);
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
        // Mark upcoming deadline true when due within 2 days and not yet completed
        deadlineSoon: !completed && daysToDeadline >= 0 && daysToDeadline <= 2,
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
    <span class="calendar-event-title">${escapeHtml(cleanHtmlTitle(assignment.title_html) || "Assignment")}</span>
    ${compact ? "" : `<span class="calendar-event-meta">${escapeHtml(course.course_name || "Course")} · ${escapeHtml(type)} · ${deadline}</span>`}
    <span class="calendar-event-status">${statusLabel}</span>
  </button>`;
}

// Selects a date in the VOLP calendar and refreshes the day event view.
function selectVolpCalendarDay(key) {
  calendarSelected = (calendarSelected === key) ? null : key;
  renderCalendarView();
}

// Shifts the current calendar view forward or backward by month.
function shiftCalendar(amount) {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + amount, 1);
  calendarSelected = null;
  renderCalendarView();
}

// Resets the calendar view to the current date.
function goToCalendarToday() {
  calendarDate = new Date();
  calendarSelected = null;
  renderCalendarView();
}

// Renders the VOLP learning calendar grid and selected day events matching Hackathons layout.
function renderCalendarView() {
  const calEl = document.getElementById("volpCalendarGrid") || document.getElementById("calendarShell");
  const evEl = document.getElementById("volpCalendarEvents");
  const labelEl = document.getElementById("calendarPeriodLabel");
  const summaryEl = document.getElementById("calendarSummary");
  const unscheduled = document.getElementById("unscheduledSection");
  if (!calEl) return;

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  if (labelEl) {
    labelEl.textContent = calendarDate.toLocaleString("en-IN", { month: "long", year: "numeric" }).toUpperCase();
  }

  const allEvents = calendarVisibleEvents();
  const unscheduledEvents = allEvents.filter((event) => !event.deadline && !event.start);
  const datedEvents = allEvents.filter((event) => event.deadline || event.start);
  const availableCount = courseCalendarEvents().length;

  if (summaryEl) {
    summaryEl.textContent = `${availableCount} AVAILABLE ASSIGNMENT${availableCount === 1 ? "" : "S"}`;
  }

  // Build events map: "YYYY-MM-DD" -> array of assignment events
  const eventsOnDay = {};
  for (const ev of datedEvents) {
    const d = ev.deadline || ev.start;
    if (!d) continue;
    const key = dateKey(d);
    if (!key) continue;
    if (!eventsOnDay[key]) eventsOnDay[key] = [];
    eventsOnDay[key].push(ev);
  }

  const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  let html = DAY_NAMES.map((d) => `<div class="hk-cal-day-name">${d}</div>`).join("");

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = dateKey(new Date());

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="hk-cal-cell hk-cal-cell--empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isToday = key === todayStr;
    const hasDls = Boolean(eventsOnDay[key] && eventsOnDay[key].length > 0);
    const isSelected = key === calendarSelected;

    const classes = [
      "hk-cal-cell",
      isToday ? "hk-cal-cell--today" : "",
      hasDls ? "hk-cal-cell--has-events" : "",
      isSelected ? "hk-cal-cell--selected" : "",
    ].filter(Boolean).join(" ");

    const dotHtml = hasDls ? `<div class="hk-cal-dot"></div>` : "";
    const clickFn = `onclick="selectVolpCalendarDay('${key}')"`;

    html += `<div class="${classes}" ${clickFn}>${day}${dotHtml}</div>`;
  }

  calEl.innerHTML = html;

  // Render selected day's events below the calendar grid using theme-responsive classes
  if (evEl) {
    if (!calendarSelected) {
      evEl.innerHTML = `<div class="hk-cal-empty-prompt">
        💡 Click any date cell with a yellow/lime dot above to view assignments due on that day.
      </div>`;
    } else {
      const dayEvents = eventsOnDay[calendarSelected] || [];
      if (dayEvents.length === 0) {
        evEl.innerHTML = `<div class="hk-cal-empty-prompt">No assignments due on this date.</div>`;
      } else {
        const [y, m, d] = calendarSelected.split("-");
        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        const dateLabel = dateObj.toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        });

        evEl.innerHTML = `
          <div class="hk-cal-date-heading">
            <span>📅 ${escapeHtml(dateLabel)}</span>
            <span class="hk-cal-count">${dayEvents.length} ASSIGNMENT${dayEvents.length !== 1 ? "S" : ""}</span>
          </div>
          ${dayEvents.map((event) => {
            const assignment = event.assignment;
            const course = event.course;
            const title = cleanHtmlTitle(assignment.title_html) || "Assignment";
            const courseName = course.course_name || assignment.course_name || "Course";
            const type = (assignment.assignment_type || course.category || "ASSIGNMENT").toUpperCase();
            const timeStr = event.deadline ? event.deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "No time";
            const isDone = Boolean(event.completed);

            return `
              <div class="hk-cal-event-item">
                <div style="min-width:0;flex:1;">
                  <div class="hk-cal-event-item-title">${escapeHtml(title)}</div>
                  <div class="hk-cal-event-item-meta">${escapeHtml(courseName)} · ${escapeHtml(type)} · ⏰ Due ${escapeHtml(timeStr)}</div>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                  <span class="badge badge--${isDone ? "submitted" : "pending"}" style="font-size:10px;padding:4px 8px;font-weight:700;">${isDone ? "DONE" : "NOT DONE"}</span>
                  <button type="button" class="hk-register-btn" onclick="openAssignmentDetails(${Number(assignment.assignment_id)}, '${escapeJsString(assignment.assignment_type || "")}')" style="white-space:nowrap;font-size:10px;padding:6px 12px;cursor:pointer;">DETAILS ↗</button>
                </div>
              </div>
            `;
          }).join("")}
        `;
      }
    }
  }

  // Render unscheduled assignments if any
  if (unscheduled) {
    unscheduled.innerHTML = unscheduledEvents.length
      ? `<div class="unscheduled-header"><div><div class="eyebrow">NO DATE ATTACHED</div><h2>Unscheduled assignments</h2></div><span>${unscheduledEvents.length}</span></div><div class="unscheduled-grid">${unscheduledEvents.map((event) => `<button class="unscheduled-card" onclick="openAssignmentDetails(${Number(event.assignment.assignment_id)}, '${escapeJsString(event.assignment.assignment_type || "")}')"><strong>${escapeHtml(cleanHtmlTitle(event.assignment.title_html) || "Assignment")}</strong><span>${escapeHtml(event.course.course_name || event.assignment.course_name || "Course")}</span><small>${event.completed ? "Done" : "Not done"}</small></button>`).join("")}</div>`
      : "";
  }
}

// Backward compatible alias for calendar view changes
function setCalendarView(view) {
  calendarView = view;
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
    cleanHtmlTitle(assignment.title_html) || "Assignment";
  const description =
    assignment.unit_name ||
    "Assignment details from the connected learning platform.";
  content.innerHTML = `<div class="course-detail-kicker">${escapeHtml(assignment.assignment_type || "ASSIGNMENT")} · ${escapeHtml(course.course_name || assignment.course_name || "COURSE")}</div><h2 id="courseDetailsTitle">${escapeHtml(title)}</h2><p class="course-detail-description">${escapeHtml(description)}</p><div class="course-detail-status"><span class="badge badge--${event.completed ? "submitted" : "pending"}">${event.completed ? "DONE" : "NOT DONE"}</span></div><dl class="course-detail-list"><div><dt>COURSE</dt><dd>${escapeHtml(course.course_name || assignment.course_name || "Not provided")}</dd></div><div><dt>TYPE</dt><dd>${escapeHtml(assignment.assignment_type || "Assignment")}</dd></div><div><dt>UNIT</dt><dd>${escapeHtml(assignment.unit_name || "Not provided")}</dd></div><div><dt>DUE DATE</dt><dd>${event.deadline ? escapeHtml(formatCalendarDate(event.deadline, { dateStyle: "medium" })) : "No date provided"}</dd></div></dl><div class="course-detail-actions"><button class="btn btn--primary course-detail-cta" ${event.deadline ? `onclick="addAssignmentToCalendar(${Number(assignment.assignment_id)}, '${escapeJsString(assignment.assignment_type || "")}')"` : "disabled"}>${event.deadline ? "ADD TO CALENDAR" : "NO DATE TO ADD"} <span>＋</span></button><button class="btn btn--ghost course-detail-cta" onclick="closeCourseDetails(); navigateTo('tasks')">OPEN ASSIGNMENT <span>→</span></button></div>`;
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

// Returns a unique string key for an assignment item.
function getAssignmentKey(item) {
  if (!item) return "";
  return `${Number(item.assignment_id)}:${item.assignment_type || ""}`;
}

// Determines the urgency priority for an assignment based on status and due date.
function getAssignmentPriority(item) {
  if (isSubmitted(item)) return "low";
  if (isAssignmentOverdue(item)) return "high";
  const d = parseVolpDate(item.due_date_raw);
  if (!d) return "low";
  const msRemaining = d.getTime() - Date.now();
  if (msRemaining <= 48 * 60 * 60 * 1000) return "high";
  if (msRemaining <= 7 * 24 * 60 * 60 * 1000) return "medium";
  return "low";
}

// Determines which chronological phase an assignment belongs to.
function getAssignmentPhase(item) {
  if (isSubmitted(item)) return "completed";
  if (isAssignmentOverdue(item)) return "delayed";
  const d = parseVolpDate(item.due_date_raw);
  if (!d) return "future";
  const msDiff = d.getTime() - Date.now();
  const daysDiff = msDiff / (24 * 60 * 60 * 1000);
  if (daysDiff <= 7) return "ongoing";
  if (daysDiff <= 30) return "upcoming";
  return "future";
}

// Computes all 5 chronological phases dynamically from active assignment data.
function computeChronologicalPhases(activeAssignments) {
  const formatShortDate = (d) => {
    if (!d || isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const phaseDefs = [
    {
      id: "delayed",
      order: 1,
      name: "Phase 1: Delayed / Overdue",
      subtitle: "Missed submission deadlines requiring immediate resolution",
      status: "delayed",
      statusLabel: "DELAYED",
      defaultTimings: "Overdue past deadline",
      computeDates: (items) => {
        const dates = items.map(a => parseVolpDate(a.due_date_raw)).filter(Boolean);
        if (dates.length === 0) return { start: "Past Deadlines", end: "Yesterday", text: "Past due window" };
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        return {
          start: formatShortDate(minDate),
          end: "Yesterday",
          text: `${formatShortDate(minDate)} — Yesterday`
        };
      }
    },
    {
      id: "ongoing",
      order: 2,
      name: "Phase 2: Current / Ongoing",
      subtitle: "Active assignments due within the next 7 days",
      status: "ongoing",
      statusLabel: "ONGOING",
      defaultTimings: "Active 7-day milestone window",
      computeDates: () => {
        const endD = new Date(Date.now() + 7 * 86400000);
        return {
          start: "Today",
          end: formatShortDate(endD),
          text: `Today — ${formatShortDate(endD)}`
        };
      }
    },
    {
      id: "upcoming",
      order: 3,
      name: "Phase 3: Upcoming (8–30 Days)",
      subtitle: "Approaching coursework scheduled for the coming month",
      status: "upcoming",
      statusLabel: "UPCOMING",
      defaultTimings: "Approaching deadline window",
      computeDates: () => {
        const startD = new Date(Date.now() + 8 * 86400000);
        const endD = new Date(Date.now() + 30 * 86400000);
        return {
          start: formatShortDate(startD),
          end: formatShortDate(endD),
          text: `${formatShortDate(startD)} — ${formatShortDate(endD)}`
        };
      }
    },
    {
      id: "future",
      order: 4,
      name: "Phase 4: Future / Extended",
      subtitle: "Assignments scheduled beyond 30 days or pending dates",
      status: "upcoming",
      statusLabel: "UPCOMING",
      defaultTimings: "Syllabus roadmap & later schedule",
      computeDates: (items) => {
        const dates = items.map(a => parseVolpDate(a.due_date_raw)).filter(Boolean);
        if (dates.length === 0) return { start: "Day 31+", end: "Term End", text: "Scheduled Ahead" };
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        return {
          start: "Day 31+",
          end: formatShortDate(maxDate),
          text: `Day 31+ — ${formatShortDate(maxDate)}`
        };
      }
    },
    {
      id: "completed",
      order: 5,
      name: "Phase 5: Completed & Verified",
      subtitle: "Successfully submitted and archived assignments",
      status: "completed",
      statusLabel: "COMPLETED",
      defaultTimings: "Verified submissions archived",
      computeDates: () => {
        return {
          start: "Completed",
          end: "Verified",
          text: "All Completed Submissions"
        };
      }
    }
  ];

  return phaseDefs.map((def) => {
    const items = activeAssignments.filter((a) => getAssignmentPhase(a) === def.id);
    const dateInfo = def.computeDates(items);
    const totalItems = items.length;
    const completedItems = items.filter(isSubmitted).length;
    const pendingItems = totalItems - completedItems;
    const remainingItems = pendingItems;
    const selectedCount = items.filter((a) => selectedAssignments.has(getAssignmentKey(a))).length;
    const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : (def.id === "completed" ? 100 : 0);

    return {
      id: def.id,
      order: def.order,
      name: def.name,
      subtitle: def.subtitle,
      status: def.status,
      statusLabel: def.statusLabel,
      startDate: dateInfo.start,
      endDate: dateInfo.end,
      dateRangeText: dateInfo.text,
      timings: def.defaultTimings,
      items,
      totalItems,
      completedItems,
      pendingItems,
      remainingItems,
      selectedItems: selectedCount,
      progressPercent
    };
  });
}

// Sorts assignment items by the active sort criteria.
function sortAssignments(items) {
  const sorted = [...items];
  switch (currentSortOption) {
    case "due_asc":
      return sorted.sort((a, b) => {
        const da = parseVolpDate(a.due_date_raw);
        const db = parseVolpDate(b.due_date_raw);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.getTime() - db.getTime();
      });
    case "due_desc":
      return sorted.sort((a, b) => {
        const da = parseVolpDate(a.due_date_raw);
        const db = parseVolpDate(b.due_date_raw);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return db.getTime() - da.getTime();
      });
    case "course_asc":
      return sorted.sort((a, b) =>
        String(a.course_name || "").localeCompare(String(b.course_name || ""))
      );
    case "title_asc":
      return sorted.sort((a, b) => {
        const ta = cleanHtmlTitle(a.title_html);
        const tb = cleanHtmlTitle(b.title_html);
        return ta.localeCompare(tb);
      });
    default:
      return sorted;
  }
}

// Filters assignments according to search keywords and re-renders the task view.
function filterTasks() {
  const input = document.getElementById("taskSearchInput");
  const clearBtn = document.getElementById("taskSearchClearBtn");
  currentSearchQuery = input ? input.value.trim().toLowerCase() : "";
  if (clearBtn) {
    clearBtn.style.display = currentSearchQuery ? "block" : "none";
  }
  renderTasksView();
}

// Clears the search text input.
function clearSearchInput() {
  const input = document.getElementById("taskSearchInput");
  const clearBtn = document.getElementById("taskSearchClearBtn");
  if (input) input.value = "";
  if (clearBtn) clearBtn.style.display = "none";
  currentSearchQuery = "";
  renderTasksView();
}

// Applies a status filter to assignments and updates active filter buttons.
function setStatusFilter(filter, el) {
  currentStatusFilter = filter;
  document
    .querySelectorAll("#statusFilterGroup .filter-btn")
    .forEach((b) => b.classList.remove("active"));
  if (el) {
    el.classList.add("active");
  } else {
    document.querySelectorAll("#statusFilterGroup .filter-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.filter === filter);
    });
  }
  renderTasksView();
}

// Applies an assignment type filter and updates active filter buttons.
function setTypeFilter(filter, el) {
  currentTypeFilter = filter;
  document
    .querySelectorAll("#typeFilterGroup .filter-btn")
    .forEach((b) => b.classList.remove("active"));
  if (el) {
    el.classList.add("active");
  }
  const typeSelect = document.getElementById("filterTypeSelect");
  if (typeSelect) typeSelect.value = filter;
  renderTasksView();
}

// Applies a subject filter to assignments and re-renders the task view.
function setSubjectFilter(filter) {
  currentSubjectFilter = filter || "all";
  renderTasksView();
}

// Sets the active phase filter.
function setPhaseFilter(phaseId) {
  currentPhaseFilter = phaseId || "all";
  const sel = document.getElementById("filterPhaseSelect");
  if (sel) sel.value = currentPhaseFilter;
  renderTasksView();
}

// Toggles or clears the active phase filter.
function togglePhaseFilter(phaseId) {
  if (currentPhaseFilter === phaseId) {
    currentPhaseFilter = "all";
  } else {
    currentPhaseFilter = phaseId;
  }
  const sel = document.getElementById("filterPhaseSelect");
  if (sel) sel.value = currentPhaseFilter;
  renderTasksView();
}

// Clears phase filter.
function clearPhaseFilter() {
  currentPhaseFilter = "all";
  const sel = document.getElementById("filterPhaseSelect");
  if (sel) sel.value = "all";
  renderTasksView();
}

// Sets priority filter.
function setPriorityFilter(priority) {
  currentPriorityFilter = priority || "all";
  renderTasksView();
}

// Sets progress filter.
function setProgressFilter(progress) {
  currentProgressFilter = progress || "all";
  renderTasksView();
}

// Sets date range filter from inputs.
function setDateRangeFilter() {
  const s = document.getElementById("filterStartDateInput");
  const e = document.getElementById("filterEndDateInput");
  currentStartDateFilter = s ? s.value : "";
  currentEndDateFilter = e ? e.value : "";
  renderTasksView();
}

// Sets sort option.
function setSortOption(sortKey) {
  currentSortOption = sortKey || "due_asc";
  renderTasksView();
}
window.setSortOption = setSortOption;
window.setTaskSort = setSortOption;

// Toggles advanced filter panel visibility.
function toggleAdvancedFilterPanel(force) {
  const panel = document.getElementById("advancedFilterPanel");
  if (!panel) return;
  if (typeof force === "boolean") {
    isAdvancedFilterOpen = force;
  } else {
    isAdvancedFilterOpen = !isAdvancedFilterOpen;
  }
  panel.style.display = isAdvancedFilterOpen ? "block" : "none";
}

// Toggles chronological phase section collapse.
function togglePhaseSection() {
  const grid = document.getElementById("phaseCardsGrid");
  const icon = document.getElementById("phaseCollapseIcon");
  const label = document.getElementById("phaseCollapseLabel");
  if (!grid) return;
  isPhaseSectionCollapsed = !isPhaseSectionCollapsed;
  grid.classList.toggle("collapsed", isPhaseSectionCollapsed);
  if (icon) icon.textContent = isPhaseSectionCollapsed ? "▼" : "▲";
  if (label) label.textContent = isPhaseSectionCollapsed ? "EXPAND" : "COLLAPSE";
}

// Resets all filters back to default values.
function resetAllFilters() {
  currentSearchQuery = "";
  currentStatusFilter = "all";
  currentTypeFilter = "all";
  currentSubjectFilter = "all";
  currentPhaseFilter = "all";
  currentPriorityFilter = "all";
  currentProgressFilter = "all";
  currentStartDateFilter = "";
  currentEndDateFilter = "";
  currentSortOption = "due_asc";

  const searchInput = document.getElementById("taskSearchInput");
  if (searchInput) searchInput.value = "";
  const clearBtn = document.getElementById("taskSearchClearBtn");
  if (clearBtn) clearBtn.style.display = "none";

  document.querySelectorAll("#statusFilterGroup .filter-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.filter === "all");
  });
  document.querySelectorAll("#typeFilterGroup .filter-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.filter === "all");
  });

  const subSelect = document.getElementById("subjectFilterSelect");
  if (subSelect) subSelect.value = "all";

  const phaseSelect = document.getElementById("filterPhaseSelect");
  if (phaseSelect) phaseSelect.value = "all";

  const prioritySelect = document.getElementById("filterPrioritySelect");
  if (prioritySelect) prioritySelect.value = "all";

  const progressSelect = document.getElementById("filterProgressSelect");
  if (progressSelect) progressSelect.value = "all";

  const typeSelect = document.getElementById("filterTypeSelect");
  if (typeSelect) typeSelect.value = "all";

  const sortSelect = document.getElementById("taskSortSelect");
  if (sortSelect) sortSelect.value = "due_asc";

  const startInput = document.getElementById("filterStartDateInput");
  if (startInput) startInput.value = "";

  const endInput = document.getElementById("filterEndDateInput");
  if (endInput) endInput.value = "";

  renderTasksView();
}

// Applies advanced filters and closes panel.
function applyAdvancedFilters() {
  toggleAdvancedFilterPanel(false);
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

  select.innerHTML = '<option value="all">ALL COURSES</option>';
  activeCourses.forEach((course) => {
    const option = document.createElement("option");
    option.value = String(course.colid);
    option.textContent =
      course.course_name || course.crsid || `COURSE ${course.colid}`;
    select.appendChild(option);
  });
  select.value = currentSubjectFilter;
}

// Filters raw assignments by subject, search query, type, status, phase, priority, progress, and date range.
function getFilteredAssignments() {
  const blockedCourseIds = getBlockedCourseIds();

  const filtered = rawAssignments.filter((item) => {
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

    // Progress filter
    if (currentProgressFilter !== "all") {
      if (currentProgressFilter === "completed" && !submitted) return false;
      if (currentProgressFilter === "in_progress" && submitted) return false;
    }

    // Date range filter
    if (currentStartDateFilter || currentEndDateFilter) {
      const itemDate = parseVolpDate(item.due_date_raw);
      if (!itemDate) return false;
      if (currentStartDateFilter) {
        const startLimit = new Date(currentStartDateFilter + "T00:00:00");
        if (itemDate < startLimit) return false;
      }
      if (currentEndDateFilter) {
        const endLimit = new Date(currentEndDateFilter + "T23:59:59");
        if (itemDate > endLimit) return false;
      }
    }

    return true;
  });

  return sortAssignments(filtered);
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
// Prioritizes unblocked courses first; if fewer than 6, fills remaining slots with blocked courses.
function renderDashboardProjectsGrid() {
  const container = document.getElementById("dashboardProjectsGrid");
  if (!container) return;

  container.innerHTML = "";
  const blockedIds = getBlockedCourseIds();
  const isCourseBlocked = (c) => Boolean(c.is_blocked) || blockedIds.has(Number(c.colid));

  // Prioritize unblocked courses first; if fewer than 6, fill remaining slots with blocked courses
  const unblocked = rawCourses.filter((c) => !isCourseBlocked(c));
  const blocked = rawCourses.filter((c) => isCourseBlocked(c));
  const displayCourses = [...unblocked, ...blocked].slice(0, 6);

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
    const isBlocked = isCourseBlocked(course);

    const card = document.createElement("div");
    card.className = "project-card";
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-title">${escapeHtml(course.course_name)}</div>
        <ul class="project-card-meta-list">
          <li><span class="meta-key">Course Code:</span> ${escapeHtml(course.crsid ? String(course.crsid) : "N/A")}</li>
          <li><span class="meta-key">Semester:</span> ${escapeHtml(course.semester || "N/A")}</li>
          <li><span class="meta-key">Academic Year:</span> ${escapeHtml(course.academic_year || "N/A")}</li>
          <li><span class="meta-key">Status:</span> ${isBlocked ? '<span style="color:var(--danger)">BLOCKED / MUTED</span>' : '<span style="color:var(--success)">ACTIVE</span>'}</li>
          <li><span class="meta-key">Assignments:</span> ${courseAssignments.length} total (${pendingCount} pending)</li>
        </ul>
      </div>
      <div class="project-card-footer">
        <span class="meta-text" style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-secondary);">${course.crsid ? escapeHtml(String(course.crsid)) : ""}</span>
        <button class="btn btn--sm ${isBlocked ? "btn--success" : "btn--ghost"}" onclick="toggleCourseBlock(${course.colid}, '${escapeJsString(course.course_name)}', ${Boolean(isBlocked)})">
          ${isBlocked ? "UNBLOCK" : "BLOCK"}
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
  // Sort pending assignments by earliest due date ascending so truly urgent deadlines appear first
  const pendingItems = rawAssignments
    .filter(
      (a) =>
        !blockedCourseIds.has(Number(a.colid)) &&
        !isSubmitted(a) &&
        !isAssignmentBlocked(a),
    )
    .sort((a, b) => {
      const da = parseVolpDate(a.due_date_raw);
      const db = parseVolpDate(b.due_date_raw);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.getTime() - db.getTime();
    })
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
      cleanHtmlTitle(item.title_html) || "Assignment";

    tr.innerHTML = `
      <td><span class="type-badge ${typeBadgeClass}">${typeLabel}</span></td>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(item.course_name || "Course")}</span></td>
      <td>
        <div class="assignment-title">${escapeHtml(cleanTitle)}</div>
        ${item.unit_name ? `<div class="assignment-sub">${escapeHtml(item.unit_name)}</div>` : ""}
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
  const blockedCourseIds = getBlockedCourseIds();
  const activeAssignments = rawAssignments.filter(
    (a) => !blockedCourseIds.has(Number(a.colid)),
  );
  const filtered = getFilteredAssignments();

  // 1. Update overall and phase-wise stats banner
  renderPhaseStatsBanner(activeAssignments, filtered);

  // 2. Update chronological phase timeline cards
  renderPhaseTimeline(activeAssignments);

  // 3. Update active filter chips
  renderActiveFilterChips();

  // 4. Update helper text in advanced filter panel
  const matchHint = document.getElementById("filterMatchCountText");
  if (matchHint) {
    matchHint.textContent = `${filtered.length} of ${activeAssignments.length} assignments match active filters.`;
  }

  // 5. Render either Kanban or Table
  if (currentTaskView === "kanban") {
    renderKanbanBoard(filtered);
  } else {
    renderTasksTable(filtered);
  }

  // 6. Update Selection Management UI & Sticky Action Bar
  updateSelectionUI(filtered);
}

// Computes and renders metric counts for the overall tasks statistics banner.
function renderPhaseStatsBanner(activeAssignments, filteredAssignments) {
  const total = activeAssignments.length;
  const filtered = filteredAssignments.length;
  const selected = activeAssignments.filter((a) =>
    selectedAssignments.has(getAssignmentKey(a)),
  ).length;
  const completed = activeAssignments.filter(isSubmitted).length;
  const pending = total - completed;
  const overdueCount = activeAssignments.filter(isAssignmentOverdue).length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const totalEl = document.getElementById("overallTotalCount");
  const filteredEl = document.getElementById("overallFilteredCount");
  const urgentEl = document.getElementById("overallUrgentCount") || document.getElementById("overallSelectedCount");
  const completedEl = document.getElementById("overallCompletedCount");
  const pendingEl = document.getElementById("overallPendingCount");

  if (totalEl) totalEl.textContent = total;
  if (filteredEl) filteredEl.textContent = filtered;
  if (urgentEl) urgentEl.textContent = overdueCount;
  if (completedEl) completedEl.textContent = completed;
  if (pendingEl) pendingEl.textContent = pending;

  const urgentSub = document.getElementById("overallUrgentSub") || document.getElementById("overallSelectedSub");
  if (urgentSub) {
    urgentSub.textContent = overdueCount > 0 ? `${overdueCount} past deadline` : "Deadlines on track";
  }

  const completedSub = document.getElementById("overallCompletedSub");
  if (completedSub) {
    completedSub.textContent = `${completionRate}% overall progress`;
  }

  const pendingSub = document.getElementById("overallPendingSub");
  if (pendingSub) {
    pendingSub.textContent =
      overdueCount > 0
        ? `${overdueCount} OVERDUE / URGENT`
        : "All on schedule";
  }
}

// Renders the chronological phase cards grid dynamically from real data.
function renderPhaseTimeline(activeAssignments) {
  const grid = document.getElementById("phaseCardsGrid");
  const resetBtn = document.getElementById("phaseResetFilterBtn");
  if (!grid) return;

  if (resetBtn) {
    resetBtn.style.display =
      currentPhaseFilter !== "all" ? "inline-flex" : "none";
  }

  const phases = computeChronologicalPhases(activeAssignments);

  grid.innerHTML = phases
    .map((phase) => {
      const isActive = currentPhaseFilter === phase.id;
      const isAllSelected =
        phase.totalItems > 0 && phase.selectedItems === phase.totalItems;

      return `
        <div class="phase-card ${isActive ? "active" : ""} phase-card--${phase.status}" onclick="togglePhaseFilter('${phase.id}')" title="Click to filter by ${phase.name}">
          <div class="phase-card-header">
            <div class="phase-card-status-wrap">
              <span class="phase-status-dot phase-status-dot--${phase.status}"></span>
              <span class="phase-status-badge phase-status-badge--${phase.status}">${phase.statusLabel}</span>
            </div>
            <button type="button" class="phase-detail-btn" onclick="event.stopPropagation(); openPhaseDetailsModal('${phase.id}')" title="Inspect phase details & associated items">ℹ</button>
          </div>

          <div class="phase-card-title">${escapeHtml(phase.name)}</div>
          
          <div class="phase-card-dates">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>${escapeHtml(phase.dateRangeText)}</span>
          </div>

          <div class="phase-card-timing">${escapeHtml(phase.timings)}</div>

          <div class="phase-progress-wrap">
            <div class="phase-progress-meta">
              <span>COMPLETION</span>
              <span>${phase.progressPercent}%</span>
            </div>
            <div class="phase-progress-bar">
              <div class="phase-progress-fill phase-progress-fill--${phase.status}" style="width: ${phase.progressPercent}%;"></div>
            </div>
          </div>

          <div class="phase-metrics-grid">
            <div class="phase-metric" title="Total assignments in this phase">
              <span class="phase-metric-val">${phase.totalItems}</span>
              <span class="phase-metric-lbl">TOTAL</span>
            </div>
            <div class="phase-metric" title="Completed / submitted assignments">
              <span class="phase-metric-val" style="color:var(--success);">${phase.completedItems}</span>
              <span class="phase-metric-lbl">DONE</span>
            </div>
            <div class="phase-metric" title="Pending / remaining assignments">
              <span class="phase-metric-val" style="color:var(--warning);">${phase.pendingItems}</span>
              <span class="phase-metric-lbl">PENDING</span>
            </div>
            <div class="phase-metric" title="Selected assignments in this phase">
              <span class="phase-metric-val" style="color:var(--cyan);">${phase.selectedItems}</span>
              <span class="phase-metric-lbl">SELECTED</span>
            </div>
          </div>

          <div class="phase-card-footer" onclick="event.stopPropagation()">
            <button type="button" class="btn btn--sm ${isActive ? "btn--primary" : "btn--ghost"}" onclick="togglePhaseFilter('${phase.id}')">
              ${isActive ? "FILTERED ✓" : "FILTER"}
            </button>
            <button type="button" class="btn btn--sm btn--ghost" onclick="toggleSelectAllInPhase('${phase.id}')" ${phase.totalItems === 0 ? "disabled" : ""} title="${isAllSelected ? "Deselect all items in phase" : "Select all items in phase"}">
              ${isAllSelected ? "DESELECT" : `SELECT ALL (${phase.totalItems})`}
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

// Renders removable filter chips for all active filters.
function renderActiveFilterChips() {
  const bar = document.getElementById("activeFilterChipsBar");
  const list = document.getElementById("activeFilterChipsList");
  const badge = document.getElementById("filterActiveBadge");
  if (!bar || !list) return;

  const chips = [];

  if (currentSearchQuery) {
    chips.push({
      type: "search",
      label: `Search: "${currentSearchQuery}"`,
      clear: () => clearSearchInput(),
    });
  }

  if (currentStatusFilter !== "all") {
    chips.push({
      type: "status",
      label: `Status: ${currentStatusFilter.toUpperCase()}`,
      clear: () => {
        setStatusFilter("all");
        document
          .querySelectorAll("#statusFilterGroup .filter-btn")
          .forEach((b) => {
            b.classList.toggle("active", b.dataset.filter === "all");
          });
      },
    });
  }

  if (currentSubjectFilter !== "all") {
    const course = rawCourses.find(
      (c) => String(c.colid) === String(currentSubjectFilter),
    );
    chips.push({
      type: "course",
      label: `Course: ${course?.course_name || "Course #" + currentSubjectFilter}`,
      clear: () => {
        currentSubjectFilter = "all";
        const sel = document.getElementById("subjectFilterSelect");
        if (sel) sel.value = "all";
        renderTasksView();
      },
    });
  }

  if (currentProgressFilter !== "all") {
    chips.push({
      type: "progress",
      label: `Progress: ${currentProgressFilter === "completed" ? "COMPLETED" : "IN PROGRESS"}`,
      clear: () => {
        currentProgressFilter = "all";
        const sel = document.getElementById("filterProgressSelect");
        if (sel) sel.value = "all";
        renderTasksView();
      },
    });
  }

  if (currentTypeFilter !== "all") {
    chips.push({
      type: "type",
      label: `Type: ${currentTypeFilter}`,
      clear: () => {
        setTypeFilter("all");
        const sel = document.getElementById("filterTypeSelect");
        if (sel) sel.value = "all";
      },
    });
  }

  if (currentStartDateFilter || currentEndDateFilter) {
    const rangeText = `${currentStartDateFilter || "Start"} → ${currentEndDateFilter || "End"}`;
    chips.push({
      type: "dateRange",
      label: `Date: ${rangeText}`,
      clear: () => {
        currentStartDateFilter = "";
        currentEndDateFilter = "";
        const s = document.getElementById("filterStartDateInput");
        const e = document.getElementById("filterEndDateInput");
        if (s) s.value = "";
        if (e) e.value = "";
        renderTasksView();
      },
    });
  }

  if (currentSortOption !== "due_asc") {
    const sortLabels = {
      due_desc: "Due Date (Furthest First)",
      course_asc: "Course (A-Z)",
      title_asc: "Title (A-Z)",
    };
    chips.push({
      type: "sort",
      label: `Sort: ${sortLabels[currentSortOption] || currentSortOption}`,
      clear: () => {
        currentSortOption = "due_asc";
        const sel = document.getElementById("taskSortSelect");
        if (sel) sel.value = "due_asc";
        renderTasksView();
      },
    });
  }

  if (badge) {
    if (chips.length > 0) {
      badge.textContent = chips.length;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  }

  if (chips.length === 0) {
    bar.style.display = "none";
    list.innerHTML = "";
    return;
  }

  bar.style.display = "flex";
  list.innerHTML = "";

  chips.forEach((chip) => {
    const el = document.createElement("span");
    el.className = "filter-chip";
    el.innerHTML = `
      <span>${escapeHtml(chip.label)}</span>
      <button type="button" class="filter-chip-remove" title="Remove filter" aria-label="Remove ${escapeHtml(chip.label)}">✕</button>
    `;
    el.querySelector(".filter-chip-remove").addEventListener("click", () => {
      chip.clear();
    });
    list.appendChild(el);
  });
}

// Updates the sticky selection bar and master checkboxes.
function updateSelectionUI(filteredItems) {
  const bar = document.getElementById("selectionActionBar");
  const countEl = document.getElementById("selectionBarCount");
  const filteredEl = document.getElementById("selectionBarFiltered");
  const totalEl = document.getElementById("selectionBarTotal");
  const masterCb = document.getElementById("masterTableCheckbox");

  const blockedCourseIds = getBlockedCourseIds();
  const activeAssignments = rawAssignments.filter(
    (a) => !blockedCourseIds.has(Number(a.colid)),
  );

  const selectedCount = activeAssignments.filter((a) =>
    selectedAssignments.has(getAssignmentKey(a)),
  ).length;
  const filteredCount = filteredItems
    ? filteredItems.length
    : getFilteredAssignments().length;

  if (bar) {
    bar.style.display = selectedCount > 0 ? "flex" : "none";
  }
  if (countEl) countEl.textContent = selectedCount;
  if (filteredEl) filteredEl.textContent = filteredCount;
  if (totalEl) totalEl.textContent = activeAssignments.length;

  if (masterCb && filteredItems) {
    const allFilteredSelected =
      filteredItems.length > 0 &&
      filteredItems.every((a) => selectedAssignments.has(getAssignmentKey(a)));
    masterCb.checked = allFilteredSelected;
    masterCb.indeterminate =
      !allFilteredSelected &&
      filteredItems.some((a) => selectedAssignments.has(getAssignmentKey(a)));
  }
}

// Toggles individual assignment selection.
function toggleAssignmentSelection(assignmentId, assignmentType, isChecked) {
  const key = `${Number(assignmentId)}:${assignmentType || ""}`;
  if (isChecked) {
    selectedAssignments.add(key);
  } else {
    selectedAssignments.delete(key);
  }
  renderTasksView();
}

// Selects or deselects all currently filtered assignments.
function toggleSelectAllFiltered(isChecked) {
  const filtered = getFilteredAssignments();
  filtered.forEach((a) => {
    const key = getAssignmentKey(a);
    if (isChecked) {
      selectedAssignments.add(key);
    } else {
      selectedAssignments.delete(key);
    }
  });
  renderTasksView();
}

// Selects all currently filtered assignments.
function selectAllFilteredAssignments() {
  toggleSelectAllFiltered(true);
}

// Deselects all assignments across all phases.
function deselectAllAssignments() {
  selectedAssignments.clear();
  renderTasksView();
}

// Selects or deselects all items within a specific phase.
function toggleSelectAllInPhase(phaseId) {
  const blockedCourseIds = getBlockedCourseIds();
  const activeAssignments = rawAssignments.filter(
    (a) => !blockedCourseIds.has(Number(a.colid)),
  );
  const phaseItems = activeAssignments.filter(
    (a) => getAssignmentPhase(a) === phaseId,
  );
  const allSelected =
    phaseItems.length > 0 &&
    phaseItems.every((a) => selectedAssignments.has(getAssignmentKey(a)));

  phaseItems.forEach((a) => {
    const key = getAssignmentKey(a);
    if (allSelected) {
      selectedAssignments.delete(key);
    } else {
      selectedAssignments.add(key);
    }
  });
  renderTasksView();
}

// Batch blocks or restores selected assignments from notifications.
async function batchBlockSelected(blockStatus) {
  const blockedCourseIds = getBlockedCourseIds();
  const activeAssignments = rawAssignments.filter(
    (a) => !blockedCourseIds.has(Number(a.colid)),
  );
  const selectedList = activeAssignments.filter((a) =>
    selectedAssignments.has(getAssignmentKey(a)),
  );

  if (selectedList.length === 0) return;

  const actionText = blockStatus ? "mute / block" : "unmute / restore";
  openModal(
    `${actionText.toUpperCase()} ${selectedList.length} ASSIGNMENTS`,
    `Are you sure you want to ${actionText} ${selectedList.length} selected assignments from daily Telegram notifications?`,
    async () => {
      let successCount = 0;
      for (const item of selectedList) {
        try {
          await fetch("/api/blocked-assignments", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getAuthHeaders(),
            },
            body: JSON.stringify({
              email: currentUser.email,
              assignment_id: item.assignment_id,
              assignment_type: item.assignment_type,
              course_name: item.course_name,
              title_hint: cleanHtmlTitle(item.title_html),
              is_blocked: Boolean(blockStatus),
            }),
          });
          item.is_blocked = Boolean(blockStatus);
          successCount++;
        } catch (_) {}
      }
      await loadBlockedData();
      selectedAssignments.clear();
      showToast(
        `Successfully ${blockStatus ? "muted" : "unmuted"} ${successCount} assignments`,
        "success",
      );
      renderAllViews();
    },
  );
}

// Generates and downloads a unified .ICS calendar file for all selected assignments.
function batchExportCalendarSelected() {
  const blockedCourseIds = getBlockedCourseIds();
  const activeAssignments = rawAssignments.filter(
    (a) => !blockedCourseIds.has(Number(a.colid)),
  );
  const selectedList = activeAssignments.filter((a) =>
    selectedAssignments.has(getAssignmentKey(a)),
  );

  const exportable = selectedList.filter((a) =>
    parseVolpDate(a.due_date_raw),
  );

  if (exportable.length === 0) {
    showToast(
      "None of the selected assignments have usable deadline dates.",
      "warning",
    );
    return;
  }

  const toIcsDate = (date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");

  const vevents = exportable.map((assignment) => {
    const due = parseVolpDate(assignment.due_date_raw);
    const start = new Date(due.getTime() - 60 * 60 * 1000);
    const title =
      cleanHtmlTitle(assignment.title_html) ||
      `Assignment #${assignment.assignment_id}`;
    return [
      "BEGIN:VEVENT",
      `UID:volp-${assignment.assignment_id}-${assignment.assignment_type || "item"}@volp`,
      `DTSTAMP:${toIcsDate(new Date())}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(due)}`,
      `SUMMARY:${title.replace(/[\n,;]/g, " ")}`,
      `DESCRIPTION:${String(assignment.course_name || "Course").replace(/[\n,;]/g, " ")}`,
      "END:VEVENT",
    ].join("\r\n");
  });

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VOLP//Batch Assignment Calendar//EN",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");

  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([ics], { type: "text/calendar;charset=utf-8" }),
  );
  link.download = `volp-selected-assignments-${exportable.length}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(
    `Exported ${exportable.length} assignments to calendar file.`,
    "success",
  );
}

// Opens the detailed phase inspection drawer with comprehensive information.
function openPhaseDetailsModal(phaseId) {
  const overlay = document.getElementById("phaseDetailsOverlay");
  const content = document.getElementById("phaseDrawerContent") || document.getElementById("phaseModalContent");
  const kicker = document.getElementById("phaseDrawerKicker") || document.getElementById("phaseModalKicker");
  const title = document.getElementById("phaseDrawerTitle") || document.getElementById("phaseModalTitle");
  if (!overlay || !content) return;

  const blockedCourseIds = getBlockedCourseIds();
  const activeAssignments = rawAssignments.filter(
    (a) => !blockedCourseIds.has(Number(a.colid)),
  );
  const phases = computeChronologicalPhases(activeAssignments);
  const phase = phases.find((p) => p.id === phaseId);
  if (!phase) return;

  if (kicker) kicker.textContent = `${phase.statusLabel} MILESTONE WINDOW`;
  if (title) title.textContent = phase.name.toUpperCase();

  const isAllSelected =
    phase.totalItems > 0 && phase.selectedItems === phase.totalItems;

  content.innerHTML = `
    <!-- Phase Overview Card -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <span class="phase-status-badge phase-status-badge--${phase.status}">${phase.statusLabel}</span>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);">${escapeHtml(phase.timings)}</span>
      </div>
      <p style="font-size:13px;color:var(--text);margin:0 0 12px 0;">${escapeHtml(phase.subtitle)}</p>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:8px;padding-top:12px;border-top:1px solid var(--border);">
        <div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--muted);display:block;">WINDOW START</span>
          <strong style="font-family:var(--font-mono);font-size:12px;color:var(--text);">${escapeHtml(phase.startDate)}</strong>
        </div>
        <div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--muted);display:block;">WINDOW END</span>
          <strong style="font-family:var(--font-mono);font-size:12px;color:var(--text);">${escapeHtml(phase.endDate)}</strong>
        </div>
        <div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--muted);display:block;">PROGRESS RATE</span>
          <strong style="font-family:var(--font-mono);font-size:12px;color:var(--accent);">${phase.progressPercent}%</strong>
        </div>
      </div>
    </div>

    <!-- Phase Metrics Breakdown -->
    <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;text-align:center;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;">
        <div style="font-family:var(--font-mono);font-size:16px;font-weight:700;">${phase.totalItems}</div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--muted);">TOTAL</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;">
        <div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:var(--success);">${phase.completedItems}</div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--muted);">COMPLETED</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;">
        <div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:var(--warning);">${phase.pendingItems}</div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--muted);">PENDING</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;">
        <div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:var(--cyan);">${phase.selectedItems}</div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--muted);">SELECTED</div>
      </div>
    </div>

    <!-- Clear Notice for Unavailable Details -->
    <div class="phase-detail-unavailable">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="8"/><line x1="12" y1="14" x2="12" y2="10"/><line x1="12" y1="6" x2="12.01" y2="6"/></svg>
      <span>Note: Instructor grading weightage, exact cutoff timestamps, and syllabus notes are not published by VOLP portal API.</span>
    </div>

    <!-- Actions Row -->
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <button type="button" class="btn btn--sm btn--primary" onclick="toggleSelectAllInPhase('${phase.id}'); openPhaseDetailsModal('${phase.id}');">
        ${isAllSelected ? "DESELECT ALL IN PHASE" : `SELECT ALL IN PHASE (${phase.totalItems})`}
      </button>
      <button type="button" class="btn btn--sm btn--ghost" onclick="setPhaseFilter('${phase.id}'); closePhaseDetailsModal();">
        FILTER DASHBOARD TO THIS PHASE →
      </button>
    </div>

    <!-- Items in this Phase -->
    <div>
      <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:1px;color:var(--text-secondary);margin-bottom:10px;">
        ASSIGNMENTS IN THIS PHASE (${phase.items.length})
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${
          phase.items.length === 0
            ? '<div style="color:var(--muted);font-family:var(--font-mono);font-size:12px;padding:16px;text-align:center;">No assignments in this phase.</div>'
            : phase.items
                .map((item) => {
                  const key = getAssignmentKey(item);
                  const isSelected = selectedAssignments.has(key);
                  const cleanTitle =
                    cleanHtmlTitle(item.title_html) ||
                    "Assignment #" + item.assignment_id;
                  const submitted = isSubmitted(item);
                  const overdue = isAssignmentOverdue(item);
                  const priority = getAssignmentPriority(item);
                  return `
            <div class="phase-detail-item-row">
              <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                <div style="min-width:0;">
                  <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(cleanTitle)}">${escapeHtml(cleanTitle)}</div>
                  <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-secondary);">${escapeHtml(item.course_name || "Course")} · ${escapeHtml(item.due_date_raw || "No Deadline")}</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                <span class="badge ${submitted ? "badge--submitted" : overdue ? "badge--overdue" : "badge--pending"}">
                  ${submitted ? "DONE" : overdue ? "OVERDUE" : "PENDING"}
                </span>
              </div>
            </div>
          `;
                })
                .join("")
        }
      </div>
    </div>
  `;

  overlay.classList.add("active");
}

// Closes the detailed phase inspection drawer.
function closePhaseDetailsModal(event) {
  if (
    !event ||
    event.target === document.getElementById("phaseDetailsOverlay")
  ) {
    document
      .getElementById("phaseDetailsOverlay")
      ?.classList.remove("active");
  }
}

// Populates the Kanban board columns with categorized assignment cards.
function renderKanbanBoard(items) {
  const container = document.getElementById("tasksKanbanView");
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; background: var(--surface); border: 1px dashed var(--border); border-radius: var(--radius-sm); padding: 36px 16px; text-align: center;">
        <div style="font-size: 32px; margin-bottom: 10px;">🔍</div>
        <div style="font-weight: 700; color: var(--text); font-size: 14px; margin-bottom: 6px;">NO ASSIGNMENTS MATCH CURRENT FILTERS</div>
        <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 16px;">Try adjusting your search query, status, phase, priority, or date range.</div>
        <button type="button" class="btn btn--primary btn--sm" onclick="resetAllFilters()">RESET ALL FILTERS</button>
      </div>
    `;
    return;
  }

  // Restore column skeleton if previously wiped by empty state
  if (!document.getElementById("kanbanColTodo")) {
    container.innerHTML = `
      <div class="kanban-column">
        <div class="kanban-column-header">
          <span class="status-dot status-dot--todo"></span>
          <span class="kanban-column-title">TO DO / OVERDUE</span>
        </div>
        <div id="kanbanColTodo" style="display:flex;flex-direction:column;gap:12px;"></div>
      </div>
      <div class="kanban-column">
        <div class="kanban-column-header">
          <span class="status-dot status-dot--progress"></span>
          <span class="kanban-column-title">IN PROGRESS / PENDING</span>
        </div>
        <div id="kanbanColProgress" style="display:flex;flex-direction:column;gap:12px;"></div>
      </div>
      <div class="kanban-column">
        <div class="kanban-column-header">
          <span class="status-dot status-dot--done"></span>
          <span class="kanban-column-title">DONE / SUBMITTED</span>
        </div>
        <div id="kanbanColDone" style="display:flex;flex-direction:column;gap:12px;"></div>
      </div>
    `;
  }

  const todoCol = document.getElementById("kanbanColTodo");
  const progressCol = document.getElementById("kanbanColProgress");
  const doneCol = document.getElementById("kanbanColDone");

  todoCol.innerHTML = "";
  progressCol.innerHTML = "";
  doneCol.innerHTML = "";

  const phaseLabels = {
    delayed: "PHASE 1",
    ongoing: "PHASE 2",
    upcoming: "PHASE 3",
    future: "PHASE 4",
    completed: "PHASE 5",
  };

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
      cleanHtmlTitle(item.title_html) || "Assignment";
    const key = getAssignmentKey(item);
    const isSelected = selectedAssignments.has(key);

    card.innerHTML = `
      <div class="kanban-card-top" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span class="type-badge ${typeBadgeClass}">${typeLabel}</span>
        <span class="kanban-card-course" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;" title="${escapeHtml(item.course_name || "Course")}">${escapeHtml(item.course_name || "Course")}</span>
      </div>

      <div class="kanban-card-title" title="${escapeHtml(cleanTitle)}" style="margin-top: 8px;">
        ${escapeHtml(cleanTitle)}
      </div>

      ${item.unit_name ? `<div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:6px;">${escapeHtml(item.unit_name)}</div>` : ""}

      <div style="font-family:var(--font-mono);font-size:10px;margin-top:10px;color:${overdue ? "var(--danger)" : "var(--text-secondary)"};">
        ${overdue ? "⚠ OVERDUE: " : "Due: "}${escapeHtml(item.due_date_raw || "No Deadline")}
      </div>

      <div class="kanban-card-footer" style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:6px;">
        <span class="badge ${submitted ? "badge--submitted" : item.is_blocked ? "badge--blocked" : overdue ? "badge--overdue" : "badge--pending"}">
          ${submitted ? "COMPLETED" : item.is_blocked ? "BLOCKED" : overdue ? "OVERDUE" : "PENDING"}
        </span>
        <div style="display:inline-flex;align-items:center;gap:5px;">
          ${assignmentCalendarButton(item)}
          <button type="button" class="btn btn--ghost btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${escapeJsString(item.assignment_type)}', '${escapeJsString(item.course_name)}', '${escapeJsString(cleanTitle)}', ${Boolean(item.is_blocked)})">
            ${item.is_blocked ? "RESTORE" : "BLOCK"}
          </button>
        </div>
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

  if (todoCol && todoCol.children.length === 0)
    todoCol.innerHTML =
      '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;text-align:center;">NO OVERDUE ASSIGNMENTS</div>';
  if (progressCol && progressCol.children.length === 0)
    progressCol.innerHTML =
      '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;text-align:center;">NO PENDING ASSIGNMENTS</div>';
  if (doneCol && doneCol.children.length === 0)
    doneCol.innerHTML =
      '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;text-align:center;">NO COMPLETED ASSIGNMENTS</div>';
}

// Populates the assignments data table view with filtered assignments.
function renderTasksTable(items) {
  const tbody = document.getElementById("tasksFullTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;color:var(--muted);padding:36px 16px;font-family:var(--font-mono);font-size:12px;">
          <div style="font-size: 28px; margin-bottom: 8px;">🔍</div>
          <div style="color: var(--text); font-weight: 700; margin-bottom: 4px;">NO MATCHING ASSIGNMENTS FOUND</div>
          <div style="margin-bottom: 12px; color: var(--text-secondary);">Try clearing or loosening active filter criteria.</div>
          <button type="button" class="btn btn--primary btn--sm" onclick="resetAllFilters()">RESET ALL FILTERS</button>
        </td>
      </tr>
    `;
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
      cleanHtmlTitle(item.title_html) || "Assignment";
    const key = getAssignmentKey(item);
    const isSelected = selectedAssignments.has(key);

    tr.innerHTML = `
      <td><span class="type-badge ${typeBadgeClass}">${typeLabel}</span></td>
      <td>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(item.course_name || "Course")}</span>
      </td>
      <td>
        <div class="assignment-title" title="${escapeHtml(cleanTitle)}">${escapeHtml(cleanTitle)}</div>
        ${item.unit_name ? `<div class="assignment-sub">${escapeHtml(item.unit_name)}</div>` : ""}
      </td>
      <td>
        <span class="meta-text" style="color: ${overdue ? "var(--danger)" : "var(--text-secondary)"};">
          ${overdue ? "⚠ " : ""}${escapeHtml(item.due_date_raw || "No Deadline")}
        </span>
      </td>
      <td>
        <span class="badge ${submitted ? "badge--submitted" : overdue ? "badge--overdue" : item.is_blocked ? "badge--blocked" : "badge--pending"}">
          ${submitted ? "COMPLETED" : overdue ? "OVERDUE" : item.is_blocked ? "BLOCKED" : "PENDING"}
        </span>
      </td>
      <td style="text-align:right">
        <div class="assignment-actions-wrap">
          ${assignmentCalendarButton(item)}
          <button type="button" class="btn btn--ghost btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${escapeJsString(item.assignment_type)}', '${escapeJsString(item.course_name)}', '${escapeJsString(cleanTitle)}', ${Boolean(item.is_blocked)})">
            ${item.is_blocked ? "RESTORE" : "BLOCK"}
          </button>
        </div>
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

  const blockedIds = getBlockedCourseIds();
  rawCourses.forEach((course) => {
    const isBlocked = Boolean(course.is_blocked) || blockedIds.has(Number(course.colid));
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
          <li><span class="meta-key">Course Code:</span> ${escapeHtml(course.crsid ? String(course.crsid) : "N/A")}</li>
          <li><span class="meta-key">Semester:</span> ${escapeHtml(course.semester || "N/A")}</li>
          <li><span class="meta-key">Academic Year:</span> ${escapeHtml(course.academic_year || "N/A")}</li>
          <li><span class="meta-key">Status:</span> ${isBlocked ? '<span style="color:var(--danger)">MUTED / BLOCKED</span>' : '<span style="color:var(--success)">ACTIVE</span>'}</li>
          <li><span class="meta-key">Assignments:</span> ${courseAssignments.length} total (${pendingCount} pending)</li>
        </ul>
      </div>
      <div class="project-card-footer">
        <span class="meta-text" style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-secondary);">${course.crsid ? escapeHtml(String(course.crsid)) : ""}</span>
        <button class="btn btn--sm ${isBlocked ? "btn--success" : "btn--danger"}" onclick="toggleCourseBlock(${course.colid}, '${escapeJsString(course.course_name)}', ${Boolean(isBlocked)})">
          ${isBlocked ? "RESTORE COURSE" : "BLOCK COURSE"}
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
          <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(c.crsid ? String(c.crsid) : "—")}</span></td>
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
      aTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px;font-family:var(--font-mono);font-size:11px;">NO BLOCKED ASSIGNMENTS</td></tr>`;
    } else {
      blockedA.forEach((a) => {
        const tr = document.createElement("tr");
        const cleanTitle =
          cleanHtmlTitle(a.title_html || a.title_hint) || "Assignment";
        tr.innerHTML = `
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

// Fetches the latest reminder logs directly from the MongoDB backend.
function fetchServerReminderLogs() {
  if (!currentUser?.token) return;
  fetch("/api/assignments/reminder-logs", { headers: { ...getAuthHeaders() } })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.logs && Array.isArray(data.logs)) {
        window.reminderLogs = data.logs.map((l) => ({
          title: l.trigger_type === "CRON" ? "AUTOMATED 8:00 PM CRON DISPATCH" : "MANUAL 8 PM TELEGRAM DISPATCH",
          message: l.message,
          time: new Date(l.created_at).toLocaleString(),
          success: l.status === "DELIVERED",
          status: l.status,
          recipient: l.recipient,
          pending_count: l.pending_count,
        }));
        if (currentUser?.email) {
          localStorage.setItem(
            `volp_reminder_logs_${currentUser.email}`,
            JSON.stringify(window.reminderLogs),
          );
        }
        renderRemindersView(true);
      }
    })
    .catch(() => {});
}

// Renders ONLY the reminder/dispatch logs view.
function renderRemindersView(skipFetch = false) {
  const list = document.getElementById("remindersTimelineList");
  if (!list) return;

  // Restore logs from localStorage if in-memory store is empty
  if (!window.reminderLogs && currentUser?.email) {
    try {
      const stored = localStorage.getItem(`volp_reminder_logs_${currentUser.email}`);
      if (stored) window.reminderLogs = JSON.parse(stored);
    } catch (_) {}
  }
  if (!window.reminderLogs) window.reminderLogs = [];

  // Fetch latest logs from backend if not skipped
  if (!skipFetch && currentUser?.token) {
    fetchServerReminderLogs();
  }

  let html = `
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div>
        <div style="font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--text-primary); letter-spacing: 0.05em; display: flex; align-items: center; gap: 8px;">
          <span>📋 8 PM DISPATCH &amp; NOTIFICATION LOGS</span>
          <span class="badge badge--submitted" style="font-size: 10px;">ACTIVE (8:00 PM IST)</span>
        </div>
        <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">
          Chronological record of automated 8:00 PM cron alerts and manual triggers
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button type="button" class="btn btn--ghost btn--sm" onclick="refreshReminderLogs()" title="Refresh latest logs">↻ REFRESH</button>
        ${window.reminderLogs && window.reminderLogs.length > 0 ? `<button type="button" class="btn btn--ghost btn--sm" onclick="clearReminderLogs()" title="Clear log history">CLEAR LOGS</button>` : ""}
      </div>
    </div>
  `;

  if (window.reminderLogs && window.reminderLogs.length > 0) {
    window.reminderLogs.forEach((log) => {
      const isDelivered = log.success || log.status === "DELIVERED";
      const isAwaiting = log.status === "AWAITING_TELEGRAM";
      const badgeClass = isDelivered
        ? "badge--submitted"
        : isAwaiting
        ? "badge--pending"
        : "badge--urgent";
      const badgeText = isDelivered
        ? "✓ DELIVERED"
        : isAwaiting
        ? "⚠ AWAITING BOT"
        : "✕ FAILED";
      const badgeStyle = isDelivered
        ? "background: rgba(103, 224, 130, 0.15); color: var(--accent); border: 1px solid var(--accent);"
        : isAwaiting
        ? "background: rgba(234, 179, 8, 0.15); color: var(--warning); border: 1px solid var(--warning);"
        : "background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid var(--danger);";

      html += `
        <div class="note-card" style="margin-bottom: 14px; border-left: 3px solid ${isDelivered ? "var(--accent)" : isAwaiting ? "var(--warning)" : "var(--danger)"};">
          <div class="note-card-header">
            <span style="font-family: var(--font-mono); font-weight: 700;">${escapeHtml(log.title)} — ${escapeHtml(log.time)}</span>
            <span class="badge ${badgeClass}" style="${badgeStyle}">${badgeText}</span>
          </div>
          <div class="note-card-body" style="font-size: 13px; line-height: 1.5; margin-bottom: 0;">
            ${escapeHtml(log.message)}
          </div>
        </div>
      `;
    });
  } else {
    html += `
      <div class="note-card" style="border-left: 3px solid var(--border-strong); background: rgba(255, 255, 255, 0.02); text-align: center; padding: 40px 20px;">
        <div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); letter-spacing: 0.05em;">
          NO DISPATCH LOGS RECORDED YET FOR THIS SESSION
        </div>
        <div style="font-size: 11px; color: var(--muted); margin-top: 6px;">
          The reminder engine automatically records alerts every day at 8:00 PM IST, or you can trigger an instant test above.
        </div>
      </div>
    `;
  }

  list.innerHTML = html;
}

// Refreshes the reminder logs from server.
function refreshReminderLogs() {
  showToast("Refreshing dispatch logs...", "info");
  fetchServerReminderLogs();
}

// Clears the reminder logs.
function clearReminderLogs() {
  window.reminderLogs = [];
  if (currentUser?.email) {
    localStorage.removeItem(`volp_reminder_logs_${currentUser.email}`);
  }
  showToast("Reminder logs cleared.", "info");
  renderRemindersView(true);
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

let telegramPollTimer = null;

// Loads Telegram bot configuration and current user's chat ID into Settings.
async function loadTelegramSettings() {
  const input = document.getElementById("settingsTelegramChatId");
  if (input && currentUser?.telegram_chat_id) {
    input.value = currentUser.telegram_chat_id;
  }

  const notConnectedView = document.getElementById("telegramNotConnectedView");
  const connectedView = document.getElementById("telegramConnectedView");
  const details = document.getElementById("telegramConnectedDetails");
  const hint = document.getElementById("telegramBotStatusHint");

  const profileChatId = document.getElementById("settingsProfileTelegramChatId");

  if (currentUser?.telegram_chat_id) {
    if (profileChatId) {
      profileChatId.value = currentUser.telegram_username
        ? `${currentUser.telegram_chat_id} (@${currentUser.telegram_username})`
        : currentUser.telegram_chat_id;
      profileChatId.style.color = "var(--accent)";
    }
    if (notConnectedView) notConnectedView.style.display = "none";
    if (connectedView) connectedView.style.display = "block";
    if (details) {
      const userTag = currentUser.telegram_username ? `@${currentUser.telegram_username}` : `Chat ID: ${currentUser.telegram_chat_id}`;
      details.textContent = `Connected to ${userTag}. Daily 8:00 PM alerts are active.`;
    }
    if (hint) {
      hint.textContent = `STATUS: CONNECTED • DAILY 8 PM DISPATCH ACTIVE`;
      hint.style.color = "var(--accent)";
    }
  } else {
    if (profileChatId) {
      profileChatId.value = "NOT CONNECTED (CONNECT TELEGRAM BELOW)";
      profileChatId.style.color = "var(--muted)";
    }
    if (notConnectedView) notConnectedView.style.display = "block";
    if (connectedView) connectedView.style.display = "none";
    if (hint) {
      hint.textContent = `STATUS: NOT CONNECTED • CONNECT IN 1-CLICK BELOW`;
      hint.style.color = "var(--muted)";
    }
  }

  try {
    const res = await fetch("/api/auth/telegram-config");
    if (res.ok) {
      const data = await res.json();
      if (data.bot?.configured && data.bot.botUsername) {
        window.telegramBotUsername = data.bot.botUsername;
        const remindersLinkApp = document.getElementById("remindersBotLink");
        if (remindersLinkApp) {
          remindersLinkApp.href = `https://t.me/${data.bot.botUsername}`;
        }
        const remindersLinkWeb = document.getElementById("remindersBotWebLink");
        if (remindersLinkWeb) {
          remindersLinkWeb.href = `https://web.telegram.org/k/#@${data.bot.botUsername}`;
        }
      }
    }
  } catch (_) {}
}

// Opens the VOLP Reminders Telegram Bot chat directly in App or Web
function openTelegramChat(target = "app") {
  const botUser = window.telegramBotUsername || "volp_remainder_bot";
  const url = target === "web"
    ? `https://web.telegram.org/k/#@${botUser}`
    : `https://t.me/${botUser}`;
  window.open(url, "_blank");
}
window.openTelegramChat = openTelegramChat;

// Initiates the 1-Click Telegram Deep Link connection via App or Web client.
async function startOneClickTelegramConnect(target = "app") {
  const btnApp = document.getElementById("btnOneClickConnect");
  const btnWeb = document.getElementById("btnOneClickConnectWeb");
  const activeBtn = target === "web" ? (btnWeb || btnApp) : (btnApp || btnWeb);
  const originalHtml = activeBtn ? activeBtn.innerHTML : "";

  if (activeBtn) {
    activeBtn.disabled = true;
    activeBtn.innerHTML = `<span style="display:inline-flex; align-items:center; gap:6px;">GENERATING SECURE LINK...</span>`;
  }

  try {
    const res = await fetch("/api/auth/telegram-link-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ email: currentUser.email, token: currentUser.token }),
    });

    const data = await res.json();
    if (!res.ok || !data.success || !data.linkUrl) {
      throw new Error(data.error || "Could not generate Telegram link.");
    }

    const botUser = data.botUsername || window.telegramBotUsername || "volp_remainder_bot";
    const token = data.token;

    let targetUrl;
    if (target === "web") {
      // Telegram Web K deep link:
      targetUrl = data.webUrl || `https://web.telegram.org/k/#?tgaddr=${encodeURIComponent(`tg://resolve?domain=${botUser}&start=${token}`)}`;
      showToast("Opening Telegram Web (web.telegram.org/k)... Tap 'START' to link your account!", "info");
    } else {
      // Telegram Desktop / Mobile App:
      targetUrl = data.linkUrl || `https://t.me/${botUser}?start=${token}`;
      showToast("Opening Telegram App... Tap 'START' to link your account!", "info");
    }

    // Open Telegram in a new tab/window
    window.open(targetUrl, "_blank");

    if (activeBtn) {
      activeBtn.innerHTML = `<span>AWAITING 'START' IN TELEGRAM...</span>`;
    }

    pollTelegramConnectionStatus(activeBtn, originalHtml);
  } catch (err) {
    showToast(err.message, "error");
    if (activeBtn) {
      activeBtn.disabled = false;
      activeBtn.innerHTML = originalHtml;
    }
  }
}

// Polls real-time connection status until user taps START in Telegram.
function pollTelegramConnectionStatus(btn, originalHtml, attemptsLeft = 30) {
  if (telegramPollTimer) clearTimeout(telegramPollTimer);

  telegramPollTimer = setTimeout(async () => {
    try {
      const res = await fetch(
        `/api/auth/telegram-status?email=${encodeURIComponent(currentUser.email)}`,
        { headers: getAuthHeaders() }
      );
      const data = await res.json();

      if (res.ok && data.connected) {
        currentUser.telegram_chat_id = data.telegram_chat_id;
        currentUser.telegram_username = data.telegram_username || "";
        localStorage.setItem("volp_user", JSON.stringify(currentUser));
        loadTelegramSettings();
        if (currentTab === "reminders") renderRemindersView();
        showToast("🎉 Telegram connected successfully in 1-Click!", "success");
        return;
      }
    } catch (_) {}

    if (attemptsLeft > 1) {
      pollTelegramConnectionStatus(btn, originalHtml, attemptsLeft - 1);
    } else {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }
  }, 2000);
}

// Disconnects user's Telegram bot connection.
async function disconnectTelegram() {
  openModal(
    "DISCONNECT TELEGRAM",
    "Are you sure you want to disconnect Telegram reminders? You will no longer receive daily 8 PM homework alerts.",
    async () => {
      try {
        const res = await fetch("/api/auth/telegram-disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ email: currentUser.email, token: currentUser.token }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          currentUser.telegram_chat_id = "";
          currentUser.telegram_username = "";
          localStorage.setItem("volp_user", JSON.stringify(currentUser));
          const input = document.getElementById("settingsTelegramChatId");
          if (input) input.value = "";
          loadTelegramSettings();
          if (currentTab === "reminders") renderRemindersView();
          showToast("Telegram disconnected successfully", "info");
        } else {
          throw new Error(data.error || "Failed to disconnect");
        }
      } catch (e) {
        showToast(e.message, "error");
      }
    }
  );
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
      const isDelivered = Boolean(data.result?.success);
      const isAwaiting = data.result?.reason === "NO_CHAT_ID";
      const status = isDelivered ? "DELIVERED" : (isAwaiting ? "AWAITING_TELEGRAM" : "FAILED");
      const recipient = data.result?.recipient || (currentUser?.telegram_chat_id ? `CHAT ID: ${currentUser.telegram_chat_id}` : (isAwaiting ? "NOT CONNECTED" : "N/A"));
      const newLog = {
        title: "MANUAL 8 PM TELEGRAM DISPATCH",
        message: data.message || `Dispatched 8 PM Telegram assignment alert for ${currentUser.email}`,
        time: new Date().toLocaleTimeString(),
        success: isDelivered,
        status: status,
        recipient: recipient,
        pending_count: data.result?.count ?? rawAssignments.filter(a => !isSubmitted(a) && !isAssignmentBlocked(a)).length,
      };
      if (!window.reminderLogs) window.reminderLogs = [];
      window.reminderLogs.unshift(newLog);
      if (currentUser?.email) {
        localStorage.setItem(`volp_reminder_logs_${currentUser.email}`, JSON.stringify(window.reminderLogs));
      }
      renderRemindersView();
    } else {
      throw new Error(data.error || "Server error");
    }
  } catch (e) {
    showToast("8 PM Reminder: " + e.message, "info");
    if (!window.reminderLogs) window.reminderLogs = [];
    const newErrLog = {
      title: "MANUAL 8 PM TELEGRAM DISPATCH",
      message: `Trigger executed for ${currentUser.email}: ${e.message}`,
      time: new Date().toLocaleTimeString(),
      success: false,
      status: "FAILED",
      recipient: currentUser?.telegram_chat_id ? `CHAT ID: ${currentUser.telegram_chat_id}` : "NOT CONNECTED",
      pending_count: rawAssignments.filter(a => !isSubmitted(a) && !isAssignmentBlocked(a)).length,
    };
    window.reminderLogs.unshift(newErrLog);
    if (currentUser?.email) {
      localStorage.setItem(`volp_reminder_logs_${currentUser.email}`, JSON.stringify(window.reminderLogs));
    }
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

      // Match by compound key (assignment_id, assignment_type) to avoid cross-type collisions
      const a = rawAssignments.find(
        (item) =>
          Number(item.assignment_id) === Number(assignmentId) &&
          (!assignmentType || item.assignment_type === assignmentType),
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

// Escapes quotation marks, slashes, and newlines safely for inline JavaScript attribute handlers
function escapeJsString(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "\\x22")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

let currentTourStep = 0;

const TOUR_STEPS = [
  {
    step: 0,
    kicker: "01 / QUICK SIGN-IN",
    title: "One-Time Safe College Login",
    narrative: "",
    points: [
      "Enter your normal college portal email and password.",
      "100% private & secure — passwords are never saved.",
      "Stay signed in across visits without repeatedly logging in."
    ],
    protip: "Tip: If you change your college password, just sign out and log in once.",
    actionLabel: "View Account Info",
    actionFn: () => { closeInteractiveTour(); navigateTo("settings"); },
    renderVisual: () => `
      <div class="pipeline-diagram">
        <div class="pipeline-node active-glow">
          <div class="pnode-left">
            <span class="pnode-icon">👤</span>
            <div>
              <div class="pnode-title">Sign In Once</div>
              <div class="pnode-sub">Normal College Login</div>
            </div>
          </div>
          <span class="pnode-tag pnode-tag--secure">Fast & Safe</span>
        </div>
        <div class="pipeline-arrow">▼ Verifies With</div>
        <div class="pipeline-node">
          <div class="pnode-left">
            <span class="pnode-icon">🏫</span>
            <div>
              <div class="pnode-title">College Portal</div>
              <div class="pnode-sub">Official University Portal</div>
            </div>
          </div>
          <span class="pnode-tag pnode-tag--secure">Verified</span>
        </div>
        <div class="pipeline-arrow">▼ Secure Local Session</div>
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
    kicker: "02 / 1-CLICK SYNC",
    title: "Gathers All 16+ Subjects in 1 Click",
    narrative: "",
    points: [
      "Auto-scans written theory homework, lab code & practicals.",
      "Automatically recognizes submitted files vs pending tasks.",
      "Displays exact due dates and maximum marks clearly."
    ],
    protip: "Tip: Click 'SYNC VOLP' anytime teachers assign new work.",
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
    title: "Kanban Board & Visual Study Calendar",
    narrative: "",
    points: [
      "Color-coded urgency: Overdue, Pending & Submitted.",
      "Filter by subject or search keywords in under a second.",
      "1-click export of deadlines to phone calendar (.ics)."
    ],
    protip: "Tip: Click any assignment card to view full prompt and details.",
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
    title: "Silence Passed or Old Subjects (Muting)",
    narrative: "",
    points: [
      "1-click to mute old semesters or extra lab courses.",
      "Muted courses disappear from daily homework board.",
      "Easily review or un-mute anytime in 'BLOCKED ITEMS'."
    ],
    protip: "Tip: Muted subjects won't generate 8 PM Telegram alerts.",
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
    title: "Automatic 8:00 PM Telegram Push Alerts",
    narrative: "",
    points: [
      "Daily 8:00 PM summary sent directly to your Telegram.",
      "Delivers only pending, unfinished tasks with deadlines.",
      "Zero app opens needed — reminders land right on your phone."
    ],
    protip: "Tip: Click 'Send Sample Telegram Alert Now' to test your bot.",
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
            <ul class="tour-feature-points" style="margin-top: 14px;">
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


// ══════════════════════════════════════════════════════════════════════════════
// HACKATHON DASHBOARD — Premium Feature
// ══════════════════════════════════════════════════════════════════════════════

// Shows or hides the HACKATHONS nav item based on the user's is_premium flag.
function applyPremiumUI() {
  const navEl = document.getElementById("navHackathons");
  if (!navEl) return;
  const isPremium = currentUser?.is_premium === true;
  navEl.style.display = isPremium ? "" : "none";
}

// Entry point when navigating to the hackathons page.
// Fetches fresh events from the backend if empty or when forceRefresh is requested.
async function loadHackathonPage(forceRefresh = false) {
  // Always fetch fresh live events when forced or if cache is empty
  if (hackathonEvents.length === 0 || forceRefresh) {
    await fetchHackathonEvents();
  } else {
    populateHkThemes();
    filterHackathons();
  }
  if (hackathonTab === "calendar") {
    renderHkCalendar();
  }
}

// Fetches all hackathon events from the backend API (with source filter).
async function fetchHackathonEvents() {
  const grid = document.getElementById("hackathonGrid");
  if (grid) {
    grid.innerHTML = `
      <div class="hackathon-loading">
        <div class="sync-progress-dots"><span></span><span></span><span></span></div>
        <p>Loading hackathons…</p>
      </div>`;
  }
  const metaEl = document.getElementById("hackathonsMeta");
  if (metaEl) metaEl.textContent = "LOADING EVENTS...";

  try {
    const params = new URLSearchParams({ source: hackathonSource, limit: 500 });
    const res = await fetch(`/api/hackathons?${params}`, {
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      // Platform-independent redirect to login when backend reports session expired
      if (res.status === 401) {
        localStorage.removeItem("volp_user");
        window.location.href = "login.html?expired=true";
        return;
      }
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    hackathonEvents = data.events || [];
    populateHkThemes();
    filterHackathons();
  } catch (err) {
    hackathonEvents = [];
    hackathonFiltered = [];
    if (grid) {
      grid.innerHTML = `<div class="hackathon-empty">
        <div style="font-size:28px;margin-bottom:10px;">⚠️</div>
        <div style="font-weight:700;color:var(--text-primary);margin-bottom:6px;">Could not load hackathons</div>
        <div>${escHtml(err.message)}</div>
      </div>`;
    }
    if (metaEl) metaEl.textContent = "ERROR LOADING EVENTS";
    renderHkStatsBanner();
    renderHkPhaseTimeline();
  }
}

// Triggers the backend Devpost & Unstop hackathons ingestion pipeline.
async function syncHackathonsPipeline() {
  const btn = document.getElementById("btnSyncPipeline");
  const origText = btn ? btn.innerHTML : "⚡ SYNC PIPELINE";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spin" style="display:inline-block;animation:spin 1s linear infinite;">↻</span> SYNCING PIPELINE…`;
  }

  showToast("⚡ Starting Devpost & Unstop ingestion pipeline…", "info");

  try {
    const res = await fetch("/api/hackathons/pipeline/sync", {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ devpostPages: 5, unstopPages: 3, unstopPerPage: 50 }),
    });

    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem("volp_user");
        window.location.href = "login.html?expired=true";
        return;
      }
      const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const stats = data.stats || {};
    const devUpserted = stats.devpost?.upserted || 0;
    const unstUpserted = stats.unstop?.upserted || 0;
    const totalInDb = stats.totalInDatabase || (devUpserted + unstUpserted);

    showToast(`✓ Pipeline completed! ${devUpserted} Devpost + ${unstUpserted} Unstop events synced (${totalInDb} in DB).`, "success");

    // Refresh display
    await fetchHackathonEvents();
  } catch (err) {
    showToast(`Pipeline sync failed: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  }
}

// Categorizes a hackathon event into its chronological deadline phase.
function getHackathonPhase(ev) {
  if (!ev || !ev.deadline) {
    return {
      id: "unscheduled",
      name: "Phase 6: Flexible / Rolling",
      status: "unscheduled",
      statusLabel: "FLEXIBLE",
      order: 6,
    };
  }
  const dl = new Date(ev.deadline);
  if (isNaN(dl.getTime())) {
    return {
      id: "unscheduled",
      name: "Phase 6: Flexible / Rolling",
      status: "unscheduled",
      statusLabel: "FLEXIBLE",
      order: 6,
    };
  }
  const now = new Date();
  const diffHours = (dl.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours < 0) {
    return {
      id: "concluded",
      name: "Phase 5: Concluded / Expired",
      status: "completed",
      statusLabel: "CONCLUDED",
      order: 5,
    };
  }
  if (diffHours <= 48) {
    return {
      id: "closing_soon",
      name: "Phase 1: Closing Soon (< 48h)",
      status: "delayed",
      statusLabel: "CLOSING SOON",
      order: 1,
    };
  }
  if (diffHours <= 24 * 7) {
    return {
      id: "ongoing",
      name: "Phase 2: Ongoing (This Week)",
      status: "ongoing",
      statusLabel: "THIS WEEK",
      order: 2,
    };
  }
  if (diffHours <= 24 * 30) {
    return {
      id: "upcoming",
      name: "Phase 3: Upcoming (This Month)",
      status: "upcoming",
      statusLabel: "THIS MONTH",
      order: 3,
    };
  }
  return {
    id: "future",
    name: "Phase 4: Future (30+ Days)",
    status: "later",
    statusLabel: "FUTURE",
    order: 4,
  };
}

// Computes chronological deadline phases and real metrics across all events.
function computeChronologicalHkPhases(events) {
  const formatShortDate = (d) => {
    if (!d || isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const phaseDefs = [
    {
      id: "closing_soon",
      order: 1,
      name: "Phase 1: Closing Soon (< 48h)",
      subtitle: "Deadlines closing within 48 hours — urgent registration required",
      status: "delayed",
      statusLabel: "CLOSING SOON",
      timingsDesc: "Closing within 48 hours",
    },
    {
      id: "ongoing",
      order: 2,
      name: "Phase 2: Ongoing (This Week)",
      subtitle: "Active hackathons with registration deadlines within the next 7 days",
      status: "ongoing",
      statusLabel: "THIS WEEK",
      timingsDesc: "Within next 7 days",
    },
    {
      id: "upcoming",
      order: 3,
      name: "Phase 3: Upcoming (This Month)",
      subtitle: "Hackathons accepting team registrations over the next 8 to 30 days",
      status: "upcoming",
      statusLabel: "THIS MONTH",
      timingsDesc: "8 to 30 days window",
    },
    {
      id: "future",
      order: 4,
      name: "Phase 4: Future (30+ Days)",
      subtitle: "Longer horizon hackathons, national challenges, and future milestones",
      status: "later",
      statusLabel: "FUTURE",
      timingsDesc: "Beyond 30 days",
    },
    {
      id: "concluded",
      order: 5,
      name: "Phase 5: Concluded / Expired",
      subtitle: "Events whose registration deadline has elapsed",
      status: "completed",
      statusLabel: "CONCLUDED",
      timingsDesc: "Past deadlines",
    },
    {
      id: "unscheduled",
      order: 6,
      name: "Phase 6: Flexible / Rolling",
      subtitle: "Open-ended or rolling opportunities without a fixed portal cutoff",
      status: "unscheduled",
      statusLabel: "FLEXIBLE",
      timingsDesc: "Rolling / Open",
    },
  ];

  return phaseDefs.map((def) => {
    const items = events.filter((ev) => getHackathonPhase(ev).id === def.id);
    const validDates = items
      .map((ev) => (ev.deadline ? new Date(ev.deadline) : null))
      .filter((d) => d && !isNaN(d.getTime()));

    let startText = "N/A";
    let endText = "N/A";
    let windowText = def.timingsDesc;

    if (validDates.length > 0) {
      const minD = new Date(Math.min(...validDates.map((d) => d.getTime())));
      const maxD = new Date(Math.max(...validDates.map((d) => d.getTime())));
      startText = formatShortDate(minD);
      endText = formatShortDate(maxD);
      windowText = startText === endText ? startText : `${startText} → ${endText}`;
    }

    const selectedCount = items.filter((ev) => selectedHackathons.has(String(ev.id))).length;
    const onlineCount = items.filter((ev) => !(ev.mode || "").toLowerCase().includes("offline")).length;
    const freeCount = items.filter((ev) => !ev.is_paid).length;

    return {
      ...def,
      items,
      totalItems: items.length,
      selectedItems: selectedCount,
      onlineItems: onlineCount,
      freeItems: freeCount,
      startDate: startText,
      endDate: endText,
      timings: windowText,
    };
  });
}

// Renders the overall dynamic hackathons statistics banner.
function renderHkStatsBanner() {
  const total = hackathonEvents.length;
  const filtered = hackathonFiltered.length;
  const urgentCount = hackathonEvents.filter((ev) => getHackathonPhase(ev).id === "closing_soon").length;
  const online = hackathonFiltered.filter((ev) => !(ev.mode || "").toLowerCase().includes("offline")).length;
  const free = hackathonFiltered.filter((ev) => !ev.is_paid).length;

  const totalEl = document.getElementById("hkTotalCount");
  const filteredEl = document.getElementById("hkFilteredCount");
  const urgentEl = document.getElementById("hkUrgentCount");
  const onlineEl = document.getElementById("hkOnlineCount");
  const freeEl = document.getElementById("hkFreeCount");

  if (totalEl) totalEl.textContent = total;
  if (filteredEl) filteredEl.textContent = filtered;
  if (urgentEl) urgentEl.textContent = urgentCount;
  if (onlineEl) onlineEl.textContent = online;
  if (freeEl) freeEl.textContent = free;

  const totalSub = document.getElementById("hkTotalSub");
  const filteredSub = document.getElementById("hkFilteredSub");
  const urgentSub = document.getElementById("hkUrgentSub");
  const onlineSub = document.getElementById("hkOnlineSub");
  const freeSub = document.getElementById("hkFreeSub");

  if (totalSub) totalSub.textContent = "Unstop + Devpost events";
  if (filteredSub) filteredSub.textContent = `${total > 0 ? Math.round((filtered / total) * 100) : 0}% of all events`;
  if (urgentSub) urgentSub.textContent = urgentCount > 0 ? "Deadlines within 48h" : "No immediate cutoffs";
  if (onlineSub) onlineSub.textContent = `${filtered > 0 ? Math.round((online / filtered) * 100) : 0}% virtual`;
  if (freeSub) freeSub.textContent = `${filtered > 0 ? Math.round((free / filtered) * 100) : 0}% free entry`;
}

// Renders chronological deadline phase cards in the timeline section.
function renderHkPhaseTimeline() {
  const grid = document.getElementById("hkPhaseCardsGrid");
  const resetBtn = document.getElementById("hkPhaseResetFilterBtn");
  if (!grid) return;

  if (resetBtn) {
    resetBtn.style.display = currentHkPhaseFilter !== "all" ? "inline-flex" : "none";
  }

  const phases = computeChronologicalHkPhases(hackathonEvents);

  grid.innerHTML = phases
    .map((phase) => {
      const isActive = currentHkPhaseFilter === phase.id;

      return `
        <div class="phase-card ${isActive ? "active" : ""} phase-card--${phase.status}" onclick="toggleHkPhaseFilter('${phase.id}')" title="Click to filter hackathons by ${phase.name}">
          <div class="phase-card-header">
            <div class="phase-card-status-wrap">
              <span class="phase-status-dot phase-status-dot--${phase.status}"></span>
              <span class="phase-status-badge phase-status-badge--${phase.status}">${phase.statusLabel}</span>
            </div>
            <button type="button" class="phase-detail-btn" onclick="event.stopPropagation(); openHkPhaseDetailsModal('${phase.id}')" title="Inspect phase details & event list">ℹ</button>
          </div>

          <div class="phase-card-title">${escHtml(phase.name)}</div>

          <div class="phase-card-dates">
            <span>📅 ${escHtml(phase.timings)}</span>
          </div>

          <div class="phase-metrics-grid">
            <div class="phase-metric">
              <span class="phase-metric-val">${phase.totalItems}</span>
              <span class="phase-metric-lbl">TOTAL</span>
            </div>
            <div class="phase-metric">
              <span class="phase-metric-val" style="color:var(--info);">${phase.onlineItems}</span>
              <span class="phase-metric-lbl">ONLINE</span>
            </div>
            <div class="phase-metric">
              <span class="phase-metric-val" style="color:var(--success);">${phase.freeItems}</span>
              <span class="phase-metric-lbl">FREE</span>
            </div>
          </div>

          <div class="phase-card-actions">
            <button type="button" class="phase-action-btn" onclick="event.stopPropagation(); setHkPhaseFilter('${phase.id}')">
              FILTER TO PHASE →
            </button>
            <button type="button" class="phase-action-btn" onclick="event.stopPropagation(); openHkPhaseDetailsModal('${phase.id}')">
              DETAILS
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

// Opens the detailed hackathon phase inspection drawer.
function openHkPhaseDetailsModal(phaseId) {
  const overlay = document.getElementById("hkPhaseDetailsOverlay");
  const content = document.getElementById("hkPhaseDrawerContent");
  const kicker = document.getElementById("hkPhaseDrawerKicker");
  const title = document.getElementById("hkPhaseDrawerTitle");
  if (!overlay || !content) return;

  const phases = computeChronologicalHkPhases(hackathonEvents);
  const phase = phases.find((p) => p.id === phaseId);
  if (!phase) return;

  if (kicker) kicker.textContent = `${phase.statusLabel} DEADLINE WINDOW`;
  if (title) title.textContent = phase.name.toUpperCase();

  content.innerHTML = `
    <!-- Phase Overview Card -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <span class="phase-status-badge phase-status-badge--${phase.status}">${phase.statusLabel}</span>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);">${escHtml(phase.timings)}</span>
      </div>
      <p style="font-size:13px;color:var(--text);margin:0 0 12px 0;">${escHtml(phase.subtitle)}</p>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));gap:8px;padding-top:12px;border-top:1px solid var(--border);">
        <div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);">TOTAL EVENTS</div>
          <div style="font-size:18px;font-weight:700;color:var(--text);">${phase.totalItems}</div>
        </div>
        <div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);">ONLINE</div>
          <div style="font-size:18px;font-weight:700;color:var(--info);">${phase.onlineItems}</div>
        </div>
        <div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);">FREE ENTRY</div>
          <div style="font-size:18px;font-weight:700;color:var(--success);">${phase.freeItems}</div>
        </div>
      </div>
    </div>

    <!-- API Data Availability Notice -->
    <div class="phase-detail-unavailable">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="8"/><line x1="12" y1="14" x2="12" y2="10"/><line x1="12" y1="6" x2="12.01" y2="6"/></svg>
      <span>Note: Round 2 elimination dates, mentor schedules, and problem statements are published directly by organizers on Unstop / Devpost.</span>
    </div>

    <!-- Actions Row -->
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <button type="button" class="btn btn--sm btn--primary" onclick="setHkPhaseFilter('${phase.id}'); closeHkPhaseDetailsModal();">
        FILTER DASHBOARD TO THIS PHASE →
      </button>
    </div>

    <!-- Events in this Phase -->
    <div>
      <div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:1px;color:var(--text-secondary);margin-bottom:10px;">
        HACKATHONS IN THIS PHASE (${phase.items.length})
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${
          phase.items.length === 0
            ? `<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;border:1px dashed var(--border);border-radius:4px;">No hackathons currently in this phase window.</div>`
            : phase.items
                .map((item) => {
                  const cleanTitle = item.title || "Untitled Hackathon";
                  const modeText = (item.mode || "Online").toUpperCase();
                  const feeText = item.is_paid ? "PAID" : "FREE";
                  const prizeText = item.prize ? ` · 🏆 ${item.prize}` : "";
                  const deadlineStr = formatHkDeadline(item.deadline);

                  return `
            <div class="phase-detail-item-row">
              <div style="min-width:0;flex:1;">
                <div style="font-size:13px;font-weight:700;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(cleanTitle)}">${escHtml(cleanTitle)}</div>
                <div style="font-family:var(--font-mono);font-size:11px;color:#a3b19b;margin-top:2px;">${escHtml(item.organization || (item.source || "").toUpperCase())} · <span style="color:#60a5fa;">${modeText}</span> · <span style="color:#4ade80;">${feeText}</span><span style="color:#fbbf24;">${escHtml(prizeText)}</span></div>
                <div style="font-family:var(--font-mono);font-size:11px;color:#ff9800;font-weight:700;margin-top:2px;">📅 ${escHtml(deadlineStr)}</div>
              </div>
              ${
                item.url
                  ? `<a class="hk-register-btn" href="${escHtml(item.url)}" target="_blank" rel="noopener noreferrer" style="white-space:nowrap;font-size:11px;padding:6px 14px;">REGISTER ↗</a>`
                  : ""
              }
            </div>
          `;
                })
                .join("")
        }
      </div>
    </div>
  `;

  overlay.classList.add("active");
}

// Closes the detailed hackathon phase inspection drawer.
function closeHkPhaseDetailsModal(event) {
  if (!event || event.target === document.getElementById("hkPhaseDetailsOverlay")) {
    document.getElementById("hkPhaseDetailsOverlay")?.classList.remove("active");
  }
}

// Dynamically populates the Category/Theme filter dropdown with unique subtypes.
function populateHkThemes() {
  const select = document.getElementById("hkFilterThemeSelect");
  if (!select) return;

  const currentVal = select.value;
  const uniqueThemes = new Set();
  hackathonEvents.forEach((ev) => {
    const t = ev.subtype || ev.type;
    if (t && typeof t === "string" && t.trim()) {
      uniqueThemes.add(t.trim());
    }
  });

  const sortedThemes = Array.from(uniqueThemes).sort();
  select.innerHTML =
    `<option value="all">ALL THEMES / SUBTYPES</option>` +
    sortedThemes
      .map((t) => {
        const label = t.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
        return `<option value="${escHtml(t)}">${escHtml(label)}</option>`;
      })
      .join("");

  if (uniqueThemes.has(currentVal)) {
    select.value = currentVal;
  }
}

// Sorts hackathons based on chosen criteria.
function sortHackathons(events, sortOption) {
  return [...events].sort((a, b) => {
    if (sortOption === "deadline_asc") {
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return (isNaN(da) ? Infinity : da) - (isNaN(db) ? Infinity : db);
    }
    if (sortOption === "deadline_desc") {
      const da = a.deadline ? new Date(a.deadline).getTime() : -Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : -Infinity;
      return (isNaN(db) ? -Infinity : db) - (isNaN(da) ? -Infinity : da);
    }
    if (sortOption === "title_asc") {
      return (a.title || "").localeCompare(b.title || "");
    }
    if (sortOption === "prize_desc") {
      const extractPrizeNum = (p) => {
        if (!p) return 0;
        const matches = String(p).replace(/,/g, "").match(/\d+/g);
        return matches ? Math.max(...matches.map(Number)) : 0;
      };
      return extractPrizeNum(b.prize) - extractPrizeNum(a.prize);
    }
    return 0;
  });
}

// Renders removable active filter chips for Hackathons.
function renderHkActiveFilterChips() {
  const bar = document.getElementById("hkActiveFilterChipsBar");
  const container = document.getElementById("hkActiveChipsContainer");
  if (!bar || !container) return;

  const chips = [];
  const search = (document.getElementById("hackathonSearch")?.value || "").trim();
  if (search) {
    chips.push({ label: `Search: "${search}"`, onRemove: "clearHkSearchInput()" });
  }
  if (hackathonSource !== "all") {
    chips.push({ label: `Portal: ${hackathonSource.toUpperCase()}`, onRemove: "setHackathonSource('all')" });
  }
  if (currentHkModeFilter !== "all") {
    chips.push({ label: `Mode: ${currentHkModeFilter.toUpperCase()}`, onRemove: "setHkModeFilter('all')" });
  }
  if (currentHkFeeFilter !== "all") {
    chips.push({ label: `Fee: ${currentHkFeeFilter.toUpperCase()}`, onRemove: "setHkFeeFilter('all')" });
  }
  if (currentHkPhaseFilter !== "all") {
    const phases = computeChronologicalHkPhases(hackathonEvents);
    const p = phases.find((ph) => ph.id === currentHkPhaseFilter);
    chips.push({ label: `Phase: ${p ? p.statusLabel : currentHkPhaseFilter}`, onRemove: "clearHkPhaseFilter()" });
  }
  if (currentHkThemeFilter !== "all") {
    chips.push({ label: `Theme: ${currentHkThemeFilter}`, onRemove: "setHkThemeFilter('all')" });
  }
  if (currentHkStartDateFilter || currentHkEndDateFilter) {
    const start = currentHkStartDateFilter || "Any";
    const end = currentHkEndDateFilter || "Any";
    chips.push({ label: `Dates: ${start} → ${end}`, onRemove: "clearHkDateRangeFilter()" });
  }

  if (chips.length === 0) {
    bar.style.display = "none";
    container.innerHTML = "";
  } else {
    bar.style.display = "flex";
    container.innerHTML = chips
      .map(
        (c) => `
      <div class="filter-chip" style="display:inline-flex;align-items:center;gap:8px;background:#DCFCE7;border:1px solid #BBF7D0;color:#15803D;border-radius:9999px;font-size:12px;font-weight:600;padding:5px 12px;margin:2px 0;box-shadow:0 1px 2px rgba(21,128,61,0.06);">
        <span>${escHtml(c.label)}</span>
        <button type="button" class="filter-chip-remove" onclick="${c.onRemove}" title="Remove filter" style="background:transparent;border:none;color:#15803D;font-size:13px;cursor:pointer;padding:0 2px;display:inline-flex;align-items:center;line-height:1;">✕</button>
      </div>
    `,
      )
      .join("");
  }
}

// Multi-filtering engine for Hackathons combining all criteria.
function filterHackathons() {
  const searchInput = document.getElementById("hackathonSearch");
  const q = (searchInput?.value || "").trim().toLowerCase();
  const clearBtn = document.getElementById("hkSearchClearBtn");
  if (clearBtn) clearBtn.style.display = q ? "inline-flex" : "none";

  let filtered = [...hackathonEvents];

  // 1. Search Query
  if (q) {
    filtered = filtered.filter(
      (e) =>
        (e.title || "").toLowerCase().includes(q) ||
        (e.organization || "").toLowerCase().includes(q) ||
        (e.subtype || "").toLowerCase().includes(q) ||
        (e.type || "").toLowerCase().includes(q),
    );
  }

  // 2. Source Portal (all / unstop / devpost)
  if (hackathonSource && hackathonSource !== "all") {
    filtered = filtered.filter((e) => (e.source || "").toLowerCase() === hackathonSource.toLowerCase());
  }

  // 3. Mode (all / online / offline)
  if (currentHkModeFilter === "online") {
    filtered = filtered.filter((e) => !(e.mode || "").toLowerCase().includes("offline"));
  } else if (currentHkModeFilter === "offline") {
    filtered = filtered.filter((e) => (e.mode || "").toLowerCase().includes("offline"));
  }

  // 4. Entry Fee (all / free / paid)
  if (currentHkFeeFilter === "free") {
    filtered = filtered.filter((e) => !e.is_paid);
  } else if (currentHkFeeFilter === "paid") {
    filtered = filtered.filter((e) => Boolean(e.is_paid));
  }

  // 5. Phase Filter
  if (currentHkPhaseFilter && currentHkPhaseFilter !== "all") {
    filtered = filtered.filter((e) => getHackathonPhase(e).id === currentHkPhaseFilter);
  }

  // 6. Theme / Subtype Filter
  if (currentHkThemeFilter && currentHkThemeFilter !== "all") {
    filtered = filtered.filter((e) => {
      const t = (e.subtype || e.type || "").toLowerCase();
      return t === currentHkThemeFilter.toLowerCase();
    });
  }

  // 7. Date Range Filter
  if (currentHkStartDateFilter) {
    const start = new Date(currentHkStartDateFilter);
    start.setHours(0, 0, 0, 0);
    filtered = filtered.filter((e) => {
      if (!e.deadline) return false;
      const d = new Date(e.deadline);
      return !isNaN(d.getTime()) && d >= start;
    });
  }
  if (currentHkEndDateFilter) {
    const end = new Date(currentHkEndDateFilter);
    end.setHours(23, 59, 59, 999);
    filtered = filtered.filter((e) => {
      if (!e.deadline) return false;
      const d = new Date(e.deadline);
      return !isNaN(d.getTime()) && d <= end;
    });
  }

  // 8. Sorting
  filtered = sortHackathons(filtered, currentHkSortOption);

  hackathonFiltered = filtered;
  hackathonPage = 1;

  renderHkActiveFilterChips();
  renderHkStatsBanner();
  renderHkPhaseTimeline();
  updateHkSelectionUI();
  renderHackathonList();

  if (hackathonTab === "calendar") {
    renderHkCalendar();
  }
}

// Sets the data source filter and re-fetches events.
function setHackathonSource(src, btn) {
  hackathonSource = src;
  document.querySelectorAll("#hkSourceFilterGroup .filter-btn").forEach((b) => b.classList.remove("active"));
  if (btn) {
    btn.classList.add("active");
  } else {
    document.querySelector(`#hkSourceFilterGroup .filter-btn[data-source="${src}"]`)?.classList.add("active");
  }
  fetchHackathonEvents();
}

// Mode filter toggle (ALL, ONLINE, OFFLINE).
function setHkModeFilter(mode, btn) {
  currentHkModeFilter = mode;
  document.querySelectorAll("#hkModeFilterGroup .filter-btn").forEach((b) => b.classList.remove("active"));
  if (btn) {
    btn.classList.add("active");
  } else {
    document.querySelector(`#hkModeFilterGroup .filter-btn[data-mode="${mode}"]`)?.classList.add("active");
  }
  filterHackathons();
}

// Fee filter (ALL, FREE, PAID).
function setHkFeeFilter(fee) {
  currentHkFeeFilter = fee;
  const sel = document.getElementById("hkFilterFeeSelect");
  if (sel) sel.value = fee;
  filterHackathons();
}

// Phase filter setter.
function setHkPhaseFilter(phase) {
  currentHkPhaseFilter = phase;
  const sel = document.getElementById("hkFilterPhaseSelect");
  if (sel) sel.value = phase;
  filterHackathons();
}

// Toggles clicking on a phase card to filter or reset.
function toggleHkPhaseFilter(phaseId) {
  if (currentHkPhaseFilter === phaseId) {
    clearHkPhaseFilter();
  } else {
    setHkPhaseFilter(phaseId);
  }
}

// Clears the active phase filter.
function clearHkPhaseFilter() {
  currentHkPhaseFilter = "all";
  const sel = document.getElementById("hkFilterPhaseSelect");
  if (sel) sel.value = "all";
  filterHackathons();
}

// Theme / Category filter setter.
function setHkThemeFilter(theme) {
  currentHkThemeFilter = theme;
  const sel = document.getElementById("hkFilterThemeSelect");
  if (sel) sel.value = theme;
  filterHackathons();
}

// Sort order setter.
function setHkSort(sort) {
  currentHkSortOption = sort;
  const sel = document.getElementById("hkSortSelect");
  if (sel) sel.value = sort;
  filterHackathons();
}

// Date range filter setter.
function setHkDateRangeFilter() {
  currentHkStartDateFilter = document.getElementById("hkFilterStartDate")?.value || "";
  currentHkEndDateFilter = document.getElementById("hkFilterEndDate")?.value || "";
  filterHackathons();
}

// Clears date range inputs.
function clearHkDateRangeFilter() {
  currentHkStartDateFilter = "";
  currentHkEndDateFilter = "";
  const startEl = document.getElementById("hkFilterStartDate");
  const endEl = document.getElementById("hkFilterEndDate");
  if (startEl) startEl.value = "";
  if (endEl) endEl.value = "";
  filterHackathons();
}

// Clears search input.
function clearHkSearchInput() {
  const el = document.getElementById("hackathonSearch");
  if (el) el.value = "";
  filterHackathons();
}

// Toggles advanced filter drawer panel.
function toggleHkAdvancedFilters() {
  const panel = document.getElementById("hkAdvancedFilterPanel");
  const btn = document.getElementById("hkAdvancedFilterToggleBtn");
  if (!panel) return;
  isHkAdvancedFilterOpen = !isHkAdvancedFilterOpen;
  panel.style.display = isHkAdvancedFilterOpen ? "block" : "none";
  if (btn) btn.classList.toggle("active", isHkAdvancedFilterOpen);
}

// Applies advanced filter panel settings.
function applyHkAdvancedFilters() {
  filterHackathons();
  showToast("Applied advanced hackathon filters.", "info");
}

// Resets all Hackathon filters and search.
function resetAllHkFilters() {
  hackathonSource = "all";
  currentHkModeFilter = "all";
  currentHkFeeFilter = "all";
  currentHkPhaseFilter = "all";
  currentHkThemeFilter = "all";
  currentHkSortOption = "deadline_asc";
  currentHkStartDateFilter = "";
  currentHkEndDateFilter = "";

  const searchEl = document.getElementById("hackathonSearch");
  if (searchEl) searchEl.value = "";
  const feeSel = document.getElementById("hkFilterFeeSelect");
  if (feeSel) feeSel.value = "all";
  const phaseSel = document.getElementById("hkFilterPhaseSelect");
  if (phaseSel) phaseSel.value = "all";
  const themeSel = document.getElementById("hkFilterThemeSelect");
  if (themeSel) themeSel.value = "all";
  const sortSel = document.getElementById("hkSortSelect");
  if (sortSel) sortSel.value = "deadline_asc";
  const startEl = document.getElementById("hkFilterStartDate");
  if (startEl) startEl.value = "";
  const endEl = document.getElementById("hkFilterEndDate");
  if (endEl) endEl.value = "";

  document.querySelectorAll("#hkSourceFilterGroup .filter-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.source === "all");
  });
  document.querySelectorAll("#hkModeFilterGroup .filter-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === "all");
  });

  filterHackathons();
  showToast("All hackathon filters have been reset.", "info");
}

// Collapses or expands the timeline phase cards section.
function toggleHkPhaseSection() {
  const grid = document.getElementById("hkPhaseCardsGrid");
  const icon = document.getElementById("hkPhaseCollapseIcon");
  const label = document.getElementById("hkPhaseCollapseLabel");
  if (!grid) return;
  isHkPhaseSectionCollapsed = !isHkPhaseSectionCollapsed;
  grid.classList.toggle("collapsed", isHkPhaseSectionCollapsed);
  if (icon) icon.textContent = isHkPhaseSectionCollapsed ? "▼" : "▲";
  if (label) label.textContent = isHkPhaseSectionCollapsed ? "EXPAND" : "COLLAPSE";
}

// Selection Management
function toggleHackathonSelection(id, isChecked) {
  const strId = String(id);
  if (isChecked) {
    selectedHackathons.add(strId);
  } else {
    selectedHackathons.delete(strId);
  }
  updateHkSelectionUI();
  renderHkStatsBanner();
  renderHkPhaseTimeline();
}

function selectAllFilteredHackathons() {
  hackathonFiltered.forEach((ev) => selectedHackathons.add(String(ev.id)));
  updateHkSelectionUI();
  renderHackathonList();
  renderHkStatsBanner();
  renderHkPhaseTimeline();
  showToast(`Selected all ${hackathonFiltered.length} filtered hackathons.`, "info");
}

function deselectAllHackathons() {
  selectedHackathons.clear();
  updateHkSelectionUI();
  renderHackathonList();
  renderHkStatsBanner();
  renderHkPhaseTimeline();
  showToast("Cleared hackathon selection.", "info");
}

function toggleSelectAllInHkPhase(phaseId) {
  const phases = computeChronologicalHkPhases(hackathonEvents);
  const phase = phases.find((p) => p.id === phaseId);
  if (!phase || phase.items.length === 0) return;

  const isAllSelected = phase.selectedItems === phase.totalItems;
  phase.items.forEach((ev) => {
    if (isAllSelected) {
      selectedHackathons.delete(String(ev.id));
    } else {
      selectedHackathons.add(String(ev.id));
    }
  });

  updateHkSelectionUI();
  renderHackathonList();
  renderHkStatsBanner();
  renderHkPhaseTimeline();
}

function updateHkSelectionUI() {
  const bar = document.getElementById("hkSelectionActionBar");
  const countBadge = document.getElementById("hkSelectedCountBadge");
  const metaText = document.getElementById("hkSelectedMetaText");
  const count = selectedHackathons.size;

  if (bar) {
    if (count > 0) {
      bar.classList.add("visible");
    } else {
      bar.classList.remove("visible");
    }
  }

  if (countBadge) countBadge.textContent = `${count} SELECTED`;
  if (metaText) {
    metaText.textContent = `${count} event${count !== 1 ? "s" : ""} selected out of ${hackathonEvents.length} available.`;
  }

  const selectedCountBanner = document.getElementById("hkSelectedCount");
  if (selectedCountBanner) selectedCountBanner.textContent = count;

  // Sync checkboxes in DOM
  document.querySelectorAll(".hackathon-card").forEach((card) => {
    const cb = card.querySelector(".hk-checkbox");
    if (cb && cb.dataset.id) {
      const isSelected = selectedHackathons.has(cb.dataset.id);
      cb.checked = isSelected;
      card.classList.toggle("is-selected", isSelected);
    }
  });
}

// Batch export selected hackathons to standard .ICS calendar format.
function batchExportHkCalendarSelected() {
  if (selectedHackathons.size === 0) {
    showToast("Please select at least one hackathon to export.", "warning");
    return;
  }

  const selectedItems = hackathonEvents.filter((ev) => selectedHackathons.has(String(ev.id)));
  if (selectedItems.length === 0) return;

  const pad = (n) => String(n).padStart(2, "0");
  // Safely format dates for .ICS calendar standard, guarding against invalid dates and NaN values
  const toIcsDate = (date) => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  };

  const nowIcs = toIcsDate(new Date()) || "20260101T000000Z";
  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VOLP//Hackathon Deadline Reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  selectedItems.forEach((item) => {
    let dlDate = item.deadline ? new Date(item.deadline) : null;
    if (!dlDate || isNaN(dlDate.getTime())) {
      dlDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    }
    const startDate = new Date(dlDate.getTime() - 2 * 60 * 60 * 1000);
    const startIcs = toIcsDate(startDate);
    const endIcs = toIcsDate(dlDate);
    if (!startIcs || !endIcs) return;

    const safeTitle = (item.title || "Hackathon Deadline").replace(/[,;\\]/g, " ");
    const safeDesc = `Organizer: ${item.organization || "N/A"}\\nPortal: ${(item.source || "").toUpperCase()}\\nMode: ${item.mode || "Online"}\\nPrize: ${item.prize || "N/A"}\\nRegistration: ${item.url || "N/A"}`;

    icsLines.push(
      "BEGIN:VEVENT",
      `UID:hk-${item.id}-${Date.now()}@volp.edu`,
      `DTSTAMP:${nowIcs}`,
      `DTSTART:${startIcs}`,
      `DTEND:${endIcs}`,
      `SUMMARY:${safeTitle}`,
      `DESCRIPTION:${safeDesc}`,
    );
    if (item.url) icsLines.push(`URL:${item.url}`);
    icsLines.push(
      "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      "DESCRIPTION:Hackathon Deadline in 24 hours",
      "END:VALARM",
      "END:VEVENT",
    );
  });

  icsLines.push("END:VCALENDAR");

  const blob = new Blob([icsLines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `VOLP_Hackathons_${selectedItems.length}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Exported ${selectedItems.length} hackathon(s) to .ics calendar!`, "success");
}

// Switches between the "list" and "calendar" sub-tabs.
function switchHackathonTab(tab) {
  hackathonTab = tab;
  const listView = document.getElementById("hkListView");
  const calView  = document.getElementById("hkCalView");
  const tabList  = document.getElementById("hkTabList");
  const tabCal   = document.getElementById("hkTabCal");

  if (tab === "list") {
    if (listView) listView.style.display = "";
    if (calView)  calView.style.display  = "none";
    if (tabList)  tabList.classList.add("active");
    if (tabCal)   tabCal.classList.remove("active");
    renderHackathonList();
  } else {
    if (listView) listView.style.display = "none";
    if (calView)  calView.style.display  = "";
    if (tabList)  tabList.classList.remove("active");
    if (tabCal)   tabCal.classList.add("active");
    renderHkCalendar();
  }
}

// Renders the paginated hackathon card grid.
function renderHackathonList() {
  const grid = document.getElementById("hackathonGrid");
  const pag  = document.getElementById("hkPagination");
  if (!grid) return;

  const total      = hackathonFiltered.length;
  const totalPages = Math.ceil(total / hackathonLimit) || 1;
  hackathonPage    = Math.min(hackathonPage, totalPages);

  const start   = (hackathonPage - 1) * hackathonLimit;
  const pageEvs = hackathonFiltered.slice(start, start + hackathonLimit);

  if (pageEvs.length === 0) {
    grid.innerHTML = `<div class="hackathon-empty">
      <div style="font-size:32px;margin-bottom:10px;">🔍</div>
      <div style="font-weight:700;color:var(--text-primary);margin-bottom:6px;">No events found</div>
      <div>Try adjusting or clearing the filters above.</div>
      <div style="margin-top:12px;">
        <button type="button" class="btn btn--accent-sm" onclick="resetAllHkFilters()">RESET ALL FILTERS</button>
      </div>
    </div>`;
    if (pag) pag.style.display = "none";
    return;
  }

  grid.innerHTML = pageEvs.map(buildHackathonCard).join("");

  // Pagination
  if (pag) {
    pag.style.display = totalPages > 1 ? "flex" : "none";
    const pageInfo = document.getElementById("hkPageInfo");
    if (pageInfo) pageInfo.textContent = `PAGE ${hackathonPage} / ${totalPages}  (${total} EVENTS)`;
    const prevBtn = document.getElementById("hkPrevBtn");
    const nextBtn = document.getElementById("hkNextBtn");
    if (prevBtn) prevBtn.disabled = hackathonPage <= 1;
    if (nextBtn) nextBtn.disabled = hackathonPage >= totalPages;
  }
}

// Changes the hackathon list page by delta (+1 / -1).
function hkChangePage(delta) {
  hackathonPage += delta;
  renderHackathonList();
  const mainContent = document.getElementById("mainContent");
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: "smooth" });
}

// Formats a raw deadline date into a clean, human-readable string.
function formatHkDeadline(raw) {
  if (!raw) return "No Deadline Specified";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// Cleans up subtype slugs into readable titles.
function formatSubtype(str) {
  if (!str) return "";
  return str
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 32);
}

// Builds the HTML string for a single hackathon card with selection and phase info.
function buildHackathonCard(ev) {
  const phase = getHackathonPhase(ev);

  const modeIsOnline = !(ev.mode || "").toLowerCase().includes("offline");
  const modeBadge = modeIsOnline
    ? `<span class="hk-badge hk-badge--online">ONLINE</span>`
    : `<span class="hk-badge hk-badge--offline">OFFLINE</span>`;
  const feeBadge = ev.is_paid
    ? `<span class="hk-badge hk-badge--paid">PAID</span>`
    : `<span class="hk-badge hk-badge--free">FREE</span>`;
  const srcBadge =
    ev.source === "devpost"
      ? `<span class="hk-badge hk-badge--devpost">DEVPOST</span>`
      : `<span class="hk-badge hk-badge--unstop">UNSTOP</span>`;

  const logoHtml = ev.logo_url
    ? `<img class="hackathon-logo" src="${escHtml(ev.logo_url)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <div class="hackathon-logo-placeholder" style="display:none;">🏆</div>`
    : `<div class="hackathon-logo-placeholder">🏆</div>`;

  const formattedDeadline = formatHkDeadline(ev.deadline);
  const deadlineHtml = ev.deadline
    ? `<span class="hackathon-meta-value hackathon-meta-value--deadline" title="${escHtml(String(ev.deadline))}">${escHtml(formattedDeadline)}</span>`
    : `<span class="hackathon-meta-value" style="color:var(--text-secondary);">—</span>`;

  const registerHtml = ev.url
    ? `<a class="hk-register-btn" href="${escHtml(ev.url)}" target="_blank" rel="noopener noreferrer">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        REGISTER
       </a>`
    : "";

  const subtypeBadge = ev.subtype
    ? `<span class="hk-badge hk-badge--subtype">${escHtml(formatSubtype(ev.subtype))}</span>`
    : "";

  return `<div class="hackathon-card">
    <div class="hackathon-card-header">
      ${logoHtml}
      <div class="hackathon-card-title-wrap">
        <div class="hackathon-card-title" title="${escHtml(ev.title)}">${escHtml(ev.title)}</div>
        <div class="hackathon-card-org" title="${escHtml(ev.organization || "")}">${escHtml(ev.organization || "")}</div>
      </div>
    </div>
    <div class="hackathon-badges">
      ${srcBadge}${modeBadge}${feeBadge}
      <span class="hk-phase-tag hk-phase-tag--${phase.status}">${phase.statusLabel}</span>
      ${subtypeBadge}
    </div>
    <div class="hackathon-meta">
      ${ev.prize ? `<span class="hackathon-meta-label">🏆 Prize</span><span class="hackathon-meta-value hackathon-meta-value--prize" title="${escHtml(ev.prize)}">${escHtml(ev.prize)}</span>` : ""}
      ${ev.team_size ? `<span class="hackathon-meta-label">👥 Team</span><span class="hackathon-meta-value">${escHtml(ev.team_size)}</span>` : ""}
      <span class="hackathon-meta-label">📅 Deadline</span>${deadlineHtml}
      ${ev.mode ? `<span class="hackathon-meta-label">📍 Mode</span><span class="hackathon-meta-value">${escHtml(ev.mode)}</span>` : ""}
    </div>
    <div class="hackathon-card-actions">
      ${registerHtml}
    </div>
  </div>`;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

// Shifts the hackathon calendar by delta months (-1 or +1).
function hkCalShift(delta) {
  hkCalDate = new Date(hkCalDate.getFullYear(), hkCalDate.getMonth() + delta, 1);
  hkCalSelected = null;
  renderHkCalendar();
}

// Jumps the hackathon calendar to the current month.
function hkCalToday() {
  hkCalDate = new Date();
  hkCalSelected = null;
  renderHkCalendar();
}

// Renders the hackathon deadline calendar for the current month.
function renderHkCalendar() {
  const calEl   = document.getElementById("hkCalendar");
  const labelEl = document.getElementById("hkCalLabel");
  if (!calEl) return;

  const year  = hkCalDate.getFullYear();
  const month = hkCalDate.getMonth();

  if (labelEl) {
    labelEl.textContent = hkCalDate.toLocaleString("en-IN", { month: "long", year: "numeric" }).toUpperCase();
  }

  // Build a map: "YYYY-MM-DD" -> array of events (from hackathonFiltered)
  const eventsOnDay = {};
  for (const ev of hackathonFiltered) {
    if (!ev.deadline) continue;
    const d = new Date(ev.deadline);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!eventsOnDay[key]) eventsOnDay[key] = [];
    eventsOnDay[key].push(ev);
  }

  const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  let html = DAY_NAMES.map((d) => `<div class="hk-cal-day-name">${d}</div>`).join("");

  const firstDay     = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const todayStr     = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  })();

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="hk-cal-cell hk-cal-cell--empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key    = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isToday  = key === todayStr;
    const hasDls   = Boolean(eventsOnDay[key]);
    const isSelected = key === hkCalSelected;

    const classes = [
      "hk-cal-cell",
      isToday    ? "hk-cal-cell--today"      : "",
      hasDls     ? "hk-cal-cell--has-events" : "",
      isSelected ? "hk-cal-cell--selected"   : "",
    ].filter(Boolean).join(" ");

    const dotHtml = hasDls ? `<div class="hk-cal-dot"></div>` : "";
    const clickFn = hasDls ? `onclick="hkCalSelectDay('${key}')"` : "";

    html += `<div class="${classes}" ${clickFn}>${day}${dotHtml}</div>`;
  }

  calEl.innerHTML = html;
  renderHkCalEvents();
}

// Shows hackathon events for the selected calendar day.
function hkCalSelectDay(key) {
  hkCalSelected = key;
  renderHkCalendar();
}

// Renders the event list for the selected calendar day below the calendar grid.
function renderHkCalEvents() {
  const evEl = document.getElementById("hkCalEvents");
  if (!evEl) return;

  if (!hkCalSelected) {
    evEl.innerHTML = `<div class="hk-cal-empty-prompt">
      💡 Click any date cell with a yellow/lime dot above to view hackathon deadlines for that day.
    </div>`;
    return;
  }

  const eventsOnDay = {};
  for (const ev of hackathonFiltered) {
    if (!ev.deadline) continue;
    const d = new Date(ev.deadline);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!eventsOnDay[key]) eventsOnDay[key] = [];
    eventsOnDay[key].push(ev);
  }

  const dayEvents = eventsOnDay[hkCalSelected] || [];
  if (dayEvents.length === 0) {
    evEl.innerHTML = `<div class="hk-cal-empty-prompt">No events on this date.</div>`;
    return;
  }

  const [y, m, d] = hkCalSelected.split("-");
  const dateLabel = new Date(Number(y), Number(m) - 1, Number(d))
    .toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  evEl.innerHTML = `
    <div class="hk-cal-date-heading">
      <span>📅 ${escHtml(dateLabel)}</span>
      <span class="hk-cal-count">${dayEvents.length} EVENT${dayEvents.length !== 1 ? "S" : ""}</span>
    </div>
    ${dayEvents
      .map(
        (ev) => {
          const modeText = (ev.mode || "Online").toUpperCase();
          const feeText = ev.is_paid ? "PAID" : "FREE";
          const prizeText = ev.prize ? ` · 🏆 ${ev.prize}` : "";
          return `
      <div class="hk-cal-event-item">
        <div style="min-width:0;flex:1;">
          <div class="hk-cal-event-item-title">${escHtml(ev.title)}</div>
          <div class="hk-cal-event-item-meta">${escHtml(ev.organization || "")} · ${escHtml((ev.source || "").toUpperCase())} · ${modeText} · ${feeText}${escHtml(prizeText)}</div>
        </div>
        ${
          ev.url
            ? `<a class="hk-register-btn" href="${escHtml(ev.url)}" target="_blank" rel="noopener noreferrer" style="white-space:nowrap;font-size:10px;padding:6px 12px;">REGISTER ↗</a>`
            : ""
        }
      </div>
    `;
        },
      )
      .join("")}`;
}

// Minimal HTML escaper for card content.
function escHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

window.applyPremiumUI               = applyPremiumUI;
window.loadHackathonPage            = loadHackathonPage;
window.fetchHackathonEvents         = fetchHackathonEvents;
window.filterHackathons             = filterHackathons;
window.setHackathonSource           = setHackathonSource;
window.switchHackathonTab           = switchHackathonTab;
window.renderHackathonList          = renderHackathonList;
window.hkChangePage                 = hkChangePage;
window.hkCalShift                   = hkCalShift;
window.hkCalToday                   = hkCalToday;
window.renderHkCalendar             = renderHkCalendar;
window.hkCalSelectDay               = hkCalSelectDay;
window.toggleHkAdvancedFilters      = toggleHkAdvancedFilters;
window.applyHkAdvancedFilters       = applyHkAdvancedFilters;
window.resetAllHkFilters            = resetAllHkFilters;
window.clearHkSearchInput           = clearHkSearchInput;
window.setHkModeFilter              = setHkModeFilter;
window.setHkFeeFilter               = setHkFeeFilter;
window.setHkPhaseFilter             = setHkPhaseFilter;
window.toggleHkPhaseFilter          = toggleHkPhaseFilter;
window.clearHkPhaseFilter           = clearHkPhaseFilter;
window.setHkThemeFilter             = setHkThemeFilter;
window.setHkSort                    = setHkSort;
window.setHkDateRangeFilter         = setHkDateRangeFilter;
window.clearHkDateRangeFilter       = clearHkDateRangeFilter;
window.toggleHkPhaseSection         = toggleHkPhaseSection;
window.openHkPhaseDetailsModal      = openHkPhaseDetailsModal;
window.closeHkPhaseDetailsModal     = closeHkPhaseDetailsModal;
window.toggleHackathonSelection     = toggleHackathonSelection;
window.selectAllFilteredHackathons  = selectAllFilteredHackathons;
window.deselectAllHackathons        = deselectAllHackathons;
window.toggleSelectAllInHkPhase     = toggleSelectAllInHkPhase;
window.batchExportHkCalendarSelected = batchExportHkCalendarSelected;
// Expose VOLP calendar selection handler globally
window.selectVolpCalendarDay        = selectVolpCalendarDay;
window.navigateTo                   = navigateTo;
window.initActiveTab                = initActiveTab;


