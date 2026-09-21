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
