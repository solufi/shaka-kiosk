'use client';
import { useState, useEffect, useRef } from 'react';
import { Camera, CameraOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Camera {
  id: number;
  device: string;
  name: string;
  status: string;
}

interface CameraStreamProps {
  cameraId: number;
  cameraName: string;
  isActive: boolean;
  onToggle: (cameraId: number) => void;
  enableAiTest?: boolean;
}

function CameraStream({ cameraId, cameraName, isActive, onToggle, enableAiTest }: CameraStreamProps) {
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState<any>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const failureCountRef = useRef(0);

  // Auto-detect URL like in dashboard-client.tsx
  const isLocalhost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '192.168.2.169';
  const baseUrl = isLocalhost ? 'http://127.0.0.1:5002' : `http://${currentHost}:5002`;

  // Debug: Log the URL being used
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log(`Camera ${cameraId} - Hostname: ${window.location.hostname}, isLocalhost: ${isLocalhost}, baseUrl: ${baseUrl}`);
    }
  }, [cameraId, isLocalhost, baseUrl]);

  useEffect(() => {
    const stopInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    if (isActive) {
      setLoading(true);
      setError('');
      failureCountRef.current = 0;
      
      // Start camera stream
      fetch(`${baseUrl}/camera/${cameraId}/start`, { method: 'POST' })
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to start camera: ${response.status}`);
          }
          return response.json();
        })
        .then(() => {
          // Some cameras (esp. video1) can return 404 briefly until first frame exists.
          // We keep retrying and only show an error after several consecutive failures.
          const refreshMs = cameraId === 0 ? 200 : 400;

          stopInterval();
          setImageUrl(`${baseUrl}/camera/${cameraId}?t=${Date.now()}`);
          setLoading(false);

          intervalRef.current = setInterval(() => {
            setImageUrl(`${baseUrl}/camera/${cameraId}?t=${Date.now()}`);
          }, refreshMs);
        })
        .catch(err => {
          console.error('Camera error:', err);
          setError(`Failed to start camera: ${err.message}`);
          setLoading(false);
        });
    } else {
      // Stop camera stream
      fetch(`${baseUrl}/camera/${cameraId}/stop`, { method: 'POST' })
        .catch(err => console.error('Failed to stop camera:', err));
      stopInterval();
      setImageUrl('');
      setError('');
      failureCountRef.current = 0;
    }
 
    return () => {
      stopInterval();
    };
  }, [isActive, cameraId, baseUrl]);

  const testAi = async () => {
    setAiLoading(true);
    setAiError('');
    setAiResult(null);
    try {
      const resp = await fetch(`${baseUrl}/ai/detect?cameraId=${cameraId}`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      setAiResult(data);
    } catch (e: any) {
      setAiError(e?.message || 'Erreur IA');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{cameraName}</CardTitle>
              <span className="text-xs text-muted-foreground">(id: {cameraId})</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {enableAiTest && (
              <Button
                variant="outline"
                size="sm"
                onClick={testAi}
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="text-sm">IA</span>
                )}
                Tester
              </Button>
            )}
            <Button
              variant={isActive ? "destructive" : "default"}
              size="sm"
              onClick={() => onToggle(cameraId)}
              disabled={loading}
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : isActive ? (
                <CameraOff className="h-4 w-4" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {isActive ? 'Stop' : 'Start'}
            </Button>
          </div>
        </div>
        <CardDescription>
          {isActive ? 'Live camera feed' : 'Camera is offline'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
          {error && (
            <Alert className="absolute inset-0 flex items-center justify-center m-0">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin" />
            </div>
          )}
          {isActive && !error && !loading && imageUrl ? (
            <img
              src={imageUrl}
              alt={cameraName}
              className="w-full h-full object-contain"
              onLoad={() => {
                failureCountRef.current = 0;
              }}
              onError={() => {
                // Transient failures happen; only surface error after repeated failures.
                failureCountRef.current += 1;
                if (failureCountRef.current >= 10) {
                  setError('Failed to load camera image');
                }
              }}
            />
          ) : !error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              <Camera className="h-12 w-12" />
            </div>
          )}
        </div>

        {enableAiTest && (aiError || aiResult) && (
          <div className="mt-3">
            {aiError && (
              <Alert variant="destructive">
                <AlertTitle>IA</AlertTitle>
                <AlertDescription>{aiError}</AlertDescription>
              </Alert>
            )}
            {aiResult && (
              <Alert>
                <AlertTitle>IA</AlertTitle>
                <AlertDescription>
                  <pre className="text-xs overflow-auto whitespace-pre-wrap">{JSON.stringify(aiResult, null, 2)}</pre>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CameraPanel() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [activeCameras, setActiveCameras] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  // Auto-detect URL
  const isLocalhost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '192.168.2.169';
  const baseUrl = isLocalhost ? 'http://127.0.0.1:5002' : `http://${currentHost}:5002`;

  useEffect(() => {
    fetchCameras();
    const interval = setInterval(fetchCameras, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchCameras = async () => {
    try {
      const response = await fetch(`${baseUrl}/cameras`);
      const data = await response.json();
      const cams = (data.cameras || []) as Camera[];
      cams.sort((a, b) => a.id - b.id);
      setCameras(cams);
    } catch (error) {
      console.error('Failed to fetch cameras:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCamera = async (cameraId: number) => {
    setActiveCameras(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cameraId)) {
        newSet.delete(cameraId);
      } else {
        newSet.add(cameraId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-6 w-6" />
            Caméras de Surveillance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const interiorCamera = cameras[0];
  const exteriorCamera = cameras[1];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-6 w-6" />
            Caméras de Surveillance
          </CardTitle>
          <CardDescription>
            Visualisation en direct des caméras intérieure et extérieure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {interiorCamera && (
              <CameraStream
                cameraId={interiorCamera.id}
                cameraName="Caméra Intérieure"
                isActive={activeCameras.has(interiorCamera.id)}
                onToggle={toggleCamera}
                enableAiTest={interiorCamera.id === 0}
              />
            )}
            {exteriorCamera && (
              <CameraStream
                cameraId={exteriorCamera.id}
                cameraName="Caméra Extérieure"
                isActive={activeCameras.has(exteriorCamera.id)}
                onToggle={toggleCamera}
              />
            )}
          </div>
          {cameras.length === 0 && (
            <Alert>
              <AlertTitle>Aucune caméra détectée</AlertTitle>
              <AlertDescription>
                Vérifiez que les caméras USB sont bien connectées au Raspberry Pi.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
