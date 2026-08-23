Ruumiandur — WiFi levi jälgija (prototüüp)

Kuidas käivitada

See prototüüp kasutab pilveteenuseid (Supabase andmebaas, Cloudflare Workers), mistõttu on käivitamiseks vaja kontosid antud keskkondades. index.html sisaldab hetkel minu isiklikke URL aadresse ja võtmeid. 
Kuidas need seadistada ja kuidas komponendid omavahel ühenduvad?

Riistvara (firmware):
Ava ruumiandur.ino + config.h Arduino IDE-s
Täida config.h oma WiFi ja Supabase andmetega (Kopeeri index.html failist SUPABASE_URL ja SUPABASE_KEY väärtused config.h faili) ning laadi kogu komplekt ESP32 plaadile.

Backend: Supabase projekt on juba loodud.

AI-otspunkt: Cloudflare Worker (worker.js) on deploy'itud, kasutab Workers AI (Llama 4 Scout) tasuta taset, ei vaja välist API võtit.

Veebivaade: ava index.html otse brauseris — teeb päringud otse Supabase REST API-le ja Worker'ile.


Mida mõõtsin ja mida tulemused näitasid
Mõõtsin ESP32-C3 WiFi signaalitugevust (RSSI) — see valiti mugavuse pärast (ei vaja täiendavat andurit), mitte kuna see on "õige" andur toote jaoks. Andur toimib reaalselt levi kvaliteedi mõõdikuna: kas antud asukoht sobib teistele WiFi-seadmetele. Testimisel (loe iga 10s, saada iga 1min) nägin tegelikku signaali kõikumist -49 kuni -92 dBm vahel, sõltuvalt seadme kaugusest ruuterist, ja suutsin usaldusväärselt tuvastada nii tegelikke andmelünki (WiFi väljalülitamine) kui kvaliteedi taset.


Peamised arhitektuuriotsused
Vaikimine — heartbeat-tüüpi tuvastus: kui kahe järjestikuse kirje vahel on lünk üle lävendi (3x saatmisintervall), loetakse see "andur ei vasta" olekuks. (2) Kvaliteet — RSSI väärtusest tuletatud silt (hea >= -60 dBm, normaalne -60..-70, kehv < -70). Lävendid otsustasin ise, AI ülesanne on ainult loomulikus keeles selgitus, mitte lävendi valimine.

Levi staatused: kuvatav olek muutub alles siis, kui 3 järjestikust mõõtmist on samas kategoorias — väldib "vilkumist" ühe kõikuva väärtuse pärast.

AI-le saadetakse agregaadid, mitte toorandmed: tunnipõhine jaotus (24 rida/päev) koos kvaliteedisildi, keskmise dBm väärtuse ja selle tunni "vaikimise minutitega" — ligikaudu 100x vähem andmeid kui toorandmed.

AI käivitub ainult nupuvajutusel ("AI hinnang"), mitte automaatselt/perioodiliselt — kulu- ja loogikaefektiivne, kuna keegi ei vaata pidevalt.

Graafik kasutab ajapõhist X-telge, et katkestuse kestus oleks visuaalselt proportsionaalne tegeliku ajaga.



Piirangud ja riskid

1000 kasutajaga läheks katki: veebivaade teeb otse-REST päringuid Supabase'ile iga 15s ilma vahemäluta (Sõltub täpsemast ärivajadusest, aga suurma kasutajaskonnaga ei uunedaks vaadet automaatselt).

RSSI nõuab aktiivset WiFi-ühendust, mis eeldaks pivecat voolutoidet.

Andmebaasi API on avatud ilma RLS-ita — prototüübiks piisav, tootmises vajaks autentimist.

AI ei anna täpset paigutussoovitust õhe anduriga (nt "liiguta 2m"), ainult üldist ("vii ruuterile lähemale").

AI sõnastuse kvaliteet (Llama 4 Scout, väiksem mudel) kõigub — promptis on kordumise vältimise reegel, aga see pole lõpuni viimistletud.



Järgmine samm


Päris andur + deep sleep tsükkel reaalse akusäästu jaoks
Mitme seadme tugi (device_id on juba tabelis olemas)
Autentimine + RLS
Intervalide oprimeerimine ja kasutajaliides vastavalt ärivajadustele.


Mida jätsin välja ja miks
Migratsioonifailid - ei olnud otseselt nõutud ja andmebaas on olemas juba. Valisin HTTP kuna on tuttav ja ka AI soovitas kiiruse mõttes. Teavitused levi kõikumisest - prototööbi jaoks pole kriitilised. 
AI tööriistade kasutus

Kasutasin Claude'i (chat) kogu arhitektuuri planeerimiseks, koodi kirjutamiseks ja silumiseks, kohati ka kontrollimiseks Gemini't. 


Peamised kohad, kus AI eksis või viis valele teele:

Algse andmebaasi struktuuri soovitas AI koos "anomaalia" true/false väljaga, kui levi kõigub etteantud piiridest välja. Wifi signaali puhul see aga pole anomaalia vaid täiesti ootuspärane käitumine kehva levi puhul.
Signaali katkestuse kuvamisega oli mitmeid probleeme, kus eialgu neid graafikus ei kuvatud, kuna koostati ajatemplite järgi. Lõplik lahendus võrdleb otse järjestikuseid tegelikke kirjeid
Worker'i kellaaja väljund oli algul vales ajavööndis (UTC vs Europe/Tallinn), kuna toLocaleTimeString kasutab vaikimisi serveri, mitte kliendi ajavööndit.
