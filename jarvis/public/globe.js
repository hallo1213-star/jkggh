// Jarvis' own 3D globe: CesiumJS with real satellite and aerial imagery
// (Esri World Imagery; with a free Cesium ion token Bing Maps Aerial and 3D
// terrain), NASA Black Marble for the night view. Opens as an overlay inside
// Jarvis and is controlled by voice (server messages) or the buttons.
const CESIUM_VERSION = '1.145.0';
const CESIUM_BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`;
const ESRI_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const NASA_NIGHT = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
const $ = (id) => document.getElementById(id);

const els = {
  overlay: $('globe-overlay'),
  view: $('globe-view'),
  credits: $('globe-credits'),
  close: $('globe-close'),
  title: $('globe-title'),
  sub: $('globe-sub'),
  coords: $('globe-coords'),
  status: $('globe-status'),
  source: $('globe-source'),
  search: $('globe-search'),
  earth: $('globe-earth'),
  spin: $('globe-spin'),
  night: $('globe-night'),
  labels: $('globe-labels'),
  locate: $('globe-locate'),
  loading: $('globe-loading')
};

let viewer = null;
let loading = null;
let Cesium = null;
let layers = {};
let spinning = false;
let marker = null;
let sendToServer = () => false;
let notify = () => {};
let sourceText = '';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Die 3D-Erde konnte nicht geladen werden (keine Internetverbindung?).'));
    document.head.append(script);
  });
}

function loadCss(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

async function config() {
  try {
    const response = await fetch('/api/globe/config', { cache: 'no-store' });
    return response.ok ? await response.json() : {};
  } catch {
    return {};
  }
}

function setStatus(text) {
  els.status.textContent = text;
}

async function createViewer() {
  window.CESIUM_BASE_URL = CESIUM_BASE;
  loadCss(`${CESIUM_BASE}Widgets/widgets.css`);
  const [{ ionToken }] = await Promise.all([config(), loadScript(`${CESIUM_BASE}Cesium.js`)]);
  Cesium = window.Cesium;

  let baseLayer;
  let terrain;
  if (ionToken) {
    Cesium.Ion.defaultAccessToken = ionToken;
    baseLayer = Cesium.ImageryLayer.fromWorldImagery({ style: Cesium.IonWorldImageryStyle.AERIAL });
    terrain = Cesium.Terrain.fromWorldTerrain();
    sourceText = 'Bing Maps Aerial (Cesium ion) · Archivbilder, nicht live';
  } else {
    baseLayer = new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({
      url: ESRI_IMAGERY,
      maximumLevel: 19,
      credit: new Cesium.Credit('Satellitenbild: Esri, Maxar, Earthstar Geographics, GIS User Community')
    }));
    sourceText = 'Esri World Imagery · Archivbilder (Monate bis Jahre alt), nicht live';
  }

  viewer = new Cesium.Viewer(els.view, {
    baseLayer,
    ...(terrain ? { terrain } : {}),
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    creditContainer: els.credits,
    requestRenderMode: false
  });
  const { scene } = viewer;
  scene.backgroundColor = Cesium.Color.BLACK;
  scene.skyAtmosphere.show = true;
  scene.globe.showGroundAtmosphere = true;
  scene.globe.enableLighting = false;
  scene.globe.maximumScreenSpaceError = 1.5;
  scene.fog.enabled = true;
  if (scene.skyBox) scene.skyBox.show = true;
  scene.screenSpaceCameraController.minimumZoomDistance = 150;
  scene.screenSpaceCameraController.maximumZoomDistance = 40_000_000;

  layers.night = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
    url: NASA_NIGHT,
    maximumLevel: 8,
    credit: new Cesium.Credit('Nachtbild: NASA Earth Observatory / Black Marble')
  }));
  layers.night.show = false;
  layers.labels = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: ESRI_LABELS, maximumLevel: 19, credit: new Cesium.Credit('Beschriftung: Esri') }));
  layers.labels.show = false;

  // Slow rotation around the earth's axis while "drehen" is on.
  let last = performance.now();
  scene.preRender.addEventListener(() => {
    const now = performance.now();
    if (spinning) viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -((now - last) / 1000) * 0.09);
    last = now;
  });
  viewer.camera.changed.addEventListener(updateCoords);
  viewer.camera.percentageChanged = 0.01;
  els.source.textContent = sourceText;
  wholeEarth(0);
  updateCoords();
}

function ensureViewer() {
  if (viewer) return Promise.resolve(viewer);
  if (!loading) {
    els.loading.hidden = false;
    loading = createViewer()
      .then(() => viewer)
      .catch((error) => {
        loading = null;
        setStatus(error.message);
        notify(error.message, 'error');
        throw error;
      })
      .finally(() => { els.loading.hidden = true; });
  }
  return loading;
}

function updateCoords() {
  if (!viewer) return;
  const carto = viewer.camera.positionCartographic;
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const height = carto.height;
  const alt = height > 10_000 ? `${Math.round(height / 1000).toLocaleString('de-DE')} km` : `${Math.round(height).toLocaleString('de-DE')} m`;
  els.coords.textContent = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'O' : 'W'} · Höhe ${alt}`;
}

function setHeading(title, sub = '') {
  els.title.textContent = title;
  els.sub.textContent = sub;
}

export async function openGlobe() {
  els.overlay.hidden = false;
  document.body.classList.add('globe-open');
  try {
    await ensureViewer();
    viewer.resize();
  } catch {
    // message already shown
  }
}

export function closeGlobe() {
  els.overlay.hidden = true;
  document.body.classList.remove('globe-open');
  spinning = false;
  els.spin.setAttribute('aria-pressed', 'false');
}

function wholeEarth(duration = 2.5) {
  setHeading('Erde', 'Ganze Erde · Satellitenansicht');
  setStatus(layers.night?.show ? 'Erde bei Nacht' : 'Satellitenansicht');
  if (marker) marker.show = false;
  viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(10.4, 30, 22_000_000), duration });
}

function setSpin(on) {
  spinning = on;
  els.spin.setAttribute('aria-pressed', String(on));
}

function setNight(on) {
  layers.night.show = on;
  els.night.setAttribute('aria-pressed', String(on));
  els.source.textContent = on ? 'NASA Black Marble · Nachtlichter (Gesamtbild), nicht live' : sourceText;
  setStatus(on ? 'Erde bei Nacht' : 'Satellitenansicht');
}

function showMarker(place) {
  const position = Cesium.Cartesian3.fromDegrees(place.lon, place.lat);
  if (!marker) {
    marker = viewer.entities.add({
      position,
      point: { pixelSize: 11, color: Cesium.Color.fromCssColorString('#38e1ff'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: place.name,
        font: '600 15px Rajdhani, sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#d9f6ff'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -22),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
  }
  marker.position = position;
  marker.label.text = place.name;
  marker.show = true;
}

// Earth → city → district: zoom out first if the camera is close to the
// ground somewhere else, then glide in on the place's outline.
export async function flyToPlace(place) {
  await openGlobe();
  if (!viewer) return;
  setSpin(false);
  setHeading(place.name, [place.kind, place.label].filter(Boolean).join(' · '));
  setStatus('Navigiere …');
  showMarker(place);
  const height = viewer.camera.positionCartographic.height;
  if (height < 2_000_000) {
    await new Promise((resolve) => viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(place.lon, place.lat, 9_000_000), duration: 2, complete: resolve, cancel: resolve }));
  }
  let destination;
  if (place.bbox) {
    const [west, south, east, north] = place.bbox;
    // Very small outlines (a street, a building) get some room around them.
    const pad = Math.max(0, 0.004 - Math.min(east - west, north - south)) / 2;
    destination = Cesium.Rectangle.fromDegrees(west - pad, south - pad, east + pad, north + pad);
  } else {
    destination = Cesium.Cartesian3.fromDegrees(place.lon, place.lat, 4000);
  }
  viewer.camera.flyTo({
    destination,
    duration: 4.5,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    complete: () => setStatus(`Satellitenansicht von ${els.title.textContent}`)
  });
}

function locate() {
  if (!navigator.geolocation) {
    notify('Dieses Gerät kann seinen Standort nicht bestimmen.', 'error');
    sendToServer({ type: 'globe_location_error', message: 'Gerät ohne Standortfunktion' });
    return;
  }
  setStatus('Standort wird abgefragt …');
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    const place = { name: 'Dein Standort', label: `Genauigkeit ca. ${Math.round(coords.accuracy)} m`, lat: coords.latitude, lon: coords.longitude, bbox: null, kind: '' };
    flyToPlace(place);
    // In a conversation the server names the place and tells Jarvis; otherwise ask directly.
    if (!sendToServer({ type: 'globe_location', lat: coords.latitude, lon: coords.longitude })) {
      try {
        const response = await fetch(`/api/globe/reverse?lat=${coords.latitude}&lon=${coords.longitude}`);
        const data = await response.json();
        if (response.ok) located(data.place);
      } catch {
        // keep the coordinates
      }
    }
  }, (error) => {
    const message = error.code === 1 ? 'Standortzugriff nicht erlaubt' : 'Standort nicht verfügbar';
    setStatus(message);
    notify(`${message}. Erlaube den Standort für Jarvis in den Browser-Einstellungen.`, 'error');
    sendToServer({ type: 'globe_location_error', message });
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

function located(place) {
  setHeading(place.name, ['Dein Standort', place.label].filter(Boolean).join(' · '));
  if (marker) marker.label.text = place.name;
  setStatus(`Du bist hier: ${place.name}`);
}

// Commands from the voice assistant (see the "globe" cloud tool).
export async function handleGlobeMessage(message) {
  switch (message.action) {
    case 'fly':
      return flyToPlace(message.place);
    case 'located':
      return located(message.place);
    case 'error':
      setStatus(message.message);
      return undefined;
    case 'schliessen':
      return closeGlobe();
    default:
      break;
  }
  await openGlobe();
  if (!viewer) return undefined;
  if (message.action === 'ganze_erde') wholeEarth();
  else if (message.action === 'drehen') {
    if (viewer.camera.positionCartographic.height < 3_000_000) wholeEarth();
    setSpin(true);
  } else if (message.action === 'stopp') setSpin(false);
  else if (message.action === 'nacht') {
    setNight(true);
    if (viewer.camera.positionCartographic.height < 1_500_000) wholeEarth();
  } else if (message.action === 'tag') setNight(false);
  else if (message.action === 'standort') locate();
  return undefined;
}

async function search(query) {
  const q = query.trim();
  if (!q) return;
  setStatus(`Suche „${q}“ …`);
  try {
    const response = await fetch(`/api/globe/search?q=${encodeURIComponent(q)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Suche fehlgeschlagen');
    flyToPlace(data.place);
  } catch (error) {
    setStatus(error.message);
  }
}

export function initGlobe({ send, toast }) {
  sendToServer = send;
  notify = toast;
  $('globe-button').addEventListener('click', openGlobe);
  els.close.addEventListener('click', closeGlobe);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !els.overlay.hidden) closeGlobe();
  });
  els.search.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = els.search.querySelector('input');
    search(input.value);
    input.blur();
  });
  els.earth.addEventListener('click', () => viewer && wholeEarth());
  els.spin.addEventListener('click', () => viewer && setSpin(!spinning));
  els.night.addEventListener('click', () => viewer && setNight(!layers.night.show));
  els.labels.addEventListener('click', () => {
    if (!viewer) return;
    layers.labels.show = !layers.labels.show;
    els.labels.setAttribute('aria-pressed', String(layers.labels.show));
  });
  els.locate.addEventListener('click', () => viewer && locate());
}
