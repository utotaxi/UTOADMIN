'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, Trash2, Search, CheckCircle2, AlertCircle, Map as MapIcon, MapPin, ChevronDown, Activity, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { ServiceArea } from '@/types';
import {
  createServiceArea,
  updateServiceArea,
  deleteServiceArea,
  saveBaseServiceArea,
} from './actions';
import { cn } from '@/lib/utils';
import {
  findBaseServiceArea,
  metersToMiles,
  milesToMeters,
  parseBaseAreaDescription,
} from '@/lib/pricing';
import ServiceAreaPricingPanel from './ServiceAreaPricingPanel';

let L: any;
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  L = require('leaflet');
}

const UK_CENTER: [number, number] = [51.8642, -2.2382];

const AREA_TYPES = [
  { label: 'City', value: 'City' },
  { label: 'County', value: 'County' },
  { label: 'Region', value: 'Region' },
  { label: 'Country', value: 'Country' },
];

const BOOKING_POLICIES = [
  { label: 'Allowed', value: 'allowed' },
  { label: 'Blocked', value: 'blocked' },
];

type TabType = 'service-area' | 'areas' | 'locations';

interface ServiceAreasClientProps {
  initialAreas: ServiceArea[];
  initialPricingRule?: Record<string, unknown> | null;
}

function getInitialBaseCircle(areas: ServiceArea[]) {
  const base = findBaseServiceArea(areas);
  if (!base?.coordinates?.[0] || !base.radius_meters) return null;
  const [lat, lng] = base.coordinates[0];
  return {
    center: [lat, lng] as [number, number],
    radiusMeters: base.radius_meters,
    radiusMiles: String(Math.round(metersToMiles(base.radius_meters) * 10) / 10),
    name: base.name || 'Gloucester, UK',
    limitEnabled: parseBaseAreaDescription(base.description).limitEnabled,
  };
}

export default function ServiceAreasClient({ initialAreas, initialPricingRule = null }: ServiceAreasClientProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const detailMapRef = useRef<any>(null);
  const detailMapContainerRef = useRef<HTMLDivElement>(null);

  const [areas, setAreas] = useState<ServiceArea[]>(initialAreas);
  const [activeTab, setActiveTab] = useState<TabType>('service-area');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Global styling
  const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const MAP_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const savedBase = getInitialBaseCircle(initialAreas);

  // Service area tab state
  const [limitServiceArea, setLimitServiceArea] = useState(savedBase?.limitEnabled ?? true);
  const [searchLocation, setSearchLocation] = useState(savedBase?.name || 'Gloucester, UK');
  const [radiusInput, setRadiusInput] = useState(savedBase?.radiusMiles || '7');
  const [selectedRadius, setSelectedRadius] = useState(savedBase?.radiusMeters || milesToMeters(7));
  const [serviceCenter, setServiceCenter] = useState<[number, number]>(savedBase?.center || UK_CENTER);

  // Areas tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState<ServiceArea | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Edit/Create state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('City');
  const [formPolicy, setFormPolicy] = useState('Allowed');
  const [formCoordinates, setFormCoordinates] = useState<[number, number][]>([]);
  const [isFetchingBoundary, setIsFetchingBoundary] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const polygonLayerRef = useRef<any>(null);
  const markersGroupRef = useRef<any>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Inject Leaflet CSS
  useEffect(() => {
    if (document.querySelector('link[href*="leaflet"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }, []);

  // Main Map (Service Area tab)
  useEffect(() => {
    if (activeTab !== 'service-area') return;
    if (!mapContainerRef.current || !L) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: serviceCenter,
      zoom: 7,
      zoomControl: false,
    });

    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: MAP_ATTRIBUTION }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    if (limitServiceArea) {
      const circle = L.circle(serviceCenter, {
        radius: selectedRadius,
        color: '#4285F4',
        fillColor: '#4285F4',
        fillOpacity: 0.3,
        weight: 2,
        dashArray: '5, 10',
      }).addTo(map);
      map.fitBounds(circle.getBounds(), { padding: [50, 50] });
    }

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [activeTab, serviceCenter, selectedRadius, limitServiceArea]);

  // Detail Map for Edit/Create Area
  useEffect(() => {
    if ((!selectedArea && !isCreatingNew) || activeTab !== 'areas') return;
    if (!detailMapContainerRef.current || !L) return;

    if (detailMapRef.current) {
      detailMapRef.current.remove();
      detailMapRef.current = null;
    }

    const center = formCoordinates.length > 0 ? formCoordinates[0] : UK_CENTER;

    const map = L.map(detailMapContainerRef.current, {
      center,
      zoom: 9,
      zoomControl: false,
    });

    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: MAP_ATTRIBUTION }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    let polygon: any = null;

    const renderPolygon = (coords: [number, number][]) => {
      if (polygonLayerRef.current) {
        map.removeLayer(polygonLayerRef.current);
      }
      markersGroup.clearLayers();

      const isBlocked = formPolicy.toLowerCase() === 'blocked';
      const themeColor = isBlocked ? '#ef4444' : '#0ea5e9';

      if (coords.length > 2) {
        polygon = L.polygon(coords, {
          color: themeColor,
          fillColor: themeColor,
          fillOpacity: 0.3,
          weight: 3,
          dashArray: '8, 8',
        }).addTo(map);
        polygonLayerRef.current = polygon;
      } else if (coords.length === 2) {
        polygon = L.polyline(coords, {
          color: themeColor,
          weight: 3,
          dashArray: '8, 8',
        }).addTo(map);
        polygonLayerRef.current = polygon;
      }

      // Add draggable markers
      coords.forEach((coord, idx) => {
        const marker = L.circleMarker(coord, {
          radius: 6,
          color: '#fff',
          fillColor: '#fff',
          fillOpacity: 1,
          weight: 1,
          draggable: true,
          className: 'draggable-marker',
        } as any).addTo(markersGroup);

        marker.on('drag', (e: any) => {
          const newCoords = [...coords];
          newCoords[idx] = [e.latlng.lat, e.latlng.lng];
          setFormCoordinates(newCoords);
          if (polygon) {
            polygon.setLatLngs(newCoords);
          }
        });
      });
    };

    renderPolygon(formCoordinates);

    // Allow clicking on map to add points
    map.on('click', (e: any) => {
      setFormCoordinates((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
    });

    if (formCoordinates.length > 2) {
      const bounds = L.latLngBounds(formCoordinates);
      map.fitBounds(bounds, { padding: [50, 50] });
    }

    detailMapRef.current = map;

    return () => {
      if (detailMapRef.current) {
        detailMapRef.current.remove();
        detailMapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArea, isCreatingNew, activeTab]);

  // Sync form coordinates to map when changed by state (like on load or click)
  useEffect(() => {
    if (detailMapRef.current && markersGroupRef.current && (!selectedArea && !isCreatingNew) === false) {
      const map = detailMapRef.current;
      if (polygonLayerRef.current) map.removeLayer(polygonLayerRef.current);
      markersGroupRef.current.clearLayers();

      const isBlocked = formPolicy.toLowerCase() === 'blocked';
      const themeColor = isBlocked ? '#ef4444' : '#0ea5e9';
      let currentPolygon: any = null;

      if (formCoordinates.length > 2) {
        currentPolygon = L.polygon(formCoordinates, {
          color: themeColor,
          fillColor: themeColor,
          fillOpacity: 0.3,
          weight: 3,
          dashArray: '8, 8',
        }).addTo(map);
        polygonLayerRef.current = currentPolygon;
      } else if (formCoordinates.length === 2) {
        currentPolygon = L.polyline(formCoordinates, {
          color: themeColor,
          weight: 3,
          dashArray: '8, 8',
        }).addTo(map);
        polygonLayerRef.current = currentPolygon;
      }

      formCoordinates.forEach((coord, idx) => {
        const marker = L.circleMarker(coord, {
          radius: 6,
          color: themeColor,
          fillColor: '#fff',
          fillOpacity: 1,
          weight: 2,
          draggable: true,
          className: 'draggable-marker',
        } as any).addTo(markersGroupRef.current);

        marker.on('drag', (e: any) => {
          setFormCoordinates((prev) => {
            const newCoords = [...prev];
            newCoords[idx] = [e.latlng.lat, e.latlng.lng];
            if (currentPolygon) {
               currentPolygon.setLatLngs(newCoords);
            }
            return newCoords;
          });
        });
      });
    }
  }, [formCoordinates, formPolicy, selectedArea, isCreatingNew]);


  const persistBaseCircle = async (milesOverride?: number, centerOverride?: [number, number]) => {
    const miles = milesOverride ?? parseFloat(radiusInput);
    const center = centerOverride || serviceCenter;
    if (isNaN(miles) || miles <= 0) {
      return { success: false as const, error: 'Please enter a valid radius in miles' };
    }
    const radiusMeters = milesToMeters(miles);
    const result = await saveBaseServiceArea({
      name: searchLocation.trim() || 'Base Service Area',
      latitude: center[0],
      longitude: center[1],
      radius_meters: radiusMeters,
      limit_enabled: limitServiceArea,
    });
    if (result.success && result.data) {
      setAreas((prev) => {
        const without = prev.filter((a) => a.id !== result.data!.id);
        return [result.data as ServiceArea, ...without];
      });
    }
    return result;
  };

  const handleSearchLocation = async () => {
    if (!searchLocation.trim()) return;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchLocation)}&limit=1`
      );
      const data = await response.json();
      if (data && data.length > 0) {
        const nextCenter: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        setServiceCenter(nextCenter);
        await persistBaseCircle(undefined, nextCenter);
      } else {
        showToast('error', 'Location not found.');
      }
    } catch {
      showToast('error', 'Geocoding failed.');
    }
  };

  const handleRadiusSubmit = async () => {
    const miles = parseFloat(radiusInput);
    if (!isNaN(miles) && miles > 0) {
      setSelectedRadius(milesToMeters(miles));
      const result = await persistBaseCircle(miles);
      if (result.success) {
        showToast('success', `Base circle saved at ${miles} miles. Inside = pickup + drop-off. Outside = base + pickup + drop-off.`);
      } else {
        showToast('error', result.error || 'Failed to save service area');
      }
    } else {
      showToast('error', 'Please enter a valid radius in miles');
    }
  };

  // Fetch polygon boundary from Nominatim for the area name
  const handleFetchAreaBoundary = async (name?: string) => {
    const areaName = (name || formName).trim();
    if (!areaName || areaName === 'New Area') return;

    setIsFetchingBoundary(true);
    try {
      // Build the query - append type context for better results
      const typeContext = formType === 'Country' ? ', country' :
                          formType === 'Region' ? ', region' :
                          formType === 'County' ? ', county' : '';
      const query = `${areaName}${typeContext}`;

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&polygon_geojson=1&limit=5`
      );
      const data = await response.json();

      if (!data || data.length === 0) {
        showToast('error', `No boundary found for "${areaName}"`);
        setIsFetchingBoundary(false);
        return;
      }

      // Find the first result that has a Polygon or MultiPolygon geometry
      const withPolygon = data.find(
        (r: any) =>
          r.geojson &&
          (r.geojson.type === 'Polygon' || r.geojson.type === 'MultiPolygon')
      );

      if (!withPolygon) {
        // Fallback: use the first result's bounding box as a rectangle
        const first = data[0];
        if (first.boundingbox) {
          const [south, north, west, east] = first.boundingbox.map(Number);
          const coords: [number, number][] = [
            [north, west],
            [north, east],
            [south, east],
            [south, west],
          ];
          setFormCoordinates(coords);
          showToast('success', `Bounding box loaded for "${areaName}". You can adjust the polygon by clicking on the map.`);
        } else {
          showToast('error', `No polygon boundary available for "${areaName}". Click on the map to draw manually.`);
        }
        setIsFetchingBoundary(false);
        return;
      }

      // Extract coordinates from GeoJSON
      const geojson = withPolygon.geojson;
      let coords: [number, number][] = [];

      if (geojson.type === 'Polygon') {
        // GeoJSON uses [lng, lat], Leaflet uses [lat, lng]
        coords = geojson.coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number]);
      } else if (geojson.type === 'MultiPolygon') {
        // Take the largest polygon ring
        let largestRing: number[][] = [];
        for (const polygon of geojson.coordinates) {
          if (polygon[0].length > largestRing.length) {
            largestRing = polygon[0];
          }
        }
        coords = largestRing.map((c: number[]) => [c[1], c[0]] as [number, number]);
      }

      // Simplify polygon if it has too many points (> 200) for performance
      if (coords.length > 200) {
        const step = Math.ceil(coords.length / 200);
        coords = coords.filter((_, i) => i % step === 0);
      }

      if (coords.length > 2) {
        setFormCoordinates(coords);

        // Fit the detail map to the new polygon bounds
        if (detailMapRef.current && L) {
          const bounds = L.latLngBounds(coords);
          detailMapRef.current.fitBounds(bounds, { padding: [50, 50] });
        }

        showToast('success', `Boundary loaded for "${areaName}" (${coords.length} points)`);
      } else {
        showToast('error', `Could not extract a valid polygon for "${areaName}"`);
      }
    } catch (err) {
      console.error('Boundary fetch error:', err);
      showToast('error', 'Failed to fetch area boundary. Try again.');
    } finally {
      setIsFetchingBoundary(false);
    }
  };

  const openAreaForEdit = (area: ServiceArea) => {
    setSelectedArea(area);
    setIsCreatingNew(false);
    setFormName(area.name);
    setFormType(area.description?.match(/Type: (\w+)/)?.[1] || 'City');
    setFormPolicy(area.description?.match(/Policy: (\w+)/)?.[1] || 'Allowed');
    setFormCoordinates(area.coordinates || []);
  };

  const openCreateNew = () => {
    setActiveTab('areas');
    setSelectedArea(null);
    setIsCreatingNew(true);
    setFormName('New Area');
    setFormType('City');
    setFormPolicy('Allowed');
    setFormCoordinates([]);
  };

  const handleSaveArea = async () => {
    if (!formName.trim()) {
      showToast('error', 'Please enter a name');
      return;
    }

    if (isCreatingNew) {
      const result = await createServiceArea({
        name: formName,
        description: `Type: ${formType}, Policy: ${formPolicy}`,
        area_type: 'polygon',
        coordinates: formCoordinates,
        color: '#4285F4',
      });
      if (result.success && result.data) {
        setAreas([result.data, ...areas]);
        setIsCreatingNew(false);
        showToast('success', 'Area created successfully');
      } else {
        showToast('error', result.error || 'Failed to create');
      }
    } else if (selectedArea) {
      const result = await updateServiceArea(selectedArea.id, {
        name: formName,
        description: `Type: ${formType}, Policy: ${formPolicy}`,
        coordinates: formCoordinates,
      });
      if (result.success) {
        setAreas(areas.map(a => a.id === selectedArea.id ? {
          ...a, name: formName, description: `Type: ${formType}, Policy: ${formPolicy}`, coordinates: formCoordinates
        } : a));
        setSelectedArea(null);
        showToast('success', 'Area updated successfully');
      } else {
        showToast('error', result.error || 'Failed to update');
      }
    }
  };

  const handleDeleteArea = () => {
    if (!selectedArea) {
      setIsCreatingNew(false);
      return;
    }
    setShowDeleteConfirm(true);
  };

  const confirmDeleteArea = async () => {
    if (!selectedArea) return;
    
    const result = await deleteServiceArea(selectedArea.id);
    if (result.success) {
      setAreas(areas.filter(a => a.id !== selectedArea.id));
      setSelectedArea(null);
      setShowDeleteConfirm(false);
      showToast('success', 'Area deleted');
    } else {
      setShowDeleteConfirm(false);
      showToast('error', 'Failed to delete');
    }
  };

  const filteredAreas = areas.filter((a) => a.area_type === 'polygon' || a.description?.includes('Policy'));

  return (
    <div className="flex flex-col min-h-screen bg-[#f1f5f9] -m-4 sm:-m-8 p-4 sm:p-8 font-sans">
      {/* Main Content Card */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex-1 flex flex-col mb-16 relative">
        {/* Tabs Bar */}
        <div className="flex items-center gap-6 px-6 pt-4 border-b border-slate-200">
          <button
            onClick={() => { setActiveTab('service-area'); setSelectedArea(null); setIsCreatingNew(false); }}
            className={cn(
              'flex items-center gap-2 pb-3 text-[13px] font-medium transition-colors relative',
              activeTab === 'service-area' ? 'text-[#0ea5e9]' : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <MapIcon className="h-4 w-4" />
            Service area
            {activeTab === 'service-area' && (
              <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[#0ea5e9]" />
            )}
          </button>
          
          <button
            onClick={() => { setActiveTab('areas'); setSelectedArea(null); setIsCreatingNew(false); }}
            className={cn(
              'flex items-center gap-2 pb-3 text-[13px] font-medium transition-colors relative',
              activeTab === 'areas' ? 'text-[#0ea5e9]' : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <Activity className="h-4 w-4" />
            Areas ({filteredAreas.length})
            {activeTab === 'areas' && (
              <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[#0ea5e9]" />
            )}
          </button>

          <button
            onClick={() => { setActiveTab('locations'); setSelectedArea(null); setIsCreatingNew(false); }}
            className={cn(
              'flex items-center gap-2 pb-3 text-[13px] font-medium transition-colors relative',
              activeTab === 'locations' ? 'text-[#0ea5e9]' : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <MapPin className="h-4 w-4" />
            Locations (0)
            {activeTab === 'locations' && (
              <div className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[#0ea5e9]" />
            )}
          </button>
        </div>

        <div className="p-6 flex-1 flex flex-col">
          {/* TAB: Service Area */}
          {activeTab === 'service-area' && (
            <div className="flex-1 flex flex-col">
              <h2 className="text-[22px] font-bold text-slate-800 tracking-tight">Your service area</h2>
              <p className="text-[13px] text-slate-500 mb-4">
                You can setup your service area and use this to limit booking outside of your active service area
              </p>
              <div className="mb-6 rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-[13px] text-slate-700 leading-relaxed max-w-3xl">
                This blue circle is treated as the <span className="font-semibold">base</span>. The radius can be any value (5 miles, 7 miles, and so on).
                If pickup and drop-off are both inside the circle, the fare is <span className="font-semibold">pickup + drop-off</span>.
                If either point is outside the circle, the fare is <span className="font-semibold">base + pickup + drop-off</span>.
              </div>

              <label className="flex items-center gap-2 mb-6 cursor-pointer w-fit">
                <div className={cn(
                  "w-4 h-4 rounded flex items-center justify-center border transition-colors",
                  limitServiceArea ? "bg-[#0ea5e9] border-[#0ea5e9]" : "border-slate-300 bg-white"
                )}>
                  {limitServiceArea && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
                <input
                  type="checkbox"
                  checked={limitServiceArea}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLimitServiceArea(checked);
                    void saveBaseServiceArea({
                      name: searchLocation.trim() || 'Base Service Area',
                      latitude: serviceCenter[0],
                      longitude: serviceCenter[1],
                      radius_meters: selectedRadius,
                      limit_enabled: checked,
                    });
                  }}
                  className="hidden"
                />
                <span className="text-[14px] text-slate-700">Limit my service area</span>
              </label>

              {limitServiceArea && (
                <div className="flex items-start gap-4 mb-3">
                  <div className="flex-1 max-w-sm">
                    <label className="text-[11px] text-slate-500 mb-1 block">Search location</label>
                    <input
                      type="text"
                      value={searchLocation}
                      onChange={(e) => setSearchLocation(e.target.value)}
                      onBlur={handleSearchLocation}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchLocation()}
                      className="w-full px-3 py-2 border border-slate-300 rounded text-[13px] text-slate-700 focus:outline-[#0ea5e9]"
                    />
                  </div>
                  <div className="w-[180px] shrink-0">
                    <label className="text-[11px] text-slate-500 mb-1 block">Radius (Miles)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={radiusInput}
                        onChange={(e) => setRadiusInput(e.target.value)}
                        onBlur={handleRadiusSubmit}
                        onKeyDown={(e) => e.key === 'Enter' && handleRadiusSubmit()}
                        placeholder="e.g. 23.5"
                        className="w-[80px] px-3 py-2 border border-slate-300 rounded text-[13px] text-slate-700 focus:outline-[#0ea5e9] bg-white"
                      />
                      <button
                        onClick={handleRadiusSubmit}
                        className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded text-[13px] font-medium border border-slate-200 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 border border-slate-200 mt-2 relative" style={{ minHeight: '450px' }}>
                <div ref={mapContainerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }} />
                <button className="absolute top-2 right-2 bg-white p-1.5 rounded shadow border border-slate-200 text-slate-700 hover:bg-slate-50" style={{ zIndex: 1000 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" /></svg>
                </button>
              </div>

              <ServiceAreaPricingPanel
                initialPricingRule={initialPricingRule}
                baseAddress={searchLocation}
                onToast={showToast}
                onBeforeSave={async () => {
                  const miles = parseFloat(radiusInput);
                  if (!isNaN(miles) && miles > 0) {
                    setSelectedRadius(milesToMeters(miles));
                    await persistBaseCircle(miles);
                  }
                }}
              />
            </div>
          )}

          {/* TAB: Areas (List) */}
          {activeTab === 'areas' && !selectedArea && !isCreatingNew && (
            <div className="flex-1 flex flex-col">
              <div className="grid grid-cols-[1fr_150px_150px] border-b border-slate-200 pb-3 mb-2 px-2">
                <div className="text-[12px] text-slate-500 font-medium">Name</div>
                <div className="text-[12px] text-slate-500 font-medium">Type</div>
                <div className="text-[12px] text-slate-500 font-medium">Policy</div>
              </div>
              
              <div className="flex-1">
                {filteredAreas.length === 0 ? (
                  <div className="text-center py-10 text-[13px] text-slate-500">
                    No areas found.
                  </div>
                ) : (
                  filteredAreas.map((area) => (
                    <div
                      key={area.id}
                      onClick={() => openAreaForEdit(area)}
                      className="grid grid-cols-[1fr_150px_150px] py-3 px-2 border-b border-slate-100 hover:bg-slate-50 cursor-pointer text-[13px] text-slate-700 items-center transition-colors"
                    >
                      <div>{area.name}</div>
                      <div>{area.description?.match(/Type: (\w+)/)?.[1] || 'City'}</div>
                      <div>{area.description?.match(/Policy: (\w+)/)?.[1] || '-'}</div>
                    </div>
                  ))
                )}
              </div>

              {filteredAreas.length > 0 && (
                <div className="flex justify-end items-center py-4 text-[12px] text-slate-500 gap-4 pr-2">
                  <span>Rows per page: 1-{filteredAreas.length} of {filteredAreas.length}</span>
                  <div className="flex gap-2">
                    <button className="p-1 opacity-50"><ChevronLeft className="h-4 w-4" /></button>
                    <button className="p-1 opacity-50"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: Area Detail / Edit View */}
          {activeTab === 'areas' && (selectedArea || isCreatingNew) && (
            <div className="flex-1 flex flex-col">
               <h2 className="text-[22px] font-bold text-slate-800 tracking-tight">{formName || 'New Area'}</h2>
               <p className="text-[13px] text-slate-500 mb-4 border-b border-slate-200 pb-4">
                 Change the area by dragging the dots on the map. Make sure the polygon is rounded and there is no overlap in the location
               </p>

               <div className="flex items-end gap-6 mb-4">
                 <div className="w-[200px]">
                    <label className="text-[11px] text-slate-500 mb-1 block">Type *</label>
                    <div className="relative border-b border-slate-300">
                      <select
                        value={formType}
                        onChange={(e) => setFormType(e.target.value)}
                        className="w-full py-1.5 text-[13px] text-slate-800 appearance-none focus:outline-none bg-transparent cursor-pointer"
                      >
                        {AREA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                    </div>
                 </div>

                 <div className="flex-1">
                    <label className="text-[11px] text-slate-500 mb-1 block">Name *</label>
                    <div className="border-b border-slate-300 flex items-center gap-2">
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleFetchAreaBoundary()}
                        placeholder="e.g. Great Malvern, Greater London..."
                        className="w-full py-1.5 text-[13px] text-slate-800 focus:outline-none bg-transparent"
                      />
                      <button
                        onClick={() => handleFetchAreaBoundary()}
                        disabled={isFetchingBoundary}
                        className="shrink-0 p-1 text-slate-400 hover:text-[#0ea5e9] transition-colors disabled:opacity-50"
                        title="Search boundary for this area"
                      >
                        {isFetchingBoundary ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                 </div>

                 <div className="w-[200px]">
                    <label className="text-[11px] text-slate-500 mb-1 block">Allowed for bookings *</label>
                    <div className="relative border-b border-slate-300">
                      <select
                        value={formPolicy}
                        onChange={(e) => setFormPolicy(e.target.value)}
                        className="w-full py-1.5 text-[13px] text-slate-800 appearance-none focus:outline-none bg-transparent cursor-pointer"
                      >
                        {BOOKING_POLICIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                      <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                    </div>
                 </div>

                 <button
                   onClick={() => setFormCoordinates([])}
                   className="px-4 py-1.5 border border-slate-300 rounded text-[13px] text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                 >
                   Clear area
                 </button>
               </div>

               <div className="flex-1 border border-slate-200 relative mb-4" style={{ minHeight: '450px' }}>
                 <div ref={detailMapContainerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }} />
                 <button className="absolute top-2 right-2 bg-white p-1.5 rounded shadow border border-slate-200 text-slate-700 hover:bg-slate-50" style={{ zIndex: 1000 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" /></svg>
                </button>
               </div>
            </div>
          )}

          {/* TAB: Locations */}
          {activeTab === 'locations' && (
            <div className="flex-1 flex flex-col items-center justify-center">
               <p className="text-[13px] text-slate-500">No locations here yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-8 right-8 flex flex-col items-end gap-3 z-50">
        {/* If in edit view, show Delete / Save */}
        {activeTab === 'areas' && (selectedArea || isCreatingNew) ? (
          <div className="flex gap-3">
             <button
               onClick={handleDeleteArea}
               className="px-6 py-2 rounded shadow-sm bg-[#db4437] text-white text-[13px] font-medium hover:bg-[#c53929] transition-colors"
             >
               Delete
             </button>
             <button
               onClick={handleSaveArea}
               className="px-6 py-2 rounded shadow-sm bg-white text-slate-400 border border-slate-200 text-[13px] font-medium hover:text-slate-700 transition-colors"
             >
               Save
             </button>
          </div>
        ) : (
          /* General Floating + Button */
          <button
            onClick={openCreateNew}
            className="w-14 h-14 rounded-full bg-[#0ea5e9] text-white flex items-center justify-center shadow-lg hover:shadow-xl hover:bg-[#0284c7] transition-all"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className={cn(
          "fixed top-6 right-6 z-[9999] px-5 py-3 rounded-lg shadow-lg border text-[13px] font-medium flex items-center gap-2 transition-all animate-[slideIn_0.3s_ease-out]",
          toast.type === 'success'
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-red-50 border-red-200 text-red-800"
        )}>
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm p-6 animate-[slideUp_0.3s_ease-out]">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-slate-800 mb-1">Delete service area?</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">
                  Are you sure you want to delete this service area?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pb-1">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteArea}
                className="px-4 py-2 text-[13px] font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg shadow-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .leaflet-container {
          cursor: crosshair;
        }
        .leaflet-interactive {
          cursor: pointer;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
