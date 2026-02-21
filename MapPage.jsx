import React, { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store/useStore';
import {
    MapPin, AlertTriangle, Eye, Users,
    Navigation, Activity, Target, Zap, ChevronRight,
    Search, Filter, Info, Shield, Radio, Bell, Radar, Crosshair, X, Map as MapIcon
} from 'lucide-react';

// Haversine distance calculation (returns meters)
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // meters
    const f1 = lat1 * Math.PI / 180;
    const f2 = lat2 * Math.PI / 180;
    const df = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(df / 2) * Math.sin(df / 2) +
        Math.cos(f1) * Math.cos(f2) *
        Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

const createHighVisIcon = (color) => new L.DivIcon({
    html: `
        <div class="relative flex items-center justify-center">
            <div class="absolute w-8 h-8 rounded-full bg-primary/20 animate-ping"></div>
            <div class="relative w-5 h-5 rounded-full border-2 border-white shadow-lg" style="background-color: ${color}"></div>
        </div>
    `,
    className: 'custom-marker-icon',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
});

const userIcon = new L.DivIcon({
    html: `
        <div class="relative flex items-center justify-center">
            <div class="absolute w-16 h-16 rounded-full border-2 border-blue-500/30 animate-pulse"></div>
            <div class="absolute w-24 h-24 rounded-full border border-blue-500/10 animate-[ping_3s_linear_infinite]"></div>
            <div class="relative w-10 h-10 bg-blue-600 rounded-2xl border-4 border-white shadow-2xl flex items-center justify-center">
                <Navigation size={18} className="text-white fill-white" />
            </div>
        </div>
    `,
    className: 'user-marker-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
});

const hazardColors = {
    pothole: '#FF2D55', // Harsh Pink-Red (High Contrast)
    crack: '#FF9500', // Bright Security Orange
    blind_spot: '#AF52DE', // Electric Purple
    uneven_terrain: '#FFD60A', // Cyber Yellow
    pedestrian_zone: '#32D74B', // Neon Green
};

const hazardPriority = ['pothole', 'crack', 'blind_spot', 'uneven_terrain', 'pedestrian_zone'];

const getHazardColor = (types) => {
    // Pick the most critical hazard type present
    const priorityType = hazardPriority.find(pType => types.includes(pType));
    return hazardColors[priorityType || types[0]] || '#444';
};

const BICOL_CENTER = [13.631242, 123.192334];

// Component to handle map view updates
const MapController = ({ center }) => {
    const map = useMap();
    const prevCenter = useRef(null);

    useEffect(() => {
        if (center && (!prevCenter.current || prevCenter.current[0] !== center[0] || prevCenter.current[1] !== center[1])) {
            map.flyTo(center, 16, { duration: 1.5, easeLinearity: 0.25 });
            prevCenter.current = center;
        }
    }, [center, map]);
    return null;
};

const CustomZoomButtons = () => {
    const map = useMap();
    return (
        <div className="absolute top-[30%] md:top-1/2 right-4 md:right-10 -translate-y-1/2 flex flex-col gap-2 md:gap-3 z-[1000] pointer-events-auto">
            <button
                onClick={(e) => { e.stopPropagation(); map.locate(); }}
                className="w-10 h-10 md:w-12 md:h-12 bg-primary text-white rounded-xl shadow-xl flex items-center justify-center hover:bg-blue-500 transition-all border border-white/10"
            >
                <Crosshair size={18} />
            </button>
            <div className="h-px bg-white/10 my-1"></div>
            <button
                onClick={(e) => { e.stopPropagation(); map.zoomIn(); }}
                className="w-10 h-10 md:w-12 md:h-12 bg-[#0F1218]/80 backdrop-blur-xl rounded-xl border border-white/10 flex items-center justify-center text-white hover:bg-primary transition-all shadow-xl font-black text-base md:text-lg"
            >
                +
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); map.zoomOut(); }}
                className="w-10 h-10 md:w-12 md:h-12 bg-[#0F1218]/80 backdrop-blur-xl rounded-xl border border-white/10 flex items-center justify-center text-white hover:bg-primary transition-all shadow-xl font-black text-base md:text-lg"
            >
                -
            </button>
        </div>
    );
};

const MapPage = () => {
    const { hazards, userLocation, setUserLocation, vehicleType } = useStore();
    const [filterType, setFilterType] = useState('All Types');
    const [severityFilter, setSeverityFilter] = useState('All Severities');
    const [proximityAlert, setProximityAlert] = useState(null);
    const [upcomingHazards, setUpcomingHazards] = useState([]);
    const [isDriverMode, setIsDriverMode] = useState(true);
    const [gpsStatus, setGpsStatus] = useState('standby'); // standby, active, error
    const [speed, setSpeed] = useState(0);
    const [dismissedHazards, setDismissedHazards] = useState(new Set());
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Geolocation Tracking Logic
    useEffect(() => {
        if (!navigator.geolocation) {
            setGpsStatus('error');
            return;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, speed: geoSpeed } = position.coords;
                // Rounding speed to nearest int (m/s to km/h)
                const kmh = geoSpeed ? Math.round(geoSpeed * 3.6) : 0;
                setSpeed(kmh);
                setUserLocation({ lat: latitude, lng: longitude });
                setGpsStatus('active');
            },
            (error) => {
                console.error('GPS Error:', error);
                setGpsStatus('error');
            },
            options
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [setUserLocation]);

    const requestLocation = () => {
        setGpsStatus('active');
        navigator.geolocation.getCurrentPosition(
            (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => setGpsStatus('error'),
            { enableHighAccuracy: true }
        );
    };

    const filteredHazards = useMemo(() => {
        return hazards.filter(h => {
            const matchesType = filterType === 'All Types' || h.hazardTypes.some(t => t.replace('_', ' ').toLowerCase() === filterType.toLowerCase());
            const matchesSeverity = severityFilter === 'All Severities' || h.severity.toLowerCase() === severityFilter.toLowerCase();
            return matchesType && matchesSeverity;
        });
    }, [hazards, filterType, severityFilter]);

    // Enhanced Proximity & Predictive Logic
    useEffect(() => {
        if (!userLocation) return;
        const interval = setInterval(() => {
            const nearby = [];
            let closest = null;
            let minDistance = Infinity;

            hazards.forEach(h => {
                const dist = getDistance(userLocation.lat, userLocation.lng, h.latitude, h.longitude);
                if (dist < 500) {
                    nearby.push({ hazard: h, distance: dist });
                }
                if (dist < minDistance) {
                    minDistance = dist;
                    closest = h;
                }
            });

            // Sort by distance
            nearby.sort((a, b) => a.distance - b.distance);
            setUpcomingHazards(nearby.slice(0, 3));

            if (minDistance <= 20) {
                // Only show if not dismissed
                if (!dismissedHazards.has(closest.id)) {
                    setProximityAlert({ hazard: closest, distance: minDistance });
                }
            } else {
                setProximityAlert(null);
                // Reset dismissal once we move away (over 50m) so it can trigger if we return
                if (minDistance > 50 && dismissedHazards.size > 0) {
                    setDismissedHazards(new Set());
                }
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [userLocation, hazards, dismissedHazards]);

    const dismissAlarm = () => {
        if (proximityAlert) {
            setDismissedHazards(prev => new Set(prev).add(proximityAlert.hazard.id));
            setProximityAlert(null);
        }
    };

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-[#0A0C10] font-sans text-slate-100 selection:bg-primary selection:text-white relative">
            {/* Tactical Sidebar - Responsive Drawer */}
            <aside className={`
                fixed md:relative z-50 w-full md:w-[380px] h-full flex flex-col bg-[#0F1117] border-r border-white/5 overflow-hidden transition-transform duration-500 shadow-[10px_0_30px_rgba(0,0,0,0.5)]
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            `}>
                {/* Mobile Close Button */}
                <button
                    onClick={() => setIsSidebarOpen(false)}
                    className="md:hidden absolute top-6 right-6 p-2 bg-white/5 rounded-full text-slate-400"
                >
                    <X size={20} />
                </button>

                <div className="p-6 md:p-8 flex-1 overflow-y-auto space-y-8 md:space-y-10 custom-scrollbar">
                    {/* Header Group */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary border border-primary/30">
                                <Radar size={20} className="animate-spin-slow" />
                            </div>
                            <h2 className="text-2xl font-black text-white tracking-tight uppercase italic">RACA <span className="text-primary not-italic">OS</span></h2>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Scan Frequency: Type</label>
                                <div className="relative">
                                    <select
                                        className="w-full p-4 bg-[#1A1D25] border border-white/5 rounded-2xl text-[11px] font-black uppercase tracking-widest appearance-none cursor-pointer focus:ring-2 focus:ring-primary outline-none transition-all pr-12 text-slate-200"
                                        value={filterType}
                                        onChange={(e) => setFilterType(e.target.value)}
                                    >
                                        <option>All Types</option>
                                        <option>Pothole</option>
                                        <option>Crack</option>
                                        <option>Blind Spot</option>
                                        <option>Uneven Terrain</option>
                                        <option>Pedestrian Zone</option>
                                    </select>
                                    <ChevronRight size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 rotate-90 pointer-events-none" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Proactive HUD - Upcoming Hazards */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-primary flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div> Predictive Analysis
                            </h3>
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Radius: 500m</span>
                        </div>

                        <div className="space-y-3">
                            {upcomingHazards.length > 0 ? (
                                upcomingHazards.map(({ hazard, distance }) => (
                                    <div key={hazard.id} className={`p-5 rounded-2xl border transition-all duration-500 hover:scale-[1.02] cursor-default ${distance < 50 ? 'bg-red-500/10 border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.1)]' : 'bg-white/5 border-white/5'}`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: hazardColors[hazard.hazardTypes[0]], color: hazardColors[hazard.hazardTypes[0]] }}></div>
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white italic">{hazard.hazardTypes[0].replace('_', ' ')}</span>
                                            </div>
                                            <span className={`text-xs font-black tabular-nums ${distance < 50 ? 'text-red-500 animate-pulse' : 'text-primary'}`}>{distance.toFixed(0)}m</span>
                                        </div>
                                        <p className="text-[11px] font-bold text-slate-400 line-clamp-1 italic">"{hazard.name}"</p>
                                        <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-1000 ${distance < 50 ? 'bg-red-500' : 'bg-primary'}`}
                                                style={{ width: `${Math.max(0, 100 - (distance / 500) * 100)}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 text-center bg-white/5 rounded-3xl border border-white/5">
                                    <Radio className="mx-auto mb-4 text-slate-700" size={32} />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 italic">Scanning clearway...</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sensor Status */}
                    <div className="p-6 bg-primary/5 rounded-3xl border border-primary/10 space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">System Telemetry</h3>
                            <button onClick={requestLocation} className="p-2 bg-primary/20 rounded-lg text-primary hover:bg-primary/30 transition-all active:scale-95">
                                <Crosshair size={14} className={gpsStatus === 'active' ? 'animate-pulse' : ''} />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-[#1A1D25] rounded-2xl border border-white/5">
                                <p className="text-[8px] font-black text-slate-500 uppercase mb-1">GPS Alignment</p>
                                <p className={`text-sm font-black italic ${gpsStatus === 'error' ? 'text-red-500' : gpsStatus === 'active' ? 'text-success' : 'text-white'}`}>
                                    {gpsStatus === 'active' ? 'LOCKED' : gpsStatus === 'error' ? 'LOST' : 'STANDBY'}
                                </p>
                            </div>
                            <div className="p-4 bg-[#1A1D25] rounded-2xl border border-white/5">
                                <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Precision</p>
                                <p className="text-sm font-black text-primary italic">HI-RES</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-8 bg-[#0A0C10] border-t border-white/5">
                    <button
                        onClick={() => setIsDriverMode(!isDriverMode)}
                        className={`w-full py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 transition-all ${isDriverMode ? 'bg-red-600 text-white shadow-[0_0_30px_rgba(220,38,38,0.3)] hover:bg-red-500' : 'bg-primary text-white shadow-[0_0_30px_rgba(37,99,235,0.3)] hover:bg-blue-500'}`}
                    >
                        {isDriverMode ? <><Shield size={16} /> Disable Combat Mode</> : <><Navigation size={16} /> Engage Driver Protocol</>}
                    </button>
                </div>
            </aside>

            {/* Main Map Container */}
            <main className="flex-1 relative overflow-hidden flex flex-col">
                {/* Grid Overlay for Tactical Look */}
                <div className="absolute inset-0 z-20 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
                <div className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-b from-[#0A0C10] via-transparent to-[#0A0C10] opacity-40"></div>
                <div className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-r from-[#0A0C10] via-transparent to-[#0A0C10] opacity-40"></div>

                {/* Overlay Dimmer for Mobile */}
                {isSidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/60 md:hidden z-40 backdrop-blur-sm"
                        onClick={() => setIsSidebarOpen(false)}
                    ></div>
                )}

                {/* Mobile Menu Toggle */}
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="md:hidden absolute top-4 left-4 z-[1100] w-12 h-12 bg-[#0F1218]/80 backdrop-blur-xl rounded-xl border border-white/5 flex items-center justify-center text-primary shadow-2xl"
                >
                    <Radar size={20} className="animate-spin-slow" />
                </button>

                {/* Danger Overlay Alarm */}
                {proximityAlert && (
                    <div className="absolute inset-0 z-[2000] pointer-events-none animate-pulse-fast p-4">
                        <div className="absolute inset-0 border-[20px] md:border-[40px] border-red-600/20"></div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-auto w-full max-w-[90vw]">
                            <div className="bg-red-600 text-white px-6 md:px-12 py-8 rounded-[32px] md:rounded-[40px] shadow-[0_0_120px_rgba(220,38,38,0.9)] border-4 border-white/20 flex flex-col items-center gap-6 relative overflow-hidden group">
                                {/* Dismiss Button */}
                                <button
                                    onClick={dismissAlarm}
                                    className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all active:scale-90"
                                >
                                    <Zap size={20} className="rotate-45" />
                                </button>

                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>

                                <AlertTriangle size={72} className="animate-bounce text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]" />

                                <div className="relative z-10">
                                    <h2 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter mb-1 leading-none">Impact Warning</h2>
                                    <p className="text-sm md:text-xl font-bold opacity-90 uppercase tracking-[0.3em]">{proximityAlert.hazard.hazardTypes[0].replace('_', ' ')} IN RANGE</p>
                                </div>

                                <div className="text-5xl md:text-7xl font-black italic tabular-nums drop-shadow-2xl">
                                    {proximityAlert.distance.toFixed(1)}<span className="text-xl md:text-3xl ml-1 not-italic opacity-50">m</span>
                                </div>

                                <button
                                    onClick={dismissAlarm}
                                    className="relative z-10 w-full bg-white text-red-600 py-4 px-8 rounded-2xl text-xs font-black uppercase tracking-[0.4em] shadow-xl hover:bg-slate-100 transition-all active:scale-95 mt-4"
                                >
                                    Acknowledge & Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Top Floating Telemetry - Reimagined HUD */}
                <div className="absolute top-4 md:top-10 left-4 md:left-10 right-4 md:right-10 z-[1000] flex flex-col md:flex-row justify-between gap-4 pointer-events-none">
                    <div className="flex gap-2 md:gap-4 overflow-x-auto no-scrollbar md:overflow-visible">
                        <div className="bg-[#0F1218]/80 backdrop-blur-xl p-3 md:p-4 px-4 md:px-8 rounded-2xl border border-white/5 flex flex-col justify-center min-w-[140px] md:min-w-0">
                            <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 font-mono">VECTOR.POS</p>
                            <p className="text-[11px] md:text-sm font-black text-white italic tracking-tight font-mono truncate">{userLocation ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}` : 'ACQUIRING...'}</p>
                        </div>
                        <div className="bg-[#0F1218]/80 backdrop-blur-xl p-3 md:p-4 px-4 md:px-8 rounded-2xl border border-white/5 flex flex-col justify-center border-l-4 border-l-primary min-w-[100px] md:min-w-0">
                            <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 font-mono">VELOCITY.HUD</p>
                            <p className="text-lg md:text-2xl font-black text-white italic tracking-tighter leading-none">{String(speed).padStart(2, '0')} <span className="text-[8px] md:text-[10px] text-primary uppercase">KM/H</span></p>
                        </div>
                    </div>

                    <div className="hidden md:flex gap-4 pointer-events-auto">
                        <div className="bg-[#0F1218]/80 backdrop-blur-xl p-4 px-8 rounded-2xl border border-white/5 flex items-center gap-6 group hover:border-primary/30 transition-all">
                            <div className="text-right">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Sector Analysis</p>
                                <p className="text-sm font-black text-white italic">Naga City Hub</p>
                            </div>
                            <button
                                onClick={requestLocation}
                                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${gpsStatus === 'active' ? 'bg-primary text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-primary/10 text-primary border border-primary/20 animate-pulse'}`}
                            >
                                <MapPin size={24} className={gpsStatus === 'active' ? '' : 'animate-bounce'} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 relative z-10 w-full h-full">
                    <MapContainer center={BICOL_CENTER} zoom={16} style={{ height: '100%', width: '100%', background: '#0A0C10' }} zoomControl={false}>
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

                        {userLocation && <MapController center={[userLocation.lat, userLocation.lng]} />}

                        {userLocation && (
                            <>
                                <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} />
                                <Circle
                                    center={[userLocation.lat, userLocation.lng]}
                                    radius={20}
                                    pathOptions={{ color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.1, weight: 1, dashArray: '5, 10' }}
                                />
                                <Circle
                                    center={[userLocation.lat, userLocation.lng]}
                                    radius={500}
                                    pathOptions={{ color: '#3B82F6', fillColor: 'transparent', fillOpacity: 0, weight: 0.5, dashArray: '10, 20' }}
                                />
                                {/* Scanning Effect */}
                                <Circle
                                    center={[userLocation.lat, userLocation.lng]}
                                    radius={100}
                                    pathOptions={{ color: '#3B82F6', fillColor: 'transparent', fillOpacity: 0, weight: 2, className: 'animate-scan' }}
                                />
                            </>
                        )}

                        {filteredHazards.map(h => {
                            const mainColor = getHazardColor(h.hazardTypes);
                            return (
                                <Fragment key={h.id}>
                                    <Marker
                                        position={[h.latitude, h.longitude]}
                                        icon={createHighVisIcon(mainColor)}
                                    >
                                        <Popup className="tactical-popup">
                                            <div className="min-w-[220px] p-4 bg-[#0F1117] text-white rounded-xl border border-white/10 shadow-2xl">
                                                <p className="text-[9px] font-black uppercase text-primary mb-2 tracking-[0.2em] font-mono">THREAT.LEVEL: {h.severity}</p>
                                                <h4 className="font-black text-base italic mb-3">{h.name}</h4>
                                                <p className="text-[11px] text-slate-400 italic leading-relaxed mb-4">"{h.description}"</p>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex gap-2">
                                                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${h.severity === 'high' ? 'bg-red-500/20 text-red-500' : 'bg-orange-500/20 text-orange-500'}`}>{h.severity}</span>
                                                        <span className="px-3 py-1 rounded-lg bg-white/5 text-slate-500 text-[9px] font-black uppercase">Verified</span>
                                                    </div>
                                                    <p className="text-[10px] font-mono text-slate-600">DIST: {userLocation ? getDistance(userLocation.lat, userLocation.lng, h.latitude, h.longitude).toFixed(0) : '??'}m</p>
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>
                                    <Circle
                                        center={[h.latitude, h.longitude]}
                                        radius={20}
                                        pathOptions={{ color: mainColor, fillColor: mainColor, fillOpacity: 0.1, weight: 1, dashArray: '2, 4' }}
                                    />
                                </Fragment>
                            );
                        })}

                        <CustomZoomButtons />
                    </MapContainer>

                    <div className="absolute bottom-20 md:bottom-10 right-4 md:right-10 z-[1000] pointer-events-auto">
                        <div className="bg-[#0F1218]/90 backdrop-blur-2xl p-4 md:p-6 rounded-[24px] md:rounded-[32px] border border-white/10 shadow-2xl min-w-[200px] md:min-w-[260px] filter drop-shadow-2xl max-h-[40vh] overflow-y-auto custom-scrollbar">
                            <h3 className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-4 md:mb-6 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div> Marker Key
                            </h3>
                            <div className="space-y-3 md:space-y-4">
                                {Object.entries(hazardColors).map(([type, color]) => (
                                    <div key={type} className="flex items-center gap-3 md:gap-4 group cursor-default">
                                        <div className="w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center border-2 border-white/5 shadow-inner transition-all group-hover:scale-110" style={{ backgroundColor: `${color}20` }}>
                                            <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full shadow-[0_0_10px_currentColor]" style={{ backgroundColor: color, color }}></div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] md:text-xs font-black text-white uppercase tracking-tight italic leading-none">{type.replace('_', ' ')}</p>
                                            <p className="text-[7px] md:text-[8px] font-bold text-slate-600 uppercase tracking-widest mt-1">Status: Active</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.2); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.5); }
                
                @keyframes pulse-fast {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .animate-pulse-fast { animation: pulse-fast 0.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
                
                .animate-spin-slow { animation: spin 8s linear infinite; }

                @keyframes scan {
                    0% { transform: scale(1); opacity: 0.5; }
                    100% { transform: scale(3); opacity: 0; }
                }
                .animate-scan { animation: scan 3s cubic-bezier(0, 0, 0.2, 1) infinite; }
                
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                
                .tactical-popup .leaflet-popup-content-wrapper {
                    background: transparent !important;
                    padding: 0 !important;
                    box-shadow: none !important;
                }
                .tactical-popup .leaflet-popup-tip { background: #0F1117 !important; }
                .tactical-popup .leaflet-popup-close-button { color: #555 !important; }
            `}} />
        </div >
    );
};

export default MapPage;

