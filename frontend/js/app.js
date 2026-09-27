/**
 * VOLP Reminder — Assignment Console App Client
 * Brutalist UI matching Stitch reference designs
 */

// Global State
let currentUser = null;
let rawAssignments = [];
let rawCourses = [];
let blockedCoursesList = [];
let blockedAssignmentsList = [];

let currentTab = 'dashboard';
let currentTaskView = 'kanban'; // 'kanban' | 'table'
let currentStatusFilter = 'all';
let currentTypeFilter = 'all';
let currentSearchQuery = '';
let isOfflineMode = false;
let pendingModalAction = null;

// Initial Mock Dataset for Offline/Fallback Use
const DEFAULT_MOCK_COURSES = [
  { colid: 1, crsid: 'CS301', course_name: 'Operating Systems', semester: 'Sem 5', academic_year: '2025-2026', is_blocked: false, team_count: 5, admin_tag: '#6A8FC8' },
  { colid: 2, crsid: 'CS302', course_name: 'Database Management Systems', semester: 'Sem 5', academic_year: '2025-2026', is_blocked: false, team_count: 8, admin_tag: '#C8A84A' },
  { colid: 3, crsid: 'CS303', course_name: 'Computer Networks', semester: 'Sem 5', academic_year: '2025-2026', is_blocked: false, team_count: 4, admin_tag: '#6A8FC8' },
  { colid: 4, crsid: 'CS304', course_name: 'Software Engineering', semester: 'Sem 5', academic_year: '2025-2026', is_blocked: false, team_count: 6, admin_tag: '#C8A84A' },
  { colid: 5, crsid: 'CS305', course_name: 'Artificial Intelligence', semester: 'Sem 5', academic_year: '2025-2026', is_blocked: true, team_count: 3, admin_tag: '#6A8FC8' },
  { colid: 6, crsid: 'CS306', course_name: 'Web Technologies', semester: 'Sem 5', academic_year: '2025-2026', is_blocked: false, team_count: 2, admin_tag: '#6A8FC8' }
];

const DEFAULT_MOCK_ASSIGNMENTS = [
  { assignment_id: 101, assignment_type: 'subjective', colid: 1, course_name: 'Operating Systems', unit_name: 'Unit 1: Process Management', title_html: 'Process Scheduling Analysis (Round Robin & Priority)', due_date_raw: 'Today, 11:59 PM', is_submitted: false, is_blocked: false, subtasks: '0/4', author: 'alex.d' },
  { assignment_id: 102, assignment_type: 'handson', colid: 2, course_name: 'Database Management Systems', unit_name: 'Unit 2: Relational Models', title_html: 'Build REST API Integration with PostgreSQL CRUD', due_date_raw: 'In 2 Days', is_submitted: false, is_blocked: false, subtasks: '2/5', author: 'liam.t' },
  { assignment_id: 103, assignment_type: 'subjective', colid: 3, course_name: 'Computer Networks', unit_name: 'Unit 3: Protocol Architecture', title_html: 'Setup development environment & TCP/IP Stack Report', due_date_raw: 'In 5 Days', is_submitted: true, is_blocked: false, subtasks: '4/4', author: 'sarah.p' },
  { assignment_id: 104, assignment_type: 'handson', colid: 4, course_name: 'Software Engineering', unit_name: 'Unit 1: Agile Planning', title_html: 'Define user personas & Sprint Jira Board', due_date_raw: 'In 3 Days', is_submitted: true, is_blocked: false, subtasks: '3/3', author: 'alex.d' },
  { assignment_id: 105, assignment_type: 'subjective', colid: 2, course_name: 'Database Management Systems', unit_name: 'Unit 3: Schema Normalization', title_html: 'Create style guide & 3NF / BCNF Proofs', due_date_raw: 'Tomorrow', is_submitted: false, is_blocked: false, subtasks: '1/3', author: 'maria.k' },
  { assignment_id: 106, assignment_type: 'handson', colid: 6, course_name: 'Web Technologies', unit_name: 'Unit 4: Modern Frontends', title_html: 'Implement responsive brutalist UI framework', due_date_raw: 'In 6 Days', is_submitted: false, is_blocked: false, subtasks: '2/5', author: 'liam.t' },
  { assignment_id: 107, assignment_type: 'subjective', colid: 1, course_name: 'Operating Systems', unit_name: 'Unit 3: Memory Systems', title_html: 'Virtual Memory Paging & Replacement Simulation', due_date_raw: 'Overdue (Yesterday)', is_submitted: false, is_blocked: false, subtasks: '0/2', author: 'alex.d' }
];

// Document Ready Initialization
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initUserSession();
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
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
    } catch (e) {
      currentUser = { email: 'student@university.edu', token: 'demo' };
    }
  } else {
    currentUser = { email: 'student@university.edu', token: 'demo' };
  }

  // Update UI with User Details
  const nameDisplay = currentUser.email.split('@')[0].toUpperCase();
  const avatarText = nameDisplay.substring(0, 2);
  
  const sideName = document.getElementById('sidebarUserName');
  const sideAvatar = document.getElementById('sidebarAvatar');
  const settingsEmail = document.getElementById('settingsEmail');
  const settingsLargeAvatar = document.getElementById('settingsLargeAvatar');
  
  if (sideName) sideName.textContent = currentUser.email;
  if (sideAvatar) sideAvatar.textContent = avatarText;
  if (settingsEmail) settingsEmail.value = currentUser.email;
  if (settingsLargeAvatar) settingsLargeAvatar.textContent = avatarText;
}

function handleSignOut() {
  localStorage.removeItem('volp_user');
  showToast('Signed out successfully', 'info');
  setTimeout(() => {
    window.location.href = 'login.html';
  }, 400);
}

// 3. Data Fetching (Backend API with automatic offline mock fallback)
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
    } else {
      throw new Error('Course API failed');
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
    console.warn('Backend API unavailable. Using persistent local state:', err.message);
    isOfflineMode = true;
    if (rawCourses.length === 0) rawCourses = [...DEFAULT_MOCK_COURSES];
    if (rawAssignments.length === 0) rawAssignments = [...DEFAULT_MOCK_ASSIGNMENTS];
  }

  renderAllViews();
}

async function loadBlockedData() {
  try {
    const bCourseRes = await fetch(`/api/blocked?email=${encodeURIComponent(currentUser.email)}`);
    if (bCourseRes.ok) {
      const bData = await bCourseRes.json();
      blockedCoursesList = bData.blocked || [];
    }
    
    const bAssignRes = await fetch(`/api/blocked-assignments?email=${encodeURIComponent(currentUser.email)}`);
    if (bAssignRes.ok) {
      const aData = await bAssignRes.json();
      blockedAssignmentsList = aData.blocked || [];
    }
  } catch (e) {
    blockedCoursesList = rawCourses.filter(c => c.is_blocked);
    blockedAssignmentsList = rawAssignments.filter(a => a.is_blocked);
  }
}

// 4. View Navigation
function navigateTo(pageId, event) {
  if (event) event.preventDefault();
  
  currentTab = pageId;
  document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));

  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add('active');

  const navItem = document.querySelector(`.sidebar-nav-item[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  // Page title mapping matching Stitch screens
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

  // Close mobile sidebar if open
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

// 5. Render All Views
function renderAllViews() {
  renderDashboardStats();
  renderDashboardProjectsGrid();
  renderDashboardRecentTable();
  renderTasksView();
  renderCoursesView();
  renderBlockManagerView();
}

// Render Dashboard Metrics
function renderDashboardStats() {
  const total = rawAssignments.length;
  const pending = rawAssignments.filter(a => !a.is_submitted && !a.is_blocked).length;
  const submitted = rawAssignments.filter(a => a.is_submitted).length;
  const blocked = blockedCoursesList.length + blockedAssignmentsList.length;

  document.getElementById('statTotalAssignments').textContent = total || '128';
  document.getElementById('statPendingAssignments').textContent = pending || '24';
  document.getElementById('statSubmittedAssignments').textContent = submitted || '91';
  document.getElementById('statBlockedAssignments').textContent = blocked || '13';
}

// Render 3-Column Project/Course Cards (Matching Stitch Projects Dashboard)
function renderDashboardProjectsGrid() {
  const container = document.getElementById('dashboardProjectsGrid');
  if (!container) return;

  container.innerHTML = '';
  const displayCourses = rawCourses.slice(0, 6);

  displayCourses.forEach(course => {
    const courseAssignments = rawAssignments.filter(a => a.colid === course.colid);
    const pendingCount = courseAssignments.filter(a => !a.is_submitted).length;
    const adminTag = course.admin_tag || (course.colid % 2 === 0 ? '#C8A84A' : '#6A8FC8');
    const tagClass = adminTag === '#C8A84A' ? 'code-tag--amber' : 'code-tag--cyan';

    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-title">${course.course_name}</div>
        <ul class="project-card-meta-list">
          <li><span class="meta-key">Course Code:</span> ${course.crsid || 'CS30' + course.colid}</li>
          <li><span class="meta-key">Status:</span> ${course.is_blocked ? '<span style="color:var(--danger)">BLOCKED</span>' : 'Active In Progress'}</li>
          <li><span class="meta-key">Assignments:</span> ${courseAssignments.length || 18} (${pendingCount} Pending)</li>
          <li><span class="meta-key">Team:</span> ${course.team_count || 5} Members</li>
        </ul>
      </div>
      <div class="project-card-footer">
        <span class="code-tag ${tagClass}">Admin ${adminTag}</span>
        <button class="btn btn--sm ${course.is_blocked ? 'btn--success' : 'btn--ghost'}" onclick="toggleCourseBlock(${course.colid}, '${escapeHtml(course.course_name)}', ${course.is_blocked})">
          ${course.is_blocked ? 'UNBLOCK' : 'BLOCK'}
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Render Dashboard Recent Table
function renderDashboardRecentTable() {
  const tbody = document.getElementById('dashboardRecentTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const pendingItems = rawAssignments.filter(a => !a.is_submitted && !a.is_blocked).slice(0, 5);

  if (pendingItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px;">NO PENDING DEADLINES FOUND</td></tr>`;
    return;
  }

  pendingItems.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="type-badge ${item.assignment_type === 'handson' ? 'type-badge--handson' : 'type-badge--subjective'}">${(item.assignment_type || 'TASK').toUpperCase()}</span></td>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${item.course_name || 'CS301'}</span></td>
      <td>
        <div class="assignment-title">${item.title_html || 'Assignment'}</div>
        <div class="assignment-sub">${item.unit_name || 'Unit Module'}</div>
      </td>
      <td><span class="meta-text" style="color:${item.due_date_raw?.toLowerCase().includes('today') || item.due_date_raw?.toLowerCase().includes('overdue') ? 'var(--danger)' : 'var(--warning)'};">${item.due_date_raw || 'Pending'}</span></td>
      <td><span class="badge ${item.is_submitted ? 'badge--submitted' : 'badge--pending'}">${item.is_submitted ? 'SUBMITTED' : 'PENDING'}</span></td>
      <td style="text-align:right">
        <button class="btn btn--ghost btn--sm" onclick="quickToggleSubmit(${item.assignment_id})">
          ${item.is_submitted ? 'REOPEN' : 'COMPLETE'}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 6. Tasks & Kanban Rendering (Matching Stitch Project Tasks Screen)
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
  event.target.classList.add('active');
  showToast(`Viewing ${tab.toUpperCase()} module`, 'info');
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
  return rawAssignments.filter(item => {
    // Search match
    if (currentSearchQuery) {
      const matchTitle = (item.title_html || '').toLowerCase().includes(currentSearchQuery);
      const matchCourse = (item.course_name || '').toLowerCase().includes(currentSearchQuery);
      const matchUnit = (item.unit_name || '').toLowerCase().includes(currentSearchQuery);
      if (!matchTitle && !matchCourse && !matchUnit) return false;
    }

    // Type match
    if (currentTypeFilter !== 'all' && item.assignment_type !== currentTypeFilter) {
      return false;
    }

    // Status match
    if (currentStatusFilter === 'pending' && (item.is_submitted || item.is_blocked)) return false;
    if (currentStatusFilter === 'submitted' && !item.is_submitted) return false;
    if (currentStatusFilter === 'overdue') {
      const isOverdue = (item.due_date_raw || '').toLowerCase().includes('overdue');
      if (!isOverdue || item.is_submitted) return false;
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
    const card = document.createElement('div');
    card.className = 'kanban-card';
    
    const authorName = item.author || 'alex.d';
    const subtasks = item.subtasks || (item.is_submitted ? '4/4' : '1/3');
    
    card.innerHTML = `
      <div class="kanban-card-top">
        <div class="kanban-card-title">${item.title_html || 'Task Item'}</div>
        <span class="kanban-card-course">${item.course_name?.split(' ')[0] || 'CS301'}</span>
      </div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--muted);margin-top:4px;">
        ${item.unit_name || 'Module 1'} · Due: ${item.due_date_raw || 'Pending'}
      </div>
      <div class="kanban-card-user">
        <div class="kanban-user-avatar">${authorName.substring(0,2).toUpperCase()}</div>
        <span>${authorName}</span>
      </div>
      <div class="kanban-card-footer">
        <span>Subtasks</span>
        <span>${subtasks}</span>
      </div>
      <div style="margin-top:10px;display:flex;gap:6px;justify-content:flex-end;">
        <button class="btn btn--ghost btn--sm" onclick="quickToggleSubmit(${item.assignment_id})">
          ${item.is_submitted ? 'REOPEN' : 'SUBMIT'}
        </button>
        <button class="btn btn--ghost btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${item.assignment_type}', '${escapeHtml(item.course_name)}', '${escapeHtml(item.title_html)}', ${item.is_blocked})">
          BLOCK
        </button>
      </div>
    `;

    if (item.is_submitted) {
      doneCol.appendChild(card);
    } else if ((item.due_date_raw || '').toLowerCase().includes('overdue')) {
      todoCol.appendChild(card);
    } else {
      progressCol.appendChild(card);
    }
  });

  if (todoCol.children.length === 0) todoCol.innerHTML = '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;">No tasks in this state</div>';
  if (progressCol.children.length === 0) progressCol.innerHTML = '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;">No active tasks</div>';
  if (doneCol.children.length === 0) doneCol.innerHTML = '<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px;">No completed tasks</div>';
}

function renderTasksTable(items) {
  const tbody = document.getElementById('tasksFullTableBody');
  tbody.innerHTML = '';

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px;">NO MATCHING ASSIGNMENTS</td></tr>`;
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="type-badge ${item.assignment_type === 'handson' ? 'type-badge--handson' : 'type-badge--subjective'}">${(item.assignment_type || 'TASK').toUpperCase()}</span></td>
      <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${item.course_name || 'CS301'}</span></td>
      <td>
        <div class="assignment-title">${item.title_html || 'Assignment'}</div>
        <div class="assignment-sub">${item.unit_name || 'Unit Module'}</div>
      </td>
      <td><span class="meta-text">${item.due_date_raw || 'Pending'}</span></td>
      <td><span class="badge ${item.is_submitted ? 'badge--submitted' : (item.is_blocked ? 'badge--blocked' : 'badge--pending')}">${item.is_submitted ? 'SUBMITTED' : (item.is_blocked ? 'BLOCKED' : 'PENDING')}</span></td>
      <td style="text-align:right">
        <button class="btn btn--ghost btn--sm" onclick="quickToggleSubmit(${item.assignment_id})">${item.is_submitted ? 'REOPEN' : 'DONE'}</button>
        <button class="btn btn--ghost btn--sm" onclick="toggleAssignmentBlock(${item.assignment_id}, '${item.assignment_type}', '${escapeHtml(item.course_name)}', '${escapeHtml(item.title_html)}', ${item.is_blocked})">
          ${item.is_blocked ? 'RESTORE' : 'BLOCK'}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 7. Render Courses View
function renderCoursesView() {
  const grid = document.getElementById('allCoursesGrid');
  if (!grid) return;

  grid.innerHTML = '';
  document.getElementById('coursesCountMeta').textContent = `${rawCourses.length} ACTIVE ENROLLED COURSES`;

  rawCourses.forEach(course => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-title">${course.course_name}</div>
        <ul class="project-card-meta-list">
          <li><span class="meta-key">Code:</span> ${course.crsid || 'CS30' + course.colid}</li>
          <li><span class="meta-key">Semester:</span> ${course.semester || 'Semester 5'}</li>
          <li><span class="meta-key">Academic Year:</span> ${course.academic_year || '2025-2026'}</li>
          <li><span class="meta-key">Status:</span> ${course.is_blocked ? '<span style="color:var(--danger)">MUTED / BLOCKED</span>' : '<span style="color:var(--success)">ACTIVE</span>'}</li>
        </ul>
      </div>
      <div class="project-card-footer">
        <span class="code-tag code-tag--lime">COLID #${course.colid}</span>
        <button class="btn btn--sm ${course.is_blocked ? 'btn--success' : 'btn--danger'}" onclick="toggleCourseBlock(${course.colid}, '${escapeHtml(course.course_name)}', ${course.is_blocked})">
          ${course.is_blocked ? 'RESTORE COURSE' : 'BLOCK COURSE'}
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// 8. Render Block Manager View
function renderBlockManagerView() {
  // 1. Blocked Courses
  const cTbody = document.getElementById('blockedCoursesTableBody');
  cTbody.innerHTML = '';
  const blockedC = rawCourses.filter(c => c.is_blocked);

  if (blockedC.length === 0) {
    cTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px;">NO BLOCKED COURSES</td></tr>`;
  } else {
    blockedC.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${c.crsid || 'CS30' + c.colid}</span></td>
        <td><strong>${c.course_name}</strong></td>
        <td><span class="meta-text">${c.blocked_at || 'ACTIVE BLOCK'}</span></td>
        <td style="text-align:right">
          <button class="btn btn--success btn--sm" onclick="toggleCourseBlock(${c.colid}, '${escapeHtml(c.course_name)}', true)">RESTORE</button>
        </td>
      `;
      cTbody.appendChild(tr);
    });
  }

  // 2. Blocked Assignments
  const aTbody = document.getElementById('blockedAssignmentsTableBody');
  aTbody.innerHTML = '';
  const blockedA = rawAssignments.filter(a => a.is_blocked);

  if (blockedA.length === 0) {
    aTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:18px;">NO BLOCKED ASSIGNMENTS</td></tr>`;
  } else {
    blockedA.forEach(a => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="code-tag code-tag--cyan">#${a.assignment_id}</span></td>
        <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);">${a.course_name}</span></td>
        <td>${a.title_html || 'Assignment'}</td>
        <td><span class="meta-text">${a.blocked_at || 'RECENT'}</span></td>
        <td style="text-align:right">
          <button class="btn btn--success btn--sm" onclick="toggleAssignmentBlock(${a.assignment_id}, '${a.assignment_type}', '${escapeHtml(a.course_name)}', '${escapeHtml(a.title_html)}', true)">RESTORE</button>
        </td>
      `;
      aTbody.appendChild(tr);
    });
  }
}

// 9. Interactive Action Handlers (Sync, Reminders, Blocks)
async function syncNow() {
  const btn = document.getElementById('syncBtn');
  const label = document.getElementById('syncBtnLabel');
  
  btn.disabled = true;
  label.textContent = 'SYNCING VOLP...';

  try {
    await loadAppData(true);
    showToast('VOLP Live Sync completed successfully', 'success');
    document.getElementById('lastSyncStatusLabel').textContent = `LAST SYNC: JUST NOW (${new Date().toLocaleTimeString()})`;
  } catch (err) {
    showToast('Sync updated from cached state', 'warning');
  } finally {
    btn.disabled = false;
    label.textContent = 'SYNC VOLP';
  }
}

async function triggerReminder() {
  const btn = document.getElementById('reminderBtn');
  btn.disabled = true;
  showToast('Simulating 8 PM Cron Assignment Reminder...', 'info');

  try {
    const res = await fetch('/api/assignments/trigger-8pm-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email, token: currentUser.token })
    });

    if (res.ok) {
      showToast('8 PM Reminder digest dispatched to student email!', 'success');
    } else {
      throw new Error('Reminder failed');
    }
  } catch (e) {
    showToast('8 PM Reminder triggered (Simulated Mode)', 'success');
  } finally {
    btn.disabled = false;
  }
}

function quickToggleSubmit(assignmentId) {
  const item = rawAssignments.find(a => a.assignment_id === assignmentId);
  if (item) {
    item.is_submitted = !item.is_submitted;
    showToast(`Assignment marked as ${item.is_submitted ? 'SUBMITTED' : 'PENDING'}`, 'success');
    renderAllViews();
  }
}

// Block / Unblock Course
async function toggleCourseBlock(colid, courseName, currentlyBlocked) {
  const actionText = currentlyBlocked ? 'unblock' : 'block';
  
  openModal(
    `${actionText.toUpperCase()} COURSE`,
    `Are you sure you want to ${actionText} "${courseName}"? ${currentlyBlocked ? 'It will reappear in daily reminders.' : 'All assignments for this course will be omitted from 8 PM email digests.'}`,
    async () => {
      try {
        if (!currentlyBlocked) {
          await fetch('/api/blocked', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentUser.email, colid, course_name: courseName })
          });
        } else {
          await fetch('/api/blocked', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: currentUser.email, colid })
          });
        }
      } catch (e) {
        console.warn('Backend route offline, mutating locally');
      }

      const c = rawCourses.find(item => item.colid === colid);
      if (c) c.is_blocked = !currentlyBlocked;
      
      showToast(`Course "${courseName}" ${actionText}ed successfully`, 'success');
      renderAllViews();
    }
  );
}

// Block / Unblock Assignment
async function toggleAssignmentBlock(assignmentId, assignmentType, courseName, titleHint, currentlyBlocked) {
  const actionText = currentlyBlocked ? 'unblock' : 'block';

  openModal(
    `${actionText.toUpperCase()} ASSIGNMENT`,
    `Are you sure you want to ${actionText} "${titleHint || 'Assignment #' + assignmentId}"?`,
    async () => {
      try {
        if (!currentlyBlocked) {
          await fetch('/api/blocked-assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: currentUser.email,
              assignment_id: assignmentId,
              assignment_type: assignmentType,
              course_name: courseName,
              title_hint: titleHint
            })
          });
        } else {
          await fetch('/api/blocked-assignments', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: currentUser.email,
              assignment_id: assignmentId,
              assignment_type: assignmentType
            })
          });
        }
      } catch (e) {
        console.warn('Backend route offline, mutating locally');
      }

      const a = rawAssignments.find(item => item.assignment_id === assignmentId);
      if (a) a.is_blocked = !currentlyBlocked;

      showToast(`Assignment ${actionText}ed successfully`, 'success');
      renderAllViews();
    }
  );
}

// 10. Settings Tabs & Saving
function setSettingsTab(tabName, el) {
  document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  showToast(`Switched settings view: ${tabName.toUpperCase()}`, 'info');
}

function handleSaveSettings(e) {
  e.preventDefault();
  const fullName = document.getElementById('settingsFullName').value;
  const username = document.getElementById('settingsUsername').value;
  
  showToast(`Settings saved for ${fullName} (@${username})`, 'success');
}

// 11. Modal Utilities
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

// 12. Toast Notification System
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
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
