interface HeartbeatData {
  machineId: string;
  status: 'online' | 'offline';
  sensors: {
    temp?: number;
    humidity?: number;
    doorOpen: boolean;
    doorUrl?: string;
    doorRaw?: any;
  };
  inventory: Record<string, number>;
  location: string;
  firmware: string;
  uptime: string;
  meta?: {
    timestamp: string;
    userAgent?: string;
    url?: string;
    memoryUsage?: string;
  };
}

class HeartbeatService {
  private machineId: string;
  private location: string;
  private fleetManagerUrl: string;
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    // Récupérer le machineId depuis localStorage ou le hostname
    this.machineId = this.getMachineId();
    this.location = this.getLocation();
    // URL du Fleet Manager - peut être modifiée dans localStorage
    this.fleetManagerUrl = this.getFleetManagerUrl();
  }

  private getFleetManagerUrl(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('shaka:fleetManagerUrl');
      if (stored) return stored;
    }
    
    // URL par défaut - peut être changée quand le Fleet Manager sera disponible
    return 'https://fleet.shakadistribution.ca/api/heartbeat';
  }

  public updateFleetManagerUrl(url: string) {
    this.fleetManagerUrl = url;
    if (typeof window !== 'undefined') {
      localStorage.setItem('shaka:fleetManagerUrl', url);
    }
  }

  private getMachineId(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('shaka:machineId');
      if (stored) return stored;
    }
    
    // Fallback: hostname (stable) — si on est sur localhost/127.0.0.1, exiger une config explicite
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocalhost) {
      return '';
    }

    const sanitized = hostname.replace(/[^a-zA-Z0-9]/g, '');
    const id = `shaka-${sanitized}`;
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('shaka:machineId', id);
    }
    
    return id;
  }

  private getLocation(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('shaka:location');
      if (stored) return stored;
    }
    
    // Par défaut, on peut utiliser une géolocalisation ou une valeur configurée
    return 'Montréal, QC';
  }

  private getUptime(): string {
    // Stocker l'heure de démarrage du service
    if (typeof window !== 'undefined') {
      const startTime = localStorage.getItem('shaka:serviceStartTime');
      if (!startTime) {
        localStorage.setItem('shaka:serviceStartTime', Date.now().toString());
        return '0m';
      }
      
      const uptimeMs = Date.now() - parseInt(startTime);
      const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (days > 0) return `${days}j ${hours}h ${minutes}m`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    }
    
    return '0m';
  }

  private async getSensors(): Promise<{ temp?: number; humidity?: number; doorOpen: boolean }> {
    const sensors: { temp?: number; humidity?: number; doorOpen: boolean; doorUrl?: string; doorRaw?: any } = {
      doorOpen: false
    };

    try {
      // Récupérer le statut de la porte depuis le vend server
      // Important: 127.0.0.1 dépend du device qui ouvre l'UI. On préfère l'hostname courant si possible.
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
      const baseHost = hostname && hostname !== 'localhost' ? hostname : '127.0.0.1';
      const doorUrl = `http://${baseHost}:5001/door-status`;
      sensors.doorUrl = doorUrl;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const doorResponse = await fetch(doorUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (doorResponse.ok) {
        const doorData = await doorResponse.json();
        sensors.doorRaw = doorData;
        // Supporte les formats: {status:'open'|'closed'} ou {isOpen:boolean}
        if (typeof doorData?.isOpen === 'boolean') {
          sensors.doorOpen = doorData.isOpen;
        } else {
          sensors.doorOpen = doorData?.status === 'open';
        }
        console.log('🚪 Door status:', doorData);
      } else {
        console.warn('Door status endpoint returned:', doorResponse.status);
      }
    } catch (error) {
      console.warn('Failed to get door status:', error);
    }

    // Température et humidité simulées pour l'instant
    // TODO: Connecter de vrais capteurs si disponibles
    sensors.temp = 22 + Math.random() * 5; // 22-27°C
    sensors.humidity = 40 + Math.random() * 20; // 40-60%
    
    console.log('🌡️ Sensors collected:', sensors);
    return sensors;
  }

  private async getInventory(): Promise<Record<string, number>> {
    try {
      // Récupérer l'inventaire depuis plusieurs sources
      if (typeof window !== 'undefined') {
        const inventory: Record<string, number> = {};
        
        // 1. Depuis le localStorage (offline products)
        const offlineProducts = localStorage.getItem('shaka:offlineProducts');
        if (offlineProducts) {
          try {
            const parsed = JSON.parse(offlineProducts);
            if (Array.isArray(parsed.data)) {
              parsed.data.forEach((product: any) => {
                if (product.name && product.quantity !== undefined) {
                  inventory[product.name] = product.quantity;
                }
              });
            }
          } catch (e) {
            console.warn('Failed to parse offline products:', e);
          }
        }
        
        // 2. Depuis l'API locale si possible
        try {
          const response = await fetch('/api/local-products', {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' }
          });
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data?.data)) {
              data.data.forEach((product: any) => {
                if (product.name && product.quantity !== undefined) {
                  // Prioriser les données de l'API sur localStorage
                  inventory[product.name] = product.quantity;
                }
              });
            }
          }
        } catch (e) {
          // Silencieux - l'API peut ne pas être disponible
        }
        
        console.log('📦 Inventory collected:', inventory);
        return inventory;
      }
    } catch (error) {
      console.warn('Failed to get inventory:', error);
    }

    return {};
  }

  private async sendHeartbeat() {
    console.log('🔄 Collecting heartbeat data...');
    
    const systemData = {
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      memoryUsage: typeof window !== 'undefined' && 'performance' in window && 'memory' in (window.performance as any) 
        ? Math.round((window.performance as any).memory.usedJSHeapSize / 1024 / 1024) + 'MB'
        : undefined
    };

    const data: HeartbeatData = {
      machineId: this.machineId,
      status: 'online',
      sensors: await this.getSensors(),
      inventory: await this.getInventory(),
      location: this.location,
      firmware: 'v2.1.3', // Version du firmware
      uptime: this.getUptime(),
      meta: systemData
    };

    console.log('💻 System data:', systemData);

    console.log('📊 Heartbeat data:', {
      machineId: data.machineId,
      status: data.status,
      doorOpen: data.sensors.doorOpen,
      inventoryCount: Object.keys(data.inventory).length,
      location: data.location,
      uptime: data.uptime
    });

    try {
      console.log('🌐 Sending to local endpoint /api/heartbeat...');
      
      // Utiliser notre endpoint local comme proxy pour contourner CORS
      const response = await fetch('/api/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forward-To': this.fleetManagerUrl, // Indiquer où forwarder
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Heartbeat sent successfully:', result);
      
      // Stocker le dernier heartbeat pour le monitoring
      if (typeof window !== 'undefined') {
        const logs = JSON.parse(localStorage.getItem('shaka:heartbeat-logs') || '[]');
        logs.push({
          timestamp: new Date().toISOString(),
          data: data,
          result: result
        });
        // Garder seulement les 10 derniers logs
        if (logs.length > 10) logs.shift();
        localStorage.setItem('shaka:heartbeat-logs', JSON.stringify(logs));
      }
      
    } catch (error) {
      console.error('❌ Failed to send heartbeat:', error);
      // Ne pas arrêter le service en cas d'erreur, juste logger
    }
  }

  public start() {
    if (this.isRunning) {
      console.log('Heartbeat service already running');
      return;
    }

    if (!this.machineId) {
      console.warn('⚠️ Heartbeat not started: machineId is not configured');
      return;
    }

    console.log(`🚀 Starting heartbeat service for ${this.machineId}`);
    console.log(`📍 Location: ${this.location}`);
    console.log(`🌐 Fleet Manager: ${this.fleetManagerUrl}`);
    this.isRunning = true;
    
    // Envoyer le premier heartbeat immédiatement
    console.log('💓 Sending first heartbeat...');
    this.sendHeartbeat();
    
    // Envoyer un heartbeat toutes les 30 secondes
    this.interval = setInterval(() => {
      console.log('💓 Sending scheduled heartbeat...');
      this.sendHeartbeat();
    }, 30000);
    
    console.log('⏰ Heartbeat interval set to 30 seconds');
  }

  public stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping heartbeat service');
    this.isRunning = false;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Envoyer un dernier heartbeat avec status 'offline'
    this.sendOfflineHeartbeat();
  }

  private async sendOfflineHeartbeat() {
    try {
      // Utiliser le proxy local aussi pour le signal offline
      await fetch('/api/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forward-To': this.fleetManagerUrl,
        },
        body: JSON.stringify({
          machineId: this.machineId,
          status: 'offline',
          sensors: { doorOpen: false },
          inventory: {},
          location: this.location,
          firmware: 'v2.1.3',
          uptime: this.getUptime()
        }),
      });
    } catch (error) {
      console.error('Failed to send offline heartbeat:', error);
    }
  }

  public updateLocation(location: string) {
    this.location = location;
    if (typeof window !== 'undefined') {
      localStorage.setItem('shaka:location', location);
    }
  }
}

// Singleton instance
export const heartbeatService = new HeartbeatService();
