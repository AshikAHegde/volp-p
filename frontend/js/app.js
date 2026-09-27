/**
 * VOLP Reminder — Assignment Console App Client
 * Pure real-data integration with VOLP backend APIs
 */

// Global State
let currentUser = null;
let rawAssignments = [];
let rawCourses = [];
let blockedCoursesList = [];
let blockedAssignmentsList = [];

let currentTab = 'dashboard';
let currentStatusFilter = 'all';
let currentSearchQuery = '';
let pendingModalAction = null;

// Document Ready Initialization
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  const hasUser = initUserSession();
  if (!hasUser) {
    window.location.href = 'login.html';
    return;
  }
  await loadAppData();
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
  if (!stored) {
    return false;
  }

  try {
    currentUser = JSON.parse(stored);
    if (!currentUser || !currentUser.email || !currentUser.token) {
      return false;
    }
  } catch (e) {
    return false;
  }

  // Update UI with User Details
  const email = currentUser.email || 'student@vit.edu';
  const prefix = email.split('@')[0];
  const avatarText = prefix.substring(0, 2).toUpperCase();

  const sideName = document.getElementById('sidebarUserName');
  const sideAvatar = document.getElementById('sidebarAvatar');
  const settingsEmail = document.getElementById('settingsEmail');
  const settingsEmailDisplay = document.getElementById('settingsEmailDisplay');
  const settingsLargeAvatar = document.getElementById('settingsLargeAvatar');
  const reminderCronFooter = document.getElementById('reminderCronFooter');

  if (sideName) sideName.textContent = email;
  if (sideAvatar) sideAvatar.textContent = avatarText;
  if (settingsEmail) settingsEmail.value = email;
  if (settingsEmailDisplay) settingsEmailDisplay.textContent = email;
  if (settingsLargeAvatar) settingsLargeAvatar.textContent = avatarText;
  if (reminderCronFooter) reminderCronFooter.textContent = `TARGET: ${email} | SCHEDULE: "0 20 * * *" | STATUS: RUNNING`;

  return true;
}

function handleSignOut() {
  localStorage.removeItem('volp_user');
  showToast('Signed out successfully', 'info');
  setTimeout(() => {
    window.location.href = 'login.html';
  }, 350);
}

// 3. Data Fetching (Direct Backend API Integration)
async function loadAppData(refresh = false) {
  const syncBtn = document.getElementById('syncBtn');
  if (syncBtn) syncBtn.classList.add('loading');

  try {
    // 1. Fetch Blocked items first so we can mark blocked status
    await loadBlockedData();

    // 2. Fetch Courses
    const courseRes = await fetch('/api/assignments/my-courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, token: currentUser.token, refresh })
    });

    if (courseRes.ok) {
      const courseData = await courseRes.json();
      rawCourses = courseData.courses || [];
    } else {
      showToast('Failed to load courses from VOLP', 'error');
    }

    // 3. Fetch Assignments
    const assignRes = await fetch('/api/assignments/my-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, token: currentUser.token, refresh })
    });

    if (assignRes.ok) {
      const assignData = await assignRes.json();
      rawAssignments = assignData.assignments || [];
    } else {
      showToast('Failed to load assignments from VOLP', 'error');
    }

  } catch (err) {
    console.error('Error fetching data:', err);
    showToast(`Network error: ${err.message}`, 'error');
  } finally {
    if (syncBtn) syncBtn.classList.remove('loading');
    renderAllViews();
  }
}

async function loadBlockedData() {
  try {
    const [bCourseRes, bAssignRes] = await Promise.all([
      fetch(`/api/blocked?email=${encodeURIComponent(currentUser.email)}`),
      fetch(`/api/blocked-assignments?email=${encodeURIComponent(currentUser.email)}`)
    ]);

    if (bCourseRes.ok) {
      const bCData = await bCourseRes.json();
      blockedCoursesList = bCData.blockedCourses || [];
    }

    if (bAssignRes.ok) {
      const bAData = await bAssignRes.json();
      blockedAssignmentsList = bAData.blockedAssignments || [];
    }
  } catch (err) {
    console.error('Failed to load blocked list:', err);
  }
}

async function syncNow() {
  showToast('Connecting to VOLP Portal...', 'info');
  await loadAppData(true);
  showToast('Live synchronization complete', 'success');
}

// 4. Page Navigation & Tab Switcher
function navigateTo(pageId, event) {
  if (event) event.preventDefault();
  currentTab = pageId;

  // Sidebar Links Active Class
  document.querySelectorAll('.sidebar-nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-page') === pageId);
  });

  // Page Views
  document.querySelectorAll('.page-view').forEach(el => {
    el.classList.toggle('active', el.id === `page-${pageId}`);
  });

  // Header Title Update
  const titles = {
    dashboard: { title: 'PROJECTS DASHBOARD', meta: 'VOLP ASSIGNMENT SYSTEM / LIVE SYNC ACTIVE' },
    tasks: { title: 'ASSIGNMENTS & SUBMISSIONS', meta: 'MANAGE ALL COURSE ASSIGNMENTS & STATUS' },
    courses: { title: 'ENROLLED COURSES', meta: 'VOLP COURSE MODULE DIRECTORY' },
    blocked: { title: 'NOTIFICATION BLOCK MANAGER', meta: 'SUPPRESS REMINDERS FOR COURSES OR TASKS' },
    reminders: { title: 'DAILY REMINDER SERVICE', meta: 'AUTOMATIC 8:00 PM EMAIL DIGEST' },
    settings: { title: 'ACCOUNT SETTINGS', meta: 'VOLP AUTHENTICATED SESSION' }
  };

  const info = titles[pageId] || { title: 'VOLP REMINDER', meta: 'SYSTEM CONSOLE' };
  const hTitle = document.getElementById('headerTitle');
  const hMeta = document.getElementById('headerSubMeta');
  if (hTitle) hTitle.textContent = info.title;
  if (hMeta) hMeta.textContent = info.meta;

  // Close Mobile Sidebar if opened
  closeSidebar();
  renderAllViews();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  }
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && overlay) {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  }
}

// 5. Render All Views
function renderAllViews() {
  renderDashboard();
  renderTasks();
  renderCourses();
  renderBlocked();
}

// 6. View: Dashboard
function renderDashboard() {
  // Aggregate Metrics
  const total = rawAssignments.length;
  const submitted = rawAssignments.filter(a => a.is_submitted).length;
  const pending = rawAssignments.filter(a => !a.is_submitted).length;
  const blockedCount = blockedAssignmentsList.length + blockedCoursesList.length;

  const statTotal = document.getElementById('statTotalAssignments');
  const statPending = document.getElementById('statPendingAssignments');
  const statSubmitted = document.getElementById('statSubmittedAssignments');
  const statBlocked = document.getElementById('statBlockedAssignments');
  const statBlockedSub = document.getElementById('statBlockedSubLabel');

  if (statTotal) statTotal.textContent = total;
  if (statPending) statPending.textContent = pending;
  if (statSubmitted) statSubmitted.textContent = submitted;
  if (statBlocked) statBlocked.textContent = blockedCount;
  if (statBlockedSub) {
    statBlockedSub.textContent = `${blockedCoursesList.length} COURSES · ${blockedAssignmentsList.length} ASSIGNMENTS`;
  }

  // Dashboard Course Grid
  const grid = document.getElementById('dashboardProjectsGrid');
  if (grid) {
    if (rawCourses.length === 0) {
      grid.innerHTML = `<div class="empty-state">No courses found. Click 'SYNC VOLP' to fetch data.</div>`;
    } else {
      grid.innerHTML = rawCourses.map(course => {
        const isBlocked = isCourseBlocked(course.crsid, course.course_name);
        const courseAssignments = rawAssignments.filter(a => 
          (a.course_name && a.course_name === course.course_name) ||
          (a.colid && course.colid && String(a.colid) === String(course.colid))
        );
        const pendingForCourse = courseAssignments.filter(a => !a.is_submitted).length;
        const totalForCourse = courseAssignments.length;
        const progressPct = totalForCourse > 0 ? Math.round(((totalForCourse - pendingForCourse) / totalForCourse) * 100) : 100;

        return `
          <div class="project-card ${isBlocked ? 'blocked' : ''}">
            <div class="project-card-header">
              <div class="project-code-tag">${escapeHtml(course.crsid || 'CRS')}</div>
              <div style="display:flex;gap:6px;align-items:center;">
                ${isBlocked ? '<span class="badge badge--danger">BLOCKED</span>' : '<span class="badge badge--submitted">ACTIVE</span>'}
              </div>
            </div>
            
            <div class="project-card-title">${escapeHtml(course.course_name || 'Untitled Course')}</div>
            
            <div class="project-card-meta">
              <span>${escapeHtml(course.semester || 'Current Semester')}</span>
              <span>·</span>
              <span>${escapeHtml(course.academic_year || '')}</span>
            </div>
            
            <div class="project-card-footer">
              <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${progressPct}%;"></div>
              </div>
              <div class="project-stats-line">
                <span>${pendingForCourse} PENDING / ${totalForCourse} TOTAL</span>
                <span>${progressPct}%</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Dashboard Pending Assignments Table
  const recentTable = document.getElementById('dashboardRecentTableBody');
  if (recentTable) {
    const pendingList = rawAssignments.filter(a => !a.is_submitted).slice(0, 5);
    if (pendingList.length === 0) {
      recentTable.innerHTML = `<tr><td colspan="6" class="empty-state">No pending assignments! All caught up.</td></tr>`;
    } else {
      recentTable.innerHTML = pendingList.map(a => renderTableRowHtml(a, true)).join('');
    }
  }
}

// 7. View: Tasks & Assignments
function renderTasks() {
  const filtered = getFilteredAssignments();

  // Full Table View
  const tableBody = document.getElementById('tasksFullTableBody');
  if (tableBody) {
    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">No assignments match your search or filter.</td></tr>`;
    } else {
      tableBody.innerHTML = filtered.map(a => renderTableRowHtml(a, false)).join('');
    }
  }
}

function getFilteredAssignments() {
  return rawAssignments.filter(item => {
    // 1. Status Filter
    if (currentStatusFilter === 'pending' && item.is_submitted) return false;
    if (currentStatusFilter === 'submitted' && !item.is_submitted) return false;

    // 2. Search Query
    if (currentSearchQuery.trim() !== '') {
      const q = currentSearchQuery.toLowerCase();
      const title = stripHtml(item.title_html || '').toLowerCase();
      const course = (item.course_name || '').toLowerCase();
      const unit = (item.unit_name || '').toLowerCase();
      const type = (item.assignment_type || '').toLowerCase();
      if (!title.includes(q) && !course.includes(q) && !unit.includes(q) && !type.includes(q)) {
        return false;
      }
    }

    return true;
  });
}

function setStatusFilter(status, btnElement) {
  currentStatusFilter = status;
  const group = document.getElementById('statusFilterGroup');
  if (group) {
    group.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  }
  if (btnElement) btnElement.classList.add('active');
  renderTasks();
}

function filterTasks() {
  const input = document.getElementById('taskSearchInput');
  if (input) currentSearchQuery = input.value;
  renderTasks();
}

// Helper: Table Row HTML Renderer
function renderTableRowHtml(a, isCompact = false) {
  const isAssignBlocked = isAssignmentBlocked(a.assignment_id);
  const isCourseBlk = isCourseBlocked(null, a.course_name);
  const isBlocked = isAssignBlocked || isCourseBlk;

  const statusBadge = a.is_submitted
    ? '<span class="badge badge--submitted">SUBMITTED</span>'
    : (isBlocked 
        ? '<span class="badge badge--danger">MUTED</span>' 
        : '<span class="badge badge--pending">PENDING</span>');

  const cleanTitle = stripHtml(a.title_html || 'Untitled Assignment');
  const typeLabel = (a.assignment_type || 'TASK').toUpperCase();

  return `
    <tr class="${isBlocked ? 'row-blocked' : ''}">
      <td><span class="badge badge--code">${escapeHtml(typeLabel)}</span></td>
      <td><strong>${escapeHtml(a.course_name || '--')}</strong></td>
      ${!isCompact ? `<td><span class="meta-text">${escapeHtml(a.unit_name || '--')}</span></td>` : ''}
      <td>
        <div style="font-weight: 600; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(cleanTitle)}
        </div>
      </td>
      <td>
        <span class="mono-text">${escapeHtml(a.due_date_raw || '--')}</span>
      </td>
      <td>${statusBadge}</td>
      <td style="text-align: right;">
        ${isAssignBlocked 
          ? `<button class="btn btn--ghost btn--sm" onclick="unblockAssignment('${a.assignment_id}')">UNMUTE</button>`
          : `<button class="btn btn--danger btn--sm" onclick="blockAssignment('${a.assignment_id}', '${escapeHtml(cleanTitle)}', '${escapeHtml(a.course_name || '')}')">MUTE</button>`
        }
      </td>
    </tr>
  `;
}

// 8. View: My Courses
function renderCourses() {
  const grid = document.getElementById('allCoursesGrid');
  const countMeta = document.getElementById('coursesCountMeta');
  if (countMeta) countMeta.textContent = `${rawCourses.length} ACTIVE COURSES`;

  if (grid) {
    if (rawCourses.length === 0) {
      grid.innerHTML = `<div class="empty-state">No courses found. Click 'SYNC VOLP' to load your courses.</div>`;
      return;
    }

    grid.innerHTML = rawCourses.map(course => {
      const isBlocked = isCourseBlocked(course.crsid, course.course_name);
      const courseAssignments = rawAssignments.filter(a => 
        (a.course_name && a.course_name === course.course_name) ||
        (a.colid && course.colid && String(a.colid) === String(course.colid))
      );
      const pendingCount = courseAssignments.filter(a => !a.is_submitted).length;

      return `
        <div class="project-card ${isBlocked ? 'blocked' : ''}">
          <div class="project-card-header">
            <div class="project-code-tag">${escapeHtml(course.crsid || 'CRS')}</div>
            <div>
              ${isBlocked 
                ? '<span class="badge badge--danger">NOTIFICATIONS MUTED</span>' 
                : '<span class="badge badge--submitted">NOTIFICATIONS ACTIVE</span>'
              }
            </div>
          </div>
          
          <div class="project-card-title">${escapeHtml(course.course_name || 'Untitled Course')}</div>
          
          <div class="project-card-meta">
            <span>SEMESTER: ${escapeHtml(course.semester || 'Sem 5')}</span>
            <span>·</span>
            <span>YEAR: ${escapeHtml(course.academic_year || '2025-26')}</span>
          </div>

          <div style="margin: 16px 0; font-size: 12px; color: var(--text-secondary);">
            Pending Assignments: <strong style="color: var(--text);">${pendingCount}</strong>
          </div>
          
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
            ${isBlocked 
              ? `<button class="btn btn--ghost btn--sm" onclick="unblockCourse('${escapeHtml(course.crsid || course.course_name)}')">UNMUTE COURSE</button>`
              : `<button class="btn btn--danger btn--sm" onclick="blockCourse('${escapeHtml(course.crsid || course.course_name)}', '${escapeHtml(course.course_name)}')">MUTE COURSE</button>`
            }
          </div>
        </div>
      `;
    }).join('');
  }
}

// 9. View: Block Manager
function renderBlocked() {
  const cBody = document.getElementById('blockedCoursesTableBody');
  const aBody = document.getElementById('blockedAssignmentsTableBody');

  if (cBody) {
    if (blockedCoursesList.length === 0) {
      cBody.innerHTML = `<tr><td colspan="4" class="empty-state">No courses currently blocked.</td></tr>`;
    } else {
      cBody.innerHTML = blockedCoursesList.map(item => `
        <tr>
          <td><span class="badge badge--code">${escapeHtml(item.course_id || item.course_name || '--')}</span></td>
          <td><strong>${escapeHtml(item.course_name || '--')}</strong></td>
          <td><span class="mono-text">${escapeHtml(item.blocked_at || item.created_at || 'Active')}</span></td>
          <td style="text-align: right;">
            <button class="btn btn--ghost btn--sm" onclick="unblockCourse('${escapeHtml(item.course_id || item.course_name)}')">UNBLOCK</button>
          </td>
        </tr>
      `).join('');
    }
  }

  if (aBody) {
    if (blockedAssignmentsList.length === 0) {
      aBody.innerHTML = `<tr><td colspan="5" class="empty-state">No individual assignments blocked.</td></tr>`;
    } else {
      aBody.innerHTML = blockedAssignmentsList.map(item => `
        <tr>
          <td><span class="badge badge--code">#${escapeHtml(String(item.assignment_id || '--'))}</span></td>
          <td>${escapeHtml(item.course_name || '--')}</td>
          <td><strong>${escapeHtml(item.assignment_title || `Assignment #${item.assignment_id}`)}</strong></td>
          <td><span class="mono-text">${escapeHtml(item.blocked_at || item.created_at || 'Active')}</span></td>
          <td style="text-align: right;">
            <button class="btn btn--ghost btn--sm" onclick="unblockAssignment('${item.assignment_id}')">UNBLOCK</button>
          </td>
        </tr>
      `).join('');
    }
  }
}

// 10. Block & Unblock API Actions
function isCourseBlocked(courseId, courseName) {
  return blockedCoursesList.some(b => 
    (courseId && b.course_id === courseId) || 
    (courseName && b.course_name === courseName) ||
    (courseName && b.course_id === courseName)
  );
}

function isAssignmentBlocked(assignId) {
  return blockedAssignmentsList.some(b => String(b.assignment_id) === String(assignId));
}

async function blockCourse(courseId, courseName) {
  openModal('MUTE COURSE NOTIFICATIONS', `Are you sure you want to mute all 8 PM reminders for course: "${courseName}"?`, async () => {
    try {
      const res = await fetch('/api/blocked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUser.email, course_id: courseId, course_name: courseName })
      });
      if (res.ok) {
        showToast(`Muted course: ${courseName}`, 'success');
        await loadBlockedData();
        renderAllViews();
      } else {
        showToast('Failed to mute course', 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

async function unblockCourse(courseId) {
  try {
    const res = await fetch('/api/blocked', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, course_id: courseId })
    });
    if (res.ok) {
      showToast(`Unmuted course`, 'success');
      await loadBlockedData();
      renderAllViews();
    } else {
      showToast('Failed to unmute course', 'error');
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function blockAssignment(assignmentId, assignmentTitle, courseName) {
  openModal('MUTE ASSIGNMENT REMINDER', `Are you sure you want to mute reminders for "${assignmentTitle}"?`, async () => {
    try {
      const res = await fetch('/api/blocked-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: currentUser.email, 
          assignment_id: assignmentId, 
          assignment_title: assignmentTitle,
          course_name: courseName 
        })
      });
      if (res.ok) {
        showToast(`Muted assignment #${assignmentId}`, 'success');
        await loadBlockedData();
        renderAllViews();
      } else {
        showToast('Failed to mute assignment', 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

async function unblockAssignment(assignmentId) {
  try {
    const res = await fetch('/api/blocked-assignments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, assignment_id: assignmentId })
    });
    if (res.ok) {
      showToast(`Unmuted assignment #${assignmentId}`, 'success');
      await loadBlockedData();
      renderAllViews();
    } else {
      showToast('Failed to unmute assignment', 'error');
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// 11. 8 PM Reminder Trigger
async function triggerReminder() {
  const btn = document.getElementById('reminderBtn');
  if (btn) btn.disabled = true;
  showToast('Dispatching 8 PM daily assignment summary...', 'info');

  try {
    const res = await fetch('/api/assignments/trigger-8pm-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, token: currentUser.token })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Digest sent! ${data.message || 'Check your inbox.'}`, 'success');
      addReminderTimelineLog('MANUAL 8 PM DISPATCH TRIGGERED', 'Email digest successfully dispatched to ' + currentUser.email, 'SENT');
    } else {
      showToast(data.message || 'Reminder dispatch returned an error', 'error');
    }
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function addReminderTimelineLog(title, desc, badge) {
  const list = document.getElementById('remindersTimelineList');
  if (list) {
    const now = new Date().toLocaleTimeString();
    const item = document.createElement('div');
    item.className = 'note-card';
    item.innerHTML = `
      <div class="note-card-header">
        <span>${escapeHtml(title)} — TODAY @ ${now}</span>
        <span class="badge badge--submitted">${escapeHtml(badge)}</span>
      </div>
      <div class="note-card-body">${escapeHtml(desc)}</div>
      <div class="note-card-footer">RECIPIENT: ${escapeHtml(currentUser.email)} | STATUS: PROCESSED</div>
    `;
    list.prepend(item);
  }
}

// 12. Modal Helpers
function openModal(title, body, onConfirm) {
  const overlay = document.getElementById('modalOverlay');
  const tEl = document.getElementById('modalTitle');
  const bEl = document.getElementById('modalBody');
  if (tEl) tEl.textContent = title;
  if (bEl) bEl.textContent = body;
  pendingModalAction = onConfirm;
  if (overlay) overlay.classList.add('active');
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.classList.remove('active');
  pendingModalAction = null;
}

function confirmModal() {
  if (typeof pendingModalAction === 'function') {
    pendingModalAction();
  }
  closeModal();
}

// 13. Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:14px;line-height:1;">✕</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// 14. Utilities
function stripHtml(html) {
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
