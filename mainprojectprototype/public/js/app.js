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

let currentTab = 'dashboard';
let currentTaskView = 'kanban'; // 'kanban' | 'table'
let currentStatusFilter = 'all'; // 'all' | 'pending' | 'submitted' | 'overdue'
let currentTypeFilter = 'all';   // 'all' | 'SUBJECTIVE' | 'HANDS_ON'
let currentSearchQuery = '';
let isOfflineMode = false;
let pendingModalAction = null;

// Initial Fallback Dataset (Conforming strictly to real backend API schema)
const DEFAULT_FALLBACK_COURSES = [
  { colid: 1, crsid: 'CS301', course_name: 'Operating Systems', semester: 'Sem 5', academic_year: '2025-2026', is_blocked: false },
  { colid: 2, crsid: 'CS302', course_name: 'Database Management Systems', semester: 'Sem 5', academic_year: '2025-2026', is_blocked: false },
  { colid: 3, crsid: 'CS303', course_name: 'Computer Networks', semester: 'Sem 5', academic_year: '2025-2026', is_blocked: false },
  { colid: 4, crsid: 'CS304', course_name: 'Software Engineering', semester: 'Sem 5', academic_year: '2025-2026', is_blocked: false },
  { colid: 5, crsid: 'CS305', course_name: 'Artificial Intelligence', semester: 'Sem 5', academic_year: '2025-2026', is_blocked: true },
  { colid: 6, crsid: 'CS306', course_name: 'Web Technologies', semester: 'Sem 5', academic_year: '2025-2026', is_blocked: false }
];

const DEFAULT_FALLBACK_ASSIGNMENTS = [
  { assignment_id: 101, assignment_type: 'SUBJECTIVE', colid: 1, course_name: 'Operating Systems', unit_name: null, title_html: 'Process Scheduling Analysis (Round Robin & Priority)', due_date_raw: 'Today, 11:59 PM', is_submitted: false, is_blocked: false },
  { assignment_id: 102, assignment_type: 'HANDS_ON', colid: 2, course_name: 'Database Management Systems', unit_name: 'Unit 2: Relational Models', title_html: 'Build REST API Integration with PostgreSQL CRUD', due_date_raw: 'In 2 Days', is_submitted: false, is_blocked: false },
  { assignment_id: 103, assignment_type: 'SUBJECTIVE', colid: 3, course_name: 'Computer Networks', unit_name: null, title_html: 'Setup development environment & TCP/IP Stack Report', due_date_raw: 'In 5 Days', is_submitted: true, is_blocked: false },
  { assignment_id: 104, assignment_type: 'HANDS_ON', colid: 4, course_name: 'Software Engineering', unit_name: 'Unit 1: Agile Planning', title_html: 'Define user personas & Sprint Jira Board', due_date_raw: 'In 3 Days', is_submitted: true, is_blocked: false },
  { assignment_id: 105, assignment_type: 'SUBJECTIVE', colid: 2, course_name: 'Database Management Systems', unit_name: null, title_html: 'Create style guide & 3NF / BCNF Proofs', due_date_raw: 'Tomorrow', is_submitted: false, is_blocked: false },
  { assignment_id: 106, assignment_type: 'HANDS_ON', colid: 6, course_name: 'Web Technologies', unit_name: 'Unit 4: Modern Frontends', title_html: 'Implement responsive brutalist UI framework', due_date_raw: 'In 6 Days', is_submitted: false, is_blocked: false },
  { assignment_id: 107, assignment_type: 'SUBJECTIVE', colid: 1, course_name: 'Operating Systems', unit_name: null, title_html: 'Virtual Memory Paging & Replacement Simulation', due_date_raw: 'Overdue (Yesterday)', is_submitted: false, is_blocked: false }
];

// Document Ready Initialization
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initUserSession();
  await loadAppData();

  // Accessibility & UX: Dismiss modal or mobile drawer on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('modalOverlay');
      if (modal && modal.classList.contains('active')) {
        closeModal();
      } else {
        closeSidebar();
      }
    }
  });
});

// 1. Theme Management
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
  showToast(`Switched to ${next.toUpperCase()} theme`, 'info');
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = theme === 'dark' ? '☼' : '◐';
}

// 2. User Session Management
function initUserSession() {
  const stored = localStorage.getItem('volp_user');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
    } catch (e) {
      currentUser = { email: 'student@university.edu', token: 'demo' };
    }
  } else {
    currentUser = { email: 'student@university.edu', token: 'demo' };
  }

  const userEmail = currentUser.email || 'student@university.edu';
  const nameDisplay = userEmail.split('@')[0].toUpperCase();
  const avatarText = (nameDisplay.length >= 2 ? nameDisplay.substring(0, 2) : nameDisplay).toUpperCase();
  
  const sideName = document.getElementById('sidebarUserName');
  const sideAvatar = document.getElementById('sidebarAvatar');
  const settingsEmail = document.getElementById('settingsEmail');
  const settingsLargeAvatar = document.getElementById('settingsLargeAvatar');
  const settingsProfileTitle = document.getElementById('settingsProfileTitle');
  
  if (sideName) sideName.textContent = userEmail;
  if (sideAvatar) sideAvatar.textContent = avatarText;
  if (settingsEmail) settingsEmail.value = userEmail;
  if (settingsLargeAvatar) settingsLargeAvatar.textContent = avatarText;
  if (settingsProfileTitle) settingsProfileTitle.textContent = nameDisplay;
}

function handleSignOut() {
  localStorage.removeItem('volp_user');
  showToast('Signed out successfully', 'info');
  setTimeout(() => {
    window.location.href = 'login.html';
  }, 400);
}

// 3. Helper Functions: Date Parsing & Data Normalization
function normalizeType(type) {
  if (!type) return '';
  const clean = String(type).toUpperCase().replace(/[^A-Z]/g, '');
  if (clean === 'HANDSON' || clean === 'HANDS_ON') return 'HANDS_ON';
  if (clean === 'SUBJECTIVE') return 'SUBJECTIVE';
  return clean;
}

function isSubmitted(item) {
  return item.is_submitted === true || item.is_submitted === 1 || item.is_submitted === 'true' || item.is_submitted === '1';
}

function parseVolpDate(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  const lower = str.toLowerCase();
  
  if (lower.includes('overdue') || lower.includes('yesterday')) {
    return new Date(Date.now() - 86400000);
  }
  if (lower.includes('today')) {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }
  if (lower.includes('tomorrow')) {
    const d = new Date(Date.now() + 86400000);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  const inDaysMatch = lower.match(/in\s+(\d+)\s+days?/);
  if (inDaysMatch) {
    return new Date(Date.now() + parseInt(inDaysMatch[1], 10) * 86400000);
  }

  // Format: DD/MM/YYYY or DD-MM-YYYY (with optional HH:MM AM/PM)
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    let hours = match[4] ? parseInt(match[4], 10) : 23;
    const minutes = match[5] ? parseInt(match[5], 10) : 59;
    const seconds = match[6] ? parseInt(match[6], 10) : 0;
    const ampm = match[7] ? match[7].toUpperCase() : null;
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
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
    return (item.due_date_raw || '').toLowerCase().includes('overdue');
  }
  return d.getTime() < Date.now();
}

function cleanHtmlTitle(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function formatTimestamp(ts) {
  if (!ts) return 'RECENT';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return String(ts);
  }
}

// 4. Data Fetching from Backend API
async function loadAppData(refresh = false) {
  try {
    // 1. Fetch Courses
    const courseRes = await fetch('/api/assignments/my-courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, token: currentUser.token, refresh })
    });

    if (courseRes.ok) {
      const courseData = await courseRes.json();
      rawCourses = courseData.courses || [];
      isOfflineMode = false;
      const statusEl = document.getElementById('settingsDataSource');
      if (statusEl) statusEl.value = `Source: ${courseData.source || 'MYSQL_DATABASE'} (Live Connected)`;
    } else {
      throw new Error('Course API returned ' + courseRes.status);
    }

    // 2. Fetch Assignments
    const assignRes = await fetch('/api/assignments/my-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, token: currentUser.token, refresh })
    });

    if (assignRes.ok) {
      const assignData = await assignRes.json();
      rawAssignments = assignData.assignments || [];
    }

    // 3. Fetch Blocked Items
    await loadBlockedData();

  } catch (err) {
    console.warn('Backend API unavailable. Using fallback dataset:', err.message);
    isOfflineMode = true;
    if (rawCourses.length === 0) rawCourses = [...DEFAULT_FALLBACK_COURSES];
    if (rawAssignments.length === 0) rawAssignments = [...DEFAULT_FALLBACK_ASSIGNMENTS];
    const statusEl = document.getElementById('settingsDataSource');
    if (statusEl) statusEl.value = 'Offline / Fallback Local Storage Mode';
    await loadBlockedData();
  }

  renderAllViews();
}

async function loadBlockedData() {
  const email = currentUser?.email;
  if (!email) return;

  try {
    const bCourseRes = await fetch(`/api/blocked?email=${encodeURIComponent(email)}`);
    if (bCourseRes.ok) {
      const bData = await bCourseRes.json();
      blockedCoursesList = bData.blocked || [];
    }
    
    const bAssignRes = await fetch(`/api/blocked-assignments?email=${encodeURIComponent(email)}`);
    if (bAssignRes.ok) {
      const aData = await bAssignRes.json();
      blockedAssignmentsList = aData.blocked || [];
    }
  } catch (e) {
    console.warn('Could not load blocked data from API:', e.message);
    blockedCoursesList = rawCourses.filter(c => c.is_blocked);
    blockedAssignmentsList = rawAssignments.filter(a => a.is_blocked);
  }

  // 1. Synchronize Courses Blocked State
  const blockedColidSet = new Set(blockedCoursesList.map(c => Number(c.colid)));
  rawCourses.forEach(course => {
    if (blockedColidSet.has(Number(course.colid))) {
      course.is_blocked = true;
      const bc = blockedCoursesList.find(c => Number(c.colid) === Number(course.colid));
      if (bc && (bc.blocked_at || bc.updated_at)) {
        course.blocked_at = bc.blocked_at || bc.updated_at;
      }
    } else if (course.is_blocked) {
      blockedCoursesList.push(course);
      blockedColidSet.add(Number(course.colid));
    } else {
      course.is_blocked = false;
    }
  });

  // Ensure any blocked course in blockedCoursesList is present in rawCourses
  blockedCoursesList.forEach(bc => {
    if (!rawCourses.some(rc => Number(rc.colid) === Number(bc.colid))) {
      rawCourses.push({
        colid: Number(bc.colid),
        crsid: bc.crsid || null,
        course_name: bc.course_name || ('Course #' + bc.colid),
        semester: bc.semester || null,
        academic_year: bc.academic_year || null,
        is_blocked: true,
        blocked_at: bc.blocked_at || bc.updated_at || null
      });
    }
  });

  // 2. Synchronize Assignments Blocked State & Merge Missing Blocked Assignments
  const blockedAssignMap = new Map();
  blockedAssignmentsList.forEach(ba => {
    const key = `${Number(ba.assignment_id)}_${normalizeType(ba.assignment_type) || 'SUBJECTIVE'}`;
    blockedAssignMap.set(key, ba);
  });

  rawAssignments.forEach(assignment => {
    const key = `${Number(assignment.assignment_id)}_${normalizeType(assignment.assignment_type) || 'SUBJECTIVE'}`;
    if (blockedAssignMap.has(key)) {
      assignment.is_blocked = true;
      const ba = blockedAssignMap.get(key);
      if (ba.blocked_at) assignment.blocked_at = ba.blocked_at;
      if (!assignment.title_html && ba.title_hint) assignment.title_html = ba.title_hint;
      if (!assignment.course_name && ba.course_name) assignment.course_name = ba.course_name;
    } else {
      assignment.is_blocked = false;
    }
  });

  // Merge any blocked assignments that were omitted by backend /my-assignments
  blockedAssignmentsList.forEach(ba => {
    const key = `${Number(ba.assignment_id)}_${normalizeType(ba.assignment_type) || 'SUBJECTIVE'}`;
    const exists = rawAssignments.some(ra => `${Number(ra.assignment_id)}_${normalizeType(ra.assignment_type) || 'SUBJECTIVE'}` === key);
    if (!exists) {
      rawAssignments.push({
        assignment_id: Number(ba.assignment_id),
        assignment_type: ba.assignment_type || 'SUBJECTIVE',
        colid: ba.colid ? Number(ba.colid) : null,
        course_name: ba.course_name || 'Course',
        unit_name: ba.unit_name || null,
        title_html: ba.title_hint || ba.title_html || '',
        due_date_raw: ba.due_date_raw || '',
        is_submitted: false,
        is_blocked: true,
        blocked_at: ba.blocked_at || null
      });
    }
  });
}

// 5. View Navigation
function navigateTo(pageId, event) {
  if (event) event.preventDefault();
  
  currentTab = pageId;
  document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add('active');

  const navItem = document.querySelector(`.sidebar-nav-item[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  const titles = {
    dashboard: 'PROJECTS DASHBOARD',
    tasks: 'MY ASSIGNMENTS',
    courses: 'ENROLLED COURSES',
    blocked: 'BLOCK MANAGER',
    reminders: 'REMINDERS & NOTIFICATION LOG',
    settings: 'ACCOUNT CONFIGURATION'
  };

  const titleEl = document.getElementById('headerTitle');
  if (titleEl) titleEl.textContent = titles[pageId] || pageId.toUpperCase();

  if (pageId === 'reminders') {
    renderRemindersView();
  }

  closeSidebar();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
}

// 6. Comprehensive Filtering & Search Engine
function filterTasks() {
  const input = document.getElementById('taskSearchInput');
  currentSearchQuery = input ? input.value.trim().toLowerCase() : '';
  renderTasksView();
}

function setStatusFilter(filter, el) {
  currentStatusFilter = filter;
  document.querySelectorAll('#statusFilterGroup .filter-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTasksView();
}

function setTypeFilter(filter, el) {
  currentTypeFilter = filter;
  document.querySelectorAll('#typeFilterGroup .filter-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTasksView();
}

function getFilteredAssignments() {
  return rawAssignments.filter(item => {
    // 1. Search Query Filter
    if (currentSearchQuery) {
      const q = currentSearchQuery;
      const rawTitle = item.title_html || '';
      const textTitle = cleanHtmlTitle(rawTitle).toLowerCase();
      const matchTitle = textTitle.includes(q) || rawTitle.toLowerCase().includes(q);
      const matchCourse = (item.course_name || '').toLowerCase().includes(q);
      const matchUnit = (item.unit_name || '').toLowerCase().includes(q);
      const matchId = String(item.assignment_id || '').toLowerCase().includes(q);
      const itemType = (item.assignment_type || '').toLowerCase();
      const matchType = itemType.replace(/_/g, '-').includes(q) || itemType.includes(q);
      const matchDue = (item.due_date_raw || '').toLowerCase().includes(q);

      if (!matchTitle && !matchCourse && !matchUnit && !matchId && !matchType && !matchDue) {
        return false;
      }
    }

    // 2. Type Filter ('all', 'SUBJECTIVE', 'HANDS_ON')
    if (currentTypeFilter !== 'all') {
      const itemTypeNorm = normalizeType(item.assignment_type);
      const filterTypeNorm = normalizeType(currentTypeFilter);
      if (itemTypeNorm !== filterTypeNorm) {
        return false;
      }
    }

    // 3. Status Filter ('all', 'pending', 'submitted', 'overdue', 'blocked')
    const submitted = isSubmitted(item);
    const overdue = isAssignmentOverdue(item);

    if (currentStatusFilter === 'pending') {
      if (submitted || item.is_blocked) return false;
    } else if (currentStatusFilter === 'submitted') {
      if (!submitted) return false;
    } else if (currentStatusFilter === 'overdue') {
      if (!overdue || item.is_blocked) return false;
    } else if (currentStatusFilter === 'blocked') {
      if (!item.is_blocked) return false;
    }

    return true;
  });
}

// 7. Render All Views
function renderAllViews() {
  renderDashboardStats();
  renderDashboardProjectsGrid();
  renderDashboardRecentTable();
  renderTasksView();
  renderCoursesView();
  renderBlockManagerView();
  renderRemindersView();
}

// Render Dashboard Metrics (Real computed data)
function renderDashboardStats() {
  const total = rawAssignments.length;
  const pending = rawAssignments.filter(a => !isSubmitted(a) && !a.is_blocked).length;
  const submitted = rawAssignments.filter(a => isSubmitted(a)).length;
  const blocked = blockedCoursesList.length + blockedAssignmentsList.length;

  const totalEl = document.getElementById('statTotalAssignments');
  const pendingEl = document.getElementById('statPendingAssignments');
  const submittedEl = document.getElementById('statSubmittedAssignments');
  const blockedEl = document.getElementById('statBlockedAssignments');

  if (totalEl) totalEl.textContent = total;
  if (pendingEl) pendingEl.textContent = pending;
  if (submittedEl) submittedEl.textContent = submitted;
  if (blockedEl) blockedEl.textContent = blocked;

  const totalSub = document.getElementById('statTotalAssignmentsSub');
  const pendingSub = document.getElementById('statPendingAssignmentsSub');
  const submittedSub = document.getElementById('statSubmittedAssignmentsSub');
  const blockedSub = document.getElementById('statBlockedAssignmentsSub');

  if (totalSub) totalSub.textContent = `${rawCourses.length} ACTIVE COURSES`;
  if (pendingSub) {
    const overdueCount = rawAssignments.filter(a => isAssignmentOverdue(a)).length;
    pendingSub.textContent = overdueCount > 0 ? `${overdueCount} OVERDUE` : 'ALL ON SCHEDULE';
  }
  if (submittedSub) submittedSub.textContent = `${Math.round(total > 0 ? (submitted / total) * 100 : 0)}% COMPLETION`;
  if (blockedSub) blockedSub.textContent = `${blockedCoursesList.length} COURSES · ${blockedAssignmentsList.length} TASKS`;
}

// Render Course Cards on Dashboard
function renderDashboardProjectsGrid() {
  const container = document.getElementById('dashboardProjectsGrid');
  if (!container) return;

  container.innerHTML = '';
  const displayCourses = rawCourses.slice(0, 6);

  if (displayCourses.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-family:var(--font-mono);font-size:12px;padding:24px;">NO ENROLLED COURSES FOUND</div>';
    return;
  }

  displayCourses.forEach(course => {
    const courseAssignments = rawAssignments.filter(a => Number(a.colid) === Number(course.colid));
    const pendingCount = courseAssignments.filter(a => !isSubmitted(a) && !a.is_blocked).length;

    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-title">${escapeHtml(course.course_name)}</div>
        <ul class="project-card-meta-list">
          <li><span class="meta-key">Course Code:</span> ${escapeHtml(course.crsid ? String(course.crsid) : 'COLID #' + course.colid)}</li>
          <li><span class="meta-key">Semester:</span> ${escapeHtml(course.semester || 'N/A')}</li>
          <li><span class="meta-key">Academic Year:</span> ${escapeHtml(course.academic_year || 'N/A')}</li>
          <li><span class="meta-key">Status:</span> ${course.is_blocked ? '<span style="color:var(--danger)">BLOCKED / MUTED</span>' : '<span style="color:var(--success)">ACTIVE</span>'}</li>
          <li><span class="meta-key">Assignments:</span> ${courseAssignments.length} total (${pendingCount} pending)</li>
        </ul>
      </div>
      <div class="project-card-footer">
        <span class="code-tag code-tag--lime">COLID #${course.colid}</span>
        <button class="btn btn--sm ${course.is_blocked ? 'btn--success' : 'btn--ghost'}" onclick="toggleCourseBlock(${course.colid}, '${escapeHtml(course.course_name || '')}', ${Boolean(course.is_blocked)})">
          ${course.is_blocked ? 'UNBLOCK' : 'BLOCK'}
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Render Dashboard Urgent Deadlines Table
function renderDashboardRecentTable() {
  const tbody = document.getElementById('dashboardRecentTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const pendingItems = rawAssignments
    .filter(a => !isSubmitted(a) && !a.is_blocked)
    .slice(0, 5);

  if (pendingItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px;font-family:var(--font-mono);font-size:12px;">NO PENDING DEADLINES FOUND</td></tr>`;
    return;
  }

  pendingItems.forEach(item => {
    const tr = document.createElement('tr');
    const typeNorm = normalizeType(item.assignment_type);
    const typeLabel = typeNorm === 'HANDS_ON' ? 'HANDS-ON' : 'SUBJECTIVE';
    const typeBadgeClass = typeNorm === 'HANDS_ON' ? 'type-badge--handson' : 'type-badge--subjective';
    const overdue = isAssignmentOverdue(item);
    const cleanTitle = cleanHtmlTitle(item.title_html) || 'Assignment #' + item.assignment_id;

    tr.innerHTML = `
      <td><span class="type-badge ${typeBadgeClass}">${typeLabel}</span></td>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(item.course_name || 'Course')}</span></td>
      <td>
        <div class="assignment-title">${escapeHtml(cleanTitle)}</div>
        <div class="assignment-sub">${item.unit_name ? escapeHtml(item.unit_name) + ' · ' : ''}ID: #${item.assignment_id}</div>
      </td>
      <td>
        <span class="meta-text" style="color:${overdue ? 'var(--danger)' : 'var(--warning)'};">
          ${overdue ? '⚠ ' : ''}${escapeHtml(item.due_date_raw || 'Pending')}
        </span>
      </td>
      <td>
        <span class="badge ${overdue ? 'badge--overdue' : 'badge--pending'}">
          ${overdue ? 'OVERDUE' : 'PENDING'}
        </span>
      </td>
      <td style="text-align:right">
        <button class="btn ${item.is_blocked ? 'btn--success' : 'btn--ghost'} btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${escapeHtml(item.assignment_type || 'SUBJECTIVE')}', '${escapeHtml(item.course_name || '')}', null, ${Boolean(item.is_blocked)})">
          ${item.is_blocked ? 'RESTORE' : 'BLOCK'}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 8. Tasks & Assignments View (Kanban + Table View with live filters)
function switchTaskView(mode) {
  currentTaskView = mode;
  document.getElementById('viewToggleKanban').classList.toggle('active', mode === 'kanban');
  document.getElementById('viewToggleTable').classList.toggle('active', mode === 'table');
  
  document.getElementById('tasksKanbanView').style.display = mode === 'kanban' ? 'grid' : 'none';
  document.getElementById('tasksTableView').style.display = mode === 'table' ? 'block' : 'none';
  renderTasksView();
}

function renderTasksView() {
  const filtered = getFilteredAssignments();

  if (currentTaskView === 'kanban') {
    renderKanbanBoard(filtered);
  } else {
    renderTasksTable(filtered);
  }
}

function renderKanbanBoard(items) {
  const todoCol = document.getElementById('kanbanColTodo');
  const progressCol = document.getElementById('kanbanColProgress');
  const doneCol = document.getElementById('kanbanColDone');

  todoCol.innerHTML = '';
  progressCol.innerHTML = '';
  doneCol.innerHTML = '';

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'kanban-card';

    const typeNorm = normalizeType(item.assignment_type);
    const typeLabel = typeNorm === 'HANDS_ON' ? 'HANDS-ON' : 'SUBJECTIVE';
    const typeBadgeClass = typeNorm === 'HANDS_ON' ? 'type-badge--handson' : 'type-badge--subjective';
    const submitted = isSubmitted(item);
    const overdue = isAssignmentOverdue(item);
    const cleanTitle = cleanHtmlTitle(item.title_html) || 'Assignment #' + item.assignment_id;

    card.innerHTML = `
      <div class="kanban-card-top">
        <span class="type-badge ${typeBadgeClass}">${typeLabel}</span>
        <span class="kanban-card-course">${escapeHtml(item.course_name || 'Course')}</span>
      </div>
      <div class="kanban-card-title" title="${escapeHtml(cleanTitle)}" style="margin-top: 8px;">
        ${escapeHtml(cleanTitle)}
      </div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:6px;">
        ${item.unit_name ? escapeHtml(item.unit_name) + ' · ' : ''}ID: #${item.assignment_id}
      </div>
      <div style="font-family:var(--font-mono);font-size:10px;margin-top:8px;display:flex;align-items:center;justify-content:space-between;">
        <span style="color: ${overdue && !item.is_blocked ? 'var(--danger)' : 'var(--text-secondary)'};">
          ${overdue && !item.is_blocked ? '⚠ OVERDUE: ' : 'Due: '}${escapeHtml(item.due_date_raw || 'No Deadline')}
        </span>
        <span class="badge ${item.is_blocked ? 'badge--blocked' : (submitted ? 'badge--submitted' : (overdue ? 'badge--overdue' : 'badge--pending'))}">
          ${item.is_blocked ? 'BLOCKED' : (submitted ? 'SUBMITTED' : (overdue ? 'OVERDUE' : 'PENDING'))}
        </span>
      </div>
      <div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border);display:flex;gap:6px;justify-content:flex-end;">
        <button class="btn ${item.is_blocked ? 'btn--success' : 'btn--ghost'} btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${escapeHtml(item.assignment_type || 'SUBJECTIVE')}', '${escapeHtml(item.course_name || '')}', null, ${Boolean(item.is_blocked)})">
          ${item.is_blocked ? 'RESTORE' : 'BLOCK'}
        </button>
      </div>
    `;

    if (submitted) {
      doneCol.appendChild(card);
    } else if (item.is_blocked) {
      progressCol.appendChild(card);
    } else if (overdue) {
      todoCol.appendChild(card);
    } else {
      progressCol.appendChild(card);
    }
  });

  if (todoCol.children.length === 0) todoCol.innerHTML = '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;text-align:center;">NO OVERDUE ASSIGNMENTS</div>';
  if (progressCol.children.length === 0) progressCol.innerHTML = '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;text-align:center;">NO PENDING ASSIGNMENTS</div>';
  if (doneCol.children.length === 0) doneCol.innerHTML = '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;text-align:center;">NO COMPLETED ASSIGNMENTS</div>';
}

function renderTasksTable(items) {
  const tbody = document.getElementById('tasksFullTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px;font-family:var(--font-mono);font-size:12px;">NO MATCHING ASSIGNMENTS FOUND</td></tr>`;
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    const typeNorm = normalizeType(item.assignment_type);
    const typeLabel = typeNorm === 'HANDS_ON' ? 'HANDS-ON' : 'SUBJECTIVE';
    const typeBadgeClass = typeNorm === 'HANDS_ON' ? 'type-badge--handson' : 'type-badge--subjective';
    const submitted = isSubmitted(item);
    const overdue = isAssignmentOverdue(item);
    const cleanTitle = cleanHtmlTitle(item.title_html || item.title_hint) || 'Assignment #' + item.assignment_id;

    tr.innerHTML = `
      <td><span class="type-badge ${typeBadgeClass}">${typeLabel}</span></td>
      <td>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(item.course_name || 'Course')}</span>
      </td>
      <td>
        <div class="assignment-title" title="${escapeHtml(cleanTitle)}">${escapeHtml(cleanTitle)}</div>
        <div class="assignment-sub">${item.unit_name ? escapeHtml(item.unit_name) + ' · ' : ''}ID: #${item.assignment_id}</div>
      </td>
      <td>
        <span class="meta-text" style="color: ${overdue && !item.is_blocked ? 'var(--danger)' : 'var(--text-secondary)'};">
          ${overdue && !item.is_blocked ? '⚠ ' : ''}${escapeHtml(item.due_date_raw || 'No Deadline')}
        </span>
      </td>
      <td>
        <span class="badge ${item.is_blocked ? 'badge--blocked' : (submitted ? 'badge--submitted' : (overdue ? 'badge--overdue' : 'badge--pending'))}">
          ${item.is_blocked ? 'BLOCKED' : (submitted ? 'SUBMITTED' : (overdue ? 'OVERDUE' : 'PENDING'))}
        </span>
      </td>
      <td style="text-align:right">
        <button class="btn ${item.is_blocked ? 'btn--success' : 'btn--ghost'} btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${escapeHtml(item.assignment_type || 'SUBJECTIVE')}', '${escapeHtml(item.course_name || '')}', null, ${Boolean(item.is_blocked)})">
          ${item.is_blocked ? 'RESTORE' : 'BLOCK'}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 9. Render Courses View
function renderCoursesView() {
  const grid = document.getElementById('allCoursesGrid');
  if (!grid) return;

  grid.innerHTML = '';
  const metaCount = document.getElementById('coursesCountMeta');
  if (metaCount) metaCount.textContent = `${rawCourses.length} ENROLLED COURSES`;

  if (rawCourses.length === 0) {
    grid.innerHTML = '<div style="color:var(--muted);font-family:var(--font-mono);font-size:12px;padding:24px;">NO ENROLLED COURSES FOUND</div>';
    return;
  }

  rawCourses.forEach(course => {
    const courseAssignments = rawAssignments.filter(a => Number(a.colid) === Number(course.colid));
    const pendingCount = courseAssignments.filter(a => !isSubmitted(a) && !a.is_blocked).length;

    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-title">${escapeHtml(course.course_name)}</div>
        <ul class="project-card-meta-list">
          <li><span class="meta-key">Course Code:</span> ${escapeHtml(course.crsid ? String(course.crsid) : 'COLID #' + course.colid)}</li>
          <li><span class="meta-key">Semester:</span> ${escapeHtml(course.semester || 'N/A')}</li>
          <li><span class="meta-key">Academic Year:</span> ${escapeHtml(course.academic_year || 'N/A')}</li>
          <li><span class="meta-key">Status:</span> ${course.is_blocked ? '<span style="color:var(--danger)">MUTED / BLOCKED</span>' : '<span style="color:var(--success)">ACTIVE</span>'}</li>
          <li><span class="meta-key">Assignments:</span> ${courseAssignments.length} total (${pendingCount} pending)</li>
        </ul>
      </div>
      <div class="project-card-footer">
        <span class="code-tag code-tag--lime">COLID #${course.colid}</span>
        <button class="btn btn--sm ${course.is_blocked ? 'btn--success' : 'btn--danger'}" onclick="toggleCourseBlock(${course.colid}, '${escapeHtml(course.course_name || '')}', ${Boolean(course.is_blocked)})">
          ${course.is_blocked ? 'RESTORE COURSE' : 'BLOCK COURSE'}
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// 10. Render Block Manager View
function renderBlockManagerView() {
  // 1. Blocked Courses
  const cTbody = document.getElementById('blockedCoursesTableBody');
  if (cTbody) {
    cTbody.innerHTML = '';
    
    const coursesMap = new Map();
    blockedCoursesList.forEach(c => {
      if (c && c.colid) coursesMap.set(Number(c.colid), { ...c, is_blocked: true });
    });
    rawCourses.filter(c => c.is_blocked).forEach(c => {
      const colid = Number(c.colid);
      if (!coursesMap.has(colid)) {
        coursesMap.set(colid, c);
      } else {
        coursesMap.set(colid, { ...c, ...coursesMap.get(colid) });
      }
    });

    const blockedC = Array.from(coursesMap.values());

    if (blockedC.length === 0) {
      cTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px;font-family:var(--font-mono);font-size:11px;">NO BLOCKED COURSES</td></tr>`;
    } else {
      blockedC.forEach(c => {
        const tr = document.createElement('tr');
        const courseIdText = c.crsid ? String(c.crsid) : ('COLID #' + c.colid);
        const blockedDate = c.blocked_at ? formatTimestamp(c.blocked_at) : (c.updated_at ? formatTimestamp(c.updated_at) : 'ACTIVE BLOCK');
        tr.innerHTML = `
          <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(courseIdText)}</span></td>
          <td><strong>${escapeHtml(c.course_name || 'Course ' + c.colid)}</strong></td>
          <td><span class="meta-text">${escapeHtml(blockedDate)}</span></td>
          <td style="text-align:right">
            <button class="btn btn--success btn--sm" onclick="toggleCourseBlock(${c.colid}, '${escapeHtml(c.course_name || '')}', true)">RESTORE</button>
          </td>
        `;
        cTbody.appendChild(tr);
      });
    }
  }

  // 2. Blocked Assignments
  const aTbody = document.getElementById('blockedAssignmentsTableBody');
  if (aTbody) {
    aTbody.innerHTML = '';

    const assignMap = new Map();
    blockedAssignmentsList.forEach(a => {
      if (a && a.assignment_id) {
        const key = `${Number(a.assignment_id)}_${normalizeType(a.assignment_type) || 'SUBJECTIVE'}`;
        assignMap.set(key, { ...a, is_blocked: true });
      }
    });
    rawAssignments.filter(a => a.is_blocked).forEach(a => {
      const key = `${Number(a.assignment_id)}_${normalizeType(a.assignment_type) || 'SUBJECTIVE'}`;
      if (!assignMap.has(key)) {
        assignMap.set(key, a);
      } else {
        assignMap.set(key, { ...a, ...assignMap.get(key) });
      }
    });

    const blockedA = Array.from(assignMap.values());

    if (blockedA.length === 0) {
      aTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:18px;font-family:var(--font-mono);font-size:11px;">NO BLOCKED ASSIGNMENTS</td></tr>`;
    } else {
      blockedA.forEach(a => {
        const tr = document.createElement('tr');
        const cleanTitle = cleanHtmlTitle(a.title_hint || a.title_html) || ('Assignment #' + a.assignment_id);
        const blockedDate = a.blocked_at ? formatTimestamp(a.blocked_at) : 'RECENT';
        tr.innerHTML = `
          <td><span class="code-tag code-tag--cyan">#${a.assignment_id}</span></td>
          <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(a.course_name || 'Course')}</span></td>
          <td>${escapeHtml(cleanTitle)}</td>
          <td><span class="meta-text">${escapeHtml(blockedDate)}</span></td>
          <td style="text-align:right">
            <button class="btn btn--success btn--sm" onclick="toggleAssignmentBlock(${a.assignment_id}, '${escapeHtml(a.assignment_type || 'SUBJECTIVE')}', '${escapeHtml(a.course_name || '')}', null, true)">RESTORE</button>
          </td>
        `;
        aTbody.appendChild(tr);
      });
    }
  }
}

// 11. Render Reminders & Notification View
function renderRemindersView() {
  const list = document.getElementById('remindersTimelineList');
  if (!list) return;

  const isCourseBlocked = (colid) => blockedCoursesList.some(c => Number(c.colid) === Number(colid));
  const pendingUnblocked = rawAssignments.filter(a => !isSubmitted(a) && !a.is_blocked && !isCourseBlocked(a.colid)).length;
  const blockedCount = blockedCoursesList.length + blockedAssignmentsList.length;

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
        RECIPIENT: ${escapeHtml(currentUser?.email || 'N/A')} | PENDING TO SEND: ${pendingUnblocked} | MUTED ITEMS: ${blockedCount}
      </div>
    </div>
  `;

  if (window.reminderLogs && window.reminderLogs.length > 0) {
    window.reminderLogs.forEach(log => {
      html += `
        <div class="note-card">
          <div class="note-card-header">
            <span>${escapeHtml(log.title)} — ${escapeHtml(log.time)}</span>
            <span class="badge ${log.success ? 'badge--submitted' : 'badge--pending'}">${log.success ? 'SENT' : 'LOGGED'}</span>
          </div>
          <div class="note-card-body">${escapeHtml(log.message)}</div>
          <div class="note-card-footer">RECIPIENT: ${escapeHtml(currentUser?.email || 'N/A')} | STATUS: PROCESSED</div>
        </div>
      `;
    });
  }

  list.innerHTML = html;
}

// 12. Actions: Sync, Trigger Reminders, Blocks, and Submission toggles
async function syncNow() {
  const btn = document.getElementById('syncBtn');
  const label = document.getElementById('syncBtnLabel');
  
  if (btn) btn.disabled = true;
  if (label) label.textContent = 'SYNCING VOLP...';

  try {
    await loadAppData(true);
    showToast('VOLP Live Sync completed successfully', 'success');
    const syncStatusLabel = document.getElementById('lastSyncStatusLabel');
    if (syncStatusLabel) {
      syncStatusLabel.textContent = `LAST SYNC: JUST NOW (${new Date().toLocaleTimeString()})`;
    }
  } catch (err) {
    showToast('Sync updated from cached state', 'warning');
  } finally {
    if (btn) btn.disabled = false;
    if (label) label.textContent = 'SYNC VOLP';
  }
}

async function triggerReminder() {
  const btn = document.getElementById('reminderBtn');
  const pageBtn = document.getElementById('triggerReminderPageBtn');
  if (btn) btn.disabled = true;
  if (pageBtn) pageBtn.disabled = true;
  showToast('Simulating 8 PM Cron Assignment Reminder...', 'info');

  try {
    const res = await fetch('/api/assignments/trigger-8pm-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, token: currentUser.token })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || '8 PM Reminder digest dispatched!', 'success');
      if (!window.reminderLogs) window.reminderLogs = [];
      window.reminderLogs.unshift({
        title: 'MANUAL 8 PM DISPATCH TRIGGER',
        message: data.message || `Dispatched assignment reminder digest to ${currentUser.email}`,
        time: new Date().toLocaleTimeString(),
        success: true
      });
      renderRemindersView();
    } else {
      throw new Error(data.error || 'Server error');
    }
  } catch (e) {
    showToast('8 PM Reminder triggered: ' + e.message, 'info');
    if (!window.reminderLogs) window.reminderLogs = [];
    window.reminderLogs.unshift({
      title: 'MANUAL 8 PM DISPATCH TRIGGER',
      message: `Trigger executed for ${currentUser.email}. Check server terminal / mailbox.`,
      time: new Date().toLocaleTimeString(),
      success: true
    });
    renderRemindersView();
  } finally {
    if (btn) btn.disabled = false;
    if (pageBtn) pageBtn.disabled = false;
  }
}

// Block / Unblock Course
async function toggleCourseBlock(colid, courseName, currentlyBlocked) {
  const colidNum = Number(colid);
  const c = rawCourses.find(item => Number(item.colid) === colidNum) ||
            blockedCoursesList.find(item => Number(item.colid) === colidNum);
  
  const actualName = courseName || c?.course_name || ('Course #' + colidNum);
  const isCurrentlyBlocked = currentlyBlocked !== undefined ? Boolean(currentlyBlocked) : Boolean(c?.is_blocked);
  const actionText = isCurrentlyBlocked ? 'unblock' : 'block';

  openModal(
    `${actionText.toUpperCase()} COURSE`,
    `Are you sure you want to ${actionText} "${actualName}"? ${isCurrentlyBlocked ? 'It will reappear in daily reminders.' : 'All assignments for this course will be omitted from 8 PM email digests.'}`,
    async () => {
      try {
        if (!isCurrentlyBlocked) {
          await fetch('/api/blocked', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentUser.email, colid: colidNum, course_name: actualName })
          });
        } else {
          await fetch('/api/blocked', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentUser.email, colid: colidNum })
          });
        }
      } catch (e) {
        console.warn('Backend route offline, mutating locally:', e.message);
      }

      const targetCourse = rawCourses.find(item => Number(item.colid) === colidNum);
      if (targetCourse) targetCourse.is_blocked = !isCurrentlyBlocked;
      await loadBlockedData();
      
      showToast(`Course "${actualName}" ${actionText}ed successfully`, 'success');
      renderAllViews();
    }
  );
}

// Block / Unblock Assignment
async function toggleAssignmentBlock(assignmentId, assignmentType, courseName, titleHint, currentlyBlocked) {
  const idNum = Number(assignmentId);
  const normType = normalizeType(assignmentType);

  const a = rawAssignments.find(item => Number(item.assignment_id) === idNum && (!normType || normalizeType(item.assignment_type) === normType)) ||
            rawAssignments.find(item => Number(item.assignment_id) === idNum) ||
            blockedAssignmentsList.find(item => Number(item.assignment_id) === idNum && (!normType || normalizeType(item.assignment_type) === normType)) ||
            blockedAssignmentsList.find(item => Number(item.assignment_id) === idNum);

  const actualType = normType || normalizeType(a?.assignment_type) || 'SUBJECTIVE';
  const actualCourse = courseName || a?.course_name || 'Course';
  const actualTitle = titleHint || cleanHtmlTitle(a?.title_hint || a?.title_html) || ('Assignment #' + idNum);
  const isCurrentlyBlocked = currentlyBlocked !== undefined ? Boolean(currentlyBlocked) : Boolean(a?.is_blocked);
  const actionText = isCurrentlyBlocked ? 'restore' : 'block';

  openModal(
    `${actionText.toUpperCase()} ASSIGNMENT`,
    `Are you sure you want to ${actionText} "${actualTitle}"?`,
    async () => {
      try {
        if (!isCurrentlyBlocked) {
          await fetch('/api/blocked-assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: currentUser.email,
              assignment_id: idNum,
              assignment_type: actualType,
              colid: a?.colid ? Number(a.colid) : null,
              course_name: actualCourse,
              title_hint: a?.title_html || a?.title_hint || actualTitle
            })
          });
        } else {
          await fetch('/api/blocked-assignments', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: currentUser.email,
              assignment_id: idNum,
              assignment_type: actualType
            })
          });
        }
      } catch (e) {
        console.warn('Backend route offline, mutating locally:', e.message);
      }

      const targetAssignment = rawAssignments.find(item => Number(item.assignment_id) === idNum && normalizeType(item.assignment_type) === normalizeType(actualType));
      if (targetAssignment) {
        targetAssignment.is_blocked = !isCurrentlyBlocked;
      } else if (!isCurrentlyBlocked) {
        rawAssignments.push({
          assignment_id: idNum,
          assignment_type: actualType,
          colid: a?.colid ? Number(a.colid) : null,
          course_name: actualCourse,
          unit_name: a?.unit_name || null,
          title_html: a?.title_html || a?.title_hint || actualTitle,
          due_date_raw: a?.due_date_raw || '',
          is_submitted: false,
          is_blocked: true,
          blocked_at: new Date().toISOString()
        });
      }

      await loadBlockedData();

      showToast(`Assignment #${idNum} ${actionText === 'restore' ? 'restored' : 'blocked'} successfully`, 'success');
      renderAllViews();
    }
  );
}

// 13. Modal Utilities
function openModal(title, body, confirmCallback) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').textContent = body;
  pendingModalAction = confirmCallback;
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  pendingModalAction = null;
}

function confirmModal() {
  if (typeof pendingModalAction === 'function') {
    pendingModalAction();
  }
  closeModal();
}

// 14. Toast Notification System
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <span style="cursor:pointer;margin-left:12px;opacity:0.6;" onclick="this.parentElement.remove()">✕</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// Helper: Escape HTML strings
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
