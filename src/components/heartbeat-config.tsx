'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { heartbeatService } from '@/lib/heartbeat-service';

export function HeartbeatConfig() {
  const { toast } = useToast();
  const [machineId, setMachineId] = useState('');
  const [location, setLocation] = useState('');
  const [fleetManagerUrl, setFleetManagerUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);

  useEffect(() => {
    // Charger la configuration actuelle
    if (typeof window !== 'undefined') {
      const storedMachineId = localStorage.getItem('shaka:machineId');
      const storedLocation = localStorage.getItem('shaka:location');
      const storedFleetUrl = localStorage.getItem('shaka:fleetManagerUrl');
      
      if (storedMachineId) setMachineId(storedMachineId);
      if (storedLocation) setLocation(storedLocation);
      if (storedFleetUrl) setFleetManagerUrl(storedFleetUrl);
    }

    // Écouter les heartbeats pour afficher le dernier timestamp
    const checkLastHeartbeat = () => {
      const logs = localStorage.getItem('shaka:heartbeat-logs');
      if (logs) {
        const parsed = JSON.parse(logs);
        if (parsed.length > 0) {
          setLastHeartbeat(parsed[parsed.length - 1].timestamp);
        }
      }
    };

    checkLastHeartbeat();
    const interval = setInterval(checkLastHeartbeat, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleSave = () => {
    if (!machineId.trim()) {
      toast({
        title: "Erreur",
        description: "Le Machine ID est requis",
        variant: "destructive"
      });
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('shaka:machineId', machineId.trim());
      localStorage.setItem('shaka:location', location.trim());
      if (fleetManagerUrl.trim()) {
        localStorage.setItem('shaka:fleetManagerUrl', fleetManagerUrl.trim());
        heartbeatService.updateFleetManagerUrl(fleetManagerUrl.trim());
      }
      heartbeatService.updateLocation(location.trim());
    }

    setIsEditing(false);
    toast({
      title: "Configuration sauvegardée",
      description: "Les paramètres heartbeat ont été mis à jour"
    });
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Recharger les valeurs originales
    if (typeof window !== 'undefined') {
      const storedMachineId = localStorage.getItem('shaka:machineId');
      const storedLocation = localStorage.getItem('shaka:location');
      const storedFleetUrl = localStorage.getItem('shaka:fleetManagerUrl');
      
      if (storedMachineId) setMachineId(storedMachineId);
      if (storedLocation) setLocation(storedLocation);
      if (storedFleetUrl) setFleetManagerUrl(storedFleetUrl);
    }
  };

  const getStatusColor = () => {
    if (!lastHeartbeat) return 'secondary';
    
    const now = new Date();
    const last = new Date(lastHeartbeat);
    const diffSeconds = (now.getTime() - last.getTime()) / 1000;
    
    if (diffSeconds < 60) return 'default'; // Vert
    if (diffSeconds < 120) return 'secondary'; // Orange
    return 'destructive'; // Rouge
  };

  const getStatusText = () => {
    if (!lastHeartbeat) return 'Jamais envoyé';
    
    const now = new Date();
    const last = new Date(lastHeartbeat);
    const diffSeconds = (now.getTime() - last.getTime()) / 1000;
    
    if (diffSeconds < 60) return 'En ligne';
    if (diffSeconds < 120) return 'Retard de 1-2 min';
    return `Hors ligne (${Math.floor(diffSeconds / 60)} min)`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Configuration Heartbeat
          <Badge variant={getStatusColor()}>
            {getStatusText()}
          </Badge>
        </CardTitle>
        <CardDescription>
          Configure l'envoi de données au Fleet Manager toutes les 30 secondes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastHeartbeat && (
          <div className="text-sm text-muted-foreground">
            Dernier heartbeat: {new Date(lastHeartbeat).toLocaleString('fr-CA')}
          </div>
        )}
        
        {isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="machineId">Machine ID</Label>
              <Input
                id="machineId"
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                placeholder="shaka-0001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Montréal, QC"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fleetManagerUrl">Fleet Manager URL (optionnel)</Label>
              <Input
                id="fleetManagerUrl"
                value={fleetManagerUrl}
                onChange={(e) => setFleetManagerUrl(e.target.value)}
                placeholder="https://fleet.shakadistribution.ca/api/heartbeat"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave}>Sauvegarder</Button>
              <Button variant="outline" onClick={handleCancel}>Annuler</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 text-sm">
              <div>
                <span className="font-medium">Machine ID:</span>
                <div className="font-mono">{machineId || 'Non configuré'}</div>
              </div>
              <div>
                <span className="font-medium">Location:</span>
                <div>{location || 'Non configurée'}</div>
              </div>
              <div>
                <span className="font-medium">Fleet Manager URL:</span>
                <div className="font-mono text-xs break-all">{fleetManagerUrl || 'URL par défaut'}</div>
              </div>
            </div>
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              Modifier la configuration
            </Button>
          </div>
        )}
        
        <div className="text-xs text-muted-foreground border-t pt-4">
          <div className="font-medium mb-2">Données envoyées:</div>
          <ul className="space-y-1">
            <li>• Status (online/offline)</li>
            <li>• Capteurs (porte, température, humidité)</li>
            <li>• Inventaire des produits</li>
            <li>• Localisation</li>
            <li>• Version firmware et uptime</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
