'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MediaItem } from '@/types/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function getThumbUrl(item: MediaItem) {
  return item.thumbnail_path
    ? `${SUPABASE_URL}/storage/v1/object/public/derivatives/${item.thumbnail_path}`
    : null;
}

function createPhotoIcon(thumbUrl: string | null) {
  if (thumbUrl) {
    return L.divIcon({
      className: 'photo-marker',
      html: `<div style="width:36px;height:36px;border-radius:50%;border:2px solid #F59E0B;overflow:hidden;background:#27272a;box-shadow:0 2px 8px rgba(0,0,0,0.5)">
        <img src="${thumbUrl}" style="width:100%;height:100%;object-fit:cover" />
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -20],
    });
  }
  return L.divIcon({
    className: 'photo-marker',
    html: `<div style="width:36px;height:36px;border-radius:50%;border:2px solid #F59E0B;background:#27272a;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.5)">📍</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

function FitBounds({ items }: { items: MediaItem[] }) {
  const map = useMap();

  useEffect(() => {
    if (items.length === 0) return;
    const bounds = L.latLngBounds(
      items.map((i) => [i.gps_latitude!, i.gps_longitude!] as [number, number])
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [map, items]);

  return null;
}

interface PhotoMapProps {
  items: MediaItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function PhotoMap({ items, selectedId, onSelect }: PhotoMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [ready, setReady] = useState(false);

  const center: [number, number] = items.length > 0
    ? [items[0].gps_latitude!, items[0].gps_longitude!]
    : [36.07, -94.17]; // default: NWA

  useEffect(() => {
    // Fix Leaflet default icon issue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <MapContainer
      center={center}
      zoom={10}
      className="w-full h-full rounded-lg"
      style={{ background: '#18181b' }}
      ref={mapRef}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <FitBounds items={items} />
      {items.map((item) => {
        const thumb = getThumbUrl(item);
        const isSelected = item.id === selectedId;
        return (
          <Marker
            key={item.id}
            position={[item.gps_latitude!, item.gps_longitude!]}
            icon={createPhotoIcon(thumb)}
            eventHandlers={{
              click: () => onSelect(item.id),
            }}
          >
            <Popup>
              <div style={{ minWidth: 200, background: '#18181b', color: '#e4e4e7', padding: 8, borderRadius: 8, margin: -14 }}>
                {thumb && (
                  <img
                    src={thumb}
                    alt={item.original_filename}
                    style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 6, marginBottom: 8 }}
                  />
                )}
                <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>{item.original_filename}</p>
                <p style={{ fontSize: 11, color: '#a1a1aa', margin: '0 0 2px' }}>
                  {item.gps_latitude?.toFixed(5)}, {item.gps_longitude?.toFixed(5)}
                </p>
                {item.capture_time && (
                  <p style={{ fontSize: 11, color: '#a1a1aa', margin: 0 }}>
                    {new Date(item.capture_time).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
