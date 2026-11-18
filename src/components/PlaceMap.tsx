import { useEffect, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  Pin,
} from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';

let cachedMapsApiKey: string | null = null;
let pendingKeyPromise: Promise<string> | null = null;

async function resolveMapsApiKey(): Promise<string> {
  const buildEnvKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (typeof buildEnvKey === 'string' && buildEnvKey.trim()) {
    return buildEnvKey.trim();
  }
  if (cachedMapsApiKey !== null) {
    return cachedMapsApiKey;
  }
  if (!pendingKeyPromise) {
    pendingKeyPromise = fetch('/api/public/maps-config')
      .then((res) => (res.ok ? res.json() : { apiKey: '' }))
      .then((data: { apiKey?: string }) => {
        cachedMapsApiKey = data.apiKey || '';
        return cachedMapsApiKey;
      })
      .catch(() => {
        cachedMapsApiKey = '';
        return '';
      });
  }
  return pendingKeyPromise;
}

export function PlaceMap({
  lat,
  lng,
  businessName,
  address,
  directionsUri,
  primaryColor = '#1677F2',
  heightClass = 'h-48',
  flush = false,
}: {
  lat: number;
  lng: number;
  businessName: string;
  address?: string;
  directionsUri?: string;
  primaryColor?: string;
  heightClass?: string;
  flush?: boolean;
}) {
  const [apiKey, setApiKey] = useState<string | null>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || cachedMapsApiKey
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!apiKey) {
      resolveMapsApiKey().then((k) => {
        if (mounted) setApiKey(k);
      });
    }
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => {
      mounted = false;
      window.removeEventListener('gmp-quota-exceeded', onQuota);
    };
  }, [apiKey]);

  const position = { lat, lng };
  const fallbackDirections =
    directionsUri ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${lat},${lng}`
    )}`;

  if (!apiKey || quotaExceeded) {
    return (
      <div
        className={`${
          flush ? 'border-b border-slate-200' : 'rounded-xl border border-slate-200'
        } bg-slate-50 p-4 flex flex-col items-center justify-center text-center gap-2`}
      >
        <MapPin className="w-5 h-5" style={{ color: primaryColor }} />
        <div className="text-xs font-medium text-slate-700">
          {address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
        </div>
        <a
          href={fallbackDirections}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
          style={{ color: primaryColor }}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>Abrir no Google Maps</span>
        </a>
      </div>
    );
  }

  return (
    <div
      className={`w-full ${heightClass} ${
        flush ? 'border-b border-slate-200' : 'rounded-xl overflow-hidden border border-slate-200'
      } relative`}
    >
      <a
        href={fallbackDirections}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/95 hover:bg-white text-[11px] font-bold text-[#1677F2] shadow-sm border border-slate-200"
      >
        <span>Maps</span>
        <ExternalLink className="w-3 h-3" />
      </a>
      <APIProvider apiKey={apiKey} libraries={['marker']} language="pt-BR" region="BR">
        <GoogleMap
          key={`${lat.toFixed(5)},${lng.toFixed(5)}`}
          mapId="DEMO_MAP_ID"
          defaultCenter={position}
          defaultZoom={16}
          gestureHandling="cooperative"
          disableDefaultUI={true}
          zoomControl={true}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          <AdvancedMarker position={position} title={businessName}>
            <Pin
              background={primaryColor}
              borderColor="#FFFFFF"
              glyphColor="#FFFFFF"
              scale={1.1}
            />
          </AdvancedMarker>
        </GoogleMap>
      </APIProvider>
    </div>
  );
}
