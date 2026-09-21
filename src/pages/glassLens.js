/**
 * The maths behind the refracting glass lens on the nav.
 *
 * The technique (the one liquid-glass-react is built on, written here without the
 * dependency because that package needs React 19) is an SVG displacement filter
 * applied through `backdrop-filter: url(#id)`. A displacement map is an image
 * whose red and green channels say, per pixel, how far to pull the picture
 * behind the glass sideways and up or down. Pull every pixel a little towards
 * the middle and you have a magnifier.
 */

/**
 * Real refraction needs `backdrop-filter: url(#svg-filter)`, which only Chromium
 * implements. Elsewhere the lens simply stays the plain gradient one, because a
 * lens that displaces nothing is worse than no lens.
 */
export function supportsRefraction() {
  if (typeof navigator === 'undefined') return false;
  const brands = navigator.userAgentData?.brands;
  return Array.isArray(brands) && brands.some(({ brand }) => brand === 'Chromium');
}

const cache = new Map();

/**
 * Builds a displacement map for a lens of the given size.
 *
 * Returns the map as a data URL, its pixel size, and the `scale` to give
 * feDisplacementMap. The
 * filter computes  displacement = scale * (channel - 0.5),  so the map stores
 * each pixel's pull as a fraction of `scale`, and `scale` is chosen so the
 * strongest pull uses the full 0..1 range of a colour channel.
 *
 * Only a band near the rim is bent, sampling from slightly further out so the word is squeezed inward and never repeated (the bend at the edge of
 * a glass bead). The middle is left alone so text stays sharp; the word's own
 * magnification is done by scaling it as vector text. Distance is measured
 * against a rounded rectangle rather than a circle, so it suits a lens the shape
 * of a word.
 */
export function lensMap(width, height, magnification = 1.35) {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  const key = `${w}x${h}@${magnification}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const inward = 1 - 1 / magnification;
  const pullX = new Float32Array(w * h);
  const pullY = new Float32Array(w * h);
  let strongest = 1;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = x + 0.5 - w / 2;
      const dy = y + 0.5 - h / 2;
      const u = dx / (w / 2);
      const v = dy / (h / 2);
      // 0 at the centre, 1 at the middle of each edge (a squircle, not a circle).
      const distance = (Math.abs(u) ** 4 + Math.abs(v) ** 4) ** 0.25;
      // No pull across the middle, so the word there is left untouched and stays
      // crisp (the filter resamples nearest-neighbour, which would stair-step any
      // enlarged text). The bend lives in a band near the rim, like the edge of a
      // glass bead, and eases back to nothing at the very edge.
      const band = Math.min(1, Math.max(0, (distance - 0.78) / 0.14));
      const fall = Math.min(1, Math.max(0, (distance - 0.92) / 0.08));
      const weight = band * band * (3 - 2 * band) * (1 - fall * fall * (3 - 2 * fall));
      // Stop the pull tearing at the very rim, where there is nothing to sample.
      const edge = Math.min(1, Math.min(x, y, w - 1 - x, h - 1 - y) / 2);
      const i = y * w + x;
      pullX[i] = dx * inward * weight * edge;
      pullY[i] = dy * inward * weight * edge;
      strongest = Math.max(strongest, Math.abs(pullX[i]), Math.abs(pullY[i]));
    }
  }

  const scale = strongest * 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  const image = context.createImageData(w, h);
  for (let i = 0; i < w * h; i += 1) {
    image.data[i * 4] = Math.round((pullX[i] / scale + 0.5) * 255);
    image.data[i * 4 + 1] = Math.round((pullY[i] / scale + 0.5) * 255);
    image.data[i * 4 + 2] = 128;
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  const result = { url: canvas.toDataURL(), scale, width: w, height: h };
  cache.set(key, result);
  return result;
}
