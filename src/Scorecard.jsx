import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, query, orderBy, setDoc, doc } from 'firebase/firestore';

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
  hazard: false,
  bunker: false,
});

const Scorecard = ({ user, db }) => {
  const [round, setRound] = useState(null);
  const [currentHole, setCurrentHole] = useState(0);
  const [roundDocId, setRoundDocId] = useState(null);
  const [pastRounds, setPastRounds] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courseName, setCourseName] = useState('');
  const [rating, setRating] = useState('');
  const [slope, setSlope] = useState('');

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

  const startRound = async (numHoles) => {
    const newRound = {
      date: new Date().toLocaleDateString('en-CA'),
      holes: numHoles,
      completed: false,
      abandoned: false,
      holeData: Array.from({ length: numHoles }, (_, i) => makeHole(i)),
      course: courseName ? { name: courseName } : null,
      rating: rating ? parseFloat(rating) : null,
      slope: slope ? parseInt(slope, 10) : null,
    };
    const ref = await addDoc(collection(db, 'users', user.uid, 'rounds'), newRound);
    setRoundDocId(ref.id);
    setRound(newRound);
    setCurrentHole(0);
  };

  const updateHole = (field, value) => {
    setRound(prev => {
      const data = [...prev.holeData];
      data[currentHole] = { ...data[currentHole], [field]: value };
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
    const data = [...round.holeData];
    const h = data[currentHole];
    data[currentHole] = {
      ...h,
      score: h.score ?? h.par,
      putts: h.putts ?? 2,
    };
    const updated = { ...round, holeData: data };
    setRound(updated);
    await persist(updated, roundDocId);
    setCurrentHole(idx);
  };

  const finishRound = async () => {
    const data = [...round.holeData];
    const h = data[currentHole];
    data[currentHole] = { ...h, score: h.score ?? h.par, putts: h.putts ?? 2 };
    const finished = { ...round, holeData: data, completed: true };
    setRound(finished);
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

  const resetToStart = () => {
    setRound(null);
    setRoundDocId(null);
    setCurrentHole(0);
    setShowHistory(false);
    setCourseName('');
    setRating('');
    setSlope('');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
        <p style={{ color: '#888' }}>Loading...</p>
      </div>
    );
  }

  // ── Round summary ─────────────────────────────────────────────────────────
  if (round?.completed && !round?.abandoned) {
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

    return (
      <div style={{ padding: '20px 16px 40px', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ background: 'white', borderRadius: '14px', padding: '24px', marginBottom: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#aaa', fontWeight: '700', letterSpacing: '0.5px' }}>ROUND COMPLETE · {round.date}</p>
          {round.course?.name && (
            <p style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: '600', color: '#1a1a1a' }}>{round.course.name}</p>
          )}
          <div style={{ fontSize: '60px', fontWeight: '700', letterSpacing: '-3px', color: diff === 0 ? '#1a1a1a' : diff < 0 ? '#ef4444' : '#1a5f3d', lineHeight: 1 }}>
            {diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '15px', color: '#888' }}>{totalScore} strokes · {totalPar} par</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          {[
            { label: 'FIR', value: drivingHoles.length ? `${firCount}/${drivingHoles.length}` : 'N/A' },
            { label: 'GIR', value: `${girCount}/${played.length}` },
            { label: 'Total Putts', value: totalPutts },
            { label: 'Avg Putts', value: played.length ? (totalPutts / played.length).toFixed(1) : '--' },
            { label: 'Hazards', value: hazards },
            { label: 'Bunkers', value: bunkers },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', borderRadius: '10px', padding: '14px 8px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <p style={{ margin: '0 0 4px', fontSize: '10px', color: '#aaa', fontWeight: '700', letterSpacing: '0.5px' }}>{s.label}</p>
              <p style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a5f3d' }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div style={{ background: 'white', borderRadius: '14px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflowX: 'auto' }}>
          <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>HOLE BY HOLE</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '360px' }}>
            <thead>
              <tr>
                {['#', 'Par', 'Yds', 'Score', 'FIR', 'GIR', 'Putts', 'Haz', 'Bkr'].map(h => (
                  <th key={h} style={{ padding: '4px 6px', color: '#bbb', fontWeight: '700', textAlign: 'center', fontSize: '11px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {round.holeData.map(h => (
                <tr key={h.hole} style={{ borderTop: '1px solid #f5f5f5' }}>
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
                  <td style={{ padding: '6px', textAlign: 'center' }}>{h.hazard ? '⚠️' : ''}</td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>{h.bunker ? '🟤' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={resetToStart}
          style={{ width: '100%', padding: '16px', background: '#1a5f3d', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}
        >
          Start New Round
        </button>
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
                <div key={r.id} style={{ background: 'white', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {pastCourses.map(c => (
                <button
                  key={c}
                  onClick={() => setCourseName(c)}
                  style={{ padding: '6px 12px', background: courseName === c ? '#1a5f3d' : '#f0f4f1', border: `1px solid ${courseName === c ? '#1a5f3d' : '#c8ddd2'}`, borderRadius: '20px', fontSize: '13px', color: courseName === c ? 'white' : '#1a5f3d', fontWeight: '600', cursor: 'pointer' }}
                >{c}</button>
              ))}
            </div>
          )}

          <input
            type="text"
            value={courseName}
            onChange={e => setCourseName(e.target.value)}
            placeholder="Type course name…"
            style={{ width: '100%', padding: '11px 12px', fontSize: '14px', border: '1px solid #e0e0e0', borderRadius: '8px', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />

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

  const TogglePair = ({ label, field, disabled }) => (
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
            >{val ? '✓ Hit' : '✗ Miss'}</button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* Green header strip */}
      <div style={{ padding: '14px 20px 16px', background: '#1a5f3d', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontSize: '11px', opacity: 0.75, fontWeight: '600', letterSpacing: '0.5px' }}>HOLE</p>
          <p style={{ margin: 0, fontSize: '32px', fontWeight: '700', letterSpacing: '-1.5px', lineHeight: 1 }}>
            {currentHole + 1}
            <span style={{ fontSize: '14px', opacity: 0.65, fontWeight: '400' }}> / {round.holes}</span>
          </p>
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

        {/* Hole yardage */}
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

        {/* Putts */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.5px' }}>PUTTS</p>
          <Stepper
            value={hole.putts ?? 2}
            onChange={v => updateHole('putts', v)}
            min={0}
            max={8}
          />
        </div>

        {/* Fairway + GIR */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <TogglePair label="FAIRWAY HIT" field="fairway" disabled={hole.par === 3} />
          <TogglePair label="GREEN IN REG" field="gir" disabled={false} />
        </div>

        {/* Hazard + Bunker */}
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

        {/* Navigation */}
        <div style={{ display: 'grid', gridTemplateColumns: currentHole > 0 ? '1fr 2fr' : '1fr', gap: '10px', marginBottom: '10px' }}>
          {currentHole > 0 && (
            <button
              onClick={() => goToHole(currentHole - 1)}
              style={{ padding: '16px', background: 'white', border: '1px solid #ddd', borderRadius: '10px', fontSize: '15px', fontWeight: '600', color: '#666', cursor: 'pointer' }}
            >← Prev</button>
          )}
          <button
            onClick={isLast ? finishRound : () => goToHole(currentHole + 1)}
            style={{ padding: '16px', background: '#1a5f3d', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}
          >
            {isLast ? 'Finish Round ✓' : 'Next Hole →'}
          </button>
        </div>

        <button
          onClick={abandonRound}
          style={{ width: '100%', padding: '12px', background: 'none', border: '1px solid #eee', borderRadius: '8px', fontSize: '13px', color: '#bbb', cursor: 'pointer', marginBottom: '20px' }}
        >
          Abandon Round
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
