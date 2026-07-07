import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ServiceStatus {
  name: string;
  key: string;
  configured: boolean;
  connected: boolean;
  status: "operational" | "degraded" | "down" | "not_configured";
  message: string;
  details?: Record<string, unknown>;
  latency_ms?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the caller is an authenticated admin
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const services: ServiceStatus[] = [];

    // ---- Suno API ----
    const sunoApiKey = Deno.env.get("SUNO_API_KEY");
    const sunoStatus: ServiceStatus = {
      name: "Suno API",
      key: "SUNO_API_KEY",
      configured: !!sunoApiKey,
      connected: false,
      status: sunoApiKey ? "down" : "not_configured",
      message: sunoApiKey
        ? "Not reachable"
        : "API key is not configured",
    };

    if (sunoApiKey) {
      const start = Date.now();
      try {
        const resp = await fetch(
          "https://api.sunoapi.com/api/v1/get-credits",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${sunoApiKey}`,
              "Content-Type": "application/json",
            },
          },
        );
        sunoStatus.latency_ms = Date.now() - start;

        if (resp.ok) {
          const body = await resp.json().catch(() => ({}));
          const credits =
            body?.credits ??
            body?.data?.credits ??
            body?.remaining_credits ??
            body?.data?.remaining_credits ??
            null;
          sunoStatus.connected = true;
          sunoStatus.status = "operational";
          sunoStatus.message = "Connected";
          sunoStatus.details = { credits, raw: body };
        } else if (resp.status === 401 || resp.status === 403) {
          sunoStatus.status = "degraded";
          sunoStatus.message = "Invalid or unauthorized API key";
        } else {
          sunoStatus.status = "degraded";
          sunoStatus.message = `Unexpected response (HTTP ${resp.status})`;
        }
      } catch (e) {
        sunoStatus.latency_ms = Date.now() - start;
        sunoStatus.status = "down";
        sunoStatus.message =
          e instanceof Error ? e.message : "Request failed";
      }
    }
    services.push(sunoStatus);

    // ---- Supabase Database ----
    const dbStatus: ServiceStatus = {
      name: "Supabase Database",
      key: "SUPABASE_URL",
      configured: !!Deno.env.get("SUPABASE_URL"),
      connected: false,
      status: "down",
      message: "Not reachable",
    };

    {
      const start = Date.now();
      try {
        const serviceClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        const { error, count } = await serviceClient
          .from("songs")
          .select("id", { count: "exact", head: true });
        dbStatus.latency_ms = Date.now() - start;
        if (error) {
          dbStatus.status = "down";
          dbStatus.message = error.message;
        } else {
          dbStatus.connected = true;
          dbStatus.status = "operational";
          dbStatus.message = "Connected";
          dbStatus.details = { total_songs: count ?? 0 };
        }
      } catch (e) {
        dbStatus.latency_ms = Date.now() - start;
        dbStatus.message = e instanceof Error ? e.message : "Request failed";
      }
    }
    services.push(dbStatus);

    return new Response(
      JSON.stringify({ services, checked_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
