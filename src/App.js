import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './App.css';

const API_BASE = `${window.location.origin}/api`;
const socket = io(window.location.origin, {
  transports: ['websocket', 'polling'],
});

const ROLE_LABELS = {
  employee: 'Schlussdienstliste',
  general_manager: 'Schlussdienstliste',
  owner: 'Schlussdienstliste',
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
  const berlinParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date())
    .reduce((accumulator, part) => {
      if (part.type !== 'literal') {
        accumulator[part.type] = part.value;
      }
      return accumulator;
    }, {});

  const currentDate = `${berlinParts.year}-${berlinParts.month}-${berlinParts.day}`;
  const currentHour = Number(berlinParts.hour || '0');
  if (currentHour >= 5) {
    return currentDate;
  }

  const previousDate = new Date(`${currentDate}T12:00:00Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  return previousDate.toISOString().slice(0, 10);
}

function formatBusinessDayLabel(dateString) {
  if (!dateString) {
    return '';
  }

  const date = new Date(`${dateString}T12:00:00Z`);
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
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

function getFreshTemplateForm() {
  return {
    id: '',
    title: '',
    section: 'Oben',
    shiftType: 'closing',
    templateType: 'standard',
    requiredArea: '',
    needsPhoto: false,
    scheduleType: 'daily',
    scheduleDays: [],
    recurrenceIntervalWeeks: 2,
  };
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

function getTemplateFrequencyCategory(template) {
  if ((template.scheduleType || '') === 'never_direct' || template.templateType === 'occasional') {
    return 'occasional';
  }
  if ((template.scheduleType || '') === 'selected_days') {
    return 'selected_days';
  }
  if ((template.scheduleType || '') === 'interval_weeks') {
    return 'interval_weeks';
  }
  return 'daily';
}

function templateMatchesFilters(template, filters) {
  const searchText = [
    template.title,
    template.section,
    template.shiftType,
    formatTemplateScheduleHint(template),
    template.templateType === 'occasional' ? 'gelegentlich' : 'standard',
    template.needsPhoto ? 'foto' : '',
  ].join(' ').toLowerCase();

  if (filters.search && !searchText.includes(filters.search.toLowerCase())) {
    return false;
  }
  if (filters.section !== 'all' && (template.section || '') !== filters.section) {
    return false;
  }
  if (filters.frequency !== 'all' && getTemplateFrequencyCategory(template) !== filters.frequency) {
    return false;
  }
  if (filters.templateType !== 'all' && (template.templateType || 'standard') !== filters.templateType) {
    return false;
  }
  if (filters.photo === 'required' && !template.needsPhoto) {
    return false;
  }
  if (filters.photo === 'not_required' && template.needsPhoto) {
    return false;
  }
  if (filters.area !== 'all' && (template.requiredArea || '') !== filters.area) {
    return false;
  }
  return true;
}

function sortTemplates(templates, sortBy) {
  const items = [...templates];

  items.sort((left, right) => {
    if (sortBy === 'title') {
      return left.title.localeCompare(right.title, 'de');
    }
    if (sortBy === 'section') {
      return `${left.section || ''} ${left.title}`.localeCompare(`${right.section || ''} ${right.title}`, 'de');
    }
    if (sortBy === 'frequency') {
      const order = {
        daily: 0,
        selected_days: 1,
        interval_weeks: 2,
        occasional: 3,
      };
      return (order[getTemplateFrequencyCategory(left)] ?? 99) - (order[getTemplateFrequencyCategory(right)] ?? 99)
        || left.title.localeCompare(right.title, 'de');
    }
    if (sortBy === 'type') {
      return `${left.templateType || 'standard'} ${left.title}`.localeCompare(`${right.templateType || 'standard'} ${right.title}`, 'de');
    }
    if (sortBy === 'photo') {
      return Number(Boolean(right.needsPhoto)) - Number(Boolean(left.needsPhoto))
        || left.title.localeCompare(right.title, 'de');
    }
    return left.title.localeCompare(right.title, 'de');
  });

  return items;
}

function getTemplateFrequencyVisual(category) {
  if (category === 'occasional') {
    return {
      className: 'template-frequency-occasional',
      label: 'Gelegentlich',
    };
  }
  if (category === 'selected_days' || category === 'interval_weeks') {
    return {
      className: 'template-frequency-scheduled',
      label: category === 'interval_weeks' ? 'Alle x Wochen' : 'Tag-spezifisch',
    };
  }
  return {
    className: 'template-frequency-daily',
    label: 'Täglich',
  };
}

function toggleScheduleDay(days, day) {
  return days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day].sort((a, b) => a - b);
}

function matchesShiftFilters(shift, filters) {
  const colleagueNames = (shift.assignedColleagues || []).map((person) => person.name).join(' ').toLowerCase();
  const taskText = (shift.checklist || []).map((task) => task.title).join(' ').toLowerCase();
  const searchText = `${shift.date} ${shift.shiftType} ${shift.status} ${colleagueNames} ${taskText}`.toLowerCase();

  if (filters.search && !searchText.includes(filters.search.toLowerCase())) {
    return false;
  }
  if (filters.status !== 'all' && shift.status !== filters.status) {
    return false;
  }
  if (filters.shiftType !== 'all' && shift.shiftType !== filters.shiftType) {
    return false;
  }
  if (filters.from && shift.date < filters.from) {
    return false;
  }
  if (filters.to && shift.date > filters.to) {
    return false;
  }
  if (filters.completion === 'open' && shift.completionRate >= 100) {
    return false;
  }
  if (filters.completion === 'done' && shift.completionRate < 100) {
    return false;
  }

  return true;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Foto konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
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
  const [templateForm, setTemplateForm] = useState(getFreshTemplateForm);
  const [dailyTaskForm, setDailyTaskForm] = useState({
    source: 'pool',
    templateId: '',
    title: '',
    section: '',
    needsPhoto: false,
  });
  const [assignmentForm, setAssignmentForm] = useState({
    date: getTodayBerlin(),
    shiftType: 'closing',
  });
  const [message, setMessage] = useState('');
  const [pendingPhotoTask, setPendingPhotoTask] = useState(null);
  const [photoUploadPending, setPhotoUploadPending] = useState(false);
  const photoInputRef = useRef(null);

  const canManageOperations = user?.role === 'general_manager';
  const canManageColleagues = user?.role === 'general_manager' || user?.role === 'owner';
  const businessDayLabel = formatBusinessDayLabel(selectedDate);

  const loadDashboardData = useCallback(async (role, date) => {
    setLoadingData(true);

    try {
      const requests = [
        axios.get(`${API_BASE}/colleagues`, authHeaders(token)),
        axios.get(`${API_BASE}/shifts?date=${date}`, authHeaders(token)),
      ];

      requests.push(axios.get(`${API_BASE}/templates`, authHeaders(token)));

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
      needsPhoto: templateForm.needsPhoto,
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

        setTemplateForm(getFreshTemplateForm());
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
          needsPhoto: dailyTaskForm.needsPhoto,
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
        needsPhoto: false,
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

  async function persistTaskToggle(shiftId, task, completed, photoDataUrl = '') {
    try {
      const { data } = await axios.put(
        `${API_BASE}/shifts/${shiftId}/tasks/${task._id}`,
        {
          completed,
          colleagueName: activeColleagueName,
          photoDataUrl,
        },
        authHeaders(token)
      );
      setShifts((current) => current.map((shift) => (shift._id === data._id ? data : shift)));
    } catch (error) {
      setMessage(error.response?.data?.error || 'Aufgabe konnte nicht aktualisiert werden.');
      throw error;
    }
  }

  function requestPhotoForTask(shiftId, task) {
    setPendingPhotoTask({ shiftId, task });
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
      photoInputRef.current.click();
    }
  }

  async function handlePhotoSelection(event) {
    const file = event.target.files?.[0];
    if (!pendingPhotoTask) {
      return;
    }
    if (!file) {
      setPendingPhotoTask(null);
      return;
    }

    setPhotoUploadPending(true);
    try {
      const photoDataUrl = await readFileAsDataUrl(file);
      await persistTaskToggle(pendingPhotoTask.shiftId, pendingPhotoTask.task, true, photoDataUrl);
      setMessage('Aufgabe mit Foto-Nachweis gespeichert.');
    } catch (error) {
      setMessage(error.response?.data?.error || error.message || 'Foto konnte nicht gespeichert werden.');
    } finally {
      setPendingPhotoTask(null);
      setPhotoUploadPending(false);
      event.target.value = '';
    }
  }

  async function toggleTask(shiftId, task, completed) {
    if (completed && task.needsPhoto) {
      requestPhotoForTask(shiftId, task);
      return;
    }

    await persistTaskToggle(shiftId, task, completed);
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
            Gemeinsamer iPad-Zugang für das Team mit Tagesdokumentation und Nachverfolgung.
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
            Angemeldet als {user.displayName}. Servicetag: {businessDayLabel}, gültig bis 05:00 Uhr.
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
        {user.role === 'employee' ? <a href="#/mitarbeiter">Heute</a> : null}
        {user.role === 'general_manager' ? <a href="#/manager">Heute</a> : null}
        {user.role === 'general_manager' ? <a href="#/vorlagen">Aufgabenpool</a> : null}
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
          templates={templates}
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
          dailyTaskForm={dailyTaskForm}
          setDailyTaskForm={setDailyTaskForm}
          addTaskToToday={addTaskToToday}
          photoUploadPending={photoUploadPending}
          pendingPhotoTaskId={pendingPhotoTask?.task?._id || ''}
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
          photoUploadPending={photoUploadPending}
          pendingPhotoTaskId={pendingPhotoTask?.task?._id || ''}
        />
      ) : null}

      {route === '#/vorlagen' && canManageOperations ? (
        <EnhancedTemplateView
          templates={templates}
          templateForm={templateForm}
          setTemplateForm={setTemplateForm}
          submitTemplate={submitTemplate}
          deleteTemplate={deleteTemplate}
        />
      ) : null}

      {route === '#/historie' ? <FilteredHistoryView shifts={shifts} /> : null}

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
      {route === '#/owner' && user.role === 'owner' ? <FilteredOwnerView shifts={shifts} reports={reports} /> : null}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoSelection}
        style={{ display: 'none' }}
      />
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
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

function ShiftFilterBar({ filters, setFilters }) {
  function update(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="filter-grid">
      <input
        value={filters.search}
        onChange={(event) => update('search', event.target.value)}
        placeholder="Suchen nach Datum, Kollegen oder Aufgaben"
      />
      <select value={filters.status} onChange={(event) => update('status', event.target.value)}>
        <option value="all">Alle Status</option>
        <option value="open">Offen</option>
        <option value="in_progress">In Bearbeitung</option>
        <option value="completed">Erledigt</option>
      </select>
      <select value={filters.shiftType} onChange={(event) => update('shiftType', event.target.value)}>
        <option value="all">Alle Listenarten</option>
        {SHIFT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <select value={filters.completion} onChange={(event) => update('completion', event.target.value)}>
        <option value="all">Jeder Fortschritt</option>
        <option value="open">Nicht vollständig</option>
        <option value="done">100% erledigt</option>
      </select>
      <input type="date" value={filters.from} onChange={(event) => update('from', event.target.value)} />
      <input type="date" value={filters.to} onChange={(event) => update('to', event.target.value)} />
    </div>
  );
}

function CompactUsagePrompt({ usageForm, setUsageForm, saveShiftUsage }) {
  return (
    <div className="stack compact-usage-stack">
      <div className="panel-header compact-panel-header">
        <h3>Bereiche heute</h3>
        <span className="pill">1x pro Tag</span>
      </div>
      <div className="compact-usage-grid">
        <div className="task-section compact-task-entry">
          <div className="panel-header">
            <strong>Unten benutzt?</strong>
            <span className="pill">
              {typeof usageForm.untenUsed === 'boolean' ? (usageForm.untenUsed ? 'Ja' : 'Nein') : 'Offen'}
            </span>
          </div>
          <div className="choice-row compact-choice-row">
            <button
              type="button"
              className={`mini-button ${usageForm.untenUsed === true ? 'selected' : ''}`}
              onClick={() => setUsageForm((current) => ({ ...current, untenUsed: true }))}
            >
              Ja
            </button>
            <button
              type="button"
              className={`mini-button ${usageForm.untenUsed === false ? 'selected' : ''}`}
              onClick={() => setUsageForm((current) => ({ ...current, untenUsed: false }))}
            >
              Nein
            </button>
          </div>
        </div>

        <div className="task-section compact-task-entry">
          <div className="panel-header">
            <strong>Biergarten benutzt?</strong>
            <span className="pill">
              {typeof usageForm.biergartenUsed === 'boolean' ? (usageForm.biergartenUsed ? 'Ja' : 'Nein') : 'Offen'}
            </span>
          </div>
          <div className="choice-row compact-choice-row">
            <button
              type="button"
              className={`mini-button ${usageForm.biergartenUsed === true ? 'selected' : ''}`}
              onClick={() => setUsageForm((current) => ({ ...current, biergartenUsed: true }))}
            >
              Ja
            </button>
            <button
              type="button"
              className={`mini-button ${usageForm.biergartenUsed === false ? 'selected' : ''}`}
              onClick={() => setUsageForm((current) => ({ ...current, biergartenUsed: false }))}
            >
              Nein
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="primary-button compact-submit"
        onClick={saveShiftUsage}
        disabled={typeof usageForm.untenUsed !== 'boolean' || typeof usageForm.biergartenUsed !== 'boolean'}
      >
        Bereichsnutzung speichern
      </button>
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function ManagerTaskComposer({ dailyTaskForm, setDailyTaskForm, addTaskToToday, activeShift, templates }) {
  return (
    <section className="task-section compact-task-entry">
      <div className="panel-header compact-panel-header">
        <div>
          <h3>Aufgabe für heute</h3>
          <p className="subtle">Kompakt für den Tagesablauf.</p>
        </div>
      </div>
      <form className="stack compact-stack-gap" onSubmit={addTaskToToday}>
        <div className="compact-action-bar">
          <button
            type="button"
            className={`mini-button ${dailyTaskForm.source === 'pool' ? 'selected' : ''}`}
            onClick={() =>
              setDailyTaskForm((current) => ({
                ...current,
                source: 'pool',
              }))
            }
          >
            Aus Pool
          </button>
          <button
            type="button"
            className={`mini-button ${dailyTaskForm.source === 'one_time' ? 'selected' : ''}`}
            onClick={() =>
              setDailyTaskForm((current) => ({
                ...current,
                source: 'one_time',
              }))
            }
          >
            Einmalig
          </button>
        </div>

        {dailyTaskForm.source === 'pool' ? (
          <select
            value={dailyTaskForm.templateId}
            onChange={(event) =>
              setDailyTaskForm((current) => ({
                ...current,
                templateId: event.target.value,
              }))
            }
          >
            <option value="">Pool-Aufgabe auswählen</option>
            {templates
              .filter((template) => template.templateType === 'occasional')
              .map((template) => (
                <option key={template._id} value={template._id}>
                  {template.section} - {template.title}
                </option>
              ))}
          </select>
        ) : (
          <div className="inline-form-grid task-composer-grid">
            <input
              value={dailyTaskForm.title}
              placeholder="Neue Aufgabe für heute"
              onChange={(event) =>
                setDailyTaskForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
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
            <button
              type="button"
              className={`mini-button ${dailyTaskForm.needsPhoto ? 'selected' : ''}`}
              onClick={() =>
                setDailyTaskForm((current) => ({
                  ...current,
                  needsPhoto: !current.needsPhoto,
                }))
              }
            >
              Foto
            </button>
            <button type="submit" className="primary-button compact-submit" disabled={!activeShift}>
              Hinzufügen
            </button>
          </div>
        )}

        {dailyTaskForm.source === 'pool' ? (
          <button type="submit" className="primary-button compact-submit" disabled={!activeShift || !dailyTaskForm.templateId}>
            Hinzufügen
          </button>
        ) : null}
      </form>
    </section>
  );
}

function EmployeeView({
  shifts,
  activeShift,
  setActiveShiftId,
  groupedActiveTasks,
  templates,
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
  dailyTaskForm,
  setDailyTaskForm,
  addTaskToToday,
  photoUploadPending,
  pendingPhotoTaskId,
}) {
  const [employeePanel, setEmployeePanel] = useState('roster');

  useEffect(() => {
    if (usageIsRequired) {
      setEmployeePanel('usage');
      return;
    }
    if (!activeShift?.assignedColleagues.length) {
      setEmployeePanel('roster');
      return;
    }
    setEmployeePanel('task');
  }, [usageIsRequired, activeShift?._id, activeShift?.assignedColleagues.length]);

  if (!shifts.length) {
    return (
      <section className="panel">
        <h2>Für heute ist noch keine Checkliste angelegt.</h2>
        <p className="subtle">Sobald die Tagescheckliste angelegt wurde, erscheint sie hier automatisch.</p>
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
                <p className="subtle">Servicetag: {formatBusinessDayLabel(activeShift.date)}, gültig bis 05:00 Uhr.</p>
              </div>
              <span className="pill">{activeShift.status}</span>
            </div>

            {usageIsRequired ? (
              <CompactUsagePrompt
                usageForm={usageForm}
                setUsageForm={setUsageForm}
                saveShiftUsage={saveShiftUsage}
              />
            ) : !activeShift.assignedColleagues.length ? (
              <div className="stack">
                <div className="compact-action-bar">
                  <button
                    type="button"
                    className={`mini-button ${employeePanel === 'roster' ? 'selected' : ''}`}
                    onClick={() => setEmployeePanel('roster')}
                  >
                    Wer war da?
                  </button>
                </div>
                {employeePanel === 'roster' ? (
                  <>
                    <p className="subtle">Einmal pro Tag kurz auswählen, wer diese Schicht gearbeitet hat.</p>
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
                  </>
                ) : null}
              </div>
            ) : (
              <>
                <div className="compact-control-strip">
                  <div className="compact-action-bar">
                    <button
                      type="button"
                      className={`mini-button ${employeePanel === 'task' ? 'selected' : ''}`}
                      onClick={() => setEmployeePanel('task')}
                    >
                      Aufgabe hinzufügen
                    </button>
                    <button
                      type="button"
                      className={`mini-button ${employeePanel === 'usage' ? 'selected' : ''}`}
                      onClick={() => setEmployeePanel('usage')}
                    >
                      Bereiche
                    </button>
                  </div>
                  <label className="compact-select">
                    <span>Ich hake ab als</span>
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
                </div>
                <p className="subtle">
                  Gearbeitet am {formatBusinessDayLabel(activeShift.date)} bis 05:00 Uhr: {activeShift.assignedColleagues.map((colleague) => colleague.name).join(', ')}
                </p>
                {employeePanel === 'usage' ? (
                  <CompactUsagePrompt
                    usageForm={usageForm}
                    setUsageForm={setUsageForm}
                    saveShiftUsage={saveShiftUsage}
                  />
                ) : null}
                {employeePanel === 'task' ? (
                  <section className="task-section compact-task-entry">
                    <div className="compact-action-bar task-mode-bar">
                      <button
                        type="button"
                        className={`mini-button ${dailyTaskForm.source === 'pool' ? 'selected' : ''}`}
                        onClick={() =>
                          setDailyTaskForm((current) => ({
                            ...current,
                            source: 'pool',
                          }))
                        }
                      >
                        Gelegentlich aus Pool
                      </button>
                      <button
                        type="button"
                        className={`mini-button ${dailyTaskForm.source === 'one_time' ? 'selected' : ''}`}
                        onClick={() =>
                          setDailyTaskForm((current) => ({
                            ...current,
                            source: 'one_time',
                          }))
                        }
                      >
                        Einmalig
                      </button>
                    </div>
                    {dailyTaskForm.source === 'pool' ? (
                      <form className="inline-form-grid task-composer-grid" onSubmit={addTaskToToday}>
                        <select
                          value={dailyTaskForm.templateId}
                          onChange={(event) =>
                            setDailyTaskForm((current) => ({
                              ...current,
                              source: 'pool',
                              templateId: event.target.value,
                            }))
                          }
                        >
                          <option value="">Gelegentliche Pool-Aufgabe auswählen</option>
                          {templates
                            .filter((template) => template.templateType === 'occasional')
                            .map((template) => (
                              <option key={template._id} value={template._id}>
                                {template.section} - {template.title}
                              </option>
                            ))}
                        </select>
                        <div />
                        <div />
                        <button type="submit" className="primary-button" disabled={!dailyTaskForm.templateId}>
                          Hinzufügen
                        </button>
                      </form>
                    ) : (
                      <form className="inline-form-grid task-composer-grid" onSubmit={addTaskToToday}>
                        <input
                          value={dailyTaskForm.title}
                          placeholder="Neue Aufgabe für heute"
                          onChange={(event) =>
                            setDailyTaskForm((current) => ({
                              ...current,
                              source: 'one_time',
                              title: event.target.value,
                            }))
                          }
                        />
                        <select
                          value={dailyTaskForm.section}
                          onChange={(event) =>
                            setDailyTaskForm((current) => ({
                              ...current,
                              source: 'one_time',
                              section: event.target.value,
                            }))
                          }
                        >
                          {SECTION_OPTIONS.map((option) => (
                            <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={`mini-button ${dailyTaskForm.needsPhoto ? 'selected' : ''}`}
                          onClick={() =>
                            setDailyTaskForm((current) => ({
                              ...current,
                              source: 'one_time',
                              needsPhoto: !current.needsPhoto,
                            }))
                          }
                        >
                          Foto
                        </button>
                        <button type="submit" className="primary-button">
                          Hinzufügen
                        </button>
                      </form>
                    )}
                  </section>
                ) : null}
                <ColoredChecklistSections
                  groupedTasks={groupedActiveTasks}
                  onToggle={(task) => toggleTask(activeShift._id, task, !task.completed)}
                  disableToggle={!activeColleagueName}
                  photoUploadPending={photoUploadPending}
                  pendingPhotoTaskId={pendingPhotoTaskId}
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
  photoUploadPending,
  pendingPhotoTaskId,
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

        <div className="panel-header compact-panel-header">
          <h3>Aufgabe für heute</h3>
          <span className="pill">Tagesliste</span>
        </div>
        <form className="stack manager-task-form" onSubmit={addTaskToToday}>
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
              <div className="stack compact-stack-gap">
                <label>Foto-Nachweis</label>
                <button
                  type="button"
                  className={`mini-button ${dailyTaskForm.needsPhoto ? 'selected' : ''}`}
                  onClick={() =>
                    setDailyTaskForm((current) => ({
                      ...current,
                      needsPhoto: !current.needsPhoto,
                    }))
                  }
                >
                  {dailyTaskForm.needsPhoto ? 'Foto beim Erledigen erforderlich' : 'Kein Foto erforderlich'}
                </button>
              </div>
            </>
          )}

          <button type="submit" className="primary-button compact-submit" disabled={!activeShift}>
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
                <p className="subtle">Hier steuerst du Bereiche, Besetzung und Aufgaben für den aktuellen Tag.</p>
              </div>
              <span className="pill">{activeShift.date}</span>
            </div>

            <CompactUsagePrompt
              usageForm={usageForm}
              setUsageForm={setUsageForm}
              saveShiftUsage={saveShiftUsage}
            />

            <ManagerTaskComposer
              dailyTaskForm={dailyTaskForm}
              setDailyTaskForm={setDailyTaskForm}
              addTaskToToday={addTaskToToday}
              activeShift={activeShift}
              templates={templates}
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
              <label className="compact-select compact-role-select">
                <span>Ich hake ab als</span>
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

            <ColoredChecklistSections
              groupedTasks={groupedActiveTasks}
              onToggle={(task) => toggleTask(activeShift._id, task, !task.completed)}
              disableToggle={!activeShift.assignedColleagues.length}
              photoUploadPending={photoUploadPending}
              pendingPhotoTaskId={pendingPhotoTaskId}
            />
          </>
        ) : (
          <p className="subtle">Bitte zuerst eine Checkliste auswählen oder erstellen.</p>
        )}
      </section>
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
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
          <div className="stack">
            <label>Foto-Nachweis</label>
            <button
              type="button"
              className={`roster-chip ${templateForm.needsPhoto ? 'selected' : ''}`}
              onClick={() => setTemplateForm((current) => ({ ...current, needsPhoto: !current.needsPhoto }))}
            >
              {templateForm.needsPhoto ? 'Foto beim Erledigen erforderlich' : 'Kein Foto erforderlich'}
            </button>
          </div>
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
          <p>{templates.length} Aufgaben</p>
        </div>
        <span className="checkbox-indicator">{isOpen ? 'Zuklappen' : 'Aufklappen'}</span>
      </button>

      {isOpen ? (
        <div className="template-list" style={{ marginTop: '12px' }}>
          {templates.map((template) => (
            <article key={template._id} className="template-row">
              <div>
                <strong>{template.title}</strong>
                <p>{formatTemplateScheduleHint(template)}{template.templateType === 'occasional' ? ' · Gelegentlich' : ''}{template.needsPhoto ? ' · Foto erforderlich' : ''}</p>
              </div>
              <div className="inline-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setTemplateForm(template)}
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

// eslint-disable-next-line no-unused-vars
function HistoryView({ shifts }) {
  const [expandedIds, setExpandedIds] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    shiftType: 'all',
    completion: 'all',
    from: '',
    to: '',
  });

  const filteredShifts = useMemo(
    () => shifts.filter((shift) => matchesShiftFilters(shift, filters)),
    [shifts, filters]
  );

  function toggleDetails(id) {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Historie und Status</h2>
          <p className="subtle">Filtere nach Zeitraum, Status, Checklistenart und Inhalt.</p>
        </div>
        <span className="pill">{filteredShifts.length} Einträge</span>
      </div>
      <ShiftFilterBar filters={filters} setFilters={setFilters} />
      <div className="history-grid">
        {filteredShifts.map((shift) => {
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

// eslint-disable-next-line no-unused-vars
function OwnerView({ shifts, reports }) {
  return (
    <div className="dashboard-grid">
      <section className="panel">
        <h2>Übersicht</h2>
        <p className="subtle">
          Hier siehst du den Gesamtstatus der sichtbaren Checklisten.
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

function TemplateFilterBar({ filters, setFilters }) {
  return (
    <div className="filter-grid">
      <input
        value={filters.search}
        onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
        placeholder="Nach Aufgabe, Bereich oder Ablauf suchen"
      />
      <select value={filters.section} onChange={(event) => setFilters((current) => ({ ...current, section: event.target.value }))}>
        <option value="all">Alle Bereiche</option>
        {SECTION_OPTIONS.map((option) => (
          <option key={option.value || 'none'} value={option.value}>{option.label}</option>
        ))}
      </select>
      <select value={filters.frequency} onChange={(event) => setFilters((current) => ({ ...current, frequency: event.target.value }))}>
        <option value="all">Jede Häufigkeit</option>
        <option value="daily">Täglich</option>
        <option value="selected_days">Bestimmte Tage</option>
        <option value="interval_weeks">Intervall</option>
        <option value="occasional">Gelegentlich / nie direkt</option>
      </select>
      <select value={filters.templateType} onChange={(event) => setFilters((current) => ({ ...current, templateType: event.target.value }))}>
        <option value="all">Alle Typen</option>
        <option value="standard">Standard</option>
        <option value="occasional">Gelegentlich</option>
      </select>
      <select value={filters.photo} onChange={(event) => setFilters((current) => ({ ...current, photo: event.target.value }))}>
        <option value="all">Foto egal</option>
        <option value="required">Mit Foto</option>
        <option value="not_required">Ohne Foto</option>
      </select>
      <select value={filters.area} onChange={(event) => setFilters((current) => ({ ...current, area: event.target.value }))}>
        <option value="all">Alle Anzeige-Regeln</option>
        {AREA_OPTIONS.map((area) => (
          <option key={area.value || 'always'} value={area.value}>{area.label}</option>
        ))}
      </select>
      <select value={filters.sortBy} onChange={(event) => setFilters((current) => ({ ...current, sortBy: event.target.value }))}>
        <option value="section">Sortierung: Bereich</option>
        <option value="title">Sortierung: Name</option>
        <option value="frequency">Sortierung: Häufigkeit</option>
        <option value="type">Sortierung: Typ</option>
        <option value="photo">Sortierung: Foto</option>
      </select>
    </div>
  );
}

function ColoredTemplateSection({ section, templates, setTemplateForm, deleteTemplate }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <section className="task-section">
      <button className="task-row" onClick={() => setIsOpen((current) => !current)}>
        <div>
          <strong>{section}</strong>
          <p>{templates.length} Aufgaben</p>
        </div>
        <span className="checkbox-indicator">{isOpen ? 'Zuklappen' : 'Aufklappen'}</span>
      </button>

      {isOpen ? (
        <div className="template-list" style={{ marginTop: '12px' }}>
          {templates.map((template) => {
            const frequencyCategory = getTemplateFrequencyCategory(template);
            const frequencyVisual = getTemplateFrequencyVisual(frequencyCategory);

            return (
              <article key={template._id} className={`template-row ${frequencyVisual.className}`}>
                <div className="template-row-content">
                  <strong>{template.title}</strong>
                  <div className="template-badge-row">
                    <span className={`template-frequency-badge ${frequencyVisual.className}`}>{frequencyVisual.label}</span>
                    {template.needsPhoto ? <span className="template-frequency-badge template-photo-badge">Foto erforderlich</span> : null}
                  </div>
                  <p>{formatTemplateScheduleHint(template)}</p>
                </div>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setTemplateForm(template)}
                  >
                    Bearbeiten
                  </button>
                  <button type="button" className="danger-button" onClick={() => deleteTemplate(template._id)}>
                    Löschen
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function EnhancedTemplateView({ templates, templateForm, setTemplateForm, submitTemplate, deleteTemplate }) {
  const [filters, setFilters] = useState({
    search: '',
    section: 'all',
    frequency: 'all',
    templateType: 'all',
    photo: 'all',
    area: 'all',
    sortBy: 'section',
  });

  const filteredTemplates = useMemo(
    () => sortTemplates(templates.filter((template) => templateMatchesFilters(template, filters)), filters.sortBy),
    [templates, filters]
  );
  const groupedTemplates = groupTemplatesBySection(filteredTemplates);
  const sectionEntries = Object.entries(groupedTemplates).sort((a, b) => a[0].localeCompare(b[0]));

  function startEditTemplate(template) {
    setTemplateForm({
      id: template._id,
      title: template.title,
      section: template.section,
      shiftType: template.shiftType,
      templateType: template.templateType || 'standard',
      requiredArea: template.requiredArea || '',
      needsPhoto: Boolean(template.needsPhoto),
      scheduleType: template.templateType === 'occasional'
        ? 'never_direct'
        : (template.scheduleType || ((template.scheduleDays?.length || template.weekdays?.length) ? 'selected_days' : 'daily')),
      scheduleDays: template.scheduleType === 'never_direct'
        ? []
        : (template.scheduleDays?.length ? template.scheduleDays : (template.weekdays || [])),
      recurrenceIntervalWeeks: template.recurrenceIntervalWeeks || 2,
    });
  }

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{templateForm.id ? 'Aufgabe bearbeiten' : 'Aufgabe anlegen'}</h2>
            <p className="subtle">Klarer aufgebaut für Titel, Bereich, Ablauf und Foto-Nachweis.</p>
          </div>
          {templateForm.id ? (
            <button type="button" className="ghost-button" onClick={() => setTemplateForm(getFreshTemplateForm())}>
              Neu anfangen
            </button>
          ) : null}
        </div>

        <form className="stack" onSubmit={submitTemplate}>
          <div className="editor-card">
            <div className="editor-card-title">
              <strong>Grunddaten</strong>
              <span className="pill">{templateForm.id ? 'Bearbeiten' : 'Neu'}</span>
            </div>
            <div className="filter-grid">
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
            </div>
          </div>

          <div className="editor-card">
            <div className="editor-card-title">
              <strong>Ablauf</strong>
              <span className="subtle">Wie oft und an welchen Tagen die Aufgabe erscheint.</span>
            </div>
            <div className="filter-grid">
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
              <div className="stack compact-stack-gap">
                <label>Foto-Nachweis</label>
                <button
                  type="button"
                  className={`roster-chip ${templateForm.needsPhoto ? 'selected' : ''}`}
                  onClick={() => setTemplateForm((current) => ({ ...current, needsPhoto: !current.needsPhoto }))}
                >
                  {templateForm.needsPhoto ? 'Foto beim Erledigen erforderlich' : 'Kein Foto erforderlich'}
                </button>
              </div>
            </div>

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
          </div>

          <button type="submit" className="primary-button">
            {templateForm.id ? 'Änderungen speichern' : 'Vorlage hinzufügen'}
          </button>
        </form>
      </section>

      <section className="panel wide-panel">
        <div className="panel-header">
          <div>
            <h2>Aufgabenpool</h2>
            <p className="subtle">Filtere und sortiere nach Bereich, Häufigkeit, Typ, Foto und Anzeige-Regeln.</p>
          </div>
          <span className="pill">{filteredTemplates.length} Treffer</span>
        </div>
        <TemplateFilterBar filters={filters} setFilters={setFilters} />
        <div className="template-list">
          {sectionEntries.map(([section, sectionTemplates]) => (
            <ColoredTemplateSection
              key={section}
              section={section}
              templates={sectionTemplates}
              setTemplateForm={startEditTemplate}
              deleteTemplate={deleteTemplate}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ShiftChecklistDetails({ shift }) {
  const groupedTasks = groupTasks(shift.checklist || []);
  const visibleTasks = (shift.checklist || []).filter((task) => task.included !== false).length;
  const totalTasks = (shift.checklist || []).length;

  return (
    <div className="stack shift-detail-stack">
      <div className="detail-summary-grid">
        <div className="task-section">
          <strong>Bereichsnutzung</strong>
          <p className="subtle">Unten: {shift.areaUsage?.untenUsed ? 'Ja' : 'Nein'}</p>
          <p className="subtle">Biergarten: {shift.areaUsage?.biergartenUsed ? 'Ja' : 'Nein'}</p>
        </div>
        <div className="task-section">
          <strong>Aufgabenstatus</strong>
          <p className="subtle">Sichtbare Aufgaben: {visibleTasks}</p>
          <p className="subtle">Gesamtaufgaben: {totalTasks}</p>
        </div>
      </div>
      <ColoredChecklistSections groupedTasks={groupedTasks} onToggle={() => {}} disableToggle />
    </div>
  );
}

function ShiftExplorer({ shifts }) {
  const [expandedIds, setExpandedIds] = useState([]);

  function toggleDetails(id) {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  if (!shifts.length) {
    return <p className="subtle">Keine Einträge für diese Filter gefunden.</p>;
  }

  return (
    <div className="history-grid">
      {shifts.map((shift) => {
        const expanded = expandedIds.includes(shift._id);
        const assigned = shift.assignedColleagues.map((person) => person.name).join(', ') || 'Noch offen';

        return (
          <article key={shift._id} className={`history-card ${expanded ? 'expanded' : ''}`}>
            <div className="panel-header">
              <div>
                <strong>{formatShiftLabel(shift.shiftType)}</strong>
                <p>{shift.date}</p>
              </div>
              <span className="pill">{shift.status}</span>
            </div>
            <p>{shift.completionRate}% erledigt</p>
            <p>Kollegen: {assigned}</p>
            <div className="inline-actions history-actions">
              <button type="button" className="ghost-button" onClick={() => toggleDetails(shift._id)}>
                {expanded ? 'Liste schließen' : 'Checkliste öffnen'}
              </button>
            </div>
            {expanded ? <ShiftChecklistDetails shift={shift} /> : null}
          </article>
        );
      })}
    </div>
  );
}

function FilteredHistoryView({ shifts }) {
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    shiftType: 'all',
    completion: 'all',
    from: '',
    to: '',
  });

  const filteredShifts = useMemo(
    () => shifts.filter((shift) => matchesShiftFilters(shift, filters)),
    [shifts, filters]
  );

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Historie und Status</h2>
          <p className="subtle">Filtere nach Zeitraum, Status, Checklistenart und Inhalt.</p>
        </div>
        <span className="pill">{filteredShifts.length} Einträge</span>
      </div>
      <ShiftFilterBar filters={filters} setFilters={setFilters} />
      <ShiftExplorer shifts={filteredShifts} />
    </section>
  );
}

function FilteredOwnerView({ shifts, reports }) {
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    shiftType: 'all',
    completion: 'all',
    from: '',
    to: '',
  });

  const filteredShifts = useMemo(
    () => shifts.filter((shift) => matchesShiftFilters(shift, filters)),
    [shifts, filters]
  );

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <h2>Übersicht</h2>
        <p className="subtle">
          Hier siehst du den Gesamtstatus der sichtbaren Checklisten.
        </p>
        <div className="stats-grid">
          <article>
            <strong>{filteredShifts.length}</strong>
            <span>Checklisten in aktueller Ansicht</span>
          </article>
          <article>
            <strong>{reports?.employeeActivity?.length || 0}</strong>
            <span>Erfasste Kollegen</span>
          </article>
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="panel-header">
          <div>
            <h2>Sichtbare Checklisten</h2>
            <p className="subtle">Öffne jede Liste direkt aus der Übersicht.</p>
          </div>
          <span className="pill">{filteredShifts.length} sichtbar</span>
        </div>
        <ShiftFilterBar filters={filters} setFilters={setFilters} />
        <ShiftExplorer shifts={filteredShifts} />
      </section>
    </div>
  );
}

function ColoredChecklistSections({ groupedTasks, onToggle, disableToggle, photoUploadPending, pendingPhotoTaskId }) {
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
            {tasks.map((task) => {
              const frequencyCategory = getTemplateFrequencyCategory(task);
              const frequencyVisual = getTemplateFrequencyVisual(frequencyCategory);

              return (
                <button
                  key={task._id}
                  className={`task-row ${frequencyVisual.className} ${task.completed ? 'completed' : ''}`}
                  onClick={() => onToggle(task)}
                  disabled={disableToggle || (photoUploadPending && pendingPhotoTaskId === task._id)}
                >
                  <div>
                    <strong>{task.title}</strong>
                    <p>{task.completed ? `Erledigt von ${task.completedByColleague || task.completedByUser}` : (task.needsPhoto ? 'Antippen zum Abhaken und Foto aufnehmen' : 'Antippen zum Abhaken')}</p>
                    <div className="task-meta">
                      <span className={`task-proof-badge ${frequencyVisual.className}`}>{frequencyVisual.label}</span>
                      {task.needsPhoto ? <span className="task-proof-badge">Foto erforderlich</span> : null}
                      {task.completionPhotoDataUrl ? <span className="task-proof-badge">Foto gespeichert</span> : null}
                    </div>
                    {task.completionPhotoDataUrl ? (
                      <img
                        className="task-photo-preview"
                        src={task.completionPhotoDataUrl}
                        alt={`Nachweis für ${task.title}`}
                      />
                    ) : null}
                  </div>
                  <span className="checkbox-indicator">
                    {photoUploadPending && pendingPhotoTaskId === task._id ? 'Foto wird gespeichert' : (task.completed ? 'Erledigt' : 'Offen')}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function ChecklistSections({ groupedTasks, onToggle, disableToggle, photoUploadPending, pendingPhotoTaskId }) {
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
                disabled={disableToggle || (photoUploadPending && pendingPhotoTaskId === task._id)}
              >
                <div>
                  <strong>{task.title}</strong>
                  <p>{task.completed ? `Erledigt von ${task.completedByColleague || task.completedByUser}` : (task.needsPhoto ? 'Antippen zum Abhaken und Foto aufnehmen' : 'Antippen zum Abhaken')}</p>
                  <div className="task-meta">
                    {task.needsPhoto ? <span className="task-proof-badge">Foto erforderlich</span> : null}
                    {task.completionPhotoDataUrl ? <span className="task-proof-badge">Foto gespeichert</span> : null}
                  </div>
                  {task.completionPhotoDataUrl ? (
                    <img
                      className="task-photo-preview"
                      src={task.completionPhotoDataUrl}
                      alt={`Nachweis für ${task.title}`}
                    />
                  ) : null}
                </div>
                <span className="checkbox-indicator">{photoUploadPending && pendingPhotoTaskId === task._id ? 'Foto wird gespeichert' : (task.completed ? 'Erledigt' : 'Offen')}</span>
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
