/* script.js
   Premium, feature-rich client-side logic for
   "Temple & Tourist Spot Crowd Density Predictor"

   Features included:
   - Generates a large synthetic dataset (configurable size; defaults to 50,000)
   - Computes global quartiles and per-location quartiles
   - Populates UI controls (hours, default date)
   - Predicts crowd density using the same heuristic formula
   - Random-sample generator
   - Download full dataset as CSV
   - Shows sample-preview table and basic "top hours" analytics per location
   - Small canvas-based sparkline / heat preview
   - All code runs completely in the browser (no backend)
*/

/* -------------------------
   CONFIG & DATA / HELPERS
   ------------------------- */
const LOCATIONS = [
  "Chamundi_Temple","Nanjangud_Temple","Srirangapatna_Temple",
  "Mysore_Palace","Brindavan_Gardens","Mysore_Zoo","KRS_Dam"
];

const locPopularity = {
  "Chamundi_Temple": 1.2,
  "Nanjangud_Temple": 0.9,
  "Srirangapatna_Temple": 0.6,
  "Mysore_Palace": 1.5,
  "Brindavan_Gardens": 1.1,
  "Mysore_Zoo": 1.0,
  "KRS_Dam": 0.7
};

const baseScale = {
  "Chamundi_Temple": 500,
  "Nanjangud_Temple": 300,
  "Srirangapatna_Temple": 150,
  "Mysore_Palace": 800,
  "Brindavan_Gardens": 450,
  "Mysore_Zoo": 350,
  "KRS_Dam": 200
};

const weatherMultiplier = {
  "Clear": 1.0,
  "Cloudy": 0.95,
  "Rain": 0.6,
  "Hot": 0.8,
  "Humid": 0.9
};

// Expand festival dates for more realism (sample list across months; adjust if needed)
const FESTIVAL_DATES = new Set([
  "2024-01-14","2024-01-26","2024-02-14","2024-03-08","2024-03-25",
  "2024-04-09","2024-04-22","2024-05-01","2024-08-15","2024-10-02",
  "2024-10-24","2024-11-01","2024-11-12","2024-12-25",
  "2025-01-14","2025-02-14","2025-03-17","2025-04-21","2025-11-04"
]);

// DOM refs (elements existing in your HTML)
const hourSelect = document.getElementById('hour');
const dateInput = document.getElementById('date');
const locationSelect = document.getElementById('location');
const weatherSelect = document.getElementById('weather');
const tempInput = document.getElementById('temp');
const isFestival = document.getElementById('is_festival');
const isHoliday = document.getElementById('is_holiday');
const predictBtn = document.getElementById('predictBtn');
const randomizeBtn = document.getElementById('randomizeBtn');
const resultArea = document.getElementById('resultArea');
const densityBadge = document.getElementById('densityBadge');
const densityText = document.getElementById('densityText');
const suggestion = document.getElementById('suggestion');
const footfallEl = document.getElementById('footfall');
const sampleCountEl = document.getElementById('sampleCount');
const quartilesEl = document.getElementById('quartiles');
const heatArea = document.getElementById('heatArea');

// We'll dynamically add extra controls: Download CSV, Preview table, Location analytics
let controlsRow; // container for extra buttons
let previewContainer; // table preview container
let analyticsContainer; // location analytics area

// dataset (array of objects)
let DATASET = []; // will hold all simulated rows
let SAMPLES_SORTED = []; // sorted numeric footfall samples for quartiles
let QUARTILES = null; // {q1,q2,q3}
let PER_LOCATION_STATS = {}; // per location quartiles & top-hours

/* -------------------------
   UTIL: Random gaussian (Box-Muller)
   ------------------------- */
function gaussianRandom(mean=0, std=1) {
  let u = 0, v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * std + mean;
}

/* -------------------------
   TIME & TEMP HELPERS
   ------------------------- */
function timeFactor(hour){
  if (hour >=6 && hour <9) return 0.9;
  if (hour >=9 && hour <12) return 1.0;
  if (hour >=12 && hour <15) return 0.8;
  if (hour >=15 && hour <18) return 1.1;
  if (hour >=18 && hour <21) return 1.4;
  return 0.6;
}
function tempFactor(temp){
  if (temp > 32) return 0.8;
  if (temp < 20) return 0.85;
  return 1.0;
}

/* -------------------------
   FOOTFALL HEURISTIC (single)
   ------------------------- */
function computeFootfallSample({location, hour, weather, temp, is_festival, is_holiday}){
  const pop = locPopularity[location] || 1.0;
  const tf = timeFactor(hour);
  const festivalFactor = is_festival ? 2.0 : 1.0;
  const holidayFactor = is_holiday ? 1.4 : 1.0;
  const wmul = weatherMultiplier[weather] ?? 1.0;
  const tfac = tempFactor(temp);
  const base = baseScale[location] || 200;
  const noiseStd = base * 0.15;
  const noise = gaussianRandom(0, noiseStd);
  const footfall = Math.max(0, Math.round(base * pop * tf * festivalFactor * holidayFactor * wmul * tfac + noise));
  return footfall;
}

/* -------------------------
   DATASET GENERATOR
   - generates N rows, fairly diverse dates & months
   - each row: { datetime, date, day_of_week, month, hour, location, weather, temperature, is_festival, is_holiday, footfall, density_label, density_int }
   ------------------------- */
function generateDataset(n=50000, seedOffset=0){
  // clear
  DATASET = [];
  const weatherTypes = Object.keys(weatherMultiplier);
  const base_temp_by_month = [22,23,25,27,28,28,27,27,26,25,24,23];

  // we generate dates across a range (recent 2 years approx)
  const start = new Date();
  start.setFullYear(start.getFullYear() - 2); // ~2 years back
  const msRange = (new Date()).getTime() - start.getTime();

  for (let i=0;i<n;i++){
    // random datetime within range
    const randMs = Math.floor(Math.random()*msRange);
    const dt = new Date(start.getTime() + randMs + (seedOffset || 0));
    const month = dt.getMonth()+1;
    const dateStr = dt.toISOString().slice(0,10);
    const dow = dt.getDay(); // 0 Sun .. 6 Sat
    // pick active hour 6..21
    const hour = Math.floor(Math.random()*(21-6+1))+6;
    const location = LOCATIONS[Math.floor(Math.random()*LOCATIONS.length)];
    // weather with a bias (clear more likely)
    const weather = weatherTypes[Math.random() < 0.6 ? Math.floor(Math.random()*1) : Math.floor(Math.random()*weatherTypes.length)] || "Clear";
    // temperature rough by month + small noise
    const temp = base_temp_by_month[month-1] + (Math.random()*4-2);
    const is_festival = FESTIVAL_DATES.has(dateStr) ? 1 : (Math.random() < 0.02 ? 1 : 0); // festivals sometimes match
    const is_holiday = (dow === 0 || dow === 6) ? 1 : 0;

    const footfall = computeFootfallSample({location,hour,weather,temp,is_festival,is_holiday});

    DATASET.push({
      datetime: dt.toISOString(),
      date: dateStr,
      day_of_week: dow,
      month: month,
      hour: hour,
      location: location,
      weather: weather,
      temperature: Number(temp.toFixed(1)),
      is_festival: is_festival,
      is_holiday: is_holiday,
      footfall: footfall
    });
  }

  // compute density labels using global quartiles
  computeGlobalQuartilesAndLabels();
  computePerLocationStats();
}

/* -------------------------
   QUARTILES & LABELING
   ------------------------- */
function computeGlobalQuartilesAndLabels(){
  SAMPLES_SORTED = DATASET.map(d=>d.footfall).sort((a,b)=>a-b);
  const n = SAMPLES_SORTED.length;
  if (n === 0) {
    QUARTILES = {q1:0,q2:0,q3:0};
    return;
  }
  const q1 = SAMPLES_SORTED[Math.floor(n*0.25)];
  const q2 = SAMPLES_SORTED[Math.floor(n*0.50)];
  const q3 = SAMPLES_SORTED[Math.floor(n*0.75)];
  QUARTILES = {q1,q2,q3};

  // label dataset rows
  for (let r of DATASET){
    if (r.footfall <= q1) r.density_label = "Low";
    else if (r.footfall <= q2) r.density_label = "Medium";
    else if (r.footfall <= q3) r.density_label = "High";
    else r.density_label = "Very_High";
    r.density_int = ({Low:0,Medium:1,High:2,Very_High:3})[r.density_label];
  }
}

/* -------------------------
   PER-LOCATION STATS (quartiles & top hours)
   ------------------------- */
function computePerLocationStats(){
  PER_LOCATION_STATS = {};
  for (let loc of LOCATIONS){
    const items = DATASET.filter(d=>d.location===loc).map(d=>d.footfall).sort((a,b)=>a-b);
    if (items.length === 0) {
      PER_LOCATION_STATS[loc] = {q1:0,q2:0,q3:0,topHours:[]};
      continue;
    }
    const n = items.length;
    const q1 = items[Math.floor(n*0.25)];
    const q2 = items[Math.floor(n*0.50)];
    const q3 = items[Math.floor(n*0.75)];
    // compute busiest hours for this location (aggregate average footfall per hour)
    const hourBuckets = {};
    const counts = {};
    for (let row of DATASET){
      if (row.location !== loc) continue;
      hourBuckets[row.hour] = (hourBuckets[row.hour] || 0) + row.footfall;
      counts[row.hour] = (counts[row.hour] || 0) + 1;
    }
    const avgPerHour = Object.keys(hourBuckets).map(h=>{
      return {hour: Number(h), avg: Math.round(hourBuckets[h] / counts[h])};
    }).sort((a,b)=>b.avg - a.avg).slice(0,5);
    PER_LOCATION_STATS[loc] = {q1,q2,q3,topHours:avgPerHour};
  }
}

/* -------------------------
   UI: populate hours & default date
   ------------------------- */
function populateUI(){
  // hours
  hourSelect.innerHTML = "";
  for (let h=6; h<=21; h++){
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = `${h}:00`;
    hourSelect.appendChild(opt);
  }
  // default date = today
  dateInput.value = new Date().toISOString().slice(0,10);

  // add extra control buttons (Download CSV, Show Preview, Show Analytics)
  const rightPanel = document.querySelector('.side-card');
  if (!rightPanel) {
    // create a small controls row under the left card if side-card not present
    controlsRow = document.createElement('div');
    controlsRow.style.marginTop = '12px';
    document.querySelector('.large-card').appendChild(controlsRow);
  } else {
    controlsRow = document.createElement('div');
    controlsRow.style.marginTop = '12px';
    rightPanel.insertBefore(controlsRow, rightPanel.querySelector('.heatmap'));
  }

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn ghost';
  downloadBtn.textContent = 'Download CSV';
  downloadBtn.style.marginRight = '10px';
  downloadBtn.onclick = downloadDatasetCSV;

  const previewBtn = document.createElement('button');
  previewBtn.className = 'btn ghost';
  previewBtn.textContent = 'Preview 50 rows';
  previewBtn.style.marginRight = '10px';
  previewBtn.onclick = showPreviewTable;

  const analyticsBtn = document.createElement('button');
  analyticsBtn.className = 'btn ghost';
  analyticsBtn.textContent = 'Show Location Analytics';
  analyticsBtn.onclick = toggleAnalytics;

  controlsRow.appendChild(downloadBtn);
  controlsRow.appendChild(previewBtn);
  controlsRow.appendChild(analyticsBtn);

  // create preview container under left card
  previewContainer = document.createElement('div');
  previewContainer.style.marginTop = '14px';
  previewContainer.style.display = 'none';
  previewContainer.className = 'card';
  document.querySelector('.large-card').appendChild(previewContainer);

  // analytics container under right panel
  analyticsContainer = document.createElement('div');
  analyticsContainer.style.marginTop = '12px';
  analyticsContainer.style.display = 'none';
  analyticsContainer.className = 'card';
  const sideCard = document.querySelector('.side-card');
  sideCard.appendChild(analyticsContainer);
}

/* -------------------------
   PREDICTION (UI-driven)
   ------------------------- */
function predictFromUI(){
  const location = locationSelect.value;
  const dateStr = dateInput.value || new Date().toISOString().slice(0,10);
  const hour = parseInt(hourSelect.value);
  const weather = weatherSelect.value;
  const temp = parseFloat(tempInput.value) || 26.0;
  const festival = isFestival.checked ? 1 : 0;
  const holiday = isHoliday.checked ? 1 : 0;

  // override festival if date is in festival set
  if (FESTIVAL_DATES.has(dateStr)) {
    // mark festival true visually (do not force UI change unless you want)
  }

  const footfall = computeFootfallSample({
    location, hour, weather, temp, is_festival: festival, is_holiday: holiday
  });

  const label = mapToDensityLabel(footfall);
  showResult(label, footfall);
}

/* -------------------------
   MAP FOOTFALL -> DENSITY (using QUARTILES)
   ------------------------- */
function mapToDensityLabel(footfall){
  if (!QUARTILES) return "Unknown";
  if (footfall <= QUARTILES.q1) return "Low";
  if (footfall <= QUARTILES.q2) return "Medium";
  if (footfall <= QUARTILES.q3) return "High";
  return "Very_High";
}

/* -------------------------
   DISPLAY RESULT IN UI
   ------------------------- */
function badgeStyleFor(label){
  switch (label){
    case "Low": return {bg:'#b6c6d6', color:'#031021'};
    case "Medium": return {bg:'#ffd479', color:'#031021'};
    case "High": return {bg:'#ff8aa1', color:'#031021'};
    case "Very_High": return {bg:'#ff4f6d', color:'#031021'};
    default: return {bg:'#b6c6d6', color:'#031021'};
  }
}

function showResult(label, footfall){
  resultArea.style.display = 'block';
  densityBadge.textContent = label.replace('_',' ');
  densityText.textContent = label.replace('_',' ');
  const style = badgeStyleFor(label);
  densityBadge.style.background = style.bg;
  densityBadge.style.color = style.color;
  footfallEl.textContent = footfall.toLocaleString();

  if (label === "High" || label === "Very_High"){
    suggestion.textContent = "Suggestion: arrive 1 hour earlier or choose a weekday. Expect queues.";
  } else {
    suggestion.textContent = "Nice — crowd should be manageable at this time.";
  }

  // animate heat preview & sparkline
  animateHeatPreview(footfall);
}

/* -------------------------
   HEAT PREVIEW / SPARKLINE
   - draws a simple canvas sparkline based on location distribution
   ------------------------- */
function animateHeatPreview(footfall){
  // create or replace canvas inside heatArea
  heatArea.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = heatArea.clientWidth || 300;
  canvas.height = 120;
  heatArea.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // draw gradient background
  const grd = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
  grd.addColorStop(0, 'rgba(79,248,255,0.08)');
  grd.addColorStop(1, 'rgba(138,97,255,0.06)');
  ctx.fillStyle = grd;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // make an array of 24 points representing expected avg footfall per hour for a random selected location
  const hours = Array.from({length:16},(_,i)=>6+i); // 6..21
  const loc = locationSelect.value || LOCATIONS[0];
  // compute avg from PER_LOCATION_STATS topHours (if exists) else simulate using baseScale/timeFactors
  const hourAverages = hours.map(h=>{
    // base guess
    const base = baseScale[loc] || 200;
    const pop = locPopularity[loc] || 1;
    const avg = Math.round(base * pop * timeFactor(h));
    return avg;
  });
  // normalize to canvas height
  const maxVal = Math.max(...hourAverages, footfall, 1);
  // draw line
  ctx.beginPath();
  for (let i=0;i<hourAverages.length;i++){
    const x = (i/(hourAverages.length-1))*(canvas.width-20)+10;
    const y = canvas.height - (hourAverages[i]/maxVal)*(canvas.height-30) - 10;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();

  // draw small circles
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (let i=0;i<hourAverages.length;i++){
    const x = (i/(hourAverages.length-1))*(canvas.width-20)+10;
    const y = canvas.height - (hourAverages[i]/maxVal)*(canvas.height-30) - 10;
    ctx.beginPath();
    ctx.arc(x,y,3,0,2*Math.PI);
    ctx.fill();
  }

  // draw current footfall marker
  const pct = Math.max(0, Math.min(1, footfall/maxVal));
  const markerY = canvas.height - pct*(canvas.height-30) - 10;
  ctx.fillStyle = 'rgba(255,79,120,0.9)';
  ctx.beginPath();
  ctx.arc(canvas.width-18, markerY, 6, 0, 2*Math.PI);
  ctx.fill();
}

/* -------------------------
   RANDOMIZE UI
   ------------------------- */
function randomizeInputs(){
  locationSelect.value = LOCATIONS[Math.floor(Math.random()*LOCATIONS.length)];
  hourSelect.value = Math.floor(Math.random()*(21-6+1))+6;
  const d = new Date();
  d.setDate(d.getDate() + Math.floor(Math.random()*90));
  dateInput.value = d.toISOString().slice(0,10);
  const weathers = Object.keys(weatherMultiplier);
  weatherSelect.value = weathers[Math.floor(Math.random()*weathers.length)];
  const month = d.getMonth()+1;
  const base_temp_by_month = [22,23,25,27,28,28,27,27,26,25,24,23];
  tempInput.value = (base_temp_by_month[month-1] + (Math.random()*4-2)).toFixed(1);
  isFestival.checked = Math.random() < 0.05;
  const dow = d.getDay();
  isHoliday.checked = (dow===0 || dow===6);
}

/* -------------------------
   DATA DOWNLOAD (CSV)
   ------------------------- */
function downloadDatasetCSV(){
  if (!DATASET || DATASET.length === 0) return alert("Dataset not generated yet.");
  // build CSV header
  const header = ["datetime","date","day_of_week","month","hour","location","weather","temperature","is_festival","is_holiday","footfall","density_label","density_int"];
  const rows = DATASET.slice(0, DATASET.length).map(r => {
    return header.map(h => {
      let v = r[h];
      if (v === undefined) v = '';
      return `"${String(v).replace(/"/g,'""')}"`;
    }).join(',');
  });
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const time = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  link.download = `temple_crowd_dataset_${time}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* -------------------------
   PREVIEW TABLE (first 50 rows)
   ------------------------- */
function showPreviewTable(){
  previewContainer.style.display = previewContainer.style.display === 'none' ? 'block' : 'none';
  if (previewContainer.style.display === 'none') return;
  previewContainer.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = 'Dataset Preview (first 50 rows)';
  title.style.marginBottom = '8px';
  previewContainer.appendChild(title);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.fontSize = '13px';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ["date","hour","location","weather","temp","is_fest","is_hol","footfall","density"].forEach(h=>{
    const th = document.createElement('th');
    th.textContent = h;
    th.style.textAlign = 'left';
    th.style.padding = '8px';
    th.style.color = '#b6c6d6';
    th.style.fontWeight = 700;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const rows = DATASET.slice(0,50);
  for (let r of rows){
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
    const cells = [
      r.date, r.hour, r.location, r.weather, r.temperature, r.is_festival, r.is_holiday, r.footfall, r.density_label
    ];
    for (let c of cells){
      const td = document.createElement('td');
      td.style.padding = '8px';
      td.textContent = c;
      td.style.color = '#e6eef6';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  previewContainer.appendChild(table);
}

/* -------------------------
   ANALYTICS: show per-location quartiles & top hours
   ------------------------- */
function toggleAnalytics(){
  analyticsContainer.style.display = analyticsContainer.style.display === 'none' ? 'block' : 'none';
  if (analyticsContainer.style.display === 'none') return;
  analyticsContainer.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = 'Location Analytics';
  title.style.marginBottom = '8px';
  analyticsContainer.appendChild(title);

  for (let loc of LOCATIONS){
    const st = PER_LOCATION_STATS[loc] || {q1:0,q2:0,q3:0,topHours:[]};
    const box = document.createElement('div');
    box.style.marginBottom = '12px';
    box.style.padding = '12px';
    box.style.borderRadius = '10px';
    box.style.background = 'rgba(255,255,255,0.03)';
    box.style.border = '1px solid rgba(255,255,255,0.04)';

    const h = document.createElement('div');
    h.style.fontWeight = 700;
    h.style.marginBottom = '6px';
    h.textContent = loc.replace('_',' ');
    box.appendChild(h);

    const q = document.createElement('div');
    q.style.color = '#b6c6d6';
    q.style.marginBottom = '6px';
    q.textContent = `Quartiles (q1 / q2 / q3): ${st.q1} / ${st.q2} / ${st.q3}`;
    box.appendChild(q);

    const th = document.createElement('div');
    th.style.color = '#e6eef6';
    th.textContent = 'Top hours (avg footfall)';
    box.appendChild(th);

    const ul = document.createElement('ul');
    ul.style.marginTop = '6px';
    ul.style.color = '#cfefff';
    for (let it of st.topHours){
      const li = document.createElement('li');
      li.textContent = `${it.hour}:00 — ${it.avg.toLocaleString()} avg`;
      ul.appendChild(li);
    }
    box.appendChild(ul);

    analyticsContainer.appendChild(box);
  }
}

/* -------------------------
   MAPS & QUARTILE DISPLAY
   ------------------------- */
function refreshStatsUI(){
  sampleCountEl.textContent = DATASET.length.toLocaleString();
  if (QUARTILES) quartilesEl.textContent = `${QUARTILES.q1} / ${QUARTILES.q2} / ${QUARTILES.q3}`;
  else quartilesEl.textContent = '—';
}

/* -------------------------
   UTIL: download a sample JSON (for quick testing) - optional
   ------------------------- */
function downloadSampleJSON(){
  const sample = DATASET.slice(0,500);
  const blob = new Blob([JSON.stringify(sample,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sample_temples.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* -------------------------
   INIT: generate dataset & wire events
   ------------------------- */
async function initEverything(){
  populateUI();

  // show a lightweight "loading" state if dataset is large
  const desiredN = 50000; // default; change smaller if device is low-end
  // If device memory is small, reduce samples
  const safeN = Math.min(desiredN, 70000);

  // generate in chunks to allow UI to remain responsive
  // chunk size
  const chunk = 5000;
  let generated = 0;
  // show a quick progress in the sampleCountEl
  sampleCountEl.textContent = 'Generating...';
  DATASET = [];
  while (generated < safeN){
    const toGen = Math.min(chunk, safeN - generated);
    generateChunkAndAppend(toGen);
    generated += toGen;
    sampleCountEl.textContent = `${generated.toLocaleString()} / ${safeN.toLocaleString()}`;
    // brief await to yield to UI rendering
    await new Promise(res => setTimeout(res, 20));
  }

  // finalize quartiles & per-location stats
  computeGlobalQuartilesAndLabels();
  computePerLocationStats();
  refreshStatsUI();

  // initial randomize & predict
  randomizeInputs();
  predictFromUI();

  // wire buttons
  predictBtn.onclick = (e)=>{ e.preventDefault(); predictFromUI(); };
  randomizeBtn.onclick = (e)=>{ e.preventDefault(); randomizeInputs(); predictFromUI(); };
}

// helper: generate small chunk and append to DATASET (used during init)
function generateChunkAndAppend(n){
  const weatherTypes = Object.keys(weatherMultiplier);
  const base_temp_by_month = [22,23,25,27,28,28,27,27,26,25,24,23];
  const now = new Date();
  const start = new Date(now.getFullYear()-2, now.getMonth(), now.getDate());
  const msRange = now.getTime() - start.getTime();

  for (let i=0;i<n;i++){
    const randMs = Math.floor(Math.random()*msRange);
    const dt = new Date(start.getTime() + randMs);
    const month = dt.getMonth()+1;
    const dateStr = dt.toISOString().slice(0,10);
    const dow = dt.getDay();
    const hour = Math.floor(Math.random()*(21-6+1))+6;
    const location = LOCATIONS[Math.floor(Math.random()*LOCATIONS.length)];
    // bias clear weather
    const weather = (Math.random() < 0.65) ? "Clear" : weatherTypes[Math.floor(Math.random()*weatherTypes.length)];
    const temp = base_temp_by_month[month-1] + (Math.random()*4-2);
    const is_festival = FESTIVAL_DATES.has(dateStr) ? 1 : (Math.random() < 0.02 ? 1 : 0);
    const is_holiday = (dow === 0 || dow === 6) ? 1 : 0;
    const footfall = computeFootfallSample({location,hour,weather,temp,is_festival,is_holiday});
    DATASET.push({
      datetime: dt.toISOString(),
      date: dateStr,
      day_of_week: dow,
      month: month,
      hour: hour,
      location: location,
      weather: weather,
      temperature: Number(temp.toFixed(1)),
      is_festival: is_festival,
      is_holiday: is_holiday,
      footfall: footfall
    });
  }
}

/* -------------------------
   BOOT
   ------------------------- */
document.addEventListener('DOMContentLoaded', ()=>{
  initEverything().catch(err=>{
    console.error('Init failed', err);
    // fallback: try smaller dataset
    DATASET = [];
    generateDataset(5000);
    refreshStatsUI();
  });
});
