"""Builds Gunny's first-person paws holding the gun, in Blender, and exports them as GLB.

  src/assets/models/gunny-paws.glb   two objects, RightPaw (on the grip) and LeftPaw (under
                                     the barrel), with Skin, Claw and Fur materials, vertex
                                     colours (the skin darkens into the fur at the wrist)
                                     and a UV layout, ready to be painted later

The paws follow the rat hand references: a long bony hand with tendon ridges on the back,
four slender fingers with a bulge at every knuckle, long dark hooked claws, a small thumb
near the wrist, pink hairless skin, and a thin dark furry forearm with spiky tufts at the
wrist. The hand is modelled as metaballs (spheres and capsules that melt together into
one smooth shape), turned into a mesh and reduced to low poly. Fingers are posed joint by
joint, each bending until it touches the gun, so they wrap the grip and the barrel.

Everything is placed in the gun model's own coordinates (as in src/render/gunView.js:
y up, the nozzle at the origin, the gun running back along +z), so the game attaches
the paws to the gun and they follow its sway and recoil.

Run (Blender's Python module, installed once into a local folder):
  python3 -m venv .blender && .blender/bin/pip install bpy
  .blender/bin/python tools/blender/build_gunny_paws.py
"""

import math
import random
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "assets" / "models" / "gunny-paws.glb"

# Colours are linear, as Blender and glTF store them (sRGB in the comments).
SKIN = (0.69, 0.38, 0.37)     # #d9a6a4 pale pink
SKIN_SPOT = (0.42, 0.22, 0.22)  # darker freckles on the back of the hand
FUR = (0.026, 0.022, 0.02)    # #2d2927 near-black grey
CLAW = (0.07, 0.052, 0.048)   # #4a3f3c dark horn

S = 1.6             # overall paw size (the hand's measurements below are multiplied by it)
MB_SCALE = 0.53     # a metaball's visible radius is about this share of its radius
MB_RESOLUTION = 0.0024
HAND_TRIANGLES = 2400  # per hand, after reduction


def to_blender(v):
    """Gun coordinates (y up, like three.js) to Blender's (z up). The glTF export turns it back."""
    return Vector((v[0], -v[2], v[1]))


def rotate(v, axis, degrees):
    return Quaternion(Vector(axis).normalized(), math.radians(degrees)) @ Vector(v)


# --- Hand skeleton ------------------------------------------------------------------

class Hand:
    """A hand's frame: wrist position, `forward` (wrist to knuckles), `palm` (the way the
    palm faces) and `index` (across the hand, toward the index finger)."""

    def __init__(self, wrist, forward, palm, right_handed):
        self.wrist = Vector(wrist)
        self.f = Vector(forward).normalized()
        n = Vector(palm)
        self.n = (n - self.f * n.dot(self.f)).normalized()
        self.k = self.f.cross(self.n)                     # bending about k curls toward the palm
        self.index = self.k if right_handed else -self.k


# Finger proportions: (offset across the hand, knuckle distance from wrist, splay in
# degrees, phalanx lengths), from index to pinky. Long, rat-like fingers.
FINGERS = [
    (0.031 * S, 0.074 * S, 11, (0.033 * S, 0.025 * S, 0.019 * S)),
    (0.0105 * S, 0.079 * S, 3, (0.036 * S, 0.027 * S, 0.020 * S)),
    (-0.0105 * S, 0.076 * S, -5, (0.034 * S, 0.026 * S, 0.019 * S)),
    (-0.03 * S, 0.068 * S, -13, (0.028 * S, 0.021 * S, 0.016 * S)),
]
FINGER_R = (0.0054 * S, 0.0048 * S, 0.0043 * S)  # visible radius of each phalanx: slender
JOINT_R = (0.0069 * S, 0.0061 * S, 0.0054 * S)   # knuckle bulges, a little thicker


def pose_finger(hand, spec, outside, max_bend=(70, 75, 60), rest_bend=(16, 24, 18)):
    """Joint positions for one finger. Each joint bends toward the palm until the next
    segment touches the gun (`outside(p)` <= 0), so the finger wraps whatever it holds."""
    across, reach, splay, lengths = spec
    base = hand.wrist + hand.f * reach + hand.index * across
    direction = rotate(hand.f, hand.n, splay if hand.index == hand.k else -splay)
    joints = [base]
    bend_axis = direction.cross(hand.n).normalized()
    total = 0.0
    for length, most, least in zip(lengths, max_bend, rest_bend):
        chosen = least  # nothing to hold here: the joint stays relaxed
        for step in range(0, most + 1, 2):
            d = rotate(direction, bend_axis, total + step)
            if outside(joints[-1] + d * length) <= 0:
                chosen = max(least, step - 2)
                break
        else:
            # Didn't touch, but if the next joint ends up inside, bend fully to wrap round.
            if outside(joints[-1] + rotate(direction, bend_axis, total + least) * length) <= 0.15:
                chosen = most
        total += chosen
        joints.append(joints[-1] + rotate(direction, bend_axis, total) * length)
    return joints, rotate(direction, bend_axis, total), bend_axis


# --- Metaball body --------------------------------------------------------------------

class Blob:
    """Collects metaball elements (in gun coordinates) for one hand."""

    def __init__(self, name):
        self.mb = bpy.data.metaballs.new(name)
        self.mb.resolution = MB_RESOLUTION
        self.mb.render_resolution = MB_RESOLUTION
        self.mb.threshold = 0.6
        self.obj = bpy.data.objects.new(name + "Blob", self.mb)
        bpy.context.scene.collection.objects.link(self.obj)

    def ball(self, at, radius):
        e = self.mb.elements.new(type="BALL")
        e.co = to_blender(at)
        e.radius = radius / MB_SCALE

    def capsule(self, a, b, radius):
        a, b = Vector(a), Vector(b)
        e = self.mb.elements.new(type="CAPSULE")
        e.co = to_blender((a + b) / 2)
        e.radius = radius / MB_SCALE
        e.size_x = max(0.0001, (b - a).length / 2 - radius * 0.45)
        e.rotation = Vector((1, 0, 0)).rotation_difference((to_blender(b) - to_blender(a)).normalized())

    def ellipsoid(self, at, x_axis, y_axis, sizes, radius):
        """An ellipsoid with its long axes along x_axis / y_axis (gun coordinates)."""
        e = self.mb.elements.new(type="ELLIPSOID")
        e.co = to_blender(at)
        e.radius = radius / MB_SCALE
        e.size_x, e.size_y, e.size_z = sizes
        x = to_blender(x_axis).normalized()
        y = to_blender(y_axis).normalized()
        z = x.cross(y).normalized()
        y = z.cross(x)
        e.rotation = Matrix((x, y, z)).transposed().to_quaternion()


def build_hand_blob(name, hand, outside):
    """The pink hand: wrist, a long flat palm with tendon ridges, fingers and a thumb."""
    blob = Blob(name)
    w, f, n, idx = hand.wrist, hand.f, hand.n, hand.index
    tips = []

    # Wrist and the flat, bony back of the hand.
    blob.capsule(w - f * 0.022 * S, w + f * 0.012 * S, 0.0145 * S)
    # Ellipsoid sizes are shares of its radius: about 0.12 long, 0.1 wide, 0.025 thick at S 1.6.
    blob.ellipsoid(w + f * 0.042 * S + n * 0.002 * S, f, idx, (0.72, 0.58, 0.15), 0.05 * S)
    for across, reach, _, _ in FINGERS:
        start = w + f * 0.012 * S + idx * across * 0.45 - n * 0.006 * S
        end = w + f * (reach - 0.008 * S) + idx * across - n * 0.0045 * S
        blob.capsule(start, end, 0.0058 * S)  # tendon ridges on the back of the hand

    for spec in FINGERS:
        joints, tip_dir, bend_axis = pose_finger(hand, spec, outside)
        scale = 0.88 if spec is FINGERS[-1] else 1.0
        for i, (a, b) in enumerate(zip(joints, joints[1:])):
            blob.ball(a, JOINT_R[i] * scale)
            blob.capsule(a, b, FINGER_R[i] * scale)
        blob.ball(joints[-1], FINGER_R[-1] * 0.95 * scale)
        tips.append((joints[-1], tip_dir, bend_axis, scale))

    # A small thumb near the wrist on the index side, pointing forward along the hand.
    t0 = w + f * 0.018 * S + idx * 0.022 * S + n * 0.006 * S
    t_dir = (f * 0.8 + idx * 0.45 + n * 0.35).normalized()
    t1 = t0 + t_dir * 0.016 * S
    t2 = t1 + rotate(t_dir, t_dir.cross(n), 25) * 0.012 * S
    blob.capsule(t0, t1, 0.0068 * S)
    blob.ball(t1, 0.0066 * S)
    blob.capsule(t1, t2, 0.0056 * S)
    tips.append((t2, (t2 - t1).normalized(), t_dir.cross(n).normalized(), 0.75))
    return blob, tips


def mesh_from_blob(blob, target_triangles):
    """Turns the metaballs into a mesh and reduces it to about `target_triangles`."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    dense = bpy.data.meshes.new_from_object(blob.obj.evaluated_get(depsgraph))
    temp = bpy.data.objects.new("dense", dense)
    bpy.context.scene.collection.objects.link(temp)
    tris = sum(len(p.vertices) - 2 for p in dense.polygons)
    decimate = temp.modifiers.new("decimate", "DECIMATE")
    decimate.ratio = min(1.0, target_triangles / max(1, tris))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    low = bpy.data.meshes.new_from_object(temp.evaluated_get(depsgraph))
    bpy.data.objects.remove(temp)
    bpy.data.objects.remove(blob.obj)
    return low


# --- Hard pieces: claws and the furry forearm -------------------------------------------

class Part:
    """Extra vertices and faces (in Blender coordinates) added to a hand's mesh."""

    def __init__(self):
        self.verts, self.faces, self.materials = [], [], []


def tube(part, points, radii, material, sides=6, tip=False, jitter=0.0, seed=0):
    """A tapered tube through `points` (gun coordinates); `tip` closes it to a point."""
    rng = random.Random(seed)
    pts = [Vector(p) for p in points]
    n = len(pts)
    tangents = [(pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized() for i in range(n)]
    side = tangents[0].orthogonal().normalized()
    rings = []
    for i in range(n - 1 if tip else n):
        t = tangents[i]
        if i:
            axis = tangents[i - 1].cross(t)
            if axis.length > 1e-9:
                side = Quaternion(axis.normalized(), tangents[i - 1].angle(t)) @ side
            side = (side - t * side.dot(t)).normalized()
        up = t.cross(side)
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            r = radii[i] * (1 + rng.uniform(-jitter, jitter))
            ring.append(len(part.verts))
            part.verts.append(to_blender(pts[i] + side * math.cos(a) * r + up * math.sin(a) * r))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            part.faces.append([a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]])
            part.materials.append(material)
    start = len(part.verts)
    part.verts.append(to_blender(pts[0] - tangents[0] * radii[0] * 0.4))
    for k in range(sides):
        part.faces.append([start, rings[0][(k + 1) % sides], rings[0][k]])
        part.materials.append(material)
    end = len(part.verts)
    part.verts.append(to_blender(pts[-1] if tip else pts[-1] + tangents[-1] * radii[-1] * 0.4))
    for k in range(sides):
        part.faces.append([rings[-1][k], rings[-1][(k + 1) % sides], end])
        part.materials.append(material)


def claw(part, tip, direction, bend_axis, scale):
    """A long, dark, hooked claw: out from the fingertip, curling down toward the palm side."""
    d = Vector(direction).normalized()
    scale *= S
    length = 0.026 * scale
    pts = [Vector(tip) - d * 0.004 * scale]
    for i in range(1, 5):
        d_i = rotate(d, bend_axis, 14 * i)
        pts.append(pts[-1] + d_i * (length / 4))
    radii = [0.0047 * scale, 0.0039 * scale, 0.0028 * scale, 0.0016 * scale, 0]
    tube(part, pts, radii, 2, sides=6, tip=True)


def forearm(part, wrist, direction, seed):
    """A thin, dark, furry forearm from the wrist out of view, with spiky tufts at the wrist."""
    d = Vector(direction).normalized()
    w = Vector(wrist)
    pts = [w + d * 0.012 * S, w + d * 0.05 * S, w + d * 0.12 * S, w + d * 0.25, w + d * 0.45, w + d * 0.75]
    radii = [r * S for r in (0.0175, 0.023, 0.03, 0.036, 0.04, 0.042)]
    tube(part, pts, radii, 1, sides=8, jitter=0.12, seed=seed)
    rng = random.Random(seed + 1)
    side = d.orthogonal().normalized()
    up = d.cross(side)
    for k in range(6):
        a = 2 * math.pi * (k + rng.uniform(-0.3, 0.3)) / 6
        radial = side * math.cos(a) + up * math.sin(a)
        base = w + d * rng.uniform(0.02, 0.04) * S + radial * 0.016 * S
        spike = base + (-d * rng.uniform(0.012, 0.02) + radial * rng.uniform(0.01, 0.018)) * S
        tube(part, [base, (base + spike) / 2, spike], [0.0018 * S, 0.001 * S, 0], 1, sides=4, tip=True)


# --- Putting a paw together ---------------------------------------------------------------

def paw(name, hand, outside, arm_direction, seed, materials):
    blob, tips = build_hand_blob(name, hand, outside)
    mesh = mesh_from_blob(blob, HAND_TRIANGLES)

    extra = Part()
    for tip, direction, bend_axis, scale in tips:
        claw(extra, tip, direction, bend_axis, scale)
    forearm(extra, hand.wrist - hand.f * 0.02 * S, arm_direction, seed)

    # Append the claws and forearm to the hand mesh.
    base = len(mesh.vertices)
    mesh.vertices.add(len(extra.verts))
    for i, v in enumerate(extra.verts):
        mesh.vertices[base + i].co = v
    first_poly = len(mesh.polygons)
    loops = sum(len(f) for f in extra.faces)
    loop_start = len(mesh.loops)
    mesh.loops.add(loops)
    mesh.polygons.add(len(extra.faces))
    cursor = loop_start
    for j, face in enumerate(extra.faces):
        poly = mesh.polygons[first_poly + j]
        poly.loop_start = cursor
        for k, vi in enumerate(face):
            mesh.loops[cursor + k].vertex_index = base + vi
        cursor += len(face)
    mesh.update(calc_edges=True)
    mesh.validate()

    for m in materials:
        mesh.materials.append(m)
    for j, poly in enumerate(mesh.polygons):
        if j < first_poly:
            poly.material_index = 0
            poly.use_smooth = True
        else:
            poly.material_index = extra.materials[j - first_poly]
            poly.use_smooth = extra.materials[j - first_poly] == 1  # fur smooth, claws crisp

    colour_vertices(mesh, hand, base, seed)

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    unwrap(obj)
    return obj


def colour_vertices(mesh, hand, first_extra, seed):
    """Skin pink, fading to the fur's dark grey toward the wrist, with a few darker
    freckles on the back of the hand. Claws and fur stay white here (their material
    gives their colour)."""
    rng = random.Random(seed)
    spots = [
        hand.wrist + (hand.f * rng.uniform(0.02, 0.06) + hand.index * rng.uniform(-0.025, 0.025) - hand.n * 0.01) * S
        for _ in range(5)
    ]
    attr = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for v in mesh.vertices:
        if v.index >= first_extra:
            attr.data[v.index].color = (1, 1, 1, 1)
            continue
        p = Vector((v.co.x, v.co.z, -v.co.y))  # back to gun coordinates
        along = (p - hand.wrist).dot(hand.f)
        t = min(1.0, max(0.0, (along + 0.02 * S) / (0.04 * S)))
        t = t * t * (3 - 2 * t)
        colour = [FUR[i] + (SKIN[i] - FUR[i]) * t for i in range(3)]
        if any((p - s).length < 0.006 * S for s in spots):
            colour = [c * 0.65 for c in colour]
        attr.data[v.index].color = (*colour, 1)
    mesh.color_attributes.active_color = attr


def unwrap(obj):
    """A UV layout for painting later: Blender lays every face out flat, without overlaps."""
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.scene.objects:
        o.select_set(o is obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")


# --- The two paws on the gun ----------------------------------------------------------------

def right_paw(materials):
    """On the grip: a box 0.04 wide, 0.14 tall, 0.055 deep at (0, -0.1, 0.52), tilted back."""
    tilt = 0.35
    g = Vector((0, -0.1, 0.52))
    u = Vector((1, 0, 0))                              # right
    v = Vector((0, math.cos(tilt), math.sin(tilt)))    # up the grip
    w = Vector((0, -math.sin(tilt), math.cos(tilt)))   # back, toward you
    fr = FINGER_R[0]                                   # finger centres sit this far off the grip

    def outside(p):
        q = p - g
        a, b = q.dot(u) / (0.02 + fr), q.dot(w) / (0.0275 + fr)
        return math.hypot(a, b) - 1

    knuckles = g + u * (0.02 + JOINT_R[0] * 1.1) + w * 0.012 + v * 0.004
    forward = -w - v * 0.12
    hand = Hand(knuckles - forward.normalized() * 0.078 * S, forward, -u, right_handed=True)
    return paw("RightPaw", hand, outside, (0.4, -0.45, 1.0), 21, materials)


def left_paw(materials):
    """Under the barrel: a pipe of radius 0.042 along z; the hand cradles it from below."""
    reach = 0.042 + FINGER_R[0]

    def outside(p):
        return math.hypot(p.x, p.y) / reach - 1

    forward = Vector((1, 0.38, 0))
    knuckles = Vector((0.004, -(0.042 + JOINT_R[0] * 1.15), 0.2))
    hand = Hand(knuckles - forward.normalized() * 0.078 * S, forward, (-0.38, 1, 0), right_handed=False)
    return paw("LeftPaw", hand, outside, (-0.85, -0.5, 1.0), 31, materials)


def material(name, colour, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def main():
    import sys
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Skin is white in the material: its colour comes from the vertex colours.
    materials = [material("Skin", (1, 1, 1), 0.65), material("Fur", FUR, 0.95), material("Claw", CLAW, 0.4)]
    out = OUT
    if "--showcase" in sys.argv:
        # One relaxed right hand on its own, back of the hand up, for checking its shape.
        out = Path(sys.argv[sys.argv.index("--showcase") + 1])
        hand = Hand((0, 0, 0), (0, 0, -1), (0, -1, 0), right_handed=True)
        paws = [paw("Showcase", hand, lambda p: 1, (0, 0.15, 1), 5, materials)]
    else:
        paws = [right_paw(materials), left_paw(materials)]

    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out), export_format="GLB", export_yup=True, use_selection=False,
        export_vertex_color="ACTIVE",
    )
    tris = sum(len(p.vertices) - 2 for o in paws for p in o.data.polygons)
    print(f"wrote {out} ({tris} triangles)")


main()
