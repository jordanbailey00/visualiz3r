/**
 * The eased exploded-view amount shared by every <Part>. Written once per frame
 * by <ExplodeDriver>, read by parts inside useFrame, so dragging the slider
 * never re-renders the React tree.
 */
export const explodeProgress = { value: 0 };
