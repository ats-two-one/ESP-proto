#include <WiFi.h>
#include <HTTPClient.h>
#include "config.h"

// ---- Testimise intervallid (kiired, demo jaoks) ----
// Toodangus/akutoitel: READ_INTERVAL_MS = 60000, SEND_INTERVAL_MS = 600000
const unsigned long READ_INTERVAL_MS = 10 * 1000;   // loe RSSI iga 10s
const unsigned long SEND_INTERVAL_MS = 60 * 1000;   // saada kokkuvõte iga 1min

unsigned long lastReadTime = 0;
unsigned long lastSendTime = 0;

// Akumulaatorid ühe saatmisperioodi jaoks
long rssiMin = 0;
long rssiMax = 0;
long rssiSum = 0;
int readingCount = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("Ruumiandur (RSSI) käivitub...");

  connectWiFi();
}

void loop() {
  unsigned long now = millis();

  // Kui WiFi kadus, proovi taasühenduda
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi ühendus kadunud, proovin uuesti...");
    connectWiFi();
  }

  // Loe RSSI iga READ_INTERVAL_MS
  if (now - lastReadTime >= READ_INTERVAL_MS) {
    lastReadTime = now;
    readRSSI();
  }

  // Saada kokkuvõte iga SEND_INTERVAL_MS
  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = now;
    sendSummary();
  }
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Ühendun WiFi-ga");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("Ühendatud! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi ühendus ebaõnnestus, proovin järgmisel tsüklil uuesti.");
  }
}

void readRSSI() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("RSSI lugemine vahele jäetud - WiFi pole ühendatud.");
    return;
  }

  long rssi = WiFi.RSSI();
  Serial.print("RSSI loetud: ");
  Serial.println(rssi);

  if (readingCount == 0) {
    // Esimene lugemine selles perioodis
    rssiMin = rssi;
    rssiMax = rssi;
    rssiSum = rssi;
  } else {
    if (rssi < rssiMin) rssiMin = rssi;
    if (rssi > rssiMax) rssiMax = rssi;
    rssiSum += rssi;
  }
  readingCount++;
}

void sendSummary() {
  if (readingCount == 0) {
    Serial.println("Pole andmeid saatmiseks selles perioodis.");
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Saatmine ebaõnnestus - WiFi pole ühendatud. Andmed lähevad kaotsi selles tsüklis.");
    // Lihtne prototüüp: ei puhverda kadunud andmeid, alustab järgmist perioodi puhtalt lehelt.
    readingCount = 0;
    return;
  }

  float rssiAvg = (float)rssiSum / readingCount;

  HTTPClient http;
  http.begin(SUPABASE_URL);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  String payload = "{";
  payload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"rssi_min\":" + String(rssiMin) + ",";
  payload += "\"rssi_max\":" + String(rssiMax) + ",";
  payload += "\"rssi_avg\":" + String(rssiAvg, 2) + ",";
  payload += "\"reading_count\":" + String(readingCount);
  payload += "}";

  Serial.print("Saadan: ");
  Serial.println(payload);

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    Serial.print("Vastuse kood: ");
    Serial.println(httpCode);
  } else {
    Serial.print("POST ebaõnnestus, viga: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();

  // Nulli akumulaatorid järgmise perioodi jaoks
  readingCount = 0;
  rssiMin = 0;
  rssiMax = 0;
  rssiSum = 0;
}
