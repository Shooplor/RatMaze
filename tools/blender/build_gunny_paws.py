"""Builds Gunny's first-person paw holding the gun, in Blender, and exports it.

  src/assets/models/gunny-paws.glb   RightPaw, a fist on the grip, with Skin, Claw and Fur
                                     materials. The skin is painted with a texture,
                                     src/assets/textures/gunny-paw.png, through its UV layout
  art/gunny-paw/layout.json          that UV layout, for tools/draw_paw_uv_template.py, which
                                     draws the painting templates and the starting texture
  art/gunny-paw/gunny-paw.obj        the hand with its UVs, for painting in 3D in Procreate

The paw follows the rat hand references: a long bony hand with tendon ridges on the back,
four slender fingers with a bulge at every knuckle, long dark hooked claws, a jointed
thumb, pink hairless skin, and a short piece of dark forearm with spiky tufts at the wrist.
The hand and forearm are modelled together as metaballs (spheres and capsules that melt
together into one smooth shape), so the wrist has no seam. That surface is then rebuilt
as even four-sided faces that follow its shape (QuadriFlow), so the UV layout and the
painted texture come out clean. The fingers close into a fist round the gun's grip, and
the thumb folds over them.

The UV layout cuts the skin into four pieces, each laid flat and upright: the back of the
hand with the backs of the fingers, the palm side, and the two halves of the thumb.

Everything is placed in the gun model's own coordinates (as in src/render/gunView.js:
y up, the nozzle at the origin, the gun running back along +z), so the game attaches
the paw to the gun and it follows its sway and recoil.

Run (Blender's Python module, installed once into a local folder):
  python3 -m venv .blender && .blender/bin/pip install bpy
  .blender/bin/python tools/blender/build_gunny_paws.py
or `npm run art:gunny-paws`, which also draws the templates (tools/draw_paw_uv_template.py).
"""

import json
import math
import random
import sys
from pathlib import Path

import bpy
import bmesh  # noqa: E402 (Blender's own modules import after bpy)
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "assets" / "models" / "gunny-paws.glb"
ART = ROOT / "art" / "gunny-paw"
LAYOUT_SIZE = 2048  # the texture's size: the painting canvas

# Colours are linear, as Blender and glTF store them (sRGB in the comments).
SKIN = (0.69, 0.38, 0.37)     # #d9a6a4 pale pink
FUR = (0.026, 0.022, 0.02)    # #2d2927 near-black grey
CLAW = (0.07, 0.052, 0.048)   # #4a3f3c dark horn

S = 1.6             # overall paw size (the hand's measurements below are multiplied by it)
MB_SCALE = 0.53     # a metaball's visible radius is about this share of its radius
CHAIN_SCALE = 0.696  # the same for balls packed every 0.3 radius along a line (measured)
CHAIN_SPACING = 0.3
MB_RESOLUTION = 0.0024
HAND_QUADS = 2400   # four-sided faces in the hand and its bit of forearm


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
    return pose_chain(base, direction, hand.n, lengths, outside, max_bend, rest_bend)


def pose_chain(base, direction, toward, lengths, outside, max_bend, rest_bend):
    """Joint positions for a chain of bones from `base`, curling toward `toward`."""
    joints = [base]
    bend_axis = direction.cross(toward).normalized()
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

    def chain(self, path):
        """A smooth, tapering limb along `path` (a list of (point, radius), closely spaced).
        Balls packed tightly along a line melt into an even tube, with none of the bulges
        overlapping capsules make, so the radius can change gradually."""
        travelled, next_ball = 0.0, 0.0
        for (a, ra), (b, rb) in zip(path, path[1:]):
            length = (b - a).length
            while next_ball <= travelled + length:
                t = (next_ball - travelled) / length
                r = ra + (rb - ra) * t
                e = self.mb.elements.new(type="BALL")
                e.co = to_blender(a.lerp(b, t))
                e.radius = r / CHAIN_SCALE
                next_ball += e.radius * CHAIN_SPACING
            travelled += length

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


# The thumb: bone lengths (metacarpal, then the two phalanges) and visible radii.
THUMB_LENGTHS = (0.036 * S, 0.027 * S, 0.021 * S)
THUMB_R = (0.0074 * S, 0.0061 * S, 0.0053 * S)
THUMB_JOINT_R = (0.0072 * S, 0.0064 * S)


def build_hand_blob(name, hand, outside, arm, fist=False):
    """The pink hand and its forearm as one body: the forearm, a long flat palm with tendon
    ridges, fingers and a thumb. Also returns the claws' places and the bones (see `bone`)."""
    blob = Blob(name)
    w, f, n, idx = hand.wrist, hand.f, hand.n, hand.index
    tips = []
    bones = [bone(w, w + f * 0.07 * S, 0.03 * S, -n, "hand")]  # the palm
    for (a, radius, _), (b, _, _) in zip(arm, arm[1:]):
        bones.append(bone(a, b, radius, -n, "hand"))  # the forearm

    # The forearm and wrist, running into the heel of the hand, and the flat, bony back of
    # the hand. Ellipsoid sizes are shares of its radius: about 0.12 long, 0.1 wide, 0.025
    # thick at S 1.6.
    blob.chain([(p, r) for p, r, _ in arm])
    blob.ellipsoid(w + f * 0.042 * S + n * 0.002 * S, f, idx, (0.72, 0.58, 0.15), 0.05 * S)
    for across, reach, _, _ in FINGERS:
        start = w + f * 0.012 * S + idx * across * 0.45 - n * 0.006 * S
        end = w + f * (reach - 0.008 * S) + idx * across - n * 0.0045 * S
        blob.capsule(start, end, 0.0058 * S)  # tendon ridges on the back of the hand

    fingers, marks = [], []
    for spec in FINGERS:
        joints, tip_dir, bend_axis = pose_finger(hand, spec, outside, **({"rest_bend": FIST} if fist else {}))
        scale = 0.88 if spec is FINGERS[-1] else 1.0
        for i, (a, b) in enumerate(zip(joints, joints[1:])):
            blob.ball(a, JOINT_R[i] * scale)
            blob.capsule(a, b, FINGER_R[i] * scale)
        blob.ball(joints[-1], FINGER_R[-1] * 0.95 * scale)
        tips.append((joints[-1], tip_dir, bend_axis, scale))
        fingers.append(joints)
        for i, (a, b) in enumerate(zip(joints, joints[1:])):
            # The back of a finger bone: away from the way the finger curls.
            bones.append(bone(a, b, FINGER_R[i] * scale, (b - a).normalized().cross(bend_axis), "hand"))
        # Where to name the finger on the UV template: on the back of its middle bone.
        a, b = joints[1], joints[2]
        marks.append((a + b) / 2 + (b - a).normalized().cross(bend_axis) * FINGER_R[1] * 1.5)

    if fist:
        joints, tip_dir, bend_axis = fist_thumb(hand, *fingers[:2])
    else:
        joints, tip_dir, bend_axis = posed_thumb(hand, outside)
    for i, (a, b) in enumerate(zip(joints, joints[1:])):
        if i:
            blob.ball(a, THUMB_JOINT_R[i - 1])
        blob.capsule(a, b, THUMB_R[i])
        # In a fist the thumbnail faces out, the way the palm faces; open, it faces up.
        bones.append(bone(a, b, THUMB_R[i], n if fist else -n, "thumb"))
    blob.ball(joints[-1], THUMB_R[-1] * 0.95)
    tips.append((joints[-1], tip_dir, bend_axis, 0.8))
    marks.append(joints[-1])
    return blob, tips, bones, {"fingertip": fingers[1][-1], "thumb": (joints[0], joints[-1]), "marks": marks}


def bone(a, b, radius, back, group):
    """A bone of the hand for laying out the UVs: a segment, its thickness, which way its
    top faces (the back of the hand, the nail side) and which part of the hand it is in."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    back = Vector(back)
    return {"a": a, "b": b, "r": radius, "back": (back - d * back.dot(d)).normalized(), "group": group}


def thumb_base(hand):
    """Where the thumb leaves the hand: the heel of the palm, on the index side."""
    return hand.wrist + hand.f * 0.014 * S + hand.index * 0.025 * S + hand.n * 0.007 * S


def posed_thumb(hand, outside):
    """An open or holding hand's thumb: out from the heel of the palm, forward and a little
    to the palm side, curling toward the palm until it touches whatever the hand holds."""
    f, n, idx = hand.f, hand.n, hand.index
    direction = (f * 0.75 + idx * 0.5 + n * 0.3).normalized()
    toward = (n - idx * 0.4).normalized()  # a thumb curls across the palm
    toward = (toward - direction * toward.dot(direction)).normalized()
    return pose_chain(thumb_base(hand), direction, toward, THUMB_LENGTHS, outside,
                      max_bend=(30, 55, 50), rest_bend=(8, 16, 14))


def fist_thumb(hand, index, middle):
    """A closed fist's thumb: from the heel of the palm, up past the curled index finger,
    then folded across the middle bones of the index and middle fingers, the way a thumb
    locks a fist round a handle."""
    w, f, n, idx = hand.wrist, hand.f, hand.n, hand.index
    gap = 0.006 * S  # metaballs closer than this would melt the thumb into the fingers

    def over(joints, share, radius):
        """A point lying on a finger's middle bone, and the way out from the fist there."""
        a, b = joints[1], joints[2]
        bone = (b - a).normalized()
        out = (n - bone * n.dot(bone)).normalized()
        return a.lerp(b, share) + out * (FINGER_R[1] + gap + radius), out

    knuckle = w + f * 0.056 * S + n * 0.05 * S + idx * 0.038 * S  # beside the index finger
    bend, _ = over(index, 0.3, THUMB_JOINT_R[1])
    tip, out = over(middle, 0.4, THUMB_R[2])
    tip_dir = (tip - bend).normalized()
    return [thumb_base(hand), knuckle, bend, tip], tip_dir, out.cross(tip_dir).normalized()


def mesh_from_blob(blob, quads):
    """Turns the metaballs into a mesh, then rebuilds its surface as about `quads` even,
    four-sided faces that follow the shape (Blender's QuadriFlow remesher): clean topology,
    so the UV layout and the texture painted on it come out even, without stretched slivers."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    dense = bpy.data.meshes.new_from_object(blob.obj.evaluated_get(depsgraph))
    bpy.data.objects.remove(blob.obj)
    # QuadriFlow refuses edges shorter than 0.0001, and the paw is small: work at 10 times
    # the size, merging the few vertices that are still that close.
    bm = bmesh.new()
    bm.from_mesh(dense)
    bmesh.ops.scale(bm, vec=(10, 10, 10), verts=bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1.5e-4)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1.5e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(dense)
    bm.free()
    temp = bpy.data.objects.new("dense", dense)
    bpy.context.scene.collection.objects.link(temp)
    for o in bpy.context.scene.objects:
        o.select_set(o is temp)
    bpy.context.view_layer.objects.active = temp
    if bpy.ops.object.quadriflow_remesh(mode="FACES", target_faces=quads, seed=1) != {"FINISHED"}:
        raise RuntimeError("QuadriFlow couldn't remesh the paw")
    low = temp.data
    low.transform(Matrix.Scale(0.1, 4))
    bpy.data.objects.remove(temp)
    return low


# --- The forearm ---------------------------------------------------------------------------

# How thick the wrist and forearm are (visible radius) by distance along them from the heel
# of the hand: slim at the wrist, widening into the forearm. Only a short piece of forearm
# is modelled: in first person it is always below the screen (even the heel of the hand is).
ARM_LENGTH = 0.2
ARM_PROFILE = [(0, 0.0135 * S), (0.035 * S, 0.0138 * S), (0.065 * S, 0.018 * S), (0.12 * S, 0.025 * S)]


def arm_path(hand, direction):
    """The wrist and forearm's centre line as (point, radius, distance along) samples: back
    from the heel of the hand, curving smoothly at the wrist into the forearm's direction."""
    d = Vector(direction).normalized()
    start = hand.wrist + hand.f * 0.012 * S
    corner = hand.wrist - hand.f * 0.03 * S
    bent = corner + d * 0.05 * S
    points = [start * (1 - t) ** 2 + corner * 2 * (1 - t) * t + bent * t * t for t in (i / 16 for i in range(17))]
    length = sum((b - a).length for a, b in zip(points, points[1:]))
    steps = math.ceil((ARM_LENGTH - length) / 0.01)
    points += [bent + d * (ARM_LENGTH - length) * i / steps for i in range(1, steps + 1)]
    path, along = [], 0.0
    for i, p in enumerate(points):
        if i:
            along += (p - points[i - 1]).length
        path.append((p, profile(ARM_PROFILE, along), along))
    return path


def profile(table, x):
    """Linear interpolation in a [(x, value), ...] table."""
    for (x0, v0), (x1, v1) in zip(table, table[1:]):
        if x <= x1:
            return v0 + (v1 - v0) * max(0.0, (x - x0) / (x1 - x0))
    return table[-1][1]


# --- Hard pieces: claws and fur tufts ---------------------------------------------------------

class Part:
    """Extra vertices and faces (in Blender coordinates) added to a hand's mesh."""

    def __init__(self):
        self.verts, self.faces, self.materials = [], [], []


def tube(part, points, radii, material, sides=6, tip=False):
    """A tapered tube through `points` (gun coordinates); `tip` closes it to a point."""
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
            r = radii[i]
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


def wrist_tufts(part, arm, seed):
    """Spiky tufts of fur sticking out round the wrist, pointing toward the hand."""
    rng = random.Random(seed + 1)
    for k in range(6):
        reach = rng.uniform(0.05, 0.08) * S
        i = next(i for i, (_, _, along) in enumerate(arm) if along >= reach)
        (p, r, _), (q, _, _) = arm[i], arm[i + 1]
        d = (q - p).normalized()
        side = d.orthogonal().normalized()
        a = 2 * math.pi * (k + rng.uniform(-0.3, 0.3)) / 6
        radial = Quaternion(d, a) @ side
        base = p + radial * r * 0.85
        spike = base + (-d * rng.uniform(0.012, 0.02) + radial * rng.uniform(0.01, 0.018)) * S
        tube(part, [base, (base + spike) / 2, spike], [0.0018 * S, 0.001 * S, 0], 1, sides=4, tip=True)


# --- Putting a paw together ---------------------------------------------------------------

def paw(name, hand, outside, arm_direction, seed, materials, fist=False):
    arm = arm_path(hand, arm_direction)
    blob, tips, bones, points = build_hand_blob(name, hand, outside, arm, fist)
    body = mesh_from_blob(blob, HAND_QUADS)

    extra = Part()
    for tip, direction, bend_axis, scale in tips:
        claw(extra, tip, direction, bend_axis, scale)
    wrist_tufts(extra, arm, seed)

    # One mesh: the hand, then the claws and tufts.
    base, first_poly = len(body.vertices), len(body.polygons)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(
        [v.co.copy() for v in body.vertices] + extra.verts, [],
        [p.vertices[:] for p in body.polygons] + [[base + i for i in face] for face in extra.faces],
    )
    mesh.update(calc_edges=True)
    bpy.data.meshes.remove(body)

    for m in materials:
        mesh.materials.append(m)
    for j, poly in enumerate(mesh.polygons):
        if j < first_poly:
            poly.material_index = 0
            poly.use_smooth = True
        else:
            poly.material_index = extra.materials[j - first_poly]
            poly.use_smooth = extra.materials[j - first_poly] == 1  # tufts smooth, claws crisp

    colour_vertices(mesh, hand, base)

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    ends = {"hand": (arm[-1][0], points["fingertip"]), "thumb": points["thumb"]}
    regions = unwrap_for_painting(obj, bones, first_poly, ends)
    return obj, {"skin_faces": first_poly, "regions": regions, "marks": points["marks"]}


def colour_vertices(mesh, hand, first_extra):
    """The paw's starting colours, for the texture: skin pink, fading to the fur's dark grey
    toward the wrist. Claws and tufts stay white here (their material gives their colour)."""
    attr = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for v in mesh.vertices:
        if v.index >= first_extra:
            attr.data[v.index].color = (1, 1, 1, 1)
            continue
        p = Vector((v.co.x, v.co.z, -v.co.y))  # back to gun coordinates
        along = (p - hand.wrist).dot(hand.f)
        t = min(1.0, max(0.0, (along + 0.02 * S) / (0.04 * S)))
        t = t * t * (3 - 2 * t)
        attr.data[v.index].color = (*[FUR[i] + (SKIN[i] - FUR[i]) * t for i in range(3)], 1)
    mesh.color_attributes.active_color = attr


# --- A UV layout to paint on ------------------------------------------------------------

# Each region of the skin becomes one piece of the UV layout: (title, note) for the template.
REGIONS = {
    "hand_top": ("BACK OF THE HAND", "knuckles, backs of the fingers, top of the forearm"),
    "hand_under": ("PALM SIDE", "palm, finger pads, inside of the wrist"),
    "thumb_top": ("THUMB", "nail side: shows most in the game"),
    "thumb_under": ("THUMB PAD", "pressed on the fingers"),
}


def segment_distance(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length


def unwrap_for_painting(obj, bones, skin_faces, ends):
    """Cuts the skin into a few big pieces and lays them out flat, upright, for painting.

    Every face of the skin is sorted into a part of the hand (the hand with its fingers and
    the forearm as far as it shows, the thumb, the rest of the forearm) by its nearest bone,
    and into the top or underside of that part by which way it faces compared with the
    bones near it. Cuts go between the regions, and each region unfolds as one piece: the
    back of the hand with its fingers, the palm side, the two halves of the thumb, and the
    two halves of the far forearm, which gets less of the texture as it is off screen.
    `ends` gives each part's bottom and top end (gun coordinates), to stand its pieces
    upright. Returns each skin face's region."""
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()

    def gun(v):
        return Vector((v.x, v.z, -v.y))

    group, facing = {}, {}
    for face in bm.faces[:skin_faces]:
        c = gun(face.calc_center_median())
        distances = [max(1e-4, segment_distance(c, b["a"], b["b"]) - b["r"]) for b in bones]
        group[face.index] = bones[distances.index(min(distances))]["group"]
        up = sum((b["back"] / d ** 4 for b, d in zip(bones, distances)), Vector()).normalized()
        facing[face.index] = gun(face.normal).dot(up)
    # Blur how much each face faces up a little among its neighbours, so the line between
    # top and underside runs smoothly instead of zigzagging face by face.
    for _ in range(6):
        facing = {
            i: (facing[i] + sum(facing[g.index] for e in bm.faces[i].edges for g in e.link_faces
                                if g.index != i and g.index in facing)) / (1 + sum(
                1 for e in bm.faces[i].edges for g in e.link_faces if g.index != i and g.index in facing))
            for i in facing
        }
    region = {i: group[i] + ("_top" if facing[i] > 0 else "_under") for i in facing}
    tidy_regions(bm, region)

    for edge in bm.edges:
        faces = [f.index for f in edge.link_faces]
        edge.seam = len(faces) == 2 and region.get(faces[0]) != region.get(faces[1])
    bm.to_mesh(mesh)
    bm.free()

    # Unfold the skin (claws and tufts are coloured by their materials and need no layout).
    mesh.uv_layers.new(name="UVMap")
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.scene.objects:
        o.select_set(o is obj)
    select_skin(obj, skin_faces)
    bpy.ops.uv.unwrap(method="ANGLE_BASED", fill_holes=True, correct_aspect=True, margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")
    uv = mesh.uv_layers["UVMap"]  # edit mode rebuilt the mesh's data

    # Stand each piece upright (from the wrist end up to the fingers), at its true size, with
    # the far forearm shrunk; then arrange the pieces in the square.
    pieces = {}
    for name in REGIONS:
        polys = [p for p in mesh.polygons if region.get(p.index) == name]
        if not polys:
            continue
        loops = [li for p in polys for li in p.loop_indices]
        pts = [Vector(uv.data[li].uv) for li in loops]
        points = [gun(mesh.vertices[mesh.loops[li].vertex_index].co) for li in loops]
        # Where this piece's two ends landed in the layout: the UVs of the nearest corners.
        bottom, top = ends[name.split("_")[0]]
        low = pts[min(range(len(points)), key=lambda i: (points[i] - bottom).length)]
        high = pts[min(range(len(points)), key=lambda i: (points[i] - top).length)]
        turn = Matrix.Rotation(math.pi / 2 - math.atan2(high.y - low.y, high.x - low.x), 2)
        flat_area = sum(abs(polygon_area([uv.data[li].uv for li in p.loop_indices])) for p in polys)
        size = math.sqrt(sum(p.area for p in polys) / flat_area)  # layout units to metres
        pts = [turn @ q * size for q in pts]
        xs, ys = [q.x for q in pts], [q.y for q in pts]
        pieces[name] = {"loops": loops, "pts": pts, "min": Vector((min(xs), min(ys))),
                        "w": max(xs) - min(xs), "h": max(ys) - min(ys)}

    place = arrange(pieces)
    for name, (x, y, k) in place.items():
        piece = pieces[name]
        for li, q in zip(piece["loops"], piece["pts"]):
            uv.data[li].uv = (Vector((x, y)) + (q - piece["min"])) * k
    return [region.get(i) for i in range(skin_faces)]


def polygon_area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1])) / 2


def arrange(pieces, gap=0.008, margin=0.015):
    """Where each piece goes in the unit square: the hand's two big halves side by side and
    the thumb's two pieces beside them, stacked or in a row, whichever lets everything be
    biggest. Returns {name: (x, y, scale)}: the piece's lower-left corner in
    metres before scaling, and the scale into the square."""
    small = [n for n in ("thumb_top", "thumb_under") if n in pieces]
    big = [n for n in ("hand_top", "hand_under") if n in pieces]
    options = [
        [[n] for n in big] + [small],               # the thumb's pieces stacked beside the hand
        [[n] for n in big] + [[n] for n in small],  # all in a row
    ]
    best = None
    for columns in options:
        columns = [c for c in columns if c]
        spots, x = {}, 0.0
        for column in columns:
            y = 0.0
            for name in reversed(column):
                spots[name] = (x, y)
                y += pieces[name]["h"] + gap
            x += max(pieces[n]["w"] for n in column) + gap
        width = x - gap
        height = max(sum(pieces[n]["h"] + gap for n in c) - gap for c in columns)
        k = (1 - 2 * margin) / max(width, height)
        if best is None or k > best[0]:
            best = (k, spots, width, height)
    k, spots, width, height = best
    # Centre the arrangement in the square.
    off = Vector(((1 / k - width) / 2, (1 / k - height) / 2))
    return {name: (x + off.x, y + off.y, k) for name, (x, y) in spots.items()}


def select_skin(obj, skin_faces):
    """Edit mode with just the skin's faces selected."""
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.mesh.select_all(action="DESELECT")
    bm = bmesh.from_edit_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    for face in bm.faces:
        if face.index < skin_faces:
            face.select_set(True)
    bmesh.update_edit_mesh(obj.data)


def tidy_regions(bm, region, smallest=60):
    """Specks of one region inside another join their surroundings, so each region comes out
    as one clean piece (only a large stray part may stay a piece of its own)."""
    faces = [f for f in bm.faces if f.index in region]
    for _ in range(30):
        changed = False
        pieces = {}
        seen = set()
        for face in faces:
            if face.index in seen:
                continue
            piece, todo = {face.index}, [face]
            while todo:
                f = todo.pop()
                for e in f.edges:
                    for g in e.link_faces:
                        if g.index in region and g.index not in piece and region[g.index] == region[face.index]:
                            piece.add(g.index)
                            todo.append(g)
            seen |= piece
            pieces.setdefault(region[face.index], []).append(piece)
        for name, parts in pieces.items():
            biggest = max(len(p) for p in parts)
            for piece in parts:
                if len(piece) >= smallest and (len(piece) == biggest or len(piece) > biggest * 0.3):
                    continue
                around = {}
                for i in piece:
                    for e in bm.faces[i].edges:
                        for g in e.link_faces:
                            if g.index in region and g.index not in piece:
                                around[region[g.index]] = around.get(region[g.index], 0) + 1
                if around:
                    new = max(around, key=around.get)
                    for i in piece:
                        region[i] = new
                    changed = True
        if not changed:
            break
    counts = {}
    for name in region.values():
        counts[name] = counts.get(name, 0) + 1
    print("UV regions:", counts)


# --- The paw on the gun -----------------------------------------------------------------------

# A closed fist: how far each finger joint bends (knuckle, middle, tip), in degrees.
FIST = (72, 100, 65)


def fist_hole():
    """Where the hole of a closed fist is (what it grips), relative to the wrist along the
    hand's forward, palm and index directions, and how big it is."""
    hand = Hand((0, 0, 0), (1, 0, 0), (0, -1, 0), right_handed=True)
    joints, _, _ = pose_finger(hand, FINGERS[1], lambda p: 1, rest_bend=FIST)
    a, b, c = joints[0], joints[2], joints[3]
    ab, ac = b - a, c - a
    normal = ab.cross(ac)
    centre = a + (ac.length_squared * normal.cross(ab) + ab.length_squared * ac.cross(normal)) / (2 * normal.length_squared)
    radius = (centre - a).length - FINGER_R[1]
    return (centre.dot(hand.f), centre.dot(hand.n), centre.dot(hand.k)), radius


# The grip: a round handle tilted back 0.35 rad around (0, -0.112, 0.51), as in
# src/render/gunView.js. Its radius matches the fist's hole, so the fingers close round it.
GRIP_CENTRE = Vector((0, -0.112, 0.51))
GRIP_TILT = 0.35


def right_paw(materials):
    """A closed fist round the grip: knuckles to the front right, the back of the hand to the
    right, the forearm back toward you."""
    u = Vector((1, 0, 0))                                        # right
    v = Vector((0, math.cos(GRIP_TILT), math.sin(GRIP_TILT)))    # up the grip
    w = Vector((0, -math.sin(GRIP_TILT), math.cos(GRIP_TILT)))   # back, toward you
    (cf, cn, ck), hole = fist_hole()
    f = (-w + u * 0.12).normalized()     # knuckles toward the front, turned a little outward
    k = v                                # the fingers stack up the grip, index on top
    n = k.cross(f)                       # so the palm faces the grip
    centre = GRIP_CENTRE + v * 0.006     # the index finger just clears the motor block
    wrist = centre - f * cf - n * cn - k * ck
    hand = Hand(wrist, f, n, right_handed=True)
    print(f"fist hole radius {hole:.4f}: grip half-width and half-depth should be about that")
    return paw("RightPaw", hand, lambda p: 1, (0.35, -0.4, 1.0), 21, materials, fist=True)


def material(name, colour, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def linear_to_srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def write_layout(obj, info, path):
    """The UV layout for tools/draw_paw_uv_template.py: every skin face's corners in pixels
    (y down), their colours (the paw's current look, sRGB), which region each is in, and
    where the template's labels go."""
    mesh = obj.data
    uv = mesh.uv_layers["UVMap"].data
    colours = mesh.color_attributes["Col"].data

    def pixel(li):
        return [round(uv[li].uv.x * LAYOUT_SIZE, 2), round((1 - uv[li].uv.y) * LAYOUT_SIZE, 2)]

    faces, face_colours, face_regions = [], [], []
    for poly in mesh.polygons:
        if poly.index >= info["skin_faces"]:
            continue
        faces.append({"outline": [pixel(li) for li in poly.loop_indices]})
        face_colours.append([
            [round(255 * linear_to_srgb(c)) for c in colours[mesh.loops[li].vertex_index].color[:3]]
            for li in poly.loop_indices
        ])
        face_regions.append(info["regions"][poly.index])

    labels = []
    for name, (title, note) in REGIONS.items():
        corners = [c for face, r in zip(faces, face_regions) if r == name for c in face["outline"]]
        if corners:
            xs, ys = zip(*corners)
            labels.append({"title": title, "note": note, "at": [sum(xs) / len(xs), sum(ys) / len(ys)],
                           "box": [min(xs), min(ys), max(xs), max(ys)]})

    # The fingers' names on the template: at the UV of the skin corner nearest each mark.
    tips = []
    for label, tip, region in zip(("index", "middle", "ring", "little", "thumb"), info["marks"],
                                  ("hand_top",) * 4 + ("thumb_top",)):
        best = None
        for poly in mesh.polygons:
            if poly.index >= info["skin_faces"] or info["regions"][poly.index] != region:
                continue
            for li in poly.loop_indices:
                co = mesh.vertices[mesh.loops[li].vertex_index].co
                d = (Vector((co.x, co.z, -co.y)) - tip).length
                if best is None or d < best[0]:
                    best = (d, li)
        if best:
            tips.append({"label": label, "at": pixel(best[1])})

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "size": LAYOUT_SIZE, "islands": faces, "colours": face_colours, "regions": face_regions,
        "labels": labels, "fingers": tips,
    }, separators=(",", ":")))
    print(f"wrote {path.relative_to(ROOT)} ({len(faces)} faces)")


def write_obj(obj, info, path):
    """The skin with its UVs as an OBJ (y up), for painting in 3D in Procreate."""
    mesh = obj.data
    uv = mesh.uv_layers["UVMap"].data
    polys = [p for p in mesh.polygons if p.index < info["skin_faces"]]
    used = sorted({v for p in polys for v in p.vertices})
    number = {v: i + 1 for i, v in enumerate(used)}
    lines = ["# Gunny's paw: the skin, with the UV layout of gunny-paw.png", "mtllib gunny-paw.mtl", "o GunnyPaw"]
    lines += [f"v {co.x:.5f} {co.z:.5f} {-co.y:.5f}" for co in (mesh.vertices[v].co for v in used)]
    lines += [f"vt {uv[li].uv.x:.5f} {uv[li].uv.y:.5f}" for p in polys for li in p.loop_indices]
    lines.append("usemtl Skin")
    t = 1
    for p in polys:
        corners = []
        for li in p.loop_indices:
            corners.append(f"{number[mesh.loops[li].vertex_index]}/{t}")
            t += 1
        lines.append("f " + " ".join(corners))
    path.write_text("\n".join(lines) + "\n")
    path.with_suffix(".mtl").write_text("newmtl Skin\nKd 1 1 1\nmap_Kd gunny-paw.png\n")
    print(f"wrote {path.relative_to(ROOT)} and {path.with_suffix('.mtl').name}")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Skin is white in the material: its colour comes from its texture, gunny-paw.png.
    materials = [material("Skin", (1, 1, 1), 0.65), material("Fur", FUR, 0.95), material("Claw", CLAW, 0.4)]
    out = OUT
    if "--showcase" in sys.argv:
        # One relaxed right hand on its own, back of the hand up, for checking its shape.
        out = Path(sys.argv[sys.argv.index("--showcase") + 1])
        hand = Hand((0, 0, 0), (0, 0, -1), (0, -1, 0), right_handed=True)
        paws = [paw("Showcase", hand, lambda p: 1, (0, 0.15, 1), 5, materials)[0]]
    else:
        obj, info = right_paw(materials)
        paws = [obj]
        write_layout(obj, info, ART / "layout.json")
        write_obj(obj, info, ART / "gunny-paw.obj")

    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out), export_format="GLB", export_yup=True, use_selection=False,
        export_vertex_color="NONE",
    )
    tris = sum(len(p.vertices) - 2 for o in paws for p in o.data.polygons)
    print(f"wrote {out} ({tris} triangles)")


main()
