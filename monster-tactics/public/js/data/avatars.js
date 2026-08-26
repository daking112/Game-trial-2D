// Player avatars for the shared multiplayer world (WorldScene).
//
// Art: "Pixel Fantasy - Monster Tamer" (https://pixel-fantasy.itch.io/) -
// editable and usable in commercial and non-commercial projects, not
// resellable; see scripts/gen_avatars.py for how assets/avatars/avatars.png
// is built from it and README.md "Player avatars" for how its layout was
// measured.
//
// The built sheet holds AVATAR_COUNT characters, each with 6 rows of 3
// frames: a walk cycle and an idle, in side/down/up order. "side" art
// faces right - facing left is that art flipped horizontally rather than
// its own row, same trick the tower sprites use.
const AVATAR_SHEET = 'avatars';
const AVATAR_COUNT = 14;
const AVATAR_ROWS_PER = 6;
// Index into a single avatar's 6-row block. Order must match
// gen_avatars.py's SRC_ROWS.
const AVATAR_ROW_ORDER = ['walk-side', 'walk-down', 'walk-up', 'idle-side', 'idle-down', 'idle-up'];

function avatarAnimKey(avatarIndex, kind) {
  return `avatar-${avatarIndex}-${kind}`;
}

// Which of the 6 rows to play for a given movement state. Facing left uses
// the side row with the sprite flipped, so it maps to the same key.
function avatarRowKind(moving, facing) {
  const dir = (facing === 'left' || facing === 'right') ? 'side' : facing;
  return `${moving ? 'walk' : 'idle'}-${dir}`;
}

// A player's avatar is picked by the server from their persistent clientId
// (see server.js avatarForClientId) so it survives reconnects and looks the
// same to everyone. This clamps whatever arrives off the wire into range
// rather than trusting it - an out-of-range index would mean a missing
// anim key and an invisible player.
function safeAvatarIndex(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n >= AVATAR_COUNT) return 0;
  return n;
}
