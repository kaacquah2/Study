import { describe, it, expect } from 'vitest';
import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';

describe('ELKjs Performance Spike', () => {
	it('benchmarks layout calculation for a synthetic 60-node 8-cluster graph', async () => {
		const elk = new ELK();

		const children: ElkNode[] = [];
		const edges: ElkExtendedEdge[] = [];

		for (let m = 1; m <= 8; m++) {
			const moduleChildren: ElkNode[] = [];
			for (let c = 1; c <= 7; c++) {
				moduleChildren.push({
					id: `node-${m}-${c}`,
					width: 150,
					height: 60
				});
				if (c > 1) {
					edges.push({
						id: `edge-${m}-${c}`,
						sources: [`node-${m}-${c - 1}`],
						targets: [`node-${m}-${c}`]
					});
				}
			}
			children.push({
				id: `cluster-mod-${m}`,
				layoutOptions: {
					'elk.algorithm': 'layered',
					'elk.direction': 'DOWN'
				},
				children: moduleChildren
			});
			if (m > 1) {
				edges.push({
					id: `cluster-edge-${m}`,
					sources: [`node-${m - 1}-1`],
					targets: [`node-${m}-1`]
				});
			}
		}

		const graph: ElkNode = {
			id: 'root',
			layoutOptions: {
				'elk.algorithm': 'layered',
				'elk.direction': 'DOWN',
				'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
				'elk.spacing.nodeNode': '40',
				'elk.layered.spacing.nodeNodeBetweenLayers': '60'
			},
			children,
			edges
		};

		const start = performance.now();
		const layoutResult = await elk.layout(graph);
		const duration = performance.now() - start;

		console.log(`ELKjs 60-node 8-cluster layout computed in ${duration.toFixed(2)}ms`);
		expect(layoutResult).toBeDefined();
		expect(duration).toBeLessThan(1500); // Expect layout calculation under 1500ms in concurrent test suite
	});
});
