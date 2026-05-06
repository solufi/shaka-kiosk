import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const forwardTo = request.headers.get('X-Forward-To');
    
    const { machineId, status, sensors, inventory, location, firmware, uptime } = body;
    
    // Validation basique
    if (!machineId || !status) {
      return NextResponse.json(
        { error: 'machineId and status are required' },
        { status: 400 }
      );
    }
    
    // Log du heartbeat pour monitoring local
    console.log(`[${new Date().toISOString()}] Heartbeat from ${machineId}:`, {
      status,
      doorOpen: sensors?.doorOpen,
      temp: sensors?.temp,
      inventory: inventory ? `${Object.keys(inventory).length} items` : 'none',
      location,
      firmware,
      uptime,
      forwardTo
    });
    
    // DISABLED: Forwarding is now handled by the Python shaka_heartbeat.py service.
    // The client-side heartbeat was creating ghost machines with wrong machineId.
    if (false && forwardTo) {
      try {
        const fleetResponse = await fetch(forwardTo, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Shaka-Heartbeat/1.0'
          },
          body: JSON.stringify(body),
        });

        if (fleetResponse.ok) {
          const fleetResult = await fleetResponse.json();
          console.log('✅ Forwarded to Fleet Manager successfully:', fleetResult);
          
          return NextResponse.json({
            success: true,
            forwarded: true,
            received: {
              timestamp: new Date().toISOString(),
              machineId,
              status
            },
            fleetResponse: fleetResult
          });
        } else {
          console.error(`❌ Fleet Manager returned ${fleetResponse.status}: ${fleetResponse.statusText}`);
          
          // On retourne quand même succès pour ne pas bloquer le client
          return NextResponse.json({
            success: true,
            forwarded: false,
            error: `Fleet Manager error: ${fleetResponse.status} ${fleetResponse.statusText}`,
            received: {
              timestamp: new Date().toISOString(),
              machineId,
              status
            }
          });
        }
      } catch (forwardError) {
        console.error('❌ Failed to forward to Fleet Manager:', forwardError);
        
        // On retourne quand même succès pour ne pas bloquer le client
        return NextResponse.json({
          success: true,
          forwarded: false,
          error: `Forward failed: ${forwardError instanceof Error ? forwardError.message : 'Unknown error'}`,
          received: {
            timestamp: new Date().toISOString(),
            machineId,
            status
          }
        });
      }
    }
    
    // Pas de forwarding - mode local seulement
    return NextResponse.json({
      success: true,
      forwarded: false,
      received: {
        timestamp: new Date().toISOString(),
        machineId,
        status
      }
    });
    
  } catch (error) {
    console.error('Heartbeat error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
