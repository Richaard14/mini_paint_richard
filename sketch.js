let objects = [];
let selected = -1;
let currentTool = "select";
let startX = 0, startY = 0;
let drawing = false;

let dragMode = null;     // 'move' | 'resize' | 'rotate'
let activeHandle = null; // 'tl' | 'tr' | 'br' | 'bl' | 'rot'
let resizeData = null;
let rotateData = null;

const W = 900;
const H = 600;

const HANDLE_R = 9;        // radius klik handle sudut
const ROT_HANDLE_R = 9;    // radius klik handle rotate
const ROT_DIST = 32;       // jarak handle rotate dari sisi atas
const HANDLE_SIZE = 10;    // ukuran visual handle

function setup() {
  const canvas = createCanvas(W, H);
  canvas.parent("canvasWrap");
  pixelDensity(1);

  select("#tool").changed(() => {
    currentTool = select("#tool").value();
    drawing = false;
    dragMode = null;
  });

  select("#uploadBtn").mousePressed(() => select("#imageInput").elt.click());
  select("#imageInput").elt.addEventListener("change", handleImage);

  select("#deleteBtn").mousePressed(deleteSelected);
  select("#clearBtn").mousePressed(() => {
    objects = [];
    selected = -1;
    drawing = false;
    dragMode = null;
  });

  select("#saveBtn").mousePressed(() => {
    const prev = selected;
    selected = -1;
    redraw();
    saveCanvas("mini-paint", "png");
    selected = prev;
    redraw();
  });

  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => transformSelected(btn.dataset.action));
  });
}

function draw() {
  background(255);

  for (let i = 0; i < objects.length; i++) {
    drawObject(objects[i]);
  }

  if (selected >= 0 && objects[selected]) {
    drawSelection(objects[selected]);
  }

  if (drawing && currentTool !== "select" && currentTool !== "image" && currentTool !== "point") {
    drawPreview();
  }

  updateCursor();
}

/* ---------------- STYLE & OBJECT ---------------- */

function makeStyle() {
  let sw = Number(select("#strokeWeight").value());
  if (isNaN(sw)) sw = 2;

  let sides = Number(select("#polySides").value());
  if (isNaN(sides)) sides = 6;

  return {
    fill: select("#fillColor").value(),
    stroke: select("#strokeColor").value(),
    sw: sw,
    sides: sides
  };
}

function makeObjectFromDrag(type, sx, sy, ex, ey) {
  let dx = ex - sx;
  let dy = ey - sy;
  const style = makeStyle();

  if (type === "line") {
    if (Math.abs(dx) < 5) dx = dx < 0 ? -5 : 5;
    if (Math.abs(dy) < 5) dy = dy < 0 ? -5 : 5;
    return {
      type: "line",
      x: sx + dx / 2,
      y: sy + dy / 2,
      w: dx,
      h: dy,
      ...style,
      rotation: 0, sx: 1, sy: 1
    };
  }

  if (Math.abs(dx) < 5) dx = dx < 0 ? -5 : 5;
  if (Math.abs(dy) < 5) dy = dy < 0 ? -5 : 5;

  return {
    type: type,
    x: sx + dx / 2,
    y: sy + dy / 2,
    w: Math.abs(dx),
    h: Math.abs(dy),
    ...style,
    rotation: 0, sx: 1, sy: 1
  };
}

/* ---------------- RENDER ---------------- */

function drawObject(o) {
  push();
  translate(o.x, o.y);
  rotate(o.rotation || 0);
  scale(o.sx || 1, o.sy || 1);

  if (o.type === "image") {
    imageMode(CENTER);
    image(o.img, 0, 0, o.w, o.h);
  } else {
    fill(o.fill);
    stroke(o.stroke);
    strokeWeight(o.sw);

    if (o.type === "point") {
      strokeWeight(Math.max(3, o.sw * 2));
      point(0, 0);
    } else if (o.type === "line") {
      line(-o.w / 2, -o.h / 2, o.w / 2, o.h / 2);
    } else if (o.type === "rect") {
      rectMode(CENTER);
      rect(0, 0, o.w, o.h);
    } else if (o.type === "ellipse") {
      ellipse(0, 0, o.w, o.h);
    } else if (o.type === "triangle") {
      triangle(-o.w / 2, o.h / 2, 0, -o.h / 2, o.w / 2, o.h / 2);
    } else if (o.type === "arc") {
      noFill();
      arc(0, 0, o.w, o.h, 0, PI + HALF_PI);
    } else if (o.type === "quad") {
      quad(
        -o.w / 2, -o.h / 3,
        o.w / 2, -o.h / 2,
        o.w / 2, o.h / 3,
        -o.w / 2, o.h / 2
      );
    } else if (o.type === "polygon") {
      const r = Math.min(o.w, o.h) / 2;
      polygon(0, 0, r, o.sides);
    }
  }
  pop();
}

function polygon(x, y, radius, sides) {
  beginShape();
  for (let i = 0; i < sides; i++) {
    let a = TWO_PI * i / sides - HALF_PI;
    vertex(x + cos(a) * radius, y + sin(a) * radius);
  }
  endShape(CLOSE);
}

/* ---------------- GEOMETRY HELPERS ---------------- */

// Local corner (unscaled), idx: 0=tl, 1=tr, 2=br, 3=bl
function getLocalCornerUnscaled(o, idx) {
  const w = Math.abs(o.w), h = Math.abs(o.h);
  const arr = [
    { x: -w / 2, y: -h / 2 },
    { x:  w / 2, y: -h / 2 },
    { x:  w / 2, y:  h / 2 },
    { x: -w / 2, y:  h / 2 }
  ];
  return arr[idx];
}

// World corners: [tl, tr, br, bl]
function getCorners(o) {
  const sx = o.sx || 1, sy = o.sy || 1, rot = o.rotation || 0;
  const cosA = Math.cos(rot), sinA = Math.sin(rot);
  const out = [];
  for (let i = 0; i < 4; i++) {
    const l = getLocalCornerUnscaled(o, i);
    const x = l.x * sx, y = l.y * sy;
    const rx = x * cosA - y * sinA;
    const ry = x * sinA + y * cosA;
    out.push({ x: o.x + rx, y: o.y + ry });
  }
  return out;
}

function getHandlePositions(o) {
  const c = getCorners(o);
  const rot = o.rotation || 0;
  const sy = o.sy || 1;
  const h = Math.abs(o.h);

  // top mid in world
  const topMidLocal = { x: 0, y: -(h / 2) * sy };
  const cosA = Math.cos(rot), sinA = Math.sin(rot);
  const tmX = topMidLocal.x * cosA - topMidLocal.y * sinA;
  const tmY = topMidLocal.x * sinA + topMidLocal.y * cosA;
  const topMidWorld = { x: o.x + tmX, y: o.y + tmY };

  // outward direction (dari center ke top-mid, normalized)
  const len = Math.hypot(tmX, tmY) || 1;
  const dirX = tmX / len, dirY = tmY / len;

  return {
    tl: c[0],
    tr: c[1],
    br: c[2],
    bl: c[3],
    rot: {
      x: topMidWorld.x + dirX * ROT_DIST,
      y: topMidWorld.y + dirY * ROT_DIST
    }
  };
}

function drawSelection(o) {
  const hs = getHandlePositions(o);

  push();
  // dashed outline
  noFill();
  stroke("#a3e635");
  strokeWeight(2);
  drawingContext.setLineDash([6, 5]);
  beginShape();
  vertex(hs.tl.x, hs.tl.y);
  vertex(hs.tr.x, hs.tr.y);
  vertex(hs.br.x, hs.br.y);
  vertex(hs.bl.x, hs.bl.y);
  endShape(CLOSE);
  drawingContext.setLineDash([]);

  // garis ke rotate handle
  const topMidX = (hs.tl.x + hs.tr.x) / 2;
  const topMidY = (hs.tl.y + hs.tr.y) / 2;
  stroke("#a3e635");
  strokeWeight(1.5);
  line(topMidX, topMidY, hs.rot.x, hs.rot.y);

  // handle sudut
  rectMode(CENTER);
  fill("#a3e635");
  stroke("#a3e635");
  strokeWeight(2);
  for (const key of ["tl", "tr", "br", "bl"]) {
    rect(hs[key].x, hs[key].y, HANDLE_SIZE, HANDLE_SIZE, 2);
  }

  // handle rotate
  fill("#a3e635");
  noStroke();
  circle(hs.rot.x, hs.rot.y, 12);
  pop();
}

/* ---------------- INPUT ---------------- */

function insideCanvas() {
  return mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
}

function hitHandle(o, mx, my) {
  const hs = getHandlePositions(o);
  if (Math.hypot(mx - hs.rot.x, my - hs.rot.y) <= ROT_HANDLE_R + 3) return "rot";
  if (Math.hypot(mx - hs.tl.x, my - hs.tl.y) <= HANDLE_R + 3) return "tl";
  if (Math.hypot(mx - hs.tr.x, my - hs.tr.y) <= HANDLE_R + 3) return "tr";
  if (Math.hypot(mx - hs.br.x, my - hs.br.y) <= HANDLE_R + 3) return "br";
  if (Math.hypot(mx - hs.bl.x, my - hs.bl.y) <= HANDLE_R + 3) return "bl";
  return null;
}

function mousePressed() {
  if (!insideCanvas()) return;

  if (currentTool === "select") {
    // cek handle dari objek terpilih lebih dulu
    if (selected >= 0 && objects[selected]) {
      const h = hitHandle(objects[selected], mouseX, mouseY);
      if (h === "rot") {
        dragMode = "rotate";
        activeHandle = "rot";
        rotateData = {
          startAngle: Math.atan2(mouseY - objects[selected].y, mouseX - objects[selected].x),
          startRotation: objects[selected].rotation || 0
        };
        return;
      }
      if (h) {
        dragMode = "resize";
        activeHandle = h;
        startResize(h, objects[selected]);
        return;
      }
    }

    // pick object
    selected = findObject(mouseX, mouseY);
    if (selected >= 0) {
      dragMode = "move";
      startX = mouseX;
      startY = mouseY;
    } else {
      dragMode = null;
    }
    return;
  }

  if (currentTool === "image") return;

  if (currentTool === "point") {
    const style = makeStyle();
    objects.push({
      type: "point",
      x: mouseX, y: mouseY, w: 1, h: 1,
      ...style, rotation: 0, sx: 1, sy: 1
    });
    selected = objects.length - 1;
    return;
  }

  drawing = true;
  startX = mouseX;
  startY = mouseY;
}

function mouseDragged() {
  if (!insideCanvas()) return;

  if (currentTool === "select") {
    if (selected < 0 || !objects[selected]) return;
    const o = objects[selected];

    if (dragMode === "move") {
      o.x += mouseX - startX;
      o.y += mouseY - startY;
      startX = mouseX;
      startY = mouseY;
    } else if (dragMode === "resize") {
      updateResize(o, mouseX, mouseY);
    } else if (dragMode === "rotate") {
      const a = Math.atan2(mouseY - o.y, mouseX - o.x);
      o.rotation = rotateData.startRotation + (a - rotateData.startAngle);
    }
    return;
  }

  if (!drawing) return;
}

function mouseReleased() {
  if (currentTool === "select") {
    dragMode = null;
    activeHandle = null;
    resizeData = null;
    rotateData = null;
    return;
  }

  if (!drawing) return;

  const endX = constrain(mouseX, 0, width);
  const endY = constrain(mouseY, 0, height);

  if (currentTool !== "point" && currentTool !== "image") {
    const obj = makeObjectFromDrag(currentTool, startX, startY, endX, endY);
    if (obj) {
      objects.push(obj);
      selected = objects.length - 1;
    }
  }

  drawing = false;
}

/* ---------------- RESIZE & ROTATE ---------------- */

function startResize(handle, o) {
  const idxMap = { tl: 0, tr: 1, br: 2, bl: 3 };
  const idx = idxMap[handle];
  const oppIdx = (idx + 2) % 4;

  const corners = getCorners(o);

  resizeData = {
    handle: handle,
    oppIdx: oppIdx,
    oppWorld: corners[oppIdx],
    rotation: o.rotation || 0,
    sx: o.sx || 1,
    sy: o.sy || 1
  };
}

function updateResize(o, mx, my) {
  if (!resizeData) return;

  const { oppWorld, rotation, sx, sy, oppIdx } = resizeData;

  // vector dari opposite corner ke mouse (world)
  const dx = mx - oppWorld.x;
  const dy = my - oppWorld.y;

  // rotate balik supaya sejajar sumbu objek
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;

  // hilangkan scale
  const ux = rx / sx;
  const uy = ry / sy;

  const newW = Math.max(5, Math.abs(ux));
  const newH = Math.max(5, Math.abs(uy));

  o.w = newW;
  o.h = newH;

  // hitung ulang center supaya opposite corner tetap di tempatnya
  const oppLocal = [
    { x: -newW / 2, y: -newH / 2 },
    { x:  newW / 2, y: -newH / 2 },
    { x:  newW / 2, y:  newH / 2 },
    { x: -newW / 2, y:  newH / 2 }
  ][oppIdx];

  const scaled = { x: oppLocal.x * sx, y: oppLocal.y * sy };
  const cR = Math.cos(rotation), sR = Math.sin(rotation);
  const offX = scaled.x * cR - scaled.y * sR;
  const offY = scaled.x * sR + scaled.y * cR;

  o.x = oppWorld.x - offX;
  o.y = oppWorld.y - offY;
}

/* ---------------- PREVIEW ---------------- */

function drawPreview() {
  const endX = constrain(mouseX, 0, width);
  const endY = constrain(mouseY, 0, height);
  const temp = makeObjectFromDrag(currentTool, startX, startY, endX, endY);
  if (temp) drawObject(temp);
}

/* ---------------- HIT TEST ---------------- */

function findObject(mx, my) {
  for (let i = objects.length - 1; i >= 0; i--) {
    if (pointInObject(objects[i], mx, my)) return i;
  }
  return -1;
}

function pointInObject(o, mx, my) {
  const dx = mx - o.x;
  const dy = my - o.y;
  const angle = -(o.rotation || 0);
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const rx = dx * cosA - dy * sinA;
  const ry = dx * sinA + dy * cosA;
  const sx = o.sx || 1, sy = o.sy || 1;
  const lx = rx / sx, ly = ry / sy;

  if (o.type === "point") {
    return Math.hypot(lx, ly) <= Math.max(5, o.sw * 2);
  }

  const w = Math.abs(o.w), h = Math.abs(o.h);
  return lx >= -w / 2 && lx <= w / 2 && ly >= -h / 2 && ly <= h / 2;
}

/* ---------------- CURSOR ---------------- */

function updateCursor() {
  // saat sedang drag
  if (dragMode === "move") { cursor("move"); return; }
  if (dragMode === "rotate") { cursor("grabbing"); return; }
  if (dragMode === "resize") {
    cursor(resizeCursorFor(activeHandle));
    return;
  }

  if (!insideCanvas()) { cursor(ARROW); return; }

  // cek handle dari objek terpilih
  if (selected >= 0 && objects[selected]) {
    const h = hitHandle(objects[selected], mouseX, mouseY);
    if (h === "rot") { cursor("grab"); return; }
    if (h) { cursor(resizeCursorFor(h)); return; }
  }

  if (currentTool === "select") {
    if (findObject(mouseX, mouseY) >= 0) cursor("move");
    else cursor(ARROW);
  } else if (currentTool === "point") {
    cursor(CROSS);
  } else if (currentTool === "image") {
    cursor(ARROW);
  } else {
    cursor(CROSS);
  }
}

function resizeCursorFor(handle) {
  if (handle === "tl" || handle === "br") return "nwse-resize";
  if (handle === "tr" || handle === "bl") return "nesw-resize";
  return "default";
}

/* ---------------- TRANSFORM BUTTONS ---------------- */

function transformSelected(action) {
  if (selected < 0 || !objects[selected]) return;
  const o = objects[selected];

  if (action === "left") o.x -= 10;
  if (action === "right") o.x += 10;
  if (action === "up") o.y -= 10;
  if (action === "down") o.y += 10;
  if (action === "rotateLeft") o.rotation -= PI / 18;
  if (action === "rotateRight") o.rotation += PI / 18;
  if (action === "scaleDown") {
    o.sx = Math.max(0.1, (o.sx || 1) * 0.9);
    o.sy = Math.max(0.1, (o.sy || 1) * 0.9);
  }
  if (action === "scaleUp") {
    o.sx = (o.sx || 1) * 1.1;
    o.sy = (o.sy || 1) * 1.1;
  }
}
  
function deleteSelected() {
  if (selected < 0) return;
  objects.splice(selected, 1);
  selected = -1;
  dragMode = null;
}

/* ---------------- IMAGE ---------------- */

function handleImage(event) {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  loadImage(url, img => {
    URL.revokeObjectURL(url);

    const maxW = 350, maxH = 300;
    const ratio = Math.min(maxW / img.width, maxH / img.height, 1);

    objects.push({
      type: "image",
      img: img,
      x: W / 2, y: H / 2,
      w: img.width * ratio,
      h: img.height * ratio,
      fill: "#ffffff", stroke: "#000000", sw: 1,
      rotation: 0, sx: 1, sy: 1
    });

    selected = objects.length - 1;
    currentTool = "select";
    select("#tool").value("select");
    input.value = "";
  });
}