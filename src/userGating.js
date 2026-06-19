const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const ALLOWED_AI_USERS = ['szott19@gmail.com', 'mfarotte@gmail.com', 'nquinn444@gmail.com'];

export const canUseAI = (user) => ALLOWED_AI_USERS.includes(user?.email);

export const canUseShortGame = (user) => user?.email === 'szott19@gmail.com';

function buildPrompt(round) {
  const played = round.holeData.filter(h => h.score !== null);
  const totalScore = played.reduce((s, h) => s + h.score, 0);
  const totalPar = played.reduce((s, h) => s + h.par, 0);
  const scoreToPar = totalScore - totalPar;
  const scoreLabel = scoreToPar === 0 ? 'even par' : scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
  const totalPutts = played.reduce((s, h) => s + (h.putts ?? 0), 0);
  const drivingHoles = played.filter(h => h.par !== 3);
  const firCount = drivingHoles.filter(h => h.fairway === true).length;
  const girCount = played.filter(h => h.gir === true).length;
  const fairwayStr = drivingHoles.length > 0
    ? `${firCount}/${drivingHoles.length} (${Math.round(firCount / drivingHoles.length * 100)}%)`
    : 'N/A';

  const holeLines = played.map(h => {
    const yardStr = h.yards ? `, ${h.yards} yds` : '';
    const putts = h.putts ?? 0;
    const puttStr = `${putts} putt${putts !== 1 ? 's' : ''}`;
    const fairway = h.par === 3 ? 'par 3 (no fairway)' : h.fairway ? 'hit fairway' : 'missed fairway';
    const gir = h.gir ? 'hit green in regulation' : 'missed GIR';
    const penalties = [h.hazard && 'hazard', h.bunker && 'bunker'].filter(Boolean).join(', ');
    return `  Hole ${h.hole} (par ${h.par}${yardStr}): Score ${h.score}, ${puttStr}, ${fairway}, ${gir}${penalties ? `, ${penalties}` : ''}`;
  });

  return `
You are an experienced golf coach reviewing a student's scorecard.
Be encouraging but honest. Focus on patterns, not individual holes.
Use golf terminology appropriately.

ROUND DETAILS:
- Course: ${round.course?.name || 'Unknown course'}${round.rating ? ` (Rating: ${round.rating}, Slope: ${round.slope})` : ''}
- Date: ${round.date}
- Score: ${totalScore} (${scoreLabel})
- Total putts: ${totalPutts}
- Fairways hit: ${fairwayStr}
- Greens in regulation: ${girCount}/${played.length}

HOLE-BY-HOLE:
${holeLines.join('\n')}

Please provide:
1. A 2-3 sentence overall summary of the round
2. The biggest strength shown today
3. The single biggest area costing the most strokes
4. Two specific, actionable practice priorities for next session, use club distances to specifically call out clubs if relevant
5. If there are specific drills that would be helpful, let the user know what they are.
6. One encouraging closing thought

Keep the total response under 300 words. Use plain paragraphs, not bullet points.
`.trim();
}

export async function getRoundSummary(round) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not found. Check your .env.local file.');

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(round) }] }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini API error: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}
