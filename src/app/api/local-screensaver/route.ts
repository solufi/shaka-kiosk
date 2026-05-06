import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), "local-cache", "screensaver.json");

export async function GET() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      return NextResponse.json(data);
    }
  } catch (e) {
    console.error("Failed to read screensaver config:", e);
  }
  return NextResponse.json({ enabled: false, durationSeconds: 5, images: [] });
}
