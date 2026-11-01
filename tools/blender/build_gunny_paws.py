"""Builds Gunny's first-person paws holding the gun, in Blender, and exports them as GLB.

  src/assets/models/gunny-paws.glb   two objects, RightPaw (on the grip) and LeftPaw (under
                                     the barrel), with Skin, Claw and Fur materials, vertex
                                     colours (the skin darkens into the fur at the wrist)
                                     and a UV layout, ready to be painted later

The paws follow the rat hand references: a long bony hand with tendon ridges on the back,
four slender fingers with a bulge at every knuckle, long dark hooked claws, a jointed
thumb, pink hairless skin, and a thin dark furry forearm with spiky tufts at the wrist.
The hand and forearm are modelled together as metaballs (spheres and capsules that melt
together into one smooth shape), so the wrist has no seam, then turned into a mesh and
reduced to low poly. Fingers are posed joint by joint, each bending until it touches the
gun, so they wrap the grip and the barrel; in the fist the thumb folds over the fingers.

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
from mathutils import Matrix, Quaternion, Vector, noise

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "assets" / "models" / "gunny-paws.glb"

# Colours are linear, as Blender and glTF store them (sRGB in the comments).
SKIN = (0.69, 0.38, 0.37)     # #d9a6a4 pale pink
SKIN_SPOT = (0.42, 0.22, 0.22)  # darker freckles on the back of the hand
FUR = (0.026, 0.022, 0.02)    # #2d2927 near-black grey
CLAW = (0.07, 0.052, 0.048)   # #4a3f3c dark horn

S = 1.6             # overall paw size (the hand's measurements below are multiplied by it)
MB_SCALE = 0.53     # a metaball's visible radius is about this share of its radius
CHAIN_SCALE = 0.696  # the same for balls packed every 0.3 radius along a line (measured)
CHAIN_SPACING = 0.3
MB_RESOLUTION = 0.0024
HAND_TRIANGLES = 3000  # per hand and forearm, after reduction


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


def build_hand_blob(name, hand, outside, arm, fist=False, thumb=None):
    """The pink hand and its forearm as one body: the forearm, a long flat palm with tendon
    ridges, fingers and a thumb."""
    blob = Blob(name)
    w, f, n, idx = hand.wrist, hand.f, hand.n, hand.index
    tips = []

    # The forearm and wrist, running into the heel of the hand, and the flat, bony back of
    # the hand. Ellipsoid sizes are shares of its radius: about 0.12 long, 0.1 wide, 0.025
    # thick at S 1.6.
    blob.chain([(p, r) for p, r, _ in arm])
    blob.ellipsoid(w + f * 0.042 * S + n * 0.002 * S, f, idx, (0.72, 0.58, 0.15), 0.05 * S)
    for across, reach, _, _ in FINGERS:
        start = w + f * 0.012 * S + idx * across * 0.45 - n * 0.006 * S
        end = w + f * (reach - 0.008 * S) + idx * across - n * 0.0045 * S
        blob.capsule(start, end, 0.0058 * S)  # tendon ridges on the back of the hand

    fingers = []
    for spec in FINGERS:
        joints, tip_dir, bend_axis = pose_finger(hand, spec, outside, **({"rest_bend": FIST} if fist else {}))
        scale = 0.88 if spec is FINGERS[-1] else 1.0
        for i, (a, b) in enumerate(zip(joints, joints[1:])):
            blob.ball(a, JOINT_R[i] * scale)
            blob.capsule(a, b, FINGER_R[i] * scale)
        blob.ball(joints[-1], FINGER_R[-1] * 0.95 * scale)
        tips.append((joints[-1], tip_dir, bend_axis, scale))
        fingers.append(joints)

    if thumb:
        joints, tip_dir, bend_axis = thumb(hand)
    elif fist:
        joints, tip_dir, bend_axis = fist_thumb(hand, *fingers[:2])
    else:
        joints, tip_dir, bend_axis = posed_thumb(hand, outside)
    for i, (a, b) in enumerate(zip(joints, joints[1:])):
        if i:
            blob.ball(a, THUMB_JOINT_R[i - 1])
        blob.capsule(a, b, THUMB_R[i])
    blob.ball(joints[-1], THUMB_R[-1] * 0.95)
    tips.append((joints[-1], tip_dir, bend_axis, 0.8))
    return blob, tips


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


def wrapped_thumb(hand, outside, aim, axis, curl):
    """A thumb resting along a pipe: aimed at `aim`, then each joint curls round the pipe
    (turning about `axis`, parallel to the pipe) by `curl` degrees, or less if it would
    sink into it, so the thumb bends inward the way it hugs a handguard."""
    base = thumb_base(hand)
    direction = (aim - base).normalized()
    joints, total = [base], 0
    for length, most in zip(THUMB_LENGTHS, curl):
        chosen = most
        for step in range(0, most + 1, 2):
            if outside(joints[-1] + rotate(direction, axis, total + step) * length) <= 0:
                chosen = max(0, step - 2)
                break
        total += chosen
        joints.append(joints[-1] + rotate(direction, axis, total) * length)
    return joints, rotate(direction, axis, total), Vector(axis)  # the claw curls on round


def fist_thumb(hand, index, middle):
    """A closed fist's thumb: from the heel of the palm, up past the curled index finger,
    then folded across the middle bones of the index and middle fingers, the way a thumb
    locks a fist round a handle."""
    w, f, n, idx = hand.wrist, hand.f, hand.n, hand.index
    gap = 0.0045 * S  # metaballs closer than this would melt the thumb into the fingers

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


def mesh_from_blob(blob, target_triangles, shape=None, detail=None):
    """Turns the metaballs into a mesh, lets `shape` move its vertices, and reduces it to
    about `target_triangles`. `detail(p)` (0 to 1 at a point in gun coordinates) says where
    to keep the most triangles."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    dense = bpy.data.meshes.new_from_object(blob.obj.evaluated_get(depsgraph))
    if shape:
        shape(dense)
        dense.update()
    temp = bpy.data.objects.new("dense", dense)
    bpy.context.scene.collection.objects.link(temp)
    tris = sum(len(p.vertices) - 2 for p in dense.polygons)
    decimate = temp.modifiers.new("decimate", "DECIMATE")
    decimate.ratio = min(1.0, target_triangles / max(1, tris))
    if detail:
        # The decimator collapses low-weight edges last (and zero-weight ones never).
        group = temp.vertex_groups.new(name="detail")
        for v in dense.vertices:
            group.add([v.index], 1 - 0.95 * detail(Vector((v.co.x, v.co.z, -v.co.y))), "REPLACE")
        decimate.vertex_group = "detail"
        decimate.vertex_group_factor = 0.3
    depsgraph = bpy.context.evaluated_depsgraph_get()
    low = bpy.data.meshes.new_from_object(temp.evaluated_get(depsgraph))
    bpy.data.objects.remove(temp)
    bpy.data.objects.remove(blob.obj)
    return low


# --- The forearm ---------------------------------------------------------------------------

# How thick the wrist and forearm are (visible radius) by distance along them from the heel
# of the hand: slim at the wrist, widening into the forearm, which runs on out of view.
ARM_PROFILE = [(0, 0.0135 * S), (0.035 * S, 0.0138 * S), (0.065 * S, 0.018 * S), (0.12 * S, 0.025 * S),
               (0.2 * S, 0.031 * S), (0.25, 0.034 * S), (0.45, 0.038 * S), (0.7, 0.04 * S)]


def arm_path(hand, direction):
    """The wrist and forearm's centre line as (point, radius, distance along) samples: back
    from the heel of the hand, curving smoothly at the wrist into the forearm's direction."""
    d = Vector(direction).normalized()
    start = hand.wrist + hand.f * 0.012 * S
    corner = hand.wrist - hand.f * 0.03 * S
    bent = corner + d * 0.05 * S
    points = [start * (1 - t) ** 2 + corner * 2 * (1 - t) * t + bent * t * t for t in (i / 16 for i in range(17))]
    length = sum((b - a).length for a, b in zip(points, points[1:]))
    steps = math.ceil((ARM_PROFILE[-1][0] - length) / 0.01)
    points += [bent + d * (ARM_PROFILE[-1][0] - length) * i / steps for i in range(1, steps + 1)]
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


def furry(hand, arm):
    """Roughens the forearm's surface into ragged fur: each vertex moves in or out along its
    normal by a smooth noise, stretched along the arm so it reads as tufts and streaks. The
    effect fades in past the wrist, so the hand stays smooth."""
    d = (arm[-1][0] - arm[-12][0]).normalized()
    a1 = d.orthogonal().normalized()
    a2 = d.cross(a1)

    def shape(mesh):
        for v in mesh.vertices:
            p = Vector((v.co.x, v.co.z, -v.co.y))  # back to gun coordinates
            along = (p - hand.wrist).dot(hand.f)
            weight = min(1.0, max(0.0, (-0.03 * S - along) / (0.05 * S)))
            if weight <= 0:
                continue
            q = Vector((p.dot(a1) * 60 / S, p.dot(a2) * 60 / S, p.dot(d) * 16 / S))
            bump = noise.noise(q)
            bump = math.copysign(abs(bump) ** 0.7, bump)  # sharper tufts than plain noise
            v.co += v.normal * bump * 0.0042 * S * weight
    return shape


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

def paw(name, hand, outside, arm_direction, seed, materials, fist=False, thumb=None):
    arm = arm_path(hand, arm_direction)
    blob, tips = build_hand_blob(name, hand, outside, arm, fist, thumb)

    def hand_detail(p):
        """Most of the triangles go to the hand; the plainer forearm needs fewer."""
        return min(1.0, max(0.0, ((p - hand.wrist).dot(hand.f) + 0.06 * S) / (0.04 * S)))

    body = mesh_from_blob(blob, HAND_TRIANGLES, furry(hand, arm), hand_detail)

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


def left_paw(materials):
    """Cradling the barrel (a pipe of radius 0.042 along z) like a rifle's handguard: the palm
    under it, the fingers wrapping up its far (right) side, the forearm continuing almost
    straight from the wrist down to the bottom left."""
    reach = 0.042 + FINGER_R[0]

    def outside(p):
        return math.hypot(p.x, p.y) / reach - 1

    psi = math.radians(-62)              # knuckles below the barrel, toward its far side
    radius = 0.042 + JOINT_R[0] * 1.15
    knuckles = Vector((radius * math.cos(psi), radius * math.sin(psi), 0.2))
    tangent = Vector((-math.sin(psi), math.cos(psi), 0))       # round the barrel, upward
    forward = (tangent - Vector((0, 0, 0.42))).normalized()   # angled toward the nozzle
    palm = -Vector((knuckles.x, knuckles.y, 0))                 # facing the barrel
    hand = Hand(knuckles - forward * 0.078 * S, forward, palm, right_handed=False)
    arm = (-hand.f + Vector((0, -0.45, 0.15))).normalized()      # a slight bend at the wrist
    # The thumb runs forward along the barrel's near side, curling in round it: turning
    # about -z swings it from the lower left up over the barrel.
    aim = Vector((-0.075, -0.025, thumb_base(hand).z - 0.12))

    def thumb(hand):
        return wrapped_thumb(hand, outside, aim, (0, 0, -1), curl=(8, 34, 48))

    return paw("LeftPaw", hand, outside, arm, 31, materials, thumb=thumb)


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
