import type { BoxLink, CylinderLink, Link } from '../types/arm';

// Each STL is in mm and centered to match URDF visual conventions:
//   - box link: extends along local +X from origin → STL spans [0..L] × [-W/2..W/2] × [-T/2..T/2]
//   - cylinder link: extends along local +Z from origin → STL spans [-D/2..D/2] × [-D/2..D/2] × [0..L]
// Slicers ingesting the STL place the part as-is at z=0 build plate; users
// pick orientation themselves in their slicer.

const fmt = (n: number): string => {
  const r = Number(n.toFixed(4));
  return Object.is(r, -0) ? '0' : String(r);
};

const triangle = (
  nx: number,
  ny: number,
  nz: number,
  v1: [number, number, number],
  v2: [number, number, number],
  v3: [number, number, number],
): string =>
  [
    `facet normal ${fmt(nx)} ${fmt(ny)} ${fmt(nz)}`,
    `  outer loop`,
    `    vertex ${fmt(v1[0])} ${fmt(v1[1])} ${fmt(v1[2])}`,
    `    vertex ${fmt(v2[0])} ${fmt(v2[1])} ${fmt(v2[2])}`,
    `    vertex ${fmt(v3[0])} ${fmt(v3[1])} ${fmt(v3[2])}`,
    `  endloop`,
    `endfacet`,
  ].join('\n');

const boxStl = (link: BoxLink): string => {
  const { length: L, width: W, thickness: T } = link.dimensions;
  // Span: [0..L] × [-W/2..W/2] × [-T/2..T/2]
  const x0 = 0;
  const x1 = L;
  const y0 = -W / 2;
  const y1 = W / 2;
  const z0 = -T / 2;
  const z1 = T / 2;
  const v: Record<string, [number, number, number]> = {
    a: [x0, y0, z0],
    b: [x1, y0, z0],
    c: [x1, y1, z0],
    d: [x0, y1, z0],
    e: [x0, y0, z1],
    f: [x1, y0, z1],
    g: [x1, y1, z1],
    h: [x0, y1, z1],
  };
  const tris: string[] = [];
  // -Z face (a,b,c,d)
  tris.push(triangle(0, 0, -1, v.a, v.c, v.b));
  tris.push(triangle(0, 0, -1, v.a, v.d, v.c));
  // +Z face (e,f,g,h)
  tris.push(triangle(0, 0, 1, v.e, v.f, v.g));
  tris.push(triangle(0, 0, 1, v.e, v.g, v.h));
  // -Y face (a,b,f,e)
  tris.push(triangle(0, -1, 0, v.a, v.b, v.f));
  tris.push(triangle(0, -1, 0, v.a, v.f, v.e));
  // +Y face (d,h,g,c)
  tris.push(triangle(0, 1, 0, v.d, v.g, v.h));
  tris.push(triangle(0, 1, 0, v.d, v.c, v.g));
  // -X face (a,e,h,d)
  tris.push(triangle(-1, 0, 0, v.a, v.e, v.h));
  tris.push(triangle(-1, 0, 0, v.a, v.h, v.d));
  // +X face (b,c,g,f)
  tris.push(triangle(1, 0, 0, v.b, v.c, v.g));
  tris.push(triangle(1, 0, 0, v.b, v.g, v.f));
  return tris.join('\n');
};

const cylinderStl = (link: CylinderLink, segments = 48): string => {
  const { diameter, length } = link.dimensions;
  const r = diameter / 2;
  const tris: string[] = [];
  const angle = (i: number) => (i / segments) * Math.PI * 2;

  for (let i = 0; i < segments; i++) {
    const a0 = angle(i);
    const a1 = angle(i + 1);
    const x0 = Math.cos(a0) * r;
    const y0 = Math.sin(a0) * r;
    const x1 = Math.cos(a1) * r;
    const y1 = Math.sin(a1) * r;
    const nxMid = Math.cos((a0 + a1) / 2);
    const nyMid = Math.sin((a0 + a1) / 2);

    // Side: two triangles per segment
    tris.push(
      triangle(
        nxMid,
        nyMid,
        0,
        [x0, y0, 0],
        [x1, y1, 0],
        [x1, y1, length],
      ),
    );
    tris.push(
      triangle(
        nxMid,
        nyMid,
        0,
        [x0, y0, 0],
        [x1, y1, length],
        [x0, y0, length],
      ),
    );
    // Bottom cap (normal -Z), wound CW from below
    tris.push(triangle(0, 0, -1, [0, 0, 0], [x1, y1, 0], [x0, y0, 0]));
    // Top cap (normal +Z)
    tris.push(triangle(0, 0, 1, [0, 0, length], [x0, y0, length], [x1, y1, length]));
  }
  return tris.join('\n');
};

export const buildStl = (link: Link): string => {
  const body = link.shape === 'cylinder' ? cylinderStl(link) : boxStl(link);
  return [`solid ${link.id}`, body, `endsolid ${link.id}`, ''].join('\n');
};
