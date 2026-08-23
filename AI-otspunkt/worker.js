// Ruumiandur AI-otspunkt (Cloudflare Worker)
// Loeb Supabase'ist viimase perioodi WiFi RSSI andmed, arvutab tunnipõhised
// agregaadid ja palub Workers AI (Llama 4 Scout) mudelil koostada eestikeelse kokkuvõtte.

const SEND_INTERVAL_MINUTES = 1; // peab vastama ESP32 firmware hetkeseadistusele
const SILENCE_THRESHOLD_MINUTES = SEND_INTERVAL_MINUTES * 3;

function classifyQuality(avgRssi) {
  if (avgRssi >= -60) return "hea";
  if (avgRssi >= -70) return "normaalne";
  return "kehv";
}

// Arvutab, mitu minutit antud [hourStart, hourEnd) vahemikust langeb lünka.
function computeGapMinutesInHour(ascendingReadings, hourStart, hourEnd) {
  let gapMinutes = 0;

  for (let i = 1; i < ascendingReadings.length; i++) {
    const prevTime = new Date(ascendingReadings[i - 1].created_at).getTime();
    const currTime = new Date(ascendingReadings[i].created_at).getTime();
    const diffMinutes = (currTime - prevTime) / 60000;

    if (diffMinutes > SILENCE_THRESHOLD_MINUTES) {
      const overlapStart = Math.max(prevTime, hourStart);
      const overlapEnd = Math.min(currTime, hourEnd);
      if (overlapEnd > overlapStart) {
        gapMinutes += (overlapEnd - overlapStart) / 60000;
      }
    }
  }

  return Math.round(gapMinutes);
}

function buildHourlyBreakdown(readingsDesc, hours = 24) {
  const ascending = readingsDesc.slice().reverse();
  const now = Date.now();
  const breakdown = [];

  for (let h = hours - 1; h >= 0; h--) {
    const hourEnd = now - h * 60 * 60000;
    const hourStart = hourEnd - 60 * 60000;

    const inHour = ascending.filter(r => {
      const t = new Date(r.created_at).getTime();
      return t >= hourStart && t < hourEnd;
    });

    const gapMinutes = computeGapMinutesInHour(ascending, hourStart, hourEnd);

    if (inHour.length === 0) {
      breakdown.push({
        hour: new Date(hourStart).toLocaleTimeString("et-EE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Tallinn" }),
        avg_rssi: null,
        quality: "puudub",
        gap_minutes: 60
      });
      continue;
    }

    const avgRssi = inHour.reduce((sum, r) => sum + r.rssi_avg, 0) / inHour.length;

    breakdown.push({
      hour: new Date(hourStart).toLocaleTimeString("et-EE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Tallinn" }),
      avg_rssi: Math.round(avgRssi * 10) / 10,
      quality: classifyQuality(avgRssi),
      gap_minutes: gapMinutes
    });
  }

  return breakdown;
}

async function fetchReadings(env, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60000).toISOString();
  const url = `${env.SUPABASE_URL}/rest/v1/readings?select=*&created_at=gte.${since}&order=created_at.desc&limit=2000`;

  const res = await fetch(url, {
    headers: { apikey: env.SUPABASE_KEY }
  });

  if (!res.ok) {
    throw new Error(`Supabase päring ebaõnnestus: ${res.status}`);
  }

  return res.json();
}

function buildPrompt(hourlyBreakdown) {
  const dataLines = hourlyBreakdown
    .map(h => `${h.hour}: keskmine ${h.avg_rssi ?? "-"} dBm, kvaliteet ${h.quality}, vaikis ${h.gap_minutes} min`)
    .join("\n");

  return `Viimase 24 tunni mõõtmisandmed:

${dataLines}

Kirjuta kliendile lühike (2-4 lauset) kokkuvõte:
1. Üldine muster (kas levi oli parem öösel või päeval).
2. Katkestused: kui esineb pikemaid pause, koonda need ajaaknaks (nt "kella 23:00-st kuni 17:00-ni").
3. Olulised muudatused (nt lühiajaline paranemine teatud kellaajal).
4. Soovitus teistele seadmetele: anna hinne selle asukoha sobivuse kohta teistele WiFi-seadmetele (nt sülearvuti, nutiteler, nutikodu seadmed). Kui levi on kehv või auklik, hoiata, et teisi seadmeid ei tasu sinna panna või tuleks ruuterit lähemale tuua. Kui levi on hea, kinnita, et koht sobib teistele seadmetele suurepäraselt.

Reeglid:
- ÜLDISTA KATKESTUSED: Ära kunagi loetle järjestikuseid kellaaegu ükshaaval. Kasuta ajavahemikke (nt "öösel ja päeval vahemikus 23:00–17:00").
- Kirjuta selges ja loomulikus eesti keeles.
- Kasuta tavakeelt (sõnad "levi" või "signaal", ära kasuta tehnilist mõistet "RSSI").
- Vasta otse kokkuvõttega ilma sissejuhatuseta.
- Ära anna täpseid paigutussoovitusi (nt "liiguta 2m vasakule").`;
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const readings = await fetchReadings(env, 24);

      if (readings.length === 0) {
        return Response.json(
          { summary: "Viimase 24 tunni jooksul pole andur ühtegi mõõtmist saatnud." },
          { headers: corsHeaders }
        );
      }

      const hourlyBreakdown = buildHourlyBreakdown(readings, 24);
      const prompt = buildPrompt(hourlyBreakdown);

      const aiResponse = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
        messages: [
          { 
            role: "system", 
            content: "Oled nutika ruumianduri assistent, kes analüüsib WiFi levi andmeid ning annab kasutajale lühikesi ja praktilisi soovitusi selle kohta, kas antud asukoht sobib teistele WiFi-seadmetele." 
          },
          { role: "user", content: prompt }
        ]
      });

      return Response.json(
        { summary: aiResponse.response, hourly: hourlyBreakdown },
        { headers: corsHeaders }
      );
    } catch (err) {
      return Response.json(
        { error: err.message },
        { status: 500, headers: corsHeaders }
      );
    }
  }
};
