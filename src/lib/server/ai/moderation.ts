/**
 * Pre-Generation Moderation Scanner
 *
 * Verifies topics and reference notes before calling AI course generation.
 * Enforces safety boundaries for educational content (blocks self-harm, weapons/explosives,
 * illegal acts, explicit violent content, and hate speech).
 */

export interface ModerationResult {
	safe: boolean;
	reason?: string;
}

// Key prohibited patterns and triggers for instant rejection
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	{
		pattern:
			/\b(suicide|self-harm|self harm|cut myself|end my life|kill myself|how to hang oneself)\b/i,
		reason: 'Requests related to self-harm or suicide are strictly prohibited.'
	},
	{
		pattern:
			/\b(how to build a bomb|make explosives|pipe bomb|synthesize nerve agent|ied instructions|make ricin|make anthrax|chemical weapon)\b/i,
		reason:
			'Content detailing dangerous weapons, explosives, or chemical agents cannot be generated.'
	},
	{
		pattern: /\b(child pornography|csam|pedophilia|explicit minor content)\b/i,
		reason: 'Explicit, illegal, or abusive content involving minors is strictly forbidden.'
	},
	{
		pattern:
			/\b(how to hack into|ddos attack instructions|ransomware tutorial|bypass security locks illegally|carding guide)\b/i,
		reason: 'Instructions for malicious cyberattacks or illegal hacking activities are not allowed.'
	},
	{
		pattern:
			/\b(buy illegal drugs|synthesize meth at home|methamphetamine recipe|fentanyl synthesis)\b/i,
		reason:
			'Content facilitating the illegal synthesis or distribution of controlled substances is blocked.'
	}
];

import { adminDb, FieldValue } from '$lib/server/admin';

/**
 * Logs flagged or blocked moderation inputs asynchronously to Firestore.
 */
export function logModerationFlag(
	topic: string,
	reason: string,
	userId?: string | null,
	pastedNotes?: string | null
): void {
	adminDb
		.collection('moderationFlags')
		.add({
			topic,
			pastedNotesSnippet: pastedNotes ? pastedNotes.slice(0, 300) : null,
			reason,
			userId: userId || null,
			flaggedAt: FieldValue.serverTimestamp()
		})
		.catch((err) => console.warn('[Moderation] Could not log moderation flag to Firestore:', err));
}

/**
 * Validates text inputs (topic + pasted notes) against safety rules.
 */
export function moderateInput(
	topic: string,
	pastedNotes?: string | null,
	userId?: string | null
): ModerationResult {
	const combinedText = `${topic || ''}\n${pastedNotes || ''}`.trim();

	if (!combinedText) {
		return { safe: false, reason: 'Topic or content input cannot be empty.' };
	}

	for (const rule of BLOCKED_PATTERNS) {
		if (rule.pattern.test(combinedText)) {
			logModerationFlag(topic, rule.reason, userId, pastedNotes);
			return {
				safe: false,
				reason: rule.reason
			};
		}
	}

	return { safe: true };
}

/**
 * Moderates standalone text string (returns safe, flagged, and optional reason).
 */
export function moderateText(text: string): { safe: boolean; flagged: boolean; reason?: string } {
	const res = moderateInput(text);
	return {
		safe: res.safe,
		flagged: !res.safe,
		reason: res.reason
	};
}
