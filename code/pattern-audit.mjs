function compatibleFaces(faceA, faceB) {
	const typeA = faceA.type;
	const typeB = faceB.type;
	const oppositeTypes = (
		(typeA.startsWith("-") && typeB.startsWith("+") && typeA.slice(1) === typeB.slice(1))
		|| (typeA.startsWith("+") && typeB.startsWith("-") && typeA.slice(1) === typeB.slice(1))
	);
	return oppositeTypes && faceA.direction === -faceB.direction;
}

export function auditPattern(body, {sampleLimit = 12} = {}) {
	const cellIndex = new Map(body.cells.map((cell, index) => [cell, index]));
	const topology = typeof body.connectionReport === "function"
		? body.connectionReport()
		: {valid: false, errors: ["body has no topology validator"], componentCount: null};
	const incompatibleConnections = [];
	const invalidYarnEndpoints = [];
	const openYarnFaces = [];
	const internalFreeEnds = [];
	const endpointSegments = new Map();
	const segments = [];
	let yarnInCount = 0;
	let yarnOutCount = 0;
	let externalFreeEnds = 0;
	let unlabeledCellCount = 0;

	function endpointKey(cell, face) {
		return `${cellIndex.get(cell)},${face}`;
	}

	function registerEndpoint(cell, face, segmentID) {
		const key = endpointKey(cell, face);
		if (!endpointSegments.has(key)) endpointSegments.set(key, []);
		endpointSegments.get(key).push(segmentID);
	}

	for (let index = 0; index < body.cells.length; ++index) {
		const cell = body.cells[index];
		if (cell.template.name === "yarn-in") yarnInCount += 1;
		if (cell.template.name === "yarn-out") yarnOutCount += 1;
		if (cell.template.name === "unlabeled") unlabeledCellCount += 1;

		const yarnFaces = new Set();
		for (let yarnIndex = 0; yarnIndex < cell.template.yarns.length; ++yarnIndex) {
			const yarn = cell.template.yarns[yarnIndex];
			const segmentID = segments.length;
			segments.push({cell, cellIndex: index, yarnIndex});
			for (const endpointName of ["begin", "end"]) {
				const face = yarn[endpointName];
				if (face === undefined) {
					const isExternal = (
						(cell.template.name === "yarn-in" && endpointName === "begin")
						|| (cell.template.name === "yarn-out" && endpointName === "end")
					);
					if (isExternal) {
						externalFreeEnds += 1;
					} else {
						internalFreeEnds.push({cell: index, template: cell.template.longname, yarn: yarnIndex, endpoint: endpointName});
					}
					continue;
				}
				if (!Number.isInteger(face) || face < 0 || face >= cell.template.faces.length) {
					invalidYarnEndpoints.push({cell: index, template: cell.template.longname, yarn: yarnIndex, endpoint: endpointName, face});
					continue;
				}
				yarnFaces.add(face);
				registerEndpoint(cell, face, segmentID);
			}
		}

		for (const face of yarnFaces) {
			if (cell.connections[face] === null) {
				openYarnFaces.push({
					cell: index,
					template: cell.template.longname,
					face,
					type: cell.template.faces[face].type
				});
			}
		}
	}

	for (let index = 0; index < body.cells.length; ++index) {
		const cell = body.cells[index];
		for (let face = 0; face < cell.connections.length; ++face) {
			const connection = cell.connections[face];
			if (!connection || !cellIndex.has(connection.cell)
			 || !Number.isInteger(connection.face)
			 || connection.face < 0 || connection.face >= connection.cell.template.faces.length) continue;
			const otherIndex = cellIndex.get(connection.cell);
			if (index > otherIndex || (index === otherIndex && face > connection.face)) continue;
			if (!compatibleFaces(cell.template.faces[face], connection.cell.template.faces[connection.face])) {
				incompatibleConnections.push({
					cell: index,
					face,
					type: cell.template.faces[face].type,
					otherCell: otherIndex,
					otherFace: connection.face,
					otherType: connection.cell.template.faces[connection.face].type
				});
			}
		}
	}

	// Approximate visual yarn continuity by joining yarn segments that terminate
	// on the same face and across connected faces.
	const parent = segments.map((_, index) => index);
	function find(value) {
		while (parent[value] !== value) {
			parent[value] = parent[parent[value]];
			value = parent[value];
		}
		return value;
	}
	function union(a, b) {
		const rootA = find(a);
		const rootB = find(b);
		if (rootA !== rootB) parent[rootB] = rootA;
	}
	for (const ids of endpointSegments.values()) {
		for (let i = 1; i < ids.length; ++i) union(ids[0], ids[i]);
	}
	for (let index = 0; index < body.cells.length; ++index) {
		const cell = body.cells[index];
		for (let face = 0; face < cell.connections.length; ++face) {
			const connection = cell.connections[face];
			if (!connection || !cellIndex.has(connection.cell)
			 || !Number.isInteger(connection.face)
			 || connection.face < 0 || connection.face >= connection.cell.template.faces.length) continue;
			const otherIndex = cellIndex.get(connection.cell);
			if (index > otherIndex || (index === otherIndex && face > connection.face)) continue;
			const here = endpointSegments.get(`${index},${face}`) || [];
			const there = endpointSegments.get(`${otherIndex},${connection.face}`) || [];
			for (const a of here) for (const b of there) union(a, b);
		}
	}
	const yarnComponentCount = new Set(segments.map((_, index) => find(index))).size;

	// Match the author's cycle check: only directed yarn (-y -> +y) edges count.
	const inDegree = new Map(body.cells.map(cell => [cell, 0]));
	const outgoing = new Map(body.cells.map(cell => [cell, []]));
	for (const cell of body.cells) {
		for (let face = 0; face < cell.connections.length; ++face) {
			const connection = cell.connections[face];
			if (!connection || !cellIndex.has(connection.cell)
			 || !cell.template.faces[face].type.startsWith("-y")) continue;
			outgoing.get(cell).push({
				cell: connection.cell,
				face,
				otherFace: connection.face
			});
			inDegree.set(connection.cell, (inDegree.get(connection.cell) || 0) + 1);
		}
	}
	const queue = body.cells.filter(cell => inDegree.get(cell) === 0);
	let visitedCount = 0;
	while (queue.length > 0) {
		const cell = queue.pop();
		visitedCount += 1;
		for (const edge of outgoing.get(cell)) {
			const degree = inDegree.get(edge.cell) - 1;
			inDegree.set(edge.cell, degree);
			if (degree === 0) queue.push(edge.cell);
		}
	}
	const yarnDirectionCycleFree = visitedCount === body.cells.length;
	let yarnDirectionCycle = [];
	if (!yarnDirectionCycleFree) {
		const remaining = new Set(body.cells.filter(cell => inDegree.get(cell) > 0));
		for (const start of remaining) {
			const position = new Map();
			const path = [];
			let current = start;
			while (current && remaining.has(current)) {
				if (position.has(current)) {
					const cycleCells = path.slice(position.get(current));
					yarnDirectionCycle = cycleCells.map((cell, index) => {
						const next = cycleCells[(index + 1) % cycleCells.length];
						const edge = outgoing.get(cell).find(candidate => candidate.cell === next);
						return {
							cell: cellIndex.get(cell),
							template: cell.template.longname,
							face: edge?.face,
							type: edge ? cell.template.faces[edge.face].type : undefined,
							nextCell: cellIndex.get(next),
							nextFace: edge?.otherFace,
							nextType: edge ? next.template.faces[edge.otherFace].type : undefined
						};
					});
					break;
				}
				position.set(current, path.length);
				path.push(current);
				const edge = outgoing.get(current).find(candidate => remaining.has(candidate.cell));
				current = edge?.cell;
			}
			if (yarnDirectionCycle.length > 0) break;
		}
	}

	// These are the conditions enforced by the author's conversion/scheduling
	// workflow. Visual yarn fragments and disconnected operation blocks are
	// reported below as diagnostics, but are not valid pass/fail criteria on
	// their own because Template.yarns is not a physical single-yarn graph.
	const passed = (
		invalidYarnEndpoints.length === 0
		&& unlabeledCellCount === 0
		&& yarnInCount === 1
		&& yarnOutCount === 1
		&& yarnDirectionCycleFree
	);
	const strictContinuityPassed = (
		topology.valid
		&& topology.componentCount === 1
		&& incompatibleConnections.length === 0
		&& invalidYarnEndpoints.length === 0
		&& openYarnFaces.length === 0
		&& internalFreeEnds.length === 0
		&& yarnInCount === 1
		&& yarnOutCount === 1
		&& externalFreeEnds === 2
		&& yarnComponentCount === 1
		&& yarnDirectionCycleFree
	);

	return {
		passed,
		strictContinuityPassed,
		cellCount: body.cells.length,
		unlabeledCellCount,
		topologyValid: topology.valid,
		topologyErrorCount: topology.errors.length,
		topologyErrors: topology.errors.slice(0, sampleLimit),
		topologyComponentCount: topology.componentCount,
		incompatibleConnectionCount: incompatibleConnections.length,
		incompatibleConnections: incompatibleConnections.slice(0, sampleLimit),
		invalidYarnEndpointCount: invalidYarnEndpoints.length,
		invalidYarnEndpoints: invalidYarnEndpoints.slice(0, sampleLimit),
		openYarnFaceCount: openYarnFaces.length,
		openYarnFacesPerCell: body.cells.length ? openYarnFaces.length / body.cells.length : 0,
		openYarnFaces: openYarnFaces.slice(0, sampleLimit),
		internalFreeEndCount: internalFreeEnds.length,
		internalFreeEndsPerCell: body.cells.length ? internalFreeEnds.length / body.cells.length : 0,
		internalFreeEnds: internalFreeEnds.slice(0, sampleLimit),
		externalFreeEnds,
		yarnInCount,
		yarnOutCount,
		yarnSegmentCount: segments.length,
		yarnComponentCount,
		yarnDirectionCycleFree,
		yarnDirectionCycle
	};
}

export function formatPatternAudit(report) {
	const failures = [];
	if (report.invalidYarnEndpointCount) failures.push(`${report.invalidYarnEndpointCount} malformed yarn endpoint(s)`);
	if (report.unlabeledCellCount) failures.push(`${report.unlabeledCellCount} unconverted cell(s)`);
	if (report.yarnInCount !== 1 || report.yarnOutCount !== 1) {
		failures.push(`${report.yarnInCount} yarn-in / ${report.yarnOutCount} yarn-out`);
	}
	if (!report.yarnDirectionCycleFree) {
		const cycleCells = report.yarnDirectionCycle.slice(0, 8).map(item => item.cell).join(" -> ");
		failures.push(`directed yarn cycle${cycleCells ? ` (${cycleCells} -> ${report.yarnDirectionCycle[0].cell})` : ""}`);
	}
	const diagnostics = [
		`${report.topologyComponentCount} cell components`,
		`${report.topologyErrorCount} topology warning(s)`,
		`${report.incompatibleConnectionCount} incompatible connection warning(s)`,
		`${report.openYarnFaceCount} open yarn-face markers (${(100 * report.openYarnFacesPerCell).toFixed(1)}%/cell)`,
		`${report.internalFreeEndCount} template free-end markers (${(100 * report.internalFreeEndsPerCell).toFixed(1)}%/cell)`,
		`${report.yarnComponentCount} visual yarn components`
	].join("; ");
	return report.passed
		? `Author compatibility PASS. Comparative diagnostics only: ${diagnostics}`
		: `Author compatibility FAIL: ${failures.join("; ")}. Comparative diagnostics only: ${diagnostics}`;
}
