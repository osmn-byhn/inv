import { invitation as data } from "./config.js";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  findByCode,
  findByFingerprint,
  getSavedCode,
  loadRecord,
  makeFingerprint,
  makeInviteCode,
  saveRecord,
  storeCode,
} from "./storage.js";
import { memoryBlobUrl, uploadMemory } from "./r2.js";
import { bindFortune } from "./fortune.js";

const months = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const weekdays = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
];

const date = new Date(data.dateISO);
const names = `${data.groom} ve ${data.bride}`;
let venueMap;

const $ = (id) => document.getElementById(id);

function pad(value) {
  return String(value).padStart(2, "0");
}

function fillContent() {
  $("monthLabel").textContent = months[date.getMonth()];
  $("dayLabel").textContent = pad(date.getDate());
  $("yearLabel").textContent = String(date.getFullYear());
  $("weekdayLabel").textContent = weekdays[date.getDay()];
  $("quote").textContent = data.quote;
  $("venueName").textContent = data.venue.name;
  $("venueHall").textContent = data.venue.hall;
  $("venueAddress").textContent = data.venue.address;
  $("dressCode").textContent = data.dressCode;
  $("mapsLink").href = data.venue.mapsUrl;

  const deadline = new Date(`${data.rsvpDeadline}T00:00:00`);
  $("rsvpDeadline").textContent =
    `${deadline.getDate()} ${months[deadline.getMonth()]}`;

  $("letterBody").innerHTML = data.letter.map((line) => `<p>${line}</p>`).join("");
  $("timeline").innerHTML = data.events
    .map(
      (event) => `
        <li>
          <time>${event.time}</time>
          <div>
            <h3>${event.title}</h3>
            <p>${event.note}</p>
          </div>
        </li>
      `,
    )
    .join("");
}

function openEnvelope() {
  const envelope = $("envelope");
  const invite = $("invite");
  envelope.classList.add("is-open");
  envelope.setAttribute("aria-hidden", "true");
  invite.classList.remove("is-locked");
  document.body.style.overflow = "";
  rainPetals();
  window.setTimeout(() => venueMap?.invalidateSize(), 650);
}

function rainPetals() {
  const layer = $("petals");
  for (let i = 0; i < 14; i += 1) {
    const petal = document.createElement("span");
    petal.className = "petal";
    petal.style.left = `${Math.random() * 100}%`;
    petal.style.animationDuration = `${3.2 + Math.random() * 2.4}s`;
    petal.style.animationDelay = `${Math.random() * 0.8}s`;
    layer.appendChild(petal);
    window.setTimeout(() => petal.remove(), 6000);
  }

  for (let i = 0; i < 16; i += 1) {
    const daisy = document.createElement("img");
    daisy.src = "/daisy.svg";
    daisy.alt = "";
    daisy.className = "daisy-fall";
    daisy.style.left = `${Math.random() * 100}%`;
    daisy.style.setProperty("--drift", `${-50 + Math.random() * 100}px`);
    daisy.style.animationDuration = `${3.6 + Math.random() * 3}s`;
    daisy.style.animationDelay = `${Math.random() * 1.1}s`;
    daisy.style.width = `${22 + Math.random() * 18}px`;
    layer.appendChild(daisy);
    window.setTimeout(() => daisy.remove(), 7500);
  }
}

function startCountdown() {
  const tick = () => {
    const now = Date.now();
    const diff = date.getTime() - now;

    if (diff <= 0) {
      $("countdown").hidden = true;
      $("countdownDone").hidden = false;
      return;
    }

    const total = Math.floor(diff / 1000);
    const next = {
      days: pad(Math.floor(total / 86400)),
      hours: pad(Math.floor((total % 86400) / 3600)),
      mins: pad(Math.floor((total % 3600) / 60)),
      secs: pad(total % 60),
    };
    const nodes = {
      days: $("cDays"),
      hours: $("cHours"),
      mins: $("cMins"),
      secs: $("cSecs"),
    };
    Object.entries(next).forEach(([key, value]) => {
      if (nodes[key].textContent === value) return;
      nodes[key].textContent = value;
      const card = nodes[key].parentElement;
      card.classList.remove("is-flip");
      void card.offsetWidth;
      card.classList.add("is-flip");
    });
  };

  tick();
  window.setInterval(tick, 1000);
}

function toCalendarStamp(value) {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function calendarPayload() {
  const title = `${data.groom} & ${data.bride} Düğünü`;
  const details = `${names} evleniyor. ${data.venue.hall}, ${data.venue.name}.`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Firat Birsu//Davetiye//TR",
    "BEGIN:VEVENT",
    `DTSTART:${toCalendarStamp(data.dateISO)}`,
    `DTEND:${toCalendarStamp(data.endISO)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${details}`,
    `LOCATION:${data.venue.address}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const google = new URL("https://calendar.google.com/calendar/render");
  google.searchParams.set("action", "TEMPLATE");
  google.searchParams.set("text", title);
  google.searchParams.set(
    "dates",
    `${toCalendarStamp(data.dateISO)}/${toCalendarStamp(data.endISO)}`,
  );
  google.searchParams.set("details", details);
  google.searchParams.set("location", data.venue.address);

  return { ics, google: google.toString(), title };
}

function downloadCalendar() {
  const { ics, google, title } = calendarPayload();
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "firat-birsu-dugun.ics";
  link.click();
  URL.revokeObjectURL(url);
  window.open(google, "_blank", "noopener");
  return title;
}

function observeReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-in");
      });
    },
    { threshold: 0.18 },
  );

  document.querySelectorAll(".reveal").forEach((node) => observer.observe(node));
}

function showInviteSuccess(entry, { returning = false } = {}) {
  const form = $("rsvpForm");
  const success = $("rsvpSuccess");
  const attending = entry.status === "yes";
  form.hidden = true;
  success.hidden = false;
  $("codeBox").hidden = false;
  $("inviteCodeValue").textContent = entry.code;
  if (returning) {
    $("rsvpSuccessText").textContent = attending
      ? `${entry.name}, bu cihazdan katılımınız zaten kayıtlı. Davet kodunuz aşağıda; anı bırakırken bunu kullanın.`
      : `${entry.name}, yanıtınız daha önce alınmıştı. Davet kodunuz aşağıda.`;
    return;
  }
  $("rsvpSuccessText").textContent = attending
    ? `${entry.name}, ${entry.guests} kişilik yerinizi ayırdık. Davet kodunuzu saklayın; anı duvarına bununla fotoğraf ve video bırakacaksınız.`
    : `${entry.name}, yanıtınız için teşekkürler. Anı bırakmak isterseniz davet kodunuz aşağıda.`;
}

async function restoreRsvp() {
  const saved = getSavedCode();
  try {
    const [record, fingerprint] = await Promise.all([loadRecord(), makeFingerprint()]);
    const existing =
      findByFingerprint(record, fingerprint) || (saved ? findByCode(record, saved) : null);
    if (existing?.code) {
      storeCode(existing.code);
      showInviteSuccess(existing, { returning: true });
      fillMemoryCode(existing.code);
      return record;
    }
  } catch {
    if (saved) fillMemoryCode(saved);
  }
  if (saved) fillMemoryCode(saved);
  return null;
}

function bindRsvp() {
  const form = $("rsvpForm");
  const guestsField = $("guestsField");
  const errorBox = $("rsvpError");
  const guestsInput = form.guests;
  const minus = $("guestMinus");
  const plus = $("guestPlus");
  const submit = form.querySelector('button[type="submit"]');

  const setGuests = (value) => {
    guestsInput.value = String(Math.min(10, Math.max(1, value)));
  };

  minus.addEventListener("click", () => setGuests(Number(guestsInput.value) - 1));
  plus.addEventListener("click", () => setGuests(Number(guestsInput.value) + 1));

  form.addEventListener("change", (event) => {
    if (event.target.name !== "status") return;
    const attending = form.status.value === "yes";
    guestsField.classList.toggle("is-hidden", !attending);
    if (attending && Number(guestsInput.value) < 1) setGuests(1);
  });

  $("copyCode")?.addEventListener("click", async () => {
    const code = $("inviteCodeValue").textContent.trim();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      $("copyCode").textContent = "Kopyalandı";
      window.setTimeout(() => {
        $("copyCode").textContent = "Kopyala";
      }, 1800);
    } catch {
      $("copyCode").textContent = "Seçip kopyalayın";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const attending = form.status.value === "yes";
    const name = form.name.value.trim();
    const guests = attending ? Number(guestsInput.value || 1) : 0;

    submit.disabled = true;
    submit.textContent = "Gönderiliyor...";

    try {
      const fingerprint = await makeFingerprint();
      const record = await loadRecord();
      const existing = findByFingerprint(record, fingerprint);
      if (existing) {
        storeCode(existing.code);
        showInviteSuccess(existing, { returning: true });
        fillMemoryCode(existing.code);
        return;
      }

      const entry = {
        name,
        status: form.status.value,
        guests,
        note: form.note.value.trim(),
        at: new Date().toISOString(),
        code: makeInviteCode(record.responses),
        fingerprint: fingerprint.hard,
        softFingerprint: fingerprint.soft,
      };

      record.responses.push(entry);
      await saveRecord(record);
      storeCode(entry.code);
      showInviteSuccess(entry);
      fillMemoryCode(entry.code);
    } catch {
      errorBox.hidden = false;
      errorBox.textContent = "Yanıt gönderilemedi. Lütfen tekrar deneyin.";
      submit.disabled = false;
      submit.textContent = "Yanıtı gönder";
    }
  });
}

function fillMemoryCode(code) {
  const input = document.querySelector("#memoryForm [name='code']");
  if (input && !input.value) input.value = code;
}

function memoryCard(item, src) {
  if (item.type === "video") {
    return `
      <figure class="memory-tile">
        <video src="${src}" controls playsinline preload="metadata"></video>
        ${item.caption ? `<figcaption>${item.caption}</figcaption>` : ""}
      </figure>
    `;
  }
  return `
    <figure class="memory-tile">
      <img src="${src}" alt="${item.caption || "Düğün anısı"}" />
      ${item.caption ? `<figcaption>${item.caption}</figcaption>` : ""}
    </figure>
  `;
}

async function renderMemories(record) {
  const grid = $("memoryGrid");
  if (!grid) return;
  const items = [...(record.memories || [])].slice(0, 24);
  if (!items.length) {
    grid.innerHTML = `<p class="memory-empty">Henüz anı yok. İlk kareyi siz bırakın.</p>`;
    return;
  }

  grid.innerHTML = items
    .map((item, index) => `<div class="memory-tile is-loading" data-i="${index}"></div>`)
    .join("");

  await Promise.all(
    items.map(async (item, index) => {
      const slot = grid.querySelector(`[data-i="${index}"]`);
      if (!slot) return;
      try {
        const src = await memoryBlobUrl(item.key);
        slot.outerHTML = memoryCard(item, src);
      } catch {
        slot.outerHTML = `<figure class="memory-tile memory-tile--miss"><p>Anı yüklenemedi</p></figure>`;
      }
    }),
  );
}

function bindMemory() {
  const form = $("memoryForm");
  if (!form) return;
  const errorBox = $("memoryError");
  const okBox = $("memoryOk");
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    okBox.hidden = true;
    const code = form.code.value.trim().toUpperCase();
    const file = form.file.files[0];
    const caption = form.caption.value.trim();
    if (!file) return;

    submit.disabled = true;
    submit.textContent = "Yükleniyor...";

    try {
      const record = await loadRecord();
      const guest = findByCode(record, code);
      if (!guest) {
        throw new Error("Davet kodu bulunamadı. Önce katılım formunu doldurun.");
      }
      const uploaded = await uploadMemory(file, guest.code);
      record.memories.unshift({
        key: uploaded.key,
        type: uploaded.type,
        name: uploaded.name,
        caption,
        code: guest.code,
        guest: guest.name,
        at: new Date().toISOString(),
      });
      await saveRecord(record);
      form.file.value = "";
      form.caption.value = "";
      okBox.hidden = false;
      await renderMemories(record);
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = error.message || "Anı gönderilemedi. Lütfen tekrar deneyin.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Anıyı bırak";
    }
  });
}

function createAmbient() {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const notes = [174.61, 220, 261.63, 329.63];
  const oscs = notes.map((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = index % 2 ? "sine" : "triangle";
    osc.frequency.value = freq;
    gain.gain.value = 0.04 + index * 0.01;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    return osc;
  });

  master.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 1.6);
  return {
    stop() {
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      window.setTimeout(() => {
        oscs.forEach((osc) => osc.stop());
        ctx.close();
      }, 500);
    },
  };
}

function bindMusic() {
  const audio = $("music");
  const button = $("musicBtn");
  let enabled = false;
  let ambient = null;

  button.addEventListener("click", async () => {
    enabled = !enabled;
    button.classList.toggle("is-on", enabled);
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", enabled ? "Müziği kapat" : "Müziği aç");

    if (!enabled) {
      audio.pause();
      ambient?.stop();
      ambient = null;
      return;
    }

    try {
      const probe = await fetch("/music.mp3", { method: "HEAD" });
      if (probe.ok) {
        audio.src = "/music.mp3";
        await audio.play();
        return;
      }
    } catch {
      /* mp3 yoksa ambient çalar */
    }

    ambient = createAmbient();
  });
}

async function shareInvite() {
  const payload = {
    title: `${names} evleniyor`,
    text: `${names} ${weekdays[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} tarihinde evleniyor. Davetiyeyi açın.`,
    url: window.location.href,
  };

  if (navigator.share) {
    await navigator.share(payload);
    return;
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${payload.text} ${payload.url}`)}`;
  window.open(whatsapp, "_blank", "noopener");
}

function initMap() {
  const { lat, lng, name } = data.venue;
  const map = L.map("venueMap", {
    zoomControl: false,
    scrollWheelZoom: false,
    attributionControl: true,
  }).setView([lat, lng], 12);
  venueMap = map;

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OSM &copy; CARTO",
    maxZoom: 19,
  }).addTo(map);

  const icon = L.divIcon({
    className: "map-marker",
    html: `<span class="map-marker__pulse"></span><span class="map-marker__pin"><span>♥</span></span>`,
    iconSize: [54, 64],
    iconAnchor: [27, 58],
  });

  const marker = L.marker([lat, lng], { icon }).addTo(map);
  marker.bindPopup(name);

  const play = () => {
    $("mapStage")?.classList.add("is-live");
    map.invalidateSize();
    map.flyTo([lat, lng], 16, {
      animate: true,
      duration: 2.1,
      easeLinearity: 0.22,
    });
    window.setTimeout(() => {
      marker.getElement()?.classList.add("is-dropped");
    }, 900);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries[0]?.isIntersecting) return;
      play();
      observer.disconnect();
    },
    { threshold: 0.4 },
  );

  observer.observe($("venueMap"));
  window.addEventListener("resize", () => venueMap?.invalidateSize());
}

function init() {
  fillContent();
  startCountdown();
  observeReveal();
  bindRsvp();
  bindMemory();
  bindFortune();
  bindMusic();
  initMap();
  restoreRsvp().then((record) => {
    if (record) renderMemories(record);
    else loadRecord().then(renderMemories).catch(() => {});
  });
  document.body.style.overflow = "hidden";

  $("openInvite").addEventListener("click", openEnvelope);
  $("remindBtn").addEventListener("click", downloadCalendar);
  $("calendarBtn").addEventListener("click", downloadCalendar);
  $("shareBtn").addEventListener("click", shareInvite);

  const card = document.querySelector(".envelope__card");
  if (card && window.matchMedia("(pointer: fine)").matches) {
    card.addEventListener("mousemove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.animation = "none";
      card.style.transform = `rotateY(${x * 16}deg) rotateX(${-y * 12}deg) translateZ(18px)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
      card.style.animation = "";
    });
  }
}

init();
