import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/supabase/access";
import { Permissions } from "@/lib/supabase/permissions";
import type { Json } from "@/lib/supabase/types";

export interface EmbeddingConfig {
  provider: "openai" | "azure" | "local" | "aliyun";
  baseUrl: string;
  apiKey: string;
  model: string;
  dimensions: number;
  batchSize: number;
  chunkSize: number;
  chunkOverlap: number;
}

type JsonObject = { [key: string]: Json | undefined };

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const searchParams = request.nextUrl.searchParams;
    const operatorId = searchParams.get("operatorId");
    const key = searchParams.get("key");

    if (!operatorId) {
      return NextResponse.json({ error: "Operator ID is required" }, { status: 400 });
    }

    const canView = await hasPermission(supabase, operatorId, Permissions.SYSTEM_SETTINGS);
    if (!canView) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    if (key) {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .eq("key", key)
        .single();

      if (error || !data) {
        return NextResponse.json({ setting: null });
      }

      const valueObj = data.value as JsonObject;
      const sanitizedValue = { ...valueObj };
      if ((key === "embedding_config" || key === "chat_config" || key === "reranker_config") && sanitizedValue.apiKey) {
        sanitizedValue.apiKey = "********";
      }

      return NextResponse.json({ setting: { ...data, value: sanitizedValue } });
    }

    const { data, error } = await supabase
      .from("system_settings")
      .select("*")
      .order("key");

    if (error) throw error;

    const sanitizedData = data?.map(setting => {
      const valueObj = setting.value as JsonObject;
      const sanitizedValue = { ...valueObj };
      if ((setting.key === "embedding_config" || setting.key === "chat_config" || setting.key === "reranker_config") && sanitizedValue.apiKey) {
        sanitizedValue.apiKey = "********";
      }
      return { ...setting, value: sanitizedValue };
    });

    return NextResponse.json({ settings: sanitizedData });
  } catch (error) {
    console.error("Get settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await request.json();
    const { operatorId, key, value } = body;

    if (!operatorId || !key || value === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const canUpdate = await hasPermission(supabase, operatorId, Permissions.SYSTEM_SETTINGS);
    if (!canUpdate) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const { data: existing } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", key)
      .single();

    let finalValue = value;
    if ((key === "embedding_config" || key === "chat_config" || key === "reranker_config") && existing?.value) {
      const existingValue = existing.value as JsonObject;
      finalValue = { ...value };
      if (finalValue.apiKey === "********" || finalValue.apiKey === "") {
        finalValue.apiKey = existingValue.apiKey || "";
      }
    }

    const { data, error } = await supabase
      .from("system_settings")
      .upsert({ 
        key,
        value: finalValue, 
        updated_by: operatorId,
        updated_at: new Date().toISOString() 
      }, {
        onConflict: "key"
      })
      .select()
      .single();

    if (error) throw error;

    const resultValue = data.value as JsonObject;
    const sanitizedValue = { ...resultValue };
    if ((key === "embedding_config" || key === "chat_config" || key === "reranker_config") && sanitizedValue.apiKey) {
      sanitizedValue.apiKey = "********";
    }

    return NextResponse.json({ success: true, setting: { ...data, value: sanitizedValue } });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
