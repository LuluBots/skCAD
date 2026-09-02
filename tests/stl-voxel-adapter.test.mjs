import assert from "node:assert/strict";
import fs from "node:fs";

import * as sv from "../code/sv.mjs";

function exactArrayBuffer(buffer) {
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function binaryCubeSTL(min = [0, 0, 0], max = [2, 2, 2]) {
	const [x0, y0, z0] = min;
	const [x1, y1, z1] = max;
	const vertices = [
		[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
		[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
	];
	const triangleIndices = [
		[0, 2, 1], [0, 3, 2],
		[4, 5, 6], [4, 6, 7],
		[0, 1, 5], [0, 5, 4],
		[1, 2, 6], [1, 6, 5],
		[2, 3, 7], [2, 7, 6],
		[3, 0, 4], [3, 4, 7]
	];
	const output = new ArrayBuffer(84 + triangleIndices.length * 50);
	const view = new DataView(output);
	view.setUint32(80, triangleIndices.length, true);
	let offset = 84;
	for (const triangle of triangleIndices) {
		offset += 12; // normal
		for (const vertexIndex of triangle) {
			for (const coordinate of vertices[vertexIndex]) {
				view.setFloat32(offset, coordinate, true);
				offset += 4;
			}
		}
		offset += 2; // attribute byte count
	}
	return output;
}

const libraryBuffer = fs.readFileSync(new URL("../block-library/blocks.json", import.meta.url));
const library = sv.Library.fromArrayBuffer(exactArrayBuffer(libraryBuffer));
const voxelTemplate = library.getTemplateByLongname("unlabeled.right.alt");
const voxelSize = [
	Math.abs(voxelTemplate.vertices[4][0] - voxelTemplate.vertices[0][0]),
	Math.abs(voxelTemplate.vertices[2][1] - voxelTemplate.vertices[0][1]),
	Math.abs(voxelTemplate.vertices[1][2] - voxelTemplate.vertices[0][2])
];

const cubeMax = voxelSize.map(size => size * 2);
const voxelBody = await sv.Body.fromSTL(binaryCubeSTL([0, 0, 0], cubeMax), library, voxelSize);
const voxelReport = voxelBody.connectionReport();
assert.ok(voxelBody.cells.length > 1, "cube should create multiple voxel cells");
assert.ok(voxelBody.stlImportInfo.connectionCount > 0, "adjacent voxels should be connected");
assert.equal(voxelBody.stlImportInfo.componentCount, 1, "cube voxels should form one component");
assert.equal(voxelReport.valid, true, voxelReport.errors.join("\n"));
assert.equal(voxelBody.sourceType, "stl");

function faceCenter(cell, faceIndex) {
	const indices = cell.template.faces[faceIndex].indices;
	return [0, 1, 2].map(axis => (
		indices.reduce((sum, vertexIndex) => sum + cell.vertices[vertexIndex][axis], 0) / indices.length
	));
}
for (const cell of voxelBody.cells) {
	for (let faceIndex = 0; faceIndex < cell.connections.length; ++faceIndex) {
		const connection = cell.connections[faceIndex];
		if (connection === null) continue;
		const here = faceCenter(cell, faceIndex);
		const there = faceCenter(connection.cell, connection.face);
		assert.ok(
			here.every((coordinate, axis) => Math.abs(coordinate - there[axis]) < 1e-6),
			"connected voxel faces should occupy the same geometric plane"
		);
	}
}

const bunnyBuffer = fs.readFileSync(new URL("../patterns/stanford-bunny.body", import.meta.url));
const bunnyBody = sv.Body.fromArrayBuffer(exactArrayBuffer(bunnyBuffer), library);
assert.equal(bunnyBody.sourceType, undefined, ".body files must stay on the original conversion path");
assert.equal(bunnyBody.connectionReport().valid, true, "the original bunny topology should remain valid");

console.log(
	`STL adapter passed: ${voxelBody.cells.length} voxels, `
	+ `${voxelBody.stlImportInfo.connectionCount} connections; original .body path unchanged.`
);
