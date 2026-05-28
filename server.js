const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');

require('dotenv').config();

const app = express();
const server = http.createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5001';
const PORT = Number(process.env.PORT || 5001);
const HOST = process.env.HOST || '::';
const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-checklist-secret';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/checklist';

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

const ROLES = {
  EMPLOYEE: 'employee',
  GENERAL_MANAGER: 'general_manager',
  OWNER: 'owner',
};

const AREA_KEYS = {
  DOWNSTAIRS: 'unten',
  BEER_GARDEN: 'biergarten',
};

const TEMPLATE_TYPES = {
  STANDARD: 'standard',
  OCCASIONAL: 'occasional',
};

const SCHEDULE_TYPES = {
  DAILY: 'daily',
  SELECTED_DAYS: 'selected_days',
  INTERVAL_WEEKS: 'interval_weeks',
  NEVER_DIRECT: 'never_direct',
};

const DEFAULT_USERS = [
  {
    username: 'general',
    password: '1425',
    displayName: 'General',
    role: ROLES.EMPLOYEE,
  },
  {
    username: 'Luisa',
    password: '2569',
    displayName: 'Luisa',
    role: ROLES.GENERAL_MANAGER,
  },
  {
    username: 'Fitzi',
    password: '0032',
    displayName: 'Fitzi',
    role: ROLES.OWNER,
  },
];

const DEFAULT_TEMPLATES = [
  { title: 'Besteck auffüllen', section: 'Oben', shiftType: 'closing' },
  { title: 'Servietten auffüllen', section: 'Oben', shiftType: 'closing' },
  { title: 'Besteck polieren', section: 'Oben', shiftType: 'closing' },
  { title: 'Kaffee Maschine sauber machen', section: 'Oben', shiftType: 'closing' },
  { title: 'Bar sauber machen', section: 'Oben', shiftType: 'closing' },
  { title: 'Leergut wegbringen', section: 'Oben', shiftType: 'closing' },
  { title: 'AFG auffüllen', section: 'Oben', shiftType: 'closing' },
  { title: 'Schnäpse auffüllen', section: 'Oben', shiftType: 'closing' },
  { title: 'Kerzen auffüllen', section: 'Oben', shiftType: 'closing' },
  { title: 'Bierdeckel auffüllen', section: 'Oben', shiftType: 'closing' },
  { title: 'Stühle hochstellen', section: 'Oben', shiftType: 'closing' },
  { title: 'Spülmaschine ausmachen', section: 'Oben', shiftType: 'closing' },
  { title: 'Spülmaschinenteile ausspülen', section: 'Oben', shiftType: 'closing' },
  { title: 'Aschenbecher / Mülleimer draußen', section: 'Oben', shiftType: 'closing' },
  { title: 'Kehren draußen', section: 'Oben', shiftType: 'closing' },
  { title: 'Fernseher ausmachen', section: 'Oben', shiftType: 'closing' },
  { title: 'Musik / Musikanlage / Computer ausmachen', section: 'Oben', shiftType: 'closing' },
  { title: 'Müll rausbringen', section: 'Oben', shiftType: 'closing' },
  { title: 'Abrechnung', section: 'Oben', shiftType: 'closing' },
  { title: 'Essensrestentsorgung', section: 'Oben', shiftType: 'closing' },
  { title: 'Küchentür zumachen', section: 'Oben', shiftType: 'closing' },
  { title: 'Ausloggen', section: 'Oben', shiftType: 'closing' },
  { title: 'Lichter ausmachen', section: 'Oben', shiftType: 'closing' },

  { title: 'Besteck auffüllen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Servietten auffüllen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Besteck polieren', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Bar sauber machen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Leergut wegbringen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'AFG auffüllen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Kerzen auffüllen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Bierdeckel auffüllen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Stühle hochstellen und Tische umkippen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Spülmaschine ausmachen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Spülmaschinenteile ausspülen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Fernseher ausmachen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Musik / Musikanlage / Computer ausmachen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Müll hochbringen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },
  { title: 'Lichter ausmachen', section: 'Unten', shiftType: 'closing', requiredArea: AREA_KEYS.DOWNSTAIRS },

  { title: 'Bestellung annehmen / verräumen', section: 'Oben', shiftType: 'closing', weekdays: [1] },
  { title: 'Lager Tür zumachen', section: 'Oben', shiftType: 'closing', weekdays: [1] },
  { title: 'Glas wegbringen', section: 'Oben', shiftType: 'closing', weekdays: [1] },

  { title: 'Wäsche hochbringen', section: 'Oben', shiftType: 'closing', weekdays: [2] },
  { title: 'Bestellung annehmen / verräumen', section: 'Oben', shiftType: 'closing', weekdays: [2] },
  { title: 'Lager Tür zumachen', section: 'Oben', shiftType: 'closing', weekdays: [2] },
  { title: 'Glas wegbringen', section: 'Oben', shiftType: 'closing', weekdays: [2] },

  { title: 'Jede 2 Wochen Besteckkrüge sauber machen', section: 'Oben', shiftType: 'closing', weekdays: [3] },

  { title: 'Leergut und Fässer ordentlich stapeln', section: 'Oben', shiftType: 'closing', weekdays: [4] },
  { title: 'Karten sauber machen', section: 'Oben', shiftType: 'closing', weekdays: [4] },
  { title: 'Glas wegbringen', section: 'Oben', shiftType: 'closing', weekdays: [4] },

  { title: 'Bestellung annehmen / verräumen', section: 'Oben', shiftType: 'closing', weekdays: [5] },
  { title: 'Lager Tür zumachen', section: 'Oben', shiftType: 'closing', weekdays: [5] },

  { title: 'Stangen polieren', section: 'Oben', shiftType: 'closing', weekdays: [6] },
  { title: 'Karten sauber machen', section: 'Oben', shiftType: 'closing', weekdays: [6] },
  { title: 'Leergut und Fässer ordentlich stapeln', section: 'Oben', shiftType: 'closing', weekdays: [6] },
];

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);
app.use(express.json());

io.on('connection', (socket) => {
  console.log(`Socket verbunden: ${socket.id}`);
});

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    displayName: { type: String, required: true, trim: true },
    role: { type: String, enum: Object.values(ROLES), required: true },
  },
  { timestamps: true }
);

const colleagueSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    active: { type: Boolean, default: true },
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

const taskTemplateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    section: { type: String, required: true, trim: true },
    shiftType: { type: String, required: true, trim: true },
    templateType: { type: String, enum: Object.values(TEMPLATE_TYPES), default: TEMPLATE_TYPES.STANDARD },
    requiredArea: { type: String, default: '' },
    scheduleType: { type: String, enum: Object.values(SCHEDULE_TYPES), default: SCHEDULE_TYPES.DAILY },
    scheduleDays: { type: [Number], default: [] },
    recurrenceIntervalWeeks: { type: Number, default: 2 },
    recurrenceAnchorDate: { type: String, default: '' },
    weekdays: { type: [Number], default: [] },
    active: { type: Boolean, default: true },
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

const taskCompletionEventSchema = new mongoose.Schema(
  {
    completed: { type: Boolean, required: true },
    changedAt: { type: Date, default: Date.now },
    colleagueName: { type: String, default: '' },
    actedByUser: { type: String, default: '' },
    actorRole: { type: String, default: '' },
  },
  { _id: false }
);

const checklistTaskSchema = new mongoose.Schema(
  {
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaskTemplate' },
    title: { type: String, required: true, trim: true },
    section: { type: String, required: true, trim: true },
    requiredArea: { type: String, default: '' },
    scheduleType: { type: String, default: SCHEDULE_TYPES.DAILY },
    scheduleDays: { type: [Number], default: [] },
    recurrenceIntervalWeeks: { type: Number, default: 2 },
    recurrenceAnchorDate: { type: String, default: '' },
    weekdays: { type: [Number], default: [] },
    included: { type: Boolean, default: true },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    completedByColleague: { type: String, default: '' },
    completedByUser: { type: String, default: '' },
    completionHistory: { type: [taskCompletionEventSchema], default: [] },
  },
  { timestamps: false }
);

const assignedColleagueSchema = new mongoose.Schema(
  {
    colleagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Colleague', default: null },
    name: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const areaUsageSchema = new mongoose.Schema(
  {
    untenUsed: { type: Boolean, default: null },
    biergartenUsed: { type: Boolean, default: null },
  },
  { _id: false }
);

const shiftSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, trim: true },
    shiftType: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['draft', 'active', 'completed'],
      default: 'draft',
    },
    openedByUser: { type: String, default: '' },
    openedByColleague: { type: String, default: '' },
    openedAt: { type: Date, default: null },
    areaUsage: { type: areaUsageSchema, default: () => ({ untenUsed: null, biergartenUsed: null }) },
    assignedColleagues: { type: [assignedColleagueSchema], default: [] },
    checklist: { type: [checklistTaskSchema], default: [] },
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

shiftSchema.index({ date: 1, shiftType: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);
const Colleague = mongoose.model('Colleague', colleagueSchema);
const TaskTemplate = mongoose.model('TaskTemplate', taskTemplateSchema);
const Shift = mongoose.model('Shift', shiftSchema);

function getBerlinDateString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getWeekdayNumber(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  return date.getUTCDay();
}

function getWeekStartTimestamp(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const day = date.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diffToMonday);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function createToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function isTaskIncluded(shift, taskLike) {
  const weekday = getWeekdayNumber(shift.date);
  const fallbackWeekdays = Array.isArray(taskLike.weekdays) ? taskLike.weekdays : [];
  const scheduleDays = Array.isArray(taskLike.scheduleDays) && taskLike.scheduleDays.length
    ? taskLike.scheduleDays
    : fallbackWeekdays;
  const scheduleType = taskLike.scheduleType || (scheduleDays.length ? SCHEDULE_TYPES.SELECTED_DAYS : SCHEDULE_TYPES.DAILY);

  if (scheduleType === SCHEDULE_TYPES.NEVER_DIRECT) {
    return false;
  }

  if (scheduleType === SCHEDULE_TYPES.SELECTED_DAYS && !scheduleDays.includes(weekday)) {
    return false;
  }

  if (scheduleType === SCHEDULE_TYPES.INTERVAL_WEEKS) {
    if (!scheduleDays.includes(weekday)) {
      return false;
    }

    const interval = Number(taskLike.recurrenceIntervalWeeks) > 0 ? Number(taskLike.recurrenceIntervalWeeks) : 2;
    const anchorDate = taskLike.recurrenceAnchorDate || shift.date;
    const weekDiff = Math.floor((getWeekStartTimestamp(shift.date) - getWeekStartTimestamp(anchorDate)) / (7 * 24 * 60 * 60 * 1000));

    if (weekDiff < 0 || weekDiff % interval !== 0) {
      return false;
    }
  }

  if (taskLike.requiredArea === AREA_KEYS.DOWNSTAIRS) {
    return shift.areaUsage?.untenUsed === true;
  }

  if (taskLike.requiredArea === AREA_KEYS.BEER_GARDEN) {
    return shift.areaUsage?.biergartenUsed === true;
  }

  return true;
}

function sanitizeShift(shift) {
  const record = shift.toObject ? shift.toObject() : shift;
  refreshShiftChecklist(record);

  const includedTasks = record.checklist.filter((task) => task.included !== false);
  const completedTasks = includedTasks.filter((task) => task.completed).length;

  record.visibleTaskCount = includedTasks.length;
  record.completionRate = includedTasks.length
    ? Math.round((completedTasks / includedTasks.length) * 100)
    : 0;

  return record;
}

function refreshShiftChecklist(shift) {
  shift.checklist = shift.checklist.map((task) => {
    const record = task.toObject?.() || task;
    if (record.manual) {
      return {
        ...record,
        included: record.included !== false,
      };
    }

    return {
      ...record,
      included: isTaskIncluded(shift, record),
    };
  });
}

function buildChecklistFromTemplates(templateDocs, existingShift) {
  const existingByTemplate = new Map(
    (existingShift?.checklist || [])
      .filter((task) => task.templateId)
      .map((task) => [task.templateId.toString(), task])
  );

  return templateDocs.map((template) => {
    const existingTask = existingByTemplate.get(template._id.toString());
    const included = existingTask
      ? existingTask.included
      : isTaskIncluded(existingShift || { date: getBerlinDateString(), areaUsage: { untenUsed: null, biergartenUsed: null } }, template);
    const baseTask = {
      templateId: template._id,
      title: template.title,
      section: template.section,
      requiredArea: template.requiredArea || '',
      scheduleType: template.scheduleType || SCHEDULE_TYPES.DAILY,
      scheduleDays: template.scheduleDays || [],
      recurrenceIntervalWeeks: template.recurrenceIntervalWeeks || 2,
      recurrenceAnchorDate: template.recurrenceAnchorDate || '',
      weekdays: template.weekdays || [],
      included,
    };

    if (existingTask) {
      return {
        _id: existingTask._id,
        ...baseTask,
        completed: existingTask.completed,
        completedAt: existingTask.completedAt,
        completedByColleague: existingTask.completedByColleague,
        completedByUser: existingTask.completedByUser,
        completionHistory: existingTask.completionHistory,
      };
    }

    return {
      ...baseTask,
      completed: false,
      completedAt: null,
      completedByColleague: '',
      completedByUser: '',
      completionHistory: [],
    };
  });
}

async function seedDefaults() {
  for (const defaultUser of DEFAULT_USERS) {
    await User.findOneAndUpdate(
      { username: defaultUser.username },
      defaultUser,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const colleagueCount = await Colleague.countDocuments();
  if (colleagueCount === 0) {
    await Colleague.insertMany([
      { name: 'Luisa', createdBy: 'system', updatedBy: 'system' },
      { name: 'Fitzi', createdBy: 'system', updatedBy: 'system' },
    ]);
  }

  const templateCollection = mongoose.connection.db.collection('tasktemplates');
  await templateCollection.deleteMany({ createdBy: 'system' });
  await templateCollection.insertMany(
    DEFAULT_TEMPLATES.map((template) => ({
      ...template,
      templateType: template.templateType || TEMPLATE_TYPES.STANDARD,
      active: true,
      createdBy: 'system',
      updatedBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Anmeldung erforderlich' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Sitzung abgelaufen oder ungültig' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Keine Berechtigung für diese Aktion' });
    }
    return next();
  };
}

async function updateShiftStatus(shift) {
  refreshShiftChecklist(shift);
  const includedTasks = shift.checklist.filter((task) => task.included !== false);
  const allCompleted = includedTasks.length > 0 && includedTasks.every((task) => task.completed);
  const anyOpened = Boolean(shift.openedAt || shift.assignedColleagues.length);

  if (allCompleted) {
    shift.status = 'completed';
  } else if (anyOpened) {
    shift.status = 'active';
  } else {
    shift.status = 'draft';
  }

  await shift.save();
  return shift;
}

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    await seedDefaults();
    console.log('MongoDB connected successfully');
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  });

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich' });
  }

  const user = await User.findOne({ username: username.trim() });
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Ungültige Zugangsdaten' });
  }

  return res.json({
    token: createToken(user),
    user: {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
  });
});

app.get('/api/session', authenticate, async (req, res) => {
  const user = await User.findById(req.user.sub).lean();
  if (!user) {
    return res.status(401).json({ error: 'Benutzer existiert nicht mehr' });
  }

  return res.json({
    user: {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
    today: getBerlinDateString(),
  });
});

app.get('/api/colleagues', authenticate, async (_req, res) => {
  const colleagues = await Colleague.find().sort({ active: -1, name: 1 }).lean();
  return res.json(colleagues);
});

app.post('/api/colleagues', authenticate, requireRole(ROLES.GENERAL_MANAGER, ROLES.OWNER), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name ist erforderlich' });
  }

  const normalizedName = name.trim();
  const existing = await Colleague.findOne({ name: normalizedName });
  if (existing) {
    return res.status(409).json({ error: 'Diese Person existiert bereits' });
  }

  const colleague = await Colleague.create({
    name: normalizedName,
    createdBy: req.user.displayName,
    updatedBy: req.user.displayName,
  });

  return res.status(201).json(colleague);
});

app.put('/api/colleagues/:id', authenticate, requireRole(ROLES.GENERAL_MANAGER, ROLES.OWNER), async (req, res) => {
  const payload = { updatedBy: req.user.displayName };
  if (typeof req.body.name === 'string' && req.body.name.trim()) {
    payload.name = req.body.name.trim();
  }
  if (typeof req.body.active === 'boolean') {
    payload.active = req.body.active;
  }

  const updated = await Colleague.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
  if (!updated) {
    return res.status(404).json({ error: 'Kollege nicht gefunden' });
  }

  return res.json(updated);
});

app.get('/api/templates', authenticate, async (req, res) => {
  const query = req.user.role === ROLES.EMPLOYEE ? { active: true } : {};
  const templates = await TaskTemplate.find(query).sort({ section: 1, title: 1 }).lean();
  return res.json(templates);
});

app.post('/api/templates', authenticate, requireRole(ROLES.GENERAL_MANAGER), async (req, res) => {
  const { title, section, shiftType, requiredArea, weekdays, templateType, scheduleType, scheduleDays, recurrenceIntervalWeeks } = req.body;

  if (![title, shiftType].every((value) => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ error: 'Titel und Checklistenart sind erforderlich' });
  }

  const normalizedScheduleDays = Array.isArray(scheduleDays)
    ? scheduleDays.map((value) => Number(value)).filter((value) => Number.isInteger(value))
    : [];
  const normalizedWeekdays = Array.isArray(weekdays)
    ? weekdays.map((value) => Number(value)).filter((value) => Number.isInteger(value))
    : [];

  const effectiveTemplateType = Object.values(TEMPLATE_TYPES).includes(templateType) ? templateType : TEMPLATE_TYPES.STANDARD;
  const effectiveScheduleType = effectiveTemplateType === TEMPLATE_TYPES.OCCASIONAL
    ? SCHEDULE_TYPES.NEVER_DIRECT
    : (Object.values(SCHEDULE_TYPES).includes(scheduleType) ? scheduleType : SCHEDULE_TYPES.DAILY);

  const template = await TaskTemplate.create({
    title: title.trim(),
    section: typeof section === 'string' ? section.trim() : '',
    shiftType: shiftType.trim(),
    templateType: effectiveTemplateType,
    requiredArea: typeof requiredArea === 'string' ? requiredArea : '',
    scheduleType: effectiveScheduleType,
    scheduleDays: effectiveScheduleType === SCHEDULE_TYPES.NEVER_DIRECT ? [] : normalizedScheduleDays,
    recurrenceIntervalWeeks: Number(recurrenceIntervalWeeks) > 0 ? Number(recurrenceIntervalWeeks) : 2,
    recurrenceAnchorDate: getBerlinDateString(),
    weekdays: effectiveScheduleType === SCHEDULE_TYPES.NEVER_DIRECT ? [] : normalizedWeekdays,
    createdBy: req.user.displayName,
    updatedBy: req.user.displayName,
  });

  return res.status(201).json(template);
});

app.put('/api/templates/:id', authenticate, requireRole(ROLES.GENERAL_MANAGER), async (req, res) => {
  const payload = {
    updatedBy: req.user.displayName,
  };

  if (typeof req.body.title === 'string' && req.body.title.trim()) {
    payload.title = req.body.title.trim();
  }
  if (typeof req.body.section === 'string') {
    payload.section = req.body.section.trim();
  }
  if (typeof req.body.shiftType === 'string' && req.body.shiftType.trim()) {
    payload.shiftType = req.body.shiftType.trim();
  }
  if (typeof req.body.templateType === 'string' && Object.values(TEMPLATE_TYPES).includes(req.body.templateType)) {
    payload.templateType = req.body.templateType;
    if (req.body.templateType === TEMPLATE_TYPES.OCCASIONAL) {
      payload.scheduleType = SCHEDULE_TYPES.NEVER_DIRECT;
      payload.scheduleDays = [];
      payload.weekdays = [];
    }
  }
  if (typeof req.body.requiredArea === 'string') {
    payload.requiredArea = req.body.requiredArea;
  }
  if (typeof req.body.scheduleType === 'string' && Object.values(SCHEDULE_TYPES).includes(req.body.scheduleType)) {
    payload.scheduleType = req.body.scheduleType;
    if (req.body.scheduleType === SCHEDULE_TYPES.NEVER_DIRECT) {
      payload.scheduleDays = [];
      payload.weekdays = [];
    }
  }
  if (Array.isArray(req.body.scheduleDays) && payload.scheduleType !== SCHEDULE_TYPES.NEVER_DIRECT) {
    payload.scheduleDays = req.body.scheduleDays
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));
  }
  if (Number(req.body.recurrenceIntervalWeeks) > 0) {
    payload.recurrenceIntervalWeeks = Number(req.body.recurrenceIntervalWeeks);
  }
  if (Array.isArray(req.body.weekdays) && payload.scheduleType !== SCHEDULE_TYPES.NEVER_DIRECT) {
    payload.weekdays = req.body.weekdays
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));
  }
  if (typeof req.body.active === 'boolean') {
    payload.active = req.body.active;
  }

  const template = await TaskTemplate.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
  if (!template) {
    return res.status(404).json({ error: 'Vorlage nicht gefunden' });
  }

  return res.json(template);
});

app.delete('/api/templates/:id', authenticate, requireRole(ROLES.GENERAL_MANAGER), async (req, res) => {
  const deleted = await TaskTemplate.findByIdAndDelete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Vorlage nicht gefunden' });
  }
  return res.status(204).send();
});

app.get('/api/shifts', authenticate, async (req, res) => {
  const requestedDate = req.query.date || getBerlinDateString();
  const query = { date: requestedDate };

  if (req.user.role === ROLES.EMPLOYEE && requestedDate !== getBerlinDateString()) {
    return res.status(403).json({ error: 'Mitarbeiter dürfen nur die heutige Checkliste sehen' });
  }

  if (req.query.shiftType) {
    query.shiftType = req.query.shiftType;
  }

  const shifts = await Shift.find(query).sort({ shiftType: 1 }).lean();
  return res.json(shifts.map(sanitizeShift));
});

app.post('/api/shifts', authenticate, requireRole(ROLES.GENERAL_MANAGER), async (req, res) => {
  const { date, shiftType, templateIds } = req.body;

  if (!date || !shiftType) {
    return res.status(400).json({ error: 'Datum und Checklistenart sind erforderlich' });
  }

  const templateQuery = Array.isArray(templateIds) && templateIds.length
    ? { _id: { $in: templateIds } }
    : { shiftType, active: true, templateType: TEMPLATE_TYPES.STANDARD };
  const templates = await TaskTemplate.find(templateQuery).sort({ section: 1, title: 1 });

  if (!templates.length) {
    return res.status(400).json({ error: 'Für diese Checkliste wurden keine Aufgaben gefunden' });
  }

  let shift = await Shift.findOne({ date, shiftType });
  if (!shift) {
    shift = new Shift({
      date,
      shiftType,
      createdBy: req.user.displayName,
      updatedBy: req.user.displayName,
    });
  }

  shift.checklist = buildChecklistFromTemplates(templates, shift);
  shift.updatedBy = req.user.displayName;

  await updateShiftStatus(shift);
  io.emit('shiftUpdated', sanitizeShift(shift));

  return res.status(201).json(sanitizeShift(shift));
});

app.post('/api/shifts/:id/tasks', authenticate, requireRole(ROLES.GENERAL_MANAGER), async (req, res) => {
  const shift = await Shift.findById(req.params.id);
  if (!shift) {
    return res.status(404).json({ error: 'Checkliste nicht gefunden' });
  }

  const { source, templateId, title, section } = req.body;

  if (source === 'pool') {
    if (!templateId) {
      return res.status(400).json({ error: 'Bitte eine Aufgabe aus dem Pool auswählen' });
    }

    const template = await TaskTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Pool-Aufgabe nicht gefunden' });
    }

    shift.checklist.push({
      templateId: template._id,
      title: template.title,
      section: template.section,
      requiredArea: template.requiredArea || '',
      scheduleType: template.scheduleType || SCHEDULE_TYPES.DAILY,
      scheduleDays: template.scheduleDays || [],
      weekdays: template.weekdays || [],
      included: true,
      manual: true,
      completed: false,
      completedAt: null,
      completedByColleague: '',
      completedByUser: '',
      completionHistory: [],
    });
  } else if (source === 'one_time') {
    if (!title || !title.trim() || !section || !section.trim()) {
      return res.status(400).json({ error: 'Bitte Titel und Bereich für die einmalige Aufgabe angeben' });
    }

    shift.checklist.push({
      title: title.trim(),
      section: section.trim(),
      requiredArea: '',
      weekdays: [],
      included: true,
      manual: true,
      completed: false,
      completedAt: null,
      completedByColleague: '',
      completedByUser: '',
      completionHistory: [],
    });
  } else {
    return res.status(400).json({ error: 'Ungültiger Aufgabentyp' });
  }

  shift.updatedBy = req.user.displayName;

  await updateShiftStatus(shift);
  io.emit('shiftUpdated', sanitizeShift(shift));

  return res.status(201).json(sanitizeShift(shift));
});

app.put('/api/shifts/:id/usage', authenticate, async (req, res) => {
  const shift = await Shift.findById(req.params.id);
  if (!shift) {
    return res.status(404).json({ error: 'Checkliste nicht gefunden' });
  }

  if (req.user.role === ROLES.EMPLOYEE && shift.date !== getBerlinDateString()) {
    return res.status(403).json({ error: 'Mitarbeiter dürfen nur die heutige Checkliste bearbeiten' });
  }

  if (typeof req.body.untenUsed !== 'boolean' || typeof req.body.biergartenUsed !== 'boolean') {
    return res.status(400).json({ error: 'Bitte unten und Biergarten jeweils mit Ja oder Nein beantworten' });
  }

  shift.areaUsage = {
    untenUsed: req.body.untenUsed,
    biergartenUsed: req.body.biergartenUsed,
  };
  shift.updatedBy = req.user.displayName;

  await updateShiftStatus(shift);
  io.emit('shiftUpdated', sanitizeShift(shift));

  return res.json(sanitizeShift(shift));
});

app.put('/api/shifts/:id/roster', authenticate, requireRole(ROLES.GENERAL_MANAGER, ROLES.OWNER), async (req, res) => {
  const shift = await Shift.findById(req.params.id);
  if (!shift) {
    return res.status(404).json({ error: 'Checkliste nicht gefunden' });
  }

  const colleagues = await Colleague.find({ _id: { $in: req.body.colleagueIds || [] } }).lean();
  shift.assignedColleagues = colleagues.map((colleague) => ({
    colleagueId: colleague._id,
    name: colleague.name,
  }));
  shift.updatedBy = req.user.displayName;

  await updateShiftStatus(shift);
  io.emit('shiftUpdated', sanitizeShift(shift));

  return res.json(sanitizeShift(shift));
});

app.post('/api/shifts/:id/open', authenticate, async (req, res) => {
  const shift = await Shift.findById(req.params.id);
  if (!shift) {
    return res.status(404).json({ error: 'Checkliste nicht gefunden' });
  }

  if (req.user.role === ROLES.EMPLOYEE && shift.date !== getBerlinDateString()) {
    return res.status(403).json({ error: 'Mitarbeiter dürfen nur die heutige Checkliste öffnen' });
  }

  if (!shift.assignedColleagues.length) {
    const colleagueIds = req.body.colleagueIds || [];
    if (!Array.isArray(colleagueIds) || !colleagueIds.length) {
      return res.status(400).json({ error: 'Die erste Person muss markieren, wer diese Schicht gearbeitet hat' });
    }

    const colleagues = await Colleague.find({ _id: { $in: colleagueIds }, active: true }).lean();
    if (!colleagues.length) {
      return res.status(400).json({ error: 'Es wurden keine gültigen Kollegen ausgewählt' });
    }

    shift.assignedColleagues = colleagues.map((colleague) => ({
      colleagueId: colleague._id,
      name: colleague.name,
    }));
    shift.openedAt = shift.openedAt || new Date();
    shift.openedByUser = shift.openedByUser || req.user.displayName;
    shift.openedByColleague = shift.openedByColleague || colleagues[0].name;
    shift.updatedBy = req.user.displayName;

    await updateShiftStatus(shift);
    io.emit('shiftUpdated', sanitizeShift(shift));
  }

  return res.json(sanitizeShift(shift));
});

app.put('/api/shifts/:shiftId/tasks/:taskId', authenticate, async (req, res) => {
  const shift = await Shift.findById(req.params.shiftId);
  if (!shift) {
    return res.status(404).json({ error: 'Checkliste nicht gefunden' });
  }

  if (req.user.role === ROLES.EMPLOYEE && shift.date !== getBerlinDateString()) {
    return res.status(403).json({ error: 'Mitarbeiter dürfen nur die heutige Checkliste bearbeiten' });
  }

  const task = shift.checklist.id(req.params.taskId);
  if (!task) {
    return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
  }

  if (task.included === false) {
    return res.status(400).json({ error: 'Diese Aufgabe ist für den heutigen Bereich nicht aktiv' });
  }

  if (req.user.role === ROLES.EMPLOYEE) {
    const allowed = shift.assignedColleagues.some((colleague) => colleague.name === req.body.colleagueName);
    if (!allowed) {
      return res.status(400).json({ error: 'Bitte einen Kollegen aus dieser Schicht auswählen' });
    }
  }

  task.completed = Boolean(req.body.completed);
  task.completedAt = req.body.completed ? new Date() : null;
  task.completedByColleague = req.body.completed ? req.body.colleagueName || '' : '';
  task.completedByUser = req.body.completed ? req.user.displayName : '';
  task.completionHistory.push({
    completed: Boolean(req.body.completed),
    changedAt: new Date(),
    colleagueName: req.body.colleagueName || '',
    actedByUser: req.user.displayName,
    actorRole: req.user.role,
  });

  shift.updatedBy = req.user.displayName;

  await updateShiftStatus(shift);
  io.emit('shiftUpdated', sanitizeShift(shift));

  return res.json(sanitizeShift(shift));
});

app.get('/api/reports/overview', authenticate, requireRole(ROLES.GENERAL_MANAGER, ROLES.OWNER), async (req, res) => {
  const from = req.query.from || `${getBerlinDateString().slice(0, 8)}01`;
  const to = req.query.to || getBerlinDateString();

  const shifts = await Shift.find({
    date: {
      $gte: from,
      $lte: to,
    },
  })
    .sort({ date: -1, shiftType: 1 })
    .lean();

  const colleagueStats = new Map();
  for (const shift of shifts) {
    for (const task of shift.checklist || []) {
      if (task.included === false || !task.completedByColleague || !task.completed) {
        continue;
      }

      const current = colleagueStats.get(task.completedByColleague) || {
        completedTasks: 0,
        lastCompletedAt: null,
      };

      current.completedTasks += 1;
      current.lastCompletedAt = task.completedAt || current.lastCompletedAt;
      colleagueStats.set(task.completedByColleague, current);
    }
  }

  return res.json({
    shifts: shifts.map(sanitizeShift),
    summary: {
      totalShifts: shifts.length,
      completedShifts: shifts.filter((shift) => shift.status === 'completed').length,
      activeShifts: shifts.filter((shift) => shift.status === 'active').length,
    },
    employeeActivity: Array.from(colleagueStats.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.completedTasks - a.completedTasks),
  });
});

app.use(express.static(path.join(__dirname, 'build')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

server
  .listen({
    port: PORT,
    host: HOST,
    ipv6Only: false,
  }, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`IPv4 access: http://127.0.0.1:${PORT}`);
  })
  .on('error', (error) => {
    console.error(`Failed to start server on port ${PORT}:`, error.message);
    process.exit(1);
  });
