'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Car,
  Users,
  MapPin,
  Globe,
  Eye,
  EyeOff,
  RefreshCw,
  Navigation,
  Layers,
  Activity,
  Signal,
  Clock,
} from 'lucide-react';
import { ServiceArea, Driver } from '@/types';
import { cn } from '@/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let L: any;
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  L = require('leaflet');
}

const UK_CENTER: [number, number] = [51.8642, -2.2382];
const DEFAULT_ZOOM = 8;

interface LiveMapClientProps {
  initialAreas: ServiceArea[];
  initialDrivers: (Driver & { user?: { full_name: string; phone?: string } })[];
}

export default function LiveMapClient({ initialAreas, initialDrivers }: LiveMapClientProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const driverMarkersRef = useRef<Map<string, any>>(new Map());
  const areaLayersRef = useRef<Map<string, any>>(new Map());

  const [areas] = useState<ServiceArea[]>(initialAreas);
  const [drivers, setDrivers] = useState(initialDrivers);
  const [showAreas, setShowAreas] = useState(true);
  const [showDrivers, setShowDrivers] = useState(true);
  const [showOnlineOnly, setShowOnlineOnly] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState<typeof initialDrivers[0] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onlineDrivers = drivers.filter((d) => d.is_online);
  const availableDrivers = drivers.filter((d) => d.is_online && d.is_available);

  // Fetch fresh driver data
  const refreshDrivers = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch('/api/drivers');
      if (res.ok) {
        const data = await res.json();
        if (data.drivers) {
          setDrivers(data.drivers);
          setLastUpdated(new Date());
        }
      }
    } catch (err) {
      console.error('Failed to refresh drivers:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(refreshDrivers, 15000);
    return () => clearInterval(interval);
  }, [refreshDrivers]);

  // Create driver icon
  const createDriverIcon = useCallback((isOnline: boolean, isAvailable: boolean) => {
    const color = isAvailable ? '#10b981' : isOnline ? '#f59e0b' : '#94a3b8';
    const pulseColor = isAvailable ? '#10b98140' : 'transparent';

    return L.divIcon({
      className: 'driver-marker-icon',
      html: `
        <div style="position:relative; display:flex; align-items:center; justify-content:center;">
          ${isAvailable ? `<div style="position:absolute; width:36px; height:36px; border-radius:50%; background:${pulseColor}; animation: pulse-ring 2s ease-out infinite;"></div>` : ''}
          <div style="
            width:32px; height:32px; border-radius:50%;
            background: linear-gradient(135deg, ${color}, ${color}cc);
            border: 3px solid white;
            box-shadow: 0 2px 10px ${color}60;
            display:flex; align-items:center; justify-content:center;
            transition: transform 0.2s;
          ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8c-.1.3-.1.5-.1.8V16c0 .6.4 1 1 1h2"/>
              <circle cx="7" cy="17" r="2"/>
              <path d="M9 17h6"/>
              <circle cx="17" cy="17" r="2"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }, []);

  // Inject Leaflet CSS
  useEffect(() => {
    if (document.querySelector('link[href*="leaflet"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !L) return;

    const map = L.map(mapContainerRef.current, {
      center: UK_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });

    // Use standard Google Maps style tile layer to match Service Areas
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google Maps',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Render service areas
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    areaLayersRef.current.forEach((layer) => map.removeLayer(layer));
    areaLayersRef.current.clear();

    if (!showAreas) return;

    areas
      .filter((a) => a.is_active)
      .forEach((area) => {
        let layer: L.Layer;

        if (area.area_type === 'circle' && area.coordinates.length > 0 && area.radius_meters) {
          layer = L.circle(area.coordinates[0], {
            radius: area.radius_meters,
            color: area.color || '#4285F4',
            fillColor: area.color || '#4285F4',
            fillOpacity: 0.08,
            weight: 2,
            dashArray: '8, 12',
          });
        } else if (area.area_type === 'polygon' && area.coordinates.length > 2) {
          layer = L.polygon(area.coordinates, {
            color: area.color,
            fillColor: area.color,
            fillOpacity: 0.1,
            weight: 2,
            dashArray: '6, 10',
          });
        } else {
          return;
        }

        (layer as any).bindTooltip(
          `<div style="text-align:center">
            <div style="font-weight:700; font-size:12px">${area.name}</div>
            <div style="font-size:10px; opacity:0.7; margin-top:2px">Service Area</div>
          </div>`,
          {
            permanent: false,
            direction: 'center',
            className: 'service-area-tooltip-light',
          }
        );

        layer.addTo(map);
        areaLayersRef.current.set(area.id, layer);
      });
  }, [areas, showAreas]);

  // Render drivers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    driverMarkersRef.current.forEach((marker) => map.removeLayer(marker));
    driverMarkersRef.current.clear();

    if (!showDrivers) return;

    const filteredDrivers = showOnlineOnly
      ? drivers.filter((d) => d.is_online)
      : drivers;

    filteredDrivers.forEach((driver) => {
      if (!driver.current_latitude || !driver.current_longitude) return;

      const marker = L.marker([driver.current_latitude, driver.current_longitude], {
        icon: createDriverIcon(driver.is_online, driver.is_available),
      });

      const driverName = driver.user?.full_name || 'Unknown Driver';
      const statusText = driver.is_available ? 'Available' : driver.is_online ? 'On Trip' : 'Offline';
      const statusColor = driver.is_available ? '#10b981' : driver.is_online ? '#f59e0b' : '#94a3b8';

      marker.bindPopup(`
        <div style="font-family: Inter, sans-serif; padding:4px; min-width:180px;">
          <div style="font-weight:700; font-size:14px; margin-bottom:6px">${driverName}</div>
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px">
            <div style="width:8px; height:8px; border-radius:50%; background:${statusColor}"></div>
            <span style="font-size:12px; color:#64748b">${statusText}</span>
          </div>
          <div style="font-size:11px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:6px; margin-top:4px">
            ${driver.vehicle_make} ${driver.vehicle_model} (${driver.vehicle_color})
            <br/>${driver.license_plate}
          </div>
        </div>
      `, {
        className: 'driver-popup',
      });

      marker.on('click', () => setSelectedDriver(driver));
      marker.addTo(map);
      driverMarkersRef.current.set(driver.id, marker);
    });
  }, [drivers, showDrivers, showOnlineOnly, createDriverIcon]);

  const focusDriver = (driver: typeof initialDrivers[0]) => {
    if (!mapRef.current || !driver.current_latitude || !driver.current_longitude) return;
    setSelectedDriver(driver);
    mapRef.current.setView([driver.current_latitude, driver.current_longitude], 14);
    const marker = driverMarkersRef.current.get(driver.id);
    if (marker) marker.openPopup();
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
              <Globe className="h-5 w-5" />
            </div>
            Live Map
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time view of drivers, rides, and service areas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px] font-medium text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
          <button
            onClick={refreshDrivers}
            disabled={isRefreshing}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 text-primary', isRefreshing && 'animate-spin')} />
            <span className="text-xs font-semibold text-primary">Refresh</span>
          </button>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {onlineDrivers.length} Online
            </span>
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
            <Signal className="h-3.5 w-3.5 text-sky-500" />
            <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">
              {availableDrivers.length} Available
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left panel: Drivers */}
        <div className="w-[300px] shrink-0 flex flex-col gap-3 overflow-hidden">
          {/* Toggle controls */}
          <div className="rounded-xl border bg-card p-3 space-y-2">
            <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">
              Map Layers
            </h3>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => setShowAreas(!showAreas)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  showAreas
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                    : 'bg-slate-50 dark:bg-slate-800 text-muted-foreground border border-transparent'
                )}
              >
                {showAreas ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                Service Areas
                <span className="ml-auto text-xs opacity-70">
                  {areas.filter((a) => a.is_active).length}
                </span>
              </button>
              <button
                onClick={() => setShowDrivers(!showDrivers)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  showDrivers
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-50 dark:bg-slate-800 text-muted-foreground border border-transparent'
                )}
              >
                {showDrivers ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                Drivers
                <span className="ml-auto text-xs opacity-70">{onlineDrivers.length}</span>
              </button>
              <button
                onClick={() => setShowOnlineOnly(!showOnlineOnly)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                  showOnlineOnly
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    : 'bg-slate-50 dark:bg-slate-800 text-muted-foreground border border-transparent'
                )}
              >
                <Signal className="h-3.5 w-3.5" />
                Online Only
              </button>
            </div>
          </div>

          {/* Driver list */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider px-1 mb-2">
              Drivers ({showOnlineOnly ? onlineDrivers.length : drivers.length})
            </h3>
            {(showOnlineOnly ? onlineDrivers : drivers).map((driver) => (
              <div
                key={driver.id}
                onClick={() => focusDriver(driver)}
                className={cn(
                  'group rounded-lg border bg-card p-2.5 cursor-pointer transition-all duration-200 hover:shadow-sm',
                  selectedDriver?.id === driver.id
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-slate-300 dark:hover:border-slate-600'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <Car className="h-4 w-4 text-primary" />
                    </div>
                    <div
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card',
                        driver.is_available
                          ? 'bg-emerald-500'
                          : driver.is_online
                          ? 'bg-amber-500'
                          : 'bg-slate-400'
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {driver.user?.full_name || 'Unknown'}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {driver.vehicle_make} {driver.vehicle_model} • {driver.license_plate}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <span
                      className={cn(
                        'text-[9px] uppercase font-bold px-1.5 py-0.5 rounded',
                        driver.is_available
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : driver.is_online
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                      )}
                    >
                      {driver.is_available ? 'Free' : driver.is_online ? 'Busy' : 'Off'}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {(showOnlineOnly ? onlineDrivers : drivers).length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 border border-dashed rounded-xl bg-slate-50/50 dark:bg-slate-900/30">
                <Car className="h-6 w-6 text-muted-foreground opacity-30 mb-1" />
                <p className="text-xs text-muted-foreground">No drivers to display.</p>
              </div>
            )}
          </div>

          {/* Service Areas summary */}
          <div className="shrink-0 rounded-xl border bg-card p-3">
            <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider mb-2">
              Service Zones
            </h3>
            <div className="space-y-1">
              {areas.filter(a => a.is_active).slice(0, 5).map((area) => (
                <div
                  key={area.id}
                  className="flex items-center gap-2 text-xs"
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: area.color }}
                  />
                  <span className="truncate flex-1 text-foreground font-medium">{area.name}</span>
                  <span className="text-muted-foreground text-[10px]">{area.area_type}</span>
                </div>
              ))}
              {areas.filter(a => a.is_active).length === 0 && (
                <p className="text-xs text-muted-foreground">No active service areas.</p>
              )}
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 rounded-2xl overflow-hidden border border-border shadow-lg relative">
          {/* Legend */}
          <div className="absolute top-4 left-4 z-[1000] rounded-xl bg-card/95 backdrop-blur-md border border-border p-3 shadow-lg">
            <div className="flex items-center gap-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Available
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                On Trip
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                Offline
              </div>
            </div>
          </div>
          {/* Fullscreen button */}
          <button className="absolute top-4 right-4 z-[1000] h-8 w-8 rounded-md bg-white shadow-md border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
            </svg>
          </button>
          <div ref={mapContainerRef} className="w-full h-full" />
        </div>
      </div>

      <style>{`
        .driver-marker-icon {
          background: none !important;
          border: none !important;
        }

        .service-area-tooltip-light {
          background: rgba(255, 255, 255, 0.95) !important;
          color: #1e293b !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 8px !important;
          padding: 6px 12px !important;
          font-size: 12px !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
        }
        .service-area-tooltip-light::before {
          border-top-color: rgba(255, 255, 255, 0.95) !important;
        }

        .driver-popup .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
          box-shadow: 0 8px 30px rgba(0,0,0,0.15) !important;
          border: 1px solid #e2e8f0 !important;
        }
        .driver-popup .leaflet-popup-tip {
          box-shadow: 0 4px 10px rgba(0,0,0,0.1) !important;
        }

        .leaflet-control-zoom a {
          background: rgba(255, 255, 255, 0.95) !important;
          color: #1e1b4b !important;
          border-radius: 8px !important;
          width: 36px !important;
          height: 36px !important;
          line-height: 36px !important;
          font-size: 16px !important;
          border: 1px solid #e2e8f0 !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
        }
        .leaflet-control-zoom {
          border: none !important;
          border-radius: 12px !important;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
        }

        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
