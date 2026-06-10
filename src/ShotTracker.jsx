import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = 'pk.eyJ1Ijoic2N1YmFzdGV2ZTE5IiwiYSI6ImNtcG5mc2N3NzBocXMycnB4MW10cWtodXAifQ._vqJHKx9KI41ORSWP-20qQ';

// Haversine formula — returns straight-line distance between two GPS coordinates in yards
const haversineYards = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.09361);
};

const makeMarkerEl = (fill, border) => {
  const el = document.createElement('div');
  el.style.cssText = `width:14px;height:14px;background:${fill};border:2.5px solid ${border};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5)`;
  return el;
};

const ShotTracker = ({ clubs, onLogDistance }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const shotMarker = useRef(null);
  const ballMarker = useRef(null);
  const geolocate = useRef(null);

  const [shotPos, setShotPos] = useState(null);
  const [yards, setYards] = useState(null);
  const [locating, setLocating] = useState(false);
  const [selectedClub, setSelectedClub] = useState('');
  const [isKnockdown, setIsKnockdown] = useState(false);

  useEffect(() => {
    if (map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      zoom: 17,
      center: [-98, 38],
    });

    // Geolocate control — centers map on the user and tracks their position
    geolocate.current = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    });

    map.current.addControl(geolocate.current, 'top-right');
    map.current.on('load', () => geolocate.current.trigger());

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  const getPosition = () =>
    new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      })
    );

  const clearLine = () => {
    if (map.current?.getLayer('shot-line')) map.current.removeLayer('shot-line');
    if (map.current?.getSource('shot-line')) map.current.removeSource('shot-line');
  };

  const handleMarkShot = async () => {
    setLocating(true);
    try {
      const pos = await getPosition();
      const coords = [pos.coords.longitude, pos.coords.latitude];

      // Clear previous shot entirely
      shotMarker.current?.remove();
      ballMarker.current?.remove();
      clearLine();
      setShotPos(coords);
      setYards(null);

      shotMarker.current = new mapboxgl.Marker(makeMarkerEl('#1a5f3d', 'white'))
        .setLngLat(coords)
        .addTo(map.current);

      map.current.flyTo({ center: coords, zoom: 17 });
    } catch {
      alert('Could not get location — make sure location access is enabled for this site in Safari settings.');
    }
    setLocating(false);
  };

  const handleMarkBall = async () => {
    if (!shotPos) return;
    setLocating(true);
    try {
      const pos = await getPosition();
      const coords = [pos.coords.longitude, pos.coords.latitude];
      const distance = haversineYards(shotPos[1], shotPos[0], coords[1], coords[0]);

      ballMarker.current?.remove();
      ballMarker.current = new mapboxgl.Marker(makeMarkerEl('white', '#1a5f3d'))
        .setLngLat(coords)
        .addTo(map.current);

      // Draw dashed line from shot to ball
      clearLine();
      map.current.addSource('shot-line', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [shotPos, coords] } },
      });
      map.current.addLayer({
        id: 'shot-line',
        type: 'line',
        source: 'shot-line',
        paint: { 'line-color': '#1a5f3d', 'line-width': 2.5, 'line-dasharray': [2, 2] },
      });

      // Fit both markers in view
      map.current.fitBounds(new mapboxgl.LngLatBounds(shotPos, coords), { padding: 80 });
      setYards(distance);
    } catch {
      alert('Could not get location.');
    }
    setLocating(false);
  };

  const handleReset = () => {
    setShotPos(null);
    setYards(null);
    setSelectedClub('');
    shotMarker.current?.remove();
    ballMarker.current?.remove();
    clearLine();
    geolocate.current?.trigger();
  };

  const handleLog = () => {
    if (!selectedClub || !yards) return;
    onLogDistance(selectedClub, yards, isKnockdown);
    handleReset();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 136px)' }}>
      {/* Satellite map fills remaining screen height */}
      <div ref={mapContainer} style={{ flex: 1 }} />

      {/* Bottom control panel */}
      <div style={{ padding: '16px', background: 'white', boxShadow: '0 -2px 8px rgba(0,0,0,0.08)', flexShrink: 0 }}>
        {yards ? (
          <div style={{ textAlign: 'center', marginBottom: '10px' }}>
            <p style={{ margin: '0 0 2px', fontSize: '12px', color: '#888', fontWeight: '600', letterSpacing: '0.5px' }}>SHOT DISTANCE</p>
            <p style={{ margin: '0 0 10px', fontSize: '52px', fontWeight: '700', color: '#1a5f3d', letterSpacing: '-2px', lineHeight: 1 }}>
              {yards} <span style={{ fontSize: '18px', color: '#888', fontWeight: '400' }}>yds</span>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { id: false, label: 'Full Swing' },
                { id: true, label: 'Knockdown' },
              ].map(t => (
                <button
                  key={String(t.id)}
                  onClick={() => setIsKnockdown(t.id)}
                  style={{
                    padding: '8px',
                    background: isKnockdown === t.id ? '#2d6a8a' : '#f5f5f5',
                    color: isKnockdown === t.id ? 'white' : '#888',
                    border: 'none', borderRadius: '6px',
                    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                  }}
                >{t.label}</button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: shotPos ? '12px' : '0' }}>
            <button
              onClick={handleMarkShot}
              disabled={locating}
              style={{ padding: '16px 12px', background: '#1a5f3d', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}
            >
              {locating && !shotPos ? 'Locating...' : shotPos ? '✓ Shot Marked' : 'Mark Shot'}
            </button>
            <button
              onClick={handleMarkBall}
              disabled={!shotPos || locating}
              style={{ padding: '16px 12px', background: shotPos ? '#2d7a52' : '#ddd', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: shotPos ? 'pointer' : 'default' }}
            >
              {locating && shotPos ? 'Locating...' : 'At My Ball'}
            </button>
          </div>
        )}

        {shotPos && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: yards ? '1fr 1fr' : '1fr', gap: '8px', marginBottom: '8px' }}>
              <select
                value={selectedClub}
                onChange={e => setSelectedClub(e.target.value)}
                style={{ padding: '12px', fontSize: '14px', border: '1px solid #ddd', borderRadius: '8px', fontFamily: 'inherit', background: 'white' }}
              >
                <option value="">Select club...</option>
                {clubs.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {yards && (
                <button
                  onClick={handleLog}
                  disabled={!selectedClub}
                  style={{ padding: '12px', background: selectedClub ? '#1a5f3d' : '#ddd', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: selectedClub ? 'pointer' : 'default' }}
                >
                  Log It
                </button>
              )}
            </div>
            <button
              onClick={handleReset}
              style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', color: '#888', cursor: 'pointer' }}
            >
              New Shot
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ShotTracker;
