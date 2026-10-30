const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'location_history.json');
const RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache of unique student history entries
// Keyed by unique student: `${name.toLowerCase()}___${semester.toLowerCase()}`
let historyCache = [];

// Ensure data directory exists
function initStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      historyCache = JSON.parse(data || '[]');
      cleanupOldRecords();
    } else {
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
    }
  } catch (err) {
    console.error('Error initializing history store:', err);
    historyCache = [];
  }
}

// Save in-memory cache to disk
function persistToDisk() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(historyCache, null, 2));
  } catch (err) {
    console.error('Error writing history to disk:', err);
  }
}

// Remove records older than 24 hours (based on last updated/disconnected timestamp)
function cleanupOldRecords() {
  const cutoff = Date.now() - RETENTION_MS;
  const initialLength = historyCache.length;
  historyCache = historyCache.filter((item) => new Date(item.timestamp).getTime() > cutoff);
  if (historyCache.length !== initialLength) {
    persistToDisk();
  }
}

function getStudentKey(name, semester) {
  return `${(name || 'Unknown').trim().toLowerCase()}___${(semester || 'Unspecified').trim().toLowerCase()}`;
}

// When a student sends location:
// - If already exists for this (name, semester), update location in place and set status to 'connected'.
// - If reconnecting after previous disconnect, previous history is refreshed with new session start.
function updateOrAddStudentLocation({ name, semester, lat, lng, socketId }) {
  cleanupOldRecords();

  const studentName = (name || 'Anonymous Student').trim();
  const studentSem = (semester || 'Unspecified').trim();
  const key = getStudentKey(studentName, studentSem);
  const nowISO = new Date().toISOString();

  const existingIndex = historyCache.findIndex(item => item.studentKey === key);

  let record;
  if (existingIndex !== -1) {
    // Student exists: update single row
    record = {
      ...historyCache[existingIndex],
      name: studentName,
      semester: studentSem,
      lat: Number(lat),
      lng: Number(lng),
      socketId: socketId || historyCache[existingIndex].socketId,
      status: 'connected',
      disconnectedAt: null,
      timestamp: nowISO // Refreshes last active timestamp
    };
    // Move to front so newest active is at top
    historyCache.splice(existingIndex, 1);
    historyCache.unshift(record);
  } else {
    // New student entry
    record = {
      id: `student_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      studentKey: key,
      name: studentName,
      semester: studentSem,
      lat: Number(lat),
      lng: Number(lng),
      socketId: socketId || '',
      status: 'connected',
      firstConnectedAt: nowISO,
      disconnectedAt: null,
      timestamp: nowISO
    };
    historyCache.unshift(record);
  }

  persistToDisk();
  return record;
}

// When student disconnects or stops tracking:
// Freeze their last known coordinates and mark as 'disconnected' for 24 hours
function markStudentDisconnected(socketId) {
  cleanupOldRecords();

  const nowISO = new Date().toISOString();
  let updatedRecord = null;

  historyCache = historyCache.map(item => {
    if (item.socketId === socketId && item.status === 'connected') {
      updatedRecord = {
        ...item,
        status: 'disconnected',
        disconnectedAt: nowISO,
        timestamp: nowISO // 24-hour countdown starts from disconnect time
      };
      return updatedRecord;
    }
    return item;
  });

  if (updatedRecord) {
    persistToDisk();
  }
  return updatedRecord;
}

// Retrieve unique student history records
function getHistory({ search = '', semester = '' } = {}) {
  cleanupOldRecords();

  let results = [...historyCache];

  if (search) {
    const s = search.toLowerCase();
    results = results.filter(item => 
      item.name.toLowerCase().includes(s) || 
      item.semester.toLowerCase().includes(s)
    );
  }

  if (semester && semester !== 'all') {
    results = results.filter(item => 
      item.semester.toLowerCase() === semester.toLowerCase()
    );
  }

  return results;
}

// Get summary stats for dashboard
function getStats() {
  cleanupOldRecords();

  const activeNow = historyCache.filter(item => item.status === 'connected').length;
  const disconnected = historyCache.filter(item => item.status === 'disconnected').length;
  const semesters = new Set();

  historyCache.forEach(item => {
    if (item.semester && item.semester !== 'Unspecified') {
      semesters.add(item.semester);
    }
  });

  return {
    totalStudents: historyCache.length,
    activeNow,
    disconnected,
    semesters: Array.from(semesters)
  };
}

// Run cleanup every 15 minutes
setInterval(cleanupOldRecords, 15 * 60 * 1000);

// Initialize on require
initStore();

module.exports = {
  updateOrAddStudentLocation,
  markStudentDisconnected,
  getHistory,
  getStats,
  cleanupOldRecords
};
