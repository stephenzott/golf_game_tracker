import React, { useState, useEffect, useRef } from 'react';
// Icons from lucide-react used throughout the UI
import { TrendingUp, Wind, Mountain, Plus, Trash2, Target, LogOut } from 'lucide-react';
import { signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from './src/firebase.js';

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
  // Prevents saving back to Firestore immediately after loading data from it
  const justLoaded = useRef(false);

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
        setUser(firebaseUser);
        if (firebaseUser) {
          const docRef = doc(db, 'users', firebaseUser.uid);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            justLoaded.current = true;
            setDistances(snap.data().distances || {});
          }
        } else {
          setDistances({});
        }
        setLoading(false);
      });
    };

    init();
    return () => unsubscribe();
  }, []);

  // Whenever distances change, save to Firestore (skips the initial load to avoid a redundant write)
  useEffect(() => {
    if (!user) return;
    if (justLoaded.current) {
      justLoaded.current = false;
      return;
    }
    const docRef = doc(db, 'users', user.uid);
    setDoc(docRef, { distances });
  }, [distances, user]);

  // Redirect to Google sign-in (works on mobile; popups are often blocked)
  const handleSignIn = () => signInWithRedirect(auth, googleProvider);
  const handleSignOut = () => signOut(auth);

  // Full ordered list of clubs available for logging and recommendations
  const clubs = ['Driver', '3 Wood', '5 Wood', '2 Iron', '3 Iron', '4 Iron', '5 Iron', '6 Iron', '7 Iron', '8 Iron', '9 Iron', 'PW', 'GW', 'SW', 'LW'];

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
      [selectedClub]: [...(prev[selectedClub] || []), numDistance]
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

  // Returns the mean yardage for a club, rounded to one decimal place
  const getAverageDistance = (club) => {
    if (!distances[club] || distances[club].length === 0) return 0;
    const sum = distances[club].reduce((a, b) => a + b, 0);
    return (sum / distances[club].length).toFixed(1);
  };

  // Finds the best club for a given target distance, then adjusts for wind and elevation
  const handleGetRecommendation = (targetDistance) => {
    let bestClub = null;
    let closestDiff = Infinity;

    // Walk all clubs and pick the one whose average is closest to the target
    clubs.forEach(club => {
      const avgDist = parseFloat(getAverageDistance(club));
      if (avgDist > 0) {
        const diff = Math.abs(avgDist - targetDistance);
        if (diff < closestDiff) {
          closestDiff = diff;
          bestClub = { name: club, avgDist };
        }
      }
    });

    if (!bestClub) {
      setRecommendation({ error: 'No distance data logged yet. Log some distances first!' });
      return;
    }

    let adjustedDistance = bestClub.avgDist;
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
      const elevationAdjustment = (Math.abs(elevation) / 100) * elevationFactor * bestClub.avgDist;
      adjustedDistance = elevation > 0 ? adjustedDistance - elevationAdjustment : adjustedDistance + elevationAdjustment;
      adjustmentNotes.push(`${elevation > 0 ? 'Uphill' : 'Downhill'}: ${Math.abs(elevation)} ft`);
    }

    // Confidence (accuracy) reflects how closely the best club's average matched the target
    setRecommendation({
      club: bestClub.name,
      baseDistance: bestClub.avgDist,
      adjustedDistance: adjustedDistance.toFixed(1),
      adjustmentNotes,
      accuracy: (100 - (closestDiff / bestClub.avgDist * 100)).toFixed(0)
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
          gap: '8px',
          marginBottom: '32px',
          borderBottom: '1px solid rgba(26, 26, 26, 0.1)'
        }}>
          {[
            { id: 'log', label: 'Log Distances', icon: TrendingUp },
            { id: 'select', label: 'Select Club', icon: Target }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '12px 20px',
                  background: 'none',
                  border: 'none',
                  fontSize: '15px',
                  fontWeight: activeTab === tab.id ? '600' : '400',
                  color: activeTab === tab.id ? '#1a5f3d' : '#888',
                  cursor: 'pointer',
                  borderBottom: activeTab === tab.id ? '2px solid #1a5f3d' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.3s ease',
                  marginBottom: '-1px'
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
                        <span>{dist} yds</span>
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
                        Base distance: <strong>{recommendation.baseDistance} yards</strong>
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
      </div>

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
