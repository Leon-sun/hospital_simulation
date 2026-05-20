import { NextResponse } from "next/server";

import { getOutpatientTemplateOptimization } from "@/lib/template-optimization-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty");

  return NextResponse.json(getOutpatientTemplateOptimization(specialty));
}
