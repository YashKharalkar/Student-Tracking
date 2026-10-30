import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Link } from 'react-router-dom';

const SEMESTER_OPTIONS = [
  'Semester 1',
  'Semester 2',
  'Semester 3',
  'Semester 4',
  'Semester 5',
  'Semester 6',
  'Semester 7',
  'Semester 8',
];

export default function StudentTracker() {
  const [name, setName] = useState(() => localStorage.getItem('studentName') || '');
  const [semester, setSemester] = useState(() => localStorage.getItem('studentSemester') || 'Semester 6');
  const [customSemester, setCustomSemester] = useState('');
  const [isCustomSem, setIsCustomSem] = useState(false);

  const [isTracking, setIsTracking] = useState(false);
  const [position, setPosition] = useState(null);
  const [error, setError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [devBypass, setDevBypass] = useState(false);
  
  const socketRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on('connect', () => {
      setSocketConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      setSocketConnected(false);
    });

    socketRef.current.on('trackingError', (msg) => {
      setError(msg);
      setIsTracking((prev) => {
        if (prev && watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
          setPosition(null);
        }
        return false;
      });
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const isCollegeTime = () => {
    const istString = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istDate = new Date(istString);
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();

    if (hours > 9 && hours < 16) return true;
    if (hours === 9 && minutes >= 0) return true;
    if (hours === 16 && minutes <= 15) return true;
    return false;
  };

  const getEffectiveSemester = () => {
    return isCustomSem ? (customSemester.trim() || 'Custom Sem') : semester;
  };

  const handleStartTracking = () => {
    if (!name.trim()) {
      setError('Please enter your Full Name before sharing location.');
      return;
    }

    const currentSem = getEffectiveSemester();
    if (!currentSem.trim()) {
      setError('Please select or enter your Semester.');
      return;
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    if (!devBypass && !isCollegeTime()) {
      setError('College hours are from 9:00 AM to 4:15 PM IST. Tracking disabled.');
      return;
    }

    // Save to local storage for quick subsequent visits
    localStorage.setItem('studentName', name.trim());
    localStorage.setItem('studentSemester', currentSem);

    setIsTracking(true);
    setError('');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPosition({ lat: latitude, lng: longitude });

        // Emit location via socket
        if (socketConnected && socketRef.current) {
          socketRef.current.emit('updateLocation', {
            id: socketRef.current.id,
            name: name.trim(),
            semester: currentSem,
            lat: latitude,
            lng: longitude,
            bypass: devBypass
          });
        }
      },
      (err) => {
        setIsTracking(false);
        setError(`Location access denied or unavailable (${err.message}).`);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleStopTracking = () => {
    setIsTracking(false);
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.emit('stopTracking');
    }
    setPosition(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 sm:p-6 flex flex-col justify-center items-center">
      <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-white">
        
        {/* Header navigation */}
        <div className="flex items-center justify-between mb-4">
          <Link to="/" className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-xs font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Home
          </Link>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${socketConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
            {socketConnected ? 'Online' : 'Connecting...'}
          </span>
        </div>

        {/* Icon & Title */}
        <div className="text-center mb-6">
          <div className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-md transition-all duration-500 ${isTracking ? 'bg-green-500 text-white shadow-green-200 animate-bounce' : 'bg-blue-600 text-white shadow-blue-200'}`}>
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight">Student Tracker</h1>
          <p className="text-xs text-gray-500 mt-1">Campus Live Location Broadcast</p>
        </div>

        {/* Student Details Form (Disabled during active tracking) */}
        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input 
              type="text"
              value={name}
              disabled={isTracking}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="e.g. John Doe"
              className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-60 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              College Semester <span className="text-red-500">*</span>
            </label>
            
            {!isCustomSem ? (
              <div className="flex gap-2">
                <select
                  value={semester}
                  disabled={isTracking}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setIsCustomSem(true);
                    } else {
                      setSemester(e.target.value);
                    }
                    setError('');
                  }}
                  className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-60 disabled:bg-gray-100"
                >
                  {SEMESTER_OPTIONS.map((sem) => (
                    <option key={sem} value={sem}>{sem}</option>
                  ))}
                  <option value="custom">+ Other / Custom Semester</option>
                </select>
              </div>
            ) : (
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={customSemester}
                  disabled={isTracking}
                  onChange={(e) => { setCustomSemester(e.target.value); setError(''); }}
                  placeholder="Enter custom semester/year"
                  className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-60"
                  autoFocus
                />
                <button
                  type="button"
                  disabled={isTracking}
                  onClick={() => setIsCustomSem(false)}
                  className="px-3 text-xs text-blue-600 hover:text-blue-800 font-semibold border border-blue-200 rounded-xl bg-blue-50"
                >
                  List
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live GPS Coordinates Card */}
        <div className={`p-4 rounded-2xl border transition-all mb-5 ${isTracking && position ? 'bg-emerald-50/80 border-emerald-200 shadow-sm' : 'bg-gray-50 border-gray-100'}`}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] uppercase tracking-wider font-bold text-gray-400">Status</span>
            {isTracking && (
              <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                Broadcasting Live
              </span>
            )}
          </div>

          {position ? (
            <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-xs font-mono text-xs text-emerald-900 space-y-1 mt-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Latitude:</span>
                <span className="font-bold">{position.lat.toFixed(6)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Longitude:</span>
                <span className="font-bold">{position.lng.toFixed(6)}</span>
              </div>
              <div className="pt-1 text-[11px] text-gray-400 text-right border-t border-gray-100">
                Logged to 24h Campus History
              </div>
            </div>
          ) : (
            <div className="text-center text-xs text-gray-400 py-3">
              {isTracking ? '📡 Acquiring high-precision GPS coordinates...' : 'GPS Inactive • Press Start below'}
            </div>
          )}

          {error && (
            <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-xl font-medium flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Action Button */}
        {isTracking ? (
          <button 
            onClick={handleStopTracking}
            className="w-full bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-red-200 transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            Stop Sharing Location
          </button>
        ) : (
          <button 
            onClick={handleStartTracking}
            disabled={!socketConnected}
            className={`w-full font-bold py-3.5 rounded-2xl shadow-lg transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 ${socketConnected ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Share My Location
          </button>
        )}

        {/* Developer Bypass Toggle */}
        <div className="flex items-center justify-center pt-4">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500 hover:text-gray-700 select-none">
            <input 
              type="checkbox" 
              checked={devBypass}
              onChange={(e) => setDevBypass(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            Bypass College Hours (9:00 AM - 4:15 PM)
          </label>
        </div>

      </div>
    </div>
  );
}
