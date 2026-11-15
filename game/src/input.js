// Input: keyboard state, mouse look deltas, pointer lock, firing. The game reads
// state.keys and takeLook(); nothing else touches the DOM events.
export function createInput(canvas, onLockChange) {
  const state = { keys: new Set(), firing: false, aiming: false };
  let lookX = 0;
  let lookY = 0;
  let locked = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    state.keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }
  function onKeyUp(event) {
    state.keys.delete(event.code);
  }
  function onMouseMove(event) {
    if (!locked) return;
    lookX += event.movementX;
    lookY += event.movementY;
  }
  function onMouseDown(event) {
    if (!locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  }
  function onLock() {
    locked = document.pointerLockElement === canvas;
    if (!locked) {
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(locked);
  }
  function onContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    state,
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    requestLock() {
      canvas.requestPointerLock();
    },
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    isLocked() {
      return locked;
    },
  };
}
