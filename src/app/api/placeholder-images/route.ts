import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PLACEHOLDER_FILE = path.join(process.cwd(), "src", "lib", "placeholder-images.json");

export async function GET() {
  try {
    if (fs.existsSync(PLACEHOLDER_FILE)) {
      const data = JSON.parse(fs.readFileSync(PLACEHOLDER_FILE, "utf-8"));
      return NextResponse.json(data.placeholderImages || []);
    }
  } catch (e) {
    console.error("Failed to read placeholder-images:", e);
  }
  return NextResponse.json([]);
}
