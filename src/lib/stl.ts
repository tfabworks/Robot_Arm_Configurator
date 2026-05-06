import type { MeshData } from './csg';

const fmt = (n: number): string => {
  const r = Number(n.toFixed(4));
  return Object.is(r, -0) ? '0' : String(r);
};

// Convert an indexed mesh (positions + tri indices) to ASCII STL.
// Per-triangle normals are computed from the vertex order (CCW from outside).
export const meshToStl = (mesh: MeshData, name: string): string => {
  const lines: string[] = [`solid ${name}`];
  const p = mesh.positions;
  const t = mesh.indices;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3;
    const b = t[i + 1] * 3;
    const c = t[i + 2] * 3;
    const ax = p[a],
      ay = p[a + 1],
      az = p[a + 2];
    const bx = p[b],
      by = p[b + 1],
      bz = p[b + 2];
    const cx = p[c],
      cy = p[c + 1],
      cz = p[c + 2];
    const ux = bx - ax,
      uy = by - ay,
      uz = bz - az;
    const vx = cx - ax,
      vy = cy - ay,
      vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nlen = Math.hypot(nx, ny, nz);
    if (nlen > 0) {
      nx /= nlen;
      ny /= nlen;
      nz /= nlen;
    }
    lines.push(`facet normal ${fmt(nx)} ${fmt(ny)} ${fmt(nz)}`);
    lines.push('  outer loop');
    lines.push(`    vertex ${fmt(ax)} ${fmt(ay)} ${fmt(az)}`);
    lines.push(`    vertex ${fmt(bx)} ${fmt(by)} ${fmt(bz)}`);
    lines.push(`    vertex ${fmt(cx)} ${fmt(cy)} ${fmt(cz)}`);
    lines.push('  endloop');
    lines.push('endfacet');
  }
  lines.push(`endsolid ${name}`);
  lines.push('');
  return lines.join('\n');
};
