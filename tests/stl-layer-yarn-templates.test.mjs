import assert from "node:assert/strict";
import fs from "node:fs";

import * as gm from "../code/gm.mjs";
import * as sv from "../code/sv.mjs";

function exactArrayBuffer(buffer) {
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function faceCenter(cell, faceIndex) {
	const face = cell.template.faces[faceIndex];
	return gm.scale(
		1 / face.indices.length,
		face.indices.reduce((sum, vertex) => gm.add(sum, cell.vertices[vertex]), gm.vec3(0))
	);
}

function matchingLayerTemplates(library, currentDirection, nextDirection, nextX) {
	const current = sv.Cell.fromTemplate(library.getTemplateByLongname(`knit.${currentDirection}.alt`));
	const nextTransform = gm.mat4x3(1);
	nextTransform[9] = nextX;
	nextTransform[11] = 0.88888884;
	const next = sv.Cell.fromTemplate(
		library.getTemplateByLongname(`knit.${nextDirection}.alt`),
		nextTransform
	);
	const currentFace = current.template.faces.findIndex(face => face.type === "+y1");
	const nextFace = next.template.faces.findIndex(face => face.type === "-y1");
	const matches = [];

	for (const template of Object.values(library.templates)) {
		if (!template.name.startsWith("yarn-next-layer")) continue;
		const attachmentFace = template.faces.findIndex(face => (
			sv.canConnectFaces(current.template.faces[currentFace], face)
		));
		if (attachmentFace === -1) continue;
		const currentVertices = [];
		const templateVertices = [];
		sv.forAlignedIndices(
			current.template.faces[currentFace],
			template.faces[attachmentFace],
			(index, templateIndex) => {
				currentVertices.push(current.vertices[current.template.faces[currentFace].indices[index]]);
				templateVertices.push(template.vertices[template.faces[attachmentFace].indices[templateIndex]]);
			}
		);
		const preview = sv.Cell.fromTemplate(template, gm.rigidTransform(templateVertices, currentVertices));
		for (let face = 0; face < template.faces.length; ++face) {
			if (face === attachmentFace
			 || !sv.canConnectFaces(template.faces[face], next.template.faces[nextFace])) continue;
			if (gm.dist2(faceCenter(preview, face), faceCenter(next, nextFace)) < 0.1 * 0.1) {
				matches.push(template.longname);
			}
		}
	}
	return matches;
}

const libraryBuffer = fs.readFileSync(new URL("../block-library/blocks.json", import.meta.url));
const library = sv.Library.fromArrayBuffer(exactArrayBuffer(libraryBuffer));

assert.deepEqual(matchingLayerTemplates(library, "right", "left", 0), ["yarn-next-layer-same.right"]);
assert.deepEqual(matchingLayerTemplates(library, "left", "right", 0), ["yarn-next-layer-same.left"]);
assert.deepEqual(matchingLayerTemplates(library, "right", "right", 2), ["yarn-next-layer-opposite.right"]);
assert.deepEqual(matchingLayerTemplates(library, "left", "left", -2), ["yarn-next-layer-opposite.left"]);

console.log("STL layer-yarn templates align with all direct path direction combinations.");
