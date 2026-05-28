import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './App.css';

const API_BASE = `${window.location.origin}/api`;
const socket = io(window.location.origin, {
  transports: ['websocket', 'polling'],
});

const ROLE_LABELS = {
  employee: 'Mitarbeiter',
  general_manager: 'General Manager',
  owner: 'Owner',
};

const SHIFT_OPTIONS = [
  { value: 'closing', label: 'Schlussdienst' },
];

const AREA_OPTIONS = [
  { value: '', label: 'Immer anzeigen' },
  { value: 'unten', label: 'Nur wenn unten benutzt wurde' },
  { value: 'biergarten', label: 'Nur wenn der Biergarten benutzt wurde' },
];

const SECTION_OPTIONS = [
  { value: '', label: 'Kein Bereich' },
  { value: 'Oben', label: 'Oben' },
  { value: 'Unten', label: 'Unten' },
  { value: 'Biergarten', label: 'Biergarten' },
];

const TEMPLATE_TYPE_OPTIONS = [
  { value: 'standard', label: 'Standardaufgabe' },
  { value: 'occasional', label: 'Gelegentliche Aufgabe' },
];

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Montag' },
  { value: 2, label: 'Dienstag' },
  { value: 3, label: 'Mittwoch' },
  { value: 4, label: 'Donnerstag' },
  { value: 5, label: 'Freitag' },
  { value: 6, label: 'Samstag' },
  { value: 0, label: 'Sonntag' },
];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Jeden Tag' },
  { value: 'selected_days', label: 'Bestimmte Tage' },
  { value: 'interval_weeks', label: 'Alle X Wochen' },
  { value: 'never_direct', label: 'Nie direkt anzeigen' },
];

const ROUTE_ACCESS = {
  '#/mitarbeiter': ['employee'],
  '#/manager': ['general_manager'],
  '#/owner': ['owner'],
  '#/historie': ['general_manager', 'owner'],
  '#/kollegen': ['general_manager', 'owner'],
  '#/vorlagen': ['general_manager'],
  '#/berichte': ['owner'],
};

function getTodayBerlin() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function authHeaders(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

function groupTasks(tasks) {
  return tasks
    .filter((task) => task.included !== false)
    .reduce((accumulator, task) => {
      const section = task.section || 'Allgemein';
      if (!accumulator[section]) {
        accumulator[section] = [];
      }
      accumulator[section].push(task);
      return accumulator;
    }, {});
}

function formatShiftLabel(shiftType) {
  return SHIFT_OPTIONS.find((entry) => entry.value === shiftType)?.label || shiftType;
}

function groupTemplatesBySection(templates) {
  return templates.reduce((accumulator, template) => {
    const section = template.section || 'Allgemein';
    if (!accumulator[section]) {
      accumulator[section] = [];
    }
    accumulator[section].push(template);
    return accumulator;
  }, {});
}

function toggleScheduleDay(days, day) {
  return days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day].sort((a, b) => a - b);
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('checklist-token') || '');
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(Boolean(localStorage.getItem('checklist-token')));
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [selectedDate, setSelectedDate] = useState(getTodayBerlin());
  const [route, setRoute] = useState(window.location.hash || '#/login');
  const [colleagues, setColleagues] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [reports, setReports] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [activeShiftId, setActiveShiftId] = useState('');
  const [selectedRosterIds, setSelectedRosterIds] = useState([]);
  const [activeColleagueName, setActiveColleagueName] = useState('');
  const [newColleagueName, setNewColleagueName] = useState('');
  const [usageForm, setUsageForm] = useState({ untenUsed: null, biergartenUsed: null });
  const [templateForm, setTemplateForm] = useState({
    id: '',
    title: '',
    section: 'Oben',
    shiftType: 'closing',
    templateType: 'standard',
    requiredArea: '',
    scheduleType: 'daily',
    scheduleDays: [],
    recurrenceIntervalWeeks: 2,
  });
  const [dailyTaskForm, setDailyTaskForm] = useState({
    source: 'pool',
    templateId: '',
    title: '',
    section: '',
  });
  const [assignmentForm, setAssignmentForm] = useState({
    date: getTodayBerlin(),
    shiftType: 'closing',
  });
  const [message, setMessage] = useState('');

  const canManageOperations = user?.role === 'general_manager';
  const canManageColleagues = user?.role === 'general_manager' || user?.role === 'owner';

  const loadDashboardData = useCallback(async (role, date) => {
    setLoadingData(true);

    try {
      const requests = [
        axios.get(`${API_BASE}/colleagues`, authHeaders(token)),
        axios.get(`${API_BASE}/shifts?date=${date}`, authHeaders(token)),
      ];

      if (role !== 'employee') {
        requests.push(axios.get(`${API_BASE}/templates`, authHeaders(token)));
      }

      if (role === 'general_manager' || role === 'owner') {
        requests.push(axios.get(`${API_BASE}/reports/overview`, authHeaders(token)));
      }

      const [colleagueResponse, shiftResponse, templateResponse, reportResponse] = await Promise.all(requests);

      setColleagues(colleagueResponse.data);
      setShifts(shiftResponse.data);
      setActiveShiftId((current) => current || shiftResponse.data[0]?._id || '');

      if (templateResponse) {
        setTemplates(templateResponse.data);
      }

      if (reportResponse) {
        setReports(reportResponse.data);
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Daten konnten gerade nicht geladen werden.');
    } finally {
      setLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || '#/login');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!token) {
      setSessionLoading(false);
      return;
    }

    axios
      .get(`${API_BASE}/session`, authHeaders(token))
      .then(({ data }) => {
        setUser(data.user);
        setSelectedDate(data.today);
        setAssignmentForm((current) => ({ ...current, date: data.today }));
        if (!window.location.hash || window.location.hash === '#/login') {
          window.location.hash = defaultRouteForRole(data.user.role);
        }
      })
      .catch(() => {
        logout();
      })
      .finally(() => {
        setSessionLoading(false);
      });
  }, [token]);

  useEffect(() => {
    if (!user || !token) {
      return;
    }

    loadDashboardData(user.role, selectedDate);
  }, [loadDashboardData, selectedDate, token, user]);

  useEffect(() => {
    socket.on('shiftUpdated', (incomingShift) => {
      setShifts((current) => {
        const matchesDate = incomingShift.date === selectedDate;
        if (!matchesDate) {
          return current;
        }

        const exists = current.some((shift) => shift._id === incomingShift._id);
        if (exists) {
          return current
            .map((shift) => (shift._id === incomingShift._id ? incomingShift : shift))
            .sort((a, b) => a.shiftType.localeCompare(b.shiftType));
        }

        return [...current, incomingShift].sort((a, b) => a.shiftType.localeCompare(b.shiftType));
      });
    });

    return () => {
      socket.off('shiftUpdated');
    };
  }, [selectedDate]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const allowedRoles = ROUTE_ACCESS[route];
    if (!allowedRoles) {
      if (route !== '#/login') {
        window.location.hash = defaultRouteForRole(user.role);
      }
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      window.location.hash = defaultRouteForRole(user.role);
    }
  }, [route, user]);

  const activeShift = useMemo(
    () => shifts.find((shift) => shift._id === activeShiftId) || shifts[0] || null,
    [shifts, activeShiftId]
  );

  useEffect(() => {
    setUsageForm({
      untenUsed: activeShift?.areaUsage?.untenUsed ?? null,
      biergartenUsed: activeShift?.areaUsage?.biergartenUsed ?? null,
    });
  }, [activeShift]);

  const groupedActiveTasks = useMemo(
    () => groupTasks(activeShift?.checklist || []),
    [activeShift]
  );

  const usageIsRequired = user?.role === 'employee'
    && activeShift
    && (typeof activeShift.areaUsage?.untenUsed !== 'boolean' || typeof activeShift.areaUsage?.biergartenUsed !== 'boolean');

  function defaultRouteForRole(role) {
    if (role === 'employee') {
      return '#/mitarbeiter';
    }
    if (role === 'general_manager') {
      return '#/manager';
    }
    if (role === 'owner') {
      return '#/owner';
    }
    return '#/login';
  }

  function logout() {
    localStorage.removeItem('checklist-token');
    setToken('');
    setUser(null);
    setColleagues([]);
    setTemplates([]);
    setShifts([]);
    setReports(null);
    setActiveShiftId('');
    setActiveColleagueName('');
    setSelectedRosterIds([]);
    window.location.hash = '#/login';
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError('');

    try {
      const { data } = await axios.post(`${API_BASE}/login`, loginForm);
      localStorage.setItem('checklist-token', data.token);
      setToken(data.token);
      setUser(data.user);
      setSelectedDate(getTodayBerlin());
      window.location.hash = defaultRouteForRole(data.user.role);
    } catch (error) {
      setLoginError(error.response?.data?.error || 'Anmeldung fehlgeschlagen');
    }
  }

  async function createColleague(event) {
    event.preventDefault();
    if (!newColleagueName.trim()) {
      return;
    }

    try {
      const { data } = await axios.post(
        `${API_BASE}/colleagues`,
        { name: newColleagueName },
        authHeaders(token)
      );
      setColleagues((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewColleagueName('');
      setMessage(`${data.name} wurde hinzugefügt.`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Kollege konnte nicht erstellt werden.');
    }
  }

  async function toggleColleagueStatus(colleague) {
    try {
      const { data } = await axios.put(
        `${API_BASE}/colleagues/${colleague._id}`,
        { active: !colleague.active },
        authHeaders(token)
      );
      setColleagues((current) => current.map((item) => (item._id === data._id ? data : item)));
    } catch (error) {
      setMessage(error.response?.data?.error || 'Kollege konnte nicht aktualisiert werden.');
    }
  }

  async function submitTemplate(event) {
    event.preventDefault();
    const scheduleType = templateForm.templateType === 'occasional' ? 'never_direct' : templateForm.scheduleType;
    const scheduleDays = scheduleType === 'never_direct' ? [] : templateForm.scheduleDays;

    const payload = {
      title: templateForm.title,
      section: templateForm.section || 'Kein Bereich',
      shiftType: templateForm.shiftType,
      templateType: templateForm.templateType,
      requiredArea: templateForm.requiredArea,
      scheduleType,
      scheduleDays,
      recurrenceIntervalWeeks: templateForm.recurrenceIntervalWeeks,
      weekdays: scheduleDays,
    };

    try {
      if (templateForm.id) {
        const { data } = await axios.put(
          `${API_BASE}/templates/${templateForm.id}`,
          payload,
          authHeaders(token)
        );
        setTemplates((current) => [...current.filter((template) => template._id !== data._id), data].sort((a, b) => a.title.localeCompare(b.title)));
        setMessage('Aufgabenvorlage aktualisiert.');
      } else {
        const { data } = await axios.post(`${API_BASE}/templates`, payload, authHeaders(token));
        setTemplates((current) => [...current, data].sort((a, b) => a.title.localeCompare(b.title)));
        setMessage('Aufgabenvorlage erstellt.');
      }

        setTemplateForm({
          id: '',
          title: '',
          section: 'Oben',
          shiftType: 'closing',
          templateType: 'standard',
          requiredArea: '',
          scheduleType: 'daily',
          scheduleDays: [],
          recurrenceIntervalWeeks: 2,
        });
    } catch (error) {
      setMessage(error.response?.data?.error || 'Aufgabenvorlage konnte nicht gespeichert werden.');
    }
  }

  async function deleteTemplate(templateId) {
    try {
      await axios.delete(`${API_BASE}/templates/${templateId}`, authHeaders(token));
      setTemplates((current) => current.filter((template) => template._id !== templateId));
      setMessage('Aufgabenvorlage gelöscht.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Aufgabenvorlage konnte nicht gelöscht werden.');
    }
  }

  async function assignShiftChecklist(event) {
    event.preventDefault();

    try {
      const { data } = await axios.post(`${API_BASE}/shifts`, assignmentForm, authHeaders(token));
      setShifts((current) => {
        const filtered = current.filter((shift) => !(shift.date === data.date && shift.shiftType === data.shiftType));
        return [...filtered, data].sort((a, b) => a.shiftType.localeCompare(b.shiftType));
      });
      setActiveShiftId(data._id);
      setMessage(`Checkliste für ${data.date} erstellt.`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Checkliste konnte nicht erstellt werden.');
    }
  }

  async function addTaskToToday(event) {
    event.preventDefault();
    if (!activeShift) {
      return;
    }

    const payload = dailyTaskForm.source === 'pool'
      ? { source: 'pool', templateId: dailyTaskForm.templateId }
        : {
            source: 'one_time',
          title: dailyTaskForm.title,
          section: dailyTaskForm.section || 'Kein Bereich',
        };

    try {
      const { data } = await axios.post(
        `${API_BASE}/shifts/${activeShift._id}/tasks`,
        payload,
        authHeaders(token)
      );
      setShifts((current) => current.map((shift) => (shift._id === data._id ? data : shift)));
      setMessage(dailyTaskForm.source === 'pool' ? 'Aufgabe aus dem Pool für heute hinzugefügt.' : 'Einmalige Aufgabe für heute hinzugefügt.');
      setDailyTaskForm({
        source: 'pool',
        templateId: '',
        title: '',
        section: '',
      });
    } catch (error) {
      setMessage(error.response?.data?.error || 'Tagesaufgabe konnte nicht hinzugefügt werden.');
    }
  }

  async function saveShiftUsage() {
    if (!activeShift) {
      return;
    }

    try {
      const { data } = await axios.put(
        `${API_BASE}/shifts/${activeShift._id}/usage`,
        usageForm,
        authHeaders(token)
      );
      setShifts((current) => current.map((shift) => (shift._id === data._id ? data : shift)));
      setMessage('Bereichsnutzung gespeichert.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Bereichsnutzung konnte nicht gespeichert werden.');
    }
  }

  async function updateRoster(shiftId, colleagueIds) {
    try {
      const { data } = await axios.put(
        `${API_BASE}/shifts/${shiftId}/roster`,
        { colleagueIds },
        authHeaders(token)
      );
      setShifts((current) => current.map((shift) => (shift._id === data._id ? data : shift)));
      setMessage('Schichtbesetzung aktualisiert.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Schichtbesetzung konnte nicht aktualisiert werden.');
    }
  }

  async function openShiftWithRoster() {
    if (!activeShift) {
      return;
    }

    try {
      const { data } = await axios.post(
        `${API_BASE}/shifts/${activeShift._id}/open`,
        { colleagueIds: selectedRosterIds },
        authHeaders(token)
      );
      setShifts((current) => current.map((shift) => (shift._id === data._id ? data : shift)));
      setActiveShiftId(data._id);
      setSelectedRosterIds([]);
      if (!activeColleagueName && data.assignedColleagues[0]) {
        setActiveColleagueName(data.assignedColleagues[0].name);
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Checkliste konnte nicht geöffnet werden.');
    }
  }

  async function toggleTask(shiftId, taskId, completed) {
    try {
      const { data } = await axios.put(
        `${API_BASE}/shifts/${shiftId}/tasks/${taskId}`,
        {
          completed,
          colleagueName: activeColleagueName,
        },
        authHeaders(token)
      );
      setShifts((current) => current.map((shift) => (shift._id === data._id ? data : shift)));
    } catch (error) {
      setMessage(error.response?.data?.error || 'Aufgabe konnte nicht aktualisiert werden.');
    }
  }

  if (sessionLoading) {
    return <div className="shell loading-shell">Checkliste wird geladen...</div>;
  }

  if (!user) {
    return (
      <div className="shell login-shell">
        <div className="login-card">
          <p className="eyebrow">The Dubliner</p>
          <h1>Schlussdienst Checkliste</h1>
          <p className="subtle">
            Gemeinsamer iPad-Zugang für das Team mit Nachverfolgung für Management und Owner.
          </p>
          <form className="stack" onSubmit={handleLogin}>
            <label>
              Benutzername
              <input
                value={loginForm.username}
                onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="Benutzernamen eingeben"
              />
            </label>
            <label>
              Passwort
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Passwort eingeben"
              />
            </label>
            <button type="submit" className="primary-button">Anmelden</button>
          </form>
          {loginError ? <p className="error-text">{loginError}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Checklisten System</p>
          <h1>{ROLE_LABELS[user.role]}</h1>
          <p className="subtle">
            Angemeldet als {user.displayName}. Aktuelles Datum: {selectedDate}
          </p>
        </div>
        <div className="topbar-actions">
          {user.role !== 'employee' ? (
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          ) : null}
          <button className="ghost-button" onClick={logout}>Abmelden</button>
        </div>
      </header>

      <nav className="tabbar">
        {user.role === 'employee' ? <a href="#/mitarbeiter">Meine Checkliste</a> : null}
        {user.role === 'general_manager' ? <a href="#/manager">Tagesbetrieb</a> : null}
        {user.role === 'general_manager' ? <a href="#/vorlagen">Standardaufgaben</a> : null}
        {(user.role === 'general_manager' || user.role === 'owner') ? <a href="#/historie">Historie</a> : null}
        {(user.role === 'general_manager' || user.role === 'owner') ? <a href="#/kollegen">Kollegen</a> : null}
        {user.role === 'owner' ? <a href="#/berichte">Berichte</a> : null}
        {user.role === 'owner' ? <a href="#/owner">Übersicht</a> : null}
      </nav>

      {message ? <div className="message-banner">{message}</div> : null}
      {loadingData ? <p className="subtle">Daten werden aktualisiert...</p> : null}

      {route === '#/mitarbeiter' ? (
        <EmployeeView
          shifts={shifts}
          activeShift={activeShift}
          setActiveShiftId={setActiveShiftId}
          groupedActiveTasks={groupedActiveTasks}
          colleagues={colleagues.filter((colleague) => colleague.active)}
          selectedRosterIds={selectedRosterIds}
          setSelectedRosterIds={setSelectedRosterIds}
          activeColleagueName={activeColleagueName}
          setActiveColleagueName={setActiveColleagueName}
          openShiftWithRoster={openShiftWithRoster}
          toggleTask={toggleTask}
          usageForm={usageForm}
          setUsageForm={setUsageForm}
          saveShiftUsage={saveShiftUsage}
          usageIsRequired={usageIsRequired}
        />
      ) : null}

      {route === '#/manager' ? (
        <ManagerView
          shifts={shifts}
          activeShift={activeShift}
          setActiveShiftId={setActiveShiftId}
          groupedActiveTasks={groupedActiveTasks}
          colleagues={colleagues}
          templates={templates}
          assignmentForm={assignmentForm}
          setAssignmentForm={setAssignmentForm}
          assignShiftChecklist={assignShiftChecklist}
          dailyTaskForm={dailyTaskForm}
          setDailyTaskForm={setDailyTaskForm}
          addTaskToToday={addTaskToToday}
          updateRoster={updateRoster}
          activeColleagueName={activeColleagueName}
          setActiveColleagueName={setActiveColleagueName}
          toggleTask={toggleTask}
          usageForm={usageForm}
          setUsageForm={setUsageForm}
          saveShiftUsage={saveShiftUsage}
        />
      ) : null}

      {route === '#/vorlagen' && canManageOperations ? (
        <TemplateView
          templates={templates}
          templateForm={templateForm}
          setTemplateForm={setTemplateForm}
          submitTemplate={submitTemplate}
          deleteTemplate={deleteTemplate}
        />
      ) : null}

      {route === '#/historie' ? <HistoryView shifts={shifts} /> : null}

      {route === '#/kollegen' && canManageColleagues ? (
        <TeamView
          colleagues={colleagues}
          newColleagueName={newColleagueName}
          setNewColleagueName={setNewColleagueName}
          createColleague={createColleague}
          toggleColleagueStatus={toggleColleagueStatus}
        />
      ) : null}

      {route === '#/berichte' && user.role === 'owner' ? <ReportsView reports={reports} /> : null}
      {route === '#/owner' && user.role === 'owner' ? <OwnerView shifts={shifts} reports={reports} /> : null}
    </div>
  );
}

function UsagePrompt({ usageForm, setUsageForm, saveShiftUsage }) {
  return (
    <div className="stack">
      <h3>Bitte kurz angeben, was heute benutzt wurde</h3>
      <p className="subtle">
        Beim Login mit `general` muss zuerst bestätigt werden, ob `unten` und der `Biergarten` benutzt wurden.
      </p>
      <div className="task-section">
        <div className="panel-header">
          <strong>Wurde unten benutzt?</strong>
          <span className="pill">
            {typeof usageForm.untenUsed === 'boolean' ? (usageForm.untenUsed ? 'Ja' : 'Nein') : 'Offen'}
          </span>
        </div>
        <div className="inline-actions">
          <button
            className={`roster-chip ${usageForm.untenUsed === true ? 'selected' : ''}`}
            onClick={() => setUsageForm((current) => ({ ...current, untenUsed: true }))}
          >
            Ja
          </button>
          <button
            className={`roster-chip ${usageForm.untenUsed === false ? 'selected' : ''}`}
            onClick={() => setUsageForm((current) => ({ ...current, untenUsed: false }))}
          >
            Nein
          </button>
        </div>
      </div>
      <div className="task-section">
        <div className="panel-header">
          <strong>Wurde der Biergarten benutzt?</strong>
          <span className="pill">
            {typeof usageForm.biergartenUsed === 'boolean' ? (usageForm.biergartenUsed ? 'Ja' : 'Nein') : 'Offen'}
          </span>
        </div>
        <div className="inline-actions">
          <button
            className={`roster-chip ${usageForm.biergartenUsed === true ? 'selected' : ''}`}
            onClick={() => setUsageForm((current) => ({ ...current, biergartenUsed: true }))}
          >
            Ja
          </button>
          <button
            className={`roster-chip ${usageForm.biergartenUsed === false ? 'selected' : ''}`}
            onClick={() => setUsageForm((current) => ({ ...current, biergartenUsed: false }))}
          >
            Nein
          </button>
        </div>
      </div>
      <button
        className="primary-button"
        onClick={saveShiftUsage}
        disabled={typeof usageForm.untenUsed !== 'boolean' || typeof usageForm.biergartenUsed !== 'boolean'}
      >
        Bereichsnutzung speichern
      </button>
    </div>
  );
}

function EmployeeView({
  shifts,
  activeShift,
  setActiveShiftId,
  groupedActiveTasks,
  colleagues,
  selectedRosterIds,
  setSelectedRosterIds,
  activeColleagueName,
  setActiveColleagueName,
  openShiftWithRoster,
  toggleTask,
  usageForm,
  setUsageForm,
  saveShiftUsage,
  usageIsRequired,
}) {
  if (!shifts.length) {
    return (
      <section className="panel">
        <h2>Für heute ist noch keine Checkliste angelegt.</h2>
        <p className="subtle">Der General Manager muss zuerst die Tagescheckliste erstellen.</p>
      </section>
    );
  }

  return (
    <div className="dashboard-grid">
      <section className="panel compact-list">
        <h2>Heutige Checklisten</h2>
        {shifts.map((shift) => (
          <button
            key={shift._id}
            className={`shift-card ${activeShift?._id === shift._id ? 'selected' : ''}`}
            onClick={() => setActiveShiftId(shift._id)}
          >
            <strong>{formatShiftLabel(shift.shiftType)}</strong>
            <span>{shift.completionRate}% erledigt</span>
            <small>{shift.status}</small>
          </button>
        ))}
      </section>

      <section className="panel wide-panel">
        {activeShift ? (
          <>
            <div className="panel-header">
              <div>
                <h2>{formatShiftLabel(activeShift.shiftType)}</h2>
                <p className="subtle">Die Aufgaben sind nach Bereichen getrennt und nur für heute sichtbar.</p>
              </div>
              <span className="pill">{activeShift.status}</span>
            </div>

            {usageIsRequired ? (
              <UsagePrompt
                usageForm={usageForm}
                setUsageForm={setUsageForm}
                saveShiftUsage={saveShiftUsage}
              />
            ) : !activeShift.assignedColleagues.length ? (
              <div className="stack">
                <h3>Wer hat diese Schicht gearbeitet?</h3>
                <p className="subtle">Die erste Person muss einmal die Kolleginnen und Kollegen dieser Schicht auswählen.</p>
                <div className="roster-grid">
                  {colleagues.map((colleague) => {
                    const selected = selectedRosterIds.includes(colleague._id);
                    return (
                      <button
                        key={colleague._id}
                        className={`roster-chip ${selected ? 'selected' : ''}`}
                        onClick={() =>
                          setSelectedRosterIds((current) =>
                            selected ? current.filter((id) => id !== colleague._id) : [...current, colleague._id]
                          )
                        }
                      >
                        {colleague.name}
                      </button>
                    );
                  })}
                </div>
                <button className="primary-button" onClick={openShiftWithRoster}>Checkliste öffnen</button>
              </div>
            ) : (
              <>
                <label>
                  Ich hake ab als
                  <select
                    value={activeColleagueName}
                    onChange={(event) => setActiveColleagueName(event.target.value)}
                  >
                    <option value="">Name auswählen</option>
                    {activeShift.assignedColleagues.map((colleague) => (
                      <option key={colleague.name} value={colleague.name}>
                        {colleague.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="subtle">
                  Gearbeitet heute: {activeShift.assignedColleagues.map((colleague) => colleague.name).join(', ')}
                </p>
                <ChecklistSections
                  groupedTasks={groupedActiveTasks}
                  onToggle={(task) => toggleTask(activeShift._id, task._id, !task.completed)}
                  disableToggle={!activeColleagueName}
                />
              </>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}

function ManagerView({
  shifts,
  activeShift,
  setActiveShiftId,
  groupedActiveTasks,
  colleagues,
  templates,
  assignmentForm,
  setAssignmentForm,
  assignShiftChecklist,
  dailyTaskForm,
  setDailyTaskForm,
  addTaskToToday,
  updateRoster,
  activeColleagueName,
  setActiveColleagueName,
  toggleTask,
  usageForm,
  setUsageForm,
  saveShiftUsage,
}) {
  const activeRosterIds = activeShift?.assignedColleagues.map((person) => person.colleagueId).filter(Boolean) || [];

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <h2>Tagescheckliste anlegen</h2>
        <form className="stack" onSubmit={assignShiftChecklist}>
          <label>
            Datum
            <input
              type="date"
              value={assignmentForm.date}
              onChange={(event) => setAssignmentForm((current) => ({ ...current, date: event.target.value }))}
            />
          </label>
          <label>
            Checklistenart
            <select
              value={assignmentForm.shiftType}
              onChange={(event) => setAssignmentForm((current) => ({ ...current, shiftType: event.target.value }))}
            >
              {SHIFT_OPTIONS.map((shift) => (
                <option key={shift.value} value={shift.value}>{shift.label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary-button">Checkliste erstellen oder aktualisieren</button>
        </form>

        <h3>Aufgabe für heute hinzufügen</h3>
        <form className="stack" onSubmit={addTaskToToday}>
          <label>
            Typ
            <select
              value={dailyTaskForm.source}
              onChange={(event) =>
                setDailyTaskForm((current) => ({
                  ...current,
                  source: event.target.value,
                }))
              }
              >
                <option value="pool">Aus dem Pool</option>
                <option value="one_time">Einmalige Aufgabe</option>
              </select>
            </label>

          {dailyTaskForm.source === 'pool' ? (
            <label>
              Pool-Aufgabe (nur gelegentliche Aufgaben)
              <select
                value={dailyTaskForm.templateId}
                onChange={(event) =>
                  setDailyTaskForm((current) => ({
                    ...current,
                    templateId: event.target.value,
                  }))
                }
              >
                <option value="">Bitte Aufgabe auswählen</option>
                {templates
                  .filter((template) => template.templateType === 'occasional')
                  .map((template) => (
                    <option key={template._id} value={template._id}>
                      {template.section} - {template.title}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <>
              <p className="subtle">Einmalige Aufgaben gelten nur für die heutige Checkliste und werden nicht zum Pool hinzugefügt.</p>
              <label>
                Titel der einmaligen Aufgabe
                <input
                  value={dailyTaskForm.title}
                  onChange={(event) =>
                    setDailyTaskForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Bereich
                <select
                  value={dailyTaskForm.section}
                  onChange={(event) =>
                    setDailyTaskForm((current) => ({
                      ...current,
                      section: event.target.value,
                    }))
                  }
                >
                  {SECTION_OPTIONS.map((option) => (
                    <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          <button type="submit" className="primary-button" disabled={!activeShift}>
            Für heute hinzufügen
          </button>
        </form>

        <h3>Angelegte Checklisten</h3>
        <div className="compact-list">
          {shifts.map((shift) => (
            <button
              key={shift._id}
              className={`shift-card ${activeShift?._id === shift._id ? 'selected' : ''}`}
              onClick={() => setActiveShiftId(shift._id)}
            >
              <strong>{formatShiftLabel(shift.shiftType)}</strong>
              <span>{shift.visibleTaskCount} aktive Aufgaben</span>
              <small>{shift.completionRate}% erledigt</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel wide-panel">
        {activeShift ? (
          <>
            <div className="panel-header">
              <div>
                <h2>{formatShiftLabel(activeShift.shiftType)} verwalten</h2>
                <p className="subtle">Der General Manager kann Bereiche, Besetzung und Aufgaben für den Tag steuern.</p>
              </div>
              <span className="pill">{activeShift.date}</span>
            </div>

            <UsagePrompt
              usageForm={usageForm}
              setUsageForm={setUsageForm}
              saveShiftUsage={saveShiftUsage}
            />

            <h3>Schichtbesetzung</h3>
            <div className="roster-grid">
              {colleagues.map((colleague) => {
                const selected = activeRosterIds.includes(colleague._id);
                return (
                  <button
                    key={colleague._id}
                    className={`roster-chip ${selected ? 'selected' : ''}`}
                    onClick={() => {
                      const nextIds = selected
                        ? activeRosterIds.filter((id) => id !== colleague._id)
                        : [...activeRosterIds, colleague._id];
                      updateRoster(activeShift._id, nextIds);
                    }}
                  >
                    {colleague.name}
                  </button>
                );
              })}
            </div>

            {activeShift.assignedColleagues.length ? (
              <label>
                Aufgabenansicht als
                <select
                  value={activeColleagueName}
                  onChange={(event) => setActiveColleagueName(event.target.value)}
                >
                  <option value="">Kollegen auswählen</option>
                  {activeShift.assignedColleagues.map((colleague) => (
                    <option key={colleague.name} value={colleague.name}>
                      {colleague.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <ChecklistSections
              groupedTasks={groupedActiveTasks}
              onToggle={(task) => toggleTask(activeShift._id, task._id, !task.completed)}
              disableToggle={!activeShift.assignedColleagues.length}
            />
          </>
        ) : (
          <p className="subtle">Bitte zuerst eine Checkliste auswählen oder erstellen.</p>
        )}
      </section>
    </div>
  );
}

function TemplateView({ templates, templateForm, setTemplateForm, submitTemplate, deleteTemplate }) {
  const groupedTemplates = groupTemplatesBySection(templates);
  const sectionEntries = Object.entries(groupedTemplates).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <h2>{templateForm.id ? 'Aufgabenvorlage bearbeiten' : 'Aufgabenvorlage erstellen'}</h2>
        <form className="stack" onSubmit={submitTemplate}>
          <label>
            Aufgabe
            <input
              value={templateForm.title}
              onChange={(event) => setTemplateForm((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label>
            Bereich
            <select
              value={templateForm.section}
              onChange={(event) => setTemplateForm((current) => ({ ...current, section: event.target.value }))}
            >
              {SECTION_OPTIONS.map((option) => (
                <option key={option.value || 'none'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Typ
            <select
              value={templateForm.templateType}
              onChange={(event) => {
                const nextType = event.target.value;
                setTemplateForm((current) => ({
                  ...current,
                  templateType: nextType,
                  scheduleType: nextType === 'occasional' ? 'never_direct' : (current.scheduleType === 'never_direct' ? 'daily' : current.scheduleType),
                  scheduleDays: nextType === 'occasional' ? [] : current.scheduleDays,
                }));
              }}
            >
              {TEMPLATE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Nur anzeigen wenn
            <select
              value={templateForm.requiredArea}
              onChange={(event) => setTemplateForm((current) => ({ ...current, requiredArea: event.target.value }))}
            >
              {AREA_OPTIONS.map((area) => (
                <option key={area.value || 'always'} value={area.value}>{area.label}</option>
              ))}
            </select>
          </label>
            <label>
              Häufigkeit
              <select
                value={templateForm.scheduleType}
                onChange={(event) => {
                  const value = event.target.value;
                  setTemplateForm((current) => ({
                    ...current,
                    scheduleType: value,
                    scheduleDays: value === 'never_direct' ? [] : current.scheduleDays,
                    templateType: current.templateType === 'occasional' && value !== 'never_direct' ? 'standard' : current.templateType,
                  }));
                }}
              >
                {FREQUENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {templateForm.templateType !== 'occasional' && templateForm.scheduleType !== 'daily' && templateForm.scheduleType !== 'never_direct' ? (
              <div className="stack">
                <label>Tage auswählen</label>
                <div className="roster-grid">
                  {WEEKDAY_OPTIONS.map((option) => {
                    const selected = templateForm.scheduleDays.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`roster-chip ${selected ? 'selected' : ''}`}
                        onClick={() =>
                          setTemplateForm((current) => ({
                            ...current,
                            scheduleDays: toggleScheduleDay(current.scheduleDays, option.value),
                          }))
                        }
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {templateForm.scheduleType === 'interval_weeks' ? (
              <label>
                Alle wie viele Wochen?
                <input
                  type="number"
                  min="1"
                  value={templateForm.recurrenceIntervalWeeks}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      recurrenceIntervalWeeks: Number(event.target.value) > 0 ? Number(event.target.value) : 1,
                    }))
                  }
                />
              </label>
            ) : null}
          <button type="submit" className="primary-button">
            {templateForm.id ? 'Änderungen speichern' : 'Vorlage hinzufügen'}
          </button>
        </form>
      </section>

      <section className="panel wide-panel">
        <h2>Standardaufgaben</h2>
        <p className="subtle">Die Pool-Aufgaben sind jetzt nach Bereichen gruppiert.</p>
        <div className="template-list">
          {sectionEntries.map(([section, sectionTemplates]) => (
            <TemplateSection
              key={section}
              section={section}
              templates={sectionTemplates}
              setTemplateForm={setTemplateForm}
              deleteTemplate={deleteTemplate}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function TemplateSection({ section, templates, setTemplateForm, deleteTemplate }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <section className="task-section">
      <button className="task-row" onClick={() => setIsOpen((current) => !current)}>
        <div>
          <strong>{section}</strong>
          <p>{templates.length} Standardaufgaben</p>
        </div>
        <span className="checkbox-indicator">{isOpen ? 'Zuklappen' : 'Aufklappen'}</span>
      </button>

      {isOpen ? (
        <div className="template-list" style={{ marginTop: '12px' }}>
          {templates.map((template) => (
            <article key={template._id} className="template-row">
              <div>
                <strong>{template.title}</strong>
                <p>{formatTemplateScheduleHint(template)}{template.templateType === 'occasional' ? ' · Gelegentlich' : ''}</p>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    setTemplateForm({
                      id: template._id,
                      title: template.title,
                      section: template.section,
                      shiftType: template.shiftType,
                      templateType: template.templateType || 'standard',
                      requiredArea: template.requiredArea || '',
                      scheduleType: template.templateType === 'occasional'
                        ? 'never_direct'
                        : (template.scheduleType || ((template.scheduleDays?.length || template.weekdays?.length) ? 'selected_days' : 'daily')),
                      scheduleDays: template.scheduleType === 'never_direct'
                        ? []
                        : (template.scheduleDays?.length ? template.scheduleDays : (template.weekdays || [])),
                      recurrenceIntervalWeeks: template.recurrenceIntervalWeeks || 2,
                    })
                  }
                >
                  Bearbeiten
                </button>
                <button type="button" className="danger-button" onClick={() => deleteTemplate(template._id)}>
                  Löschen
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function HistoryView({ shifts }) {
  const [expandedIds, setExpandedIds] = useState([]);

  function toggleDetails(id) {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  return (
    <section className="panel">
      <h2>Historie und Status</h2>
      <div className="history-grid">
        {shifts.map((shift) => {
          const expanded = expandedIds.includes(shift._id);
          const visibleTasks = (shift.checklist || []).filter((task) => task.included !== false).length;
          const totalTasks = (shift.checklist || []).length;
          const assigned = shift.assignedColleagues.map((person) => person.name).join(', ') || 'Noch offen';
          return (
            <article
              key={shift._id}
              className={`history-card ${expanded ? 'expanded' : ''}`}
              onClick={() => toggleDetails(shift._id)}
              style={{ cursor: 'pointer' }}
            >
              <div className="panel-header">
                <strong>{formatShiftLabel(shift.shiftType)}</strong>
                <span className="pill">{shift.status}</span>
              </div>
              <p>{shift.date}</p>
              <p>{shift.completionRate}% erledigt</p>
              <p>Kollegen: {assigned}</p>
              {expanded ? (
                <div className="task-details" style={{ marginTop: '12px' }}>
                  <p><strong>Bereichsnutzung</strong></p>
                  <p>Unten: {shift.areaUsage?.untenUsed ? 'Ja' : 'Nein'}</p>
                  <p>Biergarten: {shift.areaUsage?.biergartenUsed ? 'Ja' : 'Nein'}</p>
                  <p><strong>Aufgaben</strong></p>
                  <p>Aktive Aufgaben: {visibleTasks}</p>
                  <p>Gesamtaufgaben: {totalTasks}</p>
                  <div className="task-preview" style={{ marginTop: '8px' }}>
                    {(shift.checklist || []).slice(0, 5).map((task) => (
                      <div key={task._id || `${task.title}-${task.section}`} className="template-row" style={{ marginBottom: '8px' }}>
                        <strong>{task.title}</strong>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
                          {task.section} · {task.completed ? 'Erledigt' : 'Offen'}{task.included === false ? ' · Ausgeblendet' : ''}
                        </p>
                      </div>
                    ))}
                    {(shift.checklist || []).length > 5 ? <p className="subtle">und weitere {shift.checklist.length - 5} Aufgaben...</p> : null}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TeamView({ colleagues, newColleagueName, setNewColleagueName, createColleague, toggleColleagueStatus }) {
  return (
    <div className="dashboard-grid">
      <section className="panel">
        <h2>Kollege anlegen</h2>
        <form className="stack" onSubmit={createColleague}>
          <label>
            Name
            <input
              value={newColleagueName}
              onChange={(event) => setNewColleagueName(event.target.value)}
              placeholder="Name eingeben"
            />
          </label>
          <button type="submit" className="primary-button">Kollegen hinzufügen</button>
        </form>
      </section>

      <section className="panel wide-panel">
        <h2>Kollegenliste</h2>
        <div className="template-list">
          {colleagues.map((colleague) => (
            <article key={colleague._id} className="template-row">
              <div>
                <strong>{colleague.name}</strong>
                <p>{colleague.active ? 'Aktiv für Schichtauswahl' : 'Deaktiviert'}</p>
              </div>
              <button className="ghost-button" onClick={() => toggleColleagueStatus(colleague)}>
                {colleague.active ? 'Deaktivieren' : 'Reaktivieren'}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportsView({ reports }) {
  if (!reports) {
    return <section className="panel"><p className="subtle">Berichte werden geladen...</p></section>;
  }

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <h2>Zusammenfassung</h2>
        <div className="stats-grid">
          <article>
            <strong>{reports.summary.totalShifts}</strong>
            <span>Checklisten gesamt</span>
          </article>
          <article>
            <strong>{reports.summary.completedShifts}</strong>
            <span>Vollständig erledigt</span>
          </article>
          <article>
            <strong>{reports.summary.activeShifts}</strong>
            <span>Aktiv</span>
          </article>
        </div>
      </section>

      <section className="panel wide-panel">
        <h2>Mitarbeiteraktivität</h2>
        <div className="template-list">
          {reports.employeeActivity.map((entry) => (
            <article key={entry.name} className="template-row">
              <div>
                <strong>{entry.name}</strong>
                <p>Erledigte Aufgaben: {entry.completedTasks}</p>
              </div>
              <span className="pill">{entry.lastCompletedAt ? 'Zuletzt aktiv' : 'Noch keine Einträge'}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function OwnerView({ shifts, reports }) {
  return (
    <div className="dashboard-grid">
      <section className="panel">
        <h2>Owner Übersicht</h2>
        <p className="subtle">
          Hier siehst du den Gesamtstatus, ohne die operative Struktur so leicht zu verändern wie der General Manager.
        </p>
        <div className="stats-grid">
          <article>
            <strong>{shifts.length}</strong>
            <span>Checklisten in aktueller Ansicht</span>
          </article>
          <article>
            <strong>{reports?.employeeActivity?.length || 0}</strong>
            <span>Erfasste Kollegen</span>
          </article>
        </div>
      </section>

      <section className="panel wide-panel">
        <h2>Sichtbare Checklisten</h2>
        <div className="history-grid">
          {shifts.map((shift) => (
            <article key={shift._id} className="history-card">
              <div className="panel-header">
                <strong>{formatShiftLabel(shift.shiftType)}</strong>
                <span className="pill">{shift.completionRate}%</span>
              </div>
              <p>{shift.date}</p>
              <p>{shift.status}</p>
              <p>Kollegen: {shift.assignedColleagues.map((person) => person.name).join(', ') || 'Noch offen'}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChecklistSections({ groupedTasks, onToggle, disableToggle }) {
  const sections = Object.entries(groupedTasks);

  if (!sections.length) {
    return <p className="subtle">Für die heutigen Bereiche sind aktuell keine Aufgaben aktiv.</p>;
  }

  return (
    <div className="stack">
      {sections.map(([section, tasks]) => (
        <section key={section} className="task-section">
          <div className="panel-header">
            <h3>{section}</h3>
            <span className="pill">{tasks.filter((task) => task.completed).length}/{tasks.length}</span>
          </div>
          <div className="task-list">
            {tasks.map((task) => (
              <button
                key={task._id}
                className={`task-row ${task.completed ? 'completed' : ''}`}
                onClick={() => onToggle(task)}
                disabled={disableToggle}
              >
                <div>
                  <strong>{task.title}</strong>
                  <p>{task.completed ? `Erledigt von ${task.completedByColleague || task.completedByUser}` : 'Antippen zum Abhaken'}</p>
                </div>
                <span className="checkbox-indicator">{task.completed ? 'Erledigt' : 'Offen'}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function formatTemplateScheduleHint(template) {
  const areaText = AREA_OPTIONS.find((entry) => entry.value === (template.requiredArea || ''))?.label;
  const scheduleDays = template.scheduleDays?.length ? template.scheduleDays : (template.weekdays || []);
  let frequencyText = 'Jeden Tag';

  if ((template.scheduleType || '') === 'never_direct' || template.templateType === 'occasional') {
    frequencyText = 'Nie direkt anzeigen';
  } else if ((template.scheduleType || '') === 'selected_days' && scheduleDays.length) {
    frequencyText = scheduleDays
      .map((value) => WEEKDAY_OPTIONS.find((entry) => entry.value === value)?.label)
      .filter(Boolean)
      .join(', ');
  } else if ((template.scheduleType || '') === 'interval_weeks' && scheduleDays.length) {
    const dayLabels = scheduleDays
      .map((value) => WEEKDAY_OPTIONS.find((entry) => entry.value === value)?.label)
      .filter(Boolean)
      .join(', ');
    frequencyText = `Alle ${template.recurrenceIntervalWeeks || 2} Wochen: ${dayLabels}`;
  }

  return [template.section || 'Kein Bereich', areaText, frequencyText].filter(Boolean).join(' · ');
}

export default App;
