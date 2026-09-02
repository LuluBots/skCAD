// The author's odd-layer ordering reverses X traversal without reversing the
// stored right/left label. Preserve that behavior for .body files, but make an
// STL path label describe the direction in which the row is actually visited.
export function rowTraversalDirection(sourceType, layerIndex, rowDirection) {
	const authorDirection = rowDirection > 0 ? "right" : "left";
	if (sourceType !== "stl") return authorDirection;
	const ascendingX = layerIndex % 2 === 0 ? rowDirection > 0 : rowDirection < 0;
	return ascendingX ? "right" : "left";
}
