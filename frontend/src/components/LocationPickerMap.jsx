import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { MapPin, Search, Loader2, CheckCircle2, Crosshair, AlertCircle, Radio } from 'lucide-react';
import { fetchReverseGeocode, searchAddress, fetchPatientIpLocation } from '../services/api';

// Custom SVG Pin for Emergency Patient's Real-Time Pickup Marker
function createPatientLocationPin() {
  const html = `
    <div style="position: relative; width: 46px; height: 56px; pointer-events: auto; cursor: grab;">
      <!-- Pulsing ground radar circle -->
      <div style="
        position: absolute;
        bottom: 2px;
        left: 50%;
        transform: translateX(-50%);
        width: 26px;
        height: 10px;
        background: rgba(220, 38, 38, 0.4);
        border-radius: 50%;
        box-shadow: 0 0 12px rgba(220, 38, 38, 0.7);
        animation: pulseSubtle 1.5s infinite ease-in-out;
      "></div>

      <!-- Main Emergency Patient Pin -->
      <div style="
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 40px;
        height: 50px;
        filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.32));
      ">
        <svg viewBox="0 0 38 48" width="40" height="50" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 0C8.506 0 0 8.506 0 19C0 32.5 19 48 19 48C19 48 38 32.5 38 19C38 8.506 29.494 0 19 0Z" fill="#dc2626"/>
          <circle cx="19" cy="18" r="11" fill="#ffffff"/>
          <path d="M19 12V24M13 18H25" stroke="#dc2626" stroke-width="3" stroke-linecap="round"/>
        </svg>
      </div>

      <!-- Patient-Focused Floating Tag -->
      <div style="
        position: absolute;
        top: -26px;
        left: 50%;
        transform: translateX(-50%);
        background: #991b1b;
        color: #ffffff;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.4px;
        white-space: nowrap;
        padding: 3px 8px;
        border-radius: 6px;
        box-shadow: 0 3px 8px rgba(0,0,0,0.35);
        border: 1px solid #f87171;
      ">
        🚨 PATIENT LOCATION
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-patient-pin',
    iconSize: [46, 56],
    iconAnchor: [23, 52],
    popupAnchor: [0, -52]
  });
}

export default function LocationPickerMap({ initialCoords, onLocationChange }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  // Patient's coordinates - default to initialCoords or start null until detected
  const [patientCoords, setPatientCoords] = useState(
    initialCoords || { lat: 28.6139, lng: 77.2090 }
  );

  const [addressInfo, setAddressInfo] = useState({
    displayName: 'Detecting patient street address...',
    road: '',
    suburb: '',
    city: '',
    postcode: ''
  });

  const [isDetectingGPS, setIsDetectingGPS] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [statusNotice, setStatusNotice] = useState('Detecting patient location...');

  // Search & Autocomplete
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeoutRef = useRef(null);
  const reverseGeocodeTimeoutRef = useRef(null);

  // Reverse geocode patient coordinates
  const triggerReverseGeocode = useCallback((lat, lng, labelHint) => {
    setIsGeocoding(true);
    if (reverseGeocodeTimeoutRef.current) {
      clearTimeout(reverseGeocodeTimeoutRef.current);
    }

    reverseGeocodeTimeoutRef.current = setTimeout(async () => {
      try {
        const data = await fetchReverseGeocode(lat, lng);
        if (data && data.success) {
          const addr = data.address || {};
          const road = addr.road || addr.street || addr.neighbourhood || addr.suburb || '';
          const suburb = addr.suburb || addr.city_district || addr.county || '';
          const city = addr.city || addr.state_district || addr.state || 'Delhi';
          const postcode = addr.postcode || '';
          const display = data.displayName || `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;

          const info = {
            displayName: display,
            road: road || suburb || 'Patient Area',
            suburb,
            city,
            postcode
          };

          setAddressInfo(info);
          if (labelHint) {
            setStatusNotice(labelHint);
          }

          if (onLocationChange) {
            onLocationChange({
              lat: Number(lat.toFixed(4)),
              lng: Number(lng.toFixed(4)),
              address: display,
              details: info
            });
          }
        }
      } catch (err) {
        console.warn('Reverse geocode warning:', err);
      } finally {
        setIsGeocoding(false);
      }
    }, 350);
  }, [onLocationChange]);

  // Real-time GPS Detection of Emergency Patient (Rapido / Uber Style)
  const detectPatientRealtimeLocation = useCallback(() => {
    setIsDetectingGPS(true);
    setStatusNotice('Fetching emergency patient GPS from device...');

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(4));
          const lng = Number(pos.coords.longitude.toFixed(4));
          const accuracy = Math.round(pos.coords.accuracy || 10);
          const updated = { lat, lng };

          setPatientCoords(updated);
          const notice = `Patient GPS Locked (Accuracy: ±${accuracy}m)`;
          setStatusNotice(notice);

          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
          }
          if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([lat, lng], 16, { duration: 1.2 });
          }

          triggerReverseGeocode(lat, lng, notice);
          setIsDetectingGPS(false);
        },
        async (err) => {
          console.warn('Browser GPS unavailable or denied:', err.message);
          // Fallback to IP-based patient location lookup
          try {
            const ipLoc = await fetchPatientIpLocation();
            if (ipLoc && ipLoc.lat && ipLoc.lng) {
              const fallbackCoords = {
                lat: Number(ipLoc.lat.toFixed(4)),
                lng: Number(ipLoc.lng.toFixed(4))
              };
              setPatientCoords(fallbackCoords);
              const notice = `Patient Approximate Area: ${ipLoc.city || 'Delhi'} (Drag pin to exact house/gate)`;
              setStatusNotice(notice);

              if (markerRef.current) {
                markerRef.current.setLatLng([fallbackCoords.lat, fallbackCoords.lng]);
              }
              if (mapInstanceRef.current) {
                mapInstanceRef.current.panTo([fallbackCoords.lat, fallbackCoords.lng]);
              }
              triggerReverseGeocode(fallbackCoords.lat, fallbackCoords.lng, notice);
            }
          } catch (_) {
            setStatusNotice('GPS access required. Drag pin or search locality to set patient spot.');
          } finally {
            setIsDetectingGPS(false);
          }
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    } else {
      setStatusNotice('Device GPS not supported. Use search or pin on map.');
      setIsDetectingGPS(false);
    }
  }, [triggerReverseGeocode]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [patientCoords.lat, patientCoords.lng],
        zoom: 15,
        zoomControl: false,
        attributionControl: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Emergency Patient Location Marker
      const pinIcon = createPatientLocationPin();
      const marker = L.marker([patientCoords.lat, patientCoords.lng], {
        icon: pinIcon,
        draggable: true,
        autoPan: true
      }).addTo(map);

      // Drag listener: patient can adjust their exact pickup point
      marker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        const updated = {
          lat: Number(newPos.lat.toFixed(4)),
          lng: Number(newPos.lng.toFixed(4))
        };
        setPatientCoords(updated);
        setStatusNotice('Patient Location Manually Pinned');
        triggerReverseGeocode(updated.lat, updated.lng, 'Patient Location Manually Pinned');
      });

      // Map click listener: tap anywhere to move patient pin
      map.on('click', (e) => {
        const newPos = e.latlng;
        const updated = {
          lat: Number(newPos.lat.toFixed(4)),
          lng: Number(newPos.lng.toFixed(4))
        };
        marker.setLatLng(newPos);
        setPatientCoords(updated);
        setStatusNotice('Patient Location Updated on Map');
        triggerReverseGeocode(updated.lat, updated.lng, 'Patient Location Updated on Map');
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;

      // Automatically fetch patient's real device GPS on initial load
      detectPatientRealtimeLocation();
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Search Colony/Landmark autocomplete
  const handleSearchInput = (val) => {
    setSearchQuery(val);
    if (!val || val.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await searchAddress(val);
        if (res && res.success && res.results) {
          setSearchResults(res.results);
          setShowDropdown(res.results.length > 0);
        }
      } catch (err) {
        console.warn('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  // Select Search Result
  const handleSelectSearchResult = (item) => {
    const lat = Number(item.lat.toFixed(4));
    const lng = Number(item.lng.toFixed(4));
    const updated = { lat, lng };

    setPatientCoords(updated);
    setSearchQuery(item.name.split(',')[0]);
    setShowDropdown(false);
    const notice = `Patient Location: ${item.name.split(',')[0]}`;
    setStatusNotice(notice);

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([lat, lng], 16, { duration: 1.2 });
    }

    triggerReverseGeocode(lat, lng, notice);
  };

  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '2px solid #fecdd3',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      marginBottom: '22px',
      boxShadow: 'var(--shadow-md)'
    }}>
      {/* Search Bar for Patient's Colony / Landmark (Rapido Style) */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)', position: 'relative', backgroundColor: '#fff5f5' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="form-input"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
            placeholder="🔍 Search patient's colony, landmark, sector, or street (e.g. Saket, Okhla, AIIMS, Sector 62)..."
            style={{
              paddingLeft: '38px',
              paddingRight: isSearching ? '38px' : '12px',
              fontSize: '0.88rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#ffffff',
              borderColor: '#fca5a5'
            }}
          />
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: '#dc2626' }} />
          {isSearching && (
            <Loader2 size={16} className="animate-spin" style={{ position: 'absolute', right: '12px', top: '13px', color: '#dc2626' }} />
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: '16px',
            right: '16px',
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            border: '1.5px solid var(--border-light)',
            zIndex: 1000,
            maxHeight: '220px',
            overflowY: 'auto'
          }}>
            {searchResults.map((item, idx) => (
              <div
                key={idx}
                onClick={() => handleSelectSearchResult(item)}
                style={{
                  padding: '10px 14px',
                  borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border-light)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fff1f2'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
              >
                <MapPin size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: 1.35 }}>
                  <strong style={{ display: 'block', color: 'var(--text-main)', marginBottom: '2px' }}>
                    {item.name.split(',')[0]}
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {item.name.split(',').slice(1, 4).join(',')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Leaflet Map for Patient Location */}
      <div style={{ position: 'relative', width: '100%', height: '280px', backgroundColor: '#e2e8f0' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Rapido-Style "Detect Patient Live GPS" Button */}
        <button
          type="button"
          onClick={detectPatientRealtimeLocation}
          disabled={isDetectingGPS}
          title="Click to fetch emergency patient's live device GPS"
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#ffffff',
            color: '#dc2626',
            border: '2px solid #dc2626',
            borderRadius: 'var(--radius-full)',
            padding: '8px 16px',
            fontWeight: 800,
            fontSize: '0.82rem',
            boxShadow: '0 4px 14px rgba(220, 38, 38, 0.25)',
            cursor: 'pointer',
            transition: 'transform 0.15s, background-color 0.15s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.04)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
        >
          <Crosshair size={16} className={isDetectingGPS ? 'animate-spin' : ''} style={{ color: '#dc2626' }} />
          <span>{isDetectingGPS ? 'Detecting GPS...' : '🎯 Detect My Live GPS'}</span>
        </button>

        {/* Hint Pill at bottom-left */}
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          zIndex: 500,
          backgroundColor: 'rgba(15, 23, 42, 0.86)',
          color: '#ffffff',
          padding: '4px 12px',
          borderRadius: 'var(--radius-full)',
          fontSize: '0.73rem',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backdropFilter: 'blur(4px)'
        }}>
          <Radio size={12} style={{ color: '#f87171' }} />
          <span>Drag red pin or tap map to adjust patient's exact pickup spot</span>
        </div>
      </div>

      {/* Human-Readable Patient Pickup Address Display */}
      <div style={{
        padding: '14px 18px',
        backgroundColor: '#fffdfd',
        borderTop: '1px solid #fee2e2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', maxWidth: '72%' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px'
          }}>
            <MapPin size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {isGeocoding ? 'Detecting patient street & colony...' : (addressInfo.road || addressInfo.displayName.split(',')[0] || 'Patient Location')}
              </span>
              <span style={{
                backgroundColor: '#fee2e2',
                color: '#b91c1c',
                fontSize: '0.70rem',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '9999px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                border: '1px solid #fecdd3'
              }}>
                <CheckCircle2 size={11} /> Patient Pickup Spot
              </span>
            </div>
            <div style={{ fontSize: '0.80rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
              {isGeocoding ? 'Fetching live street address from satellite geocoding...' : addressInfo.displayName}
            </div>
          </div>
        </div>

        {/* Patient Coordinates & Status */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.82rem',
            fontWeight: 800,
            color: '#dc2626',
            backgroundColor: '#fee2e2',
            padding: '4px 10px',
            borderRadius: '6px',
            display: 'inline-block',
            marginBottom: '4px',
            border: '1px solid #fca5a5'
          }}>
            Lat: {patientCoords.lat.toFixed(4)}, Lng: {patientCoords.lng.toFixed(4)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 600 }}>
            {statusNotice}
          </div>
        </div>
      </div>
    </div>
  );
}
