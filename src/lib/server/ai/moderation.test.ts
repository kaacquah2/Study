import { describe, it, expect } from 'vitest';
import { moderateInput } from './moderation';

describe('Pre-Generation Moderation Scanner', () => {
	it('should allow benign educational topics', () => {
		const result = moderateInput(
			'Organic Chemistry: Alkanes and Alkenes',
			'Notes on hydrocarbons and double bonds'
		);
		expect(result.safe).toBe(true);
		expect(result.reason).toBeUndefined();
	});

	it('should allow history and psychology study topics', () => {
		const result = moderateInput(
			'World War II History',
			'Overview of the European and Pacific theaters'
		);
		expect(result.safe).toBe(true);
	});

	it('should block requests detailing bomb or explosive creation', () => {
		const result = moderateInput('Chemistry curiosity', 'How to build a bomb at home step by step');
		expect(result.safe).toBe(false);
		expect(result.reason).toContain('explosives');
	});

	it('should block requests related to self-harm', () => {
		const result = moderateInput('Psychology Study', 'methods for self-harm and self harm risks');
		expect(result.safe).toBe(false);
		expect(result.reason).toContain('self-harm');
	});

	it('should block malicious cyberattack instructions', () => {
		const result = moderateInput(
			'Computer Science',
			'ddos attack instructions and ransomware tutorial'
		);
		expect(result.safe).toBe(false);
		expect(result.reason).toContain('cyberattacks');
	});

	it('should reject empty input', () => {
		const result = moderateInput('', '');
		expect(result.safe).toBe(false);
		expect(result.reason).toContain('empty');
	});
});
