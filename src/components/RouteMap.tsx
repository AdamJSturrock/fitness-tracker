'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { fetchElevations } from '@/lib/elevation';
import {
  densifyPolyline,
  elevationGainFt as computeElevationGainFt,
  geoJsonToLatlngs,
  polylineDistanceMiles,
} from '@/lib/walks';

type LatLng = [number, number];

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ROUTE_COLOR = '#059669';

interface DrawProps {
  mode: 'draw';
  defaultCenter: LatLng;
  defaultZoom: number;
  onSave: (data: {
    name: string;
    defaultMinutes: number;
    latlngs: LatLng[];
    distanceMi: number;
    elevationGainFt: number | null;
  }) => void | Promise<void>;
  onCancel: () => void;
}

interface PreviewProps {
  mode: 'preview';
  initialGeoJson: string;
  heightClass?: string;
}

export type RouteMapProps = DrawProps | PreviewProps;

export default function RouteMap(props: RouteMapProps) {
  if (props.mode === 'draw') return <DrawMap {...props} />;
  return <PreviewMap {...props} />;
}

// ---- draw mode ----

function DrawMap({ defaultCenter, defaultZoom, onSave, onCancel }: DrawProps) {
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [name, setName] = useState('');
  const [defaultMinutes, setDefaultMinutes] = useState('30');
  const [saving, setSaving] = useState(false);

  const distanceMi = useMemo(
    () => polylineDistanceMiles(waypoints),
    [waypoints],
  );

  function appendWaypoint(p: LatLng) {
    setWaypoints((cur) => [...cur, p]);
  }

  function handleUndo() {
    setWaypoints((cur) => cur.slice(0, -1));
  }

  function handleCloseLoop() {
    setWaypoints((cur) => {
      if (cur.length < 3) return cur;
      const first = cur[0];
      const last = cur[cur.length - 1];
      if (first[0] === last[0] && first[1] === last[1]) return cur;
      return [...cur, [first[0], first[1]] as LatLng];
    });
  }

  function handleClear() {
    if (waypoints.length >= 2 && !confirm('Clear all waypoints?')) return;
    setWaypoints([]);
  }

  const minutes = Number(defaultMinutes);
  const minutesValid = Number.isFinite(minutes) && minutes >= 5;
  const canSave =
    waypoints.length >= 2 && name.trim() !== '' && minutesValid && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const samples = densifyPolyline(waypoints, 50).slice(0, 100);
      const elevations = await fetchElevations(samples);
      const elevationGainFt = elevations
        ? computeElevationGainFt(elevations)
        : null;
      await onSave({
        name: name.trim(),
        defaultMinutes: minutes,
        latlngs: waypoints,
        distanceMi,
        elevationGainFt,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleUndo}
          disabled={waypoints.length === 0 || saving}
          className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={handleCloseLoop}
          disabled={waypoints.length < 3 || saving}
          className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Close loop
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={waypoints.length === 0 || saving}
          className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Clear
        </button>
        <span className="ml-auto text-xs text-slate-500">
          {waypoints.length} point{waypoints.length === 1 ? '' : 's'} ·{' '}
          {distanceMi.toFixed(2)} mi
        </span>
      </div>

      <div className="h-80 w-full overflow-hidden rounded-md border border-slate-200">
        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <ClickCapture onClick={appendWaypoint} />
          {waypoints.length >= 2 ? (
            <Polyline
              positions={waypoints}
              pathOptions={{ color: ROUTE_COLOR, weight: 4 }}
            />
          ) : null}
          {waypoints.map((p, i) => (
            <CircleMarker
              key={i}
              center={p}
              radius={i === 0 ? 8 : 6}
              pathOptions={{
                color: ROUTE_COLOR,
                fillColor: ROUTE_COLOR,
                fillOpacity: i === 0 ? 1 : 0.7,
                weight: i === 0 ? 3 : 2,
              }}
            />
          ))}
        </MapContainer>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Route name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Simonside loop"
            disabled={saving}
            className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Default minutes
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={defaultMinutes}
            onChange={(e) =>
              setDefaultMinutes(e.target.value.replace(/[^0-9]/g, ''))
            }
            disabled={saving}
            className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-60"
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="inline-flex h-10 items-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save route'}
        </button>
      </div>
    </div>
  );
}

function ClickCapture({ onClick }: { onClick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

// ---- preview mode ----

function PreviewMap({ initialGeoJson, heightClass = 'h-40' }: PreviewProps) {
  const latlngs = useMemo(
    () => geoJsonToLatlngs(initialGeoJson),
    [initialGeoJson],
  );

  if (latlngs.length === 0) {
    return (
      <div
        className={`${heightClass} w-full rounded-md border border-slate-200 bg-slate-50`}
      />
    );
  }

  const center: LatLng = latlngs[0];

  return (
    <div
      className={`${heightClass} w-full overflow-hidden rounded-md border border-slate-200`}
    >
      <MapContainer
        center={center}
        zoom={13}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        zoomControl={false}
        touchZoom={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <Polyline
          positions={latlngs}
          pathOptions={{ color: ROUTE_COLOR, weight: 3 }}
        />
        <FitToBounds latlngs={latlngs} />
      </MapContainer>
    </div>
  );
}

function FitToBounds({ latlngs }: { latlngs: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (latlngs.length === 0) return;
    map.fitBounds(L.latLngBounds(latlngs), { padding: [10, 10] });
  }, [map, latlngs]);
  return null;
}
