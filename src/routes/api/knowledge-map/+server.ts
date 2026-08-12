import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { adminDb, FieldValue } from '$lib/server/admin';
import { verifySessionUser } from '$lib/server/auth';
import { generateKnowledgeGraph } from '$lib/server/ai/provider';
import {
	computeModuleMastery,
	type ModuleMastery,
	type QuizQuestion
} from '$lib/server/knowledgeMap/masteryCalculator';
import {
	getRecommendedNext,
	type ConceptNode,
	type PrerequisiteEdge
} from '$lib/server/knowledgeMap/recommendNext';
import crypto from 'node:crypto';

interface ModuleRaw {
	id: string;
	title: string;
	summary: string;
	type?: string;
	keyPoints?: string[];
	questions?: QuizQuestion[];
}

function computeContentHash(modules: ModuleRaw[]): string {
	const str = modules
		.map((m) => `${m.id}:${m.title}:${m.summary}:${(m.keyPoints || []).join(',')}`)
		.join('|');
	return crypto.createHash('sha256').update(str).digest('hex');
}

async function regenerateGraphInBackground(
	courseId: string,
	courseTitle: string,
	modulesForPrompt: Array<{ id: string; title: string; summary: string; keyPoints?: string[] }>,
	contentHash: string,
	flaggedKeysSet: Set<string>
) {
	try {
		const aiRes = await generateKnowledgeGraph(courseTitle, modulesForPrompt);
		const rawGraph = aiRes.result;

		// Post-filter edges against confidence threshold >= 0.6 and flagged keys
		const filteredEdges = rawGraph.edges.filter((e) => {
			if (typeof e.confidence === 'number' && e.confidence < 0.6) return false;
			const key = `${e.source}->${e.target}`;
			return !flaggedKeysSet.has(key);
		});

		const cleanGraph = {
			nodes: rawGraph.nodes,
			edges: filteredEdges,
			generatedAt: new Date().toISOString(),
			contentHash
		};

		await adminDb
			.collection('courses')
			.doc(courseId)
			.collection('knowledgeMap')
			.doc('graph')
			.set({
				...cleanGraph,
				updatedAt: FieldValue.serverTimestamp()
			});
	} catch (err) {
		console.error('Background Knowledge Map regeneration error:', err);
	}
}

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const user = await verifySessionUser(request);
		const courseId = url.searchParams.get('courseId');

		if (!courseId) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'courseId query parameter is required' } },
				{ status: 400 }
			);
		}

		// 1. Fetch course & modules
		const courseRef = adminDb.collection('courses').doc(courseId);
		const courseDoc = await courseRef.get();

		if (!courseDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}

		const courseData = courseDoc.data();
		if (courseData?.ownerUid !== user.uid) {
			return json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 });
		}

		const modulesSnap = await courseRef.collection('modules').orderBy('order', 'asc').get();
		const modulesList: ModuleRaw[] = modulesSnap.docs.map((doc) => ({
			id: doc.id,
			...doc.data()
		})) as ModuleRaw[];

		const currentHash = computeContentHash(modulesList);
		const todayStr = new Date().toISOString().split('T')[0];

		// 2. Fetch user edge flags
		const flagsSnap = await courseRef.collection('knowledgeMapFlags').get();
		const flaggedKeysSet = new Set<string>();
		flagsSnap.docs.forEach((d) => {
			const data = d.data();
			if (data.source && data.target) {
				flaggedKeysSet.add(`${data.source}->${data.target}`);
			}
		});

		// 3. Compute live mastery map for all modules
		const masteryRecord: Record<string, ModuleMastery> = {};
		const masteryMap = new Map<string, ModuleMastery>();

		modulesList.forEach((m) => {
			const mMastery = computeModuleMastery(m.id, m.questions, todayStr);
			masteryRecord[m.id] = mMastery;
			masteryMap.set(m.id, mMastery);
		});

		// Add moduleTitle to nodes helper
		const moduleTitleMap = new Map<string, string>();
		modulesList.forEach((m) => moduleTitleMap.set(m.id, m.title));

		// 4. Fetch cached graph
		const graphRef = courseRef.collection('knowledgeMap').doc('graph');
		const graphDoc = await graphRef.get();

		let isStale = false;
		let graphData: {
			nodes: ConceptNode[];
			edges: PrerequisiteEdge[];
			contentHash?: string;
		} | null = null;

		const modulesForPrompt = modulesList.map((m) => ({
			id: m.id,
			title: m.title,
			summary: m.summary || '',
			keyPoints: m.keyPoints || []
		}));

		if (graphDoc.exists) {
			const rawCache = graphDoc.data() as {
				nodes: ConceptNode[];
				edges: PrerequisiteEdge[];
				contentHash?: string;
			};

			graphData = {
				nodes: (rawCache.nodes || []).map((n) => ({
					...n,
					moduleTitle: moduleTitleMap.get(n.moduleId) || 'Module'
				})),
				edges: (rawCache.edges || []).filter((e) => !flaggedKeysSet.has(`${e.source}->${e.target}`))
			};

			if (rawCache.contentHash !== currentHash) {
				isStale = true;
				// Fire background regeneration asynchronously
				regenerateGraphInBackground(
					courseId,
					courseData.title || 'Course',
					modulesForPrompt,
					currentHash,
					flaggedKeysSet
				);
			}
		} else {
			// First-time generation inline
			const aiRes = await generateKnowledgeGraph(courseData.title || 'Course', modulesForPrompt);
			const rawGraph = aiRes.result;

			const cleanEdges = rawGraph.edges.filter((e) => {
				if (typeof e.confidence === 'number' && e.confidence < 0.6) return false;
				return !flaggedKeysSet.has(`${e.source}->${e.target}`);
			});

			const newGraph = {
				nodes: rawGraph.nodes.map((n) => ({
					...n,
					moduleTitle: moduleTitleMap.get(n.moduleId) || 'Module'
				})),
				edges: cleanEdges,
				contentHash: currentHash
			};

			await graphRef.set({
				nodes: rawGraph.nodes,
				edges: cleanEdges,
				generatedAt: FieldValue.serverTimestamp(),
				contentHash: currentHash
			});

			graphData = newGraph;
		}

		// 5. Compute recommendation
		const recommendation = graphData
			? getRecommendedNext(graphData.nodes, graphData.edges, masteryMap)
			: null;

		const responseObj = json({
			graph: graphData,
			mastery: masteryRecord,
			recommendation,
			isStale
		});

		if (isStale) {
			responseObj.headers.set('X-Knowledge-Map-Stale', 'true');
		}

		return responseObj;
	} catch (err) {
		console.error('Knowledge Map GET API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await verifySessionUser(request);
		const body = await request.json();
		const { action, courseId, source, target } = body;

		if (!courseId || !source || !target) {
			return json(
				{ error: { code: 'INVALID_INPUT', message: 'courseId, source, and target are required' } },
				{ status: 400 }
			);
		}

		const courseRef = adminDb.collection('courses').doc(courseId);
		const courseDoc = await courseRef.get();

		if (!courseDoc.exists) {
			return json({ error: { code: 'NOT_FOUND', message: 'Course not found' } }, { status: 404 });
		}

		const courseData = courseDoc.data();
		if (courseData?.ownerUid !== user.uid) {
			return json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, { status: 403 });
		}

		const flagId = `${source}_${target}`;
		const flagRef = courseRef.collection('knowledgeMapFlags').doc(flagId);

		if (action === 'unflag') {
			await flagRef.delete();
			return json({ success: true, message: 'Edge unflagged successfully' });
		} else {
			await flagRef.set({
				source,
				target,
				flaggedBy: user.uid,
				flaggedAt: FieldValue.serverTimestamp()
			});
			return json({ success: true, message: 'Edge flagged successfully' });
		}
	} catch (err) {
		console.error('Knowledge Map POST API error:', err);
		const message = err instanceof Error ? err.message : '';
		if (message.includes('Unauthorized')) {
			return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
		}
		return json(
			{ error: { code: 'SERVER_ERROR', message: message || 'Internal Server Error' } },
			{ status: 500 }
		);
	}
};
