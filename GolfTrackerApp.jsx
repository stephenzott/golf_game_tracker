import React, { useState, useEffect, useRef } from 'react';
// Icons from lucide-react used throughout the UI
import { TrendingUp, Plus, Trash2, Target, LogOut, MapPin, Flag } from 'lucide-react';
import ShotTracker from './src/ShotTracker.jsx';
import Scorecard from './src/Scorecard.jsx';
import { signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from './src/firebase.js';

const EMPTY_SLOT = () => ({ name: '', distance: '' });

const GolfBagIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 11h12l-1.5 10H7.5L6 11z" />
    <line x1="9.5" y1="11" x2="8.5" y2="4" />
    <line x1="12" y1="11" x2="12" y2="3" />
    <line x1="14.5" y1="11" x2="15.5" y2="4" />
    <path d="M18 13c2.5 0 3.5 1.5 3.5 3.5" />
    <path d="M8 17q3.5 1.5 8 0" />
  </svg>
);

const GolfTrackerApp = () => {
  // distances: object keyed by club name, each value is an array of logged yardages
  const [distances, setDistances] = useState({});
  const [selectedClub, setSelectedClub] = useState('');
  const [distance, setDistance] = useState('');
  // wind: positive = headwind, negative = tailwind (mph)
  const [wind, setWind] = useState(0);
  // elevation: positive = uphill, negative = downhill (feet)
  const [elevation, setElevation] = useState(0);
  // activeTab: controls which panel is shown — 'log' or 'select'
  const [activeTab, setActiveTab] = useState('log');
  // recommendation: null when empty, or an object with club suggestion and adjusted distance
  const [recommendation, setRecommendation] = useState(null);
  // user: Firebase Auth user object, null when signed out
  const [user, setUser] = useState(null);
  // loading: true while auth state is being determined on startup
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [shotType, setShotType] = useState('course'); // 'course' | 'range'
  const [bagSlots, setBagSlots] = useState(Array.from({ length: 13 }, EMPTY_SLOT));
  const [bagEditSlots, setBagEditSlots] = useState([]);
  const [editingBag, setEditingBag] = useState(false);
  // Stays false until the initial Firestore load completes, preventing saves
  // triggered by setUser() firing before getDoc() resolves
  const saveEnabled = useRef(false);

  // Listen for auth state changes; load distances from Firestore when user signs in
  useEffect(() => {
    let unsubscribe = () => {};

    const init = async () => {
      // Process any pending Google redirect before checking auth state.
      // This must complete first — otherwise onAuthStateChanged fires with null
      // and shows the login screen before the redirect result is resolved.
      try {
        await getRedirectResult(auth);
      } catch (err) {
        setAuthError(err.message);
      }

      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        saveEnabled.current = false;
        setUser(firebaseUser);
        if (firebaseUser) {
          const docRef = doc(db, 'users', firebaseUser.uid);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            // Normalize legacy plain-number entries to { value, type } objects
            const raw = snap.data().distances || {};
            const normalized = Object.fromEntries(
              Object.entries(raw).map(([club, shots]) => [
                club,
                shots.map(s => (typeof s === 'number' ? { value: s, type: 'course' } : s)),
              ])
            );
            setDistances(normalized);

            if (snap.data().bag) {
              const loaded = snap.data().bag.map(s => ({
                name: s.name || '',
                distance: s.distance != null ? String(s.distance) : '',
              }));
              // Pad to 13 slots if the stored array is shorter
              while (loaded.length < 13) loaded.push(EMPTY_SLOT());
              setBagSlots(loaded);
            } else if (snap.data().baseDistances) {
              // Migrate old baseDistances format into bagSlots
              const old = snap.data().baseDistances;
              const slots = Object.entries(old).map(([name, distance]) => ({
                name,
                distance: String(distance),
              }));
              while (slots.length < 13) slots.push(EMPTY_SLOT());
              setBagSlots(slots);
            }
          } else {
            setDistances({});
          }
        } else {
          setDistances({});
        }
        setLoading(false);
        saveEnabled.current = true;
      });
    };

    init();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !saveEnabled.current) return;
    const docRef = doc(db, 'users', user.uid);
    const bag = bagSlots.map(s => ({
      name: s.name,
      distance: parseFloat(s.distance) || null,
    }));
    setDoc(docRef, { distances, bag });
  }, [distances, bagSlots, user]);

  // Redirect to Google sign-in (works on mobile; popups are often blocked)
  const handleSignIn = () => signInWithRedirect(auth, googleProvider);
  const handleSignOut = () => signOut(auth);

  // Derived from bagSlots — only slots with a name are active clubs
  const clubs = bagSlots.map(s => s.name).filter(Boolean);
  const baseDistances = Object.fromEntries(
    bagSlots
      .filter(s => s.name && parseFloat(s.distance) > 0)
      .map(s => [s.name, parseFloat(s.distance)])
  );

  // Treating the baseline as 5 virtual shots — real data overtakes it after ~10 logged shots
  const BASE_WEIGHT = 5;

  // Blends the baseline with the user's logged average.
  // Range shots count as 1/10th of a course shot so they influence the average
  // without overwhelming a small number of real on-course readings.
  const getBlendedDistance = (club) => {
    const base = baseDistances[club] ?? 0;
    const shots = distances[club] || [];
    if (shots.length === 0) return { blended: base, userShots: 0 };
    const RANGE_WEIGHT = 0.1;
    const effectiveWeight = shots.reduce((w, s) => w + (s.type === 'range' ? RANGE_WEIGHT : 1), 0);
    const weightedSum = shots.reduce((sum, s) => sum + s.value * (s.type === 'range' ? RANGE_WEIGHT : 1), 0);
    const userAvg = weightedSum / effectiveWeight;
    const blended = (base * BASE_WEIGHT + userAvg * effectiveWeight) / (BASE_WEIGHT + effectiveWeight);
    return { blended, userShots: shots.length };
  };

  const handleEditBag = () => {
    setBagEditSlots(bagSlots.map(s => ({ ...s })));
    setEditingBag(true);
  };

  const handleSaveBag = () => {
    const sorted = [...bagEditSlots].sort((a, b) => {
      const da = parseFloat(a.distance) || 0;
      const db = parseFloat(b.distance) || 0;
      if (da === 0 && db === 0) return 0;
      if (da === 0) return 1;
      if (db === 0) return -1;
      return db - da;
    });
    setBagSlots(sorted);
    setBagEditSlots([]);
    setEditingBag(false);
  };

  // Appends a new yardage entry for the selected club, then clears the input
  const handleAddDistance = () => {
    if (!selectedClub || !distance) {
      alert('Please select a club and enter a distance');
      return;
    }

    const numDistance = parseFloat(distance);
    if (isNaN(numDistance) || numDistance <= 0) {
      alert('Please enter a valid distance');
      return;
    }

    setDistances(prev => ({
      ...prev,
      [selectedClub]: [...(prev[selectedClub] || []), { value: numDistance, type: shotType }]
    }));

    setDistance('');
  };

  // Removes a single logged distance by its index within a club's array
  const handleDeleteDistance = (club, index) => {
    setDistances(prev => ({
      ...prev,
      [club]: prev[club].filter((_, i) => i !== index)
    }));
  };

  const getAverageDistance = (club) => {
    if (!distances[club] || distances[club].length === 0) return 0;
    const sum = distances[club].reduce((a, s) => a + s.value, 0);
    return (sum / distances[club].length).toFixed(1);
  };

  // Finds the best club for a given target distance, then adjusts for wind and elevation
  const handleGetRecommendation = (targetDistance) => {
    let bestClub = null;
    let closestDiff = Infinity;

    // Only consider clubs that can reach the target; fall back to the longest club if none can
    const reachable = clubs.filter(club => getBlendedDistance(club).blended >= targetDistance);
    const candidates = reachable.length > 0 ? reachable : clubs;

    candidates.forEach(club => {
      const { blended, userShots } = getBlendedDistance(club);
      const diff = Math.abs(blended - targetDistance);
      if (diff < closestDiff) {
        closestDiff = diff;
        bestClub = { name: club, blended, userShots };
      }
    });

    let adjustedDistance = bestClub.blended;
    let adjustmentNotes = [];

    // Headwind costs ~2 yards per mph; tailwind gains ~1.5 yards per mph
    if (wind !== 0) {
      const windFactor = wind > 0 ? 0.02 : 0.015;
      const windAdjustment = Math.abs(wind) * windFactor;
      adjustedDistance = wind > 0 ? adjustedDistance - windAdjustment : adjustedDistance + windAdjustment;
      adjustmentNotes.push(`${wind > 0 ? 'Headwind' : 'Tailwind'}: ${Math.abs(wind).toFixed(1)} mph`);
    }

    // Elevation changes distance by ~10% per 100 feet of rise/drop
    if (elevation !== 0) {
      const elevationFactor = 0.1;
      const elevationAdjustment = (Math.abs(elevation) / 100) * elevationFactor * bestClub.blended;
      adjustedDistance = elevation > 0 ? adjustedDistance - elevationAdjustment : adjustedDistance + elevationAdjustment;
      adjustmentNotes.push(`${elevation > 0 ? 'Uphill' : 'Downhill'}: ${Math.abs(elevation)} ft`);
    }

    // Confidence (accuracy) reflects how closely the best club's blended distance matched the target
    setRecommendation({
      club: bestClub.name,
      baseDistance: bestClub.blended.toFixed(1),
      userShots: bestClub.userShots,
      adjustedDistance: adjustedDistance.toFixed(1),
      adjustmentNotes,
      accuracy: (100 - (closestDiff / bestClub.blended * 100)).toFixed(0)
    });
  };

  // Show nothing while Firebase resolves the auth state on startup
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0f4f1 0%, #e8ede8 100%)' }}>
        <p style={{ color: '#888', fontSize: '15px' }}>Loading...</p>
      </div>
    );
  }

  // Show sign-in screen when no user is authenticated
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0f4f1 0%, #e8ede8 100%)', padding: '24px' }}>
        <Target size={48} color="#1a5f3d" strokeWidth={1.5} style={{ marginBottom: '16px' }} />
        <h1 style={{ margin: '0 0 8px 0', fontSize: '26px', fontWeight: '600', color: '#1a1a1a' }}>GolfPro Tracker</h1>
        <p style={{ margin: '0 0 40px 0', fontSize: '14px', color: '#888' }}>Log distances. Select clubs. Master the course.</p>
        <button
          onClick={handleSignIn}
          style={{
            padding: '14px 28px',
            background: '#1a5f3d',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: 'pointer',
            width: '100%',
            maxWidth: '320px',
          }}
        >
          Sign in with Google
        </button>
        {authError && (
          <p style={{ marginTop: '16px', fontSize: '12px', color: '#d63031', maxWidth: '320px', textAlign: 'center' }}>
            {authError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f4f1 0%, #e8ede8 100%)',
      fontFamily: '"Sohne", "Helvetica Neue", sans-serif',
      color: '#1a1a1a'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a5f3d 0%, #2d7a52 100%)',
        color: 'white',
        padding: '24px 20px 20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Target size={24} strokeWidth={1.5} />
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '600', letterSpacing: '-0.5px' }}>
              GolfPro Tracker
            </h1>
          </div>
          {/* Sign-out button shows the user's name and a logout icon */}
          <button
            onClick={handleSignOut}
            title="Sign out"
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '4px' }}
          >
            <span>{user.displayName?.split(' ')[0]}</span>
            <LogOut size={16} strokeWidth={1.5} />
          </button>
        </div>
        <p style={{ margin: '6px 0 0 0', fontSize: '13px', opacity: 0.8, fontWeight: '400' }}>
          Log distances. Select clubs. Master the course.
        </p>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px' }}>
        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '32px',
          borderBottom: '1px solid rgba(26, 26, 26, 0.1)',
          overflowX: 'auto',
        }}>
          {[
            { id: 'log', label: 'Log', icon: TrendingUp },
            { id: 'select', label: 'Club', icon: Target },
            { id: 'track', label: 'Track', icon: MapPin },
            { id: 'score', label: 'Score', icon: Flag },
            { id: 'bag', label: 'Bag', icon: GolfBagIcon },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '12px 12px',
                  background: 'none',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: activeTab === tab.id ? '600' : '400',
                  color: activeTab === tab.id ? '#1a5f3d' : '#888',
                  cursor: 'pointer',
                  borderBottom: activeTab === tab.id ? '2px solid #1a5f3d' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.3s ease',
                  marginBottom: '-1px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <Icon size={18} strokeWidth={1.5} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Log Distances Tab */}
        {activeTab === 'log' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '28px',
              marginBottom: '32px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <h2 style={{ margin: '0 0 24px 0', fontSize: '18px', fontWeight: '600' }}>
                Log a New Distance
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#666' }}>
                    Club
                  </label>
                  <select
                    value={selectedClub}
                    onChange={(e) => setSelectedClub(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      background: 'white',
                      cursor: 'pointer',
                      fontFamily: 'inherit'
                    }}
                  >
                    <option value="">Select a club...</option>
                    {clubs.map(club => (
                      <option key={club} value={club}>{club}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#666' }}>
                    Distance (yards)
                  </label>
                  <input
                    type="number"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    placeholder="e.g., 175"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                {[
                  { id: 'course', label: '⛳ Course' },
                  { id: 'range', label: '🏌️ Range' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setShotType(t.id)}
                    style={{
                      padding: '10px',
                      background: shotType === t.id ? '#1a5f3d' : '#f5f5f5',
                      color: shotType === t.id ? 'white' : '#888',
                      border: 'none', borderRadius: '6px',
                      fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                    }}
                  >{t.label}</button>
                ))}
              </div>

              <button
                onClick={handleAddDistance}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#1a5f3d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.target.style.background = '#144d2f'}
                onMouseLeave={(e) => e.target.style.background = '#1a5f3d'}
              >
                <Plus size={18} strokeWidth={2} />
                Add Distance
              </button>
            </div>

            {/* Distance History */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
              {clubs.filter(club => distances[club] && distances[club].length > 0).map(club => (
                <div key={club} style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  borderLeft: '4px solid #1a5f3d'
                }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>
                    {club}
                  </h3>
                  <div style={{
                    fontSize: '28px',
                    fontWeight: '700',
                    color: '#1a5f3d',
                    marginBottom: '12px',
                    letterSpacing: '-1px'
                  }}>
                    {getAverageDistance(club)} <span style={{ fontSize: '14px', color: '#888' }}>yds</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
                    {distances[club].length} shot{distances[club].length !== 1 ? 's' : ''} logged
                  </div>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    marginBottom: '12px',
                    maxHeight: '120px',
                    overflowY: 'auto',
                    paddingRight: '8px'
                  }}>
                    {distances[club].map((dist, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '13px',
                        padding: '6px',
                        background: '#f5f5f5',
                        borderRadius: '4px'
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {dist.value} yds
                          {dist.type === 'range' && (
                            <span style={{ fontSize: '10px', color: '#888', background: '#e8e8e8', padding: '1px 6px', borderRadius: '10px' }}>Range</span>
                          )}
                        </span>
                        <button
                          onClick={() => handleDeleteDistance(club, idx)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#ccc',
                            padding: '2px',
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.color = '#ff6b6b'}
                          onMouseLeave={(e) => e.target.style.color = '#ccc'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {Object.keys(distances).filter(club => distances[club]?.length > 0).length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
                <p style={{ fontSize: '15px', margin: '0' }}>No distances logged yet.</p>
                <p style={{ fontSize: '13px', margin: '8px 0 0 0', color: '#bbb' }}>Start by adding your first club distance above.</p>
              </div>
            )}
          </div>
        )}

        {/* Select Club Tab */}
        {activeTab === 'select' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '28px',
              marginBottom: '32px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <h2 style={{ margin: '0 0 24px 0', fontSize: '18px', fontWeight: '600' }}>
                Find the Right Club
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#666' }}>
                    Target Distance (yards)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g., 160"
                    onChange={(e) => setRecommendation(null)}
                    onBlur={(e) => {
                      if (e.target.value) handleGetRecommendation(parseFloat(e.target.value));
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#666' }}>
                    Wind Speed (mph)
                  </label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="range"
                      min="-30"
                      max="30"
                      value={wind}
                      onChange={(e) => {
                        setWind(parseFloat(e.target.value));
                        setRecommendation(null);
                      }}
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: '600', minWidth: '40px' }}>
                      {wind > 0 ? '⬅️' : wind < 0 ? '➡️' : '⏸'} {Math.abs(wind)}
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#999', margin: '6px 0 0 0' }}>
                    Positive = headwind, Negative = tailwind
                  </p>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#666' }}>
                  Elevation Change (feet)
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="range"
                    min="-200"
                    max="200"
                    value={elevation}
                    onChange={(e) => {
                      setElevation(parseFloat(e.target.value));
                      setRecommendation(null);
                    }}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: '600', minWidth: '40px' }}>
                    {elevation > 0 ? '⬆️' : elevation < 0 ? '⬇️' : '➡️'} {Math.abs(elevation)}
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: '#999', margin: '6px 0 0 0' }}>
                  Positive = uphill, Negative = downhill
                </p>
              </div>

              {/* Reset both sliders to zero and clear any active recommendation */}
              {(wind !== 0 || elevation !== 0) && (
                <button
                  onClick={() => {
                    setWind(0);
                    setElevation(0);
                    setRecommendation(null);
                  }}
                  style={{
                    marginTop: '20px',
                    width: '100%',
                    padding: '10px',
                    background: 'none',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#888',
                    cursor: 'pointer',
                  }}
                >
                  Reset Wind &amp; Elevation
                </button>
              )}
            </div>

            {/* Recommendation */}
            {recommendation && (
              <div style={{
                background: recommendation.error ? '#fff5f5' : 'white',
                borderRadius: '12px',
                padding: '28px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                borderLeft: `4px solid ${recommendation.error ? '#ff6b6b' : '#1a5f3d'}`
              }}>
                {recommendation.error ? (
                  <p style={{ margin: 0, color: '#d63031', fontSize: '15px' }}>
                    {recommendation.error}
                  </p>
                ) : (
                  <>
                    <div style={{ marginBottom: '24px' }}>
                      <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#888', fontWeight: '600' }}>
                        RECOMMENDED CLUB
                      </p>
                      <div style={{
                        fontSize: '48px',
                        fontWeight: '700',
                        color: '#1a5f3d',
                        letterSpacing: '-2px',
                        marginBottom: '8px'
                      }}>
                        {recommendation.club}
                      </div>
                      <p style={{ margin: '0', fontSize: '15px', color: '#666' }}>
                        Est. distance: <strong>{recommendation.baseDistance} yards</strong>
                      </p>
                      <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#aaa' }}>
                        {recommendation.userShots === 0
                          ? 'Based on your baseline — log shots to personalize'
                          : `Based on ${recommendation.userShots} logged shot${recommendation.userShots !== 1 ? 's' : ''} + baseline`}
                      </p>
                    </div>

                    <div style={{
                      background: '#f5f5f5',
                      borderRadius: '8px',
                      padding: '16px',
                      marginBottom: '20px'
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#999', fontWeight: '600' }}>
                            ADJUSTED DISTANCE
                          </p>
                          <p style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1a5f3d' }}>
                            {recommendation.adjustedDistance} yds
                          </p>
                        </div>
                        <div>
                          <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#999', fontWeight: '600' }}>
                            CONFIDENCE
                          </p>
                          <p style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1a5f3d' }}>
                            {recommendation.accuracy}%
                          </p>
                        </div>
                      </div>
                    </div>

                    {recommendation.adjustmentNotes.length > 0 && (
                      <div>
                        <p style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: '600', color: '#666' }}>
                          ADJUSTMENTS
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {recommendation.adjustmentNotes.map((note, idx) => (
                            <div key={idx} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '14px',
                              color: '#666'
                            }}>
                              <span style={{ fontSize: '16px' }}>📊</span>
                              {note}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {!recommendation && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
                <Target size={40} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p style={{ fontSize: '15px', margin: '0 0 8px 0' }}>Enter a target distance to get a recommendation.</p>
                <p style={{ fontSize: '13px', margin: '0', color: '#bbb' }}>Adjust wind and elevation for more accuracy.</p>
              </div>
            )}
          </div>
        )}

        {/* My Bag Tab */}
        {activeTab === 'bag' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '28px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>My Bag</h2>
                {editingBag ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => { setBagInputs({}); setEditingBag(false); }}
                      style={{ padding: '8px 14px', background: 'none', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', fontWeight: '600', color: '#888', cursor: 'pointer' }}
                    >Cancel</button>
                    <button
                      onClick={handleSaveBag}
                      style={{ padding: '8px 14px', background: '#1a5f3d', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', color: 'white', cursor: 'pointer' }}
                    >Save</button>
                  </div>
                ) : (
                  <button
                    onClick={handleEditBag}
                    style={{ padding: '8px 14px', background: 'none', border: '1px solid #1a5f3d', borderRadius: '6px', fontSize: '13px', fontWeight: '600', color: '#1a5f3d', cursor: 'pointer' }}
                  >
                    {clubs.length > 0 ? 'Update Base Distances' : 'Add Base Distances'}
                  </button>
                )}
              </div>

              {!editingBag && clubs.length > 0 && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 100px',
                  gap: '8px', padding: '0 12px 8px',
                  fontSize: '11px', fontWeight: '600', color: '#bbb', letterSpacing: '0.5px',
                }}>
                  <span>CLUB</span>
                  <span style={{ textAlign: 'center' }}>CURRENT</span>
                </div>
              )}

              {editingBag ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '20px 1fr 80px',
                    gap: '8px', padding: '0 4px 6px',
                    fontSize: '11px', fontWeight: '600', color: '#bbb', letterSpacing: '0.5px',
                  }}>
                    <span />
                    <span>CLUB NAME</span>
                    <span style={{ textAlign: 'center' }}>YARDS</span>
                  </div>
                  {bagEditSlots.map((slot, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 80px', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: '#ccc', textAlign: 'right' }}>{idx + 1}</span>
                      <input
                        type="text"
                        placeholder="Club name"
                        value={slot.name}
                        onChange={e => {
                          const updated = [...bagEditSlots];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setBagEditSlots(updated);
                        }}
                        style={{
                          padding: '7px 10px', fontSize: '14px',
                          border: '1px solid #ddd', borderRadius: '6px',
                          fontFamily: 'inherit', boxSizing: 'border-box',
                        }}
                      />
                      <input
                        type="number"
                        placeholder="—"
                        value={slot.distance}
                        onChange={e => {
                          const updated = [...bagEditSlots];
                          updated[idx] = { ...updated[idx], distance: e.target.value };
                          setBagEditSlots(updated);
                        }}
                        style={{
                          padding: '7px 8px', fontSize: '14px', fontWeight: '600',
                          border: '1px solid #ddd', borderRadius: '6px',
                          textAlign: 'center', fontFamily: 'inherit', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {clubs.length > 0 ? clubs.map((club, idx) => {
                      const { blended, userShots } = getBlendedDistance(club);
                      const hasData = (club in baseDistances) || userShots > 0;
                      const displayValue = hasData ? Math.round(blended) : 0;
                      return (
                        <div
                          key={club}
                          style={{
                            display: 'grid', gridTemplateColumns: '1fr 100px',
                            gap: '8px', alignItems: 'center',
                            padding: '10px 12px', borderRadius: '8px',
                            background: idx % 2 === 0 ? '#fafafa' : 'white',
                          }}
                        >
                          <span style={{ fontSize: '14px', fontWeight: '500' }}>{club}</span>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: hasData ? '#1a5f3d' : '#ccc' }}>
                              {displayValue}
                            </div>
                            {userShots > 0 && (
                              <div style={{ fontSize: '10px', color: '#bbb' }}>
                                {userShots} shot{userShots !== 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }) : (
                      <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#bbb', textAlign: 'center' }}>
                        Use "Add Base Distances" to set up your clubs.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Track Shot Tab — renders outside the padded content div below */}
      </div>

      {activeTab === 'track' && (
        <ShotTracker
          clubs={clubs}
          onLogDistance={(club, yards) =>
            setDistances(prev => ({
              ...prev,
              [club]: [...(prev[club] || []), { value: yards, type: 'course' }],
            }))
          }
        />
      )}

      {activeTab === 'score' && (
        <Scorecard user={user} db={db} />
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default GolfTrackerApp;
