// A move crosses an edge only when the original cell has no wall there.
// The same four-direction rule serves keyboard and touch controls.
const directions = { up: [0, -1, 0], right: [1, 0, 1], down: [2, 1, 0], left: [3, 0, -1] };
export default function nextLocation(data, location, direction) {
  const step = directions[direction];
  const cell = data.find(d => d.row === location.row && d.col === location.col);
  if (!step || !cell || cell.walls[step[0]]) return null;
  return { row: location.row + step[1], col: location.col + step[2] };
}
