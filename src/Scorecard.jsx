import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, orderBy, setDoc, doc } from 'firebase/firestore';
import { getRoundSummary, canUseAI, canUseShortGame } from './userGating';
import { calculateCourseHandicap } from './handicap';

const wmoToCondition = (code) => {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 48) return 'Fog';
  if (code <= 55) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  return 'Thunderstorm';
};

const scoreLabel = (score, par) => {
  const d = score - par;
  if (d <= -2) return 'Eagle';
  if (d === -1) return 'Birdie';
  if (d === 0) return 'Par';
  if (d === 1) return 'Bogey';
  if (d === 2) return 'Double';
  return 'Triple+';
};

const scoreColor = (score, par) => {
  if (score === null) return '#aaa';
  const d = score - par;
  if (d <= -2) return '#f59e0b';
  if (d === -1) return '#ef4444';
  if (d === 0) return '#1a1a1a';
  if (d === 1) return '#3b82f6';
  return '#7c3aed';
};

const ScoreCircle = ({ score, par, size = 24 }) => {
  if (score === null) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '4px',
        background: '#f0f0f0', color: '#ccc', fontSize: size * 0.46, fontWeight: '700',
      }}>·</span>
    );
  }
  const d = score - par;
  const isCircle = d <= -1;
  const isDoubleBox = d >= 2;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size,
      borderRadius: isCircle ? '50%' : '3px',
      outline: isDoubleBox ? `2.5px solid ${scoreColor(score, par)}` : 'none',
      outlineOffset: '2px',
      background: scoreColor(score, par),
      color: 'white',
      fontSize: size * 0.46, fontWeight: '700',
    }}>{score}</span>
  );
};

const Stepper = ({ value, onChange, min = 0, max = 15, size = 52 }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <button
      onClick={() => onChange(Math.max(min, value - 1))}
      style={{ width: 56, height: 56, background: '#f5f5f5', border: 'none', borderRadius: '10px', fontSize: '28px', fontWeight: '300', cursor: 'pointer', color: '#1a1a1a' }}
    >−</button>
    <span style={{ fontSize: size, fontWeight: '700', letterSpacing: '-2px', color: '#1a5f3d', minWidth: '64px', textAlign: 'center' }}>{value}</span>
    <button
      onClick={() => onChange(Math.min(max, value + 1))}
      style={{ width: 56, height: 56, background: '#f5f5f5', border: 'none', borderRadius: '10px', fontSize: '28px', fontWeight: '300', cursor: 'pointer', color: '#1a1a1a' }}
    >+</button>
  </div>
);

const makeHole = (i) => ({
  hole: i + 1,
  par: 4,
  yards: null,
  score: null,
  fairway: null,
  gir: null,
  putts: null,
  chip: 0,
  hazard: false,
  bunker: false,
  matchResult: null,
});

const Scorecard = ({ user, db, handicapIndex }) => {
  const [round, setRound] = useState(null);
  const [currentHole, setCurrentHole] = useState(0);
  const [roundDocId, setRoundDocId] = useState(null);
  const [pastRounds, setPastRounds] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courseName, setCourseName] = useState('');
  const [rating, setRating] = useState('');
  const [slope, setSlope] = useState('');
  const [tees, setTees] = useState('');
  const [roundDate, setRoundDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [ghostMode, setGhostMode] = useState('none');
  const [matchPlay, setMatchPlay] = useState(false);
  const [courseResults, setCourseResults] = useState([]);
  const [userLatLng, setUserLatLng] = useState(null);
  const [isEditingRound, setIsEditingRound] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const [preEditRound, setPreEditRound] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [statsDrawerHole, setStatsDrawerHole] = useState(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      pos => setUserLatLng({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

  useEffect(() => { setAiError(null); }, [round?.id]);

  useEffect(() => {
    if (courseName.length < 3) { setCourseResults([]); return; }
    const params = new URLSearchParams({ q: courseName, osm_tag: 'leisure:golf_course', limit: 8 });
    if (userLatLng) { params.set('lat', userLatLng.lat); params.set('lon', userLatLng.lng); }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://photon.komoot.io/api/?${params}`);
        const data = await res.json();
        const names = [...new Set(data.features.map(f => f.properties?.name).filter(Boolean))];
        setCourseResults(names.slice(0, 8));
      } catch { setCourseResults([]); }
    }, 400);
    return () => clearTimeout(t);
  }, [courseName, userLatLng]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const q = query(collection(db, 'users', user.uid, 'rounds'), orderBy('date', 'desc'));
        const snap = await getDocs(q);
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const active = all.find(r => !r.completed && !r.abandoned);
        if (active) {
          setRound(active);
          setRoundDocId(active.id);
          const first = active.holeData.findIndex(h => h.score === null);
          setCurrentHole(first === -1 ? 0 : first);
        }
        setPastRounds(all.filter(r => r.completed && !r.abandoned));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [user]);

  const persist = async (r, id) => {
    if (!id) return;
    try { await setDoc(doc(db, 'users', user.uid, 'rounds', id), r); }
    catch (e) { console.error(e); }
  };

  const computeGhostScores = (numHoles) => {
    if (ghostMode === 'none' || !courseName) return null;
    const courseRounds = pastRounds.filter(r =>
      r.course?.name?.toLowerCase() === courseName.toLowerCase()
    );
    if (courseRounds.length === 0) return null;
    if (ghostMode === 'best-round') {
      const best = courseRounds.reduce((a, b) => {
        const aTotal = a.holeData.reduce((s, h) => s + (h.score ?? h.par), 0);
        const bTotal = b.holeData.reduce((s, h) => s + (h.score ?? h.par), 0);
        return aTotal <= bTotal ? a : b;
      });
      return Array.from({ length: numHoles }, (_, i) => best.holeData[i]?.score ?? null);
    }
    if (ghostMode === 'best-hole') {
      return Array.from({ length: numHoles }, (_, i) => {
        const scores = courseRounds.map(r => r.holeData[i]?.score).filter(s => s != null);
        return scores.length > 0 ? Math.min(...scores) : null;
      });
    }
    return null;
  };

  const startRound = async (numHoles) => {
    const normTees = tees.trim().toLowerCase();
    const normCourse = courseName.trim().toLowerCase();
    const preloadRound = normCourse && normTees
      ? pastRounds.find(r =>
          r.course?.name?.trim().toLowerCase() === normCourse &&
          r.tees?.trim().toLowerCase() === normTees
        )
      : null;

    const holeData = Array.from({ length: numHoles }, (_, i) => {
      const base = makeHole(i);
      if (preloadRound && preloadRound.holeData[i]) {
        const src = preloadRound.holeData[i];
        return { ...base, par: src.par ?? base.par, yards: src.yards ?? base.yards };
      }
      return base;
    });

    let weather = null;
    const today = new Date().toLocaleDateString('en-CA');
    if (roundDate === today && userLatLng) {
      try {
        const { lat, lng } = userLatLng;
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
        );
        const data = await res.json();
        weather = {
          tempF: Math.round(data.current.temperature_2m),
          windMph: Math.round(data.current.wind_speed_10m),
          windDirDeg: Math.round(data.current.wind_direction_10m),
          condition: wmoToCondition(data.current.weather_code),
        };
      } catch {}
    }

    const newRound = {
      date: roundDate,
      holes: numHoles,
      completed: false,
      abandoned: false,
      holeData,
      course: courseName ? { name: courseName } : null,
      tees: tees.trim() || null,
      rating: rating ? parseFloat(rating) : (preloadRound?.rating ?? null),
      slope: slope ? parseInt(slope, 10) : (preloadRound?.slope ?? null),
      ghostMode,
      ghostScores: computeGhostScores(numHoles),
      matchPlay,
      weather,
    };
    const ref = await addDoc(collection(db, 'users', user.uid, 'rounds'), newRound);
    setRoundDocId(ref.id);
    setRound(newRound);
    setCurrentHole(0);
  };

  const updateHole = (field, value) => {
    setRound(prev => {
      const data = [...prev.holeData];
      const updated = { ...data[currentHole], [field]: value };
      if (field === 'score' || field === 'putts') {
        const score = field === 'score' ? value : updated.score;
        const putts = field === 'putts' ? value : (updated.putts ?? 2);
        if (score !== null) {
          updated.gir = (score - putts) <= (updated.par - 2);
        }
      }
      data[currentHole] = updated;
      return { ...prev, holeData: data };
    });
  };

  const updatePar = (newPar) => {
    setRound(prev => {
      const data = [...prev.holeData];
      const h = data[currentHole];
      // keep score tracking relative to par — if score matched old par, move it to new par
      data[currentHole] = { ...h, par: newPar, score: h.score === h.par ? newPar : h.score };
      return { ...prev, holeData: data };
    });
  };

  // Commit current hole (default score/putts if untouched) then navigate
  const goToHole = async (idx) => {
    if (isEditingRound) { setCurrentHole(idx); return; }
    const data = [...round.holeData];
    const h = data[currentHole];
    const score = h.score ?? h.par;
    const putts = h.putts ?? 2;
    data[currentHole] = {
      ...h,
      score,
      putts,
      gir: (score - putts) <= (h.par - 2),
    };
    const updated = { ...round, holeData: data };
    setRound(updated);
    await persist(updated, roundDocId);
    setCurrentHole(idx);
  };

  const finishRound = async () => {
    const data = [...round.holeData];
    const h = data[currentHole];
    const score = h.score ?? h.par;
    const putts = h.putts ?? 2;
    data[currentHole] = { ...h, score, putts, gir: (score - putts) <= (h.par - 2) };
    const finished = { ...round, holeData: data, completed: true };
    setRound(finished);
    setJustFinished(true);
    await persist(finished, roundDocId);
    setPastRounds(prev => [{ id: roundDocId, ...finished }, ...prev]);
  };

  const abandonRound = async () => {
    if (!window.confirm('Abandon this round?')) return;
    if (roundDocId) await persist({ ...round, abandoned: true, completed: true }, roundDocId);
    setRound(null);
    setRoundDocId(null);
    setCurrentHole(0);
  };

  const updateHoleStatsField = (holeIdx, field, value) => {
    setRound(prev => {
      const data = [...prev.holeData];
      const updated = { ...data[holeIdx], [field]: value };
      if (field === 'putts' && updated.score !== null) {
        updated.gir = (updated.score - value) <= (updated.par - 2);
      }
      data[holeIdx] = updated;
      return { ...prev, holeData: data };
    });
  };

  const saveHoleStats = async () => {
    const id = round.id ?? roundDocId;
    await persist(round, id);
    setPastRounds(prev => prev.map(r => r.id === id ? { id, ...round } : r));
    setStatsDrawerHole(null);
  };

  const saveEdits = async () => {
    await persist(round, roundDocId);
    setPastRounds(prev => prev.map(r => r.id === roundDocId ? { id: roundDocId, ...round } : r));
    setIsEditingRound(false);
    setPreEditRound(null);
  };

  const cancelEdit = () => {
    setRound(preEditRound);
    setIsEditingRound(false);
    setPreEditRound(null);
  };

  const resetToStart = () => {
    setRound(null);
    setRoundDocId(null);
    setCurrentHole(0);
    setShowHistory(false);
    setCourseName('');
    setRating('');
    setSlope('');
    setTees('');
    setJustFinished(false);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
        <p style={{ color: '#888' }}>Loading...</p>
      </div>
    );
  }

  // ── Round summary ─────────────────────────────────────────────────────────
  if (round?.completed && !round?.abandoned && !isEditingRound) {
    const played = round.holeData.filter(h => h.score !== null);
    const totalScore = played.reduce((s, h) => s + h.score, 0);
    const totalPar = played.reduce((s, h) => s + h.par, 0);
    const diff = totalScore - totalPar;
    const drivingHoles = played.filter(h => h.par !== 3);
    const firCount = drivingHoles.filter(h => h.fairway === true).length;
    const girCount = played.filter(h => h.gir === true).length;
    const totalPutts = played.reduce((s, h) => s + (h.putts ?? 0), 0);
    const hazards = played.filter(h => h.hazard).length;
    const bunkers = played.filter(h => h.bunker).length;
    const threePutts = played.filter(h => (h.putts ?? 0) >= 3).length;
    const missedGIR = played.filter(h => h.gir === false);
    const scrambling = missedGIR.filter(h => h.score <= h.par).length;
    const sandSaves = played.filter(h => h.bunker && h.score <= h.par).length;
    const handicapDiff = round.rating && round.slope
      ? ((totalScore - round.rating) * 113 / round.slope).toFixed(1)
      : null;
    const courseHandicap = calculateCourseHandicap(handicapIndex, round.slope, round.rating, totalPar);

    const sumBalance = (holes) => holes
      .filter(h => h.matchResult != null)
      .reduce((s, h) => s + (h.matchResult === 'won' ? 1 : h.matchResult === 'lost' ? -1 : 0), 0);
    const nassauLabel = (n) => n === 0 ? 'All Square' : n > 0 ? `${n} Up` : `${Math.abs(n)} Down`;
    const finalFront = round.matchPlay ? sumBalance(round.holeData.slice(0, 9)) : null;
    const finalBack  = round.matchPlay ? sumBalance(round.holeData.slice(9))    : null;
    const finalTotal = round.matchPlay ? sumBalance(round.holeData)             : null;

    const scoringBreakdown = [
      { label: 'Eagle', color: '#f59e0b', count: played.filter(h => h.score <= h.par - 2).length },
      { label: 'Birdie', color: '#ef4444', count: played.filter(h => h.score === h.par - 1).length },
      { label: 'Par', color: '#1a1a1a', count: played.filter(h => h.score === h.par).length },
      { label: 'Bogey', color: '#3b82f6', count: played.filter(h => h.score === h.par + 1).length },
      { label: 'Double', color: '#7c3aed', count: played.filter(h => h.score === h.par + 2).length },
      { label: 'Triple+', color: '#9f1239', count: played.filter(h => h.score >= h.par + 3).length },
    ].filter(c => c.count > 0);

    const parTypes = [3, 4, 5].map(par => {
      const holes = played.filter(h => h.par === par);
      if (holes.length === 0) return null;
      const totalDiff = holes.reduce((s, h) => s + (h.score - h.par), 0);
      return { par, count: holes.length, totalDiff };
    }).filter(Boolean);

    const currentRoundId = round.id ?? roundDocId;
    const courseHistory = round.course?.name
      ? pastRounds.filter(r =>
          r.course?.name?.toLowerCase() === round.course.name.toLowerCase() &&
          r.id !== currentRoundId
        )
      : [];

    let histAvgs = null;
    if (courseHistory.length > 0) {
      const hStats = courseHistory.map(r => {
        const p = r.holeData.filter(h => h.score !== null);
        const drv = p.filter(h => h.par !== 3);
        const tp = p.reduce((s, h) => s + (h.putts ?? 0), 0);
        const missedG = p.filter(h => h.gir === false);
        return {
          fir: drv.length ? drv.filter(h => h.fairway === true).length / drv.length : null,
          gir: p.length ? p.filter(h => h.gir === true).length / p.length : null,
          scrambling: missedG.length ? missedG.filter(h => h.score <= h.par).length / missedG.length : null,
          sandSaveRate: p.filter(h => h.bunker).length > 0 ? p.filter(h => h.bunker && h.score <= h.par).length / p.filter(h => h.bunker).length : null,
          totalPutts: tp,
          avgPutts: p.length ? tp / p.length : null,
          threePutts: p.filter(h => (h.putts ?? 0) >= 3).length,
          hazards: p.filter(h => h.hazard).length,
          bunkers: p.filter(h => h.bunker).length,
          parDiffs: [3, 4, 5].reduce((acc, par) => {
            const holes = p.filter(h => h.par === par);
            if (holes.length) acc[par] = holes.reduce((s, h) => s + (h.score - h.par), 0);
            return acc;
          }, {}),
        };
      });

      const avgNum = (key) => {
        const vals = hStats.map(s => s[key]).filter(v => v !== null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      };
      const fmtPct = (key) => { const v = avgNum(key); return v !== null ? `avg ${Math.round(v * 100)}%` : null; };
      const fmtNum = (key, dec) => { const v = avgNum(key); return v !== null ? `avg ${v.toFixed(dec)}` : null; };

      const parAvgs = {};
      [3, 4, 5].forEach(par => {
        const vals = hStats.map(s => s.parDiffs[par]).filter(v => v !== undefined);
        if (vals.length) parAvgs[par] = vals.reduce((a, b) => a + b, 0) / vals.length;
      });

      histAvgs = {
        fir: fmtPct('fir'),
        gir: fmtPct('gir'),
        scrambling: fmtPct('scrambling'),
        sandSaves: fmtPct('sandSaveRate'),
        totalPutts: fmtNum('totalPutts', 0),
        avgPutts: fmtNum('avgPutts', 1),
        threePutts: fmtNum('threePutts', 1),
        hazards: fmtNum('hazards', 1),
        bunkers: fmtNum('bunkers', 1),
        parAvgs,
        n: courseHistory.length,
      };
    }

    return (
      <div style={{ padding: '20px 16px 40px', maxWidth: '600px', margin: '0 auto' }}>
        {pastRounds.length > 0 && (
          <button onClick={() => { setRound(null); setShowHistory(true); }} style={{ background: 'none', border: 'none', color: '#1a5f3d', fontSize: '14px', fontWeight: '600', cursor: 'pointer', padding: '0 0 16px', display: 'block' }}>← History</button>
        )}
        <div style={{ background: 'white', borderRadius: '14px', padding: '24px', marginBottom: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#aaa', fontWeight: '700', letterSpacing: '0.5px' }}>
            ROUND COMPLETE ·{' '}
            <input
              key={`date-${currentRoundId}`}
              type="date"
              defaultValue={round.date}
              onBlur={async (e) => {
                const newDate = e.target.value;
                if (!newDate || newDate === round.date) return;
                const updated = { ...round, date: newDate };
                setRound(updated);
                setPastRounds(prev => prev.map(r => r.id === currentRoundId ? { ...r, date: newDate } : r));
                await persist(updated, currentRoundId);
              }}
              style={{ fontSize: '12px', color: '#aaa', fontWeight: '700', letterSpacing: '0.5px', border: 'none', borderBottom: '1px dashed #ccc', background: 'transparent', padding: '0 2px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
            />
          </p>
          {round.course?.name && (
            <p style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: '600', color: '#1a1a1a' }}>{round.course.name}</p>
          )}
          <input
            key={`tees-${currentRoundId}`}
            type="text"
            defaultValue={round.tees || ''}
            placeholder="Add tees…"
            onBlur={async (e) => {
              const newTees = e.target.value.trim() || null;
              if (newTees === (round.tees ?? null)) return;
              const updated = { ...round, tees: newTees };
              setRound(updated);
              setPastRounds(prev => prev.map(r => r.id === currentRoundId ? { ...r, tees: newTees } : r));
              await persist(updated, currentRoundId);
            }}
            style={{ fontSize: '12px', color: '#888', border: 'none', borderBottom: '1px dashed #ddd', background: 'transparent', textAlign: 'center', width: '120px', padding: '2px 4px', marginBottom: '10px', fontFamily: 'inherit', outline: 'none' }}
          />
          <div style={{ fontSize: '60px', fontWeight: '700', letterSpacing: '-3px', color: diff === 0 ? '#1a1a1a' : diff < 0 ? '#ef4444' : '#1a5f3d', lineHeight: 1 }}>
            {diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '15px', color: '#888' }}>{totalScore} strokes · {totalPar} par</p>
          {handicapIndex !== null && (
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#aaa' }}>Handicap Index: {handicapIndex}</p>
          )}
          {handicapDiff !== null && (
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#aaa' }}>Differential: {handicapDiff > 0 ? '+' : ''}{handicapDiff}</p>
          )}
          {courseHandicap !== null && (
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#aaa' }}>Course Handicap: {courseHandicap}</p>
          )}
        </div>

        {round.matchPlay && finalTotal !== null && (
          <div style={{ background: 'white', borderRadius: '14px', padding: '16px', marginBottom: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>NASSAU</p>
            {[
              { label: 'Front 9', val: finalFront },
              { label: 'Back 9',  val: finalBack  },
              { label: 'Overall', val: finalTotal  },
            ].map(({ label, val }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: '13px', color: '#888', fontWeight: '600' }}>{label}</span>
                <span style={{ fontSize: '15px', fontWeight: '700',
                  color: val > 0 ? '#1a5f3d' : val < 0 ? '#b91c1c' : '#1a1a1a' }}>
                  {nassauLabel(val)}
                </span>
              </div>
            ))}
          </div>
        )}

        {scoringBreakdown.length > 0 && (
          <div style={{ background: 'white', borderRadius: '14px', padding: '16px', marginBottom: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>SCORING</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {scoringBreakdown.map(c => (
                <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8f8f8', borderRadius: '20px', padding: '6px 12px' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a1a1a' }}>{c.count}</span>
                  <span style={{ fontSize: '12px', color: '#888' }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          {[
            { label: 'FIR', value: drivingHoles.length ? `${Math.round(firCount / drivingHoles.length * 100)}%` : 'N/A', frac: drivingHoles.length ? `${firCount}/${drivingHoles.length}` : null, hist: histAvgs?.fir },
            { label: 'GIR', value: `${Math.round(girCount / played.length * 100)}%`, frac: `${girCount}/${played.length}`, hist: histAvgs?.gir },
            { label: 'Scrambling', value: missedGIR.length ? `${Math.round(scrambling / missedGIR.length * 100)}%` : 'N/A', frac: missedGIR.length ? `${scrambling}/${missedGIR.length}` : null, hist: histAvgs?.scrambling },
            { label: 'Sand Saves', value: bunkers > 0 ? `${sandSaves}/${bunkers}` : 'N/A', hist: histAvgs?.sandSaves },
            { label: 'Putts', value: totalPutts, hist: histAvgs?.totalPutts },
            { label: 'Avg Putts', value: played.length ? (totalPutts / played.length).toFixed(1) : '--', hist: histAvgs?.avgPutts },
            { label: 'Hazards', value: hazards, hist: histAvgs?.hazards },
            { label: 'Bunkers', value: bunkers, hist: histAvgs?.bunkers },
            { label: '3-Putts', value: threePutts, hist: histAvgs?.threePutts },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', borderRadius: '10px', padding: '14px 8px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <p style={{ margin: '0 0 4px', fontSize: '10px', color: '#aaa', fontWeight: '700', letterSpacing: '0.5px' }}>{s.label}</p>
              {s.frac ? (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '20px', fontWeight: '700', color: '#1a5f3d' }}>{s.value}</span>
                  <span style={{ fontSize: '11px', color: '#ccc' }}>{s.frac}</span>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a5f3d' }}>{s.value}</p>
              )}
              {s.hist && <p style={{ margin: '3px 0 0', fontSize: '10px', color: '#ccc' }}>{s.hist}</p>}
            </div>
          ))}
        </div>

        {canUseShortGame(user) && (() => {
          const chipAttempts = played.reduce((s, h) => s + (h.chip ?? 0), 0);
          const chipMade = played.filter(h => (h.chip ?? 0) > 0 && h.score <= h.par).length;
          const sg = round.shortGame ?? {};
          const over50Attempted = sg.over50Attempted ?? 0;
          const over50Made = sg.over50Made ?? 0;
          const updateSG = async (key, val) => {
            const newSG = { ...(round.shortGame ?? {}), [key]: val };
            const updated = { ...round, shortGame: newSG };
            setRound(updated);
            setPastRounds(prev => prev.map(r => r.id === currentRoundId ? { ...r, shortGame: newSG } : r));
            await persist(updated, currentRoundId);
          };
          return (
            <div style={{ background: 'white', borderRadius: '14px', padding: '16px', marginBottom: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <p style={{ margin: '0 0 16px', fontSize: '12px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>SHORT GAME</p>

              <div style={{ marginBottom: '16px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>CHIP (&lt; 50 YDS)</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', textAlign: 'center' }}>
                  <div>
                    <p style={{ margin: '0 0 4px', fontSize: '10px', color: '#bbb', fontWeight: '700', letterSpacing: '0.5px' }}>ATTEMPTED</p>
                    <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#1a5f3d' }}>{chipAttempts}</p>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 4px', fontSize: '10px', color: '#bbb', fontWeight: '700', letterSpacing: '0.5px' }}>UP & DOWN</p>
                    <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#1a5f3d' }}>
                      {chipMade}
                      {chipAttempts > 0 && <span style={{ fontSize: '13px', color: '#bbb', fontWeight: '400', marginLeft: '4px' }}>{Math.round(chipMade / chipAttempts * 100)}%</span>}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>50–100 YDS</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {[
                    { sublabel: 'ATTEMPTED', key: 'over50Attempted', value: over50Attempted },
                    { sublabel: 'UP & DOWN', key: 'over50Made', value: over50Made },
                  ].map(({ sublabel, key, value }) => (
                    <div key={key} style={{ textAlign: 'center' }}>
                      <p style={{ margin: '0 0 8px', fontSize: '10px', color: '#bbb', fontWeight: '700', letterSpacing: '0.5px' }}>{sublabel}</p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <button
                          onClick={() => updateSG(key, Math.max(0, value - 1))}
                          style={{ width: 36, height: 36, background: '#f5f5f5', border: 'none', borderRadius: '8px', fontSize: '20px', cursor: 'pointer', color: '#1a1a1a', fontWeight: '300' }}
                        >−</button>
                        <span style={{ fontSize: '28px', fontWeight: '700', color: '#1a5f3d', minWidth: '28px', textAlign: 'center' }}>{value}</span>
                        <button
                          onClick={() => updateSG(key, Math.min(20, value + 1))}
                          style={{ width: 36, height: 36, background: '#f5f5f5', border: 'none', borderRadius: '8px', fontSize: '20px', cursor: 'pointer', color: '#1a1a1a', fontWeight: '300' }}
                        >+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {parTypes.length > 0 && (
          <div style={{ background: 'white', borderRadius: '14px', padding: '16px', marginBottom: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>BY PAR</p>
            <div style={{ display: 'grid', gridTemplateColumns: parTypes.map(() => '1fr').join(' '), gap: '10px' }}>
              {parTypes.map(({ par, count, totalDiff }) => {
                const hAvg = histAvgs?.parAvgs[par];
                const hStr = hAvg !== undefined
                  ? (hAvg === 0 ? 'avg E' : `avg ${hAvg > 0 ? '+' : ''}${hAvg.toFixed(1)}`)
                  : null;
                return (
                  <div key={par} style={{ textAlign: 'center', padding: '12px 8px', background: '#f8f8f8', borderRadius: '10px' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '10px', color: '#aaa', fontWeight: '700', letterSpacing: '0.5px' }}>PAR {par}</p>
                    <p style={{ margin: '0 0 2px', fontSize: '22px', fontWeight: '700', color: totalDiff === 0 ? '#1a1a1a' : totalDiff < 0 ? '#ef4444' : '#1a5f3d' }}>
                      {totalDiff === 0 ? 'E' : `${totalDiff > 0 ? '+' : ''}${totalDiff}`}
                    </p>
                    <p style={{ margin: 0, fontSize: '11px', color: '#aaa' }}>{count} hole{count !== 1 ? 's' : ''}</p>
                    {hStr && <p style={{ margin: '3px 0 0', fontSize: '10px', color: '#ccc' }}>{hStr}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ background: 'white', borderRadius: '14px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>HOLE BY HOLE</p>
            <p style={{ margin: 0, fontSize: '11px', color: '#bbb' }}>Tap a hole to add stats</p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '360px' }}>
            <thead>
              <tr>
                {['#', 'Par', 'Yds', 'Score', 'FIR', 'GIR', 'Putts', 'Pen'].map(h => (
                  <th key={h} style={{ padding: '4px 6px', color: '#bbb', fontWeight: '700', textAlign: 'center', fontSize: '11px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {round.holeData.map(h => (
                <tr key={h.hole} onClick={() => setStatsDrawerHole(h.hole - 1)} style={{ borderTop: '1px solid #f5f5f5', cursor: 'pointer' }}>
                  <td style={{ padding: '6px', textAlign: 'center', fontWeight: '700', color: '#666', fontSize: '12px' }}>{h.hole}</td>
                  <td style={{ padding: '6px', textAlign: 'center', color: '#aaa' }}>{h.par}</td>
                  <td style={{ padding: '6px', textAlign: 'center', color: '#888', fontSize: '11px' }}>{h.yards ?? '—'}</td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>
                    <ScoreCircle score={h.score} par={h.par} size={22} />
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center', fontSize: '13px', color: h.par === 3 ? '#ddd' : (h.fairway === true ? '#1a5f3d' : '#ef4444') }}>
                    {h.par === 3 ? '—' : (h.fairway === true ? '✓' : '✗')}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center', fontSize: '13px', color: h.gir === null ? '#ddd' : (h.gir ? '#1a5f3d' : '#ef4444') }}>
                    {h.gir === null ? '—' : (h.gir ? '✓' : '✗')}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center', color: '#666' }}>{h.putts ?? '—'}</td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>{h.hazard ? '⚠️' : ''}{h.bunker ? '🟤' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canUseAI(user) && (
          <div style={{ background: 'white', borderRadius: '14px', padding: '20px', marginBottom: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            {!round.aiSummary && (
              <button
                onClick={async () => {
                  setAiLoading(true);
                  setAiError(null);
                  try {
                    const text = await getRoundSummary(round);
                    const updated = { ...round, aiSummary: text };
                    setRound(updated);
                    setPastRounds(prev => prev.map(r => r.id === currentRoundId ? { ...r, aiSummary: text } : r));
                    await persist(updated, currentRoundId);
                  } catch (err) {
                    setAiError(err.message);
                  } finally {
                    setAiLoading(false);
                  }
                }}
                disabled={aiLoading}
                style={{ width: '100%', padding: '14px', background: aiLoading ? '#f0f0f0' : '#1a5f3d', color: aiLoading ? '#aaa' : 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: aiLoading ? 'default' : 'pointer' }}
              >
                {aiLoading ? 'Analyzing your round...' : '✨ AI Coaching Summary'}
              </button>
            )}
            {aiError && (
              <p style={{ margin: '0', fontSize: '13px', color: '#ef4444' }}>Error: {aiError}</p>
            )}
            {round.aiSummary && (
              <div>
                <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>AI COACHING SUMMARY</p>
                <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#1a1a1a', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{round.aiSummary}</p>
                <button
                  onClick={async () => {
                    setAiLoading(true);
                    setAiError(null);
                    try {
                      const text = await getRoundSummary(round);
                      const updated = { ...round, aiSummary: text };
                      setRound(updated);
                      setPastRounds(prev => prev.map(r => r.id === currentRoundId ? { ...r, aiSummary: text } : r));
                      await persist(updated, currentRoundId);
                    } catch (err) {
                      setAiError(err.message);
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                  disabled={aiLoading}
                  style={{ background: 'none', border: 'none', fontSize: '12px', color: '#bbb', cursor: aiLoading ? 'default' : 'pointer', padding: 0, textDecoration: 'underline' }}
                >
                  {aiLoading ? 'Regenerating...' : 'Regenerate'}
                </button>
              </div>
            )}
          </div>
        )}

        {justFinished && (
          <a
            href="https://www.ghin.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', width: '100%', padding: '16px', background: 'white', color: '#1a5f3d', border: '1px solid #1a5f3d', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', marginBottom: '10px', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
          >
            Post to GHIN
          </a>
        )}
        <button
          onClick={() => {
            setRoundDocId(round.id ?? roundDocId);
            setPreEditRound({ ...round, holeData: round.holeData.map(h => ({ ...h })) });
            setIsEditingRound(true);
            setCurrentHole(round.holes - 1);
          }}
          style={{ width: '100%', padding: '16px', background: 'white', color: '#1a5f3d', border: '1px solid #1a5f3d', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', marginBottom: '10px' }}
        >
          Edit Round
        </button>
        <button
          onClick={resetToStart}
          style={{ width: '100%', padding: '16px', background: '#1a5f3d', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}
        >
          Start New Round
        </button>

        {/* Post-round hole stats drawer */}
        {statsDrawerHole !== null && (() => {
          const dh = round.holeData[statsDrawerHole];
          return (
            <>
              <div onClick={() => setStatsDrawerHole(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }} />
              <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderRadius: '20px 20px 0 0', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)', padding: '16px 16px 32px', zIndex: 1000, maxHeight: '80vh', overflowY: 'auto' }}>
                <div style={{ width: '40px', height: '4px', background: '#e0e0e0', borderRadius: '2px', margin: '0 auto 16px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={() => setStatsDrawerHole(i => Math.max(0, i - 1))} disabled={statsDrawerHole === 0} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: statsDrawerHole === 0 ? 'default' : 'pointer', color: statsDrawerHole === 0 ? '#ddd' : '#1a5f3d', padding: '0' }}>‹</button>
                    <p style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>Hole {dh.hole} — Par {dh.par}</p>
                    <button onClick={() => setStatsDrawerHole(i => Math.min(round.holes - 1, i + 1))} disabled={statsDrawerHole === round.holes - 1} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: statsDrawerHole === round.holes - 1 ? 'default' : 'pointer', color: statsDrawerHole === round.holes - 1 ? '#ddd' : '#1a5f3d', padding: '0' }}>›</button>
                  </div>
                  <button onClick={() => setStatsDrawerHole(null)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#aaa', lineHeight: 1 }}>×</button>
                </div>

                <div style={{ background: '#f8f8f8', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px' }}>
                  <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>Score: <strong style={{ color: '#1a1a1a' }}>{dh.score ?? '—'}</strong></p>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>PUTTS</p>
                  <Stepper value={dh.putts ?? 2} onChange={v => updateHoleStatsField(statsDrawerHole, 'putts', v)} min={0} max={8} />
                </div>

                {canUseShortGame(user) && (
                  <div style={{ marginBottom: '14px' }}>
                    <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>CHIPS (&lt; 50 YDS)</p>
                    <Stepper value={dh.chip ?? 0} onChange={v => updateHoleStatsField(statsDrawerHole, 'chip', v)} min={0} max={8} />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  {[
                    { key: 'hazard', label: 'HAZARD / OB', icon: '⚠️' },
                    { key: 'bunker', label: 'BUNKER', icon: '🟤' },
                  ].map(({ key, label, icon }) => (
                    <button
                      key={key}
                      onClick={() => updateHoleStatsField(statsDrawerHole, key, !dh[key])}
                      style={{ padding: '14px', textAlign: 'left', cursor: 'pointer', background: dh[key] ? '#fffbeb' : 'white', border: `2px solid ${dh[key] ? '#f59e0b' : '#f0f0f0'}`, borderRadius: '12px' }}
                    >
                      <p style={{ margin: '0 0 4px', fontSize: '20px' }}>{icon}</p>
                      <p style={{ margin: '0 0 2px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>{label}</p>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: dh[key] ? '#f59e0b' : '#aaa' }}>{dh[key] ? 'Yes' : 'No'}</p>
                    </button>
                  ))}
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>HOLE DISTANCE (yds)</p>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={dh.yards ?? ''}
                    onChange={e => updateHoleStatsField(statsDrawerHole, 'yards', e.target.value === '' ? null : parseInt(e.target.value, 10))}
                    placeholder="e.g. 385"
                    style={{ width: '100%', padding: '14px 12px', fontSize: '24px', fontWeight: '700', border: '1px solid #e8e8e8', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1a5f3d', textAlign: 'center' }}
                  />
                </div>

                <button onClick={saveHoleStats} style={{ width: '100%', padding: '16px', background: '#1a5f3d', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
                  Save
                </button>
              </div>
            </>
          );
        })()}
      </div>
    );
  }

  // ── History view ──────────────────────────────────────────────────────────
  if (showHistory) {
    return (
      <div style={{ padding: '20px 16px 40px', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', color: '#1a5f3d', fontSize: '15px', fontWeight: '600', cursor: 'pointer', padding: '8px 0' }}>← Back</button>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Round History</h2>
        </div>
        {pastRounds.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#aaa', padding: '40px 0' }}>No completed rounds yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pastRounds.map(r => {
              const played = r.holeData.filter(h => h.score !== null);
              const total = played.reduce((s, h) => s + h.score, 0);
              const par = played.reduce((s, h) => s + h.par, 0);
              const d = total - par;
              return (
                <div key={r.id} onClick={() => { setRound(r); setShowHistory(false); setJustFinished(false); }} style={{ background: 'white', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div>
                    <p style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: '600' }}>{r.course?.name ?? r.date}</p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#aaa' }}>{r.course?.name ? `${r.date} · ` : ''}{r.holes} holes</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: '26px', fontWeight: '700', letterSpacing: '-1px', color: d === 0 ? '#1a1a1a' : d < 0 ? '#ef4444' : '#1a5f3d' }}>
                      {d === 0 ? 'E' : d > 0 ? `+${d}` : d}
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#aaa' }}>{total} strokes</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Start screen ──────────────────────────────────────────────────────────
  if (!round) {
    const pastCourses = [...new Set(pastRounds.map(r => r.course?.name).filter(Boolean))];
    const normTees = tees.trim().toLowerCase();
    const normCourse = courseName.trim().toLowerCase();
    const preloadMatch = normCourse && normTees
      ? pastRounds.find(r =>
          r.course?.name?.trim().toLowerCase() === normCourse &&
          r.tees?.trim().toLowerCase() === normTees
        )
      : null;
    return (
      <div style={{ padding: '32px 16px 40px', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '52px', marginBottom: '12px' }}>⛳</div>
          <h2 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: '700' }}>Scorekeeper</h2>
          <p style={{ margin: 0, fontSize: '14px', color: '#888' }}>Track fairways, greens, putts, hazards & bunkers.</p>
        </div>

        <div style={{ background: 'white', borderRadius: '14px', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <p style={{ margin: '0 0 12px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>COURSE (optional)</p>

          {pastCourses.length > 0 && (
            <select
              value={courseName}
              onChange={e => setCourseName(e.target.value)}
              style={{ width: '100%', padding: '11px 12px', fontSize: '14px', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit', color: courseName ? '#1a1a1a' : '#aaa', background: 'white', marginBottom: '12px', cursor: 'pointer' }}
            >
              <option value="">Select a previous course…</option>
              {pastCourses.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={courseName}
              onChange={e => setCourseName(e.target.value)}
              onBlur={() => setTimeout(() => setCourseResults([]), 150)}
              placeholder="Type course name…"
              style={{ width: '100%', padding: '11px 12px', fontSize: '14px', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            {courseResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', marginTop: '4px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                {courseResults.map(name => (
                  <div
                    key={name}
                    onMouseDown={() => { setCourseName(name); setCourseResults([]); }}
                    style={{ padding: '10px 12px', fontSize: '14px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                  >{name}</div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px', marginBottom: '6px' }}>RATING</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={rating}
                onChange={e => setRating(e.target.value)}
                placeholder="e.g. 72.1"
                style={{ width: '100%', padding: '10px 12px', fontSize: '16px', fontWeight: '600', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit', textAlign: 'center' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px', marginBottom: '6px' }}>SLOPE</label>
              <input
                type="number"
                inputMode="numeric"
                value={slope}
                onChange={e => setSlope(e.target.value)}
                placeholder="e.g. 131"
                style={{ width: '100%', padding: '10px 12px', fontSize: '16px', fontWeight: '600', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit', textAlign: 'center' }}
              />
            </div>
          </div>

          {(() => {
            const ch = calculateCourseHandicap(handicapIndex, parseInt(slope, 10), parseFloat(rating), 72);
            return ch !== null ? (
              <p style={{ margin: '10px 0 0', fontSize: '13px', color: '#1a5f3d', fontWeight: '600', textAlign: 'center' }}>
                Course Handicap: {ch}
              </p>
            ) : null;
          })()}

          <div style={{ marginTop: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px', marginBottom: '6px' }}>TEES</label>
            <input
              type="text"
              value={tees}
              onChange={e => setTees(e.target.value)}
              placeholder="e.g. Blue, White, Gold…"
              style={{ width: '100%', padding: '11px 12px', fontSize: '14px', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            {preloadMatch && (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#1a5f3d', fontWeight: '600' }}>
                Hole data from {preloadMatch.date} will load
              </p>
            )}
          </div>

          <div style={{ marginTop: '14px', overflow: 'hidden' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px', marginBottom: '6px' }}>DATE</label>
            <input
              type="date"
              value={roundDate}
              max={new Date().toLocaleDateString('en-CA')}
              onChange={e => setRoundDate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', fontSize: '16px', fontWeight: '600', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          {courseName && pastRounds.some(r => r.course?.name?.toLowerCase() === courseName.toLowerCase()) && (
            <div style={{ marginTop: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px', marginBottom: '8px' }}>GHOST ROUND</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                {[
                  { value: 'none', label: 'None' },
                  { value: 'best-round', label: 'Best Round' },
                  { value: 'best-hole', label: 'Best Hole' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setGhostMode(opt.value)}
                    style={{
                      padding: '10px 6px',
                      background: ghostMode === opt.value ? '#1a5f3d' : '#f0f4f1',
                      border: `1px solid ${ghostMode === opt.value ? '#1a5f3d' : '#c8ddd2'}`,
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: ghostMode === opt.value ? 'white' : '#1a5f3d',
                      cursor: 'pointer',
                    }}
                  >{opt.label}</button>
                ))}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#aaa', fontStyle: 'italic' }}>Ghost mode matches by course only, not by tees.</p>
            </div>
          )}

          <div style={{ marginTop: '14px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px', marginBottom: '8px' }}>NASSAU</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[{ value: false, label: 'Off' }, { value: true, label: 'On' }].map(opt => (
                <button
                  key={String(opt.value)}
                  onClick={() => setMatchPlay(opt.value)}
                  style={{
                    padding: '10px 6px',
                    background: matchPlay === opt.value ? '#1a5f3d' : '#f0f4f1',
                    border: `1px solid ${matchPlay === opt.value ? '#1a5f3d' : '#c8ddd2'}`,
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: matchPlay === opt.value ? 'white' : '#1a5f3d',
                    cursor: 'pointer',
                  }}
                >{opt.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          {[9, 18].map(n => (
            <button
              key={n}
              onClick={() => startRound(n)}
              style={{ padding: '28px 16px', background: '#1a5f3d', color: 'white', border: 'none', borderRadius: '14px', fontSize: '20px', fontWeight: '700', cursor: 'pointer' }}
            >
              {n} Holes
            </button>
          ))}
        </div>

        {pastRounds.length > 0 && (
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => setShowHistory(true)}
              style={{ background: 'none', border: 'none', color: '#1a5f3d', fontSize: '14px', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }}
            >
              View Past Rounds ({pastRounds.length})
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Active hole ───────────────────────────────────────────────────────────
  const hole = round.holeData[currentHole];
  const confirmed = round.holeData.filter(h => h.score !== null);
  const runningScore = confirmed.reduce((s, h) => s + h.score, 0);
  const runningPar = confirmed.reduce((s, h) => s + h.par, 0);
  const runningDiff = runningScore - runningPar;
  const isLast = currentHole === round.holes - 1;

  // Nassau helpers
  const calcBalance = (holes) => holes
    .filter(h => h.matchResult != null)
    .reduce((s, h) => s + (h.matchResult === 'won' ? 1 : h.matchResult === 'lost' ? -1 : 0), 0);
  const bLabel = (n) => n === 0 ? 'AS' : n > 0 ? `${n} UP` : `${Math.abs(n)} DN`;
  const frontBalance = round.matchPlay ? calcBalance(round.holeData.slice(0, 9)) : 0;
  const backBalance  = round.matchPlay ? calcBalance(round.holeData.slice(9))    : 0;
  const totalBalance = round.matchPlay ? calcBalance(round.holeData)             : 0;
  const onFront = currentHole < 9;

  const TogglePair = ({ label, field, disabled, trueLabel = '✓ Hit', falseLabel = '✗ Miss' }) => (
    <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>{label}</p>
      {disabled ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#ddd', textAlign: 'center' }}>N/A (par 3)</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          {[true, false].map(val => (
            <button
              key={String(val)}
              onClick={() => updateHole(field, hole[field] === val ? null : val)}
              style={{
                padding: '10px 4px',
                background: hole[field] === val ? (val ? '#1a5f3d' : '#ef4444') : '#f5f5f5',
                color: hole[field] === val ? 'white' : '#aaa',
                border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              }}
            >{val ? trueLabel : falseLabel}</button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* Green header strip */}
      <div style={{ padding: '14px 20px 16px', background: isEditingRound ? '#1a3a5f' : '#1a5f3d', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontSize: '11px', opacity: 0.75, fontWeight: '600', letterSpacing: '0.5px' }}>{isEditingRound ? 'EDITING · HOLE' : 'HOLE'}</p>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: '700', letterSpacing: '-1.5px', lineHeight: 1 }}>
            {currentHole + 1}
            <span style={{ fontSize: '14px', opacity: 0.65, fontWeight: '400' }}> / {round.holes}</span>
          </p>
          {round.ghostMode !== 'none' && round.ghostScores?.[currentHole] != null && (
            <p style={{ margin: '4px 0 0', fontSize: '11px', opacity: 0.8, fontWeight: '600', letterSpacing: '0.5px' }}>
              👻 {round.ghostScores[currentHole]}
            </p>
          )}
          {round.matchPlay && (
            <p style={{ margin: '4px 0 0', fontSize: '11px', opacity: 0.8, fontWeight: '600', letterSpacing: '0.5px' }}>
              🏌️ {onFront ? `F: ${bLabel(frontBalance)}` : `B: ${bLabel(backBalance)}`}  ·  T: {bLabel(totalBalance)}
            </p>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: '11px', opacity: 0.75, fontWeight: '600', letterSpacing: '0.5px' }}>THRU {confirmed.length}</p>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: '700', letterSpacing: '-1.5px', lineHeight: 1 }}>
            {confirmed.length === 0 ? 'E' : runningDiff === 0 ? 'E' : runningDiff > 0 ? `+${runningDiff}` : runningDiff}
          </p>
        </div>
      </div>

      <div style={{ padding: '14px 16px 0', maxWidth: '600px', margin: '0 auto' }}>
        {/* Par */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '14px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>PAR</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            {[3, 4, 5].map(p => (
              <button
                key={p}
                onClick={() => updatePar(p)}
                style={{
                  padding: '12px', background: hole.par === p ? '#1a5f3d' : '#f5f5f5',
                  color: hole.par === p ? 'white' : '#888',
                  border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: '700', cursor: 'pointer',
                }}
              >{p}</button>
            ))}
          </div>
        </div>

        {/* Hole yardage — edit mode only */}
        {isEditingRound && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>HOLE DISTANCE (yds)</p>
            <input
              type="number"
              inputMode="numeric"
              value={hole.yards ?? ''}
              onChange={e => updateHole('yards', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              placeholder="e.g. 385"
              style={{
                width: '100%', padding: '14px 12px', fontSize: '24px', fontWeight: '700',
                border: '1px solid #e8e8e8', borderRadius: '8px', boxSizing: 'border-box',
                fontFamily: 'inherit', color: '#1a5f3d', textAlign: 'center',
              }}
            />
          </div>
        )}

        {/* Fairway */}
        <div style={{ marginBottom: '10px' }}>
          <TogglePair label="FAIRWAY HIT" field="fairway" disabled={hole.par === 3} />
        </div>

        {/* Score */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>SCORE</p>
          <Stepper
            value={hole.score ?? hole.par}
            onChange={v => updateHole('score', v)}
            min={1}
            max={15}
          />
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: scoreColor(hole.score ?? hole.par, hole.par), textAlign: 'center', fontWeight: '600' }}>
            {scoreLabel(hole.score ?? hole.par, hole.par)}
          </p>
        </div>

        {/* Putts — edit mode only; enter post-round via hole stats drawer */}
        {isEditingRound && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>PUTTS</p>
            <Stepper
              value={hole.putts ?? 2}
              onChange={v => updateHole('putts', v)}
              min={0}
              max={8}
            />
          </div>
        )}

        {/* Chip < 50 yds — edit mode only */}
        {isEditingRound && canUseShortGame(user) && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>CHIPS (&lt; 50 YDS)</p>
            <Stepper
              value={hole.chip ?? 0}
              onChange={v => updateHole('chip', v)}
              min={0}
              max={8}
            />
          </div>
        )}

        {/* Hazard + Bunker — edit mode only */}
        {isEditingRound && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            {[
              { key: 'hazard', label: 'HAZARD / OB', icon: '⚠️' },
              { key: 'bunker', label: 'BUNKER', icon: '🟤' },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => updateHole(key, !hole[key])}
                style={{
                  padding: '14px', textAlign: 'left', cursor: 'pointer',
                  background: hole[key] ? '#fffbeb' : 'white',
                  border: `2px solid ${hole[key] ? '#f59e0b' : '#f0f0f0'}`,
                  borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <p style={{ margin: '0 0 4px', fontSize: '20px' }}>{icon}</p>
                <p style={{ margin: '0 0 2px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>{label}</p>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: hole[key] ? '#f59e0b' : '#ccc' }}>
                  {hole[key] ? 'Yes' : 'No'}
                </p>
              </button>
            ))}
          </div>
        )}

        {/* Match play result */}
        {round.matchPlay && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '14px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>NASSAU — THIS HOLE</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {[
                { value: 'won', label: 'Won', color: '#1a5f3d' },
                { value: 'halved', label: 'Halved', color: '#555' },
                { value: 'lost', label: 'Lost', color: '#b91c1c' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => updateHole('matchResult', hole.matchResult === opt.value ? null : opt.value)}
                  style={{
                    padding: '12px 6px',
                    background: hole.matchResult === opt.value ? opt.color : '#f5f5f5',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '700',
                    color: hole.matchResult === opt.value ? 'white' : '#aaa',
                    cursor: 'pointer',
                  }}
                >{opt.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'grid', gridTemplateColumns: currentHole > 0 ? '1fr 2fr' : '1fr', gap: '10px', marginBottom: '10px' }}>
          {currentHole > 0 && (
            <button
              onClick={() => goToHole(currentHole - 1)}
              style={{ padding: '16px', background: 'white', border: '1px solid #ddd', borderRadius: '10px', fontSize: '15px', fontWeight: '600', color: '#666', cursor: 'pointer' }}
            >← Prev</button>
          )}
          <button
            onClick={isLast ? (isEditingRound ? saveEdits : finishRound) : () => goToHole(currentHole + 1)}
            style={{ padding: '16px', background: isEditingRound ? '#1a3a5f' : '#1a5f3d', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}
          >
            {isLast ? (isEditingRound ? 'Save Changes ✓' : 'Finish Round ✓') : 'Next Hole →'}
          </button>
        </div>

        <button
          onClick={isEditingRound ? cancelEdit : abandonRound}
          style={{ width: '100%', padding: '12px', background: 'none', border: '1px solid #eee', borderRadius: '8px', fontSize: '13px', color: '#bbb', cursor: 'pointer', marginBottom: '20px' }}
        >
          {isEditingRound ? 'Cancel Edit' : 'Abandon Round'}
        </button>

        {/* Mini scorecard dots */}
        {round.holeData.length > 0 && (
          <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>SCORECARD</p>
            <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '4px' }}>
              {round.holeData.map((h, i) => (
                <button
                  key={i}
                  onClick={() => goToHole(i)}
                  style={{
                    minWidth: '32px', padding: '4px 2px', flexShrink: 0,
                    background: i === currentHole ? '#e8f0ec' : 'transparent',
                    border: `2px solid ${i === currentHole ? '#1a5f3d' : 'transparent'}`,
                    borderRadius: '6px', cursor: 'pointer', textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '9px', color: '#bbb', marginBottom: '3px', fontWeight: '600' }}>{h.hole}</div>
                  <ScoreCircle score={h.score} par={h.par} size={22} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Scorecard;
