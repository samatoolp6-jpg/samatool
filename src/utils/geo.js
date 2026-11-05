const R = 6371008.8;
const rad = (x) => (x * Math.PI) / 180;

// Distance en mètres entre deux points [lat, lng]
function distanceM(a, b) {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const longueurM = (pts) => pts.reduce((t, p, i) => (i ? t + distanceM(pts[i - 1], p) : 0), 0);

// Le point [lat, lng] est-il dans le contour ?
function pointDansContour(p, contour) {
  let dedans = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const [yi, xi] = contour[i], [yj, xj] = contour[j];
    if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

const centre = (pts) => [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length];

// Plan de vol en « aller-retour » (comme on tond une pelouse) couvrant tout le contour.
// largeur = largeur de la bande photographiée par le drone (mètres).
function planDeVol(contour, largeur = 20) {
  const lat0 = rad(centre(contour)[0]);
  const xy = contour.map(([la, lo]) => [R * Math.cos(lat0) * rad(lo), R * rad(la)]);
  const retour = ([x, y]) => [((y / R) * 180) / Math.PI, ((x / (R * Math.cos(lat0))) * 180) / Math.PI];
  const ys = xy.map((p) => p[1]);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const lignes = [];
  for (let y = ymin + largeur / 2; y < ymax; y += largeur) lignes.push(y);
  if (!lignes.length) lignes.push((ymin + ymax) / 2);

  const plan = [];
  let sens = 1;
  for (const y of lignes) {
    const xs = [];
    for (let i = 0; i < xy.length; i++) {
      const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    const segs = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const marge = Math.min(5, (xs[i + 1] - xs[i]) / 4); // les points restent à l'intérieur du contour
      segs.push([xs[i] + marge, xs[i + 1] - marge]);
    }
    if (sens < 0) segs.reverse();
    for (const [a, b] of segs) {
      const [p, q] = sens > 0 ? [a, b] : [b, a];
      plan.push(retour([p, y]), retour([q, y]));
    }
    sens = -sens;
  }
  return plan.length ? plan : [centre(contour)];
}

module.exports = { distanceM, longueurM, pointDansContour, planDeVol, centre };
