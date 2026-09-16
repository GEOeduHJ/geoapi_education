import type { ApiRequest, ApiResponse } from "../server/http";

const configured = (name: string): boolean => Boolean(process.env[name]?.trim());

export default function handler(_request: ApiRequest, response: ApiResponse): void {
  response.setHeader("Cache-Control", "no-store").status(200).json({
    ok: true,
    service: "geoapi-education",
    providers: {
      kosis: configured("KOSIS_API_KEY"),
      sgis: configured("SGIS_CONSUMER_KEY") && configured("SGIS_CONSUMER_SECRET"),
      vworld: configured("VITE_VWORLD_API_KEY") && configured("VITE_VWORLD_DOMAIN"),
      kma: configured("KMA_AUTH_KEY"),
      dataPortal: configured("DATA_GO_KR_SERVICE_KEY"),
      supabase: configured("SUPABASE_URL") && configured("SUPABASE_SERVICE_ROLE_KEY"),
    },
    checkedAt: new Date().toISOString(),
  });
}

