/**
 * VOLP Reminder — Assignment Console App Client
 * Pure Real-Data Client directly wired to Express & VOLP APIs
 */

// User Session from real login
let currentUser = null;

// Real Backend Data Collections
let courses = [];
let assignments = [];
let blockedCourses = [];
let blockedAssignments = [];

// UI Filter and View State
let currentTab = 'dashboard';
let currentTaskView = 'kanban'; // 'kanban' | 'table'
let currentStatusFilter = 'all';
let currentTypeFilter = 'all';
let currentSearchQuery = '';
let pendingModalAction = null;
let lastSyncSource = '';

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  checkAuthAndInit();
});

// 1. Theme Management
function initTheme() {
  const saved = localStorage.getItem('volp-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('volp-theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = theme === 'dark' ? '☼' : '◐';
}

// 2. Authentication Check
function checkAuthAndInit() {
  const sessionStr = localStorage.getItem('volp_user') || sessionStorage.getItem('volp_user');
  if (!sessionStr) {
    window.location.href = 'login.html';
    return;
  }

  try {
    currentUser = JSON.parse(sessionStr);
    if (!currentUser || !currentUser.email || !currentUser.token) {
      throw new Error('Invalid session payload');
    }
  } catch (e) {
    localStorage.removeItem('volp_user');
    sessionStorage.removeItem('volp_user');
    window.location.href = 'login.html';
    return;
  }

  // Update Profile header / sidebar with real user email
  const emailPrefix = currentUser.email.split('@')[0];
  const initials = emailPrefix.substring(0, 2).toUpperCase();

  const sideName = document.getElementById('sidebarUserName');
  const sideAvatar = document.getElementById('sidebarAvatar');
  const settingsEmail = document.getElementById('settingsEmail');
  const settingsUsername = document.getElementById('settingsUsername');
  const settingsLargeAvatar = document.getElementById('settingsLargeAvatar');
  const settingsProfileTitle = document.getElementById('settingsProfileTitle');

  if (sideName) sideName.textContent = currentUser.email;
  if (sideAvatar) sideAvatar.textContent = initials;
  if (settingsEmail) settingsEmail.value = currentUser.email;
  if (settingsUsername) settingsUsername.value = emailPrefix;
  if (settingsLargeAvatar) settingsLargeAvatar.textContent = initials;
  if (settingsProfileTitle) settingsProfileTitle.textContent = currentUser.email;

  // Load Real Data from Backend
  fetchRealBackendData(false);
}

function handleSignOut() {
  localStorage.removeItem('volp_user');
  sessionStorage.removeItem('volp_user');
  window.location.href = 'login.html';
}

// 3. API Requests (Direct Real Backend Calls)
async function fetchRealBackendData(forceRefresh = false) {
  setGlobalLoading(true);

  try {
    // 1. POST /api/assignments/my-courses
    const courseRes = await fetch('/api/assignments/my-courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: currentUser.email,
        token: currentUser.token,
        refresh: forceRefresh
      })
    });

    if (courseRes.status === 401) {
      handleSignOut();
      return;
    }

    if (!courseRes.ok) {
      const err = await courseRes.json().catch(() => ({ error: 'Failed to fetch courses' }));
      throw new Error(err.error || 'Courses error');
    }

    const courseData = await courseRes.json();
    courses = courseData.courses || [];
    lastSyncSource = courseData.source || 'MYSQL_DATABASE';

    // 2. POST /api/assignments/my-assignments
    const assignRes = await fetch('/api/assignments/my-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: currentUser.email,
        token: currentUser.token,
        refresh: forceRefresh
      })
    });

    if (!assignRes.ok) {
      const err = await assignRes.json().catch(() => ({ error: 'Failed to fetch assignments' }));
      throw new Error(err.error || 'Assignments error');
    }

    const assignData = await assignRes.json();
    assignments = assignData.assignments || [];

    // 3. GET /api/blocked?email=...
    const bCourseRes = await fetch(`/api/blocked?email=${encodeURIComponent(currentUser.email)}`);
    if (bCourseRes.ok) {
      const bCourseData = await bCourseRes.json();
      blockedCourses = bCourseData.blocked || [];
    }

    // 4. GET /api/blocked-assignments?email=...
    const bAssignRes = await fetch(`/api/blocked-assignments?email=${encodeURIComponent(currentUser.email)}`);
    if (bAssignRes.ok) {
      const bAssignData = await bAssignRes.json();
      blockedAssignments = bAssignData.blocked || [];
    }

    // Update UI
    renderAllViews();

    const syncLabel = document.getElementById('lastSyncStatusLabel');
    if (syncLabel) {
      const timeStr = new Date().toLocaleTimeString();
      syncLabel.textContent = `SOURCE: ${lastSyncSource} (${timeStr})`;
    }

    if (forceRefresh) {
      showToast('Live VOLP Sync completed successfully', 'success');
    }

  } catch (error) {
    console.error('API Sync error:', error);
    showToast(`Data fetch failed: ${error.message}`, 'error');
  } finally {
    setGlobalLoading(false);
  }
}

function setGlobalLoading(isLoading) {
  const syncBtn = document.getElementById('syncBtn');
  const syncBtnLabel = document.getElementById('syncBtnLabel');
  if (syncBtn && syncBtnLabel) {
    syncBtn.disabled = isLoading;
    syncBtnLabel.textContent = isLoading ? 'SYNCING...' : 'SYNC VOLP';
  }
}

// 4. Page Navigation
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
    tasks: 'PROJECT: ASSIGNMENTS & TASKS',
    courses: 'ENROLLED COURSES',
    blocked: 'BLOCK MANAGER',
    reminders: 'REMINDERS & TIMELINE LOG',
    settings: 'SETTINGS - PROFILE'
  };

  const titleEl = document.getElementById('headerTitle');
  if (titleEl) titleEl.textContent = titles[pageId] || pageId.toUpperCase();

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

// 5. Render All Views with Real Backend Data
function renderAllViews() {
  renderDashboardStats();
  renderDashboardCoursesGrid();
  renderDashboardRecentTable();
  renderTasksView();
  renderCoursesView();
  renderBlockManagerView();
}

// Metrics calculated strictly from real data
function renderDashboardStats() {
  const total = assignments.length;
  const pending = assignments.filter(a => !Boolean(a.is_submitted)).length;
  const submitted = assignments.filter(a => Boolean(a.is_submitted)).length;
  const blockedTotal = blockedCourses.length + blockedAssignments.length;

  document.getElementById('statTotalAssignments').textContent = total;
  document.getElementById('statPendingAssignments').textContent = pending;
  document.getElementById('statSubmittedAssignments').textContent = submitted;
  document.getElementById('statBlockedAssignments').textContent = blockedTotal;
}

// Dashboard 3-Column Course Grid
function renderDashboardCoursesGrid() {
  const container = document.getElementById('dashboardProjectsGrid');
  if (!container) return;

  container.innerHTML = '';

  if (courses.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 32px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: var(--radius-md);">
        NO ENROLLED COURSES FOUND IN DATABASE. CLICK "SYNC VOLP" TO FETCH FROM VOLP PORTAL.
      </div>
    `;
    return;
  }

  courses.forEach(course => {
    const courseAssignments = assignments.filter(a => Number(a.colid) === Number(course.colid));
    const pendingCount = courseAssignments.filter(a => !Boolean(a.is_submitted)).length;
    const isBlocked = Boolean(course.is_blocked);
    const adminTag = course.colid % 2 === 0 ? '#C8A84A' : '#6A8FC8';
    const tagClass = adminTag === '#C8A84A' ? 'code-tag--amber' : 'code-tag--cyan';

    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-title">${escapeHtml(course.course_name)}</div>
        <ul class="project-card-meta-list">
          <li><span class="meta-key">COLID:</span> #${course.colid} ${course.crsid ? `| CRSID #${course.crsid}` : ''}</li>
          <li><span class="meta-key">Semester:</span> ${escapeHtml(course.semester || 'N/A')}</li>
          <li><span class="meta-key">Academic Year:</span> ${escapeHtml(course.academic_year || 'N/A')}</li>
          <li><span class="meta-key">Status:</span> ${isBlocked ? '<span style="color:var(--danger)">BLOCKED / MUTED</span>' : '<span style="color:var(--success)">ACTIVE</span>'}</li>
          <li><span class="meta-key">Assignments:</span> ${courseAssignments.length} total (${pendingCount} pending)</li>
        </ul>
      </div>
      <div class="project-card-footer">
        <span class="code-tag ${tagClass}">Admin ${adminTag}</span>
        <button class="btn btn--sm ${isBlocked ? 'btn--success' : 'btn--ghost'}" onclick="toggleCourseBlock(${course.colid}, '${escapeHtml(course.course_name)}', ${isBlocked})">
          ${isBlocked ? 'UNBLOCK' : 'BLOCK'}
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Dashboard Urgent Deadlines Table
function renderDashboardRecentTable() {
  const tbody = document.getElementById('dashboardRecentTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const pending = assignments.filter(a => !Boolean(a.is_submitted)).slice(0, 5);

  if (pending.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; color:var(--muted); padding:24px;">
          NO PENDING ASSIGNMENTS DETECTED
        </td>
      </tr>
    `;
    return;
  }

  pending.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="type-badge ${item.assignment_type === 'handson' ? 'type-badge--handson' : 'type-badge--subjective'}">${escapeHtml(item.assignment_type || 'TASK').toUpperCase()}</span></td>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(item.course_name)}</span></td>
      <td>
        <div class="assignment-title">${item.title_html || 'Assignment #' + item.assignment_id}</div>
        <div class="assignment-sub">${escapeHtml(item.unit_name || 'Unit ' + (item.colid || ''))}</div>
      </td>
      <td><span class="meta-text" style="color:var(--warning);">${escapeHtml(item.due_date_raw || 'No Due Date')}</span></td>
      <td><span class="badge badge--pending">PENDING</span></td>
      <td style="text-align:right">
        <button class="btn btn--ghost btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${item.assignment_type}', '${escapeHtml(item.course_name)}', '${escapeHtml(item.title_html || '')}', false)">
          BLOCK
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 6. Tasks View & Filter Logic
function switchTaskView(mode) {
  currentTaskView = mode;
  document.getElementById('viewToggleKanban').classList.toggle('active', mode === 'kanban');
  document.getElementById('viewToggleTable').classList.toggle('active', mode === 'table');
  
  document.getElementById('tasksKanbanView').style.display = mode === 'kanban' ? 'grid' : 'none';
  document.getElementById('tasksTableView').style.display = mode === 'table' ? 'block' : 'none';
  renderTasksView();
}

function setTasksSubTab(tab) {
  document.querySelectorAll('.sub-nav-tab').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  showToast(`Tab: ${tab.toUpperCase()}`, 'info');
}

function filterTasks() {
  currentSearchQuery = document.getElementById('taskSearchInput').value.trim().toLowerCase();
  renderTasksView();
}

function setStatusFilter(filter, el) {
  currentStatusFilter = filter;
  document.querySelectorAll('#statusFilterGroup .filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderTasksView();
}

function setTypeFilter(filter, el) {
  currentTypeFilter = filter;
  document.querySelectorAll('#typeFilterGroup .filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderTasksView();
}

function getFilteredAssignments() {
  return assignments.filter(item => {
    // Search
    if (currentSearchQuery) {
      const title = (item.title_html || '').toLowerCase();
      const course = (item.course_name || '').toLowerCase();
      const unit = (item.unit_name || '').toLowerCase();
      if (!title.includes(currentSearchQuery) && !course.includes(currentSearchQuery) && !unit.includes(currentSearchQuery)) {
        return false;
      }
    }

    // Type
    if (currentTypeFilter !== 'all' && item.assignment_type !== currentTypeFilter) {
      return false;
    }

    // Status
    if (currentStatusFilter === 'pending' && Boolean(item.is_submitted)) return false;
    if (currentStatusFilter === 'submitted' && !Boolean(item.is_submitted)) return false;
    if (currentStatusFilter === 'overdue') {
      const due = (item.due_date_raw || '').toLowerCase();
      if (!due.includes('overdue') && !due.includes('yesterday')) return false;
    }

    return true;
  });
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
    const isDone = Boolean(item.is_submitted);
    const due = (item.due_date_raw || '').toLowerCase();
    const isOverdue = due.includes('overdue') || due.includes('yesterday');

    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.innerHTML = `
      <div class="kanban-card-top">
        <div class="kanban-card-title">${item.title_html || 'Assignment #' + item.assignment_id}</div>
        <span class="kanban-card-course">COLID #${item.colid || 'N/A'}</span>
      </div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-secondary);margin-top:4px;">
        ${escapeHtml(item.course_name)}
      </div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:2px;">
        ${escapeHtml(item.unit_name || 'Unit Item')} · Due: ${escapeHtml(item.due_date_raw || 'Pending')}
      </div>
      <div class="kanban-card-footer">
        <span class="badge ${isDone ? 'badge--submitted' : 'badge--pending'}">${isDone ? 'SUBMITTED' : 'PENDING'}</span>
        <button class="btn btn--ghost btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${item.assignment_type}', '${escapeHtml(item.course_name)}', '${escapeHtml(item.title_html || '')}', false)">
          BLOCK
        </button>
      </div>
    `;

    if (isDone) {
      doneCol.appendChild(card);
    } else if (isOverdue) {
      todoCol.appendChild(card);
    } else {
      progressCol.appendChild(card);
    }
  });

  if (todoCol.children.length === 0) todoCol.innerHTML = '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;">No overdue tasks</div>';
  if (progressCol.children.length === 0) progressCol.innerHTML = '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;">No pending tasks</div>';
  if (doneCol.children.length === 0) doneCol.innerHTML = '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;">No submitted tasks</div>';
}

function renderTasksTable(items) {
  const tbody = document.getElementById('tasksFullTableBody');
  tbody.innerHTML = '';

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px;">NO ASSIGNMENTS FOUND</td></tr>`;
    return;
  }

  items.forEach(item => {
    const isDone = Boolean(item.is_submitted);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="type-badge ${item.assignment_type === 'handson' ? 'type-badge--handson' : 'type-badge--subjective'}">${escapeHtml(item.assignment_type || 'TASK').toUpperCase()}</span></td>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(item.course_name)}</span></td>
      <td>
        <div class="assignment-title">${item.title_html || 'Assignment #' + item.assignment_id}</div>
        <div class="assignment-sub">${escapeHtml(item.unit_name || 'Unit')}</div>
      </td>
      <td><span class="meta-text">${escapeHtml(item.due_date_raw || 'No date')}</span></td>
      <td><span class="badge ${isDone ? 'badge--submitted' : 'badge--pending'}">${isDone ? 'SUBMITTED' : 'PENDING'}</span></td>
      <td style="text-align:right">
        <button class="btn btn--ghost btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${item.assignment_type}', '${escapeHtml(item.course_name)}', '${escapeHtml(item.title_html || '')}', false)">
          BLOCK
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 7. Enrolled Courses View
function renderCoursesView() {
  const grid = document.getElementById('allCoursesGrid');
  if (!grid) return;

  grid.innerHTML = '';
  document.getElementById('coursesCountMeta').textContent = `${courses.length} ENROLLED COURSES (VOLP)`;

  if (courses.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 32px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: var(--radius-md);">
        NO COURSES FOUND. CLICK "SYNC VOLP" AT THE TOP RIGHT TO SYNC FROM VOLP.
      </div>
    `;
    return;
  }

  courses.forEach(course => {
    const isBlocked = Boolean(course.is_blocked);
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-title">${escapeHtml(course.course_name)}</div>
        <ul class="project-card-meta-list">
          <li><span class="meta-key">COLID:</span> #${course.colid}</li>
          <li><span class="meta-key">CRSID:</span> ${course.crsid ? '#' + course.crsid : 'N/A'}</li>
          <li><span class="meta-key">Semester:</span> ${escapeHtml(course.semester || 'N/A')}</li>
          <li><span class="meta-key">Academic Year:</span> ${escapeHtml(course.academic_year || 'N/A')}</li>
          <li><span class="meta-key">Status:</span> ${isBlocked ? '<span style="color:var(--danger)">BLOCKED (NO REMINDERS)</span>' : '<span style="color:var(--success)">ACTIVE</span>'}</li>
        </ul>
      </div>
      <div class="project-card-footer">
        <span class="code-tag code-tag--lime">COLID #${course.colid}</span>
        <button class="btn btn--sm ${isBlocked ? 'btn--success' : 'btn--danger'}" onclick="toggleCourseBlock(${course.colid}, '${escapeHtml(course.course_name)}', ${isBlocked})">
          ${isBlocked ? 'RESTORE COURSE' : 'BLOCK COURSE'}
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// 8. Block Manager View (Live MySQL Block Tables)
function renderBlockManagerView() {
  // Blocked Courses
  const cTbody = document.getElementById('blockedCoursesTableBody');
  cTbody.innerHTML = '';

  if (blockedCourses.length === 0) {
    cTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px;">NO BLOCKED COURSES</td></tr>`;
  } else {
    blockedCourses.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">COLID #${c.colid}</span></td>
        <td><strong>${escapeHtml(c.course_name)}</strong></td>
        <td><span class="meta-text">${c.blocked_at ? new Date(c.blocked_at).toLocaleString() : 'ACTIVE BLOCK'}</span></td>
        <td style="text-align:right">
          <button class="btn btn--success btn--sm" onclick="toggleCourseBlock(${c.colid}, '${escapeHtml(c.course_name)}', true)">RESTORE</button>
        </td>
      `;
      cTbody.appendChild(tr);
    });
  }

  // Blocked Assignments
  const aTbody = document.getElementById('blockedAssignmentsTableBody');
  aTbody.innerHTML = '';

  if (blockedAssignments.length === 0) {
    aTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:18px;">NO BLOCKED ASSIGNMENTS</td></tr>`;
  } else {
    blockedAssignments.forEach(a => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="code-tag code-tag--cyan">#${a.assignment_id} (${escapeHtml(a.assignment_type)})</span></td>
        <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${escapeHtml(a.course_name)}</span></td>
        <td>${a.title_hint || 'Assignment #' + a.assignment_id}</td>
        <td><span class="meta-text">${a.blocked_at ? new Date(a.blocked_at).toLocaleString() : 'RECENT'}</span></td>
        <td style="text-align:right">
          <button class="btn btn--success btn--sm" onclick="toggleAssignmentBlock(${a.assignment_id}, '${a.assignment_type}', '${escapeHtml(a.course_name)}', '${escapeHtml(a.title_hint || '')}', true)">RESTORE</button>
        </td>
      `;
      aTbody.appendChild(tr);
    });
  }
}

// 9. Real Backend Actions
async function syncNow() {
  await fetchRealBackendData(true);
}

async function triggerReminder() {
  const btn = document.getElementById('reminderBtn');
  if (btn) btn.disabled = true;

  showToast('Triggering 8 PM Email Reminder via Backend Cron Service...', 'info');

  try {
    const res = await fetch('/api/assignments/trigger-8pm-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, token: currentUser.token })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message || '8 PM Reminder triggered successfully', 'success');
    } else {
      throw new Error(data.error || 'Trigger failed');
    }
  } catch (err) {
    showToast(`Reminder failed: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Block / Unblock Course API
async function toggleCourseBlock(colid, courseName, currentlyBlocked) {
  const action = currentlyBlocked ? 'unblock' : 'block';

  openModal(
    `${action.toUpperCase()} COURSE`,
    `Are you sure you want to ${action} "${courseName}"? ${currentlyBlocked ? 'It will reappear in daily reminders.' : 'All assignments for this course will be omitted from 8 PM email digests.'}`,
    async () => {
      try {
        const res = await fetch('/api/blocked', {
          method: currentlyBlocked ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: currentUser.email,
            colid: Number(colid),
            course_name: courseName
          })
        });

        const data = await res.json();
        if (res.ok) {
          showToast(data.message || `Course ${action}ed successfully`, 'success');
          await fetchRealBackendData(false);
        } else {
          throw new Error(data.error || `Failed to ${action} course`);
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}

// Block / Unblock Assignment API
async function toggleAssignmentBlock(assignmentId, assignmentType, courseName, titleHint, currentlyBlocked) {
  const action = currentlyBlocked ? 'unblock' : 'block';

  openModal(
    `${action.toUpperCase()} ASSIGNMENT`,
    `Are you sure you want to ${action} "${titleHint || 'Assignment #' + assignmentId}"?`,
    async () => {
      try {
        const res = await fetch('/api/blocked-assignments', {
          method: currentlyBlocked ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: currentUser.email,
            assignment_id: Number(assignmentId),
            assignment_type: assignmentType,
            course_name: courseName,
            title_hint: titleHint
          })
        });

        const data = await res.json();
        if (res.ok) {
          showToast(data.message || `Assignment ${action}ed successfully`, 'success');
          await fetchRealBackendData(false);
        } else {
          throw new Error(data.error || `Failed to ${action} assignment`);
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}

// Settings
function setSettingsTab(tabName, el) {
  document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  showToast(`Settings Tab: ${tabName.toUpperCase()}`, 'info');
}

function handleSaveSettings(e) {
  e.preventDefault();
  showToast('Settings saved successfully', 'success');
}

// Modal Utilities
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

// Toast System
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
