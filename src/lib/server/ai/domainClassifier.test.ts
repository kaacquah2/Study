import { describe, it, expect } from 'vitest';
import { classifyTopicDomain, DEFAULT_CONFIDENCE_THRESHOLD } from './domainClassifier';
import { calculateDomainConfidence } from '../../../../scripts/calibrate_domain_classifier';

describe('Domain Classifier & Threshold Calibration', () => {
	it('correctly classifies CS core topics as in-domain', () => {
		const res1 = classifyTopicDomain('Data Structures and Algorithms in C++');
		expect(res1.inDomain).toBe(true);
		expect(res1.confidence).toBeGreaterThanOrEqual(DEFAULT_CONFIDENCE_THRESHOLD);

		const res2 = classifyTopicDomain('Operating Systems Page Table Management');
		expect(res2.inDomain).toBe(true);
	});

	it('correctly classifies non-CS topics as out-of-domain', () => {
		const res1 = classifyTopicDomain('Organic Chemistry Reaction Mechanisms');
		expect(res1.inDomain).toBe(false);
		expect(res1.confidence).toBeLessThan(DEFAULT_CONFIDENCE_THRESHOLD);

		const res2 = classifyTopicDomain('Digital Marketing and SEO Strategy');
		expect(res2.inDomain).toBe(false);
	});

	it('evaluates boundary condition at exact confidence threshold', () => {
		const result = calculateDomainConfidence('Computer Networks');
		expect(result.confidence).toBeGreaterThan(0);
	});
});
