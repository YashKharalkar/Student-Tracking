import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { io } from 'socket.io-client';
import { Link, useNavigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet default icon issue in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconRetinaUrl: iconRetina,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom highlight marker for selected history inspection
const highlightIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34]
});

// A child component to adjust map bounds to fit markers
function MapBoundsUpdater({ students }) {
  const map = useMap();
  useEffect(() => {
    const studentList = Object.values(students);
    if (studentList.length > 0) {
      const bounds = L.latLngBounds(studentList.map(s => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
    }
  }, [students, map]);
  return null;
}

// Center controller for single coordinate modal
function MapCenterController({ center, zoom = 16 }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
      setTimeout(() => map.invalidateSize(), 200);
    }
  }, [center, zoom, map]);
  return null;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('live'); // 'live' | 'history'
  const [students, setStudents] = useState({});
  const [socketConnected, setSocketConnected] = useState(false);

  // History State
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStats, setHistoryStats] = useState({ totalStudents: 0, activeNow: 0, disconnected: 0, semesters: [] });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('all');

  // Modal / Inspector State
  const [inspectLocation, setInspectLocation] = useState(null);

  // Fetch 24-hour history from API
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const query = new URLSearchParams();
      if (searchTerm.trim()) query.set('search', searchTerm.trim());
      if (selectedSemester !== 'all') query.set('semester', selectedSemester);

      const [histRes, statsRes] = await Promise.all([
        fetch(`/api/history?${query.toString()}`),
        fetch('/api/history/stats')
      ]);

      if (histRes.ok) {
        const histData = await histRes.json();
        setHistoryLogs(histData.data || []);
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setHistoryStats(statsData.data || { totalStudents: 0, activeNow: 0, disconnected: 0, semesters: [] });
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Socket.IO Setup
  useEffect(() => {
    const socket = io();

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('joinAdmin');
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('initialStudents', (data) => {
      setStudents(data);
    });

    socket.on('studentLocationUpdate', (studentData) => {
      setStudents((prev) => ({
        ...prev,
        [studentData.socketId]: studentData,
      }));
    });

    socket.on('studentDisconnected', (socketId) => {
      setStudents((prev) => {
        const newStudents = { ...prev };
        delete newStudents[socketId];
        return newStudents;
      });
    });

    // Real-time notification when a student's history record is updated/added/disconnected
    socket.on('historyUpdated', (updatedStudent) => {
      setHistoryLogs((prev) => {
        const index = prev.findIndex(item => item.studentKey === updatedStudent.studentKey);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = updatedStudent;
          return updated;
        }
        return [updatedStudent, ...prev];
      });

      // Refresh summary counts
      setHistoryStats((prev) => {
        const isActive = updatedStudent.status === 'connected';
        return {
          ...prev,
          totalStudents: prev.totalStudents + (prev.historyLogs?.some(i => i.studentKey === updatedStudent.studentKey) ? 0 : 1),
          activeNow: isActive ? prev.activeNow + 1 : Math.max(0, prev.activeNow - 1),
          disconnected: !isActive ? prev.disconnected + 1 : Math.max(0, prev.disconnected - 1)
        };
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetch history when switching to History Tab or filters change
  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, selectedSemester]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchHistory();
  };

  const handleOpenLocationMap = (studentItem) => {
    setInspectLocation(studentItem);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminAuth');
    navigate('/admin-login');
  };

  const formatTimestamp = (isoString) => {
    if (!isoString) return { full: 'N/A', relative: '' };
    const date = new Date(isoString);
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    let relative = '';
    if (diffSec < 60) relative = `${diffSec}s ago`;
    else if (diffSec < 3600) relative = `${Math.floor(diffSec / 60)}m ago`;
    else relative = `${Math.floor(diffSec / 3600)}h ago`;

    return { full: `${dateStr}, ${timeStr}`, relative };
  };

  const defaultCenter = [18.5204, 73.8567]; // Default map center

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-100 font-sans">
      
      {/* Top Navbar */}
      <header className="bg-slate-800/90 backdrop-blur-md border-b border-slate-700/80 px-6 py-3 flex items-center justify-between z-30 shadow-lg shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 text-white font-bold text-lg">
              CT
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-white tracking-tight flex items-center gap-2">
                Campus Trace <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">Admin Console</span>
              </h1>
              <p className="text-xs text-slate-400">Live GPS & 24h Disconnect Location History</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center bg-slate-900/60 p-1 rounded-xl border border-slate-700/60">
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'live'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Map
              <span className="bg-blue-900/60 text-blue-200 text-[10px] px-2 py-0.5 rounded-full ml-1 font-bold">
                {Object.keys(students).length}/80
              </span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              24h History
              {historyLogs.length > 0 && (
                <span className="bg-slate-700 text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full ml-1 font-bold">
                  {historyLogs.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Right side status & Logout */}
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1 text-xs font-medium rounded-full flex items-center gap-2 border ${
            socketConnected 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}>
            <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`}></span>
            {socketConnected ? 'Server Live' : 'Disconnected'}
          </div>

          <button
            onClick={handleLogout}
            className="text-xs text-slate-400 hover:text-rose-400 font-medium py-1.5 px-3 rounded-lg hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all flex items-center gap-1.5"
            title="Logout"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden">
        
        {/* ================= TAB 1: LIVE MAP ================= */}
        {activeTab === 'live' && (
          <div className="h-full w-full relative">
            {Object.keys(students).length === 0 && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[1000] bg-slate-800/95 backdrop-blur-md p-5 rounded-2xl shadow-2xl border border-slate-700 text-center max-w-sm">
                <div className="w-12 h-12 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 mb-3 animate-bounce">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white mb-1">No Active Students</h3>
                <p className="text-xs text-slate-400 mb-4">Open the student tracker on your phone to transmit live GPS coordinates.</p>
                <Link
                  to="/tracker"
                  target="_blank"
                  className="inline-flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl shadow-lg transition-all"
                >
                  Launch Student Portal
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </Link>
              </div>
            )}

            {/* Live Student Count Overlay Card */}
            <div className="absolute bottom-6 left-6 z-[1000] bg-slate-800/90 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-slate-700/80 flex items-center gap-3">
              <div className="w-14 h-9 px-2 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                {Object.keys(students).length}/80
              </div>
              <div className="text-xs">
                <div className="font-bold text-white">Active Transmissions</div>
                <div className="text-slate-400 text-[11px]">80 Max Capacity Limit</div>
              </div>
            </div>

            <MapContainer
              center={defaultCenter}
              zoom={13}
              scrollWheelZoom={true}
              className="h-full w-full outline-none z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {Object.values(students).map((s) => (
                <Marker key={s.socketId} position={[s.lat, s.lng]}>
                  <Popup className="rounded-xl shadow-lg">
                    <div className="p-1 min-w-[170px]">
                      <div className="flex items-center justify-between pb-1 border-b border-gray-100 mb-2">
                        <span className="font-bold text-gray-900 text-sm">{s.name}</span>
                        <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
                          {s.semester || 'Sem N/A'}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-gray-600">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Lat:</span>
                          <span className="font-mono">{s.lat.toFixed(5)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Lng:</span>
                          <span className="font-mono">{s.lng.toFixed(5)}</span>
                        </div>
                        <div className="mt-2 text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          Live Broadcasting
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
              <MapBoundsUpdater students={students} />
            </MapContainer>
          </div>
        )}

        {/* ================= TAB 2: 24-HOUR HISTORY ================= */}
        {activeTab === 'history' && (
          <div className="h-full w-full overflow-y-auto p-6 flex flex-col gap-6 max-w-7xl mx-auto">
            
            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex items-center justify-between shadow-md">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Students Tracked</p>
                  <p className="text-2xl font-black text-white mt-1">
                    {historyLogs.length}
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>

              <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex items-center justify-between shadow-md">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Active vs Disconnected</p>
                  <div className="flex items-center gap-3 mt-1 text-sm font-bold">
                    <span className="text-emerald-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      {historyLogs.filter(i => i.status === 'connected').length}/80 Active
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-300">
                      {historyLogs.filter(i => i.status === 'disconnected').length} Disconnected
                    </span>
                  </div>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>

              <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex items-center justify-between shadow-md">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">24h History Rule</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs bg-purple-500/20 text-purple-300 font-bold px-2 py-0.5 rounded-full border border-purple-500/30">
                      Last Disconnect Kept 24h
                    </span>
                  </div>
                </div>
                <div className="w-11 h-11 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col md:flex-row gap-3 items-center justify-between shadow-md">
              <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
                <div className="relative flex-1">
                  <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by student name or semester..."
                    className="w-full bg-slate-900/90 text-sm text-slate-100 pl-10 pr-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-2.5 px-4 rounded-xl transition-all shadow-md shrink-0"
                >
                  Search
                </button>
              </form>

              <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                <select
                  value={selectedSemester}
                  onChange={(e) => setSelectedSemester(e.target.value)}
                  className="bg-slate-900/90 text-sm text-slate-100 px-3.5 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="all">All Semesters</option>
                  {historyStats.semesters && historyStats.semesters.map(sem => (
                    <option key={sem} value={sem}>{sem}</option>
                  ))}
                  <option value="Semester 1">Semester 1</option>
                  <option value="Semester 2">Semester 2</option>
                  <option value="Semester 3">Semester 3</option>
                  <option value="Semester 4">Semester 4</option>
                  <option value="Semester 5">Semester 5</option>
                  <option value="Semester 6">Semester 6</option>
                  <option value="Semester 7">Semester 7</option>
                  <option value="Semester 8">Semester 8</option>
                </select>

                <button
                  onClick={fetchHistory}
                  disabled={historyLoading}
                  className="p-2.5 bg-slate-900/90 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-all"
                  title="Refresh History"
                >
                  <svg className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            {/* History Table Card */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl overflow-hidden shadow-xl flex-1 flex flex-col">
              <div className="px-6 py-4 border-b border-slate-700/80 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-base">Student Locations (1 Row Per Student)</h3>
                  <p className="text-xs text-slate-400">Shows live location when connected, or the exact spot where student disconnected (kept for 24h).</p>
                </div>
                <span className="text-xs bg-slate-900 text-slate-400 px-3 py-1 rounded-full border border-slate-700 font-medium">
                  {historyLogs.length} Unique Student{historyLogs.length === 1 ? '' : 's'}
                </span>
              </div>

              {historyLoading ? (
                <div className="p-12 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Loading history records...</span>
                </div>
              ) : historyLogs.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
                  <svg className="w-12 h-12 text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-base font-semibold text-slate-300">No Student Records Found</p>
                  <p className="text-xs text-slate-500 max-w-sm">When students share location, each unique student will have a clean single row with their current or last disconnected location.</p>
                </div>
              ) : (
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider font-semibold text-[11px] border-b border-slate-700">
                      <tr>
                        <th className="px-6 py-3.5">Student Name</th>
                        <th className="px-6 py-3.5">College Semester</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5">Last Seen / Disconnected</th>
                        <th className="px-6 py-3.5 text-center">Location (Coordinates)</th>
                        <th className="px-6 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {historyLogs.map((log) => {
                        const time = formatTimestamp(log.timestamp);
                        const isConnected = log.status === 'connected';

                        return (
                          <tr key={log.id || log.studentKey} className="hover:bg-slate-700/40 transition-colors group">
                            {/* Student Name */}
                            <td className="px-6 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center shadow-sm text-white ${
                                  isConnected ? 'bg-gradient-to-tr from-emerald-500 to-teal-500' : 'bg-gradient-to-tr from-slate-600 to-slate-700'
                                }`}>
                                  {log.name ? log.name.charAt(0).toUpperCase() : 'S'}
                                </div>
                                <span className="font-semibold text-slate-100 text-sm">
                                  {log.name}
                                </span>
                              </div>
                            </td>

                            {/* Semester */}
                            <td className="px-6 py-3.5">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                {log.semester || 'Unspecified'}
                              </span>
                            </td>

                            {/* Status Badge */}
                            <td className="px-6 py-3.5">
                              {isConnected ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                  Connected Now
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-700/60 text-slate-400 border border-slate-600">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                  Disconnected (Last Spot)
                                </span>
                              )}
                            </td>

                            {/* Recorded Time */}
                            <td className="px-6 py-3.5">
                              <div className="font-medium text-slate-200">
                                {isConnected ? 'Live Broadcasting' : time.full}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {isConnected ? 'Tracking active' : `Disconnected ${time.relative}`}
                              </div>
                            </td>

                            {/* Location (Coordinates) Button */}
                            <td className="px-6 py-3.5 text-center">
                              <button
                                onClick={() => handleOpenLocationMap(log)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono text-xs font-medium transition-all shadow-sm ${
                                  isConnected 
                                    ? 'bg-slate-900/90 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10' 
                                    : 'bg-slate-900/90 text-blue-400 border-slate-700 hover:bg-blue-600/20 hover:border-blue-500/50'
                                }`}
                              >
                                <svg className="w-3.5 h-3.5 text-rose-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                </svg>
                                {Number(log.lat).toFixed(4)}, {Number(log.lng).toFixed(4)}
                              </button>
                            </td>

                            {/* Action: Open Map */}
                            <td className="px-6 py-3.5 text-right">
                              <button
                                onClick={() => handleOpenLocationMap(log)}
                                className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold py-1.5 px-3 rounded-lg shadow-sm transition-all inline-flex items-center gap-1"
                              >
                                View Pin
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* ================= LOCATION INSPECTOR MODAL ================= */}
      {inspectLocation && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                  📍
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                    {inspectLocation.name}
                    <span className="text-xs bg-blue-500/20 text-blue-400 font-semibold px-2 py-0.5 rounded-full border border-blue-500/30">
                      {inspectLocation.semester}
                    </span>
                    {inspectLocation.status === 'connected' ? (
                      <span className="text-[11px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                        Live Location
                      </span>
                    ) : (
                      <span className="text-[11px] bg-slate-700 text-slate-300 font-semibold px-2 py-0.5 rounded-full">
                        Last Disconnected Location
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {inspectLocation.status === 'connected' 
                      ? 'Actively broadcasting GPS' 
                      : `Disconnected at: ${formatTimestamp(inspectLocation.timestamp).full} (${formatTimestamp(inspectLocation.timestamp).relative})`}
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setInspectLocation(null)}
                className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 flex items-center justify-center transition-colors"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Map Container */}
            <div className="relative flex-1 min-h-[420px] bg-slate-950">
              <MapContainer
                center={[inspectLocation.lat, inspectLocation.lng]}
                zoom={16}
                scrollWheelZoom={true}
                className="h-full w-full outline-none"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* The Selected Location Pin */}
                <Marker position={[inspectLocation.lat, inspectLocation.lng]} icon={highlightIcon}>
                  <Popup autoPan={true} className="rounded-xl shadow-lg">
                    <div className="p-1 min-w-[160px]">
                      <div className="font-bold text-gray-900 text-sm border-b border-gray-100 pb-1 mb-1">
                        {inspectLocation.name}
                      </div>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div><span className="text-gray-400">Semester:</span> {inspectLocation.semester}</div>
                        <div>
                          <span className="text-gray-400">Status:</span>{' '}
                          <span className={inspectLocation.status === 'connected' ? 'text-emerald-600 font-bold' : 'text-slate-600'}>
                            {inspectLocation.status === 'connected' ? 'Live Connected' : 'Last Disconnected'}
                          </span>
                        </div>
                        <div><span className="text-gray-400">Lat:</span> {inspectLocation.lat.toFixed(6)}</div>
                        <div><span className="text-gray-400">Lng:</span> {inspectLocation.lng.toFixed(6)}</div>
                      </div>
                    </div>
                  </Popup>
                </Marker>

                <MapCenterController center={[inspectLocation.lat, inspectLocation.lng]} zoom={16} />
              </MapContainer>

              {/* Coordinates Info Overlay Badge */}
              <div className="absolute top-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md p-3 rounded-2xl border border-slate-700 shadow-xl text-xs space-y-1">
                <div className="text-slate-400 text-[10px] uppercase font-bold">
                  {inspectLocation.status === 'connected' ? 'Live Coordinates' : 'Last Known Disconnected Coordinates'}
                </div>
                <div className="font-mono text-emerald-400 font-bold">
                  Lat: {inspectLocation.lat.toFixed(6)}
                </div>
                <div className="font-mono text-emerald-400 font-bold">
                  Lng: {inspectLocation.lng.toFixed(6)}
                </div>
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="px-6 py-4 bg-slate-800/90 border-t border-slate-700 flex items-center justify-between gap-4">
              <div className="text-xs text-slate-400">
                {inspectLocation.status === 'connected' 
                  ? '🟢 Transmitting live updates in real time.' 
                  : '⏳ Kept in history for 24 hours from disconnection.'}
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`https://www.google.com/maps?q=${inspectLocation.lat},${inspectLocation.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-2 px-4 rounded-xl border border-slate-600 transition-all flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Open in Google Maps
                </a>

                <button
                  onClick={() => setInspectLocation(null)}
                  className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-5 rounded-xl transition-all shadow-md"
                >
                  Done
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
