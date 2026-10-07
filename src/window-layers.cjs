// Only pet windows belong in the native topmost band. Never focus them while
// repairing stacking, so typing in another application remains uninterrupted.
function raisePets(windows) {
  for (const {pet} of windows.values()) {
    if (!pet || pet.isDestroyed()) continue;
    pet.setAlwaysOnTop(true, 'screen-saver');
    if (pet.isVisible()) pet.moveTop();
  }
}
function normalChat(win, windows) {
  win.setAlwaysOnTop(false, 'normal');
  const restore = () => {
    if (win.isDestroyed()) return;
    if (win.isAlwaysOnTop()) win.setAlwaysOnTop(false, 'normal');
    raisePets(windows);
  };
  for (const event of ['show', 'restore', 'focus']) win.on(event, restore);
}
module.exports = {raisePets, normalChat};
