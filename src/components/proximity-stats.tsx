'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type ProximitySummary = {
  presence_today: number;
  engagement_today: number;
  gestures_today: number;
  conversion_rate: number;
  date: string;
};

type HourlyStats = {
  hour: number;
  presence_count: number;
  engagement_count: number;
  gesture_left: number;
  gesture_right: number;
};

type ProximityEvent = {
  id: number;
  timestamp: number;
  event_type: string;
  data: string | null;
  distance_mm: number;
};

type LiveStatus = {
  connected: boolean;
  mode: string;
  presence: { detected: boolean; count: number; lastTime: number };
  engagement: string;
  distance_mm: number[];
  gesture: { last: string; lastTime: number };
};

function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://127.0.0.1:5001';
    }
    return `http://${hostname}:5001`;
  }
  return 'http://127.0.0.1:5001';
}

function StatBox({ label, value, color = 'text-foreground' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function HourlyChart({ data }: { data: HourlyStats[] }) {
  const maxVal = Math.max(1, ...data.map(h => h.presence_count));
  const hours: HourlyStats[] = [];
  for (let h = 0; h < 24; h++) {
    hours.push(data.find(x => x.hour === h) || { hour: h, presence_count: 0, engagement_count: 0, gesture_left: 0, gesture_right: 0 });
  }

  return (
    <div className="flex items-end gap-[2px] h-24 mt-2">
      {hours.map(h => {
        const presH = maxVal > 0 ? (h.presence_count / maxVal) * 100 : 0;
        const engH = maxVal > 0 ? (h.engagement_count / maxVal) * 100 : 0;
        return (
          <div key={h.hour} className="flex-1 flex flex-col items-center gap-[1px]" title={`${h.hour}h: ${h.presence_count} passages, ${h.engagement_count} engagements`}>
            <div className="w-full flex flex-col-reverse gap-[1px]" style={{ height: '100%' }}>
              <div className="w-full rounded-t bg-blue-500/70" style={{ height: `${presH}%`, minHeight: presH > 0 ? '2px' : '0' }} />
              <div className="w-full rounded-t bg-emerald-500/70" style={{ height: `${engH}%`, minHeight: engH > 0 ? '2px' : '0' }} />
            </div>
            {h.hour % 4 === 0 && <span className="text-[8px] text-muted-foreground">{h.hour}h</span>}
          </div>
        );
      })}
    </div>
  );
}

function EventBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    presence: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    engagement: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
    gesture_left: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    gesture_right: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  };
  const labels: Record<string, string> = {
    presence: 'Passage',
    engagement: 'Engagement',
    gesture_left: 'Geste \u2190',
    gesture_right: 'Geste \u2192',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[type] || 'bg-gray-100 text-gray-800'}`}>
      {labels[type] || type}
    </span>
  );
}

export function ProximityStats() {
  const [summary, setSummary] = useState<ProximitySummary | null>(null);
  const [hourly, setHourly] = useState<HourlyStats[]>([]);
  const [events, setEvents] = useState<ProximityEvent[]>([]);
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'today' | 'events'>('today');

  const fetchAll = useCallback(async () => {
    const base = getBaseUrl();
    try {
      const [summaryRes, todayRes, eventsRes, statusRes] = await Promise.all([
        fetch(`${base}/proximity/summary`).catch(() => null),
        fetch(`${base}/proximity/stats/today`).catch(() => null),
        fetch(`${base}/proximity/events`).catch(() => null),
        fetch(`${base}/proximity/status`).catch(() => null),
      ]);

      if (summaryRes?.ok) {
        const d = await summaryRes.json();
        if (d.ok !== false) setSummary(d);
      }
      if (todayRes?.ok) {
        const d = await todayRes.json();
        if (d.hourly) setHourly(d.hourly);
      }
      if (eventsRes?.ok) {
        const d = await eventsRes.json();
        if (d.events) setEvents(d.events.slice(0, 20));
      }
      if (statusRes?.ok) {
        const d = await statusRes.json();
        if (d.connected !== undefined) setLive(d);
      }
      setError(null);
    } catch (e) {
      setError('Impossible de charger les stats de proximite');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 15000);
    return () => clearInterval(id);
  }, [fetchAll]);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <CardTitle>Capteur de Proximite</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {live && (
              <Badge variant={live.connected ? 'default' : 'destructive'} className="text-xs">
                {live.connected ? 'Connecte' : 'Deconnecte'}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              {loading ? 'Chargement...' : 'Actualiser'}
            </Button>
          </div>
        </div>
        <CardDescription>
          Statistiques de presence, engagement et gestes detectes par le capteur Evo Swipe Plus.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-sm text-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Live sensor info */}
        {live && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className={`inline-block h-2 w-2 rounded-full ${live.connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>Mode: {live.mode}</span>
            {live.distance_mm && live.distance_mm[0] > 0 && <span>Distance: {live.distance_mm[0]}mm</span>}
            {live.presence?.detected && <span className="text-blue-600 font-medium">Presence detectee</span>}
            {live.engagement === 'engaged' && <span className="text-emerald-600 font-medium">Engage</span>}
          </div>
        )}

        {/* Summary stats */}
        {summary && (
          <div className="grid grid-cols-4 gap-3">
            <StatBox label="Passages" value={summary.presence_today} color="text-blue-600" />
            <StatBox label="Engagements" value={summary.engagement_today} color="text-emerald-600" />
            <StatBox label="Gestes" value={summary.gestures_today} color="text-purple-600" />
            <StatBox label="Conversion" value={`${summary.conversion_rate}%`} color={summary.conversion_rate > 30 ? 'text-green-600' : summary.conversion_rate > 10 ? 'text-yellow-600' : 'text-muted-foreground'} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          <Button variant={tab === 'today' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('today')}>
            Aujourd'hui
          </Button>
          <Button variant={tab === 'events' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('events')}>
            Evenements
          </Button>
        </div>

        {tab === 'today' && (
          <div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-1">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> Passages</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Engagements</span>
            </div>
            <HourlyChart data={hourly} />
            {hourly.length === 0 && (
              <p className="text-sm text-muted-foreground text-center mt-4">Aucune donnee pour aujourd'hui. Les stats apparaitront quand quelqu'un passera devant le capteur.</p>
            )}
          </div>
        )}

        {tab === 'events' && (
          <div className="max-h-64 overflow-y-auto space-y-2">
            {events.length > 0 ? events.map(evt => (
              <div key={evt.id} className="flex items-center gap-3 rounded-lg border p-2 text-sm">
                <EventBadge type={evt.event_type} />
                <span className="text-xs text-muted-foreground font-mono">
                  {new Date(evt.timestamp * 1000).toLocaleTimeString('fr-FR')}
                </span>
                {evt.distance_mm > 0 && <span className="text-xs text-muted-foreground">{evt.distance_mm}mm</span>}
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun evenement enregistre.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
